'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route. Two things used to live here: a MAR-client roster (merged into
 * the unified Clients roster) and the medication-change review queue.
 *
 * The queue was retired in Aug 2026: adding, changing, and discontinuing meds
 * per a physician's order is within an LPN's scope, so a supervisor
 * acknowledgment step added paperwork without adding safety. It was never a
 * gate — changes always applied immediately — so nothing about how a nurse
 * works changes. The change records themselves are untouched: every add /
 * change / discontinue is still written to marChangeRequests with who did it,
 * when, why, and the note it came from.
 *
 * Each client's medication order book is still at /admin/records/[patientId],
 * reached from the client dashboard's "Manage record".
 */
export default function LegacyRecordsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/clients');
  }, [router]);
  return null;
}
