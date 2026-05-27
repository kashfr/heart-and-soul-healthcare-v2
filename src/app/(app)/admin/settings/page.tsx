'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RotateCcw } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { authedFetch } from '@/lib/authedFetch';
import {
  DEFAULT_SETTINGS,
  ALL_COSIGNABLE_CREDENTIALS,
  ALL_VITAL_AGE_GROUPS,
  ALL_VITAL_RANGE_KEYS,
  type AppSettings,
  type SubmissionsSortKey,
  type SubmissionsSortDir,
  type SubmissionsScope,
  type CosignableCredential,
  type VitalAgeGroupKey,
  type VitalRangeKey,
  type VitalRangePair,
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

  const toggleCosignCredential = (cred: CosignableCredential) => {
    setDirty(true);
    setDraft((prev) => {
      const set = new Set(prev.cosign.requiredCredentials);
      if (set.has(cred)) set.delete(cred);
      else set.add(cred);
      // Preserve canonical order so the saved doc stays diff-friendly.
      const ordered = ALL_COSIGNABLE_CREDENTIALS.filter((c) => set.has(c));
      return { ...prev, cosign: { requiredCredentials: ordered } };
    });
  };

  const togglePatientFreeText = (allowed: boolean) => {
    setDirty(true);
    setDraft((prev) => ({ ...prev, patient: { allowFreeText: allowed } }));
  };

  const updateVitalRange = (
    group: VitalAgeGroupKey,
    vital: VitalRangeKey,
    field: keyof VitalRangePair,
    value: number,
  ) => {
    setDirty(true);
    setDraft((prev) => {
      const existingGroup = prev.vitals.rangesByAgeGroup[group] ?? {};
      const existingPair = existingGroup[vital] ?? { low: 0, high: 0 };
      return {
        ...prev,
        vitals: {
          rangesByAgeGroup: {
            ...prev.vitals.rangesByAgeGroup,
            [group]: {
              ...existingGroup,
              [vital]: { ...existingPair, [field]: value },
            },
          },
        },
      };
    });
  };

  const clearVitalOverridesForGroup = (group: VitalAgeGroupKey) => {
    setDirty(true);
    setDraft((prev) => {
      const next = { ...prev.vitals.rangesByAgeGroup };
      delete next[group];
      return { ...prev, vitals: { rangesByAgeGroup: next } };
    });
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

        {/* --- Co-signature requirements --- */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Co-signature requirements</h2>
          <p style={sectionSubStyle}>
            Which clinical credentials require an RN to co-sign every submitted note. RN
            isn&apos;t in this list — RNs can&apos;t co-sign their own work, and an RN co-
            signing another RN doesn&apos;t add clinical value. Notes that are already
            co-signed stay co-signed regardless of changes here.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALL_COSIGNABLE_CREDENTIALS.map((cred) => (
              <Toggle
                key={cred}
                label={`Require RN co-sign on ${cred} notes`}
                checked={draft.cosign.requiredCredentials.includes(cred)}
                onChange={() => toggleCosignCredential(cred)}
              />
            ))}
          </div>

          {draft.cosign.requiredCredentials.length === 0 && (
            <div style={{ ...infoBannerStyle, marginTop: 14 }}>
              All credentials are unchecked. No notes will be flagged as needing co-
              signature. Existing pending co-signs will disappear from the queue and
              filter — use this if you genuinely have no RN to co-sign work.
            </div>
          )}
        </section>

        {/* --- Patient roster enforcement --- */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Patient roster</h2>
          <p style={sectionSubStyle}>
            Control whether nurses can type a patient name freely, or must select from
            the existing roster. Tightening this stops typo notes from accumulating in
            /admin/maintenance/link-notes; loosening it lets nurses get notes in for
            patients you haven&apos;t added to the roster yet.
          </p>

          <Toggle
            label="Allow free-text patient names on the progress-note form"
            checked={draft.patient.allowFreeText}
            onChange={togglePatientFreeText}
            hint="When OFF, nurses can't submit the form unless they pick a patient from the roster. If a nurse has a new patient who isn't in the roster yet, an admin must add them first. (Admins themselves bypass this lock so they can still submit notes for not-yet-rostered patients.)"
          />
        </section>

        {/* --- Pediatric vital ranges --- */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Vital sign ranges</h2>
          <p style={sectionSubStyle}>
            Per-age-group thresholds for what counts as an abnormal vital. Leave a cell
            blank to use the hard-coded default. Set both low and high to override.
            Changes apply to the dashboard &quot;Abnormal vitals&quot; pill, the detail
            view banner, and downloaded PDFs. The progress-note form&apos;s real-time
            colour highlighting continues to use the hard-coded defaults — fine for the
            nurse&apos;s rough guide, since the dashboard and PDF will re-evaluate with
            your thresholds.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ALL_VITAL_AGE_GROUPS.map((group) => {
              const groupOverrides = draft.vitals.rangesByAgeGroup[group] ?? {};
              const hasAnyOverride = Object.keys(groupOverrides).length > 0;
              return (
                <div
                  key={group}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 14,
                    background: '#fafbfc',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <strong style={{ color: '#2c3e50', fontSize: 14 }}>
                      {AGE_GROUP_LABELS[group]}
                    </strong>
                    {hasAnyOverride && (
                      <button
                        type="button"
                        onClick={() => clearVitalOverridesForGroup(group)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #c44',
                          color: '#c44',
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Reset {AGE_GROUP_LABELS[group]} to defaults
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {ALL_VITAL_RANGE_KEYS.map((vital) => {
                      const pair = groupOverrides[vital];
                      return (
                        <div
                          key={vital}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 6,
                            padding: '8px 10px',
                            background: 'white',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#5c6b7a',
                              textTransform: 'uppercase',
                              letterSpacing: 0.4,
                              marginBottom: 4,
                            }}
                          >
                            {VITAL_LABELS[vital]}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="number"
                              step="any"
                              placeholder="low"
                              value={pair?.low ?? ''}
                              onChange={(e) => {
                                const n = parseFloat(e.target.value);
                                if (Number.isFinite(n)) updateVitalRange(group, vital, 'low', n);
                              }}
                              style={smallNumberInputStyle}
                            />
                            <span style={{ color: '#7f8c8d' }}>–</span>
                            <input
                              type="number"
                              step="any"
                              placeholder="high"
                              value={pair?.high ?? ''}
                              onChange={(e) => {
                                const n = parseFloat(e.target.value);
                                if (Number.isFinite(n)) updateVitalRange(group, vital, 'high', n);
                              }}
                              style={smallNumberInputStyle}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
const smallNumberInputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  padding: '6px 8px',
  border: '1px solid #d0d7de',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  textAlign: 'center',
};

// Human-readable labels for the vital-range editor — mirror the
// strings already shown elsewhere in the app (the "Ranges based on
// age group" banner on the detail view + PDF).
const AGE_GROUP_LABELS: Record<VitalAgeGroupKey, string> = {
  newborn: 'Newborn (0-28 days)',
  infant: 'Infant (1-12 months)',
  toddler: 'Toddler (1-3 years)',
  preschool: 'Preschool (4-5 years)',
  schoolAge: 'School Age (6-12 years)',
  adolescent: 'Adolescent (13-17 years)',
  adult: 'Adult (18-64 years)',
  elderly: 'Elderly (65+ years)',
};
const VITAL_LABELS: Record<VitalRangeKey, string> = {
  temperature: 'Temperature (°F)',
  systolic: 'Systolic BP (mmHg)',
  diastolic: 'Diastolic BP (mmHg)',
  pulse: 'Pulse (bpm)',
  respiration: 'Respirations (/min)',
  oxygenSaturation: 'O2 Saturation (%)',
  bloodGlucose: 'Blood Glucose (mg/dL)',
};
