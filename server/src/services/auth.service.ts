import { pool } from '../db/pool.js';
import { conflict, notFound, unauthorized } from '../lib/errors.js';
import { getDummyHash, hashPassword, verifyPassword } from '../lib/password.js';
import { utcOffsetMinutes } from '../lib/timezone.js';
import type { RegisterInput, UpdateProfileInput } from '../schemas/user.js';

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  timezone: string;
  utc_offset_min: number;
  skills: string[];
  looking_for_team: boolean;
  created_at: Date;
}

/** The only shape of a user that ever leaves the server (no password hash). */
export interface PublicUser {
  id: number;
  email: string;
  name: string;
  timezone: string;
  utcOffsetMin: number;
  skills: string[];
  lookingForTeam: boolean;
  createdAt: string;
}

const toPublic = (u: UserRow): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  timezone: u.timezone,
  utcOffsetMin: u.utc_offset_min,
  skills: u.skills,
  lookingForTeam: u.looking_for_team,
  createdAt: u.created_at.toISOString(),
});

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (email, password_hash, name, timezone, utc_offset_min, skills)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [input.email, passwordHash, input.name, input.timezone, utcOffsetMinutes(input.timezone), input.skills],
    );
    return toPublic(rows[0]!);
  } catch (err: any) {
    if (err.code === '23505') throw conflict('Email already registered', 'EMAIL_TAKEN');
    throw err;
  }
}

export async function authenticate(email: string, password: string): Promise<PublicUser> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];

  // Always run one argon2 verify, whether or not the user exists.
  const ok = await verifyPassword(user?.password_hash ?? (await getDummyHash()), password).catch(() => false);
  if (!user || !ok) throw unauthorized('Invalid email or password'); // same message for both cases
  return toPublic(user);
}

export async function getUserById(id: number): Promise<PublicUser> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('User not found');
  return toPublic(rows[0]);
}

export async function updateUser(id: number, input: UpdateProfileInput): Promise<PublicUser> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET
       name             = COALESCE($2, name),
       timezone         = COALESCE($3, timezone),
       utc_offset_min   = COALESCE($4, utc_offset_min),
       skills           = COALESCE($5, skills),
       looking_for_team = COALESCE($6, looking_for_team)
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.name ?? null,
      input.timezone ?? null,
      input.timezone ? utcOffsetMinutes(input.timezone) : null,
      input.skills ?? null,
      input.lookingForTeam ?? null,
    ],
  );
  if (!rows[0]) throw notFound('User not found');
  return toPublic(rows[0]);
}
