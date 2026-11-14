import request from 'supertest';
import type { Express } from 'express';
import { pool } from '../src/db/pool.js';

/** Empty every table and restart ids. Call in beforeEach so tests are independent. */
export async function resetDb() {
  await pool.query(
    `TRUNCATE audit_log, idempotency_keys, join_requests, team_members, teams, hackathons, users
     RESTART IDENTITY CASCADE`,
  );
}

let counter = 0;
export const uniqueEmail = () => `user${Date.now()}_${counter++}@example.com`;

export const validUser = (overrides: Record<string, unknown> = {}) => ({
  email: uniqueEmail(),
  password: 'correct-horse-battery',
  name: 'Test User',
  timezone: 'Asia/Kolkata',
  skills: ['react', 'node'],
  ...overrides,
});

/** Registers a user and returns a supertest agent that carries the login cookie. */
export async function registerAgent(app: Express, overrides: Record<string, unknown> = {}) {
  const agent = request.agent(app);
  const body = validUser(overrides);
  const res = await agent.post('/auth/register').send(body);
  return { agent, body, res, userId: res.body.user?.id as number };
}

// ---------------------------------------------------------------------------
// Team-related helpers
// ---------------------------------------------------------------------------
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { signToken } from '../src/lib/jwt.js';

export async function createHackathon(min = 2, max = 4): Promise<number> {
  const { rows } = await pool.query(
    "INSERT INTO hackathons (name, min_team_size, max_team_size) VALUES ('Test Hackathon', $1, $2) RETURNING id",
    [min, max],
  );
  return rows[0].id;
}

/** Inserts n users directly (no password hashing, so it is fast). They can't log in, use cookieFor(). */
export async function createUsers(n: number): Promise<number[]> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, timezone, utc_offset_min, skills)
     SELECT 'bulk' || g || '_' || $1::text || '@example.com', 'x', 'User ' || g, 'Asia/Kolkata', 330, '{react}'
       FROM generate_series(1, $2::int) g
     RETURNING id`,
    [randomUUID(), n],
  );
  return rows.map((r) => r.id as number);
}

/** A valid auth cookie for a user id. */
export const cookieFor = (userId: number) => `token=${signToken(userId)}`;

export const apiPost = (server: Server, path: string, cookie: string, body: unknown = {}, key: string = randomUUID()) =>
  request(server).post(path).set('Cookie', cookie).set('Idempotency-Key', key).send(body as object);

export const joinTeam = (server: Server, cookie: string, code: string, key?: string) =>
  apiPost(server, '/teams/join-by-code', cookie, { code }, key);

/**
 * Creates a hackathon (or uses `hackathonId`), a leader, and a team, then joins extra members
 * until the team has `members` people in total.
 */
export async function makeTeam(
  server: Server,
  opts: { min?: number; max?: number; members?: number; hackathonId?: number; name?: string } = {},
) {
  const hackathonId = opts.hackathonId ?? (await createHackathon(opts.min ?? 2, opts.max ?? 4));
  const members = opts.members ?? 1;
  const users = await createUsers(members);
  const leaderId = users[0]!;
  const res = await apiPost(server, '/teams', cookieFor(leaderId), {
    hackathonId,
    name: opts.name ?? `Team ${randomUUID().slice(0, 8)}`,
  });
  if (res.status !== 201) throw new Error(`makeTeam failed: ${res.status} ${JSON.stringify(res.body)}`);
  const code = res.body.inviteCode as string;
  for (const id of users.slice(1)) {
    const j = await joinTeam(server, cookieFor(id), code);
    if (j.status !== 200) throw new Error(`makeTeam join failed: ${j.status} ${JSON.stringify(j.body)}`);
  }
  return { hackathonId, leaderId, memberIds: users, teamId: res.body.team.id as number, code, createRes: res };
}
