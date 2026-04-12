'use client';

import { useState } from 'react';
import type { FormPageProps } from '../types';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageSixProps extends FormPageProps {
  credential?: string;
}

export default function FormPageSix({ formRef, register, watch, setValue, control, credential }: FormPageSixProps) {
  const isLpnRn = credential === 'LPN' || credential === 'RN';
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    educationDetails: false,
    goal1: false,
    goal2: false,
    goal3: false,
    physicianNotification: false,
    familyNotification: false,
    supervisorNotification: false,
    incidentDetails: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div>
      {/* EDUCATION PROVIDED */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>EDUCATION PROVIDED</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label}>Client/Caregiver Education Provided this Shift?</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q41_educationProvided" value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name="q41_educationProvided" value="No" />
                No
              </label>
            </div>
          </div>
        </div>

        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('educationDetails')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.educationDetails ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Education Details</div>
        </div>
        {expandedSections.educationDetails && (
          <div>
            <div className={styles.subsec}>Topics Covered (check all that apply)</div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q41_educationTopics" value="Seizure recognition" /> Seizure recognition</label>
              <label><input type="checkbox" name="q41_educationTopics" value="When to call 911" /> When to call 911</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Medication administration/schedule" /> Medication administration/schedule</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Medication side effects" /> Medication side effects</label>
            </div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q41_educationTopics" value="Seizure action plan" /> Seizure action plan</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Safe environment" /> Safe environment</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Infection prevention" /> Infection prevention</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Nutrition" /> Nutrition</label>
            </div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q41_educationTopics" value="Skin care" /> Skin care</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Pain management" /> Pain management</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Equipment use" /> Equipment use</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Signs/symptoms to report" /> Signs/symptoms to report</label>
            </div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q41_educationTopics" value="Care plan goals" /> Care plan goals</label>
              <label><input type="checkbox" name="q41_educationTopics" value="Other" /> Other</label>
            </div>

            <div className={styles.subsec}>Recipients</div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q41_educationRecipients" value="Client" /> Client</label>
              <label><input type="checkbox" name="q41_educationRecipients" value="Parent/Guardian" /> Parent/Guardian</label>
              <label><input type="checkbox" name="q41_educationRecipients" value="Family" /> Family</label>
              <label><input type="checkbox" name="q41_educationRecipients" value="Caregiver" /> Caregiver</label>
              <label><input type="checkbox" name="q41_educationRecipients" value="Other" /> Other</label>
            </div>

            <div className={styles.subsec}>Method</div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q41_educationMethod" value="Verbal" /> Verbal</label>
              <label><input type="checkbox" name="q41_educationMethod" value="Written" /> Written</label>
              <label><input type="checkbox" name="q41_educationMethod" value="Demonstration" /> Demonstration</label>
              <label><input type="checkbox" name="q41_educationMethod" value="Return demonstration" /> Return demonstration</label>
              <label><input type="checkbox" name="q41_educationMethod" value="Video" /> Video</label>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Verbalized Understanding / Teach-back</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q41_teachback" value="Successful" />
                    Successful
                  </label>
                  <label>
                    <DeselectableRadio name="q41_teachback" value="Partial" />
                    Partial
                  </label>
                  <label>
                    <DeselectableRadio name="q41_teachback" value="Unable to assess" />
                    Unable to assess
                  </label>
                </div>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q41_educationNotes">Education Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q41_educationNotes"
                  {...register('q41_educationNotes')}
                  rows={3}
                  placeholder="Additional notes about education provided..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* GOALS OF CARE (LPN/RN only) */}
      <div style={{ display: isLpnRn ? 'block' : 'none' }}>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>GOALS OF CARE</span>

          <div className={styles.row}>
            <div className={styles.f} style={{ flex: '1 1 100%' }}>
              <label className={styles.label}>Goals Discussed this Shift?</label>
              <div className={styles.radioRow}>
                <label>
                  <DeselectableRadio name="q41_goalsDiscussed" value="Yes" />
                  Yes
                </label>
                <label>
                  <DeselectableRadio name="q41_goalsDiscussed" value="No" />
                  No
                </label>
              </div>
            </div>
          </div>

          <div
            className={styles.collapsibleHeader}
            onClick={() => toggleSection('goal1')}
          >
            <span className={styles.toggleArrow}>
              {expandedSections.goal1 ? '▼' : '▶'}
            </span>
            <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Goal 1</div>
          </div>
          {expandedSections.goal1 && (
            <div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q41_goal1Description">Description</label>
                  <input
                    className={styles.input}
                    type="text"
                    id="q41_goal1Description"
                    {...register('q41_goal1Description')}
                  />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label}>Progress</label>
                  <div className={styles.radioRow}>
                    <label><DeselectableRadio name="q41_goal1Progress" value="Met" /> Met</label>
                    <label><DeselectableRadio name="q41_goal1Progress" value="Progressing" /> Progressing</label>
                    <label><DeselectableRadio name="q41_goal1Progress" value="No progress" /> No progress</label>
                    <label><DeselectableRadio name="q41_goal1Progress" value="N/A" /> N/A</label>
                  </div>
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q41_goal1Notes">Notes</label>
                  <input
                    className={styles.input}
                    type="text"
                    id="q41_goal1Notes"
                    {...register('q41_goal1Notes')}
                  />
                </div>
              </div>
            </div>
          )}

          <div
            className={styles.collapsibleHeader}
            onClick={() => toggleSection('goal2')}
          >
            <span className={styles.toggleArrow}>
              {expandedSections.goal2 ? '▼' : '▶'}
            </span>
            <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Goal 2</div>
          </div>
          {expandedSections.goal2 && (
            <div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q41_goal2Description">Description</label>
                  <input
                    className={styles.input}
                    type="text"
                    id="q41_goal2Description"
                    {...register('q41_goal2Description')}
                  />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label}>Progress</label>
                  <div className={styles.radioRow}>
                    <label><DeselectableRadio name="q41_goal2Progress" value="Met" /> Met</label>
                    <label><DeselectableRadio name="q41_goal2Progress" value="Progressing" /> Progressing</label>
                    <label><DeselectableRadio name="q41_goal2Progress" value="No progress" /> No progress</label>
                    <label><DeselectableRadio name="q41_goal2Progress" value="N/A" /> N/A</label>
                  </div>
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q41_goal2Notes">Notes</label>
                  <input
                    className={styles.input}
                    type="text"
                    id="q41_goal2Notes"
                    {...register('q41_goal2Notes')}
                  />
                </div>
              </div>
            </div>
          )}

          <div
            className={styles.collapsibleHeader}
            onClick={() => toggleSection('goal3')}
          >
            <span className={styles.toggleArrow}>
              {expandedSections.goal3 ? '▼' : '▶'}
            </span>
            <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Goal 3</div>
          </div>
          {expandedSections.goal3 && (
            <div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q41_goal3Description">Description</label>
                  <input
                    className={styles.input}
                    type="text"
                    id="q41_goal3Description"
                    {...register('q41_goal3Description')}
                  />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label}>Progress</label>
                  <div className={styles.radioRow}>
                    <label><DeselectableRadio name="q41_goal3Progress" value="Met" /> Met</label>
                    <label><DeselectableRadio name="q41_goal3Progress" value="Progressing" /> Progressing</label>
                    <label><DeselectableRadio name="q41_goal3Progress" value="No progress" /> No progress</label>
                    <label><DeselectableRadio name="q41_goal3Progress" value="N/A" /> N/A</label>
                  </div>
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q41_goal3Notes">Notes</label>
                  <input
                    className={styles.input}
                    type="text"
                    id="q41_goal3Notes"
                    {...register('q41_goal3Notes')}
                  />
                </div>
              </div>
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.f} style={{ flex: '1 1 100%' }}>
              <label className={styles.label}>Overall Care Plan Status</label>
              <div className={styles.radioRow}>
                <label><DeselectableRadio name="q41_overallCarePlan" value="On track" /> On track</label>
                <label><DeselectableRadio name="q41_overallCarePlan" value="Modification recommended" /> Modification recommended</label>
                <label><DeselectableRadio name="q41_overallCarePlan" value="Requires review" /> Requires review</label>
              </div>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.f} style={{ flex: '1 1 100%' }}>
              <label className={styles.label} htmlFor="q41_goalsNotes">Goals of Care Notes</label>
              <textarea
                className={styles.textarea}
                id="q41_goalsNotes"
                {...register('q41_goalsNotes')}
                rows={3}
                placeholder="Additional notes about goals of care..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* COMMUNICATION WITH PATIENT/FAMILY */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>COMMUNICATION WITH PATIENT/FAMILY</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q51_communication">
              Summary of communications with patient, family members, or caregivers: *
            </label>
            <textarea
              className={styles.textarea}
              id="q51_communication"
              {...register('q51_communication')}
              rows={4}
              placeholder="Document conversations, education provided, concerns discussed, etc."
              required
            />
          </div>
        </div>
      </div>

      {/* PHYSICIAN NOTIFICATION (LPN/RN only) */}
      <div style={{ display: isLpnRn ? 'block' : 'none' }}>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>PHYSICIAN NOTIFICATION</span>

          <div className={styles.row}>
            <div className={styles.f} style={{ flex: '1 1 100%' }}>
              <label className={styles.label}>Physician Notified?</label>
              <div className={styles.radioRow}>
                <label>
                  <DeselectableRadio name="q52_physicianNotify" value="Yes" />
                  Yes
                </label>
                <label>
                  <DeselectableRadio name="q52_physicianNotify" value="No" />
                  No
                </label>
              </div>
            </div>
          </div>

          <div
            className={styles.collapsibleHeader}
            onClick={() => toggleSection('physicianNotification')}
          >
            <span className={styles.toggleArrow}>
              {expandedSections.physicianNotification ? '▼' : '▶'}
            </span>
            <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Notification Details</div>
          </div>
          {expandedSections.physicianNotification && (
            <div>
              <div className={styles.row}>
                <div className={styles.f}>
                  <label className={styles.label} htmlFor="q54_notificationTime">Time Notified</label>
                  <input
                    className={styles.input}
                    type="time"
                    id="q54_notificationTime"
                    {...register('q54_notificationTime')}
                  />
                </div>
                <div className={styles.f}>
                  <label className={styles.label} htmlFor="q53_physicianName">Physician Name</label>
                  <input
                    className={styles.input}
                    type="text"
                    id="q53_physicianName"
                    {...register('q53_physicianName')}
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.f}>
                  <label className={styles.label} htmlFor="q52_notifyMethod">Method</label>
                  <select
                    className={styles.select}
                    id="q52_notifyMethod"
                    {...register('q52_notifyMethod')}
                  >
                    <option value="">-- Select --</option>
                    <option value="Phone">Phone</option>
                    <option value="In-person">In-person</option>
                    <option value="Portal/Electronic">Portal/Electronic</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q52_infoReported">Information Reported</label>
                  <textarea
                    className={styles.textarea}
                    id="q52_infoReported"
                    {...register('q52_infoReported')}
                    rows={3}
                    placeholder="Describe what was reported to physician..."
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q55_physicianOrders">Response / New Orders</label>
                  <textarea
                    className={styles.textarea}
                    id="q55_physicianOrders"
                    {...register('q55_physicianOrders')}
                    rows={3}
                    placeholder="Document physician response and any new orders..."
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FAMILY / GUARDIAN NOTIFICATION */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>FAMILY / GUARDIAN NOTIFICATION</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label}>Family Notified?</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q52_familyNotified" value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name="q52_familyNotified" value="No" />
                No
              </label>
            </div>
          </div>
        </div>

        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('familyNotification')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.familyNotification ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Notification Details</div>
        </div>
        {expandedSections.familyNotification && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q52_familyTime">Time Notified</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q52_familyTime"
                  {...register('q52_familyTime')}
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q52_familyContactName">Contact Name</label>
                <input
                  className={styles.input}
                  type="text"
                  id="q52_familyContactName"
                  {...register('q52_familyContactName')}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q52_familyRelationship">Relationship</label>
                <input
                  className={styles.input}
                  type="text"
                  id="q52_familyRelationship"
                  {...register('q52_familyRelationship')}
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q52_familyMethod">Method</label>
                <select
                  className={styles.select}
                  id="q52_familyMethod"
                  {...register('q52_familyMethod')}
                >
                  <option value="">-- Select --</option>
                  <option value="Phone">Phone</option>
                  <option value="In-person">In-person</option>
                  <option value="Text">Text</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Follow-up Call Needed?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q52_familyFollowup" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q52_familyFollowup" value="No" />
                    No
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q52_familyFollowupTime">Follow-up Time</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q52_familyFollowupTime"
                  {...register('q52_familyFollowupTime')}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q52_familyNotes">Family Response / Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q52_familyNotes"
                  {...register('q52_familyNotes')}
                  rows={3}
                  placeholder="Document family response and any notes..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AGENCY SUPERVISOR NOTIFICATION */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>AGENCY SUPERVISOR NOTIFICATION</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label}>Supervisor Notified?</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q52_supervisorNotified" value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name="q52_supervisorNotified" value="No" />
                No
              </label>
            </div>
          </div>
        </div>

        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('supervisorNotification')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.supervisorNotification ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Notification Details</div>
        </div>
        {expandedSections.supervisorNotification && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q52_supervisorTime">Time Notified</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q52_supervisorTime"
                  {...register('q52_supervisorTime')}
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q52_supervisorName">Supervisor Name/Title</label>
                <input
                  className={styles.input}
                  type="text"
                  id="q52_supervisorName"
                  {...register('q52_supervisorName')}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q52_supervisorResponse">Response</label>
                <textarea
                  className={styles.textarea}
                  id="q52_supervisorResponse"
                  {...register('q52_supervisorResponse')}
                  rows={3}
                  placeholder="Document supervisor response..."
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label}>Incident Report Completed?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q52_incidentReportCompleted" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q52_incidentReportCompleted" value="No" />
                    No
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* REPORTABLE INCIDENTS OR UNUSUAL EVENTS */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>REPORTABLE INCIDENTS OR UNUSUAL EVENTS</span>

        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio name="q56_incidents" value="No incidents" />
            No incidents
          </label>
          <label>
            <DeselectableRadio name="q56_incidents" value="Fall" />
            Fall
          </label>
          <label>
            <DeselectableRadio name="q56_incidents" value="Injury" />
            Injury
          </label>
          <label>
            <DeselectableRadio name="q56_incidents" value="Medication error" />
            Medication error
          </label>
        </div>
        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio name="q56_incidents" value="Equipment malfunction" />
            Equipment malfunction
          </label>
          <label>
            <DeselectableRadio name="q56_incidents" value="Behavioral incident" />
            Behavioral incident
          </label>
          <label>
            <DeselectableRadio name="q56_incidents" value="Other" />
            Other
          </label>
        </div>

        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('incidentDetails')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.incidentDetails ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Incident Details</div>
        </div>
        {expandedSections.incidentDetails && (
          <div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q57_incidentDetails">
                  Detailed description of incident, circumstances, what was done:
                </label>
                <textarea
                  className={styles.textarea}
                  id="q57_incidentDetails"
                  {...register('q57_incidentDetails')}
                  rows={4}
                  placeholder="Document incident timeline, response, notifications made, and outcomes"
                />
              </div>
            </div>

            <div className={styles.subsec}>Event Response</div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q43_safetyMeasures">Immediate Safety Measures Taken</label>
                <textarea
                  className={styles.textarea}
                  id="q43_safetyMeasures"
                  {...register('q43_safetyMeasures')}
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
                  {...register('q43_interventionTime')}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q43_eventInterventionDetails">Intervention Details</label>
                <textarea
                  className={styles.textarea}
                  id="q43_eventInterventionDetails"
                  {...register('q43_eventInterventionDetails')}
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
                  {...register('q43_postEventMonitoring')}
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
