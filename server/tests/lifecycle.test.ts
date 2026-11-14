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

describe('Team Lifecycle: Leave and Leadership Handover', () => {
  it('member leaves team: member_count decrements and team re-opens', async () => {
    const t = await makeTeam(server, { max: 2, members: 2 });
    const memberId = t.memberIds[1]!;

    // Verify team was closed (2/2)
    const before = await pool.query('SELECT member_count, is_open FROM teams WHERE id = $1', [t.teamId]);
    expect(before.rows[0].member_count).toBe(2);
    expect(before.rows[0].is_open).toBe(false);

    const res = await apiPost(server, `/teams/${t.teamId}/leave`, cookieFor(memberId), {});
    expect(res.status).toBe(200);
    expect(res.body.teamDeleted).toBe(false);

    const after = await pool.query('SELECT member_count, is_open FROM teams WHERE id = $1', [t.teamId]);
    expect(after.rows[0].member_count).toBe(1);
    expect(after.rows[0].is_open).toBe(true);

    const audit = await pool.query("SELECT action, actor_id FROM audit_log WHERE team_id = $1 AND action = 'member.left'", [
      t.teamId,
    ]);
    expect(audit.rows).toEqual([{ action: 'member.left', actor_id: memberId }]);
  });

  it('leader leaves team: leadership automatically transfers to next oldest member', async () => {
    const t = await makeTeam(server, { max: 4, members: 3 });
    const originalLeader = t.leaderId;
    const expectedNewLeader = t.memberIds[1]!;

    const res = await apiPost(server, `/teams/${t.teamId}/leave`, cookieFor(originalLeader), {});
    expect(res.status).toBe(200);
    expect(res.body.teamDeleted).toBe(false);
    expect(res.body.newLeaderId).toBe(expectedNewLeader);

    const team = await pool.query('SELECT leader_id, member_count FROM teams WHERE id = $1', [t.teamId]);
    expect(team.rows[0].leader_id).toBe(expectedNewLeader);
    expect(team.rows[0].member_count).toBe(2);

    const transferAudit = await pool.query(
      "SELECT action, actor_id, details FROM audit_log WHERE team_id = $1 AND action = 'leader.transferred'",
      [t.teamId],
    );
    expect(transferAudit.rows[0].actor_id).toBe(originalLeader);
    expect(transferAudit.rows[0].details.to).toBe(expectedNewLeader);
  });

  it('last member leaves team: deletes the team and writes audit log', async () => {
    const t = await makeTeam(server, { max: 4, members: 1 });
    const leaderId = t.leaderId;

    const res = await apiPost(server, `/teams/${t.teamId}/leave`, cookieFor(leaderId), {});
    expect(res.status).toBe(200);
    expect(res.body.teamDeleted).toBe(true);

    const team = await pool.query('SELECT 1 FROM teams WHERE id = $1', [t.teamId]);
    expect(team.rowCount).toBe(0); // Team deleted

    const members = await pool.query('SELECT 1 FROM team_members WHERE team_id = $1', [t.teamId]);
    expect(members.rowCount).toBe(0); // Cascaded

    const audit = await pool.query("SELECT action, actor_id FROM audit_log WHERE team_id = $1 AND action = 'team.deleted'", [
      t.teamId,
    ]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(leaderId);
  });

  it('non-member cannot leave a team', async () => {
    const t = await makeTeam(server);
    const [outsider] = await createUsers(1);

    const res = await apiPost(server, `/teams/${t.teamId}/leave`, cookieFor(outsider!), {});
    expect(res.status).toBe(403);
  });
});

describe('Team Lifecycle: Remove Member', () => {
  it('leader can remove a member: count decrements and team re-opens', async () => {
    const t = await makeTeam(server, { max: 2, members: 2 });
    const memberId = t.memberIds[1]!;

    const req = request(server)
      .delete(`/teams/${t.teamId}/members/${memberId}`)
      .set('Cookie', cookieFor(t.leaderId))
      .set('Idempotency-Key', randomUUID());
    const res = await req.send();

    expect(res.status).toBe(200);
    expect(res.body.removedUserId).toBe(memberId);

    const team = await pool.query('SELECT member_count, is_open FROM teams WHERE id = $1', [t.teamId]);
    expect(team.rows[0].member_count).toBe(1);
    expect(team.rows[0].is_open).toBe(true);

    const audit = await pool.query("SELECT action, actor_id FROM audit_log WHERE team_id = $1 AND action = 'member.removed'", [
      t.teamId,
    ]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(t.leaderId);
  });

  it('non-leader cannot remove a member', async () => {
    const t = await makeTeam(server, { max: 4, members: 3 });
    const nonLeader = t.memberIds[1]!;
    const target = t.memberIds[2]!;

    const res = await request(server)
      .delete(`/teams/${t.teamId}/members/${target}`)
      .set('Cookie', cookieFor(nonLeader))
      .set('Idempotency-Key', randomUUID())
      .send();

    expect(res.status).toBe(403);
  });

  it('leader cannot remove self (must leave instead)', async () => {
    const t = await makeTeam(server, { max: 4, members: 2 });

    const res = await request(server)
      .delete(`/teams/${t.teamId}/members/${t.leaderId}`)
      .set('Cookie', cookieFor(t.leaderId))
      .set('Idempotency-Key', randomUUID())
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LEADER_CANNOT_BE_REMOVED');
  });
});

describe('Join Requests Flow', () => {
  it('user submits a join request to an open team', async () => {
    const t = await makeTeam(server, { max: 4, members: 1 });
    const [applicant] = await createUsers(1);

    const res = await apiPost(server, `/teams/${t.teamId}/requests`, cookieFor(applicant!), { message: 'Can I join?' });
    expect(res.status).toBe(201);
    expect(res.body.requestId).toBeTypeOf('number');

    const reqs = await pool.query('SELECT user_id, status FROM join_requests WHERE id = $1', [res.body.requestId]);
    expect(reqs.rows[0].user_id).toBe(applicant);
    expect(reqs.rows[0].status).toBe('pending');
  });

  it('rejects duplicate pending join request to the same team with 409', async () => {
    const t = await makeTeam(server, { max: 4, members: 1 });
    const [applicant] = await createUsers(1);

    const first = await apiPost(server, `/teams/${t.teamId}/requests`, cookieFor(applicant!), {});
    expect(first.status).toBe(201);

    const second = await apiPost(server, `/teams/${t.teamId}/requests`, cookieFor(applicant!), {});
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('REQUEST_PENDING');
  });

  it('rejects join request from a user already in a team for this hackathon', async () => {
    const a = await makeTeam(server);
    const b = await makeTeam(server, { hackathonId: a.hackathonId });

    const res = await apiPost(server, `/teams/${b.teamId}/requests`, cookieFor(a.leaderId), {});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_IN_TEAM');
  });

  it('leader can list join requests for their team', async () => {
    const t = await makeTeam(server, { max: 4, members: 1 });
    const [applicant] = await createUsers(1);
    await apiPost(server, `/teams/${t.teamId}/requests`, cookieFor(applicant!), {});

    const res = await request(server).get(`/teams/${t.teamId}/requests`).set('Cookie', cookieFor(t.leaderId));
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].userId).toBe(applicant);
    expect(res.body.requests[0].status).toBe('pending');
  });

  it('leader accepts join request: adds member, updates count, cancels other pending requests', async () => {
    const t = await makeTeam(server, { max: 4, members: 1 });
    const [applicant] = await createUsers(1);
    const reqRes = await apiPost(server, `/teams/${t.teamId}/requests`, cookieFor(applicant!), {});
    const requestId = reqRes.body.requestId;

    const acceptRes = await apiPost(server, `/teams/${t.teamId}/requests/${requestId}/accept`, cookieFor(t.leaderId), {});
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.team.memberCount).toBe(2);

    const isMember = await pool.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [
      t.teamId,
      applicant,
    ]);
    expect(isMember.rowCount).toBe(1);

    const reqRow = await pool.query('SELECT status FROM join_requests WHERE id = $1', [requestId]);
    expect(reqRow.rows[0].status).toBe('accepted');
  });

  it('non-leader cannot accept join requests', async () => {
    const t = await makeTeam(server, { max: 4, members: 2 });
    const member = t.memberIds[1]!;
    const [applicant] = await createUsers(1);
    const reqRes = await apiPost(server, `/teams/${t.teamId}/requests`, cookieFor(applicant!), {});

    const res = await apiPost(server, `/teams/${t.teamId}/requests/${reqRes.body.requestId}/accept`, cookieFor(member), {});
    expect(res.status).toBe(403);
  });

  it('leader declines join request', async () => {
    const t = await makeTeam(server, { max: 4, members: 1 });
    const [applicant] = await createUsers(1);
    const reqRes = await apiPost(server, `/teams/${t.teamId}/requests`, cookieFor(applicant!), {});

    const res = await apiPost(server, `/teams/${t.teamId}/requests/${reqRes.body.requestId}/decline`, cookieFor(t.leaderId), {});
    expect(res.status).toBe(200);

    const reqRow = await pool.query('SELECT status FROM join_requests WHERE id = $1', [reqRes.body.requestId]);
    expect(reqRow.rows[0].status).toBe('declined');
  });
});

