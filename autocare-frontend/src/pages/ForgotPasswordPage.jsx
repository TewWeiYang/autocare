import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import { api, isMock } from '../api';

const RESEND_SECONDS = 60; // same wait as the backend, which allows one new code a minute

// Two steps: 1) enter the email, 2) enter the 6-digit code from the email and a new password.
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ otp: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);        // seconds until "Resend code" works again
  const [demoCode, setDemoCode] = useState(''); // sample data mode only: shown on screen, since no email is sent

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function sendCode(address) {
    const res = await api.requestPasswordReset(address);
    setDemoCode(res?.demoCode ?? '');
    setWait(RESEND_SECONDS);
  }

  async function submitEmail(e) {
    e.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError('Enter a valid email address.');
    setBusy(true);
    setError('');
    try {
      await sendCode(address);
      setEmail(address);
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await sendCode(email);
      setInfo('A new code has been sent. Earlier codes no longer work.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(form.otp)) return setError('Enter the 6-digit code from your email.');
    if (form.password.length < 8 || form.password.length > 72) return setError('Password needs 8 to 72 characters.');
    if (form.password !== form.confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await api.resetPassword({ email, otp: form.otp, password: form.password });
      navigate('/login', { replace: true, state: { notice: 'Password changed. Please log in with your new password.' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function useDifferentEmail() {
    setStep('email');
    setForm({ otp: '', password: '', confirm: '' });
    setError('');
    setInfo('');
    setDemoCode('');
  }

  return (
    <AuthLayout title="Forgot Password" back="/login">
      {step === 'email' ? (
        <>
          <h2 className="h2">Reset your password</h2>
          <p className="muted small">Enter the email address of your account. We will email you a 6-digit code.</p>
          <form className="stack" onSubmit={submitEmail} noValidate>
            <Field label="Email Address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <div className="alert alert--bad" role="alert">{error}</div>}
            <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send code'}</button>
          </form>
          <p className="muted center">Remembered it? <Link to="/login">Login</Link></p>
          {isMock && (
            <p className="demo">Sample data mode: try <b>demo@autocare.example</b>.<br />No email is sent. The code is shown on the next screen.</p>
          )}
        </>
      ) : (
        <>
          <h2 className="h2">Enter your code</h2>
          <p className="muted small">If <b>{email}</b> has an account, we sent it a 6-digit code. It works for 10 minutes. Check your spam folder if it does not arrive.</p>
          <form className="stack" onSubmit={submitReset} noValidate>
            <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.otp}
              onChange={(e) => setForm((f) => ({ ...f, otp: e.target.value.replace(/\D/g, '') }))} />
            <Field label="New Password" type="password" autoComplete="new-password" hint="(8+ characters)" value={form.password} onChange={setField('password')} />
            <Field label="Confirm New Password" type="password" autoComplete="new-password" value={form.confirm} onChange={setField('confirm')} />
            {info && <div className="alert alert--good" role="status">{info}</div>}
            {error && <div className="alert alert--bad" role="alert">{error}</div>}
            <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button>
          </form>
          {isMock && demoCode && (
            <p className="demo">Sample data mode: no email is sent.<br />Your code is <b>{demoCode}</b></p>
          )}
          <p className="muted center small">
            Did not get a code?{' '}
            <button type="button" className="linkbtn" onClick={resend} disabled={busy || wait > 0}>
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
          </p>
          <p className="center small">
            <button type="button" className="linkbtn" onClick={useDifferentEmail}>Use a different email</button>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
