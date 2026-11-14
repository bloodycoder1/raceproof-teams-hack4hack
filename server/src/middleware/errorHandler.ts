import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code ?? 'ERROR', message: err.message, details: err.details },
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
  }
  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
};
