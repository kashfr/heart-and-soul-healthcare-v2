'use client';

import { useState, type CSSProperties } from 'react';
import { MessagesSquare } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { useEffectiveUser } from '@/components/AuthProvider';
import CommunicationsLog from '@/components/CommunicationsLog';

/** Portal-wide communications log: every notice sent to staff, filterable by
 *  staff member and client, plus messages logged by hand. */
export default function CommunicationsPage() {
  return (
    <AuthGuard allow={['admin', 'supervisor']}>
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const { isViewingAs } = useEffectiveUser();
  const [toast, setToast] = useState<string | null>(null);
  return (
    <div style={container}>
      <div style={wrap}>
        <h1 style={title}><MessagesSquare size={22} style={{ verticalAlign: -3, marginRight: 8 }} />Communications</h1>
        <section style={card}>
          <CommunicationsLog readOnly={isViewingAs} onToast={(m) => { setToast(m); setTimeout(() => setToast(null), 3000); }} />
        </section>
      </div>
      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  );
}

const container: CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '28px 20px' };
const wrap: CSSProperties = { maxWidth: 980, margin: '0 auto' };
const title: CSSProperties = { fontSize: 26, color: '#2c3e50', margin: '0 0 14px' };
const card: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18 };
const toastStyle: CSSProperties = { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: 'white', padding: '10px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, zIndex: 3300 };
