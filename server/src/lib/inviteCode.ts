import { createHash, randomBytes } from 'node:crypto';

// 32 symbols (no I, O, 0, 1 to avoid mix-ups). 32 divides 256, so `byte & 31` is perfectly uniform.
// 10 symbols = 50 bits of entropy: ~1.1e15 possible codes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 10;

export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const b of bytes) code += ALPHABET.charAt(b & 31);
  return code;
}

/** "ABCDE23456" -> "ABCDE-23456" (for showing to humans). */
export const formatInviteCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

/** Accepts lowercase, spaces and dashes: "abcde-23456" -> "ABCDE23456". */
export const normalizeInviteCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Only this hash is stored. A database leak doesn't reveal usable codes.
 * Plain SHA-256 (no salt, no slow hash) is fine because the code itself has 50 random bits.
 */
export const hashInviteCode = (normalized: string): Buffer => createHash('sha256').update(normalized).digest();
