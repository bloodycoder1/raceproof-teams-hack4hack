import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const COOKIE_NAME = 'token';
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signToken(userId: number): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

/** Returns the user id, or null if the token is missing, malformed, tampered with or expired. */
export function verifyToken(token: string | undefined): number | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) return null;
    const id = Number(payload.sub);
    return Number.isSafeInteger(id) ? id : null;
  } catch {
    return null;
  }
}
