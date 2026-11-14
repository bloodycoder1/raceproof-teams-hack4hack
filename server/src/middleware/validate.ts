import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors.js';

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/** Validate and replace req.body / req.query / req.params with the parsed (typed, stripped) values. */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    for (const key of ['body', 'query', 'params'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(badRequest(`Invalid ${key}`, result.error.flatten().fieldErrors));
      }
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
