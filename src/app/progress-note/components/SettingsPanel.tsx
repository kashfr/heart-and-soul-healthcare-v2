'use client';

import { useState } from 'react';
import { Patient } from '@/lib/patients';
import styles from '../page.module.css';

interface SettingsPanelProps {
  patients: Patient[];
  onAddPatient: (patient: Patient) => Promise<void>;
  onRemovePatient: (patientId: string) => Promise<void>;
  onClose: () => void;
}

export default function SettingsPanel({
  patients,
  onAddPatient,
  onRemovePatient,
  onClose,
}: SettingsPanelProps) {
  const [newPatient, setNewPatient] = useState<Partial<Patient>>({
    name: '',
    dob: '',
    diagnosis: '',
    street: '',
    city: '',
    state: '',
    zip: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPatient.name || !newPatient.dob) {
      alert('Please fill in name and date of birth.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onAddPatient(newPatient as Patient);
      setNewPatient({
        name: '',
        dob: '',
        diagnosis: '',
        street: '',
        city: '',
        state: '',
        zip: '',
      });
      alert('Patient added successfully!');
    } catch (error) {
      console.error('Error adding patient:', error);
      alert('Failed to add patient. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '350px',
        background: 'white',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
        zIndex: 500,
        overflowY: 'auto',
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <div style={{ padding: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '2px solid #27ae60',
            paddingBottom: '10px',
          }}
        >
          <h2 style={{ margin: 0, color: '#2c3e50' }}>Patient Management</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              font: 'inherit',
              cursor: 'pointer',
              fontSize: '24px',
              color: '#7f8c8d',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Add Patient Form */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ color: '#2c3e50', marginTop: 0 }}>Add New Patient</h3>
          <form onSubmit={handleAddPatient}>
            <div style={{ marginBottom: '12px' }}>
              <label className={styles.label}>Name *</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Patient name"
                value={newPatient.name || ''}
                onChange={e =>
                  setNewPatient({ ...newPatient, name: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className={styles.label}>Date of Birth *</label>
              <input
                type="date"
                className={styles.input}
                value={newPatient.dob || ''}
                onChange={e =>
                  setNewPatient({ ...newPatient, dob: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className={styles.label}>Diagnosis</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Primary diagnosis"
                value={newPatient.diagnosis || ''}
                onChange={e =>
                  setNewPatient({ ...newPatient, diagnosis: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className={styles.label}>Street Address</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Street address"
                value={newPatient.street || ''}
                onChange={e =>
                  setNewPatient({ ...newPatient, street: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className={styles.label}>City</label>
              <input
                type="text"
                className={styles.input}
                placeholder="City"
                value={newPatient.city || ''}
                onChange={e =>
                  setNewPatient({ ...newPatient, city: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className={styles.label}>State</label>
              <input
                type="text"
                className={styles.input}
                placeholder="State"
                value={newPatient.state || ''}
                onChange={e =>
                  setNewPatient({ ...newPatient, state: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className={styles.label}>Zip Code</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Zip code"
                value={newPatient.zip || ''}
                onChange={e =>
                  setNewPatient({ ...newPatient, zip: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '10px',
                background: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                font: 'inherit',
                fontWeight: 'bold',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting ? 'Adding...' : 'Add Patient'}
            </button>
          </form>
        </div>

        {/* Saved Patients List */}
        <div>
          <h3 style={{ color: '#2c3e50', marginTop: 0 }}>Saved Patients</h3>
          {patients.length === 0 ? (
            <p style={{ color: '#7f8c8d', fontSize: '14px' }}>
              No patients yet. Add one to get started.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {patients.map(patient => (
                <div
                  key={patient.id}
                  style={{
                    padding: '12px',
                    background: '#f5f5f5',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                      {patient.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                      DOB: {patient.dob}
                    </div>
                  </div>
                  <button
                    onClick={() => patient.id && onRemovePatient(patient.id)}
                    style={{
                      background: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      font: 'inherit',
                      fontSize: '12px',
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
