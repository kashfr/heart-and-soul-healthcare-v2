'use client';

import { useEffect, useState } from 'react';

const testData = {
  client: {
    name: 'Dorothy Mae Williams',
    dob: '03/15/1948',
    age: 78,
    diagnosis: 'CHF (Congestive Heart Failure), Type 2 Diabetes, Hypertension, Stage 2 Pressure Ulcer (sacrum)',
    address: '2847 Cascade Rd SW, Atlanta, GA 30311',
  },
  shift: {
    dateOfService: '04/07/2026',
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    totalHours: '8.00',
  },
  nurse: {
    name: 'Maria Santos',
    credential: 'LPN',
  },
  status: {
    alertness: 'Lethargic',
    orientation: 'Oriented x2 (person, place) - confused about time and situation intermittently',
    appearance: 'Abnormal - appears fatigued, pale, mild periorbital edema noted',
  },
  vitals: {
    temp: '100.2°F',
    bp: '158/94',
    pulse: '96 (irregular)',
    resp: '24',
    spo2: '91%',
    bloodGlucose: '287 mg/dL',
  },
  observations: {
    activity: 'Client mostly bedbound today. Required full assist for transfers. Sat in wheelchair for 30 minutes during lunch but requested to return to bed due to fatigue and shortness of breath. Ambulation not attempted per nursing judgment.',
    pain: '7/10, bilateral lower extremities and sacral area, described as constant throbbing and burning at wound site, partially relieved with repositioning and medication. Client grimacing with movement.',
  },
  systems: [
    {
      system: 'Neurological',
      status: 'ABNORMAL',
      notes: 'Lethargic, intermittent confusion regarding time and situation. Follows commands with repeated cues. Pupils equal and reactive. No focal weakness but slow to respond. Family reports this is a change from baseline over last 48 hours.',
    },
    {
      system: 'Cardiovascular',
      status: 'ABNORMAL',
      notes: 'Irregular heart rhythm noted, rate 96. BP elevated at 158/94. 2+ pitting edema bilateral lower extremities, increased from 1+ documented on previous visit. Capillary refill >3 seconds in toes bilaterally. Skin cool to touch in distal extremities.',
    },
    {
      system: 'Respiratory',
      status: 'ABNORMAL',
      notes: 'Respirations labored at 24/min. Crackles auscultated in bilateral lower lobes. SpO2 91% on room air, improved to 95% on 2L NC. Client reports increased dyspnea with minimal exertion. Using accessory muscles. HOB elevated to 45 degrees.',
    },
    {
      system: 'Gastrointestinal',
      status: 'ABNORMAL',
      notes: 'Abdomen distended, hypoactive bowel sounds. Client reports decreased appetite, ate only 25% of meals today. Nausea present but no vomiting. Last BM 3 days ago. Fluid intake approximately 500mL by 1200.',
    },
    {
      system: 'Genitourinary',
      status: 'ABNORMAL',
      notes: 'Urine output decreased, dark amber concentrated. Foley catheter in place, 150mL output over 8-hour shift. Client reports no burning or discomfort with catheter.',
    },
    {
      system: 'Integumentary',
      status: 'ABNORMAL',
      notes: 'Stage 2 pressure ulcer sacrum: 3cm x 2.5cm, shallow depth, wound bed pink with yellow slough at margins (~20%). Moderate serous drainage on dressing. Periwound skin intact but erythematous. No signs of infection. Wound care performed per order. Bilateral heel redness noted - offloading boots applied. Skin overall pale, dry, turgor poor (tenting >3 seconds).',
    },
    {
      system: 'Behavioral',
      status: 'WNL',
      notes: 'Cooperative when alert. Appropriate affect. No agitation or behavioral concerns. Expressed frustration about feeling weak but remains engaged with care team.',
    },
  ],
  interventions: {
    performed: 'Skilled nursing assessment, wound care to sacral pressure ulcer, blood glucose monitoring with insulin administration, oxygen therapy management, Foley catheter care, medication administration, edema assessment and elevation therapy, repositioning schedule q2h, fluid intake monitoring',
    justification: 'Complex medical management required due to multiple co-morbidities with acute exacerbation of CHF symptoms. Wound care requires skilled assessment for staging, infection monitoring, and appropriate treatment. Insulin titration based on blood glucose levels requires nursing judgment. Respiratory status requires ongoing monitoring and oxygen therapy management.',
    education: 'Reviewed signs/symptoms of CHF exacerbation with family caregiver (daughter). Discussed importance of daily weight monitoring, fluid restriction (1500mL/day), low-sodium diet. Taught family to recognize when to call nurse vs 911. Reviewed pressure ulcer prevention - repositioning schedule, nutrition, skin inspection.',
    patientResponse: 'Client nodded in acknowledgment but limited verbal response due to fatigue. Daughter verbalized understanding of all education points, demonstrated proper positioning technique, and agreed to maintain fluid intake log. Daughter expressed concern about mother\'s declining status and requested physician follow-up.',
  },
  medications: {
    given: 'Furosemide 40mg PO at 0730, Lisinopril 20mg PO at 0730, Metformin 500mg PO at 0800, Humalog 8 units subQ at 0745 (per sliding scale - BG 287), Acetaminophen 650mg PO at 0800 for pain, Humalog 6 units subQ at 1215 (per sliding scale - BG 234)',
    compliance: 'Partially compliant - client refused afternoon Metformin dose due to nausea. Daughter reports client has been inconsistent with medications over past week due to decreased appetite and confusion.',
    sideEffects: 'Furosemide: minimal urine output response noted (150mL/8hrs - below expected). Metformin: contributing to reported nausea per client. Will report to physician.',
    treatments: 'Sacral wound care: cleansed with normal saline, debrided loose yellow slough at wound margins with gauze, applied silver alginate primary dressing and foam secondary dressing. Secured with tape. Bilateral heel offloading boots applied. O2 via nasal cannula at 2L/min continuous. Repositioned q2h (0700, 0900, 1100, 1300). Foley catheter care performed.',
    equipment: 'Hospital bed with pressure-redistribution mattress in place and functioning. Hoyer lift used for transfers. Wheelchair with cushion. Foley catheter (16Fr, balloon 10mL, inserted 04/01/2026). Oxygen concentrator at bedside - functioning properly. Offloading heel boots (bilateral). Walker available but not used this shift.',
  },
  communication: {
    physicianNotified: 'Yes - Dr. James Patterson notified at 1030 regarding: elevated BP (158/94), decreased SpO2 (91% on RA), elevated blood glucose (287), decreased urine output, increased bilateral edema, and intermittent confusion. Orders received: increase Furosemide to 60mg PO BID, obtain BMP and CBC labs on next visit, continue current O2 therapy, strict I&O monitoring, call if SpO2 drops below 90% or mental status further declines.',
    incidents: 'Near-fall at 0930 - client attempted to stand from bed independently. Caught by nurse before fall occurred. No injury sustained. Bed alarm activated and family reminded of fall precautions. Incident report filed.',
    followUp: 'Labs ordered for next visit (04/08/2026). Physician requested follow-up call with results. Home health aide visit scheduled for tomorrow AM for bathing assistance. PT/OT evaluation requested by physician for deconditioning assessment. Daughter will call agency if any acute changes overnight.',
    nextShiftPlan: 'Continue strict I&O monitoring. Administer increased Furosemide dose (60mg). Reassess respiratory status and SpO2. Monitor wound for signs of infection. Check blood glucose per sliding scale. Reassess mental status and orientation. Ensure repositioning schedule maintained. Follow up on lab orders.',
  },
  signature: {
    printedName: 'Maria Santos',
    credential: 'LPN',
    dateSigned: '04/07/2026',
    clinicalSummary: 'Client with acute-on-chronic CHF exacerbation presenting with increased edema, decreased oxygenation, elevated blood pressure, and intermittent confusion. Blood glucose poorly controlled. Sacral wound Stage 2 - no signs of infection but healing is slow, likely related to overall declining nutritional status and fluid imbalance. Near-fall event occurred - safety measures reinforced. Physician notified and new orders obtained. Client requires continued skilled nursing for complex medical management. Recommend increasing visit frequency to daily until condition stabilizes. Daughter is engaged and supportive but expressed concern about sustainability of care at home if condition continues to decline.',
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
  fieldValueAlert: {
    fontSize: '11px',
    color: '#c62828',
    fontWeight: 600,
  },
  systemRow: {
    display: 'grid' as const,
    gridTemplateColumns: '130px 80px 1fr',
    padding: '6px 0',
    borderBottom: '1px dotted #e0e0e0',
    alignItems: 'start' as const,
  },
  systemRowAlt: {
    display: 'grid' as const,
    gridTemplateColumns: '130px 80px 1fr',
    padding: '6px 0',
    borderBottom: '1px dotted #e0e0e0',
    alignItems: 'start' as const,
    background: '#f9fafb',
  },
  systemLabel: {
    fontWeight: 700,
    fontSize: '10px',
    color: '#444',
    textTransform: 'uppercase' as const,
    paddingTop: '1px',
  },
  systemStatusWNL: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#2e7d32',
  },
  systemStatusAbnormal: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#c62828',
    background: '#ffebee',
    padding: '1px 6px',
    borderRadius: '3px',
    display: 'inline-block' as const,
  },
  systemNotes: {
    fontSize: '11px',
    color: '#1a1a1a',
    lineHeight: '1.5',
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
  vitalCellAlert: {
    padding: '6px 10px',
    borderRight: '1px solid #eee',
    borderBottom: '1px solid #eee',
    background: '#fff3f0',
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
  vitalValueAlert: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#c62828',
    marginTop: '2px',
  },
  alertBanner: {
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: '3px',
    padding: '6px 10px',
    marginBottom: '12px',
    fontSize: '11px',
    color: '#b71c1c',
    fontWeight: 600,
  },
} as const;

