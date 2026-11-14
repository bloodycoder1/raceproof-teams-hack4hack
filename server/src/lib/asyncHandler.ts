import type { Request, RequestHandler, Response } from 'express';

/** Express 4 does not catch rejected promises. Wrap every async route handler in this. */
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };
