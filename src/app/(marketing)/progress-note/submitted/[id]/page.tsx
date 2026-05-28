'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';

/**
 * Post-submit confirmation screen. The form redirects here after a
 * successful submission. Living on a separate route — with no Submit
 * button anywhere on it — is the safeguard against accidental duplicate
 * submissions: once a nurse lands here, the only ways forward are
 * "Start another note" (a fresh, blank form) or viewing her submissions.
 *
 * Client name + date of service arrive via query params (c, d) so we don't
 * have to read the just-written doc back (a Firestore read can lag on a
 * flaky connection, which is exactly the situation we're hardening against).
 */
export default function SubmittedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientName = searchParams.get('c') || '';
  const dateOfService = searchParams.get('d') || '';

  return (
    <div
      style={{
        maxWidth: 560,
        margin: '60px auto',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
        padding: '40px 32px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: '#e8f5e9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}
      >
        <Check size={40} color="#2e7d32" strokeWidth={3} />
      </div>

      <h1 style={{ color: '#1a3a5c', fontSize: 24, margin: '0 0 8px' }}>
        Progress note submitted
      </h1>
      <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 24px' }}>
        {clientName ? <><strong>{clientName}</strong>&apos;s note</> : 'The note'}
        {dateOfService ? <> for <strong>{dateOfService}</strong></> : null} has been saved
        successfully.
      </p>

      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e5eaf0',
          borderRadius: 8,
          padding: '12px 16px',
          margin: '0 0 28px',
          fontSize: 13,
          color: '#5c6b7a',
        }}
      >
        Submission ID
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 13,
            color: '#1a3a5c',
            marginTop: 4,
            wordBreak: 'break-all',
          }}
        >
          {id}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => router.push('/progress-note')}
          style={{
            background: '#1a3a5c',
            color: '#fff',
            padding: '12px 24px',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Start another note
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/submissions')}
          style={{
            background: '#fff',
            color: '#1a3a5c',
            padding: '12px 24px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          View submissions
        </button>
      </div>
    </div>
  );
}
