'use client';

import { useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { FormValues } from '../types';
import styles from '../page.module.css';
import DeselectableRadio, { radioState, radioSubscribe, radioGetSnapshot } from './DeselectableRadio';
import {
  MAX_SEIZURES_PER_NOTE,
  POST_SEIZURE_STATES,
  SEIZURE_COUNT_KEY,
  SEIZURE_ENTRY_KEYS,
  SEIZURE_INTERVENTIONS,
  SEIZURE_OBSERVATIONS,
  SEIZURE_RESPONSES,
  SEIZURE_TYPES,
  SEIZURE_WITNESS,
  formatDuration,
  readSeizureEntries,
  seizureAdvisories,
  seizureDurationSeconds,
  seizureFieldKey,
} from '@/lib/seizureShared';

const getGlobalSnapshotStr = () => String(radioGetSnapshot());

interface Props {
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  /** Roster client is flagged hasSeizureDisorder: the attestation is required. */
  required: boolean;
}

/**
 * The seizure log on Page 3, replacing the single-seizure block. One
 * attestation per shift (the existing q30_seizureEvent Yes/No) and, on Yes,
 * one-or-more numbered seizure blocks (q69_seizure{n}_*). Every field is an
 * ordinary form value so drafts, resume, edit mode, and the PDF need no new
 * plumbing; the submit handler writes one seizureEvents record per block.
 */
export default function SeizureLogSection({ register, watch, setValue, required }: Props) {
  useSyncExternalStore(radioSubscribe, getGlobalSnapshotStr, getGlobalSnapshotStr);
  const answer = radioState['q30_seizureEvent'] || '';
  const count = Math.max(0, Math.min(MAX_SEIZURES_PER_NOTE, Number(watch(SEIZURE_COUNT_KEY)) || 0));
  const allValues = watch();
  const entries = useMemo(() => readSeizureEntries(allValues as Record<string, unknown>), [allValues]);
  const advisories = useMemo(() => seizureAdvisories(entries), [entries]);

  // Answering "No seizure noted" after filling blocks must not leave phantom
  // seizures on the saved note (react-hook-form keeps hidden values). Clear
  // them so the record, the PDF, and the log all agree with the attestation.
  useEffect(() => {
    if (answer !== 'Yes' && count > 0) {
      for (let i = 1; i <= count; i += 1) {
        for (const k of SEIZURE_ENTRY_KEYS) setValue(seizureFieldKey(i, k), '', { shouldDirty: true });
      }
      setValue(SEIZURE_COUNT_KEY, '0', { shouldDirty: true });
    }
  }, [answer, count, setValue]);

  const addSeizure = () => {
    if (count >= MAX_SEIZURES_PER_NOTE) return;
    setValue(SEIZURE_COUNT_KEY, String(count + 1), { shouldDirty: true });
  };
  const removeSeizure = (index: number) => {
    // Shift later blocks down so numbering stays dense (fields are positional).
    for (let i = index; i < count; i += 1) {
      for (const k of SEIZURE_ENTRY_KEYS) {
        setValue(seizureFieldKey(i, k), String(allValues[seizureFieldKey(i + 1, k)] ?? ''), { shouldDirty: true });
      }
    }
    for (const k of SEIZURE_ENTRY_KEYS) setValue(seizureFieldKey(count, k), '', { shouldDirty: true });
    setValue(SEIZURE_COUNT_KEY, String(count - 1), { shouldDirty: true });
  };
  const toggleInList = (key: string, item: string) => {
    const cur = String(allValues[key] || '').split('; ').filter(Boolean);
    const next = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
    setValue(key, next.join('; '), { shouldDirty: true });
  };

  return (
    <div id="q69_seizureList">
      <div className={styles.row} id="q30_seizureEventRow">
        <div className={styles.f}>
          <label className={styles.label}>
            Seizure event this shift?{required ? ' *' : ''}
          </label>
          <div className={styles.radioRow}>
            <label>
              <DeselectableRadio name="q30_seizureEvent" value="Yes" />
              Yes
            </label>
            <label>
              <DeselectableRadio name="q30_seizureEvent" value="No" />
              No seizure noted
            </label>
          </div>
          {required && !answer && (
            <div style={hint}>
              This client has a seizure disorder. Every note must attest either &quot;No seizure noted&quot; or log each seizure.
            </div>
          )}
        </div>
      </div>

      {answer === 'Yes' && (
        <>
          {/* Hidden count field keeps the number of blocks in the form values. */}
          <input type="hidden" {...register(SEIZURE_COUNT_KEY)} />
          {entries.length === 0 && (
            <div style={hint}>You answered Yes. Add a seizure entry below (one per seizure).</div>
          )}
          {entries.map((e) => {
            const k = (f: (typeof SEIZURE_ENTRY_KEYS)[number]) => seizureFieldKey(e.index, f);
            const dur = seizureDurationSeconds(e);
            const rescue = e.interventions.includes('Rescue medication given');
            const escalated = !!e.response && e.response !== 'None needed';
            return (
              <div key={e.index} style={card}>
                <div style={cardHead}>
                  <strong>Seizure {e.index}</strong>
                  <span style={{ color: '#5c6b7a', fontSize: 12 }}>{dur !== null ? `Duration: ${formatDuration(dur)}` : ''}</span>
                  <button type="button" onClick={() => removeSeizure(e.index)} style={removeBtn} aria-label={`Remove seizure ${e.index}`}>
                    Remove
                  </button>
                </div>

                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('startTime')}>Start time *</label>
                    <input className={styles.input} type="time" id={k('startTime')} {...register(k('startTime'))} />
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('endTime')}>End time</label>
                    <input className={styles.input} type="time" id={k('endTime')} {...register(k('endTime'))} />
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('durationSeconds')}>Duration (seconds) *</label>
                    <input className={styles.input} type="number" min={0} max={7200} id={k('durationSeconds')} placeholder="e.g. 9" {...register(k('durationSeconds'))} />
                    <div style={hintSmall}>Type seconds for short seizures; otherwise end minus start is used.</div>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('seizureType')}>Seizure type *</label>
                    <select className={styles.select} id={k('seizureType')} {...register(k('seizureType'))}>
                      <option value="">Select...</option>
                      {SEIZURE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('witnessedBy')}>Witnessed by *</label>
                    <select className={styles.select} id={k('witnessedBy')} {...register(k('witnessedBy'))}>
                      <option value="">Select...</option>
                      {SEIZURE_WITNESS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.f} style={{ flex: '1 1 100%' }}>
                    <label className={styles.label}>Observed during the seizure</label>
                    <input type="hidden" {...register(k('observations'))} />
                    <div style={chips}>
                      {SEIZURE_OBSERVATIONS.map((o) => (
                        <label key={o} style={chip}>
                          <input type="checkbox" checked={e.observations.includes(o)} onChange={() => toggleInList(k('observations'), o)} /> {o}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.f} style={{ flex: '1 1 100%' }}>
                    <label className={styles.label}>Interventions</label>
                    <input type="hidden" {...register(k('interventions'))} />
                    <div style={chips}>
                      {SEIZURE_INTERVENTIONS.map((o) => (
                        <label key={o} style={chip}>
                          <input type="checkbox" checked={e.interventions.includes(o)} onChange={() => toggleInList(k('interventions'), o)} /> {o}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {rescue && (
                  <div className={styles.row}>
                    <div className={styles.f}>
                      <label className={styles.label} htmlFor={k('rescueMed')}>Rescue medication and dose *</label>
                      <input className={styles.input} type="text" id={k('rescueMed')} placeholder="e.g. Diastat 10 mg rectal" {...register(k('rescueMed'))} />
                      <div style={hintSmall}>Also chart the dose on the Medications page so it is on the MAR.</div>
                    </div>
                    <div className={styles.f}>
                      <label className={styles.label} htmlFor={k('rescueMedTime')}>Time given</label>
                      <input className={styles.input} type="time" id={k('rescueMedTime')} {...register(k('rescueMedTime'))} />
                    </div>
                  </div>
                )}

                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('response')}>Emergency response</label>
                    <select className={styles.select} id={k('response')} {...register(k('response'))}>
                      <option value="">Select...</option>
                      {SEIZURE_RESPONSES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {escalated && <div style={hintSmall}>A 911 call or ER visit also needs an incident report.</div>}
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('postState')}>State after the seizure</label>
                    <select className={styles.select} id={k('postState')} {...register(k('postState'))}>
                      <option value="">Select...</option>
                      {POST_SEIZURE_STATES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('minutesToBaseline')}>Minutes to baseline</label>
                    <input className={styles.input} type="number" min={0} id={k('minutesToBaseline')} {...register(k('minutesToBaseline'))} />
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('physicianNotified')}>Physician notified?{escalated ? ' *' : ''}</label>
                    <select className={styles.select} id={k('physicianNotified')} {...register(k('physicianNotified'))}>
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('physicianNotifiedTime')}>Time notified</label>
                    <input className={styles.input} type="time" id={k('physicianNotifiedTime')} {...register(k('physicianNotifiedTime'))} />
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('familyNotified')}>Family notified?</label>
                    <select className={styles.select} id={k('familyNotified')} {...register(k('familyNotified'))}>
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Family present">Family present</option>
                    </select>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.f} style={{ flex: '1 1 100%' }}>
                    <label className={styles.label} htmlFor={k('notes')}>Notes</label>
                    <textarea className={styles.textarea} id={k('notes')} rows={2} {...register(k('notes'))} placeholder="What it looked like, what happened before, anything the checkboxes missed" />
                  </div>
                </div>
              </div>
            );
          })}

          {advisories.map((a) => (
            <div key={a} style={advisory}>{a}</div>
          ))}

          {count < MAX_SEIZURES_PER_NOTE && (
            <button type="button" onClick={addSeizure} style={addBtn}>
              + Add {entries.length === 0 ? 'a seizure' : 'another seizure'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const card: CSSProperties = { border: '1px solid #d9e2ec', borderRadius: 8, padding: '10px 12px', margin: '10px 0', background: '#fbfcfe' };
const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 };
const removeBtn: CSSProperties = { marginLeft: 'auto', background: 'none', border: '1px solid #d0d7de', borderRadius: 6, padding: '3px 9px', fontSize: 12, cursor: 'pointer', color: '#5c6b7a' };
const addBtn: CSSProperties = { background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 6 };
const chips: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 4 };
const chip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, whiteSpace: 'nowrap' };
const hint: CSSProperties = { background: '#fff8ec', border: '1px solid #f0d9a8', borderRadius: 6, padding: '8px 11px', fontSize: 12.5, color: '#7a4a12', marginTop: 6 };
const hintSmall: CSSProperties = { fontSize: 11.5, color: '#5c6b7a', marginTop: 3 };
const advisory: CSSProperties = { background: '#fdeaea', border: '1px solid #f3b8b8', borderRadius: 6, padding: '8px 11px', fontSize: 12.5, color: '#b3261e', fontWeight: 600, marginTop: 8 };
