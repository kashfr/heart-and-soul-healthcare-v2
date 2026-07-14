'use client';

import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable, closestCorners,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, Mail, ChevronRight, ChevronDown } from 'lucide-react';
import {
  orderBetween, formatRelative, initials,
  REFERRAL_STAGES, STAGE_ACCENT, STAGE_DESCRIPTION, STAGE_LABEL, SOURCE_LABEL,
  type Referral, type ReferralStage,
} from './types';
import ShareBadge from './ShareBadge';
import FitBadge from './FitBadge';
import ProviderListBadge from './ProviderListBadge';

type Columns = Record<ReferralStage, Referral[]>;

const COLLAPSE_KEY = 'referrals-board-collapsed';

function buildColumns(referrals: Referral[]): Columns {
  const cols = {} as Columns;
  for (const stage of REFERRAL_STAGES) cols[stage] = [];
  for (const r of referrals) (cols[r.stage] ?? cols.new).push(r);
  for (const stage of REFERRAL_STAGES) {
    // Tiebreak on id so cards with (nearly) equal order — possible after many
    // midpoint reorders — keep a stable, deterministic position across refetches.
    cols[stage].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  return cols;
}

interface Props {
  referrals: Referral[];
  onOpen: (referral: Referral) => void;
  onMove: (id: string, stage: ReferralStage, order: number) => void;
}

export default function ReferralBoard({ referrals, onOpen, onMove }: Props) {
  // Columns are derived purely from props. Moves are persisted optimistically by
  // the parent (which updates `referrals` synchronously), so the board re-renders
  // into the new arrangement without holding its own copy of the data.
  const columns = useMemo(() => buildColumns(referrals), [referrals]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ReferralStage | null>(null);

  // Which stage columns are collapsed (header + count only). Closed starts
  // collapsed so finished/archived referrals don't dominate the board; the
  // choice persists. Drag-to-close still works onto a collapsed column.
  const [collapsed, setCollapsed] = useState<Set<ReferralStage>>(() => {
    if (typeof window === 'undefined') return new Set<ReferralStage>(['closed']);
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved) return new Set(JSON.parse(saved) as ReferralStage[]);
    } catch {
      /* ignore */
    }
    return new Set<ReferralStage>(['closed']);
  });

  const toggleCollapsed = (stage: ReferralStage) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (cardId: string): ReferralStage | null => {
    for (const stage of REFERRAL_STAGES) {
      if (columns[stage].some((r) => r.id === cardId)) return stage;
    }
    return null;
  };

  const resolveColumn = (overId: string): ReferralStage | null =>
    (REFERRAL_STAGES as string[]).includes(overId)
      ? (overId as ReferralStage)
      : findColumn(overId);

  const activeCard = activeId ? columns[findColumn(activeId) ?? 'new']?.find((r) => r.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverColumn(over ? resolveColumn(String(over.id)) : null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverColumn(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumn(null);
    if (!over) return;

    const cardId = String(active.id);
    const overId = String(over.id);
    if (cardId === overId) return;

    const sourceCol = findColumn(cardId);
    if (!sourceCol) return;
    const targetCol = resolveColumn(overId);
    if (!targetCol) return;

    const card = columns[sourceCol].find((r) => r.id === cardId);
    if (!card) return;

    const targetSansActive = columns[targetCol].filter((r) => r.id !== cardId);
    let insertIndex: number;
    if (overId === targetCol) {
      insertIndex = targetSansActive.length;
    } else {
      const overIndex = targetSansActive.findIndex((r) => r.id === overId);
      insertIndex = overIndex === -1 ? targetSansActive.length : overIndex;
    }

    const before = targetSansActive[insertIndex - 1]?.order;
    const after = targetSansActive[insertIndex]?.order;
    const newOrder = orderBetween(before, after);

    // No-op if nothing actually changed (same column, same neighbors).
    if (targetCol === sourceCol && card.order === newOrder) return;

    onMove(cardId, targetCol, newOrder);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div style={boardStyle}>
        {REFERRAL_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            cards={columns[stage]}
            isOver={overColumn === stage}
            collapsed={collapsed.has(stage)}
            onToggle={() => toggleCollapsed(stage)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard ? <CardView referral={activeCard} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage, cards, isOver, collapsed, onToggle, onOpen,
}: {
  stage: ReferralStage;
  cards: Referral[];
  isOver: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (r: Referral) => void;
}) {
  const { setNodeRef } = useDroppable({ id: stage });
  return (
    <section style={columnStyle}>
      <button
        type="button"
        onClick={onToggle}
        style={{ ...columnHeaderStyle, borderTopColor: STAGE_ACCENT[stage] }}
        aria-expanded={!collapsed}
        title={collapsed ? `Expand ${STAGE_LABEL[stage]}` : STAGE_DESCRIPTION[stage]}
      >
        <span style={chevronStyle}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
        <span style={{ ...columnDot, background: STAGE_ACCENT[stage] }} aria-hidden />
        <span style={columnTitleStyle}>{STAGE_LABEL[stage]}</span>
        <span style={columnCountStyle}>{cards.length}</span>
      </button>
      <div
        ref={setNodeRef}
        style={{
          ...columnBodyStyle,
          ...(collapsed ? collapsedBodyStyle : null),
          background: isOver ? '#eef5ff' : 'transparent',
          outline: isOver ? '2px dashed #b6cdf0' : '2px dashed transparent',
        }}
      >
        {collapsed ? (
          <div style={collapsedHintStyle}>
            {cards.length === 0
              ? 'Empty — click to expand'
              : `${cards.length} referral${cards.length === 1 ? '' : 's'} — click to expand`}
          </div>
        ) : (
          <>
            <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {cards.map((card) => (
                <SortableCard key={card.id} referral={card} onOpen={onOpen} />
              ))}
            </SortableContext>
            {cards.length === 0 && <div style={emptyColStyle}>No referrals</div>}
          </>
        )}
      </div>
    </section>
  );
}

function SortableCard({
  referral, onOpen,
}: {
  referral: Referral;
  onOpen: (r: Referral) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: referral.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(referral)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(referral);
        }
      }}
      aria-label={`Open referral from ${referral.clientName || 'unknown'}`}
    >
      <CardView referral={referral} />
    </div>
  );
}

function CardView({ referral, dragging }: { referral: Referral; dragging?: boolean }) {
  return (
    <div style={{ ...cardStyle, ...(dragging ? cardDraggingStyle : {}) }}>
      <div style={cardTopStyle}>
        <span style={cardNameStyle}>{referral.clientName || 'Referral'}</span>
        <span style={cardSourceBadge}>{SOURCE_LABEL[referral.source] ?? referral.source}</span>
      </div>
      {referral.program && <div style={cardProgramStyle}>{referral.program}</div>}
      <div style={cardMetaRowStyle}>
        <span style={cardContactStyle}>
          {referral.clientPhone ? (
            <><Phone size={12} /> {referral.clientPhone}</>
          ) : referral.clientEmail ? (
            <><Mail size={12} /> {referral.clientEmail}</>
          ) : (
            referral.county || '—'
          )}
        </span>
      </div>
      <div style={cardFooterStyle}>
        <span style={cardFooterLeftStyle}>
          <span style={cardDateStyle}>{formatRelative(referral.submittedAt)}</span>
          <FitBadge referral={referral} />
          <ShareBadge summary={referral.shareSummary} />
          <ProviderListBadge referral={referral} />
        </span>
        {referral.assigneeName && (
          <span style={avatarStyle} title={`Assigned to ${referral.assigneeName}`}>
            {initials(referral.assigneeName)}
          </span>
        )}
      </div>
    </div>
  );
}

const boardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 14,
  overflowX: 'auto',
  paddingBottom: 12,
  alignItems: 'flex-start',
};
const columnStyle: React.CSSProperties = {
  flex: '0 0 290px',
  width: 290,
  display: 'flex',
  flexDirection: 'column',
  background: '#eef1f5',
  borderRadius: 12,
  maxHeight: 'calc(100vh - 230px)',
};
const columnHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 14px',
  border: 'none',
  borderTop: '3px solid',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  background: '#fff',
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
// Matches the site's collapsible-section chevrons (RevisionHistory, In Progress):
// a plain leading chevron, spaced by the header's gap, muted grey, no margin tricks.
const chevronStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: '#6b7280',
  flexShrink: 0,
};
const collapsedBodyStyle: React.CSSProperties = {
  flex: 'none',
  minHeight: 40,
};
const collapsedHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  textAlign: 'center',
  padding: '10px 6px',
};
const columnDot: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 999,
  flexShrink: 0,
};
const columnTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#2c3e50',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};
const columnCountStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 12,
  fontWeight: 700,
  color: '#5c6b7a',
  background: '#eef1f5',
  borderRadius: 999,
  minWidth: 22,
  height: 20,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 7px',
};
const columnBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
  padding: 9,
  overflowY: 'auto',
  flex: 1,
  borderRadius: 12,
  outlineOffset: -4,
  minHeight: 80,
};
const emptyColStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: '#9ca3af',
  textAlign: 'center',
  padding: '18px 0',
};
const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 12,
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const cardDraggingStyle: React.CSSProperties = {
  boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
  transform: 'rotate(2deg)',
  cursor: 'grabbing',
};
const cardTopStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
};
const cardNameStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: '#2c3e50',
  lineHeight: 1.3,
  wordBreak: 'break-word',
};
const cardSourceBadge: React.CSSProperties = {
  flexShrink: 0,
  background: '#eef5ff',
  color: '#1a3a5c',
  padding: '2px 7px',
  borderRadius: 4,
  fontSize: 10.5,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};
const cardProgramStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: '#5c6b7a',
  lineHeight: 1.35,
};
const cardMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
const cardContactStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 12,
  color: '#64748b',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const cardFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 2,
};
const cardFooterLeftStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  flexWrap: 'wrap',
};
const cardDateStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: '#9ca3af',
};
const avatarStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 999,
  background: '#1a3a5c',
  color: 'white',
  fontSize: 10.5,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
