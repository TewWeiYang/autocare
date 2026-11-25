// "Forgot password" with a one-time code (OTP) sent by email.
// This file holds the rules. The database, email sender and clock are passed in, so the same
// code runs in the server and in the tests.
//
// Rules:
//  - The code has 6 digits, works for 10 minutes and can be used once.
//  - Only a hash of the code is stored.
//  - A wrong code can be tried 5 times, then that code is dead.
//  - One new code per minute and 5 per hour for each account. A new code cancels the old one.
//  - The answers never reveal whether an email address has an account.
import * as v from './validate.js';
import { HttpError } from './errors.js';
import { generateOtp, hashOtp, sameHash } from './security.js';
import { passwordChangedEmail, resetCodeEmail } from './emailTemplates.js';

export const OTP_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_SECONDS = 60;
export const MAX_CODES_PER_HOUR = 5;

// One message for every failure (no account, wrong code, expired, too many tries), so an
// attacker learns nothing from it.
export const BAD_CODE = 'That code is incorrect or has expired. Check your email, or request a new code.';

// Times are written and compared as UTC text, for example '2026-11-25 09:30:00'.
// That way the result does not depend on the database's time zone.
const stamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

const FIND_USER = 'SELECT user_id, full_name, email FROM users WHERE LOWER(email) = ? AND is_active = TRUE LIMIT 1';

export function createPasswordReset({ q, sendMail, hashPassword, secret, now = () => new Date() }) {
  const secondsAgo = (seconds) => stamp(new Date(now().getTime() - seconds * 1000));
  const count = async (sql, params) => Number((await q(sql, params))[0].n);

  // Step 1. Returns 'sent', 'throttled' or 'unknown'. The caller shows the same message for all three.
  async function requestCode(rawEmail) {
    const email = v.email(rawEmail);
    const [user] = await q(FIND_USER, [email]);
    if (!user) return 'unknown';

    const recent = await count('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?', [user.user_id, secondsAgo(RESEND_SECONDS)]);
    const lastHour = await count('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?', [user.user_id, secondsAgo(3600)]);
    if (recent > 0 || lastHour >= MAX_CODES_PER_HOUR) return 'throttled';

    const otp = generateOtp();
    const t = now();
    // Only the newest code may work, so cancel the earlier ones.
    await q('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [stamp(t), user.user_id]);
    await q('INSERT INTO password_resets (user_id, otp_hash, expires_at, created_at) VALUES (?, ?, ?, ?)', [
      user.user_id,
      hashOtp(secret, user.user_id, otp),
      stamp(new Date(t.getTime() + OTP_MINUTES * 60 * 1000)),
      stamp(t),
    ]);
    // Housekeeping: remove rows older than a day. Not important, so a failure here is ignored.
    await q('DELETE FROM password_resets WHERE created_at < ?', [secondsAgo(24 * 3600)]).catch(() => {});

    await sendMail(resetCodeEmail({ to: user.email, name: user.full_name, otp, minutes: OTP_MINUTES }));
    return 'sent';
  }

  // Step 2. Checks the code and sets the new password. Throws HttpError(400) on any problem.
  async function resetPassword(rawEmail, rawOtp, rawPassword) {
    const email = v.email(rawEmail);
    const otp = String(rawOtp ?? '').trim();
    if (!/^\d{6}$/.test(otp)) throw new HttpError(400, 'Enter the 6-digit code from your email.');
    const password = v.password(rawPassword);

    const [user] = await q(FIND_USER, [email]);
    if (!user) throw new HttpError(400, BAD_CODE);

    const t = stamp(now());
    const [row] = await q(
      'SELECT reset_id, otp_hash FROM password_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY reset_id DESC LIMIT 1',
      [user.user_id, t]
    );
    if (!row) throw new HttpError(400, BAD_CODE);

    // Count the try BEFORE comparing. The "attempts < MAX" test and the +1 are one statement, so
    // even many guesses sent at the same moment cannot get more than MAX tries in total.
    const counted = await q('UPDATE password_resets SET attempts = attempts + 1 WHERE reset_id = ? AND attempts < ?', [row.reset_id, MAX_ATTEMPTS]);
    if (!counted.affectedRows) throw new HttpError(400, BAD_CODE);
    if (!sameHash(row.otp_hash, hashOtp(secret, user.user_id, otp))) throw new HttpError(400, BAD_CODE);

    // Use up the code. Of two requests with the right code at the same moment, only one gets here.
    const used = await q('UPDATE password_resets SET used_at = ? WHERE reset_id = ? AND used_at IS NULL', [t, row.reset_id]);
    if (!used.affectedRows) throw new HttpError(400, BAD_CODE);

    await q('UPDATE users SET password_hash = ? WHERE user_id = ?', [await hashPassword(password), user.user_id]);
    await q('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [t, user.user_id]);

    try {
      await sendMail(passwordChangedEmail({ to: user.email, name: user.full_name }));
    } catch { /* the password is already changed, so a failed notice must not turn this into an error */ }
    return 'changed';
  }

  return { requestCode, resetPassword };
}
