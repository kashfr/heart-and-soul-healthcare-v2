'use client';

import { useState, useSyncExternalStore } from 'react';
import type { FormPageProps } from '../types';
import styles from '../page.module.css';
import DeselectableRadio, { radioState, radioSubscribe, radioGetSnapshot } from './DeselectableRadio';

interface FormPageFourProps extends FormPageProps {}

export default function FormPageFour({ formRef, register, watch, setValue, control }: FormPageFourProps) {
  // Subscribe to radio state changes to reactively read aspiration concerns
  useSyncExternalStore(radioSubscribe, radioGetSnapshot, radioGetSnapshot);
  const hasAspirationConcerns = radioState['q38_aspirationConcerns'] === 'Yes';
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
        {expandedSections.nutrition && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_breakfastPct">Breakfast % Consumed</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_breakfastPct"
                  {...register('q38_breakfastPct')}
                  min="0"
                  max="100"
                  placeholder="0-100"
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_lunchPct">Lunch % Consumed</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_lunchPct"
                  {...register('q38_lunchPct')}
                  min="0"
                  max="100"
                  placeholder="0-100"
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_dinnerPct">Dinner % Consumed</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_dinnerPct"
                  {...register('q38_dinnerPct')}
                  min="0"
                  max="100"
                  placeholder="0-100"
                />
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
        )}
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
        {expandedSections.housekeeping && (
          <div>
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
        )}
      </div>

      {/* Abuse / Neglect Screening */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>ABUSE / NEGLECT SCREENING</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label}>Screening Performed?</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q38_abuseScreening" value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name="q38_abuseScreening" value="No" />
                No
              </label>
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q38_abuseNotes">Notes</label>
            <textarea
              className={styles.textarea}
              id="q38_abuseNotes"
              {...register('q38_abuseNotes')}
              rows={3}
              placeholder="Document screening findings or concerns..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
