import { Router } from 'express';
import { authRouter } from './auth.js';
import { boardRouter } from './board.js';
import { healthRouter } from './health.js';
import { teamsRouter } from './teams.js';
import { usersRouter } from './users.js';

export const router = Router();

router.use(healthRouter);
router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/teams', teamsRouter);
router.use('/board', boardRouter);
