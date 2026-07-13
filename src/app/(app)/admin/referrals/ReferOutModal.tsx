'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import type { GappServiceKey } from '@/lib/georgia';
import { matchAgencies, topSuggestions } from '@/lib/agencyMatch';
import MatchSuggestions from './MatchSuggestions';

// Required capture when a referral is dragged into "Referred Out" without ever
// being shared. We record which agency it was handed off to (a manual share
// record — no link emailed) and then move the card. Cancelling leaves the card
// where it was, so nothing lands in Referred Out without a captured agency.
export default function ReferOutModal({
  referralId,
  referralName,
  county,
  service,
  onClose,
  onDone,
}: {
  referralId: string;
  referralName: string;
  county: string;
  service: GappServiceKey | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [agencies, setAgencies] = useState<
    { id: string; name: string; email: string; counties: string[]; services: string[] }[]
  >([]);
  const [agency, setAgency] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/admin/agencies');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setAgencies(
            (data.agencies ?? []).map(
              (a: { id: string; name: string; email: string; counties?: string[]; services?: string[] }) => ({
                id: a.id, name: a.name, email: a.email,
                counties: a.counties ?? [], services: a.services ?? [],
              })
            )
          );
        }
      } catch {
        /* non-fatal: autocomplete just won't be available */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Smart-match: rank the directory against this referral's county + care need.
  const suggestions = topSuggestions(matchAgencies({ county, service }, agencies));

  const onAgencyName = (value: string) => {
    setAgency(value);
    const match = agencies.find((a) => a.name.toLowerCase() === value.trim().toLowerCase());
    if (match) setEmail(match.email);
  };

  const submit = async () => {
    if (saving) return;
    if (!agency.trim()) {
      setError('Enter the agency you referred this client to.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referralId}/shares`, {
        method: 'POST',
        body: JSON.stringify({
          recipients: [{ partnerAgency: agency.trim(), partnerEmail: email.trim() }],
          manual: true,
          moveToReferredOut: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the referral.');
      setSaving(false);
    }
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={header}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#2c3e50' }}>Refer out</div>
          <button onClick={onClose} style={closeBtn} aria-label="Cancel"><X size={18} /></button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13.5, color: '#5c6b7a', lineHeight: 1.5 }}>
            You&apos;re moving <strong>{referralName}</strong> to Referred Out without a share link.
            Record which agency it was handed off to so it&apos;s captured.
          </div>

          <MatchSuggestions
            matches={suggestions}
            onPick={(a) => { setAgency(a.name); setEmail(a.email); setError(null); }}
          />

          <input
            value={agency}
            onChange={(e) => onAgencyName(e.target.value)}
            placeholder="Agency name (required)"
            style={input}
            list="referout-agency-options"
            autoComplete="off"
            autoFocus
          />
          <datalist id="referout-agency-options">
            {agencies.map((a) => <option key={a.id} value={a.name} />)}
          </datalist>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="Agency email (optional)"
            type="email"
            style={input}
          />

          {error && <div style={{ color: '#b3261e', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button
              onClick={submit}
              disabled={saving || !agency.trim()}
              style={{ ...primaryBtn, opacity: saving || !agency.trim() ? 0.55 : 1 }}
            >
              {saving ? 'Saving…' : 'Move to Referred Out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const card: React.CSSProperties = {
  background: 'white', borderRadius: 12, width: '100%', maxWidth: 440,
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
const header: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
};
const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex',
};
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8,
  padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', color: '#111827',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', color: '#5c6b7a',
  border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px',
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
