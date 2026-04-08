'use client';

import { useEffect, useState } from 'react';

const testData = {
  client: {
    name: 'Kaheem Freeman',
    dob: '06/02/1982',
    age: 43,
    diagnosis: 'ADHD',
    address: '1372 Peachtree St NE, Atlanta, GA 30309',
  },
  shift: {
    dateOfService: '04/07/2026',
    startTime: '08:00 AM',
    endTime: '04:00 PM',
    totalHours: '8.00',
  },
  nurse: {
    name: 'Sarah Johnson',
    credential: 'RN',
  },
  status: {
    alertness: 'Alert',
    orientation: 'Oriented x4 (person, place, time, situation)',
    appearance: 'WNL',
  },
  vitals: {
    temp: '98.6\u00B0F',
    bp: '120/80',
    pulse: '72',
    resp: '18',
    spo2: '98%',
    bloodGlucose: '110 mg/dL',
  },
  observations: {
    activity: 'Client was ambulatory with steady gait. Engaged in daily activities independently.',
    pain: '2/10, lower back, described as mild aching, managed with positioning',
  },
  systems: [
    { system: 'Neurological', status: 'WNL', notes: 'Alert and oriented, no focal deficits' },
    { system: 'Cardiovascular', status: 'WNL', notes: 'Regular rate and rhythm, no edema' },
    { system: 'Respiratory', status: 'WNL', notes: 'Clear bilateral breath sounds, no distress' },
    { system: 'Gastrointestinal', status: 'WNL', notes: 'Abdomen soft, non-tender, regular bowel sounds' },
    { system: 'Genitourinary', status: 'WNL', notes: 'Voiding without difficulty' },
    { system: 'Integumentary', status: 'WNL', notes: 'Intact, no breakdown or pressure areas noted' },
    { system: 'Behavioral', status: 'WNL', notes: 'Cooperative, appropriate affect' },
  ],
  interventions: {
    performed: 'Medication administration, vital signs monitoring, skilled assessment, care coordination',
    justification: 'Ongoing need for skilled nursing assessment and medication management',
    education: 'Medication schedule review, fall prevention strategies',
    patientResponse: 'Verbalized understanding, demonstrated proper medication self-administration',
  },
  medications: {
    given: 'Adderall 20mg PO administered at 0800',
    compliance: 'Compliant with medication regimen',
    sideEffects: 'None reported',
    treatments: 'Wound care to left shin - cleaned with NS, applied bacitracin and sterile dressing',
    equipment: 'Walker in good condition, no issues',
  },
  communication: {
    physicianNotified: 'No - no changes in condition requiring notification',
    incidents: 'None',
    followUp: 'Continue current care plan, next visit scheduled 04/09/2026',
    nextShiftPlan: 'Monitor wound healing, reassess pain level, medication administration',
  },
  signature: {
    printedName: 'Sarah Johnson',
    credential: 'RN',
    dateSigned: '04/07/2026',
    clinicalSummary: 'Client stable, tolerated shift well. Wound showing signs of healing. Continue current plan of care.',
  },
};

