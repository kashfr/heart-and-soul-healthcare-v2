'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Patient } from '@/lib/patients';
import { findNameCandidates, type RosterPatientLite } from '@/lib/levenshtein';
import { computeAgeString } from '@/lib/age';
import type { FormPageProps } from '../types';
import styles from '../page.module.css';

interface FormPageOneProps extends FormPageProps {
  onCredentialChange?: (credential: string) => void;
  patients: Patient[];
  initialClientName?: string;
  lockIdentity?: boolean;
}

export default function FormPageOne({ formRef, register, watch, setValue, control, onCredentialChange, patients, initialClientName, lockIdentity }: FormPageOneProps) {
  // Use local date to avoid timezone issues (UTC can show tomorrow's date)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [justSelected, setJustSelected] = useState(false);
  // When the nurse explicitly dismisses the fuzzy-match banner, we
  // remember which typed string she dismissed for so the same suggestion
  // doesn't keep popping back up with every keystroke that re-yields the
  // same candidate. Cleared when she types something new.
  const [dismissedSuggestionFor, setDismissedSuggestionFor] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fuzzy candidates — drives the "Did you mean?" banner that fills the
  // gap when the existing substring dropdown can't catch a typo (because
  // it uses raw includes() without name normalization). Name-only match
  // on purpose: at the moment the banner needs to fire, the nurse hasn't
  // entered DOB yet — the autofill populates it for her once she accepts.
  const rosterLite: RosterPatientLite[] = useMemo(
    () =>
      patients
        .filter((p): p is Patient & { id: string } => !!p.id)
        .map((p) => ({ id: p.id, name: p.name, dob: p.dob })),
    [patients],
  );
  const fuzzyCandidates = useMemo(
    () => findNameCandidates(searchQuery.trim(), rosterLite, 1),
    [searchQuery, rosterLite],
  );

  // Lock the patient-info fields whenever a roster patient is bound to
  // this note (handleConfirmSelection sets patientId; handleNameChange
  // clears it on any keystroke into the Client Name search). Prevents
  // accidental edits to canonical roster data; the nurse can still
  // change patients by editing the Client Name search input, which
  // clears patientId and re-enables the fields.
  const watchedPatientId = watch('patientId');
  const lockPatientFields = !!(watchedPatientId && String(watchedPatientId).trim());
  const lockedTitle =
    'Auto-filled from the patient roster. Edit the Client Name field above to change patients or unlock.';
  const lockedFieldStyle: React.CSSProperties | undefined = lockPatientFields
    ? { background: '#f1f5f9', cursor: 'not-allowed' }
    : undefined;

  // Banner appears when:
  //   - the substring dropdown isn't already surfacing matches (no point
  //     duplicating what the nurse can already see)
  //   - we DO have at least one fuzzy candidate
  //   - the nurse hasn't explicitly dismissed it for this exact typed
  //     string yet
  //   - and she hasn't just finished accepting a selection (the typed
  //     name still differs from the picked patient — see justSelected
  //     guard below).
  const topFuzzy = fuzzyCandidates[0];
  const showFuzzyBanner =
    !showDropdown &&
    !justSelected &&
    !!topFuzzy &&
    dismissedSuggestionFor !== searchQuery.trim();

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

  // Age as of a reference date (date of service), falling back to today.
  // Shared with the admin note editor + maintenance recompute tool via
  // src/lib/age.ts so the three can't drift.
  const calculateAge = (dob: string, asOfDate?: string): string =>
    computeAgeString(dob, asOfDate);

  // Recalculate age whenever DOB or date of service changes
  const recalcAge = (dob?: string, serviceDate?: string) => {
    const d = dob || watch('q4_dateofBirth');
    const s = serviceDate || watch('q6_dateofService');
    if (d) setValue('q5_ageYears', calculateAge(d, s || undefined));
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowConfirmModal(true);
    setShowDropdown(false);
  };

  const handleConfirmSelection = () => {
    if (selectedPatient) {
      // Set the search query to the selected patient name (this updates the visible input)
      setSearchQuery(selectedPatient.name);

      // Use react-hook-form setValue for all fields
      setValue('q3_clientName', selectedPatient.name);
      setValue('q4_dateofBirth', selectedPatient.dob);
      recalcAge(selectedPatient.dob);
      setValue('q10_primaryDiagnosis', selectedPatient.diagnosis || '');
      setValue('q200_addr_line1', selectedPatient.street || '');
      setValue('q200_city', selectedPatient.city || '');
      setValue('q200_state', selectedPatient.state || '');
      setValue('q200_postal', selectedPatient.zip || '');
      // Hidden patientId carries the roster link through to Firestore.
      // This is what tells the pre-submit check on Page 7 that the
      // nurse actually picked from the roster (so it skips the
      // "did you mean?" modal).
      setValue('patientId', selectedPatient.id || '');

      setShowConfirmModal(false);
      setSelectedPatient(null);
      setJustSelected(true);
      // Clear any dismissed suggestion since the name is now settled.
      setDismissedSuggestionFor(null);
    }
  };

  const handleCloseConfirm = () => {
    setShowConfirmModal(false);
    setSelectedPatient(null);
  };

  // Sync the react-hook-form value whenever the user types manually.
  // Any keystroke clears patientId — if she previously picked from the
  // roster and is now editing the name, the link is no longer valid;
  // she can always re-pick from the dropdown or the fuzzy-match banner.
  const handleNameChange = (value: string) => {
    setSearchQuery(value);
    setJustSelected(false);
    setValue('q3_clientName', value);
    setValue('patientId', '');
    // Reset dismissal state — a new typed value deserves a fresh look.
    setDismissedSuggestionFor(null);
  };

  // Accept the fuzzy-match banner suggestion. Same effect as picking
  // from the substring dropdown — opens the existing confirmation modal
  // so the nurse explicitly OKs the auto-fill before her data changes.
  const acceptFuzzyCandidate = () => {
    if (!topFuzzy) return;
    const patient = patients.find((p) => p.id === topFuzzy.patientId);
    if (patient) handleSelectPatient(patient);
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
            {/* Hidden input for form submission — managed by react-hook-form */}
            <input
              type="hidden"
              id="q3_clientName"
              {...register('q3_clientName')}
              required
            />
            {/* Hidden patientId — set when the nurse picks from the roster
                dropdown OR the fuzzy-match banner. The pre-submit check
                on Page 7 uses its presence/absence to decide whether to
                interrupt with the "did you mean?" confirmation modal. */}
            <input
              type="hidden"
              id="patientId"
              {...register('patientId')}
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
            {/* Fuzzy-match banner — Checkpoint 1 of the "did you mean?"
                flow. Surfaces a roster suggestion when the typed string
                isn't a substring match but is close enough (Levenshtein
                ≤ 3 / exact DOB / first-name + close DOB) to be plausibly
                the same patient. Designed to be impossible to miss
                without being modal. */}
            {showFuzzyBanner && topFuzzy && (
              <div
                role="alert"
                style={{
                  marginTop: 8,
                  background: '#fff4e5',
                  border: '1px solid #f5c98a',
                  borderLeft: '4px solid #d8830f',
                  borderRadius: 6,
                  padding: '12px 14px',
                  fontSize: 13,
                  color: '#7c3a00',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Did you mean <span style={{ color: '#5a2a00' }}>{topFuzzy.patientName}</span>?
                </div>
                <div style={{ fontSize: 12, color: '#8c5a25', marginBottom: 10 }}>
                  DOB {topFuzzy.patientDob} · {topFuzzy.reason}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={acceptFuzzyCandidate}
                    style={{
                      background: '#0e7c4a',
                      color: 'white',
                      border: 'none',
                      padding: '6px 14px',
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Use {topFuzzy.patientName}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedSuggestionFor(searchQuery.trim())}
                    style={{
                      background: 'white',
                      color: '#7c3a00',
                      border: '1px solid #d8830f',
                      padding: '6px 14px',
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    No, keep what I typed
                  </button>
                </div>
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
              max={today}
              required
              readOnly={lockPatientFields}
              title={lockPatientFields ? lockedTitle : undefined}
              style={lockedFieldStyle}
              {...register('q4_dateofBirth', {
                onChange: (e) => {
                  const dob = e.target.value;
                  if (!dob) return;
                  recalcAge(dob);
                },
              })}
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q5_ageYears">Age</label>
            <input
              className={styles.input}
              type="text"
              id="q5_ageYears"
              {...register('q5_ageYears')}
              readOnly
              title={lockPatientFields ? lockedTitle : 'Calculated from Date of Birth.'}
              style={lockedFieldStyle}
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
              {...register('q10_primaryDiagnosis')}
              required
              readOnly={lockPatientFields}
              title={lockPatientFields ? lockedTitle : undefined}
              style={lockedFieldStyle}
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
              {...register('q200_addr_line1')}
              required
              readOnly={lockPatientFields}
              title={lockPatientFields ? lockedTitle : undefined}
              style={lockedFieldStyle}
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
              {...register('q200_city')}
              required
              readOnly={lockPatientFields}
              title={lockPatientFields ? lockedTitle : undefined}
              style={lockedFieldStyle}
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q200_state">State *</label>
            <select
              className={styles.select}
              id="q200_state"
              {...register('q200_state')}
              required
              disabled={lockPatientFields}
              title={lockPatientFields ? lockedTitle : undefined}
              style={lockedFieldStyle}
            >
              <option value="">Select...</option>
              <option value="AL">AL</option><option value="AK">AK</option><option value="AZ">AZ</option><option value="AR">AR</option>
              <option value="CA">CA</option><option value="CO">CO</option><option value="CT">CT</option><option value="DE">DE</option>
              <option value="FL">FL</option><option value="GA">GA</option><option value="HI">HI</option><option value="ID">ID</option>
              <option value="IL">IL</option><option value="IN">IN</option><option value="IA">IA</option><option value="KS">KS</option>
              <option value="KY">KY</option><option value="LA">LA</option><option value="ME">ME</option><option value="MD">MD</option>
              <option value="MA">MA</option><option value="MI">MI</option><option value="MN">MN</option><option value="MS">MS</option>
              <option value="MO">MO</option><option value="MT">MT</option><option value="NE">NE</option><option value="NV">NV</option>
              <option value="NH">NH</option><option value="NJ">NJ</option><option value="NM">NM</option><option value="NY">NY</option>
              <option value="NC">NC</option><option value="ND">ND</option><option value="OH">OH</option><option value="OK">OK</option>
              <option value="OR">OR</option><option value="PA">PA</option><option value="RI">RI</option><option value="SC">SC</option>
              <option value="SD">SD</option><option value="TN">TN</option><option value="TX">TX</option><option value="UT">UT</option>
              <option value="VT">VT</option><option value="VA">VA</option><option value="WA">WA</option><option value="WV">WV</option>
              <option value="WI">WI</option><option value="WY">WY</option><option value="DC">DC</option>
            </select>
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q200_postal">ZIP Code *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_postal"
              {...register('q200_postal')}
              required
              readOnly={lockPatientFields}
              title={lockPatientFields ? lockedTitle : undefined}
              style={lockedFieldStyle}
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
              max={today}
              required
              {...register('q6_dateofService', {
                onChange: (e) => {
                  const serviceDate = e.target.value;
                  if (!serviceDate) return;
                  recalcAge(undefined, serviceDate);
                },
              })}
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
              {...register('q7_shiftStart')}
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
              {...register('q11_nurseName')}
              required
              readOnly={lockIdentity}
              title={lockIdentity ? 'Locked to your staff profile.' : undefined}
              style={lockIdentity ? { background: '#f1f5f9', cursor: 'not-allowed' } : undefined}
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q12_credential">Credential *</label>
            <select
              className={styles.select}
              id="q12_credential"
              required
              disabled={lockIdentity}
              title={lockIdentity ? 'Locked to your staff profile.' : undefined}
              style={lockIdentity ? { background: '#f1f5f9', cursor: 'not-allowed' } : undefined}
              {...register('q12_credential', {
                onChange: (e) => onCredentialChange?.(e.target.value),
              })}
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
