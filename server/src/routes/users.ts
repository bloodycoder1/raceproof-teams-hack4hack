import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema } from '../schemas/user.js';
import { getUserById, updateUser } from '../services/auth.service.js';
import { getUserCurrentTeam, getUserRequests } from '../services/teams.service.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ user: await getUserById(req.userId!) });
  }),
);

usersRouter.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    res.json({ user: await updateUser(req.userId!, req.body) });
  }),
);

usersRouter.get(
  '/me/team',
  asyncHandler(async (req, res) => {
    const hackathonId = req.query.hackathonId ? parseInt(req.query.hackathonId as string, 10) : 1;
    const teamData = await getUserCurrentTeam(req.userId!, hackathonId);
    res.json({ teamData });
  }),
);

usersRouter.get(
  '/me/requests',
  asyncHandler(async (req, res) => {
    const requestsData = await getUserRequests(req.userId!);
    res.json(requestsData);
  }),
);
