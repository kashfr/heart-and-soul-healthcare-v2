'use client';

import { Fragment, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useEffectiveUser } from './AuthProvider';
import { useSettings } from './SettingsProvider';
import { getAssistantClientGrant, type AssistantClientGrant } from '@/lib/assistantClientAccess';

/**
 * The client-access grant for the EFFECTIVE user when she is a virtual
 * assistant (Settings > Assistant Client Access). Under View As this is the
 * previewed assistant's grant, so the admin sees her screens as she does.
 * `isAssistant` is false for every other role, whose access is role-based.
 */
export function useAssistantGrant(): { isAssistant: boolean; grant: AssistantClientGrant | null; ready: boolean } {
  const { uid, role } = useEffectiveUser();
  const { settings, ready } = useSettings();
  const isAssistant = role === 'va';
  return { isAssistant, grant: isAssistant ? getAssistantClientGrant(settings.assistantClients, uid, role) : null, ready };
}

/**
 * Wraps a client screen so an assistant without a grant sees why it is
 * closed instead of a page of permission errors. Everyone else passes
 * straight through. Settings are re-read when the tab regains focus so a
 * grant the owner just saved (or revoked) takes effect without a reload, and
 * the children remount when the grant changes so nothing loaded under the
 * old scope lingers.
 */
export function AssistantAccessGate({ children }: { children: ReactNode }) {
  const { isViewingAs, uid } = useEffectiveUser();
  const { refresh } = useSettings();
  const { isAssistant, grant, ready } = useAssistantGrant();
  useEffect(() => {
    if (!isAssistant) return;
    const updateAccess = () => { void refresh(); };
    window.addEventListener('focus', updateAccess);
    return () => window.removeEventListener('focus', updateAccess);
  }, [isAssistant, refresh]);
  if (!isAssistant) return <>{children}</>;
  if (!ready) return <div style={page}><div style={card}>Loading client access…</div></div>;
  if (!grant) {
    return <div style={page}><div style={card}>{isViewingAs
      ? 'Client access has not been enabled for this assistant. Exit View As and enable it under Settings > Assistant Client Access.'
      : 'Client access has not been enabled for your account. Ask your administrator to enable Assistant Client Access in Settings.'}</div></div>;
  }
  return <Fragment key={`${uid}:${grant.scope}:${grant.editInfo}:${grant.uploadDocuments}`}>{children}</Fragment>;
}

const page: CSSProperties = { maxWidth: 1150, margin: '0 auto', padding: '24px 16px 48px' };
const card: CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 12, padding: 22, background: 'white', color: '#334155' };