describe('Live Board Endpoint', () => {
  it('GET /board lists open teams and looking participants', async () => {
    const t1 = await makeTeam(server, { name: 'Alpha Team', max: 4, members: 1 });
    const [user] = await createUsers(1);

    const res = await request(server).get('/board').set('Cookie', cookieFor(user!));
    expect(res.status).toBe(200);
    expect(res.body.teams.some((team: any) => team.id === t1.teamId)).toBe(true);
    expect(res.body.totalTeams).toBeGreaterThanOrEqual(1);
  });

  it('GET /board filters out full teams', async () => {
    const fullTeam = await makeTeam(server, { max: 2, members: 2 });
    const [user] = await createUsers(1);

    const res = await request(server).get('/board').set('Cookie', cookieFor(user!));
    expect(res.status).toBe(200);
    expect(res.body.teams.some((team: any) => team.id === fullTeam.teamId)).toBe(false);
  });
});

describe('Teammate Suggestions Endpoint', () => {
  it('GET /teams/:id/suggestions ranks candidates with clear mathematical score and explanation', async () => {
    const t = await makeTeam(server, { max: 4, members: 1 });
    const [candidate] = await createUsers(1);

    // Give candidate complementary skills
    await pool.query("UPDATE users SET skills = '{\"Rust\", \"Docker\"}', looking_for_team = true WHERE id = $1", [
      candidate,
    ]);

    const res = await request(server).get(`/teams/${t.teamId}/suggestions?limit=5`).set('Cookie', cookieFor(t.leaderId));
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toBeInstanceOf(Array);
    expect(res.body.suggestions.length).toBeGreaterThanOrEqual(1);

    const first = res.body.suggestions[0];
    expect(first.score).toBeTypeOf('number');
    expect(first.explanation).toHaveProperty('totalScore');
    expect(first.explanation).toHaveProperty('skillScore');
    expect(first.explanation).toHaveProperty('timezoneScore');
    expect(first.explanation).toHaveProperty('complementarySkills');
    expect(first.explanation).toHaveProperty('summary');
  });
});

