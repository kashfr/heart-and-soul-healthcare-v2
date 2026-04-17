'use client';

import Link from 'next/link';
import { Users, ClipboardList, UserCog, FileText } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export default function AdminDashboardPage() {
  const { profile } = useAuth();

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>Admin</p>
            <h1 style={titleStyle}>Dashboard</h1>
            <p style={subtitleStyle}>
              Welcome back{profile?.displayName ? `, ${profile.displayName.split(' ')[0]}` : ''}.
            </p>
          </div>
        </header>

        <section style={gridStyle}>
          <NavCard
            href="/admin/patients"
            icon={<Users size={22} />}
            title="Patient Roster"
            description="Add, edit, and remove patients. Nurses pick from this roster on the progress-note form."
          />
          <NavCard
            href="/progress-note/submissions"
            icon={<ClipboardList size={22} />}
            title="Progress Note Submissions"
            description="View and manage all submitted progress notes across staff."
          />
          <NavCard
            href="/admin/users"
            icon={<UserCog size={22} />}
            title="Staff & Roles"
            description="Invite nurses and supervisors, manage roles and access. (Coming soon)"
            disabled
          />
          <NavCard
            href="/referral"
            icon={<FileText size={22} />}
            title="Referrals"
            description="Track incoming referral submissions. (Coming soon)"
            disabled
          />
        </section>
      </div>
    </div>
  );
}

function NavCard({
  href,
  icon,
  title,
  description,
  disabled,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  const body = (
    <div style={{ ...cardStyle, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <div style={cardIconStyle}>{icon}</div>
      <div style={{ fontWeight: 700, color: '#2c3e50', fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 }}>{description}</div>
    </div>
  );

  if (disabled) return body;
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {body}
    </Link>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '70vh',
  background: '#f5f7fa',
  padding: '32px 20px',
};

const wrapStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
};

const headerStyle: React.CSSProperties = {
  marginBottom: 24,
};

const kickerStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: '#27ae60',
  margin: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 32,
  color: '#2c3e50',
  margin: '4px 0 0',
};

const subtitleStyle: React.CSSProperties = {
  color: '#7f8c8d',
  fontSize: 15,
  marginTop: 6,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  transition: 'transform 0.12s, box-shadow 0.12s',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const cardIconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  background: '#eef5ff',
  color: '#1a3a5c',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
