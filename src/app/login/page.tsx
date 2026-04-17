'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/progress-note/submissions';
  const { user, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirect);
    }
  }, [loading, user, redirect, router]);

  const handleSubmit = async (e: FormEvent) => {
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
      } else {
        setError('Sign in failed. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Sign in</h1>
        <p style={subtitleStyle}>Heart and Soul Healthcare staff portal</p>

        <form onSubmit={handleSubmit} style={formStyle}>
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

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={footerStyle}>
          Accounts are created by invitation only. If you need access,
          contact your administrator.
        </p>
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

const buttonStyle: React.CSSProperties = {
  background: '#27ae60',
  color: 'white',
  padding: '12px 16px',
  borderRadius: 6,
  border: 'none',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};

const footerStyle: React.CSSProperties = {
  marginTop: 20,
  fontSize: 12,
  color: '#7f8c8d',
  textAlign: 'center',
};
