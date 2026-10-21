'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route. The Care Plans picker merged into the unified Clients roster
 * (nav consolidation, Aug 2026); the per-client editor now lives on the
 * client dashboard's "Care plan" tab.
 */
export default function LegacyCarePlanRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/clients');
  }, [router]);
  return null;
}
