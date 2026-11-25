import test from 'node:test';
import assert from 'node:assert/strict';
import { createMailer } from '../src/mailer.js';

const msg = { to: 'a@b.com', subject: 'Hello', text: 'plain text', html: '<p>html</p>' };

test('Brevo: sends the expected HTTPS request', async () => {
  let call;
  const fetchFn = async (url, init) => { call = { url, init }; return { ok: true, status: 201, text: async () => '' }; };
  const send = createMailer({ brevoKey: 'KEY123', from: 'AutoCARe <noreply@example.com>' }, { fetchFn });
  await send(msg);
  assert.equal(call.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['api-key'], 'KEY123');
  const body = JSON.parse(call.init.body);
  assert.deepEqual(body.sender, { name: 'AutoCARe', email: 'noreply@example.com' });
  assert.deepEqual(body.to, [{ email: 'a@b.com' }]);
  assert.equal(body.subject, 'Hello');
  assert.equal(body.textContent, 'plain text');
  assert.equal(body.htmlContent, '<p>html</p>');
});

test('Brevo: a refusal is reported with its status', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, text: async () => '{"message":"Key not found"}' });
  const send = createMailer({ brevoKey: 'bad', from: 'a@b.com' }, { fetchFn });
  await assert.rejects(send(msg), /HTTP 401.*Key not found/);
});

test('Brevo: needs MAIL_FROM', async () => {
  const send = createMailer({ brevoKey: 'KEY' }, { fetchFn: async () => { throw new Error('must not be called'); } });
  await assert.rejects(send(msg), /MAIL_FROM/);
});

test('SMTP: uses nodemailer, encrypted from the start only on port 465, one transport reused', async () => {
  const made = [];
  const sent = [];
  const loadNodemailer = async () => ({
    default: { createTransport: (opts) => { made.push(opts); return { sendMail: async (m) => { sent.push(m); } }; } },
  });
  const settings = { smtp: { host: 'smtp.gmail.com', port: 465, user: 'me@gmail.com', pass: 'app-pass' } };
  const send = createMailer(settings, { loadNodemailer });
  await send(msg);
  await send(msg);
  assert.equal(made.length, 1);
  assert.equal(made[0].host, 'smtp.gmail.com');
  assert.equal(made[0].secure, true);
  assert.deepEqual(made[0].auth, { user: 'me@gmail.com', pass: 'app-pass' });
  assert.ok(made[0].connectionTimeout <= 15000, 'must fail fast when the port is blocked');
  assert.equal(sent[0].from, 'me@gmail.com');
  assert.equal(sent[0].to, 'a@b.com');

  const made587 = [];
  const send587 = createMailer(
    { from: 'AutoCARe <x@y.com>', smtp: { host: 'h', port: 587, user: 'u', pass: 'p' } },
    { loadNodemailer: async () => ({ createTransport: (o) => { made587.push(o); return { sendMail: async (m) => { sent.push(m); } }; } }) }
  );
  await send587(msg);
  assert.equal(made587[0].secure, false);
  assert.equal(sent.at(-1).from, 'AutoCARe <x@y.com>');
});

test('SMTP: a missing nodemailer package gives a helpful error', async () => {
  const send = createMailer({ smtp: { host: 'h', port: 465 } }, { loadNodemailer: async () => { throw new Error('Cannot find package'); } });
  await assert.rejects(send(msg), /npm install/);
});

test('Brevo is preferred when both are set', async () => {
  let used = '';
  const send = createMailer(
    { brevoKey: 'K', from: 'a@b.com', smtp: { host: 'h', port: 465 } },
    { fetchFn: async () => { used = 'brevo'; return { ok: true, status: 201, text: async () => '' }; }, loadNodemailer: async () => { used = 'smtp'; throw new Error('no'); } }
  );
  await send(msg);
  assert.equal(used, 'brevo');
});

test('nothing set: prints the email in development, refuses in production', async () => {
  const lines = [];
  const dev = createMailer({}, { log: (text) => lines.push(text) });
  await dev(msg);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('plain text') && lines[0].includes('a@b.com'));

  const prod = createMailer({ isProduction: true }, { log: (text) => lines.push(text) });
  await assert.rejects(prod(msg), /Email is not set up/);
  assert.equal(lines.length, 1, 'production must never print the message');
});
