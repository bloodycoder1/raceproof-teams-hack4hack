import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Rate limiting is switched off for the other test files. This file turns it on BEFORE the app is
// imported, so env.ts reads these values. All imports are dynamic for that reason.
process.env.RATE_LIMIT_DISABLED = 'false';
process.env.JOIN_ATTEMPT_LIMIT = '3';

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { resetDb, createUsers, cookieFor, joinTeam, makeTeam } = await import('./helpers.js');

let server: Server;
beforeAll(async () => {
  server = createApp().listen(0);
  await resetDb();
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

describe('invite-code brute-force protection', () => {
  it('blocks a user after repeated wrong guesses (429), but not other users', async () => {
    const [guesser, honest] = await createUsers(2);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await joinTeam(server, cookieFor(guesser!), 'AAAAA-AAAA' + 'ABCDE'[i], randomUUID());
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([404, 404, 404]);
    expect(statuses.slice(3)).toEqual([429, 429]);

    // someone else is unaffected: the limit is per user (and looser per IP)
    const t = await makeTeam(server, { max: 4, members: 1 });
    expect((await joinTeam(server, cookieFor(honest!), t.code)).status).toBe(200);
  });

  it('successful joins do not count against the limit', async () => {
    const hackathonId = (await makeTeam(server, { max: 4 })).hackathonId;
    for (let i = 0; i < 5; i++) {
      const t = await makeTeam(server, { max: 4, members: 1 });
      const [u] = await createUsers(1);
      // each user joins one team successfully; none of these should ever return 429
      const res = await joinTeam(server, cookieFor(u!), t.code);
      expect(res.status).not.toBe(429);
    }
    expect(hackathonId).toBeTypeOf('number');
  });
});
