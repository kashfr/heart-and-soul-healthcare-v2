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
  Eye,
  Search,
} from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import {
  staffMatchesQuery,
  compareStaff,
  type StaffSortKey,
  type StaffSortDir,
} from './staffListView';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import { useViewAs } from '@/components/ImpersonationProvider';
import type { Role } from '@/lib/auth';
import { formatUSPhone } from '@/lib/phone';

interface StaffRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: Role | null;
  credential: string | null;
  phone: string | null;
  active: boolean;
  /** True once the user has signed in to the portal at least once (driven
      by Firebase Auth's metadata.lastSignInTime, fetched server-side). */
  hasSignedIn: boolean;
  createdAt: number | null;
  /** Present when the staff member has filed a self-service email-change
      request awaiting approval. Null/absent otherwise. */
  emailChangeRequest?: { newEmail: string; reason: string; status: 'pending' } | null;
  /** Declared test/QA login rather than a real workforce member. Badged here
      and warned about in the care-team picker so it never quietly reads a
      real client's chart. */
  isTestAccount?: boolean;
  /** True while open blocking corrections stop this nurse from new notes
      (server-maintained; clears when she amends or a reviewer unblocks). */
  correctionsBlocked?: boolean;
  /** Manual admin "no new notes" toggle, independent of any correction. */
  manualNotesBlock?: boolean;
}

interface CreateResult {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  credential: string | null;
  phone: string | null;
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
  { value: 'nurse', label: 'Nurse', desc: 'Submit and view only their own progress notes.' },
  { value: 'va', label: 'Virtual Assistant', desc: 'Referrals pipeline, sharing, and agencies only. No patients, records, submissions, staff, or settings.' },
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
  const { user: currentUser } = useAuth();
  const { startViewAs } = useViewAs();
  // Render gating keys off the EFFECTIVE role so a supervisor preview shows
  // the supervisor's variant (admin rows locked, no View-as buttons — which
  // also prevents silently swapping the preview target mid-session). Writes
  // are separately blocked during view-as by the authedFetch guard.
  const { role: currentRole } = useEffectiveUser();
  const isSupervisor = currentRole === 'supervisor';

