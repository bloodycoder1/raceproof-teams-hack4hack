import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const WINDOW_MS = 15 * 60 * 1000;
const skip = () => env.RATE_LIMIT_DISABLED;
const body = { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } };

/** Login/register: 30 attempts per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: body,
});

/**
 * Invite-code guessing, per logged-in user: only FAILED attempts (status >= 400) count,
 * so honest users joining normally never hit it. Must run after requireAuth.
 */
export const joinUserLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.JOIN_ATTEMPT_LIMIT,
  keyGenerator: (req) => `user:${req.userId}`,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: body,
});

/** Same idea per IP (5x looser, so a campus/office NAT isn't blocked by one person's typos). */
export const joinIpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.JOIN_ATTEMPT_LIMIT * 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: body,
});
