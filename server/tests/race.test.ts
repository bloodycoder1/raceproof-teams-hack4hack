/**
 * THE CONCURRENCY PROOF.
 *
 * Every test fires many requests at the same instant (Promise.all) over real HTTP against a real
 * Postgres, then checks BOTH the API responses and the database invariants:
 *   - member_count == number of team_members rows <= max_team_size
 *   - every member.joined audit row matches a real membership
 *   - nobody is in two teams of one hackathon
 */
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { apiPost, cookieFor, createHackathon, createUsers, joinTeam, makeTeam, resetDb } from './helpers.js';

let server: Server;
beforeAll(() => {
  server = createApp().listen(0);
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});
beforeEach(resetDb);

async function expectTeamConsistent(teamId: number, max: number) {
  const team = await pool.query('SELECT member_count, is_open FROM teams WHERE id = $1', [teamId]);
  const members = await pool.query('SELECT count(*)::int AS n FROM team_members WHERE team_id = $1', [teamId]);
  const joined = await pool.query(
    "SELECT count(*)::int AS n FROM audit_log WHERE team_id = $1 AND action = 'member.joined'",
    [teamId],
  );
  const actual = members.rows[0].n as number;
  expect(team.rows[0].member_count).toBe(actual); // counter never drifts from reality
  expect(actual).toBeLessThanOrEqual(max); // capacity is never exceeded
  expect(joined.rows[0].n).toBe(actual - 1); // exactly one audit row per join (the leader has team.created)
  expect(team.rows[0].is_open).toBe(actual < max);
}

describe('race: the last seat', () => {
  it('50 people take the last seat at the same instant: exactly one gets it', async () => {
    const MAX = 5;
    for (let round = 0; round < 5; round++) {
      const t = await makeTeam(server, { min: 2, max: MAX, members: MAX - 1 }); // one seat left
      const joiners = await createUsers(50);

      const results = await Promise.all(joiners.map((id) => joinTeam(server, cookieFor(id), t.code)));

      const winners = results.filter((r) => r.status === 200);
      const rejected = results.filter((r) => r.status === 409 && r.body.error.code === 'TEAM_FULL');
      expect(winners).toHaveLength(1);
      expect(rejected).toHaveLength(49);
      expect(winners.length + rejected.length).toBe(50); // no 5xx, no surprises
      await expectTeamConsistent(t.teamId, MAX);
    }
  });

  it.each([2, 3])('%i seats left, 50 concurrent joiners: exactly %i succeed', async (openSeats) => {
    const MAX = 5;
    const t = await makeTeam(server, { min: 2, max: MAX, members: MAX - openSeats });
    const joiners = await createUsers(50);

    const results = await Promise.all(joiners.map((id) => joinTeam(server, cookieFor(id), t.code)));

    expect(results.filter((r) => r.status === 200)).toHaveLength(openSeats);
    expect(results.filter((r) => r.status === 409 && r.body.error.code === 'TEAM_FULL')).toHaveLength(50 - openSeats);
    await expectTeamConsistent(t.teamId, MAX);
  });

  it('winners are distinct people and the roster matches the API responses', async () => {
    const t = await makeTeam(server, { min: 2, max: 4, members: 1 });
    const joiners = await createUsers(30);
    const results = await Promise.all(joiners.map((id) => joinTeam(server, cookieFor(id), t.code)));
    const winnerIds = joiners.filter((_, i) => results[i]!.status === 200);
    expect(winnerIds).toHaveLength(3);
    const { rows } = await pool.query('SELECT user_id FROM team_members WHERE team_id = $1', [t.teamId]);
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([t.leaderId, ...winnerIds]));
  });
});

describe('race: idempotency (double click / flaky network)', () => {
  it('the same request retried 50 times in parallel joins exactly once', async () => {
    const t = await makeTeam(server, { min: 2, max: 5, members: 1 });
    const [user] = await createUsers(1);
    const key = randomUUID();

    const results = await Promise.all(Array.from({ length: 50 }, () => joinTeam(server, cookieFor(user!), t.code, key)));

    expect(results.every((r) => r.status === 200)).toBe(true); // every retry gets the same success
    expect(new Set(results.map((r) => r.body.team.id)).size).toBe(1);
    const executed = results.filter((r) => r.headers['idempotent-replayed'] !== 'true');
    expect(executed).toHaveLength(1); // the work ran once; the other 49 were replays
    const m = await pool.query('SELECT count(*)::int AS n FROM team_members WHERE user_id = $1', [user]);
    expect(m.rows[0].n).toBe(1);
    await expectTeamConsistent(t.teamId, 5);
  });

  it('the same person clicking join 50 times with different keys joins once', async () => {
    const t = await makeTeam(server, { min: 2, max: 5, members: 1 });
    const [user] = await createUsers(1);

    const results = await Promise.all(Array.from({ length: 50 }, () => joinTeam(server, cookieFor(user!), t.code)));

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409 && r.body.error.code === 'ALREADY_IN_TEAM')).toHaveLength(49);
    await expectTeamConsistent(t.teamId, 5);
  });

  it('one person racing to join two different teams of the same hackathon ends up in exactly one', async () => {
    const a = await makeTeam(server, { min: 2, max: 5, members: 1 });
    const b = await makeTeam(server, { hackathonId: a.hackathonId, members: 1 });
    const [user] = await createUsers(1);

    const attempts = Array.from({ length: 20 }, (_, i) => joinTeam(server, cookieFor(user!), i % 2 ? a.code : b.code));
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    const m = await pool.query('SELECT count(*)::int AS n FROM team_members WHERE user_id = $1', [user]);
    expect(m.rows[0].n).toBe(1);
    // the loser's team must not have a drifted counter
    for (const team of [a, b]) {
      const row = await pool.query('SELECT member_count FROM teams WHERE id = $1', [team.teamId]);
      const real = await pool.query('SELECT count(*)::int AS n FROM team_members WHERE team_id = $1', [team.teamId]);
      expect(row.rows[0].member_count).toBe(real.rows[0].n);
    }
  });
});

describe('race: creating teams', () => {
  it('20 parallel "create team" calls from one person with different keys create exactly one team', async () => {
    const hackathonId = await createHackathon();
    const [user] = await createUsers(1);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => apiPost(server, '/teams', cookieFor(user!), { hackathonId, name: `Team number ${i}` })),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    const teams = await pool.query('SELECT count(*)::int AS n FROM teams');
    expect(teams.rows[0].n).toBe(1); // the 19 losers left no orphan team behind
  });

  it('20 parallel retries of one create request (same key) create exactly one team', async () => {
    const hackathonId = await createHackathon();
    const [user] = await createUsers(1);
    const key = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => apiPost(server, '/teams', cookieFor(user!), { hackathonId, name: 'Only Team' }, key)),
    );

    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.team.id)).size).toBe(1);
    const teams = await pool.query('SELECT count(*)::int AS n FROM teams');
    expect(teams.rows[0].n).toBe(1);
  });

  it('two different people racing for the same team name: one wins, one gets NAME_TAKEN', async () => {
    const hackathonId = await createHackathon();
    const [a, b] = await createUsers(2);
    const results = await Promise.all([
      apiPost(server, '/teams', cookieFor(a!), { hackathonId, name: 'Contested Name' }),
      apiPost(server, '/teams', cookieFor(b!), { hackathonId, name: 'Contested Name' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});
