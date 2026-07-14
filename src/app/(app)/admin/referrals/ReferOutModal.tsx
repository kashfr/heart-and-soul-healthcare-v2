'use client';

import { useEffect, useState } from 'react';
import { X, Copy, Check, FileText } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import type { GappServiceKey } from '@/lib/georgia';
import { matchAgencies, topSuggestions } from '@/lib/agencyMatch';
import { PROVIDER_LIST_URL } from '@/lib/shareLink';
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
  clientEmail,
  onClose,
  onDone,
}: {
  referralId: string;
  referralName: string;
  county: string;
  service: GappServiceKey | null;
  clientEmail: string;
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
  // 'agency' = record which partner took the client (default); 'providerList' =
  // no partner matches, so email the family the official GAPP provider list.
  const [mode, setMode] = useState<'agency' | 'providerList'>('agency');
  const [familyEmail, setFamilyEmail] = useState(clientEmail);
  const [copied, setCopied] = useState(false);

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

  // Provider-list path: email the family the hosted Appendix P link (or, with
  // noEmail, just record that the link was given by phone/text) and move the
  // card. The server sends first and records only on success.
  const submitProviderList = async (noEmail: boolean) => {
    if (saving) return;
    if (!noEmail && !familyEmail.trim()) {
      setError('Enter the family email, or use the no-email option below.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referralId}/provider-list`, {
        method: 'POST',
        body: JSON.stringify(noEmail ? { noEmail: true } : { email: familyEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the provider list.');
      setSaving(false);
    }
  };

  const copyListLink = async () => {
    try {
      await navigator.clipboard.writeText(PROVIDER_LIST_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; the link is visible to copy manually */
    }
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={header}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#2c3e50' }}>Refer out</div>
          <button onClick={onClose} style={closeBtn} aria-label="Cancel"><X size={18} /></button>
        </div>

        {mode === 'agency' ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13.5, color: '#5c6b7a', lineHeight: 1.5 }}>
              You&apos;re moving <strong>{referralName}</strong> to Referred Out without a share link.
              Record which agency it was handed off to so it&apos;s captured.
            </div>

            {agencies.length > 0 && suggestions.length === 0 && (
              <div style={noMatchBox}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  <FileText size={13} style={{ verticalAlign: -2 }} /> No partner agency matches
                </div>
                None of your saved agencies {county ? `covers ${county}` : 'match this referral'}.
                You can email the family the official GAPP provider list instead.
                <button type="button" onClick={() => { setMode('providerList'); setError(null); }} style={noMatchBtn}>
                  Email the provider list
                </button>
              </div>
            )}

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

            {/* Shown whenever the no-match banner above isn't (banner has its own
                button) — including the empty-directory case, so the provider-list
                path is always reachable. */}
            {!(agencies.length > 0 && suggestions.length === 0) && (
              <button
                type="button"
                onClick={() => { setMode('providerList'); setError(null); }}
                style={modeSwitchLink}
              >
                No agency can take this? Email the family the GAPP provider list instead.
              </button>
            )}
          </div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13.5, color: '#5c6b7a', lineHeight: 1.5 }}>
              Email the family of <strong>{referralName}</strong> the official list of
              Medicaid-approved GAPP providers (Appendix P), record it, and move the card
              to Referred Out.
            </div>

            <input
              value={familyEmail}
              onChange={(e) => setFamilyEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitProviderList(false); }}
              placeholder="Family email"
              type="email"
              style={input}
              autoFocus
            />

            {error && <div style={{ color: '#b3261e', fontSize: 13 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button onClick={onClose} style={ghostBtn}>Cancel</button>
              <button
                onClick={() => submitProviderList(false)}
                disabled={saving || !familyEmail.trim()}
                style={{ ...primaryBtn, opacity: saving || !familyEmail.trim() ? 0.55 : 1 }}
              >
                {saving ? 'Sending…' : 'Email list & move to Referred Out'}
              </button>
            </div>

            <div style={noEmailBox}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No email on file?</div>
              Copy the link to text or read off by phone, then record it:
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={copyListLink} style={ghostBtn}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy list link'}
                </button>
                <button
                  type="button"
                  onClick={() => submitProviderList(true)}
                  disabled={saving}
                  style={{ ...ghostBtn, color: '#1a3a5c' }}
                >
                  Mark as given &amp; move
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { setMode('agency'); setError(null); }}
              style={modeSwitchLink}
            >
              Back to recording an agency instead
            </button>
          </div>
        )}
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
const noMatchBox: React.CSSProperties = {
  background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px',
  fontSize: 12.5, color: '#9a6400', lineHeight: 1.5,
};
const noMatchBtn: React.CSSProperties = {
  display: 'block', marginTop: 8, background: '#1a3a5c', color: 'white', border: 'none',
  borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
};
const noEmailBox: React.CSSProperties = {
  background: '#f5f7fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px',
  fontSize: 12.5, color: '#5c6b7a', lineHeight: 1.5, marginTop: 4,
};
const modeSwitchLink: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#1a3a5c', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0,
  textAlign: 'left', marginTop: 2,
};
