'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { canAccessAdmin } from '@/lib/auth';

export default function UserMenu() {
  const { user, profile, role, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (loading || !user) return null;

  const displayName = profile?.displayName || user.email?.split('@')[0] || 'Account';
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    router.replace('/');
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={triggerStyle}
      >
        <span style={avatarStyle}>{initials}</span>
        <span style={{ fontWeight: 600 }}>{displayName}</span>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div role="menu" style={menuStyle}>
          <div style={menuHeaderStyle}>
            <div style={{ fontWeight: 700, color: '#2c3e50' }}>{displayName}</div>
            <div style={{ fontSize: 12, color: '#7f8c8d' }}>{user.email}</div>
            {role && <div style={roleBadgeStyle}>{role}</div>}
          </div>

          {canAccessAdmin(role) && (
            <Link href="/admin" onClick={() => setOpen(false)} style={menuItemStyle}>
              <LayoutDashboard size={16} />
              Admin Dashboard
            </Link>
          )}

          <Link href="/progress-note/submissions" onClick={() => setOpen(false)} style={menuItemStyle}>
            Submissions
          </Link>

          <button onClick={handleSignOut} style={{ ...menuItemStyle, color: '#c44', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 10px 4px 4px',
  background: 'rgba(255,255,255,0.15)',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 999,
  color: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const avatarStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: '#27ae60',
  color: 'white',
  fontSize: 11,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  minWidth: 220,
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  padding: 4,
  zIndex: 1000,
};

const menuHeaderStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f1f3f5',
  marginBottom: 4,
};

const roleBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 6,
  padding: '2px 8px',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  background: '#eef5ff',
  color: '#1a3a5c',
  borderRadius: 999,
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  textDecoration: 'none',
  color: '#2c3e50',
  fontSize: 14,
  borderRadius: 6,
  fontFamily: 'inherit',
};
