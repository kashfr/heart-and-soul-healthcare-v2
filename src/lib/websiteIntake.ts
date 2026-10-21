/**
 * How a referral from each website becomes a card, and when the website
 * refuses one. Moved here from the intake route (GAPP site) and the referral
 * form's server action (Heart & Soul site) so the same code also runs when
 * staff edit a card's screened answers: an edit is refused exactly when the
 * website would have refused that submission, and the card's rows and
 * ⚠ flags are rebuilt exactly as the website would have built them.
 * Pure (no Firebase, no email), so it is unit-tested directly.
 */
import { formatDateUS } from './dateFormat';
import { paidCaregiverDiagnosisFlag, screenYoungPaidCaregiver } from './diagnosisScreening';
import {
  CATALOG_VERSION,
  behaviorRiskLabel,
  composeDiagnosisText,
  currentServiceLabels,
  equipmentLabels,
  inferService,
  highBehaviorPaidFlag,
  paidCareBasisLabel,
  relationshipLabel,
  screenCaregiverRelationship,
  screenAgencyStaff,
  screenBehavioralPaidCaregiver,
  screenMixedPaidCaregiver,
  type BehaviorRisk,
  type CaregiverRelationship,
  type PaidCareBasis,
  type ServiceKey,
} from './diagnosisCatalog';

export interface Refusal {
  code: string;
  reason: string;
}

/** A website referral's card fields (source and delivery id aside). */
export interface BuiltReferral {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  county: string;
  program: string;
  referrerName?: string;
  service: ServiceKey | null;
  details: { label: string; value: string }[];
}

// --- GAPP site (forwarded to /api/referrals/intake) ---------------------------

export interface GappAnswers {
  submitterName?: string;
  /** The submitter's relationship to the child. */
  relationship?: CaregiverRelationship;
  /** Asked only when the relationship screen needs it. */
  hasGuardianship?: '' | 'yes' | 'no';
  /** Does the family want a nurse or aide from the agency in the home? */
  wantsAgencyStaff?: '' | 'yes' | 'no';
  fullName?: string;
  phoneNumber?: string;
  emailAddress?: string;
  streetAddress?: string;
  city?: string;
  zip?: string;
  county?: string;
  childsMedicaidID?: string;
  /** Readable diagnosis text. Composed by the form from the structured
   *  answers below (or typed free-hand by older form builds), and stored
   *  verbatim as the Diagnosis row so nothing downstream had to change. */
  diagnosis?: string;
  /** Structured intake (src/lib/diagnosisCatalog.ts). Absent on submissions
   *  from a form build that predates the checkboxes — every consumer below
   *  degrades to the free-text diagnosis in that case. */
  diagnoses?: string[];
  diagnosisOther?: string;
  equipment?: string[];
  behaviorRisk?: BehaviorRisk;
  currentServices?: string[];
  /** The catalog the submitting form was built against. */
  catalogVersion?: string;
  comments?: string;
  provideLater?: boolean;
  dob?: string;
  careNeeds?: '' | 'personal' | 'nursing' | 'behavioral' | 'unsure';
  seekingPaidCaregiver?: '' | 'yes' | 'no';
  /** Mixed diagnosis + seeking pay: what the hands-on care is mainly for. */
  paidCareBasis?: PaidCareBasis;
  /** Optional: the child's doctor, who signs the plan of treatment. */
  physicianName?: string;
  physicianOffice?: string;
  physicianPhone?: string;
  physicianFax?: string;
}

const CARE_LABEL: Record<string, string> = {
  personal: 'Hands-on personal care',
  nursing: 'Skilled medical / nursing care',
  behavioral: 'Behavioral / autism support',
  unsure: 'Not sure',
};

const SERVICE_LABEL: Record<string, string> = {
  nursing: 'Skilled Nursing',
  pss: 'Personal Support Services (PSS)',
  behavioral: 'Behavioral Support Aide Services (BSS)',
};

