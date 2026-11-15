import pg from 'pg';
import { env } from '../config/env.js';

// BIGSERIAL ids and COUNT(*) come back from pg as strings by default. Our ids stay far below 2^53, so parse to number.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const isLocal = env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1');

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: Number(process.env.PG_MAX_POOL || 50),
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

/**
 * Run `fn` inside a transaction. Commits on success, rolls back on any throw.
 * Use this for EVERY state change so locks, writes and the audit_log row
 * succeed or fail together.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
