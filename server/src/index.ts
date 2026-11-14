import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { logger } from './lib/logger.js';

async function start() {
  try {
    logger.info('Running database migrations...');
    await migrate();
    logger.info('Database migrations up to date.');
  } catch (err) {
    logger.error({ err }, 'Failed to run migrations on startup');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));

  function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
