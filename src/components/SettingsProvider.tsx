'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { authedFetch } from '@/lib/authedFetch';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings';

/**
 * App-wide settings context. Mounted once inside the (app) layout so
 * every authenticated screen can read settings without re-fetching.
 *
 * `settings` is never `null` — it's defaults until the GET completes,
 * then the live values. That way consumers don't need to handle a
 * loading state for the common case of "render with whatever we
 * have." Use `ready` if a consumer truly needs to wait for the live
 * doc (rare).
 *
 * `refresh()` re-fetches; the settings page calls it after a save
 * so the rest of the UI picks up the change without a page reload.
 */

interface SettingsContextValue {
  settings: AppSettings;
  ready: boolean;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  ready: false,
  refresh: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/admin/settings', { method: 'GET' });
      if (!res.ok) {
        console.error('SettingsProvider: GET /api/admin/settings failed', res.status);
        return;
      }
      const json = (await res.json()) as { settings?: AppSettings };
      if (json.settings) setSettings(json.settings);
    } catch (err) {
      // Network blip / Firestore hiccup — keep showing defaults rather
      // than crashing the UI. The user can always refresh.
      console.error('SettingsProvider: fetch threw', err);
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, ready, refresh }),
    [settings, ready, refresh],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Hook to read settings + trigger a refresh after writes. */
export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
