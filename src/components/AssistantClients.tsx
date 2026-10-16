'use client';
import { withSelectChevron } from '@/lib/selectChevron';

import { Fragment, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, ExternalLink, FileUp, Pencil, Plus, Search } from 'lucide-react';
import { useEffectiveUser } from './AuthProvider';
import { useSettings } from './SettingsProvider';
import { btn, btnPrimary, btnSm } from './buttons';
import { getAssistantClientGrant, type AssistantClientGrant } from '@/lib/assistantClientAccess';
import { authedFetch } from '@/lib/authedFetch';
import { formatDateUS } from '@/lib/dateFormat';
import { getProgram } from '@/lib/programs';
import { GUARDIAN_ROLES } from '@/lib/guardianShared';
import { DOC_CATEGORY_GROUPS } from '@/lib/docCategories';
import { ALLOWED_DOC_TYPES, MAX_DOC_BYTES, renderDocumentInWindow } from '@/lib/patientDocuments';

interface ClientSummary {
  id: string;
  name: string;
  dob: string;
  program: string;
  city: string;
  state: string;
}

interface Contact {
  id: string;
  role: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  address: string;
}

interface ClientInfo extends ClientSummary {
  street: string;
  zip: string;
  medicaidId: string;
  physicianName: string;
  physicianPhone: string;
  physicianFax: string;
  guardianContacts: Contact[];
  revision: string;
}

interface DocumentInfo {
  id: string;
  title: string;
  category: string;
  docDate: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedByName: string;
}

interface DetailData {
  client: ClientInfo;
  documents: DocumentInfo[];
  grant: AssistantClientGrant;
}

class ClientRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ClientRequestError(body.error || 'Could not complete this request. Please try again.', response.status);
  return body as T;
}

const clientUrl = (id: string) => `/api/assistant/clients/${encodeURIComponent(id)}`;
const message = (err: unknown) => err instanceof Error ? err.message : 'Could not complete this request. Please try again.';

/** Keep the VA workspace separate so the clinical dashboard never mounts or
 * starts clinical reads. The API checks the live grant again for every call. */
function AssistantGate({ children }: { children: ReactNode }) {
  const { uid, role, isViewingAs } = useEffectiveUser();
  const { settings, ready, refresh } = useSettings();
  useEffect(() => {
    if (isViewingAs) return;
    const updateAccess = () => { void refresh(); };
    window.addEventListener('focus', updateAccess);
    return () => window.removeEventListener('focus', updateAccess);
  }, [isViewingAs, refresh]);
  const grant = getAssistantClientGrant(settings.assistantClients, uid, role);
  if (!ready) return <div style={page}><div style={card}>Loading client access…</div></div>;
  if (isViewingAs) return <div style={page}><div style={card}>Client access preview is unavailable in View As. Exit View As to manage client access in Settings.</div></div>;
  if (!grant) {
    return <div style={page}><div style={card}>Client access has not been enabled for your account. Ask your administrator to enable Assistant Client Access in Settings.</div></div>;
  }
  // A settings refresh that narrows scope clears any already-loaded client
  // immediately, even before the server rejects the next request.
  return <Fragment key={`${uid}:${grant.scope}:${grant.editInfo}:${grant.uploadDocuments}`}>{children}</Fragment>;
}

export function AssistantClientsRoster() {
  return <AssistantGate><Roster /></AssistantGate>;
}

