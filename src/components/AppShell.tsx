'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileClock,
  UserCog,
  FileText,
  Pill,
  Wrench,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useEffectiveUser } from './AuthProvider';
import { useViewAs } from './ImpersonationProvider';
import { useSettings } from './SettingsProvider';
import UserMenu from './UserMenu';
import ClarificationGate from './ClarificationGate';
import type { Role } from '@/lib/auth';
import { subscribePendingDupCount } from '@/lib/drafts';
import { subscribeMyOpenClarifications } from '@/lib/clarifications';
import { subscribePendingReviewCount } from '@/lib/mar';

const COLLAPSE_KEY = 'app-shell-collapsed';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  allow?: Role[];
  disabled?: boolean;
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { href: '/admin/patients', label: 'Patients', icon: <Users size={18} />, allow: ['admin', 'supervisor'] },
  { href: '/admin/records', label: 'Records', icon: <Pill size={18} />, allow: ['admin', 'supervisor'] },
  { href: '/admin/submissions', label: 'Submissions', icon: <ClipboardList size={18} /> },
  { href: '/admin/in-progress', label: 'In Progress', icon: <FileClock size={18} />, allow: ['admin', 'supervisor'] },
  { href: '/admin/users', label: 'Staff & Roles', icon: <UserCog size={18} />, allow: ['admin', 'supervisor'] },
  { href: '/admin/maintenance/link-notes', label: 'Maintenance', icon: <Wrench size={18} />, allow: ['admin'] },
  { href: '/admin/settings', label: 'Settings', icon: <Settings size={18} />, allow: ['admin'] },
  { href: '/admin/referrals', label: 'Referrals', icon: <FileText size={18} />, allow: ['admin'], disabled: true },
];

const viewAsBannerStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  // Must sit ABOVE the blocking clarification gate (z-index 9999) so an admin
  // previewing a nurse who has an open gate can always reach "Exit view-as".
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  background: '#3f6f8f',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  padding: '7px 14px',
};
const viewAsExitBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.18)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.4)',
  borderRadius: 6,
  padding: '3px 12px',
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export function AppShell({ children }: { children: ReactNode }) {
  // Effective identity: the impersonated nurse when an admin is "viewing as".
  // Nav role-gating + the nurse clarification badge use this so the admin's
  // view-as mirrors the nurse. The view-as banner + exit use the impersonation
  // context directly.
  const { uid: effectiveUid, role, isViewingAs } = useEffectiveUser();
  const { viewingAs, stopViewAs } = useViewAs();
  const { settings: appSettings } = useSettings();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop sidebar collapse, persisted to localStorage so it survives
  // refreshes. Read lazily on first render; SSR has no window so it defaults
  // to expanded, and the <aside> uses suppressHydrationWarning so the
  // client's persisted value can differ from the server markup without a
  // hydration warning.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore persistence failure */
      }
      return next;
    });
  };

  // Live count of pending duplicate-note approval requests, shown as a badge
  // on the In Progress nav item. Only admins + supervisors can act on these.
  const [pendingDup, setPendingDup] = useState(0);
  useEffect(() => {
    // Only admins + supervisors can act on these; others never subscribe so the
    // count stays at its initial 0.
    if (role !== 'admin' && role !== 'supervisor') return;
    const unsub = subscribePendingDupCount(setPendingDup);
    return () => unsub();
  }, [role]);

  // Live count of applied medication changes awaiting RN review, shown on the
  // Records nav item. Admin + supervisor only (the tier that reviews them).
  const [pendingMarReq, setPendingMarReq] = useState(0);
  useEffect(() => {
    if (role !== 'admin' && role !== 'supervisor') return;
    const unsub = subscribePendingReviewCount(setPendingMarReq);
    return () => unsub();
  }, [role]);

  // Live count of the signed-in nurse's OPEN clarification requests, shown as a
  // badge on her Submissions nav item (and enforced by the blocking gate).
  const [openClarifications, setOpenClarifications] = useState(0);
  useEffect(() => {
    if (role !== 'nurse' || !effectiveUid) {
      setOpenClarifications(0);
      return;
    }
    const unsub = subscribeMyOpenClarifications(effectiveUid, (items) =>
      setOpenClarifications(items.filter((i) => i.awaitsNurse).length),
    );
    return () => unsub();
  }, [role, effectiveUid]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent background scroll while the mobile drawer is open.
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  const visibleNav = NAV.filter((item) => !item.allow || (role && item.allow.includes(role)));

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const currentTitle =
    [...visibleNav].reverse().find((item) => isActive(item.href))?.label ?? 'Admin';

  return (
    <div className="app-shell">
      {/* View-as banner: pinned when an admin is impersonating a nurse (read-only). */}
      {isViewingAs && viewingAs && (
        <div style={viewAsBannerStyle} className="no-print">
          <span>
            👁 Viewing as <strong>{viewingAs.displayName}</strong>
            {viewingAs.credential ? ` · ${viewingAs.credential}` : ''} (read-only)
          </span>
          <button
            type="button"
            onClick={() => { stopViewAs(); window.location.href = '/admin/users'; }}
            style={viewAsExitBtnStyle}
          >
            Exit view-as
          </button>
        </div>
      )}
      {/* Blocking gate: a nurse with open clarification requests must respond
          to each before she can use the portal. Renders nothing for non-nurses
          or when there's nothing awaiting a response. */}
      <ClarificationGate />
      <div className="app-shell-body">
      <aside
        suppressHydrationWarning
        className={`app-shell-sidebar${mobileOpen ? ' app-shell-sidebar--open' : ''}${
          collapsed ? ' app-shell-sidebar--collapsed' : ''
        }`}
      >
        <div className="app-shell-sidebar-header">
          <Link href="/admin" className="app-shell-brand" onClick={() => setMobileOpen(false)}>
            <div className="app-shell-brand-text">
              <div style={{ fontWeight: 700, color: '#f5f7fa', fontSize: 14, lineHeight: 1.2 }}>
                {appSettings.branding.orgName}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>
                Staff portal
              </div>
            </div>
          </Link>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="app-shell-icon-btn app-shell-collapse-btn"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="app-shell-icon-btn app-shell-mobile-close"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="app-shell-nav">
          {visibleNav.map((item) => {
            const active = isActive(item.href);
            const classes = [
              'app-shell-nav-item',
              active ? 'app-shell-nav-item--active' : '',
              item.disabled ? 'app-shell-nav-item--disabled' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const badgeCount =
              item.href === '/admin/in-progress'
                ? pendingDup
                : item.href === '/admin/records'
                  ? pendingMarReq
                  : item.href === '/admin/submissions'
                    ? openClarifications
                    : 0;
            const badgeTitle =
              item.href === '/admin/in-progress'
                ? `${badgeCount} duplicate-note request${badgeCount === 1 ? '' : 's'} awaiting approval`
                : item.href === '/admin/records'
                  ? `${badgeCount} medication change${badgeCount === 1 ? '' : 's'} awaiting review`
                  : `${badgeCount} note${badgeCount === 1 ? '' : 's'} needing your clarification`;
            const inner = (
              <>
                <span className="app-shell-nav-icon">{item.icon}</span>
                <span className="app-shell-nav-label">{item.label}</span>
                {item.disabled && <span className="app-shell-coming-soon">Soon</span>}
                {badgeCount > 0 && (
                  <span className="app-shell-nav-badge" title={badgeTitle}>
                    {badgeCount}
                  </span>
                )}
              </>
            );
            if (item.disabled) {
              return (
                <div key={item.href} className={classes} title={collapsed ? item.label : undefined}>
                  {inner}
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={classes}
                title={collapsed ? item.label : undefined}
              >
                {inner}
              </Link>
            );
          })}
        </nav>

        <div className="app-shell-sidebar-footer">
          <Link
            href="/"
            className="app-shell-footer-link"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'Back to public site' : undefined}
          >
            <span aria-hidden="true">←</span>
            <span className="app-shell-nav-label"> Back to public site</span>
          </Link>
        </div>
      </aside>

      <div
        className={`app-shell-backdrop${mobileOpen ? ' app-shell-backdrop--visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <div className="app-shell-main">
        <header className="app-shell-topbar">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="app-shell-icon-btn app-shell-mobile-open"
          >
            <Menu size={20} />
          </button>
          <div className="app-shell-title">{currentTitle}</div>
          <div style={{ flex: 1 }} />
          <UserMenu />
        </header>

        <main className="app-shell-content">{children}</main>
      </div>
      </div>

      <style>{`
        .app-shell {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: #f5f7fa;
        }
        .app-shell-body {
          display: flex;
          flex: 1;
          min-height: 0;
        }
        .app-shell-sidebar {
          width: 240px;
          flex-shrink: 0;
          background: #1f2937;
          color: #e5e7eb;
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          align-self: flex-start;
          height: 100vh;
          z-index: 70;
          transition: width 0.18s ease;
        }
        .app-shell-sidebar-header {
          padding: 16px 18px;
          border-bottom: 1px solid #334155;
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
        }
        .app-shell-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: inherit;
          flex: 1;
        }
        .app-shell-nav {
          flex: 1;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
        }
        .app-shell-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 6px;
          font-size: 14px;
          color: #cbd5e1;
          text-decoration: none;
          font-weight: 500;
        }
        .app-shell-nav-item:hover:not(.app-shell-nav-item--disabled) {
          background: rgba(255,255,255,0.04);
          color: white;
        }
        .app-shell-nav-item--active {
          background: #374151;
          color: white;
          font-weight: 600;
        }
        .app-shell-nav-item--disabled {
          color: #64748b;
          cursor: not-allowed;
        }
        .app-shell-nav-icon {
          display: inline-flex;
          align-items: center;
        }
        .app-shell-coming-soon {
          margin-left: auto;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 999px;
          background: #334155;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 700;
        }
        .app-shell-nav-badge {
          margin-left: auto;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 999px;
          background: #f59e0b;
          color: #1f2937;
          font-size: 11px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        /* In the collapsed rail the label is hidden; pin the badge to the
           icon's corner so the count still shows. */
        .app-shell-sidebar--collapsed .app-shell-nav-badge {
          position: absolute;
          top: 4px;
          right: 10px;
          margin-left: 0;
        }
        .app-shell-sidebar--collapsed .app-shell-nav-item {
          position: relative;
        }
        .app-shell-sidebar-footer {
          padding: 12px 16px;
          border-top: 1px solid #334155;
        }
        .app-shell-footer-link {
          color: #94a3b8;
          font-size: 12px;
          text-decoration: none;
        }
        .app-shell-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .app-shell-topbar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 20px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
          position: sticky;
          top: 0;
          z-index: 40;
        }
        .app-shell-title {
          font-weight: 700;
          color: #2c3e50;
          font-size: 15px;
        }
        .app-shell-content {
          flex: 1;
          padding: 0;
        }
        .app-shell-icon-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .app-shell-icon-btn.app-shell-mobile-open {
          color: #2c3e50;
        }
        .app-shell-backdrop {
          display: none;
        }
        /* Collapse toggle: only meaningful on desktop, hidden on mobile
           (mobile uses the hamburger/drawer instead). */
        .app-shell-collapse-btn {
          display: none;
        }

        /* Desktop: sidebar sticks, hamburger + close buttons hidden */
        @media (min-width: 900px) {
          .app-shell-mobile-open,
          .app-shell-mobile-close {
            display: none;
          }
          .app-shell-collapse-btn {
            display: inline-flex;
          }

          /* Collapsed rail: icon-only, labels + brand text hidden.
             Compound selector (two classes) outranks the base
             .app-shell-sidebar width; min/max pin it so the flex row
             can't stretch it back. */
          .app-shell-sidebar.app-shell-sidebar--collapsed {
            width: 68px;
            min-width: 68px;
            max-width: 68px;
          }
          .app-shell-sidebar--collapsed .app-shell-brand,
          .app-shell-sidebar--collapsed .app-shell-nav-label,
          .app-shell-sidebar--collapsed .app-shell-coming-soon {
            display: none;
          }
          .app-shell-sidebar--collapsed .app-shell-sidebar-header {
            justify-content: center;
            padding: 16px 0;
          }
          .app-shell-sidebar--collapsed .app-shell-nav-item {
            justify-content: center;
            gap: 0;
            padding: 9px 0;
          }
          .app-shell-sidebar--collapsed .app-shell-sidebar-footer {
            display: flex;
            justify-content: center;
            padding: 12px 0;
          }
        }

        /* Mobile: sidebar becomes an overlay drawer sliding in from the left */
        @media (max-width: 899px) {
          .app-shell-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            height: 100vh;
            transform: translateX(-100%);
            transition: transform 0.22s ease;
            box-shadow: 4px 0 24px rgba(0,0,0,0.3);
          }
          .app-shell-sidebar--open {
            transform: translateX(0);
          }
          .app-shell-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0);
            pointer-events: none;
            transition: background 0.22s ease;
            z-index: 60;
          }
          .app-shell-backdrop--visible {
            background: rgba(0,0,0,0.45);
            pointer-events: auto;
          }
        }
      `}</style>
    </div>
  );
}

export default AppShell;
