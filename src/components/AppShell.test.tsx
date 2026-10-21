import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/lib/auth';
import type { AssistantClientGrant } from '@/lib/assistantClientAccess';
import AppShell from './AppShell';

const state = vi.hoisted(() => ({
  user: { uid: 'admin-one' as string | null, role: 'admin' as Role | null, isViewingAs: false },
  pathname: '/admin',
  push: vi.fn(),
  pendingDup: 2,
  awaitingReview: 3,
  settings: {
    branding: { orgName: 'Test Healthcare' },
    fax: { enabled: true, userUids: [] as string[] },
    edwp: { userUids: null as string[] | null },
    assistantClients: { grants: [] as AssistantClientGrant[] },
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); }}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push }) }));
vi.mock('./AuthProvider', () => ({ useEffectiveUser: () => state.user }));
vi.mock('./ImpersonationProvider', () => ({
  useViewAs: () => ({ viewingAs: state.user.isViewingAs ? { ...state.user, displayName: 'Preview User' } : null, stopViewAs: vi.fn() }),
}));
vi.mock('./SettingsProvider', () => ({ useSettings: () => ({ settings: state.settings }) }));
vi.mock('./UserMenu', () => ({ default: () => null }));
vi.mock('./NotificationsBell', () => ({ default: () => null }));
vi.mock('./ClarificationGate', () => ({ default: () => null }));
vi.mock('./CorrectionsBlockGate', () => ({ default: () => null }));
vi.mock('./AnnouncementGate', () => ({ default: () => null }));
vi.mock('@/lib/drafts', () => ({
  subscribePendingDupCount: (callback: (count: number) => void) => { callback(state.pendingDup); return vi.fn(); },
}));
vi.mock('@/lib/clarifications', () => ({
  subscribeMyOpenClarifications: (_uid: string, callback: (items: { awaitsNurse: boolean }[]) => void) => {
    callback([{ awaitsNurse: true }, { awaitsNurse: false }, { awaitsNurse: true }]);
    return vi.fn();
  },
  subscribeOpenFlagsAwaitingReviewer: (callback: (count: number) => void) => { callback(state.awaitingReview); return vi.fn(); },
}));
vi.mock('@/lib/handoffs', () => ({
  subscribePendingHandoffs: (_uid: string, callback: (items: object[]) => void) => { callback([{}, {}, {}, {}]); return vi.fn(); },
}));

const groups = {
  'Clinical Work': ['/admin/submissions', '/admin/in-progress', '/admin/handoffs', '/admin/verbal-orders', '/admin/med-errors'],
  'Referrals & Intake': ['/admin/referrals', '/admin/agencies', '/admin/edwp-consents'],
  'Office Tools': ['/admin/communications', '/admin/fax', '/admin/esign', '/admin/announcements'],
  Administration: ['/admin/activity', '/admin/users', '/admin/settings', '/admin/maintenance/link-notes'],
};

const key = (uid: string, role: Role = 'admin', preview = false) => `app-shell-open-groups:${preview ? 'preview' : 'user'}:${uid}:${role}`;
const nav = () => screen.getByRole('navigation');
const group = (label: string) => within(nav()).getByRole('button', { name: new RegExp(`^${label}`) });
const panel = (label: string) => {
  const id = group(label).getAttribute('aria-controls');
  expect(id).toBeTruthy();
  return document.getElementById(id!)!;
};
const openAll = () => {
  for (const button of within(nav()).getAllByRole('button')) {
    if (button.getAttribute('aria-expanded') === 'false') fireEvent.click(button);
  }
};
const leafPaths = () => within(nav()).getAllByRole('link').map((link) => link.getAttribute('href'));
const shell = () => <AppShell><p>Page content</p></AppShell>;

