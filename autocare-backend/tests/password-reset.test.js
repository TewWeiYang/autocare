import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAD_CODE, MAX_ATTEMPTS, MAX_CODES_PER_HOUR, OTP_MINUTES, createPasswordReset } from '../src/passwordReset.js';
import { generateOtp, hashOtp, passwordFingerprint, sameHash } from '../src/security.js';
import { parseFrom, passwordChangedEmail, resetCodeEmail } from '../src/emailTemplates.js';

const SECRET = 'test-secret-test-secret';
const EMAIL = 'demo@autocare.example';

// ---- Pure helpers (run on every Node version) ------------------------------------------

test('generateOtp always gives 6 digits, with leading zeros kept', () => {
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const code = generateOtp();
    assert.match(code, /^\d{6}$/);
    seen.add(code);
  }
  assert.ok(seen.size > 2500, 'codes should be well spread');
});

test('hashOtp depends on the secret, the user and the code', () => {
  const base = hashOtp(SECRET, 1, '123456');
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(base, hashOtp(SECRET, 1, '123456'));
  assert.notEqual(base, hashOtp(SECRET, 2, '123456'));
  assert.notEqual(base, hashOtp(SECRET, 1, '123457'));
  assert.notEqual(base, hashOtp('another-secret-another', 1, '123456'));
  assert.ok(sameHash(base, hashOtp(SECRET, 1, '123456')));
  assert.ok(!sameHash(base, hashOtp(SECRET, 1, '654321')));
  assert.ok(!sameHash(base, 'abcd'));
});

test('passwordFingerprint changes when the password hash changes', () => {
  const a = passwordFingerprint(SECRET, '$2a$10$oldhash');
  assert.equal(a, passwordFingerprint(SECRET, '$2a$10$oldhash'));
  assert.notEqual(a, passwordFingerprint(SECRET, '$2a$10$newhash'));
  assert.notEqual(a, passwordFingerprint('another-secret-another', '$2a$10$oldhash'));
});

test('emails contain the code and escape the name', () => {
  const mail = resetCodeEmail({ to: EMAIL, name: '<b>Eve</b> Smith', otp: '042917', minutes: 10 });
  assert.equal(mail.to, EMAIL);
  assert.ok(mail.text.includes('042917') && mail.html.includes('042917'));
  assert.ok(mail.text.includes('10 minutes'));
  assert.ok(!mail.html.includes('<b>Eve'), 'HTML in a name must not be passed through');
  assert.ok(mail.html.includes('&lt;b&gt;Eve&lt;/b&gt;'));
  assert.ok(!mail.subject.includes('042917'), 'the code stays out of the subject line');
  assert.match(passwordChangedEmail({ to: EMAIL, name: '' }).text, /Hi there/);
});

test('parseFrom reads "Name <address>" and a bare address', () => {
  assert.deepEqual(parseFrom('AutoCARe <noreply@example.com>'), { name: 'AutoCARe', email: 'noreply@example.com' });
  assert.deepEqual(parseFrom('"Auto, CARe" <a@b.com>'), { name: 'Auto, CARe', email: 'a@b.com' });
  assert.deepEqual(parseFrom('<a@b.com>'), { name: 'AutoCARe', email: 'a@b.com' });
  assert.deepEqual(parseFrom('a@b.com'), { name: 'AutoCARe', email: 'a@b.com' });
});

// ---- The reset rules, run against a real SQL engine ------------------------------------
// The tests use Node's built-in SQLite (Node 22.5 or newer) and the exact SQL the server runs.
// On an older Node they are skipped.

const sqlite = await import('node:sqlite').catch(() => null);
const skip = sqlite ? false : 'needs Node 22.5 or newer (node:sqlite)';