  // Admin-only "View as" (read-only impersonation for testing). Logs the session
  // server-side, then routes to the dashboard rendered as that staff member.
  const handleViewAs = async (s: StaffRow) => {
    try {
      await authedFetch('/api/admin/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid: s.uid, targetName: s.displayName || s.email || '' }),
      }).catch(() => {}); // audit is best-effort; don't block the session on it
      startViewAs({
        uid: s.uid,
        displayName: s.displayName || s.email || 'Staff',
        credential: s.credential,
        // The target's real role drives the preview's nav + surfaces. Rows
        // without a role stored (shouldn't happen for active staff) preview
        // as the least-privileged clinical role rather than failing open.
        role: s.role ?? 'nurse',
      });
      window.location.href = '/admin';
    } catch (err) {
      console.error('View-as failed:', err);
    }
  };
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [linkResult, setLinkResult] = useState<CreateResult | null>(null);
  // Search + column sort are client-side views over the fetched list. Default
  // is alphabetical by name — the API's createdAt ordering floated the newest
  // hires to the top, which isn't how admins scan for a nurse.
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<StaffSortKey>('name');
  const [sortDir, setSortDir] = useState<StaffSortDir>('asc');

  const handleSort = (key: StaffSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

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
      if (!staffMatchesQuery(s, query)) continue;
      if (s.active) a.push(s);
      else d.push(s);
    }
    const cmp = (x: StaffRow, y: StaffRow) => compareStaff(x, y, sortKey, sortDir);
    a.sort(cmp);
    d.sort(cmp);
    return { active: a, deactivated: d };
  }, [staff, query, sortKey, sortDir]);

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

        {!loading && staff.length > 0 && (
          <div style={filterBarStyle}>
            <div style={searchWrapStyle}>
              <Search size={14} style={searchIconStyle} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, phone, role, credential…"
                style={searchInputStyle}
                aria-label="Search staff"
              />
            </div>
            {query.trim() !== '' && (
              <span style={matchCountStyle}>
                {active.length + deactivated.length === 1
                  ? '1 match'
                  : `${active.length + deactivated.length} matches`}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : active.length === 0 ? (
          <div style={emptyStyle}>
            {query.trim() !== ''
              ? `No active staff match "${query.trim()}".${deactivated.length > 0 ? ' See the Deactivated section below.' : ''}`
              : 'No active staff. Click "Add staff" to create the first account.'}
          </div>
        ) : (
          <StaffTable
            rows={active}
            currentUserUid={currentUser?.uid}
            callerRole={currentRole}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onEdit={setEditing}
            onViewAs={currentRole === 'admin' ? handleViewAs : undefined}
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
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
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
  sortKey,
  sortDir,
  onSort,
  onEdit,
  onViewAs,
  muted,
}: {
  rows: StaffRow[];
  currentUserUid: string | undefined;
  callerRole: Role | null;
  sortKey: StaffSortKey;
  sortDir: StaffSortDir;
  onSort: (key: StaffSortKey) => void;
  onEdit: (s: StaffRow) => void;
  onViewAs?: (s: StaffRow) => void;
  muted?: boolean;
}) {
  // Active column shows its direction; the rest carry a faint ↕ so every
  // header reads as clickable, not just the one currently sorted.
  const sortableTh = (key: StaffSortKey, label: string) => (
    <th
      style={sortableThStyle}
      onClick={() => onSort(key)}
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      {sortKey === key ? (
        <span aria-hidden> {sortDir === 'asc' ? '↑' : '↓'}</span>
      ) : (
        <span aria-hidden style={{ color: '#c3ccd6' }}> ↕</span>
      )}
    </th>
  );
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {sortableTh('name', 'Name')}
            {sortableTh('email', 'Email')}
            {sortableTh('phone', 'Phone')}
            {sortableTh('role', 'Role')}
            {sortableTh('credential', 'Credential')}
            {sortableTh('status', 'Status')}
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
                    {s.isTestAccount && (
                      <span style={testBadgeStyle} title="Declared test / QA login, not a real staff member">
                        Test
                      </span>
                    )}
                    {s.correctionsBlocked && (
                      <span
                        style={blockedBadgeStyle}
                        title="Blocked from new notes until they amend a flagged note. Clear it from the note's correction panel (Remove block or Mark resolved)."
                      >
                        Blocked — corrections
                      </span>
                    )}
                    {s.manualNotesBlock && (
                      <span
                        style={blockedBadgeStyle}
                        title="Manually blocked from new notes by an administrator. Toggle it off in Edit."
                      >
                        Blocked — manual
                      </span>
                    )}
                  </div>
                  {s.emailChangeRequest && (
                    <div style={emailReqChipStyle} title={`Requested new email: ${s.emailChangeRequest.newEmail}`}>
                      <Mail size={11} /> Email change requested
                    </div>
                  )}
                </td>
                <td style={tdStyle}>{s.email || '—'}</td>
                <td style={tdStyle}>
                  {s.phone ? (
                    <a
                      href={`tel:${s.phone.replace(/\D/g, '')}`}
                      onClick={(e) => e.stopPropagation()}
                      style={phoneLinkStyle}
                      title={`Call ${s.displayName || 'this staff member'}`}
                    >
                      {s.phone}
                    </a>
                  ) : (
                    <span style={{ color: '#aaa' }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <span style={roleBadgeStyle(s.role)}>{s.role || '—'}</span>
                </td>
                <td style={tdStyle}>{s.credential || <span style={{ color: '#aaa' }}>—</span>}</td>
                <td style={tdStyle}>
                  {/* Tri-state: Deactivated > Pending > Active. The pending
                      bucket means the account exists + we sent an invite but
                      the user hasn't completed the password-setup flow yet.
                      Amber matches the "Needs co-sign" pill on the
                      Submissions dashboard so the visual language stays
                      consistent across portal surfaces. */}
                  {(() => {
                    if (!s.active) {
                      return (
                        <span style={{ ...statusBadgeStyle, color: '#a33', background: '#fdecea' }}>
                          Deactivated
                        </span>
                      );
                    }
                    if (!s.hasSignedIn) {
                      return (
                        <span
                          style={{ ...statusBadgeStyle, color: '#a35400', background: '#fff4e5' }}
                          title="Account created and invite sent, but they haven't signed in yet."
                        >
                          Pending
                        </span>
                      );
                    }
                    return (
                      <span style={{ ...statusBadgeStyle, color: '#2a7a2a', background: '#e8f4e8' }}>
                        Active
                      </span>
                    );
                  })()}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#94a3b8' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {/* Edit affordance first (the whole row is clickable to edit),
                        then the View as action sits at the right edge. */}
                    {isLockedForSupervisor ? <Lock size={14} /> : <Pencil size={14} />}
                    {/* View as: admin-only, never on self or another admin. Read-only. */}
                    {onViewAs && !isSelf && s.role !== 'admin' && s.active && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onViewAs(s); }}
                        style={viewAsRowBtnStyle}
                        title={`See the portal exactly as ${s.displayName || 'this staff member'} (read-only)`}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#345d78'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#3f6f8f'; }}
                      >
                        <Eye size={13} />
                        View as
                      </button>
                    )}
                  </div>
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
  const [phone, setPhone] = useState('');
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
          phone: phone.trim() || undefined,
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

          <Field label="Phone" help="US number. Optional — lets a reviewer call the nurse about their notes.">
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(formatUSPhone(e.target.value))}
              style={inputStyle}
              placeholder="(555) 123-4567"
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
  const [email, setEmail] = useState(staff.email || '');
  const [credential, setCredential] = useState(staff.credential || '');
  const [phone, setPhone] = useState(staff.phone || '');
  const [role, setRole] = useState<Role>(staff.role || 'nurse');
  const [busy, setBusy] = useState<null | 'save' | 'deactivate' | 'reactivate' | 'link' | 'approveEmail' | 'dismissEmail' | 'block'>(null);
  const [error, setError] = useState<string | null>(null);
  const emailRequest = staff.emailChangeRequest || null;

  // Case-insensitive comparison so saving without any change to the email
  // doesn't trigger an unnecessary PATCH or a notification to the old address.
  const emailChanged = email.trim().toLowerCase() !== (staff.email || '').toLowerCase();

  const dirty =
    displayName.trim() !== (staff.displayName || '') ||
    credential.trim() !== (staff.credential || '') ||
    phone.trim() !== (staff.phone || '') ||
    role !== staff.role ||
    emailChanged;

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
      if (phone.trim() !== (staff.phone || '')) patchBody.phone = phone.trim();
      if (role !== staff.role) patchBody.role = role;
      if (emailChanged) patchBody.email = email.trim();
      const updated = await patch(patchBody);
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setBusy(null);
    }
  };

  // Approve a self-service email-change request: this performs the real email
  // change (updates Firebase Auth, notifies the old address) and clears the
  // request — same path as an admin typing the new email in directly.
  const handleApproveEmailRequest = async () => {
    if (!emailRequest) return;
    if (!window.confirm(
      `Change ${staff.displayName || 'this user'}'s login email to ${emailRequest.newEmail}? ` +
      `They'll sign in with the new address, and a heads-up goes to the old one (${staff.email}).`
    )) return;
    setBusy('approveEmail');
    setError(null);
    try {
      const updated = await patch({ email: emailRequest.newEmail });
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve the request.');
      setBusy(null);
    }
  };

  // Dismiss a request without changing anything.
  const handleDismissEmailRequest = async () => {
    if (!emailRequest) return;
    setBusy('dismissEmail');
    setError(null);
    try {
      const updated = await patch({ clearEmailRequest: true });
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss the request.');
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

  // Manual "no new notes" lever, independent of any correction flag. The
  // correction-driven block (staff.correctionsBlocked) is NOT toggled here —
  // that one clears when the nurse amends the flagged note or a reviewer
  // removes the block from the note's correction panel.
  const handleToggleManualBlock = async () => {
    const next = !staff.manualNotesBlock;
    if (
      next &&
      !window.confirm(
        `Block ${staff.displayName || 'this user'} from starting or submitting new progress notes? ` +
          `They can still amend existing notes. Lift the block from this screen any time.`,
      )
    )
      return;
    setBusy('block');
    setError(null);
    try {
      const updated = await patch({ manualNotesBlock: next });
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the block.');
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
          {emailRequest && (
            <div style={emailReqBoxStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#a35400' }}>
                <Mail size={15} /> Email change requested
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: '#2c3e50' }}>
                {staff.displayName || 'This user'} asked to change their login email to{' '}
                <strong>{emailRequest.newEmail}</strong>.
              </div>
              {emailRequest.reason && (
                <div style={{ marginTop: 4, fontSize: 13, color: '#5c6b7a' }}>
                  Reason: {emailRequest.reason}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleApproveEmailRequest}
                  disabled={!!busy}
                  style={{ ...approveBtnStyle, ...(busy ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                >
                  {busy === 'approveEmail' ? 'Approving…' : 'Approve & change email'}
                </button>
                <button
                  type="button"
                  onClick={handleDismissEmailRequest}
                  disabled={!!busy}
                  style={{ ...secondaryBtnStyle, ...(busy ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                >
                  {busy === 'dismissEmail' ? 'Dismissing…' : 'Dismiss'}
                </button>
              </div>
            </div>
          )}
          <Field
            label="Email *"
            help={
              emailChanged
                ? `Changing this will change how this person signs in. They'll need to use the new email for their next login. A heads-up email goes to the old address (${staff.email}) so they can flag the change if it wasn't authorized. Existing notes stay linked.`
                : 'Used as both the contact address and the sign-in identifier.'
            }
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              disabled={!!busy}
            />
          </Field>

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

          <Field label="Phone" help="US number. Optional — lets a reviewer call the nurse about their notes.">
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(formatUSPhone(e.target.value))}
              style={inputStyle}
              placeholder="(555) 123-4567"
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

            {staff.active && staff.role === 'nurse' && (
              <button
                type="button"
                onClick={handleToggleManualBlock}
                disabled={!!busy}
                style={staff.manualNotesBlock ? secondaryBtnStyle : dangerBtnStyle}
                title={
                  staff.manualNotesBlock
                    ? 'Allow this nurse to start and submit new progress notes again.'
                    : 'Stop this nurse from starting or submitting NEW progress notes (amending existing notes stays allowed).'
                }
              >
                {busy === 'block'
                  ? 'Saving…'
                  : staff.manualNotesBlock
                    ? 'Unblock new notes'
                    : 'Block new notes'}
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
                  They&apos;ll get an email with a link to set their password. If the link expires before they use it, they can click &quot;Forgot password?&quot; on the sign-in page for a fresh one.
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
                : 'Send this to the person so they can set their password. If it expires before they use it, click "Resend reset link" on the edit modal for a fresh one.'}
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
const sortableThStyle: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
// Search bar matches the Submissions screen's filter bar so the two admin
// tables share one visual language.
const filterBarStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 };
const searchWrapStyle: React.CSSProperties = { position: 'relative', flex: '1 1 260px', minWidth: 220, maxWidth: 420 };
const searchIconStyle: React.CSSProperties = { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7f8c8d', pointerEvents: 'none' };
const searchInputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px 8px 30px', border: '1px solid #dfe5ec', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', background: 'white' };
const matchCountStyle: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f1f3f5', color: '#2c3e50' };
const phoneLinkStyle: React.CSSProperties = { color: '#1a73e8', textDecoration: 'none', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const altRowStyle: React.CSSProperties = { background: '#fafbfc' };
const sectionHeadingStyle: React.CSSProperties = { fontSize: 14, color: '#2c3e50', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 };
const statusBadgeStyle: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', fontSize: 11, fontWeight: 700, borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4 };
const selfBadgeStyle: React.CSSProperties = { marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#eef5ff', color: '#1a3a5c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 };
const testBadgeStyle: React.CSSProperties = { marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fdecea', color: '#a3261c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 };
const blockedBadgeStyle: React.CSSProperties = { marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#7f1d1d', color: 'white', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 };
const viewAsRowBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#3f6f8f', color: 'white', border: 'none', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background 0.15s ease' };
const emailReqChipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, background: '#fff4e5', color: '#a35400', border: '1px solid #f0d9a8', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, letterSpacing: 0.2 };
const emailReqBoxStyle: React.CSSProperties = { background: '#fff8ec', border: '1px solid #f0d9a8', borderRadius: 8, padding: '14px 16px', marginBottom: 18 };
const approveBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#27ae60', color: 'white', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
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
