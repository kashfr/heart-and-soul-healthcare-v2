'use client';

import { Printer } from 'lucide-react';
import { fieldRows, formatDate, SOURCE_LABEL, STAGE_LABEL, type Referral } from './types';

/**
 * Full-screen print preview. Each referral renders as a one-per-page call sheet
 * (contact info, all fields, and a blank outreach log the nurse fills in by
 * hand). The @media print block hides everything else on the page.
 */
export default function PrintOverlay({
  printList,
  onClose,
}: {
  printList: Referral[];
  onClose: () => void;
}) {
  return (
    <div style={printOverlayStyle}>
      <div className="referral-print-toolbar" style={printToolbarStyle}>
        <span style={{ fontWeight: 700 }}>
          Print preview — {printList.length} referral{printList.length === 1 ? '' : 's'}
        </span>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          Each referral prints on its own page with a call log.
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={printNowBtnStyle}>
          <Printer size={15} /> Print
        </button>
        <button onClick={onClose} style={printCloseBtnStyle}>
          Close
        </button>
      </div>
      <div className="referral-print-root" style={printRootStyle}>
        {printList.map((r) => (
          <ReferralPrintSheet key={r.id} referral={r} />
        ))}
      </div>

      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body * { visibility: hidden !important; }
          .referral-print-root, .referral-print-root * { visibility: visible !important; }
          .referral-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .referral-print-toolbar { display: none !important; }
          .referral-print-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            max-width: none !important;
            page-break-after: always;
          }
          .referral-print-sheet:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

function ReferralPrintSheet({ referral }: { referral: Referral }) {
  return (
    <div className="referral-print-sheet" style={sheetStyle}>
      <div style={sheetHeaderStyle}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>
            Heart &amp; Soul Healthcare
          </div>
          <div style={{ fontSize: 12, color: '#555' }}>Referral Call Sheet</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#555', lineHeight: 1.5 }}>
          <div>Source: {SOURCE_LABEL[referral.source] ?? referral.source}</div>
          <div>Received: {formatDate(referral.submittedAt)}</div>
          <div>Stage: {STAGE_LABEL[referral.stage]}</div>
          {referral.assigneeName && <div>Assigned: {referral.assigneeName}</div>}
        </div>
      </div>

      <h2 style={{ fontSize: 22, margin: '14px 0 6px', color: '#111' }}>
        {referral.clientName || 'Referral'}
      </h2>

      <div style={contactLineStyle}>
        <span>
          <strong>Phone:</strong> {referral.clientPhone || '________________________'}
        </span>
        <span>
          <strong>Email:</strong> {referral.clientEmail || '________________________'}
        </span>
      </div>

      <table style={printTableStyle}>
        <tbody>
          {fieldRows(referral).map((d, i) => (
            <tr key={i}>
              <td style={printLabelCell}>{d.label}</td>
              <td style={printValueCell}>{d.value || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={logTitleStyle}>Outreach Log</div>
      <table style={printTableStyle}>
        <thead>
          <tr>
            <th style={{ ...logHeadCell, width: 60 }}>Attempt</th>
            <th style={{ ...logHeadCell, width: 110 }}>Date</th>
            <th style={{ ...logHeadCell, width: 80 }}>Time</th>
            <th style={logHeadCell}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((n) => (
            <tr key={n}>
              <td style={logCell}>{n}</td>
              <td style={logCell} />
              <td style={logCell} />
              <td style={logCell}>{'☐'} Reached&nbsp;&nbsp; {'☐'} Voicemail&nbsp;&nbsp; {'☐'} No answer</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12, fontSize: 13, color: '#111' }}>
        <strong>Follow-up date:</strong> ____________________ &nbsp;&nbsp;
        <strong>Result:</strong> {'☐'} Scheduled&nbsp;&nbsp; {'☐'} Needs info&nbsp;&nbsp; {'☐'} Not interested
      </div>

      <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: '#111' }}>Notes</div>
      <div style={{ marginTop: 6 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={noteLineStyle} />
        ))}
      </div>
    </div>
  );
}

const printOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#e9edf1',
  zIndex: 2000,
  overflowY: 'auto',
};
const printToolbarStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '12px 20px',
  background: '#1f2937',
  color: 'white',
  flexWrap: 'wrap',
};
const printNowBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#27ae60',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const printCloseBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.14)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const printRootStyle: React.CSSProperties = {
  padding: '24px 16px',
};
const sheetStyle: React.CSSProperties = {
  background: 'white',
  color: '#111',
  maxWidth: 760,
  margin: '0 auto 24px',
  padding: 40,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
  fontFamily: 'Arial, Helvetica, sans-serif',
};
const sheetHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  borderBottom: '2px solid #111',
  paddingBottom: 10,
};
const contactLineStyle: React.CSSProperties = {
  display: 'flex',
  gap: 36,
  flexWrap: 'wrap',
  fontSize: 14,
  margin: '4px 0 16px',
  color: '#111',
};
const printTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};
const printLabelCell: React.CSSProperties = {
  border: '1px solid #999',
  padding: '6px 10px',
  background: '#f3f3f3',
  fontWeight: 700,
  width: 190,
  verticalAlign: 'top',
  color: '#111',
};
const printValueCell: React.CSSProperties = {
  border: '1px solid #999',
  padding: '6px 10px',
  color: '#111',
  whiteSpace: 'pre-wrap',
};
const logTitleStyle: React.CSSProperties = {
  marginTop: 20,
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 800,
  color: '#111',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
};
const logHeadCell: React.CSSProperties = {
  border: '1px solid #999',
  padding: '6px 8px',
  background: '#f3f3f3',
  fontSize: 12,
  textAlign: 'left',
  color: '#111',
};
const logCell: React.CSSProperties = {
  border: '1px solid #999',
  padding: '12px 8px',
  fontSize: 12,
  color: '#111',
};
const noteLineStyle: React.CSSProperties = {
  borderBottom: '1px solid #aaa',
  height: 26,
};