// Age label for the staff view, e.g. "2 years" or "8 months". Empty if the date
// of birth is missing or unparseable.
export function ageLabel(dob?: string): string {
  if (!dob) return '';
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  if (birth > now) return '';
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return '';
  const years = Math.floor(months / 12);
  return years < 1
    ? `${months} month${months === 1 ? '' : 's'}`
    : `${years} year${years === 1 ? '' : 's'}`;
}

// Map the GAPP website's answers into a unified referral (everything but the
// source and the delivery id).
export function buildGappReferral(r: GappAnswers): BuiltReferral {
  const address = [r.streetAddress, r.city, r.zip ? `GA ${r.zip}` : '']
    .filter(Boolean)
    .join(', ');
  const medicaid = r.childsMedicaidID
    ? r.childsMedicaidID
    : r.provideLater
    ? 'Will provide later'
    : '';

  const seekingValue =
    r.seekingPaidCaregiver === 'yes'
      ? 'Yes'
      : r.seekingPaidCaregiver === 'no'
      ? 'No'
      : '';
  // Mixed diagnosis + paid request: what the family said the hands-on care is
  // for (or that the form never asked). Falls back to the free-text diagnosis
  // screen for anything else that reaches us, so staff can triage at a glance.
  const reviewFlag =
    screenMixedPaidCaregiver({ ...r, freeText: r.diagnosis }).flag ??
    paidCaregiverDiagnosisFlag(r.diagnosis, r.seekingPaidCaregiver);
  // Young child + paid request that was allowed through (skilled equipment or
  // a scoring mobility need): say why, so staff confirm it at the assessment.
  // A request that fails the same screen is refused in POST before we get here.
  const ageFlag = screenYoungPaidCaregiver(r).cleared;

  // Which GAPP service line the family's answers point to, and whether that
  // disagrees with the care need they selected. Advisory: it drives the board's
  // partner matching and flags the card, it never decides eligibility (which
  // Alliant determines on medical necessity, GAPP manual §702.1.1).
  // Who is asking to be paid (guardianship / not-the-applicant notes), and a
  // paid request that reports behaviors needing help to manage.
  const relationship = screenCaregiverRelationship(r);
  const behaviorFlag = highBehaviorPaidFlag(r);

  const inferred = inferService(r);
  const inferredValue = inferred.service
    ? `${SERVICE_LABEL[inferred.service]} (${inferred.reason})`
    : '';

  // A form built against a different catalog than this one is speaking a
  // vocabulary we may not fully understand, so say so on the card rather than
  // silently dropping codes we don't recognize.
  const catalogDrift =
    r.catalogVersion && r.catalogVersion !== CATALOG_VERSION
      ? `Submitted by a form using catalog ${r.catalogVersion}; this portal expects ${CATALOG_VERSION}. Some answers may be missing.`
      : null;

  return {
    clientName: r.fullName ?? '',
    clientEmail: r.emailAddress ?? '',
    clientPhone: r.phoneNumber ?? '',
    county: r.county ?? '',
    program: 'GAPP - Georgia Pediatric Program',
    referrerName: r.submitterName || undefined,
    service: inferred.service,
    details: [
      ...(reviewFlag ? [{ label: '⚠ Review', value: reviewFlag }] : []),
      ...(ageFlag ? [{ label: '⚠ Young child', value: ageFlag }] : []),
      ...(relationship.flag ? [{ label: '⚠ Relationship', value: relationship.flag }] : []),
      ...(behaviorFlag ? [{ label: '⚠ Behavior', value: behaviorFlag }] : []),
      ...(inferred.conflict
        ? [{ label: '⚠ Care need unclear', value: inferred.conflict }]
        : []),
      ...(catalogDrift ? [{ label: '⚠ Form version', value: catalogDrift }] : []),
      { label: 'Relationship to child', value: relationshipLabel(r.relationship) },
      { label: 'Date of birth', value: formatDateUS(r.dob ?? '') },
      { label: 'Age', value: ageLabel(r.dob) },
      { label: 'Address', value: address },
      { label: "Member's Medicaid ID", value: medicaid },
      // Same labels as the Heart & Soul form: Create Client Record and PPOT
      // requests read them (referralConvertShared, ppotShared).
      { label: "Child's physician", value: r.physicianName ?? '' },
      { label: 'Physician office', value: r.physicianOffice ?? '' },
      { label: 'Physician phone', value: r.physicianPhone ?? '' },
      { label: 'Physician fax', value: r.physicianFax ?? '' },
      { label: 'Diagnosis', value: r.diagnosis ?? '' },
      { label: 'Equipment & daily care', value: equipmentLabels(r.equipment).join(', ') },
      { label: 'Behavior risk', value: behaviorRiskLabel(r.behaviorRisk) },
      { label: 'Current services', value: currentServiceLabels(r.currentServices).join(', ') },
      { label: 'Comments', value: r.comments ?? '' },
      {
        label: 'Primary care need',
        value: CARE_LABEL[r.careNeeds ?? ''] ?? '',
      },
      { label: 'Inferred service need', value: inferredValue },
      { label: 'Seeking paid caregiver', value: seekingValue },
      ...(r.wantsAgencyStaff
        ? [{ label: 'Wants agency staff in the home', value: r.wantsAgencyStaff === 'yes' ? 'Yes' : 'No' }]
        : []),
      ...(relationship.asksGuardianship
        ? [{
            label: 'Legal guardianship',
            value: r.hasGuardianship === 'yes' ? 'Yes' : r.hasGuardianship === 'no' ? 'No' : '',
          }]
        : []),
      ...(r.seekingPaidCaregiver === 'yes' && r.paidCareBasis
        ? [{ label: 'Hands-on care mainly due to', value: paidCareBasisLabel(r.paidCareBasis) }]
        : []),
    ],
  };
}

