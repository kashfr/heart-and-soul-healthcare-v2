'use client';

import { Building2 } from 'lucide-react';
import { serviceFromCareNeed } from '@/lib/georgia';
import { summarizePartnerMatches, type PartnerMatchSummary } from '@/lib/agencyMatch';
import { usePartnerAgencies } from './PartnerAgenciesProvider';
import type { Referral } from './types';

// "Can somebody ELSE serve this family?" pill, sitting next to FitBadge's "can
// WE serve them?". Same directory and ranking the share pickers use, so the
// count on the card is exactly what the Best-matches row will offer when you
// open it. Purple = partners available; gray = every saved partner ruled out.
//
// The badge is deliberately shown on good-fit cards too: it's the same question
// the filter asks, and a card you keep can still be declined later. Anything
// that can't be judged honestly renders nothing (see summarizePartnerMatches).

/** Partner-match summary for one referral against the saved directory. */
export function usePartnerMatch(
  referral: Pick<Referral, 'county' | 'details'>
): PartnerMatchSummary | null {
  const { agencies } = usePartnerAgencies();
  return summarizePartnerMatches(
    {
      county: referral.county,
      service: serviceFromCareNeed(
        referral.details.find((d) => d.label === 'Primary care need')?.value
      ),
    },
    agencies
  );
}

const PALETTE: Record<PartnerMatchSummary['level'], { bg: string; fg: string }> = {
  match: { bg: '#f5f3ff', fg: '#5b21b6' },
  none: { bg: '#f1f5f9', fg: '#64748b' },
};

export default function PartnerMatchBadge({
  referral,
}: {
  referral: Pick<Referral, 'county' | 'details'>;
}) {
  const summary = usePartnerMatch(referral);
  if (!summary) return null;
  const { bg, fg } = PALETTE[summary.level];
  return (
    <span style={{ ...badgeStyle, background: bg, color: fg }} title={summary.detail}>
      <Building2 size={11} aria-hidden />
      {summary.label}
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
};
