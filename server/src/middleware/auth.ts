import type { RequestHandler } from 'express';
import { COOKIE_NAME, verifyToken } from '../lib/jwt.js';
import { unauthorized } from '../lib/errors.js';

/** Rejects the request with 401 unless it carries a valid auth cookie. Sets req.userId. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const userId = verifyToken(req.cookies?.[COOKIE_NAME]);
  if (userId === null) return next(unauthorized('Please log in'));
  req.userId = userId;
  next();
};
