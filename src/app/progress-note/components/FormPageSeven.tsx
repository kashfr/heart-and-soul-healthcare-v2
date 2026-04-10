'use client';

import { useRef, useEffect, useState } from 'react';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageSevenProps {
  formRef: React.RefObject<HTMLFormElement>;
  credential?: string;
  initialSignature?: string;
}

export default function FormPageSeven({ formRef, credential, initialSignature }: FormPageSevenProps) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string>('');
  const [totalHours, setTotalHours] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    handoff: false,
  });

  const isLpnRn = credential === 'LPN' || credential === 'RN';

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const calculateTotalHours = () => {
    if (!formRef.current) return;

    const startTimeInput = formRef.current.querySelector(
      'input[name="q7_shiftStart"]'
    ) as HTMLInputElement;
    const endTimeInput = formRef.current.querySelector(
      'input[name="q62_shiftEndTime"]'
    ) as HTMLInputElement;

    if (startTimeInput && endTimeInput && startTimeInput.value && endTimeInput.value) {
      const [startHour, startMin] = startTimeInput.value.split(':').map(Number);
      const [endHour, endMin] = endTimeInput.value.split(':').map(Number);

      let startTotalMin = startHour * 60 + startMin;
      let endTotalMin = endHour * 60 + endMin;

      if (endTotalMin < startTotalMin) {
        endTotalMin += 24 * 60;
      }

      const diffMin = endTotalMin - startTotalMin;
      const hours = (diffMin / 60).toFixed(2);
      setTotalHours(hours);

      const totalHoursInput = formRef.current.querySelector(
        'input[name="q9_totalHours"]'
      ) as HTMLInputElement;
      if (totalHoursInput) {
        totalHoursInput.value = hours;
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, []);

  // Load existing signature when editing
  useEffect(() => {
    if (!initialSignature || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setSignatureImage(initialSignature);
      // Also set the hidden input
      const signatureInput = formRef.current?.querySelector(
        'input[name="q61_signature"]'
      ) as HTMLInputElement;
      if (signatureInput) {
        signatureInput.value = initialSignature;
      }
    };
    img.src = initialSignature;
  }, [initialSignature, formRef]);

  // Get position from either mouse or touch event
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling on touch
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const pos = getPos(e, canvas);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent scrolling on touch

    const canvas = canvasRef.current;
    if (canvas) {
      const pos = getPos(e, canvas);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.closePath();
      }
      setSignatureImage(canvas.toDataURL());
      const signatureInput = formRef.current?.querySelector(
        'input[name="q61_signature"]'
      ) as HTMLInputElement;
      if (signatureInput) {
        signatureInput.value = canvas.toDataURL();
      }
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      setSignatureImage('');
      const signatureInput = formRef.current?.querySelector(
        'input[name="q61_signature"]'
      ) as HTMLInputElement;
      if (signatureInput) {
        signatureInput.value = '';
      }
    }
  };

  return (
    <div>
      {/* FOLLOW-UP CARE OR REFERRALS NEEDED */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>FOLLOW-UP CARE OR REFERRALS NEEDED</span>

        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q58_followup" value="Continued skilled nursing" />
            Continued skilled nursing
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Physical therapy" />
            Physical therapy
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Occupational therapy" />
            Occupational therapy
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Speech therapy" />
            Speech therapy
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q58_followup" value="Medical supplies needed" />
            Medical supplies needed
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Physician follow-up appointment" />
            Physician follow-up appointment
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Specialist referral" />
            Specialist referral
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="None" />
            None
          </label>
        </div>
      </div>

      {/* FOLLOW-UP DETAILS */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>FOLLOW-UP DETAILS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q59_followupDetails">
              Specific follow-up instructions or referral details:
            </label>
            <textarea
              className={styles.textarea}
              id="q59_followupDetails"
              name="q59_followupDetails"
              rows={3}
              placeholder="Include dates, contact information, specific instructions for patient/family"
            />
          </div>
        </div>
      </div>

      {/* PLANS FOR NEXT SHIFT */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>PLANS FOR NEXT SHIFT / CARE CONTINUATION</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q60_nextShiftPlan">
              Summary of care plan, items to monitor, and recommendations for next caregiver:
            </label>
            <textarea
              className={styles.textarea}
              id="q60_nextShiftPlan"
              name="q60_nextShiftPlan"
              rows={4}
              placeholder="Document continuing care needs, precautions, patient progress, and recommendations"
            />
          </div>
        </div>
      </div>

      {/* SHIFT COMPLETION DETAILS */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SHIFT COMPLETION DETAILS</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q62_shiftEndDate">Shift End Date *</label>
            <input
              className={styles.input}
              type="date"
              id="q62_shiftEndDate"
              name="q62_shiftEndDate"
              max={today}
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q62_shiftEndTime">Shift End Time *</label>
            <input
              className={styles.input}
              type="time"
              id="q62_shiftEndTime"
              name="q62_shiftEndTime"
              required
              onChange={calculateTotalHours}
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q9_totalHours">Total Hours</label>
            <input
              className={styles.input}
              type="text"
              id="q9_totalHours"
              name="q9_totalHours"
              value={totalHours}
              readOnly
              style={{ backgroundColor: '#f0f0f0' }}
            />
          </div>
        </div>
      </div>

      {/* CERTIFICATION */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>CERTIFICATION</span>

        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q65_certification"
              value="certified"
              required
            />
            I certify that the information provided in this progress note is accurate and complete to the best of my knowledge. *
          </label>
        </div>
      </div>

      {/* ADDITIONAL NOTES */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>ADDITIONAL NOTES</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q66_additionalNotes">
              Any additional information or comments:
            </label>
            <textarea
              className={styles.textarea}
              id="q66_additionalNotes"
              name="q66_additionalNotes"
              rows={3}
              placeholder="Optional additional documentation"
            />
          </div>
        </div>
      </div>

      {/* END-OF-SHIFT HANDOFF */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>END-OF-SHIFT HANDOFF</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q60_oncomingCaregiver">Oncoming Caregiver Name *</label>
            <input
              className={styles.input}
              type="text"
              id="q60_oncomingCaregiver"
              name="q60_oncomingCaregiver"
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q60_handoffTime">Handoff Time *</label>
            <input
              className={styles.input}
              type="time"
              id="q60_handoffTime"
              name="q60_handoffTime"
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q60_verbalReport">Verbal Report Summary *</label>
            <textarea
              className={styles.textarea}
              id="q60_verbalReport"
              name="q60_verbalReport"
              rows={4}
              placeholder="Summarize key events and handoff information given to oncoming caregiver..."
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label}>Client Condition at Shift End *</label>
            <div className={styles.radioRow}>
              <label><DeselectableRadio name="q60_conditionAtEnd" value="Stable" /> Stable</label>
              <label><DeselectableRadio name="q60_conditionAtEnd" value="Improved" /> Improved</label>
              <label><DeselectableRadio name="q60_conditionAtEnd" value="Declined" /> Declined</label>
              <label><DeselectableRadio name="q60_conditionAtEnd" value="Unchanged" /> Unchanged</label>
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q60_endOfShiftNotes">Additional Notes</label>
            <textarea
              className={styles.textarea}
              id="q60_endOfShiftNotes"
              name="q60_endOfShiftNotes"
              rows={3}
              placeholder="Any additional end-of-shift notes..."
            />
          </div>
        </div>
      </div>

      {/* SIGNATURE AND COMPLETION (ABSOLUTE LAST) */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SIGNATURE AND COMPLETION</span>

        <div className={styles.subsec}>Nurse / Caregiver Signature</div>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
          Please sign in the box below to verify the accuracy and completion of this progress note.
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <label className={styles.label}>Signature *</label>
          <canvas
            ref={canvasRef}
            width={400}
            height={150}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            onTouchCancel={stopDrawing}
            className={styles.signaturePad}
            style={{
              display: 'block',
              backgroundColor: 'white',
              width: '100%',
              maxWidth: '400px',
              height: 'auto',
              touchAction: 'none',
            }}
          />
          <input
            type="hidden"
            name="q61_signature"
            id="q61_signature"
            required
          />
        </div>
        <div className={styles.signaturePadControls}>
          <button
            type="button"
            onClick={clearSignature}
          >
            Clear Signature
          </button>
        </div>
      </div>
    </div>
  );
}