function Roster() {
  const [data, setData] = useState<{ clients: ClientSummary[]; grant: AssistantClientGrant } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    authedFetch('/api/assistant/clients', { cache: 'no-store' })
      .then(readResponse<{ clients: ClientSummary[]; grant: AssistantClientGrant }>)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(message(err)); });
    return () => { cancelled = true; };
  }, [retry]);
  const needle = query.toLowerCase().trim();
  const clients = data?.clients.filter((c) => `${c.name} ${formatDateUS(c.dob)} ${c.city} ${c.state}`.toLowerCase().includes(needle)) ?? [];
  return (
    <main style={page}>
      <h1 style={heading}>Clients</h1>
      <p style={muted}>Open a client to manage their information and documents.</p>
      {error ? <div role="alert" style={errorBox}>{error} <button className={btn} onClick={() => { setError(''); setData(null); setRetry((v) => v + 1); }}>Try again</button></div>
        : !data ? <div style={card}>Loading clients…</div> : <>
          <div style={{ ...row, marginBottom: 18 }}>
            <span style={badge}>{data.grant.scope === 'gapp' ? 'GAPP clients' : 'All clients'} · {data.clients.length}</span>
            <label style={{ ...row, flex: 1, minWidth: 200 }}><Search size={17} aria-hidden="true" /><input aria-label="Search clients" placeholder="Search name, date of birth, or city" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...input, flex: 1 }} /></label>
          </div>
          {clients.length === 0 ? <div style={card}>{needle ? 'No clients match your search.' : 'No clients are available in your assigned program yet.'}</div> : (
            <div style={grid}>
              {clients.map((c) => <Link key={c.id} href={`/admin/clients/${encodeURIComponent(c.id)}`} style={{ ...card, display: 'block', textDecoration: 'none', color: NAVY }}>
                <strong style={{ fontSize: 18 }}>{c.name}</strong>
                <div style={{ ...muted, marginTop: 8 }}>DOB {formatDateUS(c.dob) || 'Not on file'}</div>
                <div style={muted}>{[c.city, c.state].filter(Boolean).join(', ') || 'Address not on file'}</div>
                <div style={{ ...row, marginTop: 16, justifyContent: 'space-between' }}><span style={badge}>{getProgram(c.program)?.label || c.program || 'Program not set'}</span><span>Open client →</span></div>
              </Link>)}
            </div>
          )}
        </>}
    </main>
  );
}

export function AssistantClientDetails({ patientId }: { patientId: string }) {
  return <AssistantGate><Details key={patientId} patientId={patientId} /></AssistantGate>;
}

