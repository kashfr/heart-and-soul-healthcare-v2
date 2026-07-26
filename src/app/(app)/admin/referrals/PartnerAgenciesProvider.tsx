'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/authedFetch';
import type { MatchableAgency } from '@/lib/agencyMatch';

/**
 * The saved partner-agency directory, fetched once for the whole Referrals
 * screen. Mounted in the referrals layout (inside AuthGuard, so a user is
 * always present by the time this renders).
 *
 * Before this existed the share picker, the refer-out modal and the bulk-share
 * row each fetched /api/admin/agencies on open. The board now needs the same
 * list to badge every card, so it lives in one place and everyone reads it.
 *
 * `agencies` is [] until the GET lands, which every consumer already treats as
 * "no matching available yet" — the smart-match row hides and the board badge
 * stays off rather than flashing a wrong verdict. `loaded` distinguishes "still
 * fetching" from "genuinely no agencies saved" for callers that care.
 */

interface PartnerAgenciesContextValue {
  agencies: MatchableAgency[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

const PartnerAgenciesContext = createContext<PartnerAgenciesContextValue>({
  agencies: [],
  loaded: false,
  refresh: async () => {},
});

interface AgencyResponse {
  id: string;
  name: string;
  email: string;
  counties?: string[];
  services?: string[];
}

export function PartnerAgenciesProvider({ children }: { children: React.ReactNode }) {
  const [agencies, setAgencies] = useState<MatchableAgency[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/agencies');
      if (!res.ok) return;
      const data = await res.json();
      setAgencies(
        (data.agencies ?? []).map((a: AgencyResponse) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          counties: a.counties ?? [],
          services: a.services ?? [],
        }))
      );
    } catch {
      /* non-fatal: matching and autocomplete just stay unavailable */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<PartnerAgenciesContextValue>(
    () => ({ agencies, loaded, refresh }),
    [agencies, loaded, refresh]
  );

  return (
    <PartnerAgenciesContext.Provider value={value}>{children}</PartnerAgenciesContext.Provider>
  );
}

/** Read the shared partner-agency directory. */
export function usePartnerAgencies(): PartnerAgenciesContextValue {
  return useContext(PartnerAgenciesContext);
}