// Same rules, same shared functions, same order as the GAPP site's form and
// route (src/app/api/referral/route.ts there).
function paidCaregiverRefusal(r: GappAnswers): Refusal | null {
  if (r.seekingPaidCaregiver !== 'yes') return null;
  const behavioral = screenBehavioralPaidCaregiver({ ...r, freeText: r.diagnosis });
  if (behavioral) {
    return { code: 'behavioral-paid-caregiver', reason: behavioral };
  }
  const youngChild = screenYoungPaidCaregiver(r);
  if (youngChild.block) {
    return { code: 'young-child-paid-caregiver', reason: youngChild.block };
  }
  const mixed = screenMixedPaidCaregiver(r);
  if (mixed.block) {
    return { code: 'mixed-paid-caregiver', reason: mixed.block };
  }
  const relationship = screenCaregiverRelationship(r);
  if (relationship.block) {
    return { code: 'foster-paid-caregiver', reason: relationship.block };
  }
  return null;
}

/** The GAPP site's hard stops, in the site's order. Null when it may go in. */
export function gappRefusal(r: GappAnswers): Refusal | null {
  const staff = screenAgencyStaff(r);
  return paidCaregiverRefusal(r) ?? (staff ? { code: 'no-agency-staff', reason: staff } : null);
}

// --- Heart & Soul site (/referral form, processReferralSubmission) -------------

const GAPP_SERVICE_LABELS: Record<ServiceKey, string> = {
  nursing: 'Skilled Nursing',
  pss: 'Personal Support Services (PSS)',
  behavioral: 'Behavioral Support Aide Services (BSS)',
};

const PROGRAM_LABELS: Record<string, string> = {
  'gapp': 'GAPP - Georgia Pediatric Program',
  'now-comp': 'NOW/COMP Waiver',
  'icwp': 'ICWP - Independent Care Waiver',
  'edwp': 'EDWP (CCSP & SOURCE)',
  'private-pay': 'Private Pay',
  'other': 'Other / Not Sure',
};
const SOURCE_LABELS: Record<string, string> = {
  'hospital': 'Hospital / Medical Facility',
  'physician': 'Physician / Healthcare Provider',
  'case-manager': 'Case Manager / Support Coordinator',
  'family': 'Family Member',
  'self': 'Self-Referral',
  'other': 'Other',
};
const URGENCY_LABELS: Record<string, string> = {
  'standard': 'Standard (1-2 weeks)',
  'urgent': 'Urgent (within 1 week)',
  'immediate': 'Immediate (ASAP)',
};
const labelFor = (map: Record<string, string>, code: string) =>
  map[code] ?? code;

