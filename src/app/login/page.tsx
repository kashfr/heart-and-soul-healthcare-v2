'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { safeLoginRedirect } from '@/lib/loginRedirect';
import { escortToField, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import { PortalLoading } from '@/components/PortalLoading';

type Mode = 'signIn' | 'reset';
const RESET_EMAIL_ID = 'login-field-reset-email';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeLoginRedirect(searchParams.get('redirect'));
  // Set when the /reset-password page couldn't auto-sign-in after a successful
  // reset (rare). Show a clear "you're all set, just sign in" banner.
  const justReset = searchParams.get('reset') === '1';
  const { user, loading } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  // The reset flow's only input, so its problem sits on the field, not in a banner.
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirect);
    }
  }, [loading, user, redirect, router]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setEmailError(null);
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
    setError(null);
    setEmailError(null);
    const target = email.trim();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setEmailError('Please enter a valid email address.');
      escortToField(RESET_EMAIL_ID);
      return;
    }
    setSubmitting(true);
    try {
      // Server route sends our own branded reset email pointing at the
      // /reset-password page. It always responds OK unless the email is
      // malformed, so we never reveal which addresses have accounts.
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setEmailError(data.error || 'Please enter a valid email address.');
        escortToField(RESET_EMAIL_ID);
        setSubmitting(false);
        return;
      }
      // Any other status: fall through to the success screen.
    } catch {
      // Network error: still show success to avoid leaking account existence.
    }
    setResetSentTo(target);
    setSubmitting(false);
  };

  // Until Firebase has restored (or ruled out) a saved session, we don't know
  // whether this visitor is signed in. Showing the form in that gap flashed it
  // at people who were, just before the redirect above whisked them away. Hold
  // the loading screen instead, and keep holding it while that redirect runs.
  // Not during a submit: a fresh sign-in keeps the form (and its busy button)
  // on screen until router.replace lands.
  if ((loading || user) && !submitting) {
    return <PortalLoading label={user ? 'Signing you in…' : 'Loading…'} />;
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-2026.webp" alt="Heart and Soul Healthcare" width={200} height={53} style={logoStyle} />
        {mode === 'signIn' && (
          <>
            <h1 style={titleStyle}>Sign In</h1>
            <p style={subtitleStyle}>Heart and Soul Healthcare staff portal</p>

            {justReset && (
              <div style={successStyle}>
                ✓ Your password was updated. Please sign in with your new password.
              </div>
            )}

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
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div style={forgotRowStyle}>
              <button
                type="button"
                onClick={() => switchMode('reset')}
                style={linkBtnStyle}
              >
                Forgot Password?
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
            <h1 style={titleStyle}>Reset Password</h1>
            <p style={subtitleStyle}>
              Enter the email for your staff account and we&apos;ll send you a
              link to set a new password.
            </p>

            <form onSubmit={handleReset} style={formStyle} noValidate>
              <label style={labelStyle} id={RESET_EMAIL_ID}>
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  style={{ ...inputStyle, ...(emailError ? FIELD_ERROR_STYLE : {}) }}
                  aria-invalid={!!emailError}
                  placeholder="you@heartandsoulhc.org"
                />
                <FieldError message={emailError} />
              </label>

              {error && <div style={errorStyle}>{error}</div>}

              <button type="submit" disabled={submitting} style={primaryBtnStyle}>
                {submitting ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>

            <div style={forgotRowStyle}>
              <button
                type="button"
                onClick={() => switchMode('signIn')}
                style={linkBtnStyle}
              >
                ← Back to Sign In
              </button>
            </div>
          </>
        )}

        {mode === 'reset' && resetSentTo && (
          <>
            <h1 style={titleStyle}>Check Your Email</h1>
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
              Back to Sign In
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
                Send to a Different Email
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
    <Suspense fallback={<PortalLoading />}>
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

const logoStyle: React.CSSProperties = { display: 'block', width: 200, height: 'auto', margin: '0 auto 24px' };

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

const successStyle: React.CSSProperties = {
  background: '#d1fae5',
  color: '#065f46',
  border: '1px solid #10b981',
  padding: '10px 12px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 16,
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
