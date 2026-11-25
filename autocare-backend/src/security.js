// Small security helpers. Only Node's built-in crypto is used, so this file has no dependencies.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_DIGITS = 6;

// A random 6-digit code, for example "042917". randomInt is cryptographically secure.
export const generateOtp = () => String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0');

// Only this hash is saved in the database, never the code. The user id is part of the input,
// so a hash copied from one account's row is no use for another account.
export const hashOtp = (secret, userId, otp) =>
  createHmac('sha256', secret).update(`pwreset:${userId}:${otp}`).digest('hex');

// Compares two hex hashes without leaking, through timing, how many characters matched.
export function sameHash(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

// A short fingerprint of the stored password hash. It is placed inside the login token, so
// when the password changes, every token issued before the change stops working.
export const passwordFingerprint = (secret, passwordHash) =>
  createHmac('sha256', secret).update(`pv:${passwordHash}`).digest('hex').slice(0, 16);
