import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { bus } from '../lib/events.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { boardQuerySchema } from '../schemas/team.js';
import { getBoard } from '../services/teams.service.js';

export const boardRouter = Router();
boardRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /board - paginated open teams & looking participants
// ---------------------------------------------------------------------------
boardRouter.get(
  '/',
  validate({ query: boardQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const result = await getBoard({
      hackathonId: q.hackathonId,
      page: q.page,
      limit: q.limit,
      search: q.search,
      skill: q.skill,
    });
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// GET /board/stream - SSE live stream for real-time board sync
// ---------------------------------------------------------------------------
boardRouter.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);

  const onBoardChange = () => {
    res.write(`event: board_changed\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  };

  bus.on('board', onBoardChange);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('board', onBoardChange);
  });
});
