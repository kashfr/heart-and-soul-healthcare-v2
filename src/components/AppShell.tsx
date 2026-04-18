'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  UserCog,
  FileText,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import UserMenu from './UserMenu';
import type { Role } from '@/lib/auth';

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
  { href: '/admin/submissions', label: 'Submissions', icon: <ClipboardList size={18} /> },
  { href: '/admin/users', label: 'Staff & Roles', icon: <UserCog size={18} />, allow: ['admin', 'supervisor'] },
  { href: '/admin/referrals', label: 'Referrals', icon: <FileText size={18} />, allow: ['admin'], disabled: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
      <aside className={`app-shell-sidebar${mobileOpen ? ' app-shell-sidebar--open' : ''}`}>
        <div className="app-shell-sidebar-header">
          <Link href="/admin" className="app-shell-brand" onClick={() => setMobileOpen(false)}>
            <div>
              <div style={{ fontWeight: 700, color: '#f5f7fa', fontSize: 14, lineHeight: 1.2 }}>
                Heart & Soul
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>
                Staff portal
              </div>
            </div>
          </Link>
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
            const inner = (
              <>
                <span className="app-shell-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.disabled && <span className="app-shell-coming-soon">Soon</span>}
              </>
            );
            if (item.disabled) {
              return (
                <div key={item.href} className={classes}>
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
              >
                {inner}
              </Link>
            );
          })}
        </nav>

        <div className="app-shell-sidebar-footer">
          <Link href="/" className="app-shell-footer-link" onClick={() => setMobileOpen(false)}>
            ← Back to public site
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

      <style>{`
        .app-shell {
          display: flex;
          min-height: 100vh;
          background: #f5f7fa;
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

        /* Desktop: sidebar sticks, hamburger + close buttons hidden */
        @media (min-width: 900px) {
          .app-shell-mobile-open,
          .app-shell-mobile-close {
            display: none;
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
