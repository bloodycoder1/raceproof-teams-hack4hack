import { z } from 'zod';
import { isValidTimezone } from '../lib/timezone.js';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const name = z.string().trim().min(1).max(80);
const timezone = z.string().max(64).refine(isValidTimezone, 'Unknown IANA time zone (e.g. Asia/Kolkata)');

// trim + lowercase + dedupe so "React", " react " and "REACT" are one skill
const skills = z
  .array(z.string().trim().toLowerCase().min(1).max(30))
  .max(15)
  .transform((list) => [...new Set(list)]);

export const registerSchema = z.object({
  email,
  password,
  name,
  timezone,
  skills: skills.default([]),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const updateProfileSchema = z
  .object({
    name: name.optional(),
    timezone: timezone.optional(),
    skills: skills.optional(),
    lookingForTeam: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
