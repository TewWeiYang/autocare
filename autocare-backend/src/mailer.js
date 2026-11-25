import { parseFrom } from './emailTemplates.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

// Builds sendMail({ to, subject, text, html }). Which service it uses depends on the settings:
//   1. BREVO_API_KEY set  -> Brevo over HTTPS. Works on hosts that block SMTP, such as Render's free plan.
//   2. SMTP_HOST set      -> any SMTP server through nodemailer (for example Gmail with an App Password).
//   3. nothing set        -> the email is printed in the terminal instead of sent (not allowed in production).
// The settings and helpers are passed in so the whole file can be tested without a network.
export function createMailer(settings, { fetchFn = globalThis.fetch, loadNodemailer = () => import('nodemailer'), log = console.log } = {}) {
  const { from = '', brevoKey = '', smtp = {}, isProduction = false } = settings;
  let transport;

  async function viaBrevo({ to, subject, text, html }) {
    if (!from) throw new Error('Set MAIL_FROM to a sender address you have verified in Brevo.');
    const res = await fetchFn(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(from), to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    });
    if (!res.ok) throw new Error(`Brevo refused the email (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  async function viaSmtp({ to, subject, text, html }) {
    if (!transport) {
      let mod;
      try {
        mod = await loadNodemailer();
      } catch (err) {
        throw new Error(`Could not load nodemailer (${err.message}). Run: npm install`);
      }
      const nodemailer = mod.default ?? mod;
      transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465, // port 465 is encrypted from the start, port 587 upgrades after connecting
        auth: { user: smtp.user, pass: smtp.pass },
        // Give up quickly when the host blocks the port, instead of hanging for two minutes.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });
    }
    await transport.sendMail({ from: from || smtp.user, to, subject, text, html });
  }

  return async function sendMail(message) {
    if (brevoKey) return viaBrevo(message);
    if (smtp.host) return viaSmtp(message);
    if (isProduction) throw new Error('Email is not set up. Set BREVO_API_KEY (or SMTP_HOST) in the environment variables.');
    log(`\n----- Email is not set up, so this message was NOT sent. It is printed here for testing. -----\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n-------------------------------------------------------------------------------------------\n`);
  };
}
