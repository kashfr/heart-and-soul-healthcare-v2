'use client';

import { useState } from 'react';
import { Patient } from '@/lib/patients';
import styles from '../page.module.css';

interface SettingsPanelProps {
  patients: Patient[];
  onAddPatient: (patient: Patient) => Promise<void>;
  onUpdatePatient: (id: string, patient: Partial<Patient>) => Promise<void>;
  onRemovePatient: (patientId: string) => Promise<void>;
  onClose: () => void;
}

const emptyPatient: Partial<Patient> = {
  name: '',
  dob: '',
  diagnosis: '',
  street: '',
  city: '',
  state: '',
  zip: '',
};

function calculateAge(dob: string): string {
  if (!dob) return '';
  const birth = new Date(dob + 'T12:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} years old`;
}

function formatDOB(dob: string): string {
  if (!dob) return '';
  const d = new Date(dob + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SettingsPanel({
  patients,
  onAddPatient,
  onUpdatePatient,
  onRemovePatient,
  onClose,
}: SettingsPanelProps) {
  const [formData, setFormData] = useState<Partial<Patient>>(emptyPatient);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleFieldChange = (field: keyof Patient, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const clearForm = () => {
    setFormData(emptyPatient);
    setEditingId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.dob) {
      showToast('Please fill in name and date of birth.');
      return;
    }

    try {
      setIsSubmitting(true);

      if (editingId) {
        await onUpdatePatient(editingId, formData);
        showToast(`${formData.name} updated`);
      } else {
        await onAddPatient(formData as Patient);
        showToast(`${formData.name} added to roster`);
      }

      clearForm();
    } catch (error) {
      console.error('Error saving patient:', error);
      showToast('Failed to save patient. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
    setShowForm(true);
    showToast(`Editing ${patient.name}`);
  };

  const handleRemove = async (patient: Patient) => {
    if (!patient.id) return;
    if (window.confirm(`Remove ${patient.name} from the roster?`)) {
      try {
        await onRemovePatient(patient.id);
        showToast(`${patient.name} removed`);
        if (editingId === patient.id) clearForm();
      } catch (error) {
        showToast('Failed to remove patient.');
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        maxWidth: '100vw',
        background: '#f5f6fa',
        boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
        zIndex: 500,
        overflowY: 'auto',
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      {/* Header */}
      <div style={{
        background: '#2c3e50',
        color: 'white',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Patient Roster</h2>
          <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.7 }}>Manage patient profiles</p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '24px',
            color: 'white',
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Add / Edit Toggle */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          marginBottom: '16px',
          overflow: 'hidden',
        }}>
          <div
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '14px 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              fontSize: '15px',
              color: '#444',
              borderBottom: showForm ? '1px solid #eee' : 'none',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: '12px', transition: 'transform 0.2s', transform: showForm ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
            {editingId ? 'Edit Patient' : 'Add New Patient'}
          </div>

          {showForm && (
            <form onSubmit={handleSave} style={{ padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>Client Full Name *</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="e.g., Jane Doe"
                    value={formData.name || ''}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>Date of Birth *</label>
                  <input
                    className={styles.input}
                    type="date"
                    value={formData.dob || ''}
                    onChange={e => handleFieldChange('dob', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>Primary Diagnosis / Condition</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="e.g., Seizure Disorder"
                    value={formData.diagnosis || ''}
                    onChange={e => handleFieldChange('diagnosis', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>Age (auto-calculated)</label>
                  <div style={{ padding: '8px 0', fontWeight: 600, color: '#4a7cf7', fontSize: '14px' }}>
                    {formData.dob ? calculateAge(formData.dob) : 'Enter DOB'}
                  </div>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '16px 0' }} />
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px' }}>Client Address</p>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>Street Address</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="e.g., 123 Main St, Apt 4B"
                  value={formData.street || ''}
                  onChange={e => handleFieldChange('street', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '8px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>City</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="e.g., Atlanta"
                    value={formData.city || ''}
                    onChange={e => handleFieldChange('city', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>State</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="e.g., GA"
                    maxLength={2}
                    style={{ textTransform: 'uppercase' }}
                    value={formData.state || ''}
                    onChange={e => handleFieldChange('state', e.target.value.toUpperCase())}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>Zip Code</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="e.g., 30309"
                    maxLength={10}
                    value={formData.zip || ''}
                    onChange={e => handleFieldChange('zip', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '10px 20px',
                    background: '#4a7cf7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    font: 'inherit',
                    fontWeight: 600,
                    fontSize: '14px',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? 'Saving...' : editingId ? 'Update Patient' : 'Save Patient'}
                </button>
                <button
                  type="button"
                  onClick={() => { clearForm(); setShowForm(false); }}
                  style={{
                    padding: '10px 20px',
                    background: '#e8ecf1',
                    color: '#444',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontWeight: 600,
                    fontSize: '14px',
                  }}
                >
                  {editingId ? 'Cancel' : 'Clear'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Patient Roster Table */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: '16px 20px',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#444', marginTop: 0, marginBottom: '12px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
            Patient Roster
          </h3>

          {patients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#aaa', fontSize: '14px' }}>
              No patients added yet. Click &quot;Add New Patient&quot; above to get started.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Client Name</th>
                  <th style={thStyle}>DOB</th>
                  <th style={thStyle}>Age</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(patient => (
                  <tr key={patient.id} style={{ borderBottom: '1px solid #f0f0f0' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fd')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{patient.name}</div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{patient.diagnosis}</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '12px' }}>{formatDOB(patient.dob)}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block',
                        background: '#e8f4e8',
                        color: '#2a7a2a',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                      }}>
                        {calculateAge(patient.dob)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => handleEdit(patient)}
                        style={{
                          background: '#e8ecf1',
                          color: '#444',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                          marginRight: '4px',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemove(patient)}
                        style={{
                          background: '#f5f5f5',
                          color: '#c44',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: '#333',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          fontSize: '13px',
          zIndex: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '8px 8px',
  borderBottom: '2px solid #eee',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '13px',
  verticalAlign: 'middle',
};
