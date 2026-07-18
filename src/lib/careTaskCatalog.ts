/**
 * Care task catalog — the master menu the admin/supervisor picks from when
 * building a client's care task list (plan-of-care tasks on the progress note).
 *
 * DRAFT: seeded from standard nursing skills references (Open RN Nursing
 * Skills, state gastrostomy/tracheostomy protocols) and this agency's own
 * progress-note sections. PENDING RN SUPERVISOR REVIEW — wording, the
 * skilled/any split, and default frequencies are all hers to correct before
 * this catalog is treated as clinically authoritative.
 *
 * `level` encodes the delegation boundary:
 *   'skilled' — RN/LPN only (Nurse Practice Act: not aide-delegable)
 *   'any'     — appropriate for any credential on the case (HHA/CNA included)
 *
 * Custom (off-catalog) tasks are supported at assignment time; they carry no
 * catalogKey. Keys are stable identifiers — never repurpose one.
 */

export type CareTaskLevel = 'skilled' | 'any';

export interface CareTaskCatalogEntry {
  key: string;
  name: string;
  level: CareTaskLevel;
  /** Suggested default; editable per client at assignment. */
  defaultFrequency: string;
}

export interface CareTaskCategory {
  key: string;
  label: string;
  tasks: CareTaskCatalogEntry[];
}

export const CARE_TASK_FREQUENCIES = [
  'Every shift',
  'Twice per shift',
  'Every 2 hours',
  'Every 4 hours',
  'Daily',
  'Twice daily',
  'Weekly',
  'PRN (as needed)',
  'Per physician order',
] as const;

export const CARE_TASK_CATALOG: CareTaskCategory[] = [
  {
    key: 'respiratory',
    label: 'Respiratory / Airway',
    tasks: [
      { key: 'trach-care', name: 'Tracheostomy site care (stoma cleaned, dressing changed)', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'trach-ties', name: 'Trach ties / holder checked or changed', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'trach-inner-cannula', name: 'Inner cannula inspected / cleaned', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'suction-oral', name: 'Oral / nasal suctioning', level: 'skilled', defaultFrequency: 'PRN (as needed)' },
      { key: 'suction-trach', name: 'Tracheal suctioning', level: 'skilled', defaultFrequency: 'PRN (as needed)' },
      { key: 'vent-checks', name: 'Ventilator settings verified against orders; circuit checked', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'trach-emergency-kit', name: 'Emergency kit at bedside verified (spare trach, obturator, ambu bag)', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'oxygen-therapy', name: 'Oxygen therapy administered / titrated per orders', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'nebulizer', name: 'Nebulizer treatment', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'cpt-vest', name: 'Chest physiotherapy / vest therapy', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'cough-assist', name: 'Cough assist device treatment', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'pulse-ox', name: 'Pulse oximetry / apnea monitoring', level: 'skilled', defaultFrequency: 'Every shift' },
    ],
  },
  {
    key: 'nutrition',
    label: 'Nutrition / Feeding',
    tasks: [
      { key: 'tube-feeding', name: 'Tube feeding administered (G / GJ / J / NG per orders)', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'tube-site-care', name: 'Feeding tube site care (cleaned, dried, dressing as ordered)', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'tube-flush', name: 'Feeding tube flushed with water', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'feeding-pump', name: 'Feeding pump checked (rate verified, tubing changed per schedule)', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'oral-feeding-assist', name: 'Oral feeding / meal assistance', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'aspiration-precautions', name: 'Aspiration precautions maintained (positioning, pacing, thickened liquids per orders)', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'intake-monitoring', name: 'Intake monitored and recorded', level: 'any', defaultFrequency: 'Every shift' },
    ],
  },
  {
    key: 'elimination',
    label: 'Elimination / GU',
    tasks: [
      { key: 'catheter-care', name: 'Urinary catheter care (pericare, tubing, bag position)', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'straight-cath', name: 'Straight catheterization per orders', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'ostomy-care', name: 'Ostomy care (appliance emptied / changed, peristomal skin checked)', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'bowel-program', name: 'Bowel program per orders', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'pericare', name: 'Perineal care / incontinence care', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'briefs', name: 'Briefs / diaper changes', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'output-monitoring', name: 'Urine / stool output monitored and recorded', level: 'any', defaultFrequency: 'Every shift' },
    ],
  },
  {
    key: 'skin',
    label: 'Skin / Positioning',
    tasks: [
      { key: 'repositioning', name: 'Repositioned / turned', level: 'any', defaultFrequency: 'Every 2 hours' },
      { key: 'skin-check', name: 'Skin inspected (pressure points, bony prominences)', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'wound-care', name: 'Wound care per orders', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'rom', name: 'Range of motion exercises', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'splints', name: 'Splints / braces / AFOs applied and removed per schedule', level: 'any', defaultFrequency: 'Per physician order' },
    ],
  },
  {
    key: 'neuro-safety',
    label: 'Neuro / Safety',
    tasks: [
      { key: 'seizure-monitoring', name: 'Seizure monitoring and precautions maintained', level: 'skilled', defaultFrequency: 'Every shift' },
      { key: 'fall-precautions', name: 'Fall precautions maintained', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'padded-rails', name: 'Padded side rails up per care plan', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'behavior-monitoring', name: 'Behavioral monitoring / redirection per care plan', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'safety-equipment', name: 'Safety equipment at bedside checked and functional', level: 'any', defaultFrequency: 'Every shift' },
    ],
  },
  {
    key: 'monitoring',
    label: 'Assessment / Monitoring',
    tasks: [
      { key: 'vitals', name: 'Vital signs obtained and recorded', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'blood-glucose', name: 'Blood glucose monitoring per orders', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'io-tracking', name: 'Intake and output totals tracked', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'head-to-toe', name: 'Head-to-toe assessment', level: 'skilled', defaultFrequency: 'Every shift' },
    ],
  },
  {
    key: 'meds',
    label: 'Medications',
    tasks: [
      { key: 'med-admin', name: 'Medications administered per MAR', level: 'skilled', defaultFrequency: 'Per physician order' },
      { key: 'injections', name: 'Injections administered per orders', level: 'skilled', defaultFrequency: 'Per physician order' },
    ],
  },
  {
    key: 'adls',
    label: 'ADLs / Personal Care',
    tasks: [
      { key: 'bathing', name: 'Bath / shower', level: 'any', defaultFrequency: 'Daily' },
      { key: 'oral-care', name: 'Oral care', level: 'any', defaultFrequency: 'Twice daily' },
      { key: 'grooming', name: 'Grooming / hair / nail care', level: 'any', defaultFrequency: 'Daily' },
      { key: 'dressing', name: 'Dressing assistance', level: 'any', defaultFrequency: 'Daily' },
      { key: 'transfers', name: 'Transfers (bed / chair / wheelchair)', level: 'any', defaultFrequency: 'Every shift' },
      { key: 'ambulation', name: 'Ambulation assistance', level: 'any', defaultFrequency: 'Every shift' },
    ],
  },
];

/** Flat lookup by catalog key. */
export function findCatalogTask(key: string): (CareTaskCatalogEntry & { category: string; categoryLabel: string }) | null {
  for (const cat of CARE_TASK_CATALOG) {
    const hit = cat.tasks.find((t) => t.key === key);
    if (hit) return { ...hit, category: cat.key, categoryLabel: cat.label };
  }
  return null;
}
