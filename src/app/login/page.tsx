'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';

type Mode = 'signIn' | 'reset';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/admin';
  const { user, loading } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirect);
    }
  }, [loading, user, redirect, router]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setResetSentTo(null);
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace(redirect);
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setError('Invalid email or password.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Try again later or reset your password.');
      } else if (code === 'auth/user-disabled') {
        setError('This account is deactivated. Contact your administrator.');
      } else {
        setError('Sign in failed. Please try again.');
      }
      setSubmitting(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const target = email.trim();
    try {
      await sendPasswordResetEmail(auth, target);
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      // Intentionally treat auth/user-not-found the same as success below —
      // we don't want to reveal which emails have accounts.
      if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
        setSubmitting(false);
        return;
      } else if (code === 'auth/too-many-requests') {
        setError('Too many requests. Please try again in a few minutes.');
        setSubmitting(false);
        return;
      }
      // Fall through to success state even on other errors.
    }
    setResetSentTo(target);
    setSubmitting(false);
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {mode === 'signIn' && (
          <>
            <h1 style={titleStyle}>Sign in</h1>
            <p style={subtitleStyle}>Heart and Soul Healthcare staff portal</p>

            <form onSubmit={handleSignIn} style={formStyle}>
              <label style={labelStyle}>
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Password
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </label>

              {error && <div style={errorStyle}>{error}</div>}

              <button type="submit" disabled={submitting} style={primaryBtnStyle}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div style={forgotRowStyle}>
              <button
                type="button"
                onClick={() => switchMode('reset')}
                style={linkBtnStyle}
              >
                Forgot password?
              </button>
            </div>

            <p style={footerStyle}>
              Accounts are created by invitation only. If you need access,
              contact your administrator.
            </p>
          </>
        )}

        {mode === 'reset' && !resetSentTo && (
          <>
            <h1 style={titleStyle}>Reset password</h1>
            <p style={subtitleStyle}>
              Enter the email for your staff account and we&apos;ll send you a
              link to set a new password.
            </p>

            <form onSubmit={handleReset} style={formStyle}>
              <label style={labelStyle}>
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="you@heartandsoulhc.org"
                />
              </label>

              {error && <div style={errorStyle}>{error}</div>}

              <button type="submit" disabled={submitting} style={primaryBtnStyle}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <div style={forgotRowStyle}>
              <button
                type="button"
                onClick={() => switchMode('signIn')}
                style={linkBtnStyle}
              >
                ← Back to sign in
              </button>
            </div>
          </>
        )}

        {mode === 'reset' && resetSentTo && (
          <>
            <h1 style={titleStyle}>Check your email</h1>
            <p style={subtitleStyle}>
              If an account exists for <strong>{resetSentTo}</strong>, a password-reset
              link is on the way. Links expire after about an hour — use it soon.
              Check spam if you don&apos;t see it within a few minutes.
            </p>

            <button
              type="button"
              onClick={() => switchMode('signIn')}
              style={primaryBtnStyle}
            >
              Back to sign in
            </button>

            <div style={forgotRowStyle}>
              <button
                type="button"
                onClick={() => {
                  setResetSentTo(null);
                  setError(null);
                }}
                style={linkBtnStyle}
              >
                Send to a different email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={containerStyle} />}>
      <LoginForm />
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

const titleStyle: React.CSSProperties = {
  color: '#2c3e50',
  fontSize: 24,
  margin: 0,
  marginBottom: 4,
};

const subtitleStyle: React.CSSProperties = {
  color: '#7f8c8d',
  fontSize: 14,
  marginTop: 0,
  marginBottom: 24,
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: '#2c3e50',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #d0d7de',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 400,
};

const errorStyle: React.CSSProperties = {
  background: '#fdecea',
  color: '#b3261e',
  padding: '10px 12px',
  borderRadius: 6,
  fontSize: 13,
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#27ae60',
  color: 'white',
  padding: '12px 16px',
  borderRadius: 6,
  border: 'none',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};

const forgotRowStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: 16,
};

const linkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#27ae60',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'inherit',
};

const footerStyle: React.CSSProperties = {
  marginTop: 20,
  fontSize: 12,
  color: '#7f8c8d',
  textAlign: 'center',
};
