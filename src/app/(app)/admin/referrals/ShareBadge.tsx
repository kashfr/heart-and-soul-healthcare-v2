'use client';

import { Share2 } from 'lucide-react';
import { formatDate, type ReferralShareSummary } from './types';

// Small "Shared" pill, derived purely from a referral's share summary. Color
// encodes engagement: blue = link sent (not opened), green = a partner opened
// it, grey = was shared but no link is live anymore (expired/revoked). The
// badge is automatic — it appears the instant a share link is created, wherever
// the card sits in the funnel — while moving a card to "Referred Out" stays a
// manual, deliberate action.

const PALETTE: Record<ReferralShareSummary['status'], { bg: string; fg: string }> = {
  active: { bg: '#eef5ff', fg: '#1d4ed8' },
  viewed: { bg: '#e7f6ec', fg: '#1e7a3d' },
  inactive: { bg: '#f1f5f9', fg: '#64748b' },
};

function describe(summary: ReferralShareSummary): { text: string; title: string } {
  const since = summary.lastSharedAt ? ` (last on ${formatDate(summary.lastSharedAt)})` : '';
  if (summary.status === 'inactive') {
    return {
      text: 'Share ended',
      title: `Previously shared with ${summary.total} agenc${summary.total === 1 ? 'y' : 'ies'}; no link is currently active (expired or revoked)${since}.`,
    };
  }
  const n = summary.live;
  const label = n > 1 ? `Shared · ${n}` : 'Shared';
  const who = `${n} agenc${n === 1 ? 'y' : 'ies'}`;
  const title =
    summary.status === 'viewed'
      ? `Shared with ${who}; at least one partner has opened the link${since}.`
      : `Shared with ${who}; link not opened yet${since}.`;
  return { text: label, title };
}

export default function ShareBadge({ summary }: { summary?: ReferralShareSummary | null }) {
  if (!summary || summary.total === 0) return null;
  const { bg, fg } = PALETTE[summary.status];
  const { text, title } = describe(summary);
  return (
    <span style={{ ...badgeStyle, background: bg, color: fg }} title={title}>
      <Share2 size={11} aria-hidden />
      {text}
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
