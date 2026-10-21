'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

/**
 * Shown on the service plan pages when a supervisory visit sent the
 * supervisor here (?visit=<noteId>): the visit is already filed, and this is
 * the second step.
 */
export default function FromVisitBanner({ what }: { what: string }) {
  const visitId = useSearchParams().get('visit') || '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(visitId)) return null;
  return (
    <div
      role="status"
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#e8f4e8', color: '#1e5c1e', border: '1px solid #cfe6cf', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.45, marginBottom: 14 }}
    >
      <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>
        <strong>Supervisory visit filed.</strong> Next: {what}.{' '}
        <Link href={`/admin/submissions/${visitId}`} style={{ color: '#1e5c1e', fontWeight: 700 }}>View the visit</Link>
      </span>
    </div>
  );
}
