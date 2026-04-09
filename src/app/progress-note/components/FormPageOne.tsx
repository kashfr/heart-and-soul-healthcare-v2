'use client';

import { useState, useEffect, useRef } from 'react';
import { Patient } from '@/lib/patients';
import styles from '../page.module.css';

interface FormPageOneProps {
  formRef: React.RefObject<HTMLFormElement>;
  onCredentialChange?: (credential: string) => void;
  patients: Patient[];
  initialClientName?: string;
}

export default function FormPageOne({ formRef, onCredentialChange, patients, initialClientName }: FormPageOneProps) {
  // Use local date to avoid timezone issues (UTC can show tomorrow's date)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [justSelected, setJustSelected] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialClientName) {
      setSearchQuery(initialClientName);
      setJustSelected(true); // Don't show dropdown
    }
  }, [initialClientName]);

  useEffect(() => {
    // Don't show dropdown right after selecting a patient
    if (justSelected) {
      setShowDropdown(false);
      return;
    }

    if (searchQuery.trim() === '') {
      setFilteredPatients([]);
      setShowDropdown(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const matches = patients.filter(p =>
      p.name.toLowerCase().includes(query)
    );

    setFilteredPatients(matches);
    setShowDropdown(matches.length > 0);
  }, [searchQuery, patients, justSelected]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowConfirmModal(true);
    setShowDropdown(false);
  };

  const handleConfirmSelection = () => {
    if (selectedPatient && formRef.current) {
      const age = calculateAge(selectedPatient.dob);

      const dobInput = formRef.current.querySelector('input[name="q4_dateofBirth"]') as HTMLInputElement;
      const ageInput = formRef.current.querySelector('input[name="q5_ageYears"]') as HTMLInputElement;
      const diagnosisInput = formRef.current.querySelector('input[name="q10_primaryDiagnosis"]') as HTMLInputElement;
      const addrLine1 = formRef.current.querySelector('input[name="q200_addr_line1"]') as HTMLInputElement;
      const cityInput = formRef.current.querySelector('input[name="q200_city"]') as HTMLInputElement;
      const stateInput = formRef.current.querySelector('input[name="q200_state"]') as HTMLInputElement;
      const postalInput = formRef.current.querySelector('input[name="q200_postal"]') as HTMLInputElement;

      // Set the search query to the selected patient name (this updates the visible input)
      setSearchQuery(selectedPatient.name);

      // Fill hidden input with the actual name for form submission
      const clientNameHidden = formRef.current.querySelector('input[name="q3_clientName"]') as HTMLInputElement;
      if (clientNameHidden) clientNameHidden.value = selectedPatient.name;

      if (dobInput) dobInput.value = selectedPatient.dob;
      if (ageInput) ageInput.value = String(age);
      if (diagnosisInput) diagnosisInput.value = selectedPatient.diagnosis || '';
      if (addrLine1) addrLine1.value = selectedPatient.street || '';
      if (cityInput) cityInput.value = selectedPatient.city || '';
      if (stateInput) stateInput.value = selectedPatient.state || '';
      if (postalInput) postalInput.value = selectedPatient.zip || '';

      setShowConfirmModal(false);
      setSelectedPatient(null);
      setJustSelected(true);
    }
  };

  const handleCloseConfirm = () => {
    setShowConfirmModal(false);
    setSelectedPatient(null);
  };

  // Sync the hidden input whenever the user types manually
  const handleNameChange = (value: string) => {
    setSearchQuery(value);
    setJustSelected(false);
    if (formRef.current) {
      const clientNameHidden = formRef.current.querySelector('input[name="q3_clientName"]') as HTMLInputElement;
      if (clientNameHidden) clientNameHidden.value = value;
    }
  };

  return (
    <div>
      {/* CLIENT INFORMATION: name, DOB, age, diagnosis, address */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>CLIENT INFORMATION</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ position: 'relative' }} ref={dropdownRef}>
            <label className={styles.label} htmlFor="q3_clientNameSearch">Client Name *</label>
            <input
              className={styles.input}
              type="text"
              id="q3_clientNameSearch"
              placeholder="Start typing to search patients..."
              value={searchQuery}
              onChange={(e) => handleNameChange(e.target.value)}
              autoComplete="off"
            />
            {/* Hidden input for form submission */}
            <input
              type="hidden"
              name="q3_clientName"
              id="q3_clientName"
              required
            />
            {showDropdown && (
              <div
                style={{
                  position: 'absolute',
                  background: 'white',
                  border: '1px solid #ddd',
                  borderTop: 'none',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  width: '100%',
                  zIndex: 100,
                  top: '100%',
                  borderRadius: '0 0 4px 4px',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                }}
              >
                {filteredPatients.map(patient => (
                  <div
                    key={patient.id}
                    onClick={() => handleSelectPatient(patient)}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #eee',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <strong>{patient.name}</strong>
                    <span style={{ color: '#888', marginLeft: '8px', fontSize: '12px' }}>
                      {patient.diagnosis}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q4_dateofBirth">Date of Birth *</label>
            <input
              className={styles.input}
              type="date"
              id="q4_dateofBirth"
              name="q4_dateofBirth"
              max={today}
              required
              onChange={(e) => {
                const dob = e.target.value;
                if (!dob || !formRef.current) return;
                const birth = new Date(dob + 'T12:00:00');
                const today = new Date();
                let age = today.getFullYear() - birth.getFullYear();
                const m = today.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                const ageInput = formRef.current.querySelector('input[name="q5_ageYears"]') as HTMLInputElement;
                if (ageInput) ageInput.value = String(age);
              }}
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q5_ageYears">Age in Years</label>
            <input
              className={styles.input}
              type="number"
              id="q5_ageYears"
              name="q5_ageYears"
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q10_primaryDiagnosis">Primary Diagnosis *</label>
            <input
              className={styles.input}
              type="text"
              id="q10_primaryDiagnosis"
              name="q10_primaryDiagnosis"
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q200_addr_line1">Street Address *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_addr_line1"
              name="q200_addr_line1"
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q200_city">City *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_city"
              name="q200_city"
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q200_state">State *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_state"
              name="q200_state"
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q200_postal">ZIP Code *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_postal"
              name="q200_postal"
              required
            />
          </div>
        </div>
      </div>

      {/* SHIFT INFORMATION: date of service, times, hours */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SHIFT INFORMATION</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q6_dateofService">Date of Service *</label>
            <input
              className={styles.input}
              type="date"
              id="q6_dateofService"
              name="q6_dateofService"
              defaultValue={today}
              max={today}
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q7_shiftStart">Shift Start Time *</label>
            <input
              className={styles.input}
              type="time"
              id="q7_shiftStart"
              name="q7_shiftStart"
              required
            />
          </div>
        </div>
      </div>

      {/* NURSE / CAREGIVER INFORMATION */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>NURSE / CAREGIVER INFORMATION</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q11_nurseName">Nurse / Caregiver Name *</label>
            <input
              className={styles.input}
              type="text"
              id="q11_nurseName"
              name="q11_nurseName"
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q12_credential">Credential *</label>
            <select
              className={styles.select}
              id="q12_credential"
              name="q12_credential"
              required
              onChange={(e) => onCredentialChange?.(e.target.value)}
            >
              <option value="">Select credential</option>
              <option value="RN">RN</option>
              <option value="LPN">LPN</option>
              <option value="CNA">CNA</option>
              <option value="HHA">HHA</option>
            </select>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedPatient && (
        <div className={styles.confirmModal + ' ' + styles.active}>
          <div className={styles.modalContent}>
            <h2>Confirm Patient Selection</h2>
            <p>
              Are you sure you want to select{' '}
              <strong>{selectedPatient.name}</strong> (DOB:{' '}
              {selectedPatient.dob}, Age: {calculateAge(selectedPatient.dob)}
              )?
            </p>
            <p style={{ fontSize: '13px', color: '#666' }}>
              This will auto-fill the client information fields.
            </p>
            <div className={styles.modalButtons}>
              <button
                type="button"
                onClick={handleCloseConfirm}
                className={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSelection}
                className={styles.confirmBtn}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
