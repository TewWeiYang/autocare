// Run with: npm run test-email -- you@example.com
// Sends one test email using the settings in .env, so you can fix email problems
// before trying "Forgot password" in the app.
import { config } from '../src/config.js';
import { createMailer } from '../src/mailer.js';
import { resetCodeEmail } from '../src/emailTemplates.js';

const to = process.argv[2];
if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
  console.error('Usage: npm run test-email -- you@example.com');
  process.exit(1);
}

function hint(err) {
  const text = `${err.code || ''} ${err.message}`;
  if (/EAUTH|535|Invalid login|Username and Password not accepted/i.test(text)) return 'The email server refused the login. For Gmail, use an App Password (it needs 2-Step Verification), not your normal password, and put it in SMTP_PASS.';
  if (/ETIMEDOUT|ECONNECTION|ESOCKET|ECONNREFUSED|ENOTFOUND/i.test(text)) return 'Could not reach the email server. Check SMTP_HOST and SMTP_PORT. On Render\'s free plan SMTP ports are blocked, so use BREVO_API_KEY there instead.';
  if (/HTTP 401|HTTP 403/.test(text)) return 'Brevo refused the API key or the sender. Check BREVO_API_KEY and make sure MAIL_FROM is a sender you verified in Brevo.';
  if (/nodemailer/i.test(text)) return 'Run: npm install';
  return '';
}

const { brevoKey, smtp } = config.mail;
const sendMail = createMailer({ ...config.mail, isProduction: false });

try {
  await sendMail(resetCodeEmail({ to, name: 'there', otp: '123456', minutes: 10 }));
  if (!brevoKey && !smtp.host) {
    console.log('Email is not set up in .env, so the message above was only printed, not sent.');
  } else {
    console.log(`Sent. Check the inbox of ${to} (and the spam folder).`);
  }
} catch (err) {
  console.error(`Could not send: ${err.message}`);
  const tip = hint(err);
  if (tip) console.error(`Hint: ${tip}`);
  process.exitCode = 1;
}
