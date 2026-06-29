'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tablets, ChevronRight, Search } from 'lucide-react';
import { useEffectiveUser } from '@/components/AuthProvider';
import { getPatients, getPatientsForNurse, type Patient } from '@/lib/patients';

/**
 * Standalone Medications (MAR) entry point. A nurse reaches her medication
 * records here from the sidebar, independent of writing a progress note: she
 * picks one of her assigned clients and opens the SAME monthly MAR grid
 * supervisors use (under /admin/records/[id]/mar). Staff who land here directly
 * see all clients (they normally use Records).
 */
export default function MedicationsPickerPage() {
  const { uid, role } = useEffectiveUser();
  const isNurse = role === 'nurse';
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    // Wait until we know who's asking, so a nurse never briefly loads ALL
    // clients before her uid resolves (she must only see her assigned roster).
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const list = isNurse ? await getPatientsForNurse(uid) : await getPatients();
      if (!cancelled) setPatients(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNurse, uid]);

  const filtered = (patients || []).filter(
    (p) => !q.trim() || (p.name || '').toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div style={iconStyle}>
          <Tablets size={22} />
        </div>
        <div>
          <h1 style={titleStyle}>Medications</h1>
          <p style={subStyle}>Select a client to open their medication administration record.</p>
        </div>
      </header>

      <div style={searchWrapStyle}>
        <Search size={16} color="#94a3b8" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients…"
          style={searchInputStyle}
          aria-label="Search clients"
        />
      </div>

      {patients === null ? (
        <div style={emptyStyle}>Loading clients…</div>
      ) : filtered.length === 0 ? (
        <div style={emptyStyle}>
          {patients.length === 0
            ? isNurse
              ? 'You have no assigned clients yet.'
              : 'No clients found.'
            : 'No clients match your search.'}
        </div>
      ) : (
        <ul style={listStyle}>
          {filtered.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/records/${p.id}/mar`} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={nameStyle}>{p.name}</div>
                  <div style={metaStyle}>
                    {p.mrn ? `Record #${p.mrn}` : ''}
                    {p.requiresMar === false ? `${p.mrn ? ' · ' : ''}No MAR on file` : ''}
                  </div>
                </div>
                <ChevronRight size={18} color="#94a3b8" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const NAVY = '#1a3a5c';
const containerStyle: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: 20 };
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 };
const iconStyle: React.CSSProperties = { width: 44, height: 44, borderRadius: 10, background: '#e8eef4', color: NAVY, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const titleStyle: React.CSSProperties = { fontSize: 22, color: NAVY, margin: 0 };
const subStyle: React.CSSProperties = { fontSize: 13.5, color: '#64748b', margin: '4px 0 0' };
const searchWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1px solid #d0d7de', borderRadius: 8, background: 'white', marginBottom: 14 };
const searchInputStyle: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', color: '#2c3e50', background: 'transparent' };
const emptyStyle: React.CSSProperties = { padding: '28px 16px', textAlign: 'center', color: '#7f8c8d', fontSize: 14, background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', color: '#1f2937' };
const nameStyle: React.CSSProperties = { fontWeight: 700, fontSize: 15, color: '#1f2937' };
const metaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 2 };
