'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Plus,
  Mail,
  Copy,
  CheckCircle2,
  RefreshCw,
  Pencil,
  UserMinus,
  UserCheck,
  Lock,
} from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { useAuth } from '@/components/AuthProvider';
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
  orphansClaimed?: number;
  /** True if Resend successfully sent the invite/reset email to the user. */
  emailSent?: boolean;
  /** Reason the email failed to send, when emailSent is false. */
  emailError?: string;
}

const ROLE_OPTIONS: { value: Role; label: string; desc: string }[] = [
  { value: 'admin', label: 'Admin', desc: 'Full access to everything, including staff management.' },
  { value: 'supervisor', label: 'Supervisor', desc: 'Review all submissions; cannot manage staff or patients.' },
  { value: 'nurse', label: 'Nurse', desc: 'Submit and view only her own progress notes.' },
];

// Clinical credential levels. Independent of portal role — a supervisor can
// also be an RN, etc. Used by the progress-note form to render the right
// sections (LPN/RN see skilled nursing pages; HHA/CNA skip them).
const CREDENTIAL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— None —' },
  { value: 'HHA', label: 'HHA — Home Health Aide' },
  { value: 'CNA', label: 'CNA — Certified Nursing Assistant' },
  { value: 'LPN', label: 'LPN — Licensed Practical Nurse' },
  { value: 'RN', label: 'RN — Registered Nurse' },
];

export default function AdminUsersPage() {
  const { user: currentUser, role: currentRole } = useAuth();
  const isSupervisor = currentRole === 'supervisor';
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [linkResult, setLinkResult] = useState<CreateResult | null>(null);

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

  const { active, deactivated } = useMemo(() => {
    const a: StaffRow[] = [];
    const d: StaffRow[] = [];
    for (const s of staff) {
      if (s.active) a.push(s);
      else d.push(s);
    }
    return { active: a, deactivated: d };
  }, [staff]);

  const handleCreated = (created: CreateResult) => {
    setAddOpen(false);
    setLinkResult(created);
    loadStaff();
  };

  const handleSaved = (updated: StaffRow) => {
    setStaff((prev) => prev.map((s) => (s.uid === updated.uid ? { ...s, ...updated } : s)));
    setEditing(null);
  };

  const handleLinkRegenerated = (result: CreateResult) => {
    setEditing(null);
    setLinkResult(result);
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Staff & Roles</h1>
            <p style={subtitleStyle}>
              Invite admins, supervisors, and nurses. Click any row to edit a staff member, deactivate access, or resend a password-reset link.
            </p>
          </div>
          <button onClick={() => setAddOpen(true)} style={primaryBtnStyle}>
            <Plus size={16} /> Add staff
          </button>
        </header>

        {listError && <div style={errorStyle}>{listError}</div>}

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : active.length === 0 ? (
          <div style={emptyStyle}>
            No active staff. Click &ldquo;Add staff&rdquo; to create the first account.
          </div>
        ) : (
          <StaffTable
            rows={active}
            currentUserUid={currentUser?.uid}
            callerRole={currentRole}
            onEdit={setEditing}
          />
        )}

        {deactivated.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <h2 style={sectionHeadingStyle}>Deactivated</h2>
            <p style={{ fontSize: 12, color: '#7f8c8d', margin: '0 0 10px' }}>
              These accounts can&apos;t sign in. Their past progress notes and audit history are preserved. Click a row to reactivate.
            </p>
            <StaffTable
              rows={deactivated}
              currentUserUid={currentUser?.uid}
              callerRole={currentRole}
              onEdit={setEditing}
              muted
            />
          </section>
        )}
      </div>

      {addOpen && (
        <AddStaffModal
          onClose={() => setAddOpen(false)}
          onCreated={handleCreated}
          callerIsSupervisor={isSupervisor}
        />
      )}

      {editing && (
        <EditStaffModal
          staff={editing}
          isSelf={currentUser?.uid === editing.uid}
          callerIsSupervisor={isSupervisor}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onLinkRegenerated={handleLinkRegenerated}
        />
      )}

      {linkResult && <SuccessModal result={linkResult} onClose={() => setLinkResult(null)} />}
    </div>
  );
}

