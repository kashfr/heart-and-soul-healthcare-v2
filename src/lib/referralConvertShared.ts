/**
 * Turning a referral into a client record: the pure part. Reads the intake
 * answers (label/value rows) into the fields the Clients page asks for, so
 * "Create Client Record" starts from what the family already told us instead
 * of a blank form. Anything it can't read is left blank for staff to fill in.
 * No Firebase imports (referralConvertShared.test.ts).
 */
import type { ReferralDetail } from './ppotShared';
import { cleanMedicaidId } from './ppotShared';
import { normalizeUSFaxNumber } from './verbalOrderShared';
import { PROGRAMS } from './programs';

/** What the client record and its clinical profile will be created with. */
export interface ConvertPlan {
  name: string;
  /** YYYY-MM-DD, or '' when the intake had none or it didn't parse. */
  dob: string;
  diagnosis: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  /** A program id from the catalog ('gapp', 'now-comp', ...), or ''. */
  program: string;
  clinical: {
    physicianName: string;
    physicianPhone: string;
    physicianFax: string;
    medicaidId: string;
  };
  /** What the intake never said, named for the confirm dialog. */
  missing: string[];
}

function detail(details: ReferralDetail[], labels: string[]): string {
  for (const label of labels) {
    const hit = details.find((d) => d.label === label);
    if (hit && String(hit.value || '').trim()) return String(hit.value).trim();
  }
  return '';
}

/** MM/DD/YYYY or YYYY-MM-DD to YYYY-MM-DD; '' when it isn't a real date. */
export function parseDobToIso(raw: string): string {
  const s = String(raw || '').trim();
  let y = 0;
  let m = 0;
  let d = 0;
  let hit = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (hit) {
    m = Number(hit[1]);
    d = Number(hit[2]);
    y = Number(hit[3]);
  } else {
    hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!hit) return '';
    y = Number(hit[1]);
    m = Number(hit[2]);
    d = Number(hit[3]);
  }
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? '' : iso;
}

/**
 * Our form stores the address as "street, city, state, zip"; the GAPP site's
 * intake stores "street, city, GA zip". Pull the parts back out; when the
 * shape is anything else, keep it all in street so nothing is lost.
 */
export function splitAddress(raw: string): { street: string; city: string; state: string; zip: string } {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  const empty = { street: s, city: '', state: '', zip: '' };
  if (!s) return { street: '', city: '', state: '', zip: '' };
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return empty;
  const last = parts[parts.length - 1];
  const stateZip = /^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?$/.exec(last);
  if (stateZip && parts.length >= 3) {
    return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: stateZip[1].toUpperCase(), zip: stateZip[2] || '' };
  }
  if (parts.length >= 4 && /^[A-Za-z]{2}$/.test(parts[parts.length - 2]) && /^\d{5}(-\d{4})?$/.test(last)) {
    return { street: parts.slice(0, -3).join(', '), city: parts[parts.length - 3], state: parts[parts.length - 2].toUpperCase(), zip: last };
  }
  return empty;
}

/** "GAPP", "NOW/COMP Waiver", "Elderly and Disabled Waiver" to a catalog id. */
export function programIdFromLabel(raw: string): string {
  const s = String(raw || '').toLowerCase();
  if (!s) return '';
  for (const p of PROGRAMS) if (s === p.id || s === p.label.toLowerCase()) return p.id;
  if (/gapp|georgia pediatric/.test(s)) return 'gapp';
  if (/now|comp/.test(s)) return 'now-comp';
  if (/edwp|elderly|disabled waiver|ccsp|source/.test(s)) return 'edwp';
  if (/icwp|independent care/.test(s)) return 'icwp';
  return '';
}

export function planFromReferral(r: { clientName: string; program?: string; details: ReferralDetail[] }): ConvertPlan {
  const dob = parseDobToIso(detail(r.details, ['Date of birth']));
  const address = splitAddress(detail(r.details, ['Address']));
  const diagnosis = detail(r.details, ['Diagnosis', 'Primary care need']);
  const program = programIdFromLabel(r.program || '');
  const clinical = {
    physicianName: detail(r.details, ["Child's physician"]),
    physicianPhone: normalizeUSFaxNumber(detail(r.details, ['Physician phone'])),
    physicianFax: normalizeUSFaxNumber(detail(r.details, ['Physician fax'])),
    medicaidId: cleanMedicaidId(detail(r.details, ["Member's Medicaid ID", 'Medicaid #'])),
  };
  const missing: string[] = [];
  if (!dob) missing.push('date of birth');
  if (!address.street) missing.push('address');
  if (!diagnosis) missing.push('diagnosis');
  if (!program) missing.push('program');
  if (!clinical.physicianName) missing.push('physician');
  if (!clinical.medicaidId) missing.push('Medicaid ID');
  return { name: String(r.clientName || '').trim(), dob, diagnosis, ...address, program, clinical, missing };
}

/** Why a referral can't become a client right now, or null. */
export function convertBlocker(r: { clientName: string; stage: string; patientId?: string | null }): string | null {
  if (r.patientId) return 'This referral already has a client record.';
  if (r.stage === 'closed' || r.stage === 'referred_out') return 'A closed or referred-out referral cannot become a client. Move it back to an open stage first.';
  if (!String(r.clientName || '').trim()) return 'The referral has no client name.';
  return null;
}
