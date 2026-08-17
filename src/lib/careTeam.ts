// Care-team display helpers for the admin Patients page (chip list in the
// client edit modal). Pure functions so the resolution rules are unit-testable
// apart from the page component.

// Shape returned by GET /api/admin/users — only the fields the care
// team picker actually consumes.
export interface CareTeamStaff {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: string;
  credential: string | null;
  active: boolean;
  /** Declared test/QA login, not a real workforce member. A test account on a
      real client's care team can read that chart's PHI with no business need,
      so the picker badges it and confirms before adding. */
  isTestAccount?: boolean;
}

/**
 * Resolve a patient's assignedNurseIds into chip entries for the edit modal.
 *
 * Every assigned uid must produce a chip — including staff deactivated after
 * being assigned, and uids whose profile doc no longer exists. Resolving
 * through the active-only picker list (the old behavior) hid those chips
 * entirely: the stale uid sat in the patient doc with no UI to see or remove
 * it, and the hidden assignment silently regranted chart access if the
 * account was later reactivated. Inactive members render badged so an admin
 * can remove them; only the "Add nurse" picker stays restricted to active
 * staff.
 *
 * Returns [] while the staff list hasn't loaded yet, so assigned uids don't
 * flash as "Removed account" stubs during the fetch.
 */
export function resolveCareTeamMembers(
  assignedIds: string[],
  staffList: CareTeamStaff[],
): CareTeamStaff[] {
  if (staffList.length === 0) return [];
  return assignedIds.map(
    (uid) =>
      staffList.find((s) => s.uid === uid) ?? {
        // Profile doc is gone entirely (account deleted). Synthesize an
        // inactive stub so the chip still renders and the uid stays removable.
        uid,
        displayName: 'Removed account',
        email: null,
        role: '',
        credential: null,
        active: false,
      },
  );
}
