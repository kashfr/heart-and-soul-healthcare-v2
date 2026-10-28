import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { uid: 'rose', role: 'va', isViewingAs: false },
  grants: [] as Array<{ uid: string; scope: string; editInfo: boolean; uploadDocuments: boolean }>,
  ready: true,
  refresh: vi.fn(),
}));
vi.mock('./AuthProvider', () => ({ useEffectiveUser: () => state.user }));
vi.mock('./SettingsProvider', () => ({ useSettings: () => ({ settings: { assistantClients: { grants: state.grants } }, ready: state.ready, refresh: state.refresh }) }));
import { AssistantAccessGate, useAssistantGrant } from './AssistantAccessGate';

function Probe() {
  const { isAssistant, grant } = useAssistantGrant();
  return <div>probe:{String(isAssistant)}:{grant ? grant.scope : 'none'}</div>;
}

beforeEach(() => {
  state.user = { uid: 'rose', role: 'va', isViewingAs: false };
  state.grants = [];
  state.ready = true;
  state.refresh.mockReset();
});

it('explains the closed door to an ungranted assistant, and to an admin previewing her', () => {
  const { unmount } = render(<AssistantAccessGate><div>client page</div></AssistantAccessGate>);
  expect(screen.getByText(/Client access has not been enabled for your account/)).toBeInTheDocument();
  expect(screen.queryByText('client page')).not.toBeInTheDocument();
  unmount();
  state.user = { uid: 'rose', role: 'va', isViewingAs: true };
  render(<AssistantAccessGate><div>client page</div></AssistantAccessGate>);
  expect(screen.getByText(/Exit View As and enable it under Settings > Assistant Client Access/)).toBeInTheDocument();
});

it('waits for settings, then opens the page for a granted assistant and reports her grant', () => {
  state.ready = false;
  const { rerender } = render(<AssistantAccessGate><Probe /></AssistantAccessGate>);
  expect(screen.getByText('Loading client access…')).toBeInTheDocument();
  state.ready = true;
  state.grants = [{ uid: 'rose', scope: 'gapp', editInfo: true, uploadDocuments: true }];
  rerender(<AssistantAccessGate><Probe /></AssistantAccessGate>);
  expect(screen.getByText('probe:true:gapp')).toBeInTheDocument();
});

it('passes every other role straight through, with no grant', () => {
  state.user = { uid: 'owner', role: 'admin', isViewingAs: false };
  state.ready = false;
  render(<AssistantAccessGate><Probe /></AssistantAccessGate>);
  expect(screen.getByText('probe:false:none')).toBeInTheDocument();
});
