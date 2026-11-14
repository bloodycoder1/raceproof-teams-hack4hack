import { Router } from 'express';
import type { Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { bus } from '../lib/events.js';
import { hashRequest, runIdempotent } from '../lib/idempotency.js';
import type { IdempotentResponse } from '../lib/idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import { requireIdempotencyKey } from '../middleware/idempotencyKey.js';
import { joinIpLimiter, joinUserLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  createJoinRequestSchema,
  createTeamSchema,
  joinByCodeSchema,
  memberIdParams,
  requestIdParams,
  suggestionsQuerySchema,
  teamIdParams,
} from '../schemas/team.js';
import {
  acceptJoinRequest,
  createJoinRequest,
  createTeam,
  declineJoinRequest,
  getAuditLogs,
  getSuggestions,
  getTeam,
  joinByCode,
  leaveTeam,
  listJoinRequests,
  removeMember,
  rotateInviteCode,
} from '../services/teams.service.js';

export const teamsRouter = Router();
teamsRouter.use(requireAuth);

function send(res: Response, r: IdempotentResponse) {
  if (r.replayed) res.setHeader('Idempotent-Replayed', 'true');
  res.status(r.status).json(r.body);
}

// ---------------------------------------------------------------------------
// Create & Join by code
// ---------------------------------------------------------------------------
teamsRouter.post(
  '/',
  requireIdempotencyKey,
  validate({ body: createTeamSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    send(
      res,
      await runIdempotent({
        userId,
        key: req.idempotencyKey!,
        requestHash: hashRequest('POST /teams', req.body),
        work: (client) => createTeam(client, userId, req.body),
      }),
    );
  }),
);

teamsRouter.post(
  '/join-by-code',
  joinIpLimiter,
  joinUserLimiter,
  requireIdempotencyKey,
  validate({ body: joinByCodeSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    send(
      res,
      await runIdempotent({
        userId,
        key: req.idempotencyKey!,
        requestHash: hashRequest('POST /teams/join-by-code', req.body),
        work: (client) => joinByCode(client, userId, req.body.code),
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Team Details & Invite Code
// ---------------------------------------------------------------------------
teamsRouter.get(
  '/:id',
  validate({ params: teamIdParams }),
  asyncHandler(async (req, res) => {
    res.json(await getTeam((req.params as any).id, req.userId!));
  }),
);

teamsRouter.post(
  '/:id/invite-code',
  requireIdempotencyKey,
  validate({ params: teamIdParams }),
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const teamId = (req.params as any).id as number;
    send(
      res,
      await runIdempotent({
        userId,
        key: req.idempotencyKey!,
        requestHash: hashRequest(`POST /teams/${teamId}/invite-code`, {}),
        work: (client) => rotateInviteCode(client, userId, teamId),
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Leave Team (Handover leadership or delete team if last member)
// ---------------------------------------------------------------------------
teamsRouter.post(
  '/:id/leave',
  requireIdempotencyKey,
  validate({ params: teamIdParams }),
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const teamId = (req.params as any).id as number;
    send(
      res,
      await runIdempotent({
        userId,
        key: req.idempotencyKey!,
        requestHash: hashRequest(`POST /teams/${teamId}/leave`, {}),
        work: (client) => leaveTeam(client, userId, teamId),
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Remove Member (Leader only)
// ---------------------------------------------------------------------------
teamsRouter.delete(
  '/:id/members/:memberId',
  requireIdempotencyKey,
  validate({ params: memberIdParams }),
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const teamId = (req.params as any).id as number;
    const memberId = (req.params as any).memberId as number;
    send(
      res,
      await runIdempotent({
        userId,
        key: req.idempotencyKey!,
        requestHash: hashRequest(`DELETE /teams/${teamId}/members/${memberId}`, {}),
        work: (client) => removeMember(client, userId, teamId, memberId),
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Join Requests (Request, List, Accept, Decline)
// ---------------------------------------------------------------------------
teamsRouter.post(
  '/:id/requests',
  requireIdempotencyKey,
  validate({ params: teamIdParams, body: createJoinRequestSchema.optional() }),
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const teamId = (req.params as any).id as number;
    send(
      res,
      await runIdempotent({
        userId,
        key: req.idempotencyKey!,
        requestHash: hashRequest(`POST /teams/${teamId}/requests`, req.body ?? {}),
        work: (client) => createJoinRequest(client, userId, teamId, req.body?.message),
      }),
    );
  }),
);

teamsRouter.get(
  '/:id/requests',
  validate({ params: teamIdParams }),
  asyncHandler(async (req, res) => {
    const teamId = (req.params as any).id as number;
    res.json(await listJoinRequests(teamId, req.userId!));
  }),
);

teamsRouter.post(
  '/:id/requests/:requestId/accept',
  requireIdempotencyKey,
  validate({ params: requestIdParams }),
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const teamId = (req.params as any).id as number;
    const requestId = (req.params as any).requestId as number;
    send(
      res,
      await runIdempotent({
        userId,
        key: req.idempotencyKey!,
        requestHash: hashRequest(`POST /teams/${teamId}/requests/${requestId}/accept`, {}),
        work: (client) => acceptJoinRequest(client, userId, teamId, requestId),
      }),
    );
  }),
);

teamsRouter.post(
  '/:id/requests/:requestId/decline',
  requireIdempotencyKey,
  validate({ params: requestIdParams }),
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const teamId = (req.params as any).id as number;
    const requestId = (req.params as any).requestId as number;
    send(
      res,
      await runIdempotent({
        userId,
        key: req.idempotencyKey!,
        requestHash: hashRequest(`POST /teams/${teamId}/requests/${requestId}/decline`, {}),
        work: (client) => declineJoinRequest(client, userId, teamId, requestId),
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Audit Log & Suggestions
// ---------------------------------------------------------------------------
teamsRouter.get(
  '/:id/audit',
  validate({ params: teamIdParams }),
  asyncHandler(async (req, res) => {
    const teamId = (req.params as any).id as number;
    res.json(await getAuditLogs(teamId, req.userId!));
  }),
);

teamsRouter.get(
  '/:id/suggestions',
  validate({ params: teamIdParams, query: suggestionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const teamId = (req.params as any).id as number;
    const limit = (req.query as any).limit as number;
    res.json(await getSuggestions(teamId, limit));
  }),
);

// ---------------------------------------------------------------------------
// Live Team SSE Stream
// ---------------------------------------------------------------------------
teamsRouter.get(
  '/:id/stream',
  validate({ params: teamIdParams }),
  (req, res) => {
    const teamId = (req.params as any).id as number;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: connected\ndata: ${JSON.stringify({ teamId, connectedAt: new Date().toISOString() })}\n\n`);

    const onTeamChange = (changedTeamId: number) => {
      if (changedTeamId === teamId) {
        res.write(`event: team_changed\ndata: ${JSON.stringify({ teamId, at: new Date().toISOString() })}\n\n`);
      }
    };

    bus.on('team', onTeamChange);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      bus.off('team', onTeamChange);
    });
  },
);
