'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RotateCcw } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { authedFetch } from '@/lib/authedFetch';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type SubmissionsSortKey,
  type SubmissionsSortDir,
  type SubmissionsScope,
} from '@/lib/settings';

/**
 * /admin/settings — admin-only org-wide configuration.
 *
 * Today's settings are scoped to Submissions list defaults. New
 * sections (cosign requirements, branding, etc.) get added here as
 * additional <section> blocks following the same pattern: read the
 * value from `draft`, render an input bound to setDraft, save the
 * whole `draft` shape via PUT /api/admin/settings.
 */
export default function AdminSettingsPage() {
  const { role, loading: authLoading } = useAuth();
  const { settings, ready, refresh } = useSettings();

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Keep the draft in sync with the live settings until the user
  // starts editing. Once they make a change, the dirty draft "wins"
  // and we don't clobber their input on a background refresh.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);

  if (authLoading) return null;
  if (role !== 'admin') {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <p style={{ color: '#7f8c8d' }}>Admin only.</p>
        </div>
      </div>
    );
  }

  const updateSubmissions = <K extends keyof AppSettings['submissions']>(
    key: K,
    value: AppSettings['submissions'][K],
  ) => {
    setDirty(true);
    setDraft((prev) => ({
      ...prev,
      submissions: { ...prev.submissions, [key]: value },
    }));
  };

  const showToast = (kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showToast('err', err.error || `Save failed (${res.status})`);
        return;
      }
      await refresh();
      setDirty(false);
      showToast('ok', 'Settings saved');
    } catch {
      showToast('err', 'Network error — try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    setDirty(true);
    setDraft(DEFAULT_SETTINGS);
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/admin" style={backLinkStyle}>
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
        </div>

        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Settings</h1>
            <p style={subtitleStyle}>
              Org-wide defaults. Changes apply to everyone on the next page load — there&apos;s no
              need to restart or redeploy.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={handleResetToDefaults}
              style={secondaryBtnStyle}
              disabled={saving}
              title="Replace the form below with the hard-coded defaults. You still need to click Save to apply."
            >
              <RotateCcw size={14} /> Reset form
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={primaryBtnStyle}
              disabled={saving || !dirty}
            >
              <Save size={14} /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
          </div>
        </header>

        {!ready && (
          <div style={infoBannerStyle}>
            Loading the latest settings… you can still edit, but a background fetch may
            replace your draft if you haven&apos;t typed anything yet.
          </div>
        )}

        {/* --- Submissions list defaults --- */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Submissions list</h2>
          <p style={sectionSubStyle}>
            What everyone sees when they open <code>/admin/submissions</code> with no
            filters. Individual nurses can still sort / filter however they want — these
            are just the starting points.
          </p>

          <div style={fieldGridStyle}>
            <Field label="Default sort column">
              <select
                value={draft.submissions.defaultSort}
                onChange={(e) =>
                  updateSubmissions('defaultSort', e.target.value as SubmissionsSortKey)
                }
                style={selectStyle}
              >
                <option value="dateOfService">Date of service</option>
                <option value="submittedAt">Submitted at</option>
                <option value="clientName">Client name</option>
                <option value="nurseName">Nurse name</option>
              </select>
            </Field>

            <Field label="Default sort direction">
              <select
                value={draft.submissions.defaultDir}
                onChange={(e) =>
                  updateSubmissions('defaultDir', e.target.value as SubmissionsSortDir)
                }
                style={selectStyle}
              >
                <option value="desc">Newest first (descending)</option>
                <option value="asc">Oldest first (ascending)</option>
              </select>
            </Field>

            <Field label="Default scope tab">
              <select
                value={draft.submissions.defaultScope}
                onChange={(e) =>
                  updateSubmissions('defaultScope', e.target.value as SubmissionsScope)
                }
                style={selectStyle}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
                <option value="team">Care team</option>
              </select>
            </Field>

            <Field
              label="Rows per page"
              hint="Between 5 and 100. The pagination uses this to chunk the table."
            >
              <input
                type="number"
                min={5}
                max={100}
                step={1}
                value={draft.submissions.pageSize}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) updateSubmissions('pageSize', n);
                }}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ marginTop: 14 }}>
            <Toggle
              label="Auto-apply &quot;Needs co-signature&quot; filter for RNs"
              checked={draft.submissions.rnDefaultsToNeedsCosign}
              onChange={(checked) => updateSubmissions('rnDefaultsToNeedsCosign', checked)}
              hint="When an RN opens /admin/submissions for the first time in a session and has no filters set, drop them on the Needs co-signature view. They can still clear it any time."
            />
          </div>
        </section>

        {toast && (
          <div
            style={toast.kind === 'ok' ? toastOkStyle : toastErrStyle}
            role="status"
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Small composition helpers used inside the page only ---

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#5c6b7a' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: '#7f8c8d' }}>{hint}</span>}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        background: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <div>
        <div style={{ fontWeight: 600, color: '#2c3e50', fontSize: 14 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 2, lineHeight: 1.5 }}>
            {hint}
          </div>
        )}
      </div>
    </label>
  );
}

// --- Styles (match Patients / Users page conventions) ---

const containerStyle: React.CSSProperties = {
  minHeight: '70vh',
  background: '#f5f7fa',
  padding: '32px 20px',
};
const wrapStyle: React.CSSProperties = { maxWidth: 900, margin: '0 auto' };
const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: '#27ae60',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 20,
  flexWrap: 'wrap',
};
const titleStyle: React.CSSProperties = { fontSize: 26, color: '#2c3e50', margin: 0 };
const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#7f8c8d',
  margin: '6px 0 0',
  maxWidth: 600,
};
const infoBannerStyle: React.CSSProperties = {
  background: '#fff4e5',
  border: '1px solid #f5c98a',
  color: '#7c3a00',
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 16,
};
const sectionStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 20,
  marginBottom: 16,
};
const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  color: '#2c3e50',
};
const sectionSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#7f8c8d',
  margin: '4px 0 16px',
  lineHeight: 1.5,
};
const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};
const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #d0d7de',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
};
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
const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#27ae60',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#eef1f4',
  color: '#2c3e50',
  padding: '10px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const toastOkStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 20,
  right: 20,
  background: '#0e7c4a',
  color: 'white',
  padding: '10px 16px',
  borderRadius: 8,
  fontSize: 13,
  boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
  zIndex: 1100,
};
const toastErrStyle: React.CSSProperties = {
  ...toastOkStyle,
  background: '#c62828',
};
