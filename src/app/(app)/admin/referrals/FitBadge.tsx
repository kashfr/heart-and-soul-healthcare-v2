'use client';

import { useSettings } from '@/components/SettingsProvider';
import { serviceFromCareNeed } from '@/lib/georgia';
import { assessReferralFit, type ReferralFit } from '@/lib/referralFit';
import type { Referral } from './types';

// Derived "can WE serve this client?" pill, judged against the org's intake
// profile (Settings → Referral intake). Fully automatic — appears on any card
// with enough data to judge, wherever it sits. Green = work it; amber = look
// closer; gray = candidate for referring out.

/** Fit for one referral against the current settings profile (null = no badge). */
export function useReferralFit(referral: Pick<Referral, 'county' | 'details'>): ReferralFit | null {
  const { settings } = useSettings();
  return assessReferralFit(
    {
      county: referral.county,
      service: serviceFromCareNeed(
        referral.details.find((d) => d.label === 'Primary care need')?.value
      ),
    },
    settings.intake
  );
}

const PALETTE: Record<ReferralFit['level'], { bg: string; fg: string; dot: string }> = {
  good: { bg: '#e7f6ec', fg: '#1e7a3d', dot: '#16a34a' },
  partial: { bg: '#fef6e7', fg: '#9a6400', dot: '#d97706' },
  none: { bg: '#f1f5f9', fg: '#64748b', dot: '#94a3b8' },
};

export default function FitBadge({ referral }: { referral: Pick<Referral, 'county' | 'details'> }) {
  const fit = useReferralFit(referral);
  if (!fit) return null;
  const { bg, fg, dot } = PALETTE[fit.level];
  return (
    <span style={{ ...badgeStyle, background: bg, color: fg }} title={fit.detail}>
      <span style={{ ...dotStyle, background: dot }} aria-hidden />
      {fit.label}
    </span>
  );
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  lineHeight: 1.4,
};
const dotStyle: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 999,
  flexShrink: 0,
};
