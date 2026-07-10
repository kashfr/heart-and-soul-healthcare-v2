'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
  type PortalNotification,
} from '@/lib/notifications';

function ago(n: PortalNotification): string {
  const t = n.createdAt?.toDate?.();
  if (!t) return '';
  const mins = Math.floor((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The topbar bell: live unread badge + dropdown inbox. Notifications are
 * server-written (visit assignment/cancel/restore + the day-of reminder
 * cron); clicking one marks it read and follows its deep link (e.g. the
 * client dashboard's Schedule tab). Everything here is behind the login, so
 * the text may name clients — the off-portal SMS/email deliberately don't.
 */
export default function NotificationsBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeNotifications(user.uid, setItems);
  }, [user?.uid]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!user) return null;
  const unread = items.filter((n) => !n.readAt).length;

  const openItem = (n: PortalNotification) => {
    setOpen(false);
    if (n.id && !n.readAt) void markNotificationRead(n.id);
    if (n.href) router.push(n.href);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        style={bellBtnStyle}
      >
        <Bell size={18} />
        {unread > 0 && <span style={badgeStyle}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div style={panelStyle} role="menu" aria-label="Notifications">
          <div style={panelHeadStyle}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1f2937' }}>Notifications</span>
            {unread > 0 && (
              <button type="button" style={markAllStyle} onClick={() => void markAllNotificationsRead(items)}>
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '18px 14px', fontSize: 13, color: '#7f8c8d', textAlign: 'center' }}>
              Nothing yet — visit assignments and reminders will show up here.
            </div>
          ) : (
            <ul style={listStyle}>
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => openItem(n)} style={{ ...rowStyle, ...(n.readAt ? null : rowUnreadStyle) }}>
                    {!n.readAt && <span style={dotStyle} aria-hidden="true" />}
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>{n.text}</span>
                    <span style={whenStyle}>{ago(n)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const NAVY = '#1a3a5c';
const bellBtnStyle: CSSProperties = { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: 'transparent', border: 'none', borderRadius: 9, color: '#3d4f61', cursor: 'pointer' };
const badgeStyle: CSSProperties = { position: 'absolute', top: 3, right: 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: '#b3261e', color: 'white', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };
const panelStyle: CSSProperties = { position: 'absolute', top: 42, right: 0, width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 420, overflowY: 'auto', background: 'white', border: '1px solid #dde3e9', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.18)', zIndex: 3000 };
const panelHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#eef1f4', position: 'sticky', top: 0, background: 'white' };
const markAllStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: NAVY, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 6 };
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', background: 'transparent', border: 'none', padding: '10px 9px', borderRadius: 8, fontSize: 13, color: '#2c3e50', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4 };
const rowUnreadStyle: CSSProperties = { background: '#f2f6fa', fontWeight: 600 };
const dotStyle: CSSProperties = { width: 7, height: 7, borderRadius: 999, background: NAVY, marginTop: 5, flexShrink: 0 };
const whenStyle: CSSProperties = { fontSize: 11, color: '#8a949e', flexShrink: 0, marginTop: 1 };
