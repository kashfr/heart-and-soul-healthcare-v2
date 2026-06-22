import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { SharedReferralView } from '@/lib/referralShares';

// A clean one-page PDF of a shared referral, for the partner agency to download.

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: 'Helvetica', color: '#111827' },
  brand: { fontSize: 16, fontWeight: 700, color: '#111827' },
  kicker: { fontSize: 10, color: '#6b7280', marginBottom: 16 },
  title: { fontSize: 20, marginTop: 8, marginBottom: 2, color: '#111827' },
  sub: { fontSize: 10, color: '#6b7280', marginBottom: 18 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
    paddingVertical: 6,
  },
  label: { width: 150, color: '#5c6b7a', fontWeight: 700 },
  value: { flex: 1, color: '#111827' },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, fontSize: 9, color: '#9ca3af', textAlign: 'center' },
});

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

export default function ReferralSharePDF({ view }: { view: SharedReferralView }) {
  const baseRows: Array<[string, string]> = [
    ['Program', view.program],
    ['County', view.county],
    ['Phone', view.clientPhone],
    ['Email', view.clientEmail],
    ...(view.referrerName ? ([['Referred by', view.referrerName]] as Array<[string, string]>) : []),
    ['Received', fmtDate(view.submittedAt)],
  ];

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.brand}>Heart &amp; Soul Healthcare</Text>
        <Text style={styles.kicker}>Client Referral — shared with {view.partnerAgency || 'partner agency'}</Text>

        <Text style={styles.title}>{view.clientName || 'Referral'}</Text>
        <Text style={styles.sub}>Confidential — contains protected health information.</Text>

        {baseRows.map(([label, value], i) => (
          <Row key={`b${i}`} label={label} value={value} />
        ))}
        {view.details.map((d, i) => (
          <Row key={`d${i}`} label={d.label} value={d.value} />
        ))}

        <Text style={styles.footer}>
          Shared securely by Heart &amp; Soul Healthcare. Please do not forward this document.
        </Text>
      </Page>
    </Document>
  );
}
