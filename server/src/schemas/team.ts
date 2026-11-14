import { z } from 'zod';
import { normalizeInviteCode } from '../lib/inviteCode.js';

export const createTeamSchema = z.object({
  hackathonId: z.number().int().positive(),
  name: z.string().trim().min(3).max(50),
});

export const joinByCodeSchema = z.object({
  code: z
    .string()
    .max(32)
    .transform(normalizeInviteCode)
    .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{10}$/, 'Invalid invite code format')),
});

export const teamIdParams = z.object({ id: z.coerce.number().int().positive() });

export const memberIdParams = z.object({
  id: z.coerce.number().int().positive(),
  memberId: z.coerce.number().int().positive(),
});

export const requestIdParams = z.object({
  id: z.coerce.number().int().positive(),
  requestId: z.coerce.number().int().positive(),
});

export const boardQuerySchema = z.object({
  hackathonId: z.coerce.number().int().positive().default(1),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  skill: z.string().trim().optional(),
});

export const suggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const createJoinRequestSchema = z.object({
  message: z.string().trim().max(500).optional(),
});
