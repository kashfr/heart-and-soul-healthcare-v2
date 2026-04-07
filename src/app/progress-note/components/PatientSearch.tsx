'use client';

import { useState, useRef, useEffect } from 'react';
import { Patient } from '@/lib/patients';
import styles from '../page.module.css';

interface PatientSearchProps {
  patients: Patient[];
  formRef: React.RefObject<HTMLFormElement>;
}

export default function PatientSearch({ patients, formRef }: PatientSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredPatients([]);
      setShowDropdown(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const matches = patients.filter(
      p =>
        p.name.toLowerCase().includes(query) ||
        p.dob.includes(searchQuery)
    );

    setFilteredPatients(matches);
    setShowDropdown(matches.length > 0);
  }, [searchQuery, patients]);

  const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
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
      const clientNameInput = formRef.current.querySelector(
        'input[name="q3_clientName"]'
      ) as HTMLInputElement;
      const dobInput = formRef.current.querySelector(
        'input[name="q4_dateofBirth"]'
      ) as HTMLInputElement;
      const ageInput = formRef.current.querySelector(
        'input[name="q5_ageYears"]'
      ) as HTMLInputElement;
      const diagnosisInput = formRef.current.querySelector(
        'input[name="q10_primaryDiagnosis"]'
      ) as HTMLInputElement;
      const addrLine1 = formRef.current.querySelector(
        'input[name="q200_addr_line1"]'
      ) as HTMLInputElement;
      const cityInput = formRef.current.querySelector(
        'input[name="q200_city"]'
      ) as HTMLInputElement;
      const stateInput = formRef.current.querySelector(
        'input[name="q200_state"]'
      ) as HTMLInputElement;
      const postalInput = formRef.current.querySelector(
        'input[name="q200_postal"]'
      ) as HTMLInputElement;

      if (clientNameInput) clientNameInput.value = selectedPatient.name;
      if (dobInput) dobInput.value = selectedPatient.dob;
      if (ageInput) ageInput.value = String(age);
      if (diagnosisInput)
        diagnosisInput.value = selectedPatient.diagnosis || '';
      if (addrLine1) addrLine1.value = selectedPatient.street || '';
      if (cityInput) cityInput.value = selectedPatient.city || '';
      if (stateInput) stateInput.value = selectedPatient.state || '';
      if (postalInput) postalInput.value = selectedPatient.zip || '';

      setSearchQuery('');
      setShowConfirmModal(false);
      setSelectedPatient(null);
    }
  };

  const handleCloseConfirm = () => {
    setShowConfirmModal(false);
    setSelectedPatient(null);
  };

  return (
    <>
      <div style={{ flex: 1, maxWidth: '300px', position: 'relative' }}>
        <input
          type="text"
          placeholder="Search patients by name or DOB..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className={styles.input}
          style={{ padding: '10px 12px', fontSize: '14px' }}
        />
        {showDropdown && (
          <div
            ref={dropdownRef}
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
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
              >
                {patient.name} (DOB: {patient.dob})
              </div>
            ))}
          </div>
        )}
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
    </>
  );
}
