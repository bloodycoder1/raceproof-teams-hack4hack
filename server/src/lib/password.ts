import argon2 from 'argon2';

export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });

export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain);

// Used when the email doesn't exist, so "unknown email" and "wrong password"
// take about the same time and can't be told apart by timing.
let dummyHash: Promise<string> | undefined;
export const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));