const styles = {
  page: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '11px',
    lineHeight: '1.4',
    color: '#1a1a1a',
    background: '#ffffff',
    maxWidth: '8.5in',
    margin: '0 auto',
    padding: '0.5in',
    boxSizing: 'border-box' as const,
  },
  header: {
    textAlign: 'center' as const,
    borderBottom: '3px solid #1a3a5c',
    paddingBottom: '10px',
    marginBottom: '16px',
  },
  companyName: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#1a3a5c',
    margin: '0 0 2px 0',
    letterSpacing: '0.5px',
  },
  companyTagline: {
    fontSize: '10px',
    color: '#666',
    margin: '0 0 8px 0',
  },
  formTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#1a3a5c',
    margin: '0',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  formDate: {
    fontSize: '10px',
    color: '#555',
    marginTop: '4px',
  },
  section: {
    border: '1px solid #ccc',
    borderRadius: '3px',
    marginBottom: '12px',
    overflow: 'hidden' as const,
  },
  sectionHeader: {
    background: '#e8eef4',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#1a3a5c',
    borderBottom: '1px solid #ccc',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  sectionBody: {
    padding: '8px 10px',
  },
  fieldGrid: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr',
    gap: '0',
  },
  fieldGrid3: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '0',
  },
  fieldRow: {
    display: 'flex' as const,
    padding: '4px 0',
    borderBottom: '1px dotted #e0e0e0',
  },
  fieldLabel: {
    fontWeight: 700,
    fontSize: '10px',
    color: '#444',
    minWidth: '110px',
    textTransform: 'uppercase' as const,
  },
  fieldValue: {
    fontSize: '11px',
    color: '#1a1a1a',
  },
  systemRow: {
    display: 'grid' as const,
    gridTemplateColumns: '130px 60px 1fr',
    padding: '4px 0',
    borderBottom: '1px dotted #e0e0e0',
    alignItems: 'center' as const,
  },
  systemRowAlt: {
    display: 'grid' as const,
    gridTemplateColumns: '130px 60px 1fr',
    padding: '4px 0',
    borderBottom: '1px dotted #e0e0e0',
    alignItems: 'center' as const,
    background: '#f9fafb',
  },
  systemLabel: {
    fontWeight: 700,
    fontSize: '10px',
    color: '#444',
    textTransform: 'uppercase' as const,
  },
  systemStatus: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#2e7d32',
  },
  systemNotes: {
    fontSize: '11px',
    color: '#1a1a1a',
  },
  textBlock: {
    padding: '4px 0',
    borderBottom: '1px dotted #e0e0e0',
  },
  textBlockLabel: {
    fontWeight: 700,
    fontSize: '10px',
    color: '#444',
    textTransform: 'uppercase' as const,
    marginBottom: '2px',
  },
  textBlockValue: {
    fontSize: '11px',
    color: '#1a1a1a',
  },
  signatureLine: {
    borderTop: '1px solid #333',
    width: '250px',
    marginTop: '30px',
    paddingTop: '4px',
    fontSize: '10px',
    color: '#666',
  },
  signatureGrid: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginTop: '8px',
  },
  printBtn: {
    position: 'fixed' as const,
    bottom: '30px',
    right: '30px',
    padding: '14px 28px',
    background: '#1a3a5c',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    zIndex: 1000,
  },
  downloadBtn: {
    position: 'fixed' as const,
    bottom: '30px',
    right: '230px',
    padding: '14px 28px',
    background: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    zIndex: 1000,
  },
  footer: {
    textAlign: 'center' as const,
    fontSize: '9px',
    color: '#999',
    borderTop: '1px solid #ddd',
    paddingTop: '8px',
    marginTop: '16px',
  },
  vitalsGrid: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '0',
  },
  vitalCell: {
    padding: '6px 10px',
    borderRight: '1px solid #eee',
    borderBottom: '1px solid #eee',
  },
  vitalLabel: {
    fontWeight: 700,
    fontSize: '9px',
    color: '#666',
    textTransform: 'uppercase' as const,
  },
  vitalValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1a1a1a',
    marginTop: '2px',
  },
} as const;

function FieldPair({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.fieldRow}>
      <span style={styles.fieldLabel}>{label}:</span>
      <span style={styles.fieldValue}>{value}</span>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.textBlock}>
      <div style={styles.textBlockLabel}>{label}:</div>
      <div style={styles.textBlockValue}>{value}</div>
    </div>
  );
}

