import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { registerAgent, resetDb, validUser } from './helpers.js';

const app = createApp();

beforeEach(resetDb);
afterAll(async () => {
  await pool.end();
});

const cookiesOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []);

describe('POST /auth/register', () => {
  it('creates a user, returns 201 and sets an httpOnly auth cookie', async () => {
    const res = await request(app).post('/auth/register').send(validUser());
    expect(res.status).toBe(201);
    expect(res.body.user.id).toBeTypeOf('number');
    const tokenCookie = cookiesOf(res).find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toContain('HttpOnly');
  });

  it('never returns the password or its hash', async () => {
    const res = await request(app).post('/auth/register').send(validUser());
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('stores the password hashed, not in plain text', async () => {
    const body = validUser();
    await request(app).post('/auth/register').send(body);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [body.email]);
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
  });

  it('computes the UTC offset from the time zone', async () => {
    const res = await request(app).post('/auth/register').send(validUser({ timezone: 'Asia/Kolkata' }));
    expect(res.body.user.utcOffsetMin).toBe(330);
  });

  it('rejects a duplicate email with 409', async () => {
    const body = validUser();
    await request(app).post('/auth/register').send(body);
    const res = await request(app).post('/auth/register').send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('treats emails case-insensitively', async () => {
    const body = validUser({ email: 'Case@Example.com' });
    await request(app).post('/auth/register').send(body);
    const res = await request(app).post('/auth/register').send({ ...body, email: 'case@example.com' });
    expect(res.status).toBe(409);
  });

  it.each([
    ['invalid email', { email: 'not-an-email' }],
    ['short password', { password: 'short' }],
    ['password over 128 chars', { password: 'x'.repeat(129) }],
    ['empty name', { name: '   ' }],
    ['unknown time zone', { timezone: 'Mars/Olympus' }],
    ['too many skills', { skills: Array.from({ length: 16 }, (_, i) => `skill${i}`) }],
  ])('rejects %s with 400', async (_label, override) => {
    const res = await request(app).post('/auth/register').send(validUser(override));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('normalizes skills (trim, lowercase, dedupe)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send(validUser({ skills: ['  React ', 'react', 'NODE'] }));
    expect(res.body.user.skills).toEqual(['react', 'node']);
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials and sets a cookie', async () => {
    const { body } = await registerAgent(app);
    const res = await request(app).post('/auth/login').send({ email: body.email, password: body.password });
    expect(res.status).toBe(200);
    expect(cookiesOf(res).some((c) => c.startsWith('token='))).toBe(true);
  });

  it('rejects a wrong password with 401', async () => {
    const { body } = await registerAgent(app);
    const res = await request(app).post('/auth/login').send({ email: body.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('gives the same error for an unknown email as for a wrong password', async () => {
    const { body } = await registerAgent(app);
    const wrongPw = await request(app).post('/auth/login').send({ email: body.email, password: 'wrong-password' });
    const noUser = await request(app).post('/auth/login').send({ email: 'ghost@example.com', password: 'whatever123' });
    expect(noUser.status).toBe(401);
    expect(noUser.body).toEqual(wrongPw.body);
  });
});

describe('authentication on protected routes', () => {
  it('GET /users/me without a cookie returns 401', async () => {
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
  });

  it('GET /users/me with a tampered token returns 401', async () => {
    const res = await request(app).get('/users/me').set('Cookie', 'token=abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('GET /users/me returns the logged-in user', async () => {
    const { agent, body } = await registerAgent(app);
    const res = await agent.get('/users/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(body.email.toLowerCase());
  });

  it('logout clears the cookie so /users/me is 401 again', async () => {
    const { agent } = await registerAgent(app);
    const out = await agent.post('/auth/logout');
    expect(out.status).toBe(204);
    const res = await agent.get('/users/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /users/me', () => {
  it('updates skills, time zone and the looking-for-team flag', async () => {
    const { agent } = await registerAgent(app);
    const res = await agent
      .patch('/users/me')
      .send({ skills: ['python', 'design'], timezone: 'America/New_York', lookingForTeam: false });
    expect(res.status).toBe(200);
    expect(res.body.user.skills).toEqual(['python', 'design']);
    expect(res.body.user.lookingForTeam).toBe(false);
    expect([-300, -240]).toContain(res.body.user.utcOffsetMin); // EST or EDT
  });

  it('only changes the fields that were sent', async () => {
    const { agent } = await registerAgent(app, { name: 'Original Name' });
    const res = await agent.patch('/users/me').send({ skills: ['go'] });
    expect(res.body.user.name).toBe('Original Name');
  });

  it('rejects an empty update with 400', async () => {
    const { agent } = await registerAgent(app);
    const res = await agent.patch('/users/me').send({});
    expect(res.status).toBe(400);
  });

  it('requires login', async () => {
    const res = await request(app).patch('/users/me').send({ name: 'x' });
    expect(res.status).toBe(401);
  });
});
