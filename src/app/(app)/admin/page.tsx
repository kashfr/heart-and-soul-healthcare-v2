'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, ClipboardList, UserCog, FileText, FilePlus, FileEdit } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { loadDraft, type NoteDraft } from '@/lib/drafts';
import type { Role } from '@/lib/auth';

interface Card {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  allow: Role[];
  disabled?: boolean;
}

// The "Submit a progress note" card is built dynamically below so the
// title/description/href can swap when the caller has an unfinished draft.
const CARDS: Card[] = [
  {
    href: '/admin/submissions',
    icon: <ClipboardList size={22} />,
    title: 'My notes',
    description: 'View and edit your submitted progress notes.',
    allow: ['nurse'],
  },
  {
    href: '/admin/patients',
    icon: <Users size={22} />,
    title: 'Patient Roster',
    description: 'Add, edit, and remove patients. Nurses pick from this roster on the progress-note form.',
    allow: ['admin', 'supervisor'],
  },
  {
    href: '/admin/submissions',
    icon: <ClipboardList size={22} />,
    title: 'Progress Note Submissions',
    description: 'View and manage all submitted progress notes across staff.',
    allow: ['admin', 'supervisor'],
  },
  {
    href: '/admin/users',
    icon: <UserCog size={22} />,
    title: 'Staff & Roles',
    description: 'Invite nurses and supervisors, manage roles and access.',
    allow: ['admin', 'supervisor'],
  },
  {
    href: '/referral',
    icon: <FileText size={22} />,
    title: 'Referrals',
    description: 'Track incoming referral submissions. (Coming soon)',
    allow: ['admin'],
    disabled: true,
  },
];

const ROLE_KICKER: Record<Role, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  nurse: 'Nurse',
};

export default function AdminDashboardPage() {
  const { user, profile, role } = useAuth();
  const [myDraft, setMyDraft] = useState<NoteDraft | null>(null);

  // Surface the caller's own draft so the "Submit a progress note" card can
  // flip into "Resume draft" mode. Skipped for supervisors — they don't see
  // the card at all. Errors are intentionally swallowed; on failure the card
  // stays in its default "new note" state, which is a safe fallback.
  useEffect(() => {
    if (!user || role === 'supervisor') return;
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadDraft(user.uid);
        if (!cancelled) setMyDraft(draft);
      } catch (err) {
        console.error('Dashboard draft load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, role]);

  // Built per-render so it reflects the latest draft state. Available to
  // nurses + admins (admins so they can test/demo); supervisors don't author
  // notes so the card is omitted from their dashboard.
  const noteCard: Card = myDraft
    ? {
        href: '/progress-note?resume=1',
        icon: <FileEdit size={22} />,
        title: 'Resume your draft',
        description: myDraft.clientName
          ? `Pick up where you left off on ${myDraft.clientName}'s note.`
          : 'Pick up where you left off on your unfinished note.',
        allow: ['nurse', 'admin'],
      }
    : {
        href: '/progress-note',
        icon: <FilePlus size={22} />,
        title: 'Submit a progress note',
        description: 'Fill out a new shift note. The form auto-fills your name and credential.',
        allow: ['nurse', 'admin'],
      };

  const visibleCards = [noteCard, ...CARDS].filter((c) => role && c.allow.includes(role));
  const kicker = role ? ROLE_KICKER[role] : '';
  const firstName = profile?.displayName?.split(' ')[0] ?? '';

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>{kicker}</p>
            <h1 style={titleStyle}>Dashboard</h1>
            <p style={subtitleStyle}>
              Welcome back{firstName ? `, ${firstName}` : ''}.
            </p>
          </div>
        </header>

        <section style={gridStyle}>
          {visibleCards.map((c) => (
            <NavCard key={c.href + c.title} {...c} />
          ))}
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
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
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
  height: '100%',
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
