'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { FormPageProps } from '../types';
import styles from '../page.module.css';
import DeselectableRadio, { radioState, radioSubscribe, radioGetSnapshot } from './DeselectableRadio';
import FieldError from './FieldError';
import { rangeValidator } from '../validators';
import { getCareTasks } from '@/lib/careTasks';
import {
  buildCareTasksMeta,
  parseCareTasksMeta,
  CARE_TASK_STATUSES,
  type CareTaskMetaEntry,
} from '@/lib/careTaskCharting';

const getGlobalSnapshotStr = () => String(radioGetSnapshot());

interface FormPageFourProps extends FormPageProps {
  credential?: string;
  /** True when editing a submitted note — the care-task snapshot is then
   *  rendered as stored, never refreshed from the live task list. */
  editMode?: boolean;
}

export default function FormPageFour({ formRef, register, watch, setValue, control, credential, editMode, errors }: FormPageFourProps) {
  // Subscribe to radio state changes to reactively read aspiration concerns
  // and the per-care-task status answers.
  useSyncExternalStore(radioSubscribe, getGlobalSnapshotStr, getGlobalSnapshotStr);
  const hasAspirationConcerns = radioState['q38_aspirationConcerns'] === 'Yes';

  // --- Care plan tasks (plan-of-care driven charting) ---
  // The section renders from the careTasksMeta SNAPSHOT stored in the form
  // values. For a new note we refresh that snapshot from the client's live
  // task list (active + RN-approved only, aide-filtered); when editing a
  // submitted note the stored snapshot is the historical record and is left
  // untouched. Radios ride the DeselectableRadio store like every other
  // radio group, so drafts and edit mode restore them for free.
  const carePatientId = String(watch('patientId') || '');
  const careTasksMetaRaw = watch('careTasksMeta') || '';
  const isSkilled = credential === 'LPN' || credential === 'RN';

  useEffect(() => {
    if (editMode || !carePatientId) return;
    let cancelled = false;
    (async () => {
      const all = await getCareTasks(carePatientId);
      if (cancelled) return;
      const presented: CareTaskMetaEntry[] = all
        .filter((t) => t.status === 'active' && t.approvedAt != null)
        .filter((t) => isSkilled || t.level === 'any')
        .sort((a, b) =>
          a.categoryLabel !== b.categoryLabel
            ? (a.categoryLabel || '').localeCompare(b.categoryLabel || '')
            : (a.name || '').localeCompare(b.name || ''),
        )
        .map((t) => ({
          id: t.id!,
          name: t.name,
          categoryLabel: t.categoryLabel,
          frequency: t.frequency,
          level: t.level,
        }));
      setValue('careTasksMeta', presented.length > 0 ? buildCareTasksMeta(presented) : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [carePatientId, isSkilled, editMode, setValue]);

  const careTasks = useMemo(() => parseCareTasksMeta(careTasksMetaRaw), [careTasksMetaRaw]);
  const careTaskGroups = useMemo(() => {
    const groups: { label: string; tasks: CareTaskMetaEntry[] }[] = [];
    for (const t of careTasks) {
      const last = groups[groups.length - 1];
      if (last && last.label === t.categoryLabel) last.tasks.push(t);
      else groups.push({ label: t.categoryLabel, tasks: [t] });
    }
    return groups;
  }, [careTasks]);

  const careTaskReqStyle: React.CSSProperties = { border: '2px solid #c62828', background: '#fff5f5', borderRadius: 6, padding: '4px 8px' };
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    nutrition: false,
    housekeeping: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div>
      {/* Care Plan Tasks — only for clients with an approved task list */}
      {careTasks.length > 0 && (
        <div className={styles.section} id="careTasksSection">
          <span className={styles.sectionLabel}>CARE PLAN TASKS</span>
          <p style={{ fontSize: '12.5px', color: '#666', margin: '4px 0 12px' }}>
            These tasks come from this client&apos;s plan of care. Answer each one — use
            &quot;Not completed&quot; with a note when a task didn&apos;t happen this shift, and
            &quot;N/A&quot; when it doesn&apos;t apply today.
          </p>
          {careTaskGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: 10 }}>
              <div className={styles.subsec}>{group.label}</div>
              {group.tasks.map((t) => {
                const status = radioState[`careTask_${t.id}`] || '';
                return (
                  <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#2c3e50' }}>
                      {t.name} <span style={{ fontWeight: 400, color: '#888' }}>· {t.frequency}</span>
                    </div>
                    <div
                      className={styles.radioRow}
                      id={`careTaskRow_${t.id}`}
                      style={{ marginTop: 6, ...(status ? {} : careTaskReqStyle) }}
                    >
                      {CARE_TASK_STATUSES.map((s) => (
                        <label key={s}>
                          <DeselectableRadio name={`careTask_${t.id}`} value={s} />
                          {s}
                        </label>
                      ))}
                    </div>
                    {status === 'Not completed' && (
                      <input
                        className={styles.input}
                        type="text"
                        style={{ marginTop: 6 }}
                        {...register(`careTask_${t.id}_note`)}
                        placeholder="Why not completed? (e.g. client at appointment, refused, family completed)"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Personal Care / ADLs */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>PERSONAL CARE / ADLs</span>

        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Bath/Shower" />
            Bath/Shower
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Oral Care" />
            Oral Care
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Hair Care" />
            Hair Care
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Grooming (nail care, shaving, etc.)" />
            Grooming (nail care, shaving, etc.)
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Dressing" />
            Dressing
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Toileting assistance" />
            Toileting assistance
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Incontinence care / Pericare" />
            Incontinence care / Pericare
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Briefs / Diaper Changes" />
            Briefs / Diaper Changes
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Feeding / Meal assistance" />
            Feeding / Meal assistance
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Transfers (bed/chair/wheelchair)" />
            Transfers (bed/chair/wheelchair)
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Ambulation assistance" />
            Ambulation assistance
          </label>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Repositioning" />
            Repositioning
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_personalCare" value="Range of Motion (ROM)" />
            Range of Motion (ROM)
          </label>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q38_personalCareNotes">Personal Care Notes</label>
            <textarea
              className={styles.textarea}
              id="q38_personalCareNotes"
              {...register('q38_personalCareNotes')}
              rows={3}
              placeholder="Additional notes on personal care provided..."
            />
          </div>
        </div>
      </div>

      {/* Nutrition & Hydration */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>NUTRITION &amp; HYDRATION</span>

        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('nutrition')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.nutrition ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Nutrition &amp; Hydration</div>
        </div>
        <div style={{ display: expandedSections.nutrition ? 'block' : 'none' }}>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_breakfastPct">Breakfast % Consumed</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_breakfastPct"
                  {...register('q38_breakfastPct', {
                    validate: rangeValidator(0, 100, 'Must be 0–100'),
                  })}
                  min="0"
                  max="100"
                  placeholder="0-100"
                />
                <FieldError name="q38_breakfastPct" errors={errors} />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_lunchPct">Lunch % Consumed</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_lunchPct"
                  {...register('q38_lunchPct', {
                    validate: rangeValidator(0, 100, 'Must be 0–100'),
                  })}
                  min="0"
                  max="100"
                  placeholder="0-100"
                />
                <FieldError name="q38_lunchPct" errors={errors} />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_dinnerPct">Dinner % Consumed</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_dinnerPct"
                  {...register('q38_dinnerPct', {
                    validate: rangeValidator(0, 100, 'Must be 0–100'),
                  })}
                  min="0"
                  max="100"
                  placeholder="0-100"
                />
                <FieldError name="q38_dinnerPct" errors={errors} />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Fluids Encouraged?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q38_fluidsEncouraged" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q38_fluidsEncouraged" value="No" />
                    No
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label}>Aspiration Concerns?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q38_aspirationConcerns" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q38_aspirationConcerns" value="No" />
                    No
                  </label>
                </div>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '4px', fontStyle: 'italic' }}>
                  Selecting &quot;Yes&quot; will require you to document details in Nutrition Notes below.
                </p>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q38_nutritionNotes">
                  Nutrition Notes {hasAspirationConcerns && '*'}
                </label>
                <textarea
                  className={styles.textarea}
                  style={hasAspirationConcerns ? { border: '2px solid #c62828', background: '#fff5f5' } : undefined}
                  id="q38_nutritionNotes"
                  {...register('q38_nutritionNotes')}
                  rows={3}
                  required={hasAspirationConcerns}
                  placeholder={hasAspirationConcerns ? 'Required — document aspiration concerns, precautions taken, and dietary modifications...' : 'Additional notes on nutrition and hydration...'}
                />
              </div>
          </div>
        </div>
      </div>

      {/* Housekeeping */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>HOUSEKEEPING</span>

        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('housekeeping')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.housekeeping ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Housekeeping</div>
        </div>
        <div style={{ display: expandedSections.housekeeping ? 'block' : 'none' }}>
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" name="q38_housekeeping" value="Linens changed/straightened" />
                Linens changed/straightened
              </label>
              <label>
                <input type="checkbox" name="q38_housekeeping" value="Surfaces cleaned" />
                Surfaces cleaned
              </label>
              <label>
                <input type="checkbox" name="q38_housekeeping" value="Play area tidied" />
                Play area tidied
              </label>
              <label>
                <input type="checkbox" name="q38_housekeeping" value="Emergency supplies checked and restocked" />
                Emergency supplies checked and restocked
              </label>
          </div>
        </div>
      </div>

    </div>
  );
}