/** The Heart & Soul form's answers, as the form posts them. Loosely typed
 *  because the form sends them that way; every reader tolerates gaps. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface HsAnswers {
  client: any;
  program: any;
  referrer: any;
  details: any;
  physician?: { name?: string; office?: string; phone?: string; fax?: string };
}

/** The Heart & Soul form's hard stops (GAPP only), in the form's order. */
export function hsRefusal(data: HsAnswers): Refusal | null {
  const { client, program, details } = data;
  if (program?.interest === 'gapp' && details?.seekingPaidCaregiver === 'yes') {
    const prose = `${details.serviceNeeds ?? ''} ${details.additionalNotes ?? ''}`;
    // Paid + behavioral picture (structured answers, or the prose describing
    // autism, with no medical condition or skilled care): the FCO never
    // covers it.
    const behavioral = screenBehavioralPaidCaregiver({ ...details, freeText: prose });
    if (behavioral) {
      return { code: 'behavioral-paid-caregiver', reason: behavioral };
    }
    const youngChild = screenYoungPaidCaregiver({
      dob: client?.dob,
      seekingPaidCaregiver: 'yes',
      equipment: details.equipment,
    });
    if (youngChild.block) {
      return { code: 'young-child-paid-caregiver', reason: youngChild.block };
    }
    const mixed = screenMixedPaidCaregiver({ ...details, freeText: prose });
    if (mixed.block) {
      return { code: 'mixed-paid-caregiver', reason: mixed.block };
    }
    const relationship = screenCaregiverRelationship({ ...details, dob: client?.dob });
    if (relationship.block) {
      return { code: 'foster-paid-caregiver', reason: relationship.block };
    }
  }
  // Declining agency staff (GAPP) is refused whether or not pay is sought.
  if (program?.interest === 'gapp') {
    const staff = screenAgencyStaff(details);
    if (staff) {
      return { code: 'no-agency-staff', reason: staff };
    }
  }
  return null;
}

