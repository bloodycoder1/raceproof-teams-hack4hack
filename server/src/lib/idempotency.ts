import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from '../db/pool.js';
import { HttpError, conflict } from './errors.js';

export interface IdempotentResult {
  status: number;
  body: unknown;
  /** What to save for replays when it must differ from `body` (e.g. to avoid persisting a secret). */
  storedBody?: unknown;
  /** Runs once, after the transaction commits (publish SSE events here). Not run on replays. */
  afterCommit?: () => void;
}

export interface IdempotentResponse {
  status: number;
  body: unknown;
  replayed: boolean;
}

export const hashRequest = (label: string, body: unknown) =>
  createHash('sha256').update(`${label}:${JSON.stringify(body)}`).digest('hex');

/**
 * Runs `work` at most once per (user, Idempotency-Key).
 *
 * The key row is inserted INSIDE the same transaction as the work:
 *  - work succeeds  -> key + response are committed together; later calls replay the saved response.
 *  - work fails     -> everything rolls back, the key disappears, a retry runs the work again.
 *  - two requests with the same key at the same time -> the second INSERT waits on the first's
 *    uncommitted row, then sees it committed and replays it. No double execution.
 */
export async function runIdempotent(opts: {
  userId: number;
  key: string;
  requestHash: string;
  work: (client: PoolClient) => Promise<IdempotentResult>;
}): Promise<IdempotentResponse> {
  let afterCommit: (() => void) | undefined;

  const response = await withTransaction(async (client): Promise<IdempotentResponse> => {
    const claim = await client.query(
      `INSERT INTO idempotency_keys (user_id, key, request_hash) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO NOTHING RETURNING 1`,
      [opts.userId, opts.key, opts.requestHash],
    );

    if (claim.rowCount === 0) {
      const { rows } = await client.query(
        'SELECT request_hash, status_code, response FROM idempotency_keys WHERE user_id = $1 AND key = $2',
        [opts.userId, opts.key],
      );
      const saved = rows[0];
      if (!saved) throw conflict('Please retry the request', 'RETRY');
      if (saved.request_hash !== opts.requestHash) {
        throw new HttpError(422, 'This Idempotency-Key was already used for a different request', 'IDEMPOTENCY_KEY_REUSED');
      }
      if (saved.status_code === null) throw conflict('This request is still being processed', 'IN_PROGRESS');
      return { status: saved.status_code, body: saved.response, replayed: true };
    }

    const result = await opts.work(client);
    await client.query('UPDATE idempotency_keys SET status_code = $3, response = $4 WHERE user_id = $1 AND key = $2', [
      opts.userId,
      opts.key,
      result.status,
      JSON.stringify(result.storedBody ?? result.body),
    ]);
    afterCommit = result.afterCommit;
    return { status: result.status, body: result.body, replayed: false };
  });

  afterCommit?.();
  return response;
}