function setup() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (user_id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, email TEXT NOT NULL,
                        password_hash TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE password_resets (reset_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, otp_hash TEXT NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
    INSERT INTO users (full_name, email, password_hash) VALUES ('Wei Yang', '${EMAIL}', 'old-hash');
    INSERT INTO users (full_name, email, password_hash, is_active) VALUES ('Gone Person', 'gone@autocare.example', 'x', 0);
  `);
  // Same shape as the real q(): rows for SELECT, { affectedRows, insertId } for everything else.
  const q = async (sql, params = []) => {
    const stmt = db.prepare(sql);
    if (/^\s*select/i.test(sql)) return stmt.all(...params);
    const r = stmt.run(...params);
    return { affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) };
  };
  const mails = [];
  let clock = new Date('2026-11-25T01:00:00Z');
  const svc = createPasswordReset({
    q,
    secret: SECRET,
    sendMail: async (m) => { mails.push(m); },
    hashPassword: async (p) => `hashed:${p}`,
    now: () => clock,
  });
  return {
    db,
    svc,
    mails,
    advance: (seconds) => { clock = new Date(clock.getTime() + seconds * 1000); },
    codeOf: (mail) => /\n(\d{6})\n/.exec(mail.text)[1],
    password: () => db.prepare('SELECT password_hash AS h FROM users WHERE user_id = 1').get().h,
  };
}
const rejectsBad = (promise) => assert.rejects(promise, (err) => err.status === 400 && err.message === BAD_CODE);
const wrongCodeFor = (code) => (code === '000000' ? '111111' : '000000');

test('unknown email: nothing is stored or sent', { skip }, async () => {
  const t = setup();
  assert.equal(await t.svc.requestCode('nobody@autocare.example'), 'unknown');
  assert.equal(t.mails.length, 0);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM password_resets').get().n, 0);
});

test('inactive account gets no code', { skip }, async () => {
  const t = setup();
  assert.equal(await t.svc.requestCode('gone@autocare.example'), 'unknown');
  assert.equal(t.mails.length, 0);
});

test('known email: only a hash of the code is stored, and one email goes out', { skip }, async () => {
  const t = setup();
  assert.equal(await t.svc.requestCode(' DEMO@AutoCARe.example '), 'sent');
  assert.equal(t.mails.length, 1);
  assert.equal(t.mails[0].to, EMAIL);
  const code = t.codeOf(t.mails[0]);
  const row = t.db.prepare('SELECT * FROM password_resets').get();
  assert.notEqual(row.otp_hash, code);
  assert.equal(row.otp_hash, hashOtp(SECRET, 1, code));
  assert.equal(row.created_at, '2026-11-25 01:00:00');
  assert.equal(row.expires_at, `2026-11-25 01:${String(OTP_MINUTES).padStart(2, '0')}:00`);
  assert.equal(row.attempts, 0);
  assert.equal(row.used_at, null);
});

test('correct code changes the password, and only once', { skip }, async () => {
  const t = setup();
  await t.svc.requestCode(EMAIL);
  const code = t.codeOf(t.mails[0]);
  assert.equal(await t.svc.resetPassword(EMAIL, code, 'NewPass123'), 'changed');
  assert.equal(t.password(), 'hashed:NewPass123');
  assert.equal(t.mails.length, 2);
  assert.equal(t.mails[1].subject, 'Your AutoCARe password was changed');
  await rejectsBad(t.svc.resetPassword(EMAIL, code, 'Another123'));
  assert.equal(t.password(), 'hashed:NewPass123');
});

test('a numeric code from JSON is accepted', { skip }, async () => {
  const t = setup();
  await t.svc.requestCode(EMAIL);
  const code = t.codeOf(t.mails[0]);
  // Codes that start with 0 would lose it as a number, so only a string can match them.
  if (code.startsWith('0')) return;
  assert.equal(await t.svc.resetPassword(EMAIL, Number(code), 'NewPass123'), 'changed');
});

test('a second request within a minute is throttled; a new code cancels the old one', { skip }, async () => {
  const t = setup();
  assert.equal(await t.svc.requestCode(EMAIL), 'sent');
  assert.equal(await t.svc.requestCode(EMAIL), 'throttled');
  assert.equal(t.mails.length, 1);
  t.advance(61);
  assert.equal(await t.svc.requestCode(EMAIL), 'sent');
  assert.equal(t.mails.length, 2);
  const rows = t.db.prepare('SELECT used_at FROM password_resets ORDER BY reset_id').all();
  assert.notEqual(rows[0].used_at, null, 'the earlier code is cancelled');
  assert.equal(rows[1].used_at, null);
  const [first, second] = t.mails.map(t.codeOf);
  if (first !== second) await rejectsBad(t.svc.resetPassword(EMAIL, first, 'NewPass123'));
  assert.equal(await t.svc.resetPassword(EMAIL, second, 'NewPass123'), 'changed');
});

test(`at most ${MAX_CODES_PER_HOUR} codes per hour for one account`, { skip }, async () => {
  const t = setup();
  for (let i = 0; i < MAX_CODES_PER_HOUR; i++) {
    assert.equal(await t.svc.requestCode(EMAIL), 'sent');
    t.advance(61);
  }
  assert.equal(await t.svc.requestCode(EMAIL), 'throttled');
  assert.equal(t.mails.length, MAX_CODES_PER_HOUR);
  t.advance(3600);
  assert.equal(await t.svc.requestCode(EMAIL), 'sent');
});

test(`wrong code: ${MAX_ATTEMPTS} tries, then even the right code is refused`, { skip }, async () => {
  const t = setup();
  await t.svc.requestCode(EMAIL);
  const code = t.codeOf(t.mails[0]);
  for (let i = 0; i < MAX_ATTEMPTS; i++) await rejectsBad(t.svc.resetPassword(EMAIL, wrongCodeFor(code), 'NewPass123'));
  await rejectsBad(t.svc.resetPassword(EMAIL, code, 'NewPass123'));
  assert.equal(t.db.prepare('SELECT attempts FROM password_resets').get().attempts, MAX_ATTEMPTS);
  assert.equal(t.password(), 'old-hash');
});

test('the last allowed try can still succeed', { skip }, async () => {
  const t = setup();
  await t.svc.requestCode(EMAIL);
  const code = t.codeOf(t.mails[0]);
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await rejectsBad(t.svc.resetPassword(EMAIL, wrongCodeFor(code), 'NewPass123'));
  assert.equal(await t.svc.resetPassword(EMAIL, code, 'NewPass123'), 'changed');
});

test('expired code is refused, a code just inside its time still works', { skip }, async () => {
  const late = setup();
  await late.svc.requestCode(EMAIL);
  late.advance(OTP_MINUTES * 60 + 1);
  await rejectsBad(late.svc.resetPassword(EMAIL, late.codeOf(late.mails[0]), 'NewPass123'));

  const inTime = setup();
  await inTime.svc.requestCode(EMAIL);
  inTime.advance(OTP_MINUTES * 60 - 1);
  assert.equal(await inTime.svc.resetPassword(EMAIL, inTime.codeOf(inTime.mails[0]), 'NewPass123'), 'changed');
});

test('every failure gives the same message, so nothing is revealed', { skip }, async () => {
  const t = setup();
  await rejectsBad(t.svc.resetPassword('nobody@autocare.example', '123456', 'NewPass123')); // no account
  await rejectsBad(t.svc.resetPassword(EMAIL, '123456', 'NewPass123'));                     // account, but no code requested
  await t.svc.requestCode(EMAIL);
  await rejectsBad(t.svc.resetPassword(EMAIL, wrongCodeFor(t.codeOf(t.mails[0])), 'NewPass123')); // wrong code
});

test('bad input gets a clear message', { skip }, async () => {
  const t = setup();
  await assert.rejects(t.svc.requestCode('not-an-email'), /valid email/);
  await assert.rejects(t.svc.resetPassword(EMAIL, '12ab56', 'NewPass123'), /6-digit/);
  await assert.rejects(t.svc.resetPassword(EMAIL, '12345', 'NewPass123'), /6-digit/);
  await assert.rejects(t.svc.resetPassword(EMAIL, '123456', 'short'), /8 to 72/);
});

test('two submissions with the right code at the same moment: only one wins', { skip }, async () => {
  const t = setup();
  await t.svc.requestCode(EMAIL);
  const code = t.codeOf(t.mails[0]);
  const results = await Promise.allSettled([
    t.svc.resetPassword(EMAIL, code, 'Aaaaaaaa1'),
    t.svc.resetPassword(EMAIL, code, 'Bbbbbbbb1'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  assert.match(t.password(), /^hashed:[AB]b?a?/);
});

test('a failed "password changed" email does not undo the reset', { skip }, async () => {
  const t = setup();
  await t.svc.requestCode(EMAIL);
  const code = t.codeOf(t.mails[0]);
  const svc = createPasswordReset({
    q: async (sql, params = []) => {
      const stmt = t.db.prepare(sql);
      if (/^\s*select/i.test(sql)) return stmt.all(...params);
      const r = stmt.run(...params);
      return { affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) };
    },
    secret: SECRET,
    sendMail: async () => { throw new Error('mail server down'); },
    hashPassword: async (p) => `hashed:${p}`,
    now: () => new Date('2026-11-25T01:00:30Z'),
  });
  assert.equal(await svc.resetPassword(EMAIL, code, 'NewPass123'), 'changed');
  assert.equal(t.password(), 'hashed:NewPass123');
});

test('the test table has the same columns as sql/02-password-reset.sql', { skip }, () => {
  const sql = readFileSync(new URL('../sql/02-password-reset.sql', import.meta.url), 'utf8');
  const body = /CREATE TABLE IF NOT EXISTS password_resets \(([\s\S]*?)\n\);/.exec(sql)[1];
  const inFile = body.split('\n').map((line) => /^\s{2}([a-z_]+)\s+[A-Z]/.exec(line)?.[1]).filter(Boolean).sort();
  const inTest = setup().db.prepare('PRAGMA table_info(password_resets)').all().map((c) => c.name).sort();
  assert.deepEqual(inFile, inTest);
});
