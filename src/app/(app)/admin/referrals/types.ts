// Shared client-side types, labels, and helpers for the admin Referrals tab.
// The server source of truth lives in src/lib/referrals.ts; these mirror it for
// the client (which can't import the 'server-only' lib). The server validates
// every write, so this copy is purely for rendering.

export type ReferralSource = 'gapp-website' | 'hs-website';
export type ReferralStatus = 'new' | 'contacted' | 'archived';
export type ReferralStage =
  | 'new'
  | 'contacted'
  | 'assessment'
  | 'authorization'
  | 'active'
  | 'closed';
export type ReferralActivityType =
  | 'created'
  | 'stage_change'
  | 'assignment'
  | 'note'
  | 'contact'
  | 'share';

export type ShareStatus = 'active' | 'viewed' | 'expired' | 'revoked';

export interface ReferralShare {
  id: string;
  referralId: string;
  partnerAgency: string;
  partnerEmail: string;
  createdByName: string;
  createdAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  status: ShareStatus;
  /** Raw token for re-copying the link; null for shares created before this feature. */
  token: string | null;
}

export interface ReferralDetail {
  label: string;
  value: string;
}

export interface Referral {
  id: string;
  source: ReferralSource;
  stage: ReferralStage;
  status: ReferralStatus;
  order: number;
  assigneeUid: string | null;
  assigneeName: string | null;
  statusUpdatedBy: string | null;
  statusUpdatedByName: string | null;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  county: string;
  program: string;
  referrerName?: string;
  details: ReferralDetail[];
  submittedAt: string | null;
  updatedAt: string | null;
}

export interface ReferralActivity {
  id: string;
  type: ReferralActivityType;
  text: string;
  byUid: string | null;
  byName: string;
  byRole: string | null;
  at: string | null;
}

export interface StaffOption {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
}

export const REFERRAL_STAGES: ReferralStage[] = [
  'new',
  'contacted',
  'assessment',
  'authorization',
  'active',
  'closed',
];

export const STAGE_LABEL: Record<ReferralStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  assessment: 'Assessment',
  authorization: 'Authorization',
  active: 'Active',
  closed: 'Closed',
};

export const STAGE_DESCRIPTION: Record<ReferralStage, string> = {
  new: 'Just arrived, not yet worked',
  contacted: 'Outreach made to the family',
  assessment: 'Eligibility / intake assessment',
  authorization: 'Authorization & paperwork pending',
  active: 'Enrolled and receiving services',
  closed: 'Closed out or not a fit',
};

export const STAGE_ACCENT: Record<ReferralStage, string> = {
  new: '#2563eb',
  contacted: '#7c3aed',
  assessment: '#d97706',
  authorization: '#0d9488',
  active: '#16a34a',
  closed: '#64748b',
};

export const SOURCE_LABEL: Record<ReferralSource, string> = {
  'gapp-website': 'GAPP site',
  'hs-website': 'Heart & Soul site',
};

export function statusFromStage(stage: ReferralStage): ReferralStatus {
  if (stage === 'closed') return 'archived';
  if (stage === 'new') return 'new';
  return 'contacted';
}

export function stageFromStatus(status: string | undefined): ReferralStage {
  if (status === 'archived') return 'closed';
  if (status === 'contacted') return 'contacted';
  return 'new';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Compact "2h ago" / "3d ago" style relative time for the activity feed. */
export function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

/** Up-to-two-letter initials for an assignee avatar. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Build the ordered field rows shown in both the detail view and the print sheet.
export function fieldRows(r: Referral): ReferralDetail[] {
  return [
    { label: 'Program', value: r.program },
    { label: 'County', value: r.county },
    ...(r.referrerName ? [{ label: 'Referred by', value: r.referrerName }] : []),
    ...r.details,
  ];
}

function csvEscape(value: string): string {
  const s = (value ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(list: Referral[]) {
  const headers = [
    'Name', 'Phone', 'Email', 'County', 'Program', 'Source', 'Stage',
    'Assigned to', 'Received', 'Referred by', 'Details',
  ];
  const rows = list.map((r) =>
    [
      r.clientName,
      r.clientPhone,
      r.clientEmail,
      r.county,
      r.program,
      SOURCE_LABEL[r.source] ?? r.source,
      STAGE_LABEL[r.stage],
      r.assigneeName ?? '',
      r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '',
      r.referrerName ?? '',
      r.details.map((d) => `${d.label}: ${d.value}`).join(' | '),
    ]
      .map(csvEscape)
      .join(',')
  );
  // Prepend a BOM so Excel reads UTF-8 correctly.
  const csv = '﻿' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `referrals-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ORDER_STEP = 1000;

/**
 * Pick a sort key that places a card between two neighbors in an ascending
 * column. `before` is the order of the card that will sit just above the drop
 * point; `after` the card just below. Either may be undefined at an edge.
 */
export function orderBetween(
  before: number | undefined,
  after: number | undefined
): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return (after as number) - ORDER_STEP;
  if (after === undefined) return before + ORDER_STEP;
  return (before + after) / 2;
}
