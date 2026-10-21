'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Legacy route. The per-client care-task editor moved onto the client
 * dashboard's staff-only "Care plan" tab (nav consolidation, Aug 2026);
 * old bookmarks land there.
 */
export default function LegacyCarePlanEditorRedirect() {
  const params = useParams<{ patientId: string }>();
  const patientId = params?.patientId ?? '';
  const router = useRouter();
  useEffect(() => {
    router.replace(patientId ? `/admin/clients/${patientId}?tab=careplan` : '/admin/clients');
  }, [router, patientId]);
  return null;
}
