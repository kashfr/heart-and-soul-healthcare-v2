'use client';

import { useState } from 'react';
import { Phone, Mail, Clock, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { authedFetch } from '@/lib/authedFetch';
import { formatUSPhone } from '@/lib/phone';

export default function MyProfilePage() {
  // Always the REAL signed-in user (never the impersonated nurse): you only
  // ever edit your own profile here.
  const { user, profile, role, loading } = useAuth();

  const [phone, setPhone] = useState('');
  const [phoneInit, setPhoneInit] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [reason, setReason] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  // Seed the phone field once the profile lands (can't use useEffect deps on a
  // fast-changing object without a guard; a one-shot init flag is simplest).
  if (!phoneInit && profile) {
    setPhone(profile.phone || '');
    setPhoneInit(true);
  }

  if (loading) return <div style={containerStyle}><div style={cardStyle}>Loading…</div></div>;
  if (!user || !profile) return <div style={containerStyle}><div style={cardStyle}>Not signed in.</div></div>;

  const pendingRequest = profile.emailChangeRequest?.status === 'pending'
    ? profile.emailChangeRequest
    : null;
  const phoneDirty = phone.trim() !== (profile.phone || '');

  const savePhone = async () => {
    setPhoneBusy(true);
    setPhoneErr(null);
    setPhoneMsg(null);
    try {
      const res = await authedFetch('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      // The live profile subscription will refresh; reflect the normalized value.
      if (typeof data.phone === 'string') setPhone(data.phone);
      setPhoneMsg('Phone number saved.');
    } catch (err) {
      setPhoneErr(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setPhoneBusy(false);
    }
  };

  const submitEmailRequest = async () => {
    setEmailBusy(true);
    setEmailErr(null);
    try {
      const res = await authedFetch('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ emailChangeRequest: { newEmail: newEmail.trim(), reason: reason.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit request.');
      setNewEmail('');
      setReason('');
      // The pending banner appears automatically via the live profile subscription.
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : 'Could not submit request.');
    } finally {
      setEmailBusy(false);
    }
  };

  const withdrawEmailRequest = async () => {
    setEmailBusy(true);
    setEmailErr(null);
    try {
      const res = await authedFetch('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ cancelEmailRequest: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not withdraw request.');
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : 'Could not withdraw request.');
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>My Profile</h1>
        <p style={subtitleStyle}>
          Update your contact number, or request a change to your login email. Email
          changes are reviewed by an administrator before they take effect.
        </p>

        {/* Read-only identity */}
        <div style={readonlyGridStyle}>
          <div>
            <div style={labelStyle}>Name</div>
            <div style={valueStyle}>{profile.displayName || '—'}</div>
          </div>
          <div>
            <div style={labelStyle}>Role &amp; credential</div>
            <div style={{ ...valueStyle, textTransform: 'capitalize' }}>
              {role || '—'}{profile.credential ? ` · ${profile.credential}` : ''}
            </div>
          </div>
        </div>
        <p style={hintStyle}>Your name, role, and credential are managed by an administrator.</p>

        {/* Phone (self-editable) */}
        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <Phone size={16} color="#1a3a5c" />
            <h2 style={sectionTitleStyle}>Phone number</h2>
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(formatUSPhone(e.target.value)); setPhoneMsg(null); setPhoneErr(null); }}
            placeholder="(555) 123-4567"
            style={inputStyle}
            aria-label="Phone number"
          />
          {phoneErr && <div style={errStyle}>{phoneErr}</div>}
          {phoneMsg && <div style={okStyle}><Check size={13} /> {phoneMsg}</div>}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={savePhone}
              disabled={phoneBusy || !phoneDirty}
              style={{ ...primaryBtn, ...(phoneBusy || !phoneDirty ? disabledBtn : {}) }}
            >
              {phoneBusy ? 'Saving…' : 'Save phone'}
            </button>
          </div>
        </section>

        {/* Email (request only) */}
        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <Mail size={16} color="#1a3a5c" />
            <h2 style={sectionTitleStyle}>Login email</h2>
          </div>
          <div style={labelStyle}>Current email</div>
          <div style={{ ...valueStyle, marginBottom: 14 }}>{profile.email || user.email || '—'}</div>

          {pendingRequest ? (
            <div style={pendingBoxStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#a35400' }}>
                <Clock size={15} /> Request pending admin approval
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: '#2c3e50' }}>
                Requested new email: <strong>{pendingRequest.newEmail}</strong>
              </div>
              {pendingRequest.reason && (
                <div style={{ marginTop: 4, fontSize: 13, color: '#5c6b7a' }}>
                  Reason: {pendingRequest.reason}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12.5, color: '#5c6b7a' }}>
                Your login stays the same until an administrator approves the change.
              </div>
              {emailErr && <div style={errStyle}>{emailErr}</div>}
              <div style={{ marginTop: 10 }}>
                <button type="button" onClick={withdrawEmailRequest} disabled={emailBusy} style={secondaryBtn}>
                  {emailBusy ? 'Working…' : 'Withdraw request'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={labelStyle}>New email address</div>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setEmailErr(null); }}
                placeholder="you@example.com"
                style={inputStyle}
                aria-label="New email address"
              />
              <div style={{ ...labelStyle, marginTop: 12 }}>Reason (optional)</div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why do you need this change? (optional)"
                rows={3}
                style={textareaStyle}
                aria-label="Reason for email change"
              />
              {emailErr && <div style={errStyle}>{emailErr}</div>}
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={submitEmailRequest}
                  disabled={emailBusy || !newEmail.trim()}
                  style={{ ...primaryBtn, ...(emailBusy || !newEmail.trim() ? disabledBtn : {}) }}
                >
                  {emailBusy ? 'Submitting…' : 'Request email change'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// --- styles ---
const containerStyle: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: 20 };
const cardStyle: React.CSSProperties = { background: 'white', padding: 30, borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' };
const titleStyle: React.CSSProperties = { color: '#2c3e50', fontSize: 24, margin: '0 0 4px' };
const subtitleStyle: React.CSSProperties = { color: '#5c6b7a', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 };
const readonlyGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '14px 0', borderTop: '1px solid #eef1f4', borderBottom: '1px solid #eef1f4' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.4 };
const valueStyle: React.CSSProperties = { fontSize: 15, color: '#2c3e50', marginTop: 3 };
const hintStyle: React.CSSProperties = { fontSize: 12.5, color: '#94a3b8', margin: '8px 0 0' };
const sectionStyle: React.CSSProperties = { marginTop: 24 };
const sectionHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 };
const sectionTitleStyle: React.CSSProperties = { fontSize: 16, color: '#2c3e50', margin: 0 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical' };
const primaryBtn: React.CSSProperties = { background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtn: React.CSSProperties = { background: 'white', color: '#1a3a5c', border: '1px solid #1a3a5c', borderRadius: 6, padding: '8px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const disabledBtn: React.CSSProperties = { opacity: 0.5, cursor: 'not-allowed' };
const errStyle: React.CSSProperties = { color: '#b3261e', fontSize: 13, marginTop: 8 };
const okStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, color: '#166534', fontSize: 13, marginTop: 8 };
const pendingBoxStyle: React.CSSProperties = { background: '#fff8ec', border: '1px solid #f0d9a8', borderRadius: 8, padding: '14px 16px' };
