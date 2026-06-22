'use client';

import { useEffect, useState } from 'react';
import { Phone, Mail, Download, ShieldCheck, Clock, Ban, FileQuestion } from 'lucide-react';

interface Detail {
  label: string;
  value: string;
}
interface SharedReferral {
  partnerAgency: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  county: string;
  program: string;
  referrerName: string;
  details: Detail[];
  submittedAt: string | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; referral: SharedReferral }
  | { kind: 'error'; reason: 'not_found' | 'expired' | 'revoked' | 'unknown' };

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SharedReferralClient({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shared/referrals/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const reason = data.error;
          if (cancelled) return;
          setState({
            kind: 'error',
            reason: reason === 'expired' || reason === 'revoked' || reason === 'not_found' ? reason : 'unknown',
          });
          return;
        }
        const data = await res.json();
        if (!cancelled) setState({ kind: 'ok', referral: data.referral });
      } catch {
        if (!cancelled) setState({ kind: 'error', reason: 'unknown' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={page}>
      <div style={wrap}>
        <div style={brandRow}>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#1a3a5c' }}>Heart &amp; Soul Healthcare</div>
          <div style={{ fontSize: 12, color: '#7f8c8d' }}>Secure referral</div>
        </div>

        {state.kind === 'loading' && <div style={card}><div style={muted}>Loading referral…</div></div>}

        {state.kind === 'error' && (
          <div style={card}>
            <div style={errorIconWrap}>
              {state.reason === 'expired' ? (
                <Clock size={26} />
              ) : state.reason === 'revoked' ? (
                <Ban size={26} />
              ) : (
                <FileQuestion size={26} />
              )}
            </div>
            <h1 style={{ fontSize: 20, color: '#2c3e50', margin: '6px 0' }}>
              {state.reason === 'expired'
                ? 'This link has expired'
                : state.reason === 'revoked'
                  ? 'This link is no longer active'
                  : 'This link is not valid'}
            </h1>
            <p style={muted}>
              Please contact Heart &amp; Soul Healthcare to request an updated link.
            </p>
          </div>
        )}

        {state.kind === 'ok' && <ReferralCard referral={state.referral} token={token} />}

        <div style={footerNote}>
          <ShieldCheck size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Confidential. This page contains protected health information shared securely for care coordination. Do not forward.
        </div>
      </div>
    </div>
  );
}

function ReferralCard({ referral, token }: { referral: SharedReferral; token: string }) {
  const rows: Detail[] = [
    { label: 'Program', value: referral.program },
    { label: 'County', value: referral.county },
    ...(referral.referrerName ? [{ label: 'Referred by', value: referral.referrerName }] : []),
    ...referral.details,
  ];
  return (
    <div style={card}>
      {referral.partnerAgency && (
        <div style={sharedWith}>Shared with {referral.partnerAgency}</div>
      )}
      <h1 style={{ fontSize: 24, color: '#2c3e50', margin: '4px 0 2px' }}>
        {referral.clientName || 'Referral'}
      </h1>
      <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 16 }}>
        Received {fmtDate(referral.submittedAt)}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {referral.clientPhone && (
          <a href={`tel:${referral.clientPhone}`} style={chip}>
            <Phone size={14} /> {referral.clientPhone}
          </a>
        )}
        {referral.clientEmail && (
          <a href={`mailto:${referral.clientEmail}`} style={chip}>
            <Mail size={14} /> {referral.clientEmail}
          </a>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          {rows.map((d, i) => (
            <tr key={i}>
              <td style={labelCell}>{d.label}</td>
              <td style={valueCell}>{d.value ? d.value : <span style={{ color: '#9ca3af' }}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 20 }}>
        <a href={`/api/shared/referrals/${encodeURIComponent(token)}/pdf`} style={dlBtn}>
          <Download size={16} /> Download PDF
        </a>
      </div>
    </div>
  );
}

const page: React.CSSProperties = { minHeight: '100vh', background: '#f5f7fa', padding: '32px 16px' };
const wrap: React.CSSProperties = { maxWidth: 640, margin: '0 auto' };
const brandRow: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16,
};
const card: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};
const sharedWith: React.CSSProperties = {
  display: 'inline-block', background: '#eef5ff', color: '#1a3a5c', fontSize: 12, fontWeight: 700,
  padding: '3px 10px', borderRadius: 999, marginBottom: 10,
};
const muted: React.CSSProperties = { color: '#7f8c8d', fontSize: 14 };
const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f5f7fa', border: '1px solid #e5e7eb',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, color: '#1a3a5c', textDecoration: 'none', fontWeight: 600,
};
const labelCell: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid #eef0f2', background: '#f9fafb', fontWeight: 600,
  color: '#5c6b7a', width: 160, verticalAlign: 'top',
};
const valueCell: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid #eef0f2', color: '#111827', whiteSpace: 'pre-wrap',
};
const dlBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1a3a5c', color: 'white',
  textDecoration: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700,
};
const errorIconWrap: React.CSSProperties = {
  width: 48, height: 48, borderRadius: 999, background: '#fef2f2', color: '#b3261e',
  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6,
};
const footerNote: React.CSSProperties = {
  marginTop: 16, fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.5,
};