function Details({ patientId }: { patientId: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    authedFetch(clientUrl(patientId), { cache: 'no-store' }).then(readResponse<DetailData>)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(message(err)); });
    return () => { cancelled = true; };
  }, [patientId, retry]);

  const accessError = (err: unknown) => {
    if (err instanceof ClientRequestError && [401, 403, 404].includes(err.status)) {
      setData(null);
      setError(message(err));
    }
  };
  const openDocument = async (doc: DocumentInfo) => {
    const popup = window.open('', '_blank');
    if (!popup) { setNotice('Your browser blocked the document tab. Allow popups for this site to open documents.'); return; }
    popup.opener = null;
    try {
      const res = await authedFetch(`${clientUrl(patientId)}/documents/${encodeURIComponent(doc.id)}`, { cache: 'no-store' });
      if (!res.ok) await readResponse(res);
      const blob = await res.blob();
      const type = ALLOWED_DOC_TYPES[blob.type] ? blob.type : 'application/octet-stream';
      renderDocumentInWindow(popup, { blob, type }, doc);
    } catch (err) {
      popup.close();
      setNotice(message(err));
      accessError(err);
    }
  };

  return (
    <main style={page}>
      <Link href="/admin/clients" style={{ ...row, color: NAVY, marginBottom: 18, textDecoration: 'none' }}><ArrowLeft size={16} /> All Clients</Link>
      {notice && <div role="status" style={noticeBox}>{notice}</div>}
      {error ? <div role="alert" style={errorBox}>{error} <button className={btn} onClick={() => { setError(''); setData(null); setRetry((v) => v + 1); }}>Try again</button></div>
        : !data ? <div style={card}>Loading client…</div> : <>
          <header style={card}>
            <div style={{ ...row, justifyContent: 'space-between' }}>
              <div><h1 style={heading}>{data.client.name}</h1><p style={muted}>DOB {formatDateUS(data.client.dob)} · {getProgram(data.client.program)?.label || data.client.program}</p></div>
              {data.grant.editInfo && !editing && <button className={btn} onClick={() => setEditing(true)}><Pencil size={15} /> Edit client information</button>}
            </div>
            <div style={{ ...row, marginTop: 12 }}>
              <span style={muted}>Medicaid ID</span><strong style={{ fontSize: 18, color: NAVY, overflowWrap: 'anywhere' }}>{data.client.medicaidId || 'Not on file'}</strong>
              {data.client.medicaidId && <button className={`${btn} ${btnSm}`} onClick={async () => {
                try { await navigator.clipboard.writeText(data.client.medicaidId); setNotice('Medicaid ID copied.'); }
                catch { setNotice('Could not copy. Select the Medicaid ID and copy it manually.'); }
              }}><Copy size={14} /> Copy</button>}
            </div>
          </header>
          {editing ? <InfoForm client={data.client} patientId={patientId} onCancel={() => setEditing(false)} onError={accessError} onSaved={(result) => {
            setData({ ...data, ...result }); setEditing(false); setNotice('Client information saved.');
          }} /> : <section style={{ ...card, marginTop: 18 }}>
            <h2 style={subheading}>Client information</h2>
            <div style={grid}>
              <Value label="Home address" value={[data.client.street, [data.client.city, data.client.state, data.client.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')} />
              <Value label="Attending physician" value={data.client.physicianName} />
              <Value label="Physician phone" value={data.client.physicianPhone} />
              <Value label="Physician fax" value={data.client.physicianFax} />
            </div>
            <h3 style={{ ...subheading, marginTop: 24 }}>Parent, guardian, and responsible contacts</h3>
            {data.client.guardianContacts?.length ? <div style={grid}>{data.client.guardianContacts.map((c) => <div key={c.id} style={contactCard}>
              <strong>{c.name}</strong><div style={muted}>{[c.role, c.relationship].filter(Boolean).join(' · ')}</div>
              {c.phone && <div>{c.phone}</div>}{c.email && <div style={{ overflowWrap: 'anywhere' }}>{c.email}</div>}{c.address && <div>{c.address}</div>}
            </div>)}</div> : <p style={muted}>No contacts on file.</p>}
          </section>}
          <section style={{ ...card, marginTop: 18 }}>
            <h2 style={subheading}>Documents</h2>
            {data.grant.uploadDocuments && <UploadForm patientId={patientId} onError={accessError} onUploaded={(document) => {
              setData((current) => current ? { ...current, documents: [document, ...current.documents] } : null);
              setNotice('Document uploaded.');
            }} />}
            {data.documents.length === 0 ? <p style={muted}>No documents on file.</p> : <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              {data.documents.map((d) => <article key={d.id} style={{ ...contactCard, ...row, justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: '1 1 240px' }}><strong style={{ overflowWrap: 'anywhere' }}>{d.title || d.fileName}</strong>
                  <div style={muted}>{d.category} · {formatDateUS(d.docDate) || 'Date not provided'}</div>
                  <div style={{ ...muted, fontSize: 12 }}>{d.uploadedByName ? `Uploaded by ${d.uploadedByName} · ` : ''}{formatBytes(d.size)}</div>
                </div>
                <button className={btn} onClick={() => void openDocument(d)} aria-label={`Open ${d.title || d.fileName}`}><ExternalLink size={15} /> Open / Download</button>
              </article>)}
            </div>}
          </section>
        </>}
    </main>
  );
}

const EDITABLE_FIELDS = ['name', 'dob', 'street', 'city', 'state', 'zip', 'medicaidId', 'physicianName', 'physicianPhone', 'physicianFax'] as const;
type InfoDraft = Pick<ClientInfo, (typeof EDITABLE_FIELDS)[number]> & { guardianContacts: Contact[] };

function InfoForm({ client, patientId, onCancel, onSaved, onError }: {
  client: ClientInfo; patientId: string; onCancel: () => void;
  onSaved: (data: { client: ClientInfo; grant: AssistantClientGrant }) => void; onError: (err: unknown) => void;
}) {
  const [draft, setDraft] = useState<InfoDraft>(() => ({
    ...Object.fromEntries(EDITABLE_FIELDS.map((key) => [key, key === 'dob' ? formatDateUS(client[key]) : client[key] || ''])) as Omit<InfoDraft, 'guardianContacts'>,
    guardianContacts: (client.guardianContacts || []).map((c) => ({ ...c })),
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (key: keyof Omit<InfoDraft, 'guardianContacts'>, label: string, props: { required?: boolean; placeholder?: string; maxLength?: number; type?: string } = {}) => (
    <Field key={key} label={label}><input style={input} value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} {...props} /></Field>
  );
  const contactField = (index: number, key: keyof Contact, label: string, props: { required?: boolean; type?: string } = {}) => (
    <Field label={label}><input style={input} value={draft.guardianContacts[index][key] || ''} maxLength={key === 'address' ? 300 : 200} onChange={(e) => setDraft((d) => ({ ...d, guardianContacts: d.guardianContacts.map((c, i) => i === index ? { ...c, [key]: e.target.value } : c) }))} {...props} /></Field>
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const dob = parseUSDate(draft.dob);
    if (!dob) { setError('Enter a valid date of birth in MM/DD/YYYY format.'); return; }
    setSaving(true); setError('');
    try {
      const result = await readResponse<{ client: ClientInfo; grant: AssistantClientGrant }>(await authedFetch(clientUrl(patientId), {
        method: 'PATCH', body: JSON.stringify({ ...draft, dob, revision: client.revision }),
      }));
      onSaved(result);
    } catch (err) { setError(message(err)); onError(err); }
    finally { setSaving(false); }
  };
  return <form onSubmit={submit} style={{ ...card, marginTop: 18 }}>
    <h2 style={subheading}>Edit client information</h2>
    <fieldset disabled={saving} style={fieldset}>
      <div style={grid}>
        {field('name', 'Client name', { required: true, maxLength: 200 })}
        {field('dob', 'Date of birth (MM/DD/YYYY)', { required: true, placeholder: 'MM/DD/YYYY', maxLength: 10 })}
        {field('medicaidId', 'Medicaid ID', { maxLength: 25 })}
        {field('street', 'Street address', { maxLength: 200 })}
        {field('city', 'City', { maxLength: 100 })}
        {field('state', 'State', { placeholder: 'GA', maxLength: 2 })}
        {field('zip', 'ZIP code', { maxLength: 10 })}
        {field('physicianName', 'Attending physician', { maxLength: 200 })}
        {field('physicianPhone', 'Physician phone', { type: 'tel', maxLength: 60 })}
        {field('physicianFax', 'Physician fax', { type: 'tel', maxLength: 60 })}
      </div>
      <h3 style={{ ...subheading, marginTop: 24 }}>Parent, guardian, and responsible contacts</h3>
      <div style={{ display: 'grid', gap: 16 }}>
        {draft.guardianContacts.map((c, index) => <fieldset key={c.id} style={contactCard}>
          <legend>Contact {index + 1}</legend>
          <div style={grid}>
            {contactField(index, 'name', `Contact ${index + 1} name`, { required: true })}
            <Field label={`Contact ${index + 1} role`}><select style={select} value={c.role} onChange={(e) => setDraft((d) => ({ ...d, guardianContacts: d.guardianContacts.map((entry, i) => i === index ? { ...entry, role: e.target.value } : entry) }))}>
              {GUARDIAN_ROLES.map((role) => <option key={role}>{role}</option>)}
            </select></Field>
            {contactField(index, 'relationship', `Contact ${index + 1} relationship`)}
            {contactField(index, 'phone', `Contact ${index + 1} phone`, { type: 'tel' })}
            {contactField(index, 'email', `Contact ${index + 1} email`, { type: 'email' })}
            {contactField(index, 'address', `Contact ${index + 1} address`)}
          </div>
          {!(client.guardianContacts || []).some((saved) => saved.id === c.id) && <button type="button" className={`${btn} ${btnSm}`} style={{ marginTop: 12 }} onClick={() => setDraft((d) => ({ ...d, guardianContacts: d.guardianContacts.filter((contact) => contact.id !== c.id) }))}>Remove unsaved contact</button>}
        </fieldset>)}
      </div>
      <button type="button" className={btn} style={{ marginTop: 12 }} onClick={() => setDraft((d) => ({ ...d, guardianContacts: [...d.guardianContacts, { id: crypto.randomUUID(), role: 'Parent', name: '', relationship: '', phone: '', email: '', address: '' }] }))}><Plus size={15} /> Add contact</button>
      {error && <div role="alert" style={errorBox}>{error}</div>}
      <div style={{ ...row, marginTop: 20 }}><button className={btnPrimary} type="submit">{saving ? 'Saving…' : 'Save client information'}</button><button className={btn} type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>;
}

function UploadForm({ patientId, onUploaded, onError }: { patientId: string; onUploaded: (doc: DocumentInfo) => void; onError: (err: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Other');
  const [date, setDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const docDate = parseUSDate(date);
    if (!file) { setError('Choose a document to upload.'); return; }
    if (!docDate) { setError('Enter a valid document date in MM/DD/YYYY format.'); return; }
    if (file.size >= MAX_DOC_BYTES) { setError('The document must be smaller than 20 MB.'); return; }
    setSaving(true); setError('');
    try {
      const body = new FormData();
      body.set('file', file); body.set('title', title.trim()); body.set('category', category); body.set('docDate', docDate);
      const result = await readResponse<{ document: DocumentInfo }>(await authedFetch(`${clientUrl(patientId)}/documents`, { method: 'POST', body }));
      onUploaded(result.document); setOpen(false); setTitle(''); setDate(''); setFile(null); setCategory('Other');
    } catch (err) { setError(message(err)); onError(err); }
    finally { setSaving(false); }
  };
  if (!open) return <button className={btnPrimary} onClick={() => setOpen(true)}><FileUp size={15} /> Upload document</button>;
  return <form onSubmit={submit} style={contactCard}>
    <fieldset disabled={saving} style={fieldset}>
      <div style={grid}>
        <Field label="Document file (PDF, image, or Word; under 20 MB)"><input type="file" required accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" onChange={(e) => { const chosen = e.target.files?.[0] || null; setFile(chosen); if (chosen && !title) setTitle(chosen.name); }} style={input} /></Field>
        <Field label="Document title"><input required maxLength={200} style={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Document category"><select style={select} value={category} onChange={(e) => setCategory(e.target.value)}>{DOC_CATEGORY_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.categories.map((c) => <option key={c}>{c}</option>)}</optgroup>)}</select></Field>
        <Field label="Document date (MM/DD/YYYY)"><input required placeholder="MM/DD/YYYY" maxLength={10} style={input} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {error && <div role="alert" style={errorBox}>{error}</div>}
      <div style={{ ...row, marginTop: 16 }}><button className={btnPrimary} type="submit">{saving ? 'Uploading…' : 'Save document'}</button><button className={btn} type="button" onClick={() => { setOpen(false); setError(''); }}>Cancel</button></div>
    </fieldset>
  </form>;
}

/** Text dates have a fixed US display regardless of browser locale. */
export function parseUSDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, month, day, year] = match;
  if (+year < 1900 || +year > 9999) return null;
  const date = new Date(+year, +month - 1, +day);
  if (date.getFullYear() !== +year || date.getMonth() !== +month - 1 || date.getDate() !== +day) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function formatBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#475569' }}><span>{label}</span>{children}</label>; }
function Value({ label, value }: { label: string; value?: string }) { return <div><div style={muted}>{label}</div><div style={{ marginTop: 4, overflowWrap: 'anywhere' }}>{value || 'Not on file'}</div></div>; }
const NAVY = '#1a3a5c';
const page: CSSProperties = { maxWidth: 1150, margin: '0 auto', padding: '24px 16px 48px' };
const card: CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 12, padding: 22, background: 'white', color: '#334155' };
const heading: CSSProperties = { margin: '0 0 8px', fontSize: 26, color: NAVY, lineHeight: 1.3 };
const subheading: CSSProperties = { margin: '0 0 18px', fontSize: 18, color: NAVY };
const muted: CSSProperties = { color: '#64748b', fontSize: 13, lineHeight: 1.6, margin: 0 };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 18 };
const input: CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 7, padding: '10px 12px', font: 'inherit', width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'white', color: '#334155' };
const badge: CSSProperties = { borderRadius: 20, padding: '5px 10px', fontSize: 12, color: NAVY, background: '#eff6ff' };
const contactCard: CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, margin: 0, minWidth: 0, lineHeight: 1.7 };
const fieldset: CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0 };
const errorBox: CSSProperties = { margin: '16px 0', padding: 14, borderRadius: 8, background: '#fef2f2', color: '#991b1b' };
const noticeBox: CSSProperties = { margin: '0 0 16px', padding: 14, borderRadius: 8, background: '#eff6ff', color: NAVY };

const select: CSSProperties = withSelectChevron(input);
