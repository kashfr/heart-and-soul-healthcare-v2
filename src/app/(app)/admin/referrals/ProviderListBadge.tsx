'use client';

import { FileText } from 'lucide-react';
import { formatDate, type Referral } from './types';

// "Provider list sent" pill: the family was handed the official GAPP provider
// list (Appendix P) because no partner agency matched. Distinct from the
// partner-share badge so the two kinds of handoff are tellable at a glance.
export default function ProviderListBadge({
  referral,
}: {
  referral: Pick<Referral, 'providerListSentAt' | 'providerListSentTo'>;
}) {
  if (!referral.providerListSentAt) return null;
  const title = referral.providerListSentTo
    ? `GAPP provider list emailed to ${referral.providerListSentTo} on ${formatDate(referral.providerListSentAt)}`
    : `GAPP provider list given to the family (no email on file) on ${formatDate(referral.providerListSentAt)}`;
  return (
    <span style={badgeStyle} title={title}>
      <FileText size={11} aria-hidden />
      List sent
    </span>
  );
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  lineHeight: 1.4,
  background: '#f5f3ff',
  color: '#6d28d9',
};
