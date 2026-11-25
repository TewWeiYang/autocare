// The emails the API sends, as plain text and HTML. No dependencies, so they are easy to test.

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';

// "AutoCARe <noreply@example.com>" -> { name: 'AutoCARe', email: 'noreply@example.com' }
export function parseFrom(value) {
  const text = String(value ?? '').trim();
  const match = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(text);
  if (match) return { name: match[1].trim() || 'AutoCARe', email: match[2].trim() };
  return { name: 'AutoCARe', email: text };
}

const wrap = (heading, body) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2933">
  <h2 style="margin:0 0 16px;font-size:20px">${heading}</h2>
  ${body}
  <p style="margin:24px 0 0;font-size:12px;color:#6b7280">AutoCARe vehicle maintenance</p>
</div>`;

export function resetCodeEmail({ to, name, otp, minutes }) {
  const hi = firstName(name);
  return {
    to,
    subject: 'Your AutoCARe password reset code',
    text: [
      `Hi ${hi},`,
      '',
      'Use this code to reset your AutoCARe password:',
      '',
      otp,
      '',
      `It expires in ${minutes} minutes and works once.`,
      'If you did not ask for this, ignore this email. Your password has not been changed.',
    ].join('\n'),
    html: wrap('Reset your password', `
  <p>Hi ${escapeHtml(hi)},</p>
  <p>Use this code to reset your AutoCARe password:</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:700;font-family:Consolas,Menlo,monospace;margin:16px 0">${escapeHtml(otp)}</p>
  <p>It expires in ${Number(minutes)} minutes and works once.</p>
  <p style="color:#6b7280;font-size:13px">If you did not ask for this, ignore this email. Your password has not been changed.</p>`),
  };
}

export function passwordChangedEmail({ to, name }) {
  const hi = firstName(name);
  return {
    to,
    subject: 'Your AutoCARe password was changed',
    text: [
      `Hi ${hi},`,
      '',
      'The password for your AutoCARe account was just changed, and you were signed out on other devices.',
      'If this was you, there is nothing more to do.',
      'If it was not you, reset your password again straight away and contact the workshop.',
    ].join('\n'),
    html: wrap('Your password was changed', `
  <p>Hi ${escapeHtml(hi)},</p>
  <p>The password for your AutoCARe account was just changed, and you were signed out on other devices.</p>
  <p>If this was you, there is nothing more to do.</p>
  <p style="color:#6b7280;font-size:13px">If it was not you, reset your password again straight away and contact the workshop.</p>`),
  };
}