export default function ProgressNotePreview() {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        body { margin: 0 !important; padding: 0 !important; }
        .no-print { display: none !important; }
        @page {
          size: letter;
          margin: 0.4in;
        }
        .print-section {
          break-inside: avoid;
        }
        .print-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 9px;
          color: #999;
          border-top: 1px solid #ddd;
          padding-top: 4px;
        }
      }
      @media screen {
        body { background: #e0e0e0 !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/api/progress-note/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData),
      });
      if (!response.ok) {
        throw new Error('PDF generation failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Progress_Note_${testData.client.name.replace(/\s+/g, '_')}_${testData.shift.dateOfService.replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <button
        className="no-print"
        style={styles.downloadBtn}
        onClick={handleDownloadPDF}
        disabled={downloading}
      >
        {downloading ? 'Generating...' : 'Download PDF'}
      </button>
      <button
        className="no-print"
        style={styles.printBtn}
        onClick={handlePrint}
      >
        Print / Save as PDF
      </button>

      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <p style={styles.companyName}>Heart and Soul Healthcare</p>
          <p style={styles.companyTagline}>Compassionate Care, Professional Excellence</p>
          <p style={styles.formTitle}>Home Health Progress Note</p>
          <p style={styles.formDate}>Form Date: {testData.shift.dateOfService}</p>
        </div>

        {/* Client Information */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Client Information</div>
          <div style={styles.sectionBody}>
            <div style={styles.fieldGrid}>
              <FieldPair label="Client Name" value={testData.client.name} />
              <FieldPair label="Date of Birth" value={testData.client.dob} />
              <FieldPair label="Age" value={String(testData.client.age)} />
              <FieldPair label="Primary Diagnosis" value={testData.client.diagnosis} />
            </div>
            <FieldPair label="Address" value={testData.client.address} />
          </div>
        </div>

        {/* Shift Information */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Shift Information</div>
          <div style={styles.sectionBody}>
            <div style={styles.fieldGrid3}>
              <FieldPair label="Date of Service" value={testData.shift.dateOfService} />
              <FieldPair label="Start Time" value={testData.shift.startTime} />
              <FieldPair label="End Time" value={testData.shift.endTime} />
            </div>
            <FieldPair label="Total Hours" value={testData.shift.totalHours} />
          </div>
        </div>

        {/* Nurse / Caregiver */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Nurse / Caregiver</div>
          <div style={styles.sectionBody}>
            <div style={styles.fieldGrid}>
              <FieldPair label="Name" value={testData.nurse.name} />
              <FieldPair label="Credential" value={testData.nurse.credential} />
            </div>
          </div>
        </div>

        {/* Client Status & Orientation */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Client Status &amp; Orientation</div>
          <div style={styles.sectionBody}>
            <div style={styles.fieldGrid}>
              <FieldPair label="Alertness" value={testData.status.alertness} />
              <FieldPair label="Appearance" value={testData.status.appearance} />
            </div>
            <FieldPair label="Orientation" value={testData.status.orientation} />
          </div>
        </div>

        {/* Vital Signs */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Vital Signs</div>
          <div style={styles.vitalsGrid}>
            <div style={styles.vitalCell}>
              <div style={styles.vitalLabel}>Temperature</div>
              <div style={styles.vitalValue}>{testData.vitals.temp}</div>
            </div>
            <div style={styles.vitalCell}>
              <div style={styles.vitalLabel}>Blood Pressure</div>
              <div style={styles.vitalValue}>{testData.vitals.bp}</div>
            </div>
            <div style={styles.vitalCell}>
              <div style={styles.vitalLabel}>Pulse</div>
              <div style={styles.vitalValue}>{testData.vitals.pulse}</div>
            </div>
            <div style={styles.vitalCell}>
              <div style={styles.vitalLabel}>Respirations</div>
              <div style={styles.vitalValue}>{testData.vitals.resp}</div>
            </div>
            <div style={styles.vitalCell}>
              <div style={styles.vitalLabel}>SpO2</div>
              <div style={styles.vitalValue}>{testData.vitals.spo2}</div>
            </div>
            <div style={styles.vitalCell}>
              <div style={styles.vitalLabel}>Blood Glucose</div>
              <div style={styles.vitalValue}>{testData.vitals.bloodGlucose}</div>
            </div>
          </div>
        </div>

        {/* Observations */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Observations</div>
          <div style={styles.sectionBody}>
            <TextBlock label="Activity Level" value={testData.observations.activity} />
            <TextBlock label="Pain Assessment" value={testData.observations.pain} />
          </div>
        </div>

        {/* System Assessments */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>System Assessments</div>
          <div style={styles.sectionBody}>
            <div style={{ ...styles.systemRow, borderBottom: '1px solid #ccc', fontWeight: 700, fontSize: '10px', color: '#444' }}>
              <span>SYSTEM</span>
              <span>STATUS</span>
              <span>NOTES</span>
            </div>
            {testData.systems.map((s, i) => (
              <div key={s.system} style={i % 2 === 1 ? styles.systemRowAlt : styles.systemRow}>
                <span style={styles.systemLabel}>{s.system}</span>
                <span style={styles.systemStatus}>{s.status}</span>
                <span style={styles.systemNotes}>{s.notes}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Skilled Nursing Interventions */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Skilled Nursing Interventions</div>
          <div style={styles.sectionBody}>
            <TextBlock label="Interventions Performed" value={testData.interventions.performed} />
            <TextBlock label="Justification for Skilled Care" value={testData.interventions.justification} />
            <TextBlock label="Education Provided" value={testData.interventions.education} />
            <TextBlock label="Patient Response" value={testData.interventions.patientResponse} />
          </div>
        </div>

        {/* Medications & Treatments */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Medications &amp; Treatments</div>
          <div style={styles.sectionBody}>
            <TextBlock label="Medications Administered" value={testData.medications.given} />
            <TextBlock label="Compliance" value={testData.medications.compliance} />
            <TextBlock label="Side Effects" value={testData.medications.sideEffects} />
            <TextBlock label="Treatments Performed" value={testData.medications.treatments} />
            <TextBlock label="Equipment / DME" value={testData.medications.equipment} />
          </div>
        </div>

        {/* Communication */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Communication</div>
          <div style={styles.sectionBody}>
            <TextBlock label="Physician Notification" value={testData.communication.physicianNotified} />
            <TextBlock label="Incidents / Unusual Occurrences" value={testData.communication.incidents} />
            <TextBlock label="Follow-Up" value={testData.communication.followUp} />
            <TextBlock label="Next Shift Plan" value={testData.communication.nextShiftPlan} />
          </div>
        </div>

        {/* Clinical Summary */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Clinical Summary</div>
          <div style={styles.sectionBody}>
            <div style={styles.textBlockValue}>{testData.signature.clinicalSummary}</div>
          </div>
        </div>

        {/* Signature */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Signature</div>
          <div style={styles.sectionBody}>
            <div style={styles.signatureGrid}>
              <div>
                <FieldPair label="Printed Name" value={testData.signature.printedName} />
                <FieldPair label="Credential" value={testData.signature.credential} />
                <FieldPair label="Date Signed" value={testData.signature.dateSigned} />
              </div>
              <div>
                <div style={styles.signatureLine}>
                  Signature
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          Confidential - Heart and Soul Healthcare &nbsp;|&nbsp; This document contains protected health information (PHI)
        </div>
      </div>
    </>
  );
}
