import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { config } from '../config.js';
import { createMailer } from '../mailer.js';
import { createPasswordReset } from '../passwordReset.js';
import { rateLimit } from '../rateLimit.js';

export const router = Router();

const sender = createMailer({ ...config.mail, isProduction: config.isProduction });

// Emails are sent in the background and never throw. If sending were part of the request,
// the response time would show whether the address has an account.
const sendMail = (message) => {
  sender(message).catch((err) => console.error(`Could not send email to ${message.to}: ${err.message}`));
};

// Created on first use, so a missing JWT_SECRET is reported by the startup check in server.js.
let service;
const reset = () => (service ??= createPasswordReset({
  q,
  sendMail,
  secret: config.jwtSecret,
  hashPassword: (plain) => bcrypt.hash(plain, 10),
}));

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Step 1: the user enters their email. The answer is the same whether or not it has an account.
router.post('/auth/forgot-password', rateLimit({ max: 10, windowMs: FIFTEEN_MINUTES }), async (req, res) => {
  await reset().requestCode(req.body?.email);
  res.json({ message: 'If that email is registered, we have sent a 6-digit code. It works for 10 minutes.' });
});

// Step 2: the user sends the email, the 6-digit code and the new password.
router.post('/auth/reset-password', rateLimit({ max: 20, windowMs: FIFTEEN_MINUTES }), async (req, res) => {
  const body = req.body ?? {};
  await reset().resetPassword(body.email, body.otp, body.password);
  res.json({ message: 'Your password has been changed. Please log in with your new password.' });
});