function StaffTable({
  rows,
  currentUserUid,
  callerRole,
  onEdit,
  muted,
}: {
  rows: StaffRow[];
  currentUserUid: string | undefined;
  callerRole: Role | null;
  onEdit: (s: StaffRow) => void;
  muted?: boolean;
}) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Role</th>
            <th style={thStyle}>Credential</th>
            <th style={thStyle}>Status</th>
            <th style={{ ...thStyle, textAlign: 'right', width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const isSelf = s.uid === currentUserUid;
            const isLockedForSupervisor = callerRole === 'supervisor' && s.role === 'admin';
            const rowStyle: React.CSSProperties = {
              ...(i % 2 === 1 ? altRowStyle : {}),
              ...(muted ? { opacity: 0.7 } : {}),
              cursor: isLockedForSupervisor ? 'not-allowed' : 'pointer',
            };
            return (
              <tr
                key={s.uid}
                style={rowStyle}
                title={isLockedForSupervisor ? 'Admin accounts can only be managed by another admin.' : undefined}
                onClick={() => {
                  if (isLockedForSupervisor) return;
                  onEdit(s);
                }}
                onMouseEnter={(e) => {
                  if (!isLockedForSupervisor) e.currentTarget.style.background = '#f1f5f9';
                }}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = i % 2 === 1 ? '#fafbfc' : 'white')
                }
              >
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: '#2c3e50' }}>
                    {s.displayName || '—'}
                    {isSelf && <span style={selfBadgeStyle}>You</span>}
                  </div>
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
                <td style={{ ...tdStyle, textAlign: 'right', color: '#94a3b8' }}>
                  {isLockedForSupervisor ? <Lock size={14} /> : <Pencil size={14} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddStaffModal({
  onClose,
  onCreated,
  callerIsSupervisor,
}: {
  onClose: () => void;
  onCreated: (r: CreateResult) => void;
  callerIsSupervisor: boolean;
}) {
  const roleOptions = callerIsSupervisor
    ? ROLE_OPTIONS.filter((o) => o.value !== 'admin')
    : ROLE_OPTIONS;
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
              placeholder="e.g., Jordan Rivera"
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
              {roleOptions.map((opt) => (
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

          <Field
            label={role === 'nurse' ? 'Credential *' : 'Credential'}
            help="Clinical credential, independent of portal role. Used to auto-fill the progress-note form. Optional for admins and supervisors; required for nurses."
          >
            <select
              required={role === 'nurse'}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              style={selectStyle}
              disabled={submitting}
            >
              {CREDENTIAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

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

function EditStaffModal({
  staff,
  isSelf,
  callerIsSupervisor,
  onClose,
  onSaved,
  onLinkRegenerated,
}: {
  staff: StaffRow;
  isSelf: boolean;
  callerIsSupervisor: boolean;
  onClose: () => void;
  onSaved: (s: StaffRow) => void;
  onLinkRegenerated: (r: CreateResult) => void;
}) {
  const roleOptions = callerIsSupervisor
    ? ROLE_OPTIONS.filter((o) => o.value !== 'admin')
    : ROLE_OPTIONS;
  const [displayName, setDisplayName] = useState(staff.displayName || '');
  const [credential, setCredential] = useState(staff.credential || '');
  const [role, setRole] = useState<Role>(staff.role || 'nurse');
  const [busy, setBusy] = useState<null | 'save' | 'deactivate' | 'reactivate' | 'link'>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    displayName.trim() !== (staff.displayName || '') ||
    credential.trim() !== (staff.credential || '') ||
    role !== staff.role;

  const close = () => {
    if (busy) return;
    onClose();
  };

  const patch = async (body: Record<string, unknown>): Promise<StaffRow | null> => {
    const res = await authedFetch(`/api/admin/users/${staff.uid}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Failed (${res.status})`);
    }
    return data as StaffRow;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setBusy('save');
    setError(null);
    try {
      const patchBody: Record<string, unknown> = {};
      if (displayName.trim() !== (staff.displayName || '')) patchBody.displayName = displayName.trim();
      if (credential.trim() !== (staff.credential || '')) patchBody.credential = credential.trim();
      if (role !== staff.role) patchBody.role = role;
      const updated = await patch(patchBody);
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setBusy(null);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm(`Deactivate ${staff.displayName}? They'll be signed out immediately and unable to sign back in until reactivated.`))
      return;
    setBusy('deactivate');
    setError(null);
    try {
      const updated = await patch({ active: false });
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deactivate failed.');
      setBusy(null);
    }
  };

  const handleReactivate = async () => {
    setBusy('reactivate');
    setError(null);
    try {
      const updated = await patch({ active: true });
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reactivate failed.');
      setBusy(null);
    }
  };

  const handleResendLink = async () => {
    setBusy('link');
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${staff.uid}/reset-link`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      onLinkRegenerated(data as CreateResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link.');
      setBusy(null);
    }
  };

  return (
    <div style={modalBackdropStyle} onClick={close}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={modalTitleStyle}>Edit staff</h2>
          <button onClick={close} disabled={!!busy} style={modalCloseStyle} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} style={{ padding: 20 }}>
          <div style={{ ...metaBoxStyle, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#5c6b7a' }}>Email (cannot be changed)</div>
            <div style={{ fontWeight: 600, color: '#2c3e50' }}>{staff.email}</div>
          </div>

          <Field label="Full name *">
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={inputStyle}
              disabled={!!busy}
            />
          </Field>

          <Field
            label={role === 'nurse' ? 'Credential *' : 'Credential'}
            help="Clinical credential, independent of portal role. Used to auto-fill the progress-note form. Optional for admins and supervisors; required for nurses."
          >
            <select
              required={role === 'nurse'}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              style={selectStyle}
              disabled={!!busy}
            >
              {CREDENTIAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Role *" help={isSelf ? 'You cannot change your own role.' : undefined}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roleOptions.map((opt) => (
                <label key={opt.value} style={{ ...roleOptionStyle, opacity: isSelf ? 0.6 : 1 }}>
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={role === opt.value}
                    onChange={() => setRole(opt.value)}
                    disabled={!!busy || isSelf}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#2c3e50' }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: '#5c6b7a' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          {error && <div style={errorStyle}>{error}</div>}

          <div style={actionsRowStyle}>
            <button
              type="button"
              onClick={handleResendLink}
              disabled={!!busy}
              style={secondaryBtnStyle}
              title="Generate a fresh password-reset link (old link will still work until it expires)."
            >
              {busy === 'link' ? (
                <>
                  <RefreshCw size={14} className="spin" /> Generating…
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Resend reset link
                </>
              )}
            </button>

            {staff.active ? (
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={!!busy || isSelf}
                style={{
                  ...dangerBtnStyle,
                  ...(isSelf ? disabledBtnStyle : {}),
                }}
                title={isSelf ? 'You cannot deactivate yourself.' : 'Disable sign-in without deleting history.'}
              >
                <UserMinus size={14} />
                {busy === 'deactivate' ? 'Deactivating…' : 'Deactivate'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={!!busy}
                style={secondaryBtnStyle}
              >
                <UserCheck size={14} />
                {busy === 'reactivate' ? 'Reactivating…' : 'Reactivate'}
              </button>
            )}

            <div style={{ flex: 1 }} />

            <button type="button" onClick={close} disabled={!!busy} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={!!busy || !dirty} style={primaryBtnStyle}>
              {busy === 'save' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
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

  const title = typeof result.orphansClaimed === 'number' ? 'Account created' : 'Password-reset link generated';

  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={modalTitleStyle}>
            <CheckCircle2 size={20} color="#27ae60" style={{ verticalAlign: 'middle', marginRight: 8 }} />
            {title}
          </h2>
          <button onClick={onClose} style={modalCloseStyle} aria-label="Close">✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ margin: '0 0 16px', color: '#2c3e50', fontSize: 14 }}>
            <strong>{result.displayName}</strong> ({result.email}) is a{' '}
            <strong>{result.role}</strong>.
          </p>

          {typeof result.orphansClaimed === 'number' && result.orphansClaimed > 0 && (
            <div style={claimBoxStyle}>
              Linked <strong>{result.orphansClaimed}</strong> existing progress note
              {result.orphansClaimed === 1 ? '' : 's'} previously submitted under this name.
            </div>
          )}

          {result.emailSent && (
            <div style={emailSuccessBoxStyle}>
              <CheckCircle2 size={16} color="#15803d" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, color: '#14532d' }}>
                  Invite sent to {result.email}
                </div>
                <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>
                  They&apos;ll get an email with a link to set their password. The link expires in about an hour.
                </div>
              </div>
            </div>
          )}

          {result.emailSent === false && (
            <div style={emailFailBoxStyle}>
              <Mail size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, color: '#78350f' }}>
                  Email didn&apos;t send
                </div>
                <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
                  {result.emailError ? `${result.emailError}. ` : ''}
                  Copy the link below and send it to the user manually.
                </div>
              </div>
            </div>
          )}

          <div style={linkBoxStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#5c6b7a', marginBottom: 6 }}>
              Password setup link {result.emailSent ? '(fallback copy)' : ''}
            </div>
            <div style={linkTextStyle}>{result.resetLink}</div>
            <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 8 }}>
              {result.emailSent
                ? 'Only share this link directly if the user says they didn\'t receive the email.'
                : 'Send this to the person so they can set their password. Link expires after ~1 hour.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={handleCopy} style={secondaryBtnStyle}>
              {copied ? <><CheckCircle2 size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={primaryBtnStyle}>Done</button>
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
const sectionHeadingStyle: React.CSSProperties = { fontSize: 14, color: '#2c3e50', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 };
const statusBadgeStyle: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', fontSize: 11, fontWeight: 700, borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4 };
const selfBadgeStyle: React.CSSProperties = { marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#eef5ff', color: '#1a3a5c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#27ae60', color: 'white', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef1f4', color: '#2c3e50', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const dangerBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fdecea', color: '#b3261e', padding: '10px 14px', borderRadius: 6, border: '1px solid #f5c6c0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const disabledBtnStyle: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const actionsRowStyle: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', marginTop: 20, flexWrap: 'wrap' };
const modalBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f3f5' };
const modalTitleStyle: React.CSSProperties = { margin: 0, fontSize: 18, color: '#2c3e50' };
const modalCloseStyle: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#7f8c8d' };
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' };
// Same as inputStyle but with the custom chevron-down used everywhere else on
// the site (contact form, progress-note form, submissions filters). Suppresses
// the macOS native double-arrow ⇅ for visual consistency.
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  paddingRight: 36,
  background:
    "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 12px center",
  backgroundSize: '14px',
  cursor: 'pointer',
};
const errorStyle: React.CSSProperties = { background: '#fdecea', color: '#b3261e', padding: '10px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 14px' };
const roleOptionStyle: React.CSSProperties = { display: 'flex', gap: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', alignItems: 'flex-start' };
const linkBoxStyle: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 4 };
const linkTextStyle: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#2c3e50', wordBreak: 'break-all' };
const claimBoxStyle: React.CSSProperties = { background: '#eef5ff', border: '1px solid #bfd6f3', color: '#1a3a5c', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 };
const emailSuccessBoxStyle: React.CSSProperties = { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' };
const emailFailBoxStyle: React.CSSProperties = { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' };
const metaBoxStyle: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 };

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
