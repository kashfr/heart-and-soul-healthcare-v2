'use client';

import { useState } from 'react';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageFiveProps {
  formRef: React.RefObject<HTMLFormElement>;
  credential?: string;
}

export default function FormPageFive({ formRef, credential }: FormPageFiveProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    adverseReaction: false,
    eventResponse: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };
  if (!credential || (credential !== 'LPN' && credential !== 'RN')) {
    return (
      <div>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>SKILLED NURSING &amp; MEDICAL MANAGEMENT</span>
          <p style={{ padding: '20px', color: '#666', textAlign: 'center' }}>
            This page is only available for LPN and RN credentials. Please select a credential on Page 1.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Skilled Nursing Interventions */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SKILLED NURSING INTERVENTIONS</span>

        <div className={styles.subsec}>Interventions Performed</div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Wound care" />
            Wound care
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Catheter care" />
            Catheter care
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="IV line management" />
            IV line management
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Medication administration" />
            Medication administration
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Injection administration" />
            Injection administration
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Foley catheter insertion" />
            Foley catheter insertion
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Ostomy care" />
            Ostomy care
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Tracheostomy care" />
            Tracheostomy care
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Oxygen therapy" />
            Oxygen therapy
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Nebulizer treatment" />
            Nebulizer treatment
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Suctioning" />
            Suctioning
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Blood glucose monitoring" />
            Blood glucose monitoring
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Assessment and evaluation" />
            Assessment and evaluation
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Patient education" />
            Patient education
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Fall prevention" />
            Fall prevention
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Other" />
            Other
          </label>
        </div>
      </div>

      {/* Detailed Description of Interventions */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>DETAILED DESCRIPTION OF INTERVENTIONS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q39_interventionDetails">
              Describe interventions performed, patient response, and any complications or changes in condition: *
            </label>
            <textarea
              className={styles.textarea}
              id="q39_interventionDetails"
              name="q39_interventionDetails"
              rows={6}
              placeholder="Provide detailed notes on each intervention, how the patient responded, and any outcomes..."
              required
            />
          </div>
        </div>
      </div>


      {/* Medications */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>MEDICATIONS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q43_scheduledMeds">Scheduled Medications Administered</label>
            <textarea
              className={styles.textarea}
              id="q43_scheduledMeds"
              name="q43_scheduledMeds"
              rows={4}
              placeholder="List medications, doses, routes, and times administered..."
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q43_prnMeds">PRN Medications Administered</label>
            <textarea
              className={styles.textarea}
              id="q43_prnMeds"
              name="q43_prnMeds"
              rows={4}
              placeholder="List PRN medications, doses, routes, times, and reason..."
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label}>Medication Tolerance</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q43_medTolerance" value="Tolerated without difficulty" />
                Tolerated without difficulty
              </label>
              <label>
                <DeselectableRadio name="q43_medTolerance" value="Adverse reaction / intolerance — document below" />
                Adverse reaction / intolerance — document below
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Adverse Reaction Detail Box */}
      <div style={{
        background: '#fff3f0',
        borderLeft: '3px solid #c62828',
        borderRadius: '4px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('adverseReaction')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.adverseReaction ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0, color: '#c62828' }}>{'\u26A0'} Adverse Reaction / Intolerance Detail</div>
        </div>
        {expandedSections.adverseReaction && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q43_reactionMed">Medication Involved</label>
                <input
                  className={styles.input}
                  type="text"
                  id="q43_reactionMed"
                  name="q43_reactionMed"
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q43_reactionTime">Time of Reaction</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q43_reactionTime"
                  name="q43_reactionTime"
                />
              </div>
            </div>

            <div className={styles.subsec}>Reaction Type</div>
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Nausea/Vomiting" />
                Nausea/Vomiting
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Rash/Hives" />
                Rash/Hives
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Difficulty Breathing" />
                Difficulty Breathing
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Swelling" />
                Swelling
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Dizziness/Syncope" />
                Dizziness/Syncope
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Refusal to take" />
                Refusal to take
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Spitting out/Gagging" />
                Spitting out/Gagging
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Other" />
                Other
              </label>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q43_reactionDescription">Description of Reaction</label>
                <textarea
                  className={styles.textarea}
                  id="q43_reactionDescription"
                  name="q43_reactionDescription"
                  rows={3}
                  placeholder="Describe the adverse reaction in detail..."
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Physician Notified?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q43_reactionPhysNotified" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q43_reactionPhysNotified" value="No" />
                    No
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q43_reactionPhysTime">Time Notified</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q43_reactionPhysTime"
                  name="q43_reactionPhysTime"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Skilled Intervention — Event Response */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SKILLED INTERVENTION — EVENT RESPONSE</span>

        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('eventResponse')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.eventResponse ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Skilled Intervention — Event Response</div>
        </div>
        {expandedSections.eventResponse && (
          <div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q43_safetyMeasures">Immediate Safety Measures Taken</label>
                <textarea
                  className={styles.textarea}
                  id="q43_safetyMeasures"
                  name="q43_safetyMeasures"
                  rows={3}
                  placeholder="Describe immediate safety measures taken..."
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q43_interventionTime">Time of Intervention</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q43_interventionTime"
                  name="q43_interventionTime"
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q43_eventInterventionDetails">Intervention Details</label>
                <textarea
                  className={styles.textarea}
                  id="q43_eventInterventionDetails"
                  name="q43_eventInterventionDetails"
                  rows={4}
                  placeholder="Describe the intervention performed in response to the event..."
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q43_postEventMonitoring">Post-Event Monitoring Summary</label>
                <textarea
                  className={styles.textarea}
                  id="q43_postEventMonitoring"
                  name="q43_postEventMonitoring"
                  rows={4}
                  placeholder="Summarize post-event monitoring and patient status..."
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
