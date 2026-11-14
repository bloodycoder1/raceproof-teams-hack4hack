import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
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

const CODE_FORMAT = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;

describe('POST /teams', () => {
  it('creates a team; the creator becomes leader and first member', async () => {
    const hackathonId = await createHackathon(2, 4);
    const [userId] = await createUsers(1);
    const res = await apiPost(server, '/teams', cookieFor(userId!), { hackathonId, name: 'Rocket Team' });
    expect(res.status).toBe(201);
    expect(res.body.team).toMatchObject({
      name: 'Rocket Team',
      leaderId: userId,
      memberCount: 1,
      minTeamSize: 2,
      maxTeamSize: 4,
      isOpen: true,
      isComplete: false,
    });
    const members = await pool.query('SELECT user_id FROM team_members WHERE team_id = $1', [res.body.team.id]);
    expect(members.rows).toEqual([{ user_id: userId }]);
  });

  it('returns a well-formed invite code with 50 bits of entropy', async () => {
    const t = await makeTeam(server);
    expect(t.code).toMatch(CODE_FORMAT);
  });

  it('stores only a hash of the invite code, and an expiry about 48h away', async () => {
    const t = await makeTeam(server);
    const { rows } = await pool.query(
      `SELECT invite_code_hash, EXTRACT(EPOCH FROM (invite_expires_at - now())) / 3600 AS hours FROM teams WHERE id = $1`,
      [t.teamId],
    );
    expect(rows[0].invite_code_hash).toBeInstanceOf(Buffer);
    expect(rows[0].invite_code_hash).toHaveLength(32);
    expect(rows[0].invite_code_hash.toString()).not.toContain(t.code.replace('-', ''));
    expect(Number(rows[0].hours)).toBeGreaterThan(47);
    expect(Number(rows[0].hours)).toBeLessThanOrEqual(48);
  });

  it('writes a team.created audit row with the actor', async () => {
    const t = await makeTeam(server);
    const { rows } = await pool.query("SELECT actor_id, action FROM audit_log WHERE team_id = $1", [t.teamId]);
    expect(rows).toEqual([{ actor_id: t.leaderId, action: 'team.created' }]);
  });

  it('requires login', async () => {
    const res = await request(server).post('/teams').set('Idempotency-Key', randomUUID()).send({});
    expect(res.status).toBe(401);
  });

  it.each([
    ['missing', undefined],
    ['too short', 'abc'],
    ['bad characters', 'key with spaces!!'],
  ])('rejects an Idempotency-Key that is %s with 400', async (_l, key) => {
    const hackathonId = await createHackathon();
    const [userId] = await createUsers(1);
    const req = request(server).post('/teams').set('Cookie', cookieFor(userId!));
    if (key) req.set('Idempotency-Key', key);
    const res = await req.send({ hackathonId, name: 'Valid Name' });
    expect(res.status).toBe(400);
  });

  it.each([
    ['name too short', { name: 'ab' }],
    ['name too long', { name: 'x'.repeat(51) }],
    ['hackathonId is a string', { hackathonId: 'abc' }],
    ['hackathonId is negative', { hackathonId: -1 }],
  ])('rejects %s with 400', async (_l, override) => {
    const hackathonId = await createHackathon();
    const [userId] = await createUsers(1);
    const res = await apiPost(server, '/teams', cookieFor(userId!), { hackathonId, name: 'Valid Name', ...override });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown hackathon', async () => {
    const [userId] = await createUsers(1);
    const res = await apiPost(server, '/teams', cookieFor(userId!), { hackathonId: 999999, name: 'Valid Name' });
    expect(res.status).toBe(404);
  });

  it('rejects a duplicate team name in the same hackathon with 409 NAME_TAKEN', async () => {
    const t = await makeTeam(server, { name: 'Same Name' });
    const [other] = await createUsers(1);
    const res = await apiPost(server, '/teams', cookieFor(other!), { hackathonId: t.hackathonId, name: 'Same Name' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NAME_TAKEN');
  });

  it('allows only one team per person per hackathon', async () => {
    const t = await makeTeam(server);
    const res = await apiPost(server, '/teams', cookieFor(t.leaderId), { hackathonId: t.hackathonId, name: 'Second Team' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_IN_TEAM');
  });

  it('replays the saved response for a retried request (same key): one team, never two', async () => {
    const hackathonId = await createHackathon();
    const [userId] = await createUsers(1);
    const key = randomUUID();
    const body = { hackathonId, name: 'Retry Team' };
    const first = await apiPost(server, '/teams', cookieFor(userId!), body, key);
    const second = await apiPost(server, '/teams', cookieFor(userId!), body, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.team.id).toBe(first.body.team.id);
    const count = await pool.query('SELECT count(*)::int AS n FROM teams');
    expect(count.rows[0].n).toBe(1);
  });

  it('does not persist the plaintext invite code in idempotency_keys', async () => {
    const t = await makeTeam(server);
    const { rows } = await pool.query('SELECT response FROM idempotency_keys');
    expect(JSON.stringify(rows)).not.toContain(t.code.replace('-', ''));
    expect(JSON.stringify(rows)).not.toContain(t.code);
  });

  it('rejects the same key reused for a different request with 422', async () => {
    const hackathonId = await createHackathon();
    const [userId] = await createUsers(1);
    const key = randomUUID();
    await apiPost(server, '/teams', cookieFor(userId!), { hackathonId, name: 'First Name' }, key);
    const res = await apiPost(server, '/teams', cookieFor(userId!), { hackathonId, name: 'Other Name' }, key);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('POST /teams/join-by-code', () => {
  it('adds the user, increments the count and writes an audit row', async () => {
    const t = await makeTeam(server, { max: 4 });
    const [joiner] = await createUsers(1);
    const res = await joinTeam(server, cookieFor(joiner!), t.code);
    expect(res.status).toBe(200);
    expect(res.body.team.memberCount).toBe(2);
    expect(res.body.team.isComplete).toBe(true);
    const audit = await pool.query(
      "SELECT actor_id FROM audit_log WHERE team_id = $1 AND action = 'member.joined'",
      [t.teamId],
    );
    expect(audit.rows).toEqual([{ actor_id: joiner }]);
  });

  it('accepts the code in lowercase and without the dash', async () => {
    const t = await makeTeam(server);
    const [joiner] = await createUsers(1);
    const res = await joinTeam(server, cookieFor(joiner!), t.code.replace('-', '').toLowerCase());
    expect(res.status).toBe(200);
  });

  it('returns 404 INVALID_CODE for a code that does not exist', async () => {
    await makeTeam(server);
    const [joiner] = await createUsers(1);
    const res = await joinTeam(server, cookieFor(joiner!), 'AAAAA-AAAAA');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVALID_CODE');
  });

  it('returns 400 for a malformed code', async () => {
    const [joiner] = await createUsers(1);
    const res = await joinTeam(server, cookieFor(joiner!), 'short');
    expect(res.status).toBe(400);
  });

  it('treats an expired code exactly like an unknown one', async () => {
    const t = await makeTeam(server);
    await pool.query("UPDATE teams SET invite_expires_at = now() - interval '1 minute' WHERE id = $1", [t.teamId]);
    const [joiner] = await createUsers(1);
    const expired = await joinTeam(server, cookieFor(joiner!), t.code);
    const unknown = await joinTeam(server, cookieFor(joiner!), 'AAAAA-AAAAA');
    expect(expired.status).toBe(404);
    expect(expired.body).toEqual(unknown.body);
  });

  it('rejects a join when the team is full (409 TEAM_FULL) and closes the team on the board', async () => {
    const t = await makeTeam(server, { max: 2, members: 1 });
    const [a, b] = await createUsers(2);
    const first = await joinTeam(server, cookieFor(a!), t.code);
    expect(first.status).toBe(200);
    const { rows } = await pool.query('SELECT is_open FROM teams WHERE id = $1', [t.teamId]);
    expect(rows[0].is_open).toBe(false);
    const second = await joinTeam(server, cookieFor(b!), t.code);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('TEAM_FULL');
  });

  it('rejects joining the same team twice with different keys', async () => {
    const t = await makeTeam(server, { max: 4 });
    const [joiner] = await createUsers(1);
    await joinTeam(server, cookieFor(joiner!), t.code);
    const again = await joinTeam(server, cookieFor(joiner!), t.code);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_IN_TEAM');
  });

  it('rejects joining a second team in the same hackathon', async () => {
    const a = await makeTeam(server, { max: 4 });
    const b = await makeTeam(server, { hackathonId: a.hackathonId });
    const [joiner] = await createUsers(1);
    expect((await joinTeam(server, cookieFor(joiner!), a.code)).status).toBe(200);
    const res = await joinTeam(server, cookieFor(joiner!), b.code);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_IN_TEAM');
  });

  it('allows the same person in teams of two different hackathons', async () => {
    const a = await makeTeam(server, { max: 4 });
    const b = await makeTeam(server, { max: 4 });
    const [joiner] = await createUsers(1);
    expect((await joinTeam(server, cookieFor(joiner!), a.code)).status).toBe(200);
    expect((await joinTeam(server, cookieFor(joiner!), b.code)).status).toBe(200);
  });

  it('replays the saved response for a retried join (same key)', async () => {
    const t = await makeTeam(server, { max: 4 });
    const [joiner] = await createUsers(1);
    const key = randomUUID();
    const first = await joinTeam(server, cookieFor(joiner!), t.code, key);
    const second = await joinTeam(server, cookieFor(joiner!), t.code, key);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    const { rows } = await pool.query('SELECT member_count FROM teams WHERE id = $1', [t.teamId]);
    expect(rows[0].member_count).toBe(2);
  });

  it('a failed join is not saved: after the team frees up, a retry with the same key succeeds', async () => {
    const t = await makeTeam(server, { max: 2, members: 2 });
    const [joiner] = await createUsers(1);
    const key = randomUUID();
    const failed = await joinTeam(server, cookieFor(joiner!), t.code, key);
    expect(failed.status).toBe(409);
    await pool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id <> $2', [t.teamId, t.leaderId]);
    await pool.query('UPDATE teams SET member_count = 1, is_open = true WHERE id = $1', [t.teamId]);
    const retry = await joinTeam(server, cookieFor(joiner!), t.code, key);
    expect(retry.status).toBe(200);
  });

  it('requires login', async () => {
    const res = await request(server).post('/teams/join-by-code').set('Idempotency-Key', randomUUID()).send({ code: 'AAAAA-AAAAA' });
    expect(res.status).toBe(401);
  });
});

describe('POST /teams/:id/invite-code (rotate)', () => {
  it('lets the leader rotate: the old code stops working and the new one works', async () => {
    const t = await makeTeam(server, { max: 4 });
    const rotated = await apiPost(server, `/teams/${t.teamId}/invite-code`, cookieFor(t.leaderId));
    expect(rotated.status).toBe(200);
    expect(rotated.body.inviteCode).toMatch(CODE_FORMAT);
    expect(rotated.body.inviteCode).not.toBe(t.code);

    const [u1, u2] = await createUsers(2);
    expect((await joinTeam(server, cookieFor(u1!), t.code)).status).toBe(404);
    expect((await joinTeam(server, cookieFor(u2!), rotated.body.inviteCode)).status).toBe(200);
  });

  it('refuses a non-leader member with 403 and an outsider with 403', async () => {
    const t = await makeTeam(server, { max: 4, members: 2 });
    const [outsider] = await createUsers(1);
    const member = t.memberIds[1]!;
    expect((await apiPost(server, `/teams/${t.teamId}/invite-code`, cookieFor(member))).status).toBe(403);
    expect((await apiPost(server, `/teams/${t.teamId}/invite-code`, cookieFor(outsider!))).status).toBe(403);
  });

  it('returns 404 for an unknown team and writes an invite.rotated audit row on success', async () => {
    const t = await makeTeam(server);
    expect((await apiPost(server, '/teams/999999/invite-code', cookieFor(t.leaderId))).status).toBe(404);
    await apiPost(server, `/teams/${t.teamId}/invite-code`, cookieFor(t.leaderId));
    const { rows } = await pool.query("SELECT actor_id FROM audit_log WHERE action = 'invite.rotated'");
    expect(rows).toEqual([{ actor_id: t.leaderId }]);
  });
});

describe('GET /teams/:id', () => {
  it('lists members with the leader flagged, and shows invite expiry only to the leader', async () => {
    const t = await makeTeam(server, { max: 4, members: 2 });
    const asLeader = await request(server).get(`/teams/${t.teamId}`).set('Cookie', cookieFor(t.leaderId));
    const asMember = await request(server).get(`/teams/${t.teamId}`).set('Cookie', cookieFor(t.memberIds[1]!));
    expect(asLeader.status).toBe(200);
    expect(asLeader.body.members).toHaveLength(2);
    expect(asLeader.body.members.filter((m: any) => m.isLeader)).toHaveLength(1);
    expect(asLeader.body.team.inviteExpiresAt).toBeTypeOf('string');
    expect(asMember.body.team.inviteExpiresAt).toBeUndefined();
  });

  it('never exposes emails or invite hashes', async () => {
    const t = await makeTeam(server);
    const res = await request(server).get(`/teams/${t.teamId}`).set('Cookie', cookieFor(t.leaderId));
    expect(JSON.stringify(res.body)).not.toMatch(/email|invite_code_hash|inviteCode/i);
  });

  it('returns 404 for an unknown team, 400 for a bad id, 401 without login', async () => {
    const [u] = await createUsers(1);
    expect((await request(server).get('/teams/999999').set('Cookie', cookieFor(u!))).status).toBe(404);
    expect((await request(server).get('/teams/abc').set('Cookie', cookieFor(u!))).status).toBe(400);
    expect((await request(server).get('/teams/1')).status).toBe(401);
  });
});
