'use client';

import { useRef, useEffect, useState } from 'react';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageSevenProps {
  formRef: React.RefObject<HTMLFormElement>;
}

export default function FormPageSeven({ formRef }: FormPageSevenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string>('');
  const [totalHours, setTotalHours] = useState<string>('');

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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
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
      // Store the signature as a data URL
      setSignatureImage(canvas.toDataURL());
      // Also save to a hidden input field for form submission
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
            className={styles.signaturePad}
            style={{
              display: 'block',
              backgroundColor: 'white',
              width: '100%',
              maxWidth: '400px',
              height: 'auto',
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

      <div className={styles.section}>
        <span className={styles.sectionLabel}>CLINICAL SUMMARY</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q63_clinicalSummary">
              Overall summary of client status, progress toward goals, and clinical recommendations: *
            </label>
            <textarea
              className={styles.textarea}
              id="q63_clinicalSummary"
              name="q63_clinicalSummary"
              rows={5}
              placeholder="Provide a comprehensive summary of the shift, patient progress, and any clinical concerns or recommendations"
              required
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>CARE PLAN STATUS</span>

        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio
              name="q64_carePlanStatus"
              value="Goals on track"
            />
            Goals on track
          </label>
          <label>
            <DeselectableRadio
              name="q64_carePlanStatus"
              value="Goals partially met"
            />
            Goals partially met
          </label>
          <label>
            <DeselectableRadio
              name="q64_carePlanStatus"
              value="Goals not met - plan revision needed"
            />
            Goals not met - plan revision needed
          </label>
          <label>
            <DeselectableRadio
              name="q64_carePlanStatus"
              value="Client declined - specify in notes"
            />
            Client declined - specify in notes
          </label>
        </div>
      </div>

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
    </div>
  );
}
