'use client';

import { Sparkles } from 'lucide-react';
import type { AgencyMatch } from '@/lib/agencyMatch';

// "Best matches" chip row shown above the agency inputs in the share pickers.
// Purely a convenience layer: clicking a chip fills/adds that agency, but the
// free-text input always remains — matching never blocks choosing anyone.
export default function MatchSuggestions({
  matches,
  onPick,
}: {
  matches: AgencyMatch[];
  onPick: (agency: { name: string; email: string }) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>
        <Sparkles size={12} aria-hidden /> Best matches
      </span>
      {matches.map((m) => (
        <button
          key={m.agency.id}
          type="button"
          onClick={() => onPick({ name: m.agency.name, email: m.agency.email })}
          style={chipStyle}
          title={`${m.agency.name} — ${m.reasons.join(' · ')}`}
        >
          <span style={{ fontWeight: 700 }}>{m.agency.name}</span>
          <span style={reasonStyle}>{m.reasons.join(' · ')}</span>
        </button>
      ))}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
};
const labelStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.4,
  whiteSpace: 'nowrap',
};
const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#f5f3ff', color: '#4c1d95', border: '1px solid #e2dbf7',
  borderRadius: 999, padding: '4px 10px', fontSize: 12.5,
  cursor: 'pointer', fontFamily: 'inherit',
};
const reasonStyle: React.CSSProperties = {
  fontSize: 11, color: '#7c6bad', whiteSpace: 'nowrap',
};
