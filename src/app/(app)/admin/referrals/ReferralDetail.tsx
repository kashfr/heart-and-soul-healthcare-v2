'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X, Phone, Mail, Printer, MessageSquare, ArrowRightLeft, UserCheck,
  Inbox, PhoneCall, Send, Share2, Copy, Check, Trash2, Plus,
} from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import {
  fieldRows, formatDateTime, formatRelative,
  REFERRAL_STAGES, STAGE_ACCENT, STAGE_LABEL, SOURCE_LABEL,
  type Referral, type ReferralActivity, type ReferralActivityType,
  type ReferralStage, type StaffOption, type ReferralShare, type ShareStatus,
} from './types';

interface Props {
  referral: Referral;
  staff: StaffOption[];
  busy: boolean;
  onClose: () => void;
  onStageChange: (stage: ReferralStage) => void;
  onAssign: (assignee: { uid: string; name: string } | null) => void;
  onPrint: (referral: Referral) => void;
  onDelete: () => void;
  canDelete: boolean;
}

export default function ReferralDetail({
  referral, staff, busy, onClose, onStageChange, onAssign, onPrint, onDelete, canDelete,
}: Props) {
  const [activity, setActivity] = useState<ReferralActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'note' | 'contact'>('note');
  const [savingNote, setSavingNote] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referral.id}/activity`);
      if (!res.ok) throw new Error(`Request failed (${res.status}).`);
      const data = await res.json();
      setActivity(data.activity ?? []);
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : 'Could not load activity.');
    } finally {
      setActivityLoading(false);
    }
  }, [referral.id]);

  // Reload on open (id change) and whenever the referral is mutated elsewhere
  // (stage move / assignment bumps updatedAt), so server-logged entries appear.
  useEffect(() => {
    loadActivity();
  }, [loadActivity, referral.updatedAt]);

  const addNote = async () => {
    const text = noteText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referral.id}/activity`, {
        method: 'POST',
        body: JSON.stringify({ type: noteType, text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      const data = await res.json();
      if (data.entry) setActivity((prev) => [data.entry, ...prev]);
      setNoteText('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not add note.');
    } finally {
      setSavingNote(false);
    }
  };

  const rows = fieldRows(referral);

  return (
    <div style={backdropStyle} onClick={onClose}>
      <aside
        style={drawerStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Referral from ${referral.clientName || 'unknown'}`}
      >
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={nameStyle}>{referral.clientName || 'Referral'}</div>
            <div style={subStyle}>
              <span style={sourceBadge}>{SOURCE_LABEL[referral.source] ?? referral.source}</span>
              {' · '}
              Received {formatDateTime(referral.submittedAt) || '—'}
            </div>
            {referral.statusUpdatedByName && (
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 3 }}>
                Last updated by {referral.statusUpdatedByName}
              </div>
            )}
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div style={bodyStyle}>
          {/* Contact */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {referral.clientPhone && (
              <a href={`tel:${referral.clientPhone}`} style={contactChipStyle}>
                <Phone size={14} /> {referral.clientPhone}
              </a>
            )}
            {referral.clientEmail && (
              <a href={`mailto:${referral.clientEmail}`} style={contactChipStyle}>
                <Mail size={14} /> {referral.clientEmail}
              </a>
            )}
          </div>

          {/* Stage + assignee controls */}
          <div style={controlsRowStyle}>
            <label style={controlBlockStyle}>
              <span style={controlLabelStyle}>Stage</span>
              <div style={{ position: 'relative' }}>
                <span
                  style={{ ...stageDot, background: STAGE_ACCENT[referral.stage] }}
                  aria-hidden
                />
                <select
                  value={referral.stage}
                  disabled={busy}
                  onChange={(e) => onStageChange(e.target.value as ReferralStage)}
                  style={{ ...selectStyle, paddingLeft: 28 }}
                >
                  {REFERRAL_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label style={controlBlockStyle}>
              <span style={controlLabelStyle}>Assigned to</span>
              <select
                value={referral.assigneeUid ?? ''}
                disabled={busy}
                onChange={(e) => {
                  const uid = e.target.value;
                  if (!uid) return onAssign(null);
                  const member = staff.find((s) => s.uid === uid);
                  onAssign(member ? { uid: member.uid, name: member.displayName } : null);
                }}
                style={selectStyle}
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Fields */}
          <table style={detailTableStyle}>
            <tbody>
              {rows.map((d, i) => (
                <tr key={i}>
                  <td style={detailLabelStyle}>{d.label}</td>
                  <td style={detailValueStyle}>
                    {d.value ? d.value : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Share with a partner agency */}
          <div style={sectionTitleStyle}>Share with agency</div>
          <SharePanel referralId={referral.id} />

          {/* Activity timeline */}
          <div style={sectionTitleStyle}>Activity</div>

          <div style={composerStyle}>
            <div style={composerTabsStyle}>
              <button
                type="button"
                onClick={() => setNoteType('note')}
                style={noteType === 'note' ? { ...composerTab, ...composerTabActive } : composerTab}
              >
                <MessageSquare size={13} /> Note
              </button>
              <button
                type="button"
                onClick={() => setNoteType('contact')}
                style={noteType === 'contact' ? { ...composerTab, ...composerTabActive } : composerTab}
              >
                <PhoneCall size={13} /> Log contact
              </button>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addNote();
              }}
              placeholder={
                noteType === 'note'
                  ? 'Add a note about this referral…'
                  : 'Log a call or outreach attempt…'
              }
              rows={2}
              style={textareaStyle}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={addNote}
                disabled={!noteText.trim() || savingNote}
                style={{
                  ...addNoteBtnStyle,
                  opacity: !noteText.trim() || savingNote ? 0.55 : 1,
                  cursor: !noteText.trim() || savingNote ? 'not-allowed' : 'pointer',
                }}
              >
                <Send size={14} /> {savingNote ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>

          {activityLoading ? (
            <div style={activityEmptyStyle}>Loading activity…</div>
          ) : activityError ? (
            <div style={{ ...activityEmptyStyle, color: '#b3261e' }}>{activityError}</div>
          ) : activity.length === 0 ? (
            <div style={activityEmptyStyle}>No activity yet.</div>
          ) : (
            <ul style={timelineStyle}>
              {activity.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button onClick={() => onPrint(referral)} style={ghostBtnStyle}>
            <Printer size={15} /> Print call sheet
          </button>
          {canDelete && (
            <>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => {
                  if (
                    confirm(
                      `Delete the referral for ${referral.clientName || 'this client'}? It will be removed from the board. An admin can recover it from the deleted-referrals audit.`
                    )
                  ) {
                    onDelete();
                  }
                }}
                style={deleteBtnStyle}
              >
                <Trash2 size={15} /> Delete
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

const ACTIVITY_ICON: Record<ReferralActivityType, React.ReactNode> = {
  created: <Inbox size={14} />,
  stage_change: <ArrowRightLeft size={14} />,
  assignment: <UserCheck size={14} />,
  note: <MessageSquare size={14} />,
  contact: <PhoneCall size={14} />,
  share: <Share2 size={14} />,
};

function ActivityRow({ entry }: { entry: ReferralActivity }) {
  const isManual = entry.type === 'note' || entry.type === 'contact';
  return (
    <li style={timelineItemStyle}>
      <div style={timelineIconStyle}>{ACTIVITY_ICON[entry.type]}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            ...timelineTextStyle,
            ...(isManual ? { background: '#f8fafc', padding: '8px 10px', borderRadius: 8 } : {}),
          }}
        >
          {entry.text}
        </div>
        <div style={timelineMetaStyle}>
          {entry.byName}
          {entry.at ? ` · ${formatRelative(entry.at)}` : ''}
        </div>
      </div>
    </li>
  );
}

const SHARE_STATUS_STYLE: Record<ShareStatus, React.CSSProperties> = {
  active: { background: '#e7f6ec', color: '#1e7a3d' },
  viewed: { background: '#eef5ff', color: '#1a3a5c' },
  expired: { background: '#fff4e0', color: '#9a6400' },
  revoked: { background: '#eef0f2', color: '#5c6b7a' },
};

const EXPIRY_OPTIONS = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

function SharePanel({ referralId }: { referralId: string }) {
  const [shares, setShares] = useState<ReferralShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [agency, setAgency] = useState('');
  const [email, setEmail] = useState('');
  const [expiry, setExpiry] = useState(14);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<{ id: string; name: string; email: string }[]>([]);

  // Saved partner agencies power the name autocomplete + email auto-fill.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/admin/agencies');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setAgencies(
            (data.agencies ?? []).map((a: { id: string; name: string; email: string }) => ({
              id: a.id, name: a.name, email: a.email,
            }))
          );
        }
      } catch {
        /* non-fatal: autocomplete just won't be available */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onAgencyName = (value: string) => {
    setAgency(value);
    const match = agencies.find((a) => a.name.toLowerCase() === value.trim().toLowerCase());
    if (match) setEmail(match.email);
  };

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referralId}/shares`);
      if (!res.ok) throw new Error(`Request failed (${res.status}).`);
      const data = await res.json();
      setShares(data.shares ?? []);
    } catch {
      // Non-fatal: show an empty panel rather than blocking the drawer.
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [referralId]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  const submit = async () => {
    if (!agency.trim() || !email.trim() || creating) return;
    setCreating(true);
    setFormError(null);
    setCreated(null);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referralId}/shares`, {
        method: 'POST',
        body: JSON.stringify({ partnerAgency: agency.trim(), partnerEmail: email.trim(), expiresInDays: expiry }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setCreated({ link: data.link, emailSent: !!data.emailSent });
      setAgency('');
      setEmail('');
      setShowForm(false);
      loadShares();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create share.');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (shareId: string) => {
    if (!confirm('Revoke this link? The partner agency will no longer be able to open it.')) return;
    try {
      const res = await authedFetch(`/api/admin/referrals/${referralId}/shares/${shareId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      loadShares();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not revoke share.');
    }
  };

  const copyLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the link is visible to copy manually */
    }
  };

  // Re-copy an existing share's link anytime (Option 2). Built from the token +
  // current origin so it's correct in any environment.
  const copyShareLink = async (share: ReferralShare) => {
    if (!share.token) return;
    const link = `${window.location.origin}/shared/referral/${share.token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedShareId(share.id);
      setTimeout(() => setCopiedShareId((id) => (id === share.id ? null : id)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div style={{ marginBottom: 8 }}>
      {created && (
        <div style={created.emailSent ? createdBox : createdBoxWarn}>
          <div style={{ fontWeight: 700, color: created.emailSent ? '#1e7a3d' : '#9a6400', marginBottom: 6 }}>
            {created.emailSent
              ? 'Link created and emailed'
              : '⚠ Link created, but the email could not be sent — copy the link below and send it manually.'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input readOnly value={created.link} style={{ ...shareInput, flex: 1 }} onFocus={(e) => e.target.select()} />
            <button onClick={copyLink} style={copyBtn}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 6 }}>
            Copy it now — for security, the link can&apos;t be shown again.
          </div>
        </div>
      )}

      {!showForm ? (
        <button onClick={() => { setShowForm(true); setCreated(null); }} style={shareCtaBtn}>
          <Plus size={15} /> Share with an agency
        </button>
      ) : (
        <div style={shareFormBox}>
          <input
            value={agency}
            onChange={(e) => onAgencyName(e.target.value)}
            placeholder="Partner agency name"
            style={shareInput}
            list="referral-agency-options"
            autoComplete="off"
          />
          <datalist id="referral-agency-options">
            {agencies.map((a) => (
              <option key={a.id} value={a.name} />
            ))}
          </datalist>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Partner email"
            type="email"
            style={shareInput}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: '#5c6b7a' }}>Expires in</span>
            <select value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} style={shareSelect}>
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>{o.label}</option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setShowForm(false); setFormError(null); }} style={shareCancelBtn}>Cancel</button>
            <button onClick={submit} disabled={creating || !agency.trim() || !email.trim()} style={shareSubmitBtn}>
              {creating ? 'Sending…' : 'Create & email link'}
            </button>
          </div>
          {formError && <div style={{ color: '#b3261e', fontSize: 12.5 }}>{formError}</div>}
        </div>
      )}

      {!loading && shares.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shares.map((s) => (
            <div key={s.id} style={shareRow}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2c3e50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.partnerAgency}
                </div>
                <div style={{ fontSize: 11.5, color: '#9ca3af' }}>
                  {s.partnerEmail} · {s.viewCount} view{s.viewCount === 1 ? '' : 's'}
                  {s.lastViewedAt ? ` · last ${formatRelative(s.lastViewedAt)}` : ''}
                </div>
              </div>
              <span style={{ ...shareBadge, ...SHARE_STATUS_STYLE[s.status] }}>{s.status}</span>
              {s.token && s.status !== 'revoked' && s.status !== 'expired' && (
                <button
                  onClick={() => copyShareLink(s)}
                  style={copyRowBtn}
                  title="Copy link"
                  aria-label={`Copy link for ${s.partnerAgency}`}
                >
                  {copiedShareId === s.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
              {s.status !== 'revoked' && s.status !== 'expired' && (
                <button onClick={() => revoke(s.id)} style={revokeBtn} title="Revoke link">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The custom chevron-down used on selects everywhere else on the site (matches
// the patient form's "Sex" dropdown). Split so the right offset can vary per
// select while the SVG itself stays identical.
const CHEVRON_URL =
  "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat";
const SELECT_CHEVRON = `${CHEVRON_URL} right 12px center`;

const createdBox: React.CSSProperties = {
  border: '1px solid #cdebd6', background: '#f3fbf6', borderRadius: 10, padding: 12, marginBottom: 12,
};
const createdBoxWarn: React.CSSProperties = {
  border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 12,
};
const shareCtaBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', color: '#1a3a5c',
  border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};
const shareFormBox: React.CSSProperties = {
  border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
};
const shareInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8,
  padding: '8px 10px', fontSize: 13.5, fontFamily: 'inherit', color: '#111827',
};
const shareSelect: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 8px', paddingRight: 24,
  fontSize: 13, fontFamily: 'inherit', color: '#111827',
  background: `${CHEVRON_URL} right 8px center`, backgroundSize: '14px', cursor: 'pointer',
};
const shareSubmitBtn: React.CSSProperties = {
  background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
const shareCancelBtn: React.CSSProperties = {
  background: 'transparent', color: '#5c6b7a', border: 'none', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};
const copyBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, background: 'white', color: '#1a3a5c',
  border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};
const shareRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #eef0f2', borderRadius: 8, padding: '8px 10px',
};
const shareBadge: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'capitalize', whiteSpace: 'nowrap',
};
const copyRowBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#1a3a5c', cursor: 'pointer', display: 'inline-flex', padding: 4,
};
const revokeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#b3261e', cursor: 'pointer', display: 'inline-flex', padding: 4,
};

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.45)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'flex-end',
};
const drawerStyle: React.CSSProperties = {
  background: 'white',
  width: '100%',
  maxWidth: 480,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '-12px 0 40px rgba(0,0,0,0.22)',
  animation: 'referralDrawerIn 0.18s ease',
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '18px 20px',
  borderBottom: '1px solid #e5e7eb',
};
const nameStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#2c3e50',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const subStyle: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', marginTop: 4 };
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  display: 'inline-flex',
  flexShrink: 0,
};
const bodyStyle: React.CSSProperties = { padding: 20, overflowY: 'auto', flex: 1 };
const sourceBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#eef5ff',
  color: '#1a3a5c',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
};
const contactChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#f5f7fa',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 13,
  color: '#1a3a5c',
  textDecoration: 'none',
  fontWeight: 600,
};
const controlsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  marginBottom: 18,
  flexWrap: 'wrap',
};
const controlBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  flex: 1,
  minWidth: 150,
};
const controlLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: '#7f8c8d',
};
const selectStyle: React.CSSProperties = {
  width: '100%',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 12px',
  paddingRight: 36,
  fontSize: 14,
  fontFamily: 'inherit',
  color: '#111827',
  background: SELECT_CHEVRON,
  backgroundSize: '14px',
  cursor: 'pointer',
};
const stageDot: React.CSSProperties = {
  position: 'absolute',
  left: 11,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 9,
  height: 9,
  borderRadius: 999,
  pointerEvents: 'none',
};
const detailTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};
const detailLabelStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #eef0f2',
  background: '#f9fafb',
  fontWeight: 600,
  color: '#5c6b7a',
  width: 150,
  verticalAlign: 'top',
};
const detailValueStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #eef0f2',
  color: '#111827',
  whiteSpace: 'pre-wrap',
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: '#5c6b7a',
  margin: '22px 0 10px',
};
const composerStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 10,
  marginBottom: 16,
  background: '#fff',
};
const composerTabsStyle: React.CSSProperties = { display: 'flex', gap: 4, marginBottom: 8 };
const composerTab: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 7,
  padding: '5px 10px',
  fontSize: 12.5,
  fontWeight: 600,
  color: '#5c6b7a',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const composerTabActive: React.CSSProperties = {
  background: '#eef5ff',
  border: '1px solid #d6e4f5',
  color: '#1a3a5c',
};
const textareaStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 14,
  fontFamily: 'inherit',
  color: '#111827',
  resize: 'vertical',
  marginBottom: 8,
  boxSizing: 'border-box',
};
const addNoteBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#1a3a5c',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
};
const activityEmptyStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#94a3b8',
  padding: '8px 0',
};
const timelineStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};
const timelineItemStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
};
const timelineIconStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 999,
  background: '#eef5ff',
  color: '#1a3a5c',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
const timelineTextStyle: React.CSSProperties = {
  fontSize: 13.5,
  color: '#374151',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.45,
};
const timelineMetaStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: '#9ca3af',
  marginTop: 3,
};
const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 20px',
  borderTop: '1px solid #e5e7eb',
};
const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'white',
  color: '#5c6b7a',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const deleteBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'white',
  color: '#b3261e',
  border: '1px solid #f0c2bd',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
