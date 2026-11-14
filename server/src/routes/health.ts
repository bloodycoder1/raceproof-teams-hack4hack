import { Router } from 'express';
import { pool } from '../db/pool.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

healthRouter.get('/metrics', async (_req, res, next) => {
  try {
    const memory = process.memoryUsage();
    const dbStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    const dbCounts = await pool.query<{
      users: string;
      teams: string;
      memberships: string;
    }>(`
      SELECT
        (SELECT count(*) FROM users) as users,
        (SELECT count(*) FROM teams) as teams,
        (SELECT count(*) FROM team_members) as memberships
    `);

    res.json({
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb: {
        heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2),
        rss: (memory.rss / 1024 / 1024).toFixed(2),
      },
      databasePool: dbStats,
      liveDataCounts: {
        users: parseInt(dbCounts.rows[0]?.users ?? '0', 10),
        teams: parseInt(dbCounts.rows[0]?.teams ?? '0', 10),
        memberships: parseInt(dbCounts.rows[0]?.memberships ?? '0', 10),
      },
      nodeVersion: process.version,
    });
  } catch (err) {
    next(err);
  }
});
