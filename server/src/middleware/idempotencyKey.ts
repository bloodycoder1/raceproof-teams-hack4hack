import type { RequestHandler } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';

const keySchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

/** Requires `Idempotency-Key: <uuid>` on state-changing requests. The React app sends a fresh UUID per user action. */
export const requireIdempotencyKey: RequestHandler = (req, _res, next) => {
  const parsed = keySchema.safeParse(req.header('Idempotency-Key'));
  if (!parsed.success) {
    return next(badRequest('Idempotency-Key header is required (8-128 characters: letters, digits, - and _)'));
  }
  req.idempotencyKey = parsed.data;
  next();
};