/** The Heart & Soul form's answers as a card. */
export function buildHsReferral(data: HsAnswers): BuiltReferral {
  const { client, program, referrer, details } = data;
  const physician = (data.physician ?? {}) as { name?: string; office?: string; phone?: string; fax?: string };
  // Mixed diagnosis + paid request: what the family said the hands-on
  // care is for. Falls back to the free-text screen (mirrors the GAPP
  // intake) for anything else that reaches us.
  const prose = `${details.serviceNeeds ?? ''} ${details.additionalNotes ?? ''}`;
  const reviewFlag =
    program.interest === 'gapp'
      ? screenMixedPaidCaregiver({ ...details, freeText: prose }).flag ??
        paidCaregiverDiagnosisFlag(prose, details.seekingPaidCaregiver)
      : null;
  // Young child + paid request that cleared the hard stop above (skilled
  // equipment or a scoring mobility need): say why, for the assessment.
  const ageFlag =
    program.interest === 'gapp'
      ? screenYoungPaidCaregiver({
          dob: client.dob,
          seekingPaidCaregiver: details.seekingPaidCaregiver,
          equipment: details.equipment,
        }).cleared
      : null;
  // Which GAPP service line the answers point to. Scoped to GAPP: the other
  // programs on this form (NOW/COMP, ICWP, EDWP, private pay) don't have
  // GAPP service lines and never see the clinical questions.
  const inferred =
    program.interest === 'gapp' ? inferService(details) : null;
  // Who is asking to be paid, and a paid request reporting behaviors that
  // need help to manage (GAPP only).
  const relationship =
    program.interest === 'gapp'
      ? screenCaregiverRelationship({ ...details, dob: client.dob })
      : null;
  const behaviorFlag =
    program.interest === 'gapp' ? highBehaviorPaidFlag(details) : null;

  return {
    clientName: `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(),
    clientEmail: client.email ?? '',
    clientPhone: client.phone ?? '',
    county: client.county ?? '',
    program: labelFor(PROGRAM_LABELS, program.interest ?? ''),
    referrerName: referrer.name ?? '',
    service: inferred?.service ?? null,
    details: [
      ...(reviewFlag ? [{ label: '⚠ Review', value: reviewFlag }] : []),
      ...(ageFlag ? [{ label: '⚠ Young child', value: ageFlag }] : []),
      ...(relationship?.flag ? [{ label: '⚠ Relationship', value: relationship.flag }] : []),
      ...(behaviorFlag ? [{ label: '⚠ Behavior', value: behaviorFlag }] : []),
      ...(inferred?.conflict
        ? [{ label: '⚠ Care need unclear', value: inferred.conflict }]
        : []),
      ...(program.interest === 'gapp'
        ? [{ label: 'Relationship to child', value: relationshipLabel(details.relationship) }]
        : []),
      { label: 'Date of birth', value: formatDateUS(client.dob ?? '') },
      { label: 'Secondary phone', value: client.secondaryPhone ?? '' },
      {
        label: 'Address',
        value: [client.address, client.city, client.state, client.zip]
          .filter(Boolean)
          .join(', '),
      },
      { label: 'Medicaid #', value: program.medicaidNumber ?? '' },
      { label: 'Insurance provider', value: program.insuranceProvider ?? '' },
      { label: 'Insurance policy #', value: program.insuranceNumber ?? '' },
      // Labels are read back by ppotSubjectFromReferral (src/lib/ppotShared.ts).
      { label: "Child's physician", value: physician.name ?? '' },
      { label: 'Physician office', value: physician.office ?? '' },
      { label: 'Physician phone', value: physician.phone ?? '' },
      { label: 'Physician fax', value: physician.fax ?? '' },
      { label: 'Referral source', value: labelFor(SOURCE_LABELS, referrer.source ?? '') },
      { label: 'Referrer phone', value: referrer.phone ?? '' },
      { label: 'Referrer email', value: referrer.email ?? '' },
      { label: 'Referrer organization', value: referrer.organization ?? '' },
      { label: 'Urgency', value: labelFor(URGENCY_LABELS, details.urgency ?? '') },
      { label: 'Diagnosis', value: composeDiagnosisText(details.diagnoses, details.diagnosisOther) },
      { label: 'Equipment & daily care', value: equipmentLabels(details.equipment).join(', ') },
      { label: 'Behavior risk', value: behaviorRiskLabel(details.behaviorRisk) },
      { label: 'Current services', value: currentServiceLabels(details.currentServices).join(', ') },
      { label: 'Service needs', value: details.serviceNeeds ?? '' },
      { label: 'Additional notes', value: details.additionalNotes ?? '' },
      {
        label: 'Seeking paid caregiver',
        value:
          details.seekingPaidCaregiver === 'yes'
            ? 'Yes'
            : details.seekingPaidCaregiver === 'no'
            ? 'No'
            : '',
      },
      {
        label: 'Inferred service need',
        value: inferred?.service
          ? `${GAPP_SERVICE_LABELS[inferred.service]} (${inferred.reason})`
          : '',
      },
      ...(details.seekingPaidCaregiver === 'yes'
        ? [
            {
              label: 'Primary care need',
              value: labelFor(
                {
                  personal: 'Hands-on personal care',
                  nursing: 'Skilled medical / nursing care',
                  behavioral: 'Behavioral / autism support',
                  unsure: 'Not sure',
                },
                details.careNeeds ?? ''
              ),
            },
          ]
        : []),
      ...(program.interest === 'gapp' && details.wantsAgencyStaff
        ? [{ label: 'Wants agency staff in the home', value: details.wantsAgencyStaff === 'yes' ? 'Yes' : 'No' }]
        : []),
      ...(relationship?.asksGuardianship
        ? [{
            label: 'Legal guardianship',
            value: details.hasGuardianship === 'yes' ? 'Yes' : details.hasGuardianship === 'no' ? 'No' : '',
          }]
        : []),
      ...(details.seekingPaidCaregiver === 'yes' && details.paidCareBasis
        ? [
            {
              label: 'Hands-on care mainly due to',
              value: paidCareBasisLabel(details.paidCareBasis),
            },
          ]
        : []),
    ],
};
}
/* eslint-enable @typescript-eslint/no-explicit-any */