function FieldPair({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={styles.fieldRow}>
      <span style={styles.fieldLabel}>{label}:</span>
      <span style={alert ? styles.fieldValueAlert : styles.fieldValue}>{value}</span>
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

export default function ProgressNotePreview2() {
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
          <p style={styles.companyName}>Heart and Soul Home Health</p>
          <p style={styles.companyTagline}>Compassionate Care, Professional Excellence</p>
          <p style={styles.formTitle}>Skilled Nursing Progress Note</p>
          <p style={styles.formDate}>Form Date: {testData.shift.dateOfService}</p>
        </div>

        {/* Alert Banner */}
        <div style={styles.alertBanner}>
          ⚠ PHYSICIAN NOTIFIED — See Communication section for details. New orders received.
        </div>

        {/* Client Information */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Client Information</div>
          <div style={styles.sectionBody}>
            <div style={styles.fieldGrid}>
              <FieldPair label="Client Name" value={testData.client.name} />
              <FieldPair label="Date of Birth" value={testData.client.dob} />
              <FieldPair label="Age" value={String(testData.client.age)} />
            </div>
            <FieldPair label="Primary Diagnosis" value={testData.client.diagnosis} />
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
              <FieldPair label="Alertness" value={testData.status.alertness} alert />
              <FieldPair label="Appearance" value={testData.status.appearance} alert />
            </div>
            <FieldPair label="Orientation" value={testData.status.orientation} alert />
          </div>
        </div>

        {/* Vital Signs */}
        <div style={styles.section} className="print-section">
          <div style={styles.sectionHeader}>Vital Signs</div>
          <div style={styles.vitalsGrid}>
            <div style={styles.vitalCellAlert}>
              <div style={styles.vitalLabel}>Temperature</div>
              <div style={styles.vitalValueAlert}>{testData.vitals.temp}</div>
            </div>
            <div style={styles.vitalCellAlert}>
              <div style={styles.vitalLabel}>Blood Pressure</div>
              <div style={styles.vitalValueAlert}>{testData.vitals.bp}</div>
            </div>
            <div style={styles.vitalCellAlert}>
              <div style={styles.vitalLabel}>Pulse</div>
              <div style={styles.vitalValueAlert}>{testData.vitals.pulse}</div>
            </div>
            <div style={styles.vitalCell}>
              <div style={styles.vitalLabel}>Respirations</div>
              <div style={styles.vitalValueAlert}>{testData.vitals.resp}</div>
            </div>
            <div style={styles.vitalCellAlert}>
              <div style={styles.vitalLabel}>SpO2</div>
              <div style={styles.vitalValueAlert}>{testData.vitals.spo2}</div>
            </div>
            <div style={styles.vitalCellAlert}>
              <div style={styles.vitalLabel}>Blood Glucose</div>
              <div style={styles.vitalValueAlert}>{testData.vitals.bloodGlucose}</div>
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
                <span style={s.status === 'WNL' ? styles.systemStatusWNL : styles.systemStatusAbnormal}>
                  {s.status}
                </span>
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
          Confidential - Heart and Soul Home Health &nbsp;|&nbsp; This document contains protected health information (PHI)
        </div>
      </div>
    </>
  );
}