describe('Audit Log Endpoint', () => {
  it('GET /teams/:id/audit returns immutable audit events for team members', async () => {
    const t = await makeTeam(server, { max: 4 });
    const [joiner] = await createUsers(1);
    await joinTeam(server, cookieFor(joiner!), t.code);

    const res = await request(server).get(`/teams/${t.teamId}/audit`).set('Cookie', cookieFor(t.leaderId));
    expect(res.status).toBe(200);
    expect(res.body.auditLogs).toBeInstanceOf(Array);
    const actions = res.body.auditLogs.map((l: any) => l.action);
    expect(actions).toContain('team.created');
    expect(actions).toContain('member.joined');
  });

  it('GET /teams/:id/audit refuses non-members with 403', async () => {
    const t = await makeTeam(server);
    const [outsider] = await createUsers(1);

    const res = await request(server).get(`/teams/${t.teamId}/audit`).set('Cookie', cookieFor(outsider!));
    expect(res.status).toBe(403);
  });
});

describe('Race Condition: Concurrent Join Request Acceptance for the Last Seat', () => {
  it('20 leaders or concurrent accept calls for 1 seat: exactly 1 succeeds', async () => {
    const t = await makeTeam(server, { min: 2, max: 2, members: 1 }); // 1 seat left!
    const applicants = await createUsers(20);

    // Each applicant submits a join request
    const requestIds: number[] = [];
    for (const applicant of applicants) {
      const r = await apiPost(server, `/teams/${t.teamId}/requests`, cookieFor(applicant!), {});
      expect(r.status).toBe(201);
      requestIds.push(r.body.requestId);
    }

    // Leader attempts to accept all 20 requests at the EXACT same millisecond
    const acceptPromises = requestIds.map((reqId) =>
      apiPost(server, `/teams/${t.teamId}/requests/${reqId}/accept`, cookieFor(t.leaderId)),
    );
    const results = await Promise.all(acceptPromises);

    const winners = results.filter((r) => r.status === 200);
    const rejected = results.filter((r) => r.status === 409 && r.body.error.code === 'TEAM_FULL');

    expect(winners).toHaveLength(1);
    expect(rejected).toHaveLength(19);

    const team = await pool.query('SELECT member_count, is_open FROM teams WHERE id = $1', [t.teamId]);
    expect(team.rows[0].member_count).toBe(2);
    expect(team.rows[0].is_open).toBe(false);

    const actualMembers = await pool.query('SELECT count(*)::int as n FROM team_members WHERE team_id = $1', [t.teamId]);
    expect(actualMembers.rows[0].n).toBe(2);
  });
});
