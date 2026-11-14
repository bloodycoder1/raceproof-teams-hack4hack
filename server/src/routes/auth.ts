import { Router } from 'express';
import type { Response } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { COOKIE_NAME, TOKEN_TTL_SECONDS, signToken } from '../lib/jwt.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../schemas/user.js';
import { authenticate, registerUser } from '../services/auth.service.js';

export const authRouter = Router();

// httpOnly: JavaScript can't read it (XSS can't steal it). sameSite=lax: blocks most CSRF.
// If the React app and the API end up on different domains in production,
// switch sameSite to 'none' (requires secure: true) or proxy the API under the same domain.
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
};

function setAuthCookie(res: Response, userId: number) {
  res.cookie(COOKIE_NAME, signToken(userId), { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
}

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const user = await registerUser(req.body);
    setAuthCookie(res, user.id);
    res.status(201).json({ user });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const user = await authenticate(req.body.email, req.body.password);
    setAuthCookie(res, user.id);
    res.json({ user });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(204).end();
});
