import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { router } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDist = path.resolve(__dirname, '../../client/dist');
const candidatePaths: string[] = [
  defaultDist,
  path.resolve(__dirname, '../client/dist'),
  '/client/dist',
];
const clientDist: string = candidatePaths.find((p) => fs.existsSync(p)) ?? defaultDist;

/** Builds the Express app without listening, so tests can import it with supertest. */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind Render/Railway proxies: needed for correct req.ip (rate limits)
  app.use(
    helmet({
      contentSecurityPolicy: false, // allow inline styles/assets for SPA in demo mode
    }),
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== 'test' && env.LOG_LEVEL !== 'silent' && env.LOG_LEVEL !== 'warn',
    }),
  );

  app.use(router);

  // Serve static React client build in production
  if (env.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/board') ||
        req.path.startsWith('/teams') ||
        req.path.startsWith('/auth') ||
        req.path.startsWith('/users') ||
        req.path.startsWith('/health')
      ) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
