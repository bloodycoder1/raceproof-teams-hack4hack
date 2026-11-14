import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { cookieFor, createUsers, makeTeam, resetDb } from './helpers.js';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => {
    server.on('listening', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        port = addr.port;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

beforeEach(resetDb);

describe('Chaos & Resilience: Mid-Flight Network Aborts & Failures', () => {
  it('client destroys socket mid-join: transaction rolls back and database remains uncorrupted', async () => {
    const t = await makeTeam(server, { min: 2, max: 3, members: 1 });
    const [joiner] = await createUsers(1);

    // Verify initial state
    const beforeTeam = await pool.query('SELECT member_count, is_open FROM teams WHERE id = $1', [t.teamId]);
    expect(beforeTeam.rows[0].member_count).toBe(1);

    // Send HTTP POST request and forcefully abort / destroy socket mid-flight
    await new Promise<void>((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/teams/join-by-code',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieFor(joiner!),
          'Idempotency-Key': randomUUID(),
        },
      });

      req.on('error', () => {});
      // Write partial body and destroy connection abruptly
      req.write(JSON.stringify({ code: t.code }).slice(0, 15));
      setTimeout(() => {
        req.destroy(new Error('Chaos: Client connection killed mid-flight'));
        resolve();
      }, 5);
    });

    // Wait a brief moment for PostgreSQL connection cleanup
    await new Promise((r) => setTimeout(r, 100));

    // Verify database invariants: zero corruption
    const afterTeam = await pool.query('SELECT member_count, is_open FROM teams WHERE id = $1', [t.teamId]);
    const members = await pool.query('SELECT count(*)::int as n FROM team_members WHERE team_id = $1', [t.teamId]);
    const audit = await pool.query(
      "SELECT count(*)::int as n FROM audit_log WHERE team_id = $1 AND action = 'member.joined'",
      [t.teamId],
    );

    // Assert that no half-written or phantom state exists
    expect(afterTeam.rows[0].member_count).toBe(1);
    expect(members.rows[0].n).toBe(1);
    expect(audit.rows[0].n).toBe(0);
    expect(afterTeam.rows[0].is_open).toBe(true);

    // Assert that team is still 100% operational and healthy for subsequent joiners
    const [legitJoiner] = await createUsers(1);
    const legitReq = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/teams/join-by-code',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieFor(legitJoiner!),
        'Idempotency-Key': randomUUID(),
      },
    });

    const status = await new Promise<number>((resolve) => {
      legitReq.on('response', (res) => resolve(res.statusCode || 500));
      legitReq.end(JSON.stringify({ code: t.code }));
    });

    expect(status).toBe(200);

    const finalMembers = await pool.query('SELECT count(*)::int as n FROM team_members WHERE team_id = $1', [t.teamId]);
    expect(finalMembers.rows[0].n).toBe(2);
  });
});
