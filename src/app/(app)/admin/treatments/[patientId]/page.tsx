// Nurse-reachable TAR grid. Renders the EXACT same monthly-grid component the
// supervisor view uses (under /admin/records/[id]/tar) — one source of truth,
// zero divergence — but at a route under /admin/treatments, which is outside
// the staff-only records layout guard so an assigned nurse can open it. The
// shared component adjusts its back-link for nurses, and Firestore scopes a
// nurse's TAR reads to her assigned patients.
export { default } from '@/app/(app)/admin/records/[patientId]/tar/page';
