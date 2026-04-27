'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Search, Pencil, Trash2 } from 'lucide-react';
import {
  Patient,
  addPatient,
  getPatients,
  removePatient,
  updatePatient,
} from '@/lib/patients';

const emptyPatient: Partial<Patient> = {
  name: '',
  dob: '',
  diagnosis: '',
  street: '',
  city: '',
  state: '',
  zip: '',
};

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

function calculateAge(dob: string): string {
  if (!dob) return '';
  const birth = new Date(dob + 'T12:00:00');
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) years--;
  if (years >= 1) return `${years} yr${years !== 1 ? 's' : ''}`;
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  if (today.getDate() < birth.getDate()) months--;
  if (months >= 1) return `${months} mo`;
  const days = Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
  return `${days} d`;
}

function formatDOB(dob: string): string {
  if (!dob) return '';
  const d = new Date(dob + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Patient>>(emptyPatient);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const todayISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setPatients(await getPatients());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const resetForm = () => {
    setFormData(emptyPatient);
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setFormOpen(true);
  };

  const handleEdit = (patient: Patient) => {
    setFormData({
      name: patient.name,
      dob: patient.dob,
      diagnosis: patient.diagnosis,
      street: patient.street,
      city: patient.city,
      state: patient.state,
      zip: patient.zip,
    });
    setEditingId(patient.id || null);
    setFormOpen(true);
  };

  const handleRemove = async (patient: Patient) => {
    if (!patient.id) return;
    if (!window.confirm(`Remove ${patient.name} from the roster?`)) return;
    try {
      await removePatient(patient.id);
      setPatients((prev) => prev.filter((p) => p.id !== patient.id));
      showToast(`${patient.name} removed`);
      if (editingId === patient.id) {
        resetForm();
        setFormOpen(false);
      }
    } catch {
      showToast('Failed to remove patient.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.dob) {
      showToast('Name and date of birth are required.');
      return;
    }
    try {
      setSubmitting(true);
      if (editingId) {
        await updatePatient(editingId, formData);
        setPatients((prev) =>
          prev.map((p) => (p.id === editingId ? { ...(p as Patient), ...formData } : p))
        );
        showToast(`${formData.name} updated`);
      } else {
        const id = await addPatient(formData as Patient);
        setPatients((prev) => [...prev, { ...(formData as Patient), id }]);
        showToast(`${formData.name} added`);
      }
      resetForm();
      setFormOpen(false);
    } catch {
      showToast('Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return patients;
    const q = query.toLowerCase();
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.diagnosis?.toLowerCase().includes(q) ||
        p.dob.includes(query)
    );
  }, [patients, query]);

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
            <h1 style={titleStyle}>Patient Roster</h1>
            <p style={subtitleStyle}>
              {patients.length} patient{patients.length === 1 ? '' : 's'} in the roster. Nurses pick from this list on the progress-note form (free-form names are still allowed for new clients).
            </p>
          </div>
          <button onClick={handleOpenAdd} style={primaryBtnStyle}>
            <Plus size={16} /> Add patient
          </button>
        </header>

        <div style={toolbarStyle}>
          <div style={searchWrapStyle}>
            <Search size={16} color="#7f8c8d" />
            <input
              type="text"
              placeholder="Search by name, diagnosis, or DOB"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={searchInputStyle}
            />
          </div>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={emptyStyle}>
            {patients.length === 0
              ? 'No patients yet. Click "Add patient" to create your first record.'
              : 'No patients match that search.'}
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>DOB</th>
                  <th style={thStyle}>Age</th>
                  <th style={thStyle}>Diagnosis</th>
                  <th style={thStyle}>Location</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} style={i % 2 === 1 ? altRowStyle : undefined}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#2c3e50' }}>{p.name}</div>
                    </td>
                    <td style={tdStyle}>{formatDOB(p.dob)}</td>
                    <td style={tdStyle}>
                      <span style={ageBadgeStyle}>{calculateAge(p.dob)}</span>
                    </td>
                    <td style={tdStyle}>{p.diagnosis || <span style={{ color: '#aaa' }}>—</span>}</td>
                    <td style={tdStyle}>
                      {p.city && p.state ? `${p.city}, ${p.state}` : <span style={{ color: '#aaa' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleEdit(p)} style={iconBtnStyle} aria-label={`Edit ${p.name}`}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleRemove(p)} style={{ ...iconBtnStyle, color: '#c44' }} aria-label={`Remove ${p.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div style={modalBackdropStyle} onClick={() => !submitting && setFormOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#2c3e50' }}>
                {editingId ? 'Edit patient' : 'Add patient'}
              </h2>
              <button onClick={() => setFormOpen(false)} style={closeBtnStyle} aria-label="Close">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: 20 }}>
              <div style={gridTwoStyle}>
                <Field label="Full name *">
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Jane Doe"
                  />
                </Field>
                <Field label="Date of birth *">
                  <input
                    type="date"
                    required
                    max={todayISO}
                    value={formData.dob || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, dob: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>

              <div style={gridTwoStyle}>
                <Field label="Primary diagnosis">
                  <input
                    type="text"
                    value={formData.diagnosis || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, diagnosis: e.target.value }))}
                    style={inputStyle}
                    placeholder="e.g., Seizure Disorder"
                  />
                </Field>
                <Field label="Age">
                  <div style={{ padding: '10px 0', fontWeight: 600, color: '#4a7cf7' }}>
                    {formData.dob ? calculateAge(formData.dob) : '—'}
                  </div>
                </Field>
              </div>

              <Field label="Street address">
                <input
                  type="text"
                  value={formData.street || ''}
                  onChange={(e) => setFormData((f) => ({ ...f, street: e.target.value }))}
                  style={inputStyle}
                  placeholder="123 Main St, Apt 4B"
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <Field label="City">
                  <input
                    type="text"
                    value={formData.city || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, city: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="State">
                  <select
                    value={formData.state || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, state: e.target.value }))}
                    style={selectStyle}
                  >
                    <option value="">—</option>
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Zip">
                  <input
                    type="text"
                    maxLength={10}
                    value={formData.zip || ''}
                    onChange={(e) => setFormData((f) => ({ ...f, zip: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={submitting}
                  style={secondaryBtnStyle}
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={primaryBtnStyle}>
                  {submitting ? 'Saving…' : editingId ? 'Update patient' : 'Save patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#5c6b7a' }}>{label}</span>
      {children}
    </label>
  );
}

const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const backLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#27ae60', textDecoration: 'none', fontSize: 13, fontWeight: 600 };
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' };
const titleStyle: React.CSSProperties = { fontSize: 26, color: '#2c3e50', margin: 0 };
const subtitleStyle: React.CSSProperties = { fontSize: 13, color: '#7f8c8d', margin: '6px 0 0', maxWidth: 700 };
const toolbarStyle: React.CSSProperties = { display: 'flex', gap: 10, marginBottom: 14 };
const searchWrapStyle: React.CSSProperties = { flex: 1, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' };
const searchInputStyle: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', fontFamily: 'inherit' };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 10, color: '#7f8c8d', fontSize: 14, border: '1px solid #e5e7eb' };
const tableWrapStyle: React.CSSProperties = { background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', borderBottom: '1px solid #e5e7eb', color: '#5c6b7a', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 };
const tdStyle: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f1f3f5', color: '#2c3e50' };
const altRowStyle: React.CSSProperties = { background: '#fafbfc' };
const ageBadgeStyle: React.CSSProperties = { display: 'inline-block', background: '#e8f4e8', color: '#2a7a2a', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#27ae60', color: 'white', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtnStyle: React.CSSProperties = { background: '#eef1f4', color: '#2c3e50', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', padding: 6, margin: '0 2px', borderRadius: 4, cursor: 'pointer', color: '#5c6b7a' };
const modalBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 10, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f3f5' };
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#7f8c8d' };
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' };
// Same as inputStyle but with the custom chevron-down used everywhere else on
// the site. Suppresses the macOS native double-arrow ⇅ for visual consistency.
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
const gridTwoStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 20, right: 20, background: '#2c3e50', color: 'white', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 8px 20px rgba(0,0,0,0.2)', zIndex: 1100 };
