'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

type Status = 'verifying' | 'ready' | 'invalid' | 'saving' | 'done';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';
  // Firebase-console-routed links carry a `mode` (resetPassword / verifyEmail /
  // recoverEmail). We only handle password resets here; anything else falls
  // through to the friendly "use sign in" panel rather than erroring.
  const mode = searchParams.get('mode');

  const [status, setStatus] = useState<Status>('verifying');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Validate the one-time code up front so we can greet the user by account
  // and fail fast on an expired/used link.
  useEffect(() => {
    if (!oobCode || (mode && mode !== 'resetPassword')) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    verifyPasswordResetCode(auth, oobCode)
      .then((mail) => {
        if (cancelled) return;
        setEmail(mail);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [oobCode, mode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setStatus('saving');
    try {
      await confirmPasswordReset(auth, oobCode, password);
    } catch {
      setError('This reset link is invalid or has expired. Please request a new one.');
      setStatus('invalid');
      return;
    }
    // Password is set. Sign them straight in so they never have to hunt for the
    // login page. If anything trips up the auto-sign-in (e.g. a deactivated
    // account), fall back to the login screen with a success banner.
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setStatus('done');
      router.replace('/admin');
    } catch {
      setStatus('done');
      router.replace('/login?reset=1');
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {status === 'verifying' && (
          <>
            <h1 style={titleStyle}>Set your password</h1>
            <p style={subtitleStyle}>Checking your link…</p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <h1 style={titleStyle}>Link expired</h1>
            <p style={subtitleStyle}>
              This password link is invalid or has already been used. Reset links expire about an
              hour after they&apos;re sent.
            </p>
            <Link href="/login" style={{ ...primaryBtnStyle, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Go to sign in
            </Link>
            <p style={footerStyle}>
              On the sign-in page, click <strong>Forgot password?</strong> to send yourself a fresh
              link, or ask your administrator to resend one.
            </p>
          </>
        )}

        {(status === 'ready' || status === 'saving' || status === 'done') && (
          <>
            <h1 style={titleStyle}>Set your password</h1>
            <p style={subtitleStyle}>
              Choose a new password for <strong>{email}</strong>. We&apos;ll sign you in right after.
            </p>

            <form onSubmit={handleSubmit} style={formStyle}>
              <label style={labelStyle}>
                New password
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                  placeholder="At least 8 characters"
                />
              </label>

              <label style={labelStyle}>
                Confirm new password
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={inputStyle}
                />
              </label>

              {error && <div style={errorStyle}>{error}</div>}

              <button
                type="submit"
                disabled={status === 'saving' || status === 'done'}
                style={primaryBtnStyle}
              >
                {status === 'saving' || status === 'done' ? 'Saving…' : 'Save password & sign in'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={containerStyle} />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '70vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  background: '#f5f7fa',
};
const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: 'white',
  padding: 32,
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
};
const titleStyle: React.CSSProperties = { color: '#2c3e50', fontSize: 24, margin: 0, marginBottom: 4 };
const subtitleStyle: React.CSSProperties = { color: '#7f8c8d', fontSize: 14, marginTop: 0, marginBottom: 24, lineHeight: 1.5 };
const formStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#2c3e50' };
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontWeight: 400 };
const errorStyle: React.CSSProperties = { background: '#fdecea', color: '#b3261e', padding: '10px 12px', borderRadius: 6, fontSize: 13 };
const primaryBtnStyle: React.CSSProperties = { background: '#27ae60', color: 'white', padding: '12px 16px', borderRadius: 6, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const footerStyle: React.CSSProperties = { marginTop: 20, fontSize: 12.5, color: '#7f8c8d', textAlign: 'center', lineHeight: 1.5 };
