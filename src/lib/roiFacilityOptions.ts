/**
 * The places a client's release of information usually goes, built from what
 * the client dashboard already knows: every doctor on the Physicians card,
 * the day program, and the support coordination agency. Picking one in the
 * ROI form fills the facility name, address, phone, and fax so nobody retypes
 * (or mistypes) a number the portal already has.
 *
 * Pure module (no Firestore) so it is unit-testable.
 */
import type { PhysicianList } from './physiciansShared';
import type { DayProgram } from './dayProgramShared';
import type { SupportCoordinator } from './supportCoordinatorShared';

export interface RoiFacilityOption {
  key: string;
  group: 'Physicians' | 'Day program' | 'Support coordination';
  label: string; // what the dropdown shows
  name: string; // what the "Facility or agency" line gets
  address: string;
  phone: string;
  fax: string;
}

const t = (v?: string) => (v || '').trim();

export function roiFacilityOptions(
  physicians: PhysicianList | null,
  dayProgram: DayProgram | null,
  coordinator: SupportCoordinator | null,
): RoiFacilityOption[] {
  const out: RoiFacilityOption[] = [];
  for (const p of physicians?.list || []) {
    const name = t(p.name);
    if (!name) continue;
    const practice = t(p.practice);
    // "Practice (Dr. Name)" names the records holder and the doctor; skip the
    // parentheses when the entry is already the practice itself.
    const facility = practice && practice !== name ? `${practice} (${name})` : name;
    out.push({
      key: `ph-${p.id}`,
      group: 'Physicians',
      label: `${t(p.specialty) || 'Physician'}: ${facility}${t(p.fax) ? '' : ' (no fax on file)'}`,
      name: facility,
      address: t(p.address),
      phone: t(p.phone),
      fax: t(p.fax),
    });
  }
  if (dayProgram?.attends === 'yes' && t(dayProgram.programName)) {
    const program = t(dayProgram.programName);
    const operator = t(dayProgram.operator);
    const facility = operator && operator !== program ? `${operator} (${program})` : program;
    out.push({
      key: 'day-program',
      group: 'Day program',
      label: `Day program: ${facility}${t(dayProgram.fax) ? '' : ' (no fax on file)'}`,
      name: facility,
      address: t(dayProgram.address),
      phone: t(dayProgram.phone) || t(dayProgram.cell),
      fax: t(dayProgram.fax),
    });
  }
  if (t(coordinator?.agency)) {
    const agency = t(coordinator!.agency);
    const who = t(coordinator!.name);
    out.push({
      key: 'support-coordinator',
      group: 'Support coordination',
      label: `Support coordination: ${agency}${who ? ` (${who})` : ''}${t(coordinator!.fax) ? '' : ' (no fax on file)'}`,
      name: who ? `${agency} (${who})` : agency,
      address: t(coordinator!.address),
      phone: t(coordinator!.phone) || t(coordinator!.cell),
      fax: t(coordinator!.fax),
    });
  }
  return out;
}
