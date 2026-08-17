'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route. The standalone Treatments (TAR) picker merged into the
 * unified Clients roster (nav consolidation, Aug 2026) — every roster row now
 * carries a TAR quick-open pill. The per-patient grid at
 * /admin/treatments/[patientId] stays: it is the nurse-reachable route to the
 * monthly TAR, outside the staff-only records layout guard.
 */
export default function LegacyTreatmentsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/clients');
  }, [router]);
  return null;
}
