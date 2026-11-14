declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      userId?: number;
      /** Set by requireIdempotencyKey. */
      idempotencyKey?: string;
    }
  }
}
export {};