beforeEach(() => {
  localStorage.clear();
  state.user = { uid: 'admin-one', role: 'admin', isViewingAs: false };
  state.pathname = '/admin';
  state.push.mockReset();
  state.pendingDup = 2;
  state.awaitingReview = 3;
  state.settings.fax = { enabled: true, userUids: [] };
  state.settings.edwp = { userUids: null };
  state.settings.assistantClients = { grants: [] };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('grouped sidebar navigation', () => {
  it('organizes all existing admin links into the six approved top-level entries', () => {
    render(shell());
    expect(within(nav()).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/admin', '/admin/clients']);
    expect(within(nav()).getAllByRole('button')).toHaveLength(4);
    for (const [label, paths] of Object.entries(groups)) {
      expect(group(label)).toHaveAttribute('aria-expanded', 'false');
      expect(panel(label)).toHaveAttribute('hidden');
      fireEvent.click(group(label));
      expect(group(label)).toHaveAttribute('aria-expanded', 'true');
      expect(panel(label)).not.toHaveAttribute('hidden');
      expect(within(panel(label)).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(paths);
    }
    expect(leafPaths()).toHaveLength(18);
  });

  it('retains the nurse-only clinical navigation and hides empty office, intake, and administration groups', () => {
    state.user = { uid: 'nurse-one', role: 'nurse', isViewingAs: false };
    render(shell());
    expect(within(nav()).getAllByRole('button')).toHaveLength(1);
    openAll();
    expect(leafPaths()).toEqual(['/admin', '/admin/clients', '/admin/submissions', '/admin/handoffs', '/admin/verbal-orders', '/admin/med-errors']);
  });

  it('retains individual grants for supervisors without granting referrals, agencies, or admin-only pages', () => {
    state.user = { uid: 'supervisor-one', role: 'supervisor', isViewingAs: false };
    const { rerender } = render(shell());
    expect(within(nav()).queryByRole('button', { name: /^Referrals & Intake/ })).not.toBeInTheDocument();
    openAll();
    expect(leafPaths()).toEqual(['/admin', '/admin/clients', ...groups['Clinical Work'], '/admin/communications', '/admin/users']);
    state.settings.fax.userUids = ['supervisor-one'];
    state.settings.edwp.userUids = ['supervisor-one'];
    rerender(shell());
    openAll();
    expect(leafPaths()).toEqual(['/admin', '/admin/clients', ...groups['Clinical Work'], '/admin/edwp-consents', '/admin/communications', '/admin/fax', '/admin/esign', '/admin/users']);
  });

  it('keeps assistants limited to their existing client, intake, and office grants and removes empty groups on revocation', () => {
    state.user = { uid: 'assistant-one', role: 'va', isViewingAs: false };
    const { rerender } = render(shell());
    openAll();
    expect(leafPaths()).toEqual(['/admin', '/admin/referrals', '/admin/agencies', '/admin/edwp-consents']);
    state.settings.fax.userUids = ['assistant-one'];
    state.settings.assistantClients.grants = [{ uid: 'assistant-one', scope: 'gapp', editInfo: true, uploadDocuments: true }];
    rerender(shell());
    openAll();
    expect(leafPaths()).toEqual(['/admin', '/admin/clients', '/admin/referrals', '/admin/agencies', '/admin/edwp-consents', '/admin/fax', '/admin/esign']);
    state.settings.fax.enabled = false;
    state.settings.edwp.userUids = [];
    state.settings.assistantClients.grants = [];
    rerender(shell());
    expect(leafPaths()).toEqual(['/admin', '/admin/referrals', '/admin/agencies']);
    expect(within(nav()).queryByRole('button', { name: /^Office Tools/ })).not.toBeInTheDocument();
  });

  it('auto-opens the active nested page while allowing the user to close it until navigation changes', () => {
    state.pathname = '/admin/submissions/note-one';
    const { rerender } = render(shell());
    expect(group('Clinical Work')).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel('Clinical Work')).getByRole('link', { name: /^Submissions/ })).toHaveClass('app-shell-nav-item--active');
    fireEvent.click(group('Clinical Work'));
    expect(group('Clinical Work')).toHaveAttribute('aria-expanded', 'false');
    rerender(shell());
    expect(group('Clinical Work')).toHaveAttribute('aria-expanded', 'false');
    state.pathname = '/admin/handoffs';
    rerender(shell());
    expect(group('Clinical Work')).toHaveAttribute('aria-expanded', 'true');
    state.pathname = '/admin/edwp-consents/consent-one';
    rerender(shell());
    expect(group('Referrals & Intake')).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps legacy client routes highlighted without opening an unrelated group', () => {
    state.pathname = '/admin/mar/client-one';
    render(shell());
    expect(within(nav()).getByRole('link', { name: 'Clients' })).toHaveClass('app-shell-nav-item--active');
    for (const button of within(nav()).getAllByRole('button')) expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('restores saved groups and persists subsequent choices across remounts', () => {
    localStorage.setItem(key('admin-one'), JSON.stringify(['office']));
    const { unmount } = render(shell());
    expect(group('Office Tools')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(group('Office Tools'));
    fireEvent.click(group('Administration'));
    expect(JSON.parse(localStorage.getItem(key('admin-one'))!)).toEqual(['administration']);
    unmount();
    render(shell());
    expect(group('Office Tools')).toHaveAttribute('aria-expanded', 'false');
    expect(group('Administration')).toHaveAttribute('aria-expanded', 'true');
  });

  it('isolates preferences when effective users and view-as sessions change', () => {
    localStorage.setItem(key('admin-one'), JSON.stringify(['office']));
    localStorage.setItem(key('admin-two'), JSON.stringify(['administration']));
    localStorage.setItem(key('admin-two', 'admin', true), JSON.stringify(['intake']));
    const { rerender } = render(shell());
    state.user.uid = 'admin-two';
    rerender(shell());
    expect(group('Office Tools')).toHaveAttribute('aria-expanded', 'false');
    expect(group('Administration')).toHaveAttribute('aria-expanded', 'true');
    expect(JSON.parse(localStorage.getItem(key('admin-one'))!)).toEqual(['office']);
    state.user.isViewingAs = true;
    rerender(shell());
    expect(group('Administration')).toHaveAttribute('aria-expanded', 'false');
    expect(group('Referrals & Intake')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(group('Referrals & Intake'));
    expect(JSON.parse(localStorage.getItem(key('admin-two'))!)).toEqual(['administration']);
    expect(JSON.parse(localStorage.getItem(key('admin-two', 'admin', true))!)).toEqual([]);
  });

  it('continues working with malformed or unavailable browser storage', () => {
    localStorage.setItem(key('admin-one'), '{broken');
    const first = render(shell());
    fireEvent.click(group('Clinical Work'));
    expect(group('Clinical Work')).toHaveAttribute('aria-expanded', 'true');
    first.unmount();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    expect(() => render(shell())).not.toThrow();
    fireEvent.click(group('Office Tools'));
    expect(group('Office Tools')).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows pending work on collapsed groups and preserves the flagged Submissions shortcut', () => {
    render(shell());
    expect(group('Clinical Work')).toHaveAttribute('aria-expanded', 'false');
    expect(within(group('Clinical Work')).getByText('5')).toBeVisible();
    fireEvent.click(group('Clinical Work'));
    const submissions = within(panel('Clinical Work')).getByRole('link', { name: /^Submissions/ });
    fireEvent.click(within(submissions).getByText('3'));
    expect(state.push).toHaveBeenCalledWith('/admin/submissions?flag=1');
  });

  it('uses only visible children in the aggregate when switching from admin to nurse', () => {
    const { rerender } = render(shell());
    expect(within(group('Clinical Work')).getByText('5')).toBeVisible();
    state.user = { uid: 'nurse-one', role: 'nurse', isViewingAs: false };
    rerender(shell());
    // Two clarification requests + four handoffs; admin duplicate requests do not belong here.
    expect(within(group('Clinical Work')).getByText('6')).toBeVisible();
    fireEvent.click(group('Clinical Work'));
    expect(within(panel('Clinical Work')).queryByRole('link', { name: /^In Progress/ })).not.toBeInTheDocument();
  });

  it('keeps aggregate counts in the icon rail and opens the chosen group when its icon is clicked', () => {
    localStorage.setItem('app-shell-collapsed', '1');
    render(shell());
    // jsdom does not apply the desktop media query that displays this button.
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
    expect(within(group('Clinical Work')).getByText('5')).toBeVisible();
    fireEvent.click(group('Clinical Work'));
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument();
    expect(group('Clinical Work')).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel('Clinical Work')).getByRole('link', { name: /^Submissions/ })).toBeVisible();
  });

  it('keeps the mobile drawer open while expanding a group and closes it after choosing a page', () => {
    render(shell());
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(group('Clinical Work'));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(within(panel('Clinical Work')).getByRole('link', { name: /^Handoffs/ }));
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
