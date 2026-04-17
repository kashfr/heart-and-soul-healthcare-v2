'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Mail, Copy, CheckCircle2 } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import type { Role } from '@/lib/auth';

interface StaffRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: Role | null;
  credential: string | null;
  active: boolean;
  createdAt: number | null;
}

interface CreateResult {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  credential: string | null;
  resetLink: string;
  orphansClaimed: number;
}

const ROLE_OPTIONS: { value: Role; label: string; desc: string }[] = [
  { value: 'admin', label: 'Admin', desc: 'Full access to everything, including staff management.' },
  { value: 'supervisor', label: 'Supervisor', desc: 'Review all submissions; cannot manage staff or patients.' },
  { value: 'nurse', label: 'Nurse', desc: 'Submit and view only her own progress notes.' },
];

export default function AdminUsersPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const loadStaff = useCallback(async () => {
    try {
      setLoading(true);
      setListError(null);
      const res = await authedFetch('/api/admin/users');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load staff (${res.status})`);
      }
      const data = await res.json();
      setStaff(data.users || []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load staff.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleCreated = (created: CreateResult) => {
    setAddOpen(false);
    setResult(created);
    loadStaff();
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Staff & Roles</h1>
            <p style={subtitleStyle}>
              Invite admins, supervisors, and nurses. Creating a staff account generates a password-reset link you can send directly to the person.
            </p>
          </div>
          <button onClick={() => setAddOpen(true)} style={primaryBtnStyle}>
            <Plus size={16} /> Add staff
          </button>
        </header>

        {listError && <div style={errorStyle}>{listError}</div>}

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : staff.length === 0 ? (
          <div style={emptyStyle}>
            No staff yet. Click &ldquo;Add staff&rdquo; to create the first account.
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Credential</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, i) => (
                  <tr key={s.uid} style={i % 2 === 1 ? altRowStyle : undefined}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#2c3e50' }}>{s.displayName || '—'}</div>
                    </td>
                    <td style={tdStyle}>{s.email || '—'}</td>
                    <td style={tdStyle}>
                      <span style={roleBadgeStyle(s.role)}>{s.role || '—'}</span>
                    </td>
                    <td style={tdStyle}>{s.credential || <span style={{ color: '#aaa' }}>—</span>}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...statusBadgeStyle,
                          color: s.active ? '#2a7a2a' : '#a33',
                          background: s.active ? '#e8f4e8' : '#fdecea',
                        }}
                      >
                        {s.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && (
        <AddStaffModal onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      )}

      {result && <SuccessModal result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function AddStaffModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: CreateResult) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('nurse');
  const [credential, setCredential] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim().toLowerCase(),
          role,
          credential: credential.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `Failed (${res.status})`);
      }
      onCreated(body as CreateResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account.');
      setSubmitting(false);
    }
  };

  return (
    <div style={modalBackdropStyle} onClick={() => !submitting && onClose()}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={modalTitleStyle}>Add staff</h2>
          <button onClick={onClose} disabled={submitting} style={modalCloseStyle} aria-label="Close">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <Field label="Full name *" help="Match the nurse's existing progress-note name exactly so past notes get linked.">
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={inputStyle}
              placeholder="e.g., Angela Chambers"
              disabled={submitting}
            />
          </Field>

          <Field label="Email *">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="staff@example.com"
              disabled={submitting}
            />
          </Field>

          <Field label="Role *">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ROLE_OPTIONS.map((opt) => (
                <label key={opt.value} style={roleOptionStyle}>
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={role === opt.value}
                    onChange={() => setRole(opt.value)}
                    disabled={submitting}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#2c3e50' }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: '#5c6b7a' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          {role === 'nurse' && (
            <Field label="Credential *" help="E.g., RN, LPN, CNA, HHA. Auto-populated on the progress-note form.">
              <input
                type="text"
                required
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                style={inputStyle}
                placeholder="RN"
                disabled={submitting}
              />
            </Field>
          )}

          {error && <div style={errorStyle}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose} disabled={submitting} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={primaryBtnStyle}>
              {submitting ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SuccessModal({ result, onClose }: { result: CreateResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const mailtoSubject = encodeURIComponent('Set up your Heart and Soul Healthcare account');
  const mailtoBody = encodeURIComponent(
    `Hi ${result.displayName.split(/\s+/)[0]},\n\n` +
      `You've been added to the Heart and Soul Healthcare staff portal. Click the link below to set your password and sign in:\n\n` +
      `${result.resetLink}\n\n` +
      `Once your password is set, sign in at https://www.heartandsoulhc.org/login\n\n` +
      `If the link has expired, let me know and I'll send a fresh one.\n\n` +
      `— Heart and Soul Healthcare`
  );
  const mailtoHref = `mailto:${encodeURIComponent(result.email)}?subject=${mailtoSubject}&body=${mailtoBody}`;

  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={modalTitleStyle}>
            <CheckCircle2 size={20} color="#27ae60" style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Account created
          </h2>
          <button onClick={onClose} style={modalCloseStyle} aria-label="Close">✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ margin: '0 0 16px', color: '#2c3e50', fontSize: 14 }}>
            <strong>{result.displayName}</strong> ({result.email}) is now a{' '}
            <strong>{result.role}</strong>.
          </p>

          {result.orphansClaimed > 0 && (
            <div style={claimBoxStyle}>
              Linked <strong>{result.orphansClaimed}</strong> existing progress note
              {result.orphansClaimed === 1 ? '' : 's'} previously submitted under this name.
            </div>
          )}

          <div style={linkBoxStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#5c6b7a', marginBottom: 6 }}>
              Password setup link
            </div>
            <div style={linkTextStyle}>{result.resetLink}</div>
            <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 8 }}>
              Send this to the person so they can set their password. Link expires after ~1 hour; if it expires before they use it, you can create the account again or use &quot;Forgot password&quot; on the login page.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={handleCopy} style={secondaryBtnStyle}>
              {copied ? <><CheckCircle2 size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
            </button>
            <a href={mailtoHref} style={{ ...primaryBtnStyle, textDecoration: 'none' }}>
              <Mail size={14} /> Draft email
            </a>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={secondaryBtnStyle}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#5c6b7a' }}>{label}</span>
      {children}
      {help && <span style={{ fontSize: 11, color: '#7f8c8d' }}>{help}</span>}
    </label>
  );
}

