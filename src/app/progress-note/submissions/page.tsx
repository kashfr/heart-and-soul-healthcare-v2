'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSubmissions, deleteSubmission, type SubmissionSummary } from '@/lib/submissions';

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const handleDelete = async (s: SubmissionSummary) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete this progress note for ${s.clientName} on ${s.dateOfService}?`
    );
    if (!confirmed) return;
    try {
      await deleteSubmission(s.id);
      setSubmissions((prev) => prev.filter((item) => item.id !== s.id));
    } catch (error) {
      console.error('Failed to delete submission:', error);
      alert('Failed to delete submission. Please try again.');
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getSubmissions();
        setSubmissions(data);
      } catch (error) {
        console.error('Failed to load submissions:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Progress Note Submissions</h1>
          <p style={subtitleStyle}>All submitted nursing progress notes</p>
        </div>

        <div style={controlsStyle}>
          <Link href="/progress-note" style={backLinkStyle}>
            &larr; Back to Form
          </Link>
        </div>

        {loading ? (
          <div style={loadingStyle}>
            <p>Loading submissions...</p>
          </div>
        ) : submissions.length === 0 ? (
          <div style={emptyStyle}>
            <p style={emptyTitleStyle}>No submissions yet</p>
            <p style={emptySubStyle}>
              Submitted progress notes will appear here.
            </p>
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date of Service</th>
                  <th style={thStyle}>Client Name</th>
                  <th style={thStyle}>Nurse</th>
                  <th style={thStyle}>Credential</th>
                  <th style={thStyle}>Submitted At</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => (
                  <tr key={s.id} style={i % 2 === 1 ? altRowStyle : undefined}>
                    <td style={tdStyle}>{s.dateOfService}</td>
                    <td style={tdStyle}>{s.clientName}</td>
                    <td style={tdStyle}>{s.nurseName}</td>
                    <td style={tdStyle}>
                      <span style={credentialBadge}>{s.credential}</span>
                    </td>
                    <td style={tdStyle}>
                      {s.submittedAt
                        ? s.submittedAt.toLocaleString()
                        : '--'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <Link
                          href={`/progress-note/submissions/${s.id}`}
                          style={viewBtnStyle}
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleDelete(s)}
                          style={deleteBtnStyle}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Inline styles ---

const containerStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: 20,
};

const wrapStyle: React.CSSProperties = {
  background: 'white',
  padding: 30,
  borderRadius: 8,
  boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: 24,
  borderBottom: '3px solid #2c3e50',
  paddingBottom: 16,
};

const titleStyle: React.CSSProperties = {
  color: '#2c3e50',
  fontSize: 24,
  marginBottom: 4,
  marginTop: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: '#7f8c8d',
  fontSize: 14,
  margin: 0,
};

const controlsStyle: React.CSSProperties = {
  marginBottom: 20,
};

const backLinkStyle: React.CSSProperties = {
  color: '#27ae60',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 14,
};

const loadingStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: '#666',
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '60px 20px',
  background: '#f9f9f9',
  borderRadius: 8,
};

const emptyTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: '#2c3e50',
  marginBottom: 8,
};

const emptySubStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#7f8c8d',
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '2px solid #2c3e50',
  color: '#2c3e50',
  fontWeight: 700,
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #e0e0e0',
  color: '#333',
};

const altRowStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
};

const credentialBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#e8eef4',
  color: '#1a3a5c',
  padding: '2px 8px',
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 12,
};

const viewBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#34495e',
  color: 'white',
  padding: '6px 16px',
  borderRadius: 4,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
};

const deleteBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#f5f5f5',
  color: '#c44',
  padding: '6px 16px',
  borderRadius: 4,
  border: '1px solid #ddd',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
