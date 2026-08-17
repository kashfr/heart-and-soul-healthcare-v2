'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route. The Patient Roster merged into the unified Clients roster
 * (nav consolidation, Aug 2026); this stub keeps old bookmarks and the
 * ?edit=<patientId> deep link working by forwarding the full query string.
 */
export default function LegacyPatientsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/admin/clients${window.location.search}`);
  }, [router]);
  return null;
}