// --- styles ---

const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' };
const titleStyle: React.CSSProperties = { fontSize: 26, color: '#2c3e50', margin: 0 };
const subtitleStyle: React.CSSProperties = { fontSize: 13, color: '#7f8c8d', margin: '6px 0 0', maxWidth: 700 };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 10, color: '#7f8c8d', fontSize: 14, border: '1px solid #e5e7eb' };
const tableWrapStyle: React.CSSProperties = { background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', borderBottom: '1px solid #e5e7eb', color: '#5c6b7a', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 };
const tdStyle: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f1f3f5', color: '#2c3e50' };
const altRowStyle: React.CSSProperties = { background: '#fafbfc' };
const statusBadgeStyle: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', fontSize: 11, fontWeight: 700, borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4 };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#27ae60', color: 'white', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef1f4', color: '#2c3e50', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const modalBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f3f5' };
const modalTitleStyle: React.CSSProperties = { margin: 0, fontSize: 18, color: '#2c3e50' };
const modalCloseStyle: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#7f8c8d' };
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' };
const errorStyle: React.CSSProperties = { background: '#fdecea', color: '#b3261e', padding: '10px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 14px' };
const roleOptionStyle: React.CSSProperties = { display: 'flex', gap: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', alignItems: 'flex-start' };
const linkBoxStyle: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 4 };
const linkTextStyle: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#2c3e50', wordBreak: 'break-all' };
const claimBoxStyle: React.CSSProperties = { background: '#eef5ff', border: '1px solid #bfd6f3', color: '#1a3a5c', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 };

function roleBadgeStyle(role: Role | null): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    admin: { bg: '#fef3c7', fg: '#78350f' },
    supervisor: { bg: '#e0e7ff', fg: '#3730a3' },
    nurse: { bg: '#e8f4e8', fg: '#166534' },
  };
  const c = (role && map[role]) || { bg: '#f1f5f9', fg: '#64748b' };
  return {
    display: 'inline-block',
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background: c.bg,
    color: c.fg,
  };
}
