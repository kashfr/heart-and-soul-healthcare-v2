// Nurse-reachable MAR grid. Renders the EXACT same monthly-grid component the
// supervisor view uses (under /admin/records/[id]/mar) — one source of truth,
// zero divergence — but at a route under /admin/mar, which is outside the
// staff-only records layout guard so an assigned nurse can open it. The shared
// component already adjusts its back-link + hides the staff-only PDF export for
// nurses, and Firestore scopes a nurse's MAR reads to her assigned patients.
export { default } from '@/app/(app)/admin/records/[patientId]/mar/page';
