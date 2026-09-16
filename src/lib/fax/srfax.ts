import 'server-only';

/**
 * SRFax provider adapter. The only file that knows the vendor's wire format,
 * so swapping fax providers later is a contained change. Every call is an
 * HTTPS POST of JSON to one endpoint; auth is the account number + password
 * (an "Additional Login" on the agency account, scoped Send/Receive).
 *
 * Self-gating: when SRFAX_ACCESS_ID / SRFAX_ACCESS_PWD are absent every
 * function returns { configured: false } and callers fall back to the manual
 * path (the PDF is still generated; the office faxes it by hand).
 *
 * Env: SRFAX_ACCESS_ID, SRFAX_ACCESS_PWD, SRFAX_FAX_NUMBER (10 digits, the
 * agency's SRFax number, used as caller ID), SRFAX_SENDER_EMAIL.
 */

const ENDPOINT = 'https://www.srfax.com/SRF_SecWebSvc.php';

export interface SrfaxConfig {
  accessId: string;
  accessPwd: string;
  faxNumber: string; // 10 digits
  senderEmail: string;
}

export function srfaxConfig(): SrfaxConfig | null {
  const accessId = process.env.SRFAX_ACCESS_ID || '';
  const accessPwd = process.env.SRFAX_ACCESS_PWD || '';
  const faxNumber = (process.env.SRFAX_FAX_NUMBER || '').replace(/\D/g, '');
  const senderEmail = process.env.SRFAX_SENDER_EMAIL || 'info@heartandsoulhc.org';
  if (!accessId || !accessPwd || faxNumber.length !== 10) return null;
  return { accessId, accessPwd, faxNumber, senderEmail };
}

export function srfaxConfigured(): boolean {
  return srfaxConfig() !== null;
}

interface SrfaxEnvelope {
  Status: 'Success' | 'Failed';
  Result: unknown;
}

async function call(cfg: SrfaxConfig, action: string, params: Record<string, string>): Promise<SrfaxEnvelope> {
  const body = {
    action,
    access_id: cfg.accessId,
    access_pwd: cfg.accessPwd,
    sResponseFormat: 'JSON',
    ...params,
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: SrfaxEnvelope;
  try {
    parsed = JSON.parse(text) as SrfaxEnvelope;
  } catch {
    throw new Error(`SRFax ${action}: non-JSON response (${res.status}).`);
  }
  if (!res.ok) throw new Error(`SRFax ${action}: HTTP ${res.status}.`);
  return parsed;
}

export interface QueueFaxResult {
  configured: boolean;
  ok: boolean;
  faxDetailsId?: string;
  error?: string;
}

/** Send one PDF to one number. Returns the SRFax job id on success. */
export async function srfaxQueueFax(params: {
  toTenDigits: string;
  fileName: string;
  pdf: Buffer;
  notifyUrl?: string;
  accountCode?: string; // our reference (max 20 chars)
  fromHeader?: string;
}): Promise<QueueFaxResult> {
  const cfg = srfaxConfig();
  if (!cfg) return { configured: false, ok: false, error: 'Fax is not configured.' };
  try {
    const r = await call(cfg, 'Queue_Fax', {
      sCallerID: cfg.faxNumber,
      sSenderEmail: cfg.senderEmail,
      sFaxType: 'SINGLE',
      sToFaxNumber: `1${params.toTenDigits}`,
      sRetries: '6',
      sFileName_1: params.fileName,
      sFileContent_1: params.pdf.toString('base64'),
      ...(params.notifyUrl ? { sNotifyURL: params.notifyUrl } : {}),
      ...(params.accountCode ? { sAccountCode: params.accountCode.slice(0, 20) } : {}),
      ...(params.fromHeader ? { sFaxFromHeader: params.fromHeader.slice(0, 50) } : {}),
    });
    if (r.Status !== 'Success') return { configured: true, ok: false, error: String(r.Result || 'Queue_Fax failed.') };
    return { configured: true, ok: true, faxDetailsId: String(r.Result) };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface FaxStatusResult {
  configured: boolean;
  ok: boolean;
  sentStatus?: string; // 'In Progress' | 'Sent' | 'Failed' | 'Sending Email'
  dateSent?: string;
  errorCode?: string;
  pages?: string;
  error?: string;
}

export async function srfaxGetFaxStatus(faxDetailsId: string): Promise<FaxStatusResult> {
  const cfg = srfaxConfig();
  if (!cfg) return { configured: false, ok: false };
  try {
    const r = await call(cfg, 'Get_FaxStatus', { sFaxDetailsID: faxDetailsId });
    if (r.Status !== 'Success') return { configured: true, ok: false, error: String(r.Result || '') };
    const d = (r.Result || {}) as Record<string, string>;
    return { configured: true, ok: true, sentStatus: d.SentStatus, dateSent: d.DateSent, errorCode: d.ErrorCode, pages: d.Pages };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface InboundFax {
  fileName: string; // "YYYYMMDDHHMMSS-XXXX-XX_X|<id>"
  faxDetailsId: string;
  receiveStatus: string;
  date: string;
  epochTime: number;
  callerId: string;
  remoteId: string;
  pages: number;
  viewedStatus: string; // 'Y' | 'N'
}

/** Inbound faxes for a YYYYMMDD range (inclusive), unread only by default. */
export async function srfaxGetInbox(params: { startYmd: string; endYmd: string; unreadOnly?: boolean }): Promise<{ configured: boolean; ok: boolean; faxes: InboundFax[]; error?: string }> {
  const cfg = srfaxConfig();
  if (!cfg) return { configured: false, ok: false, faxes: [] };
  try {
    const r = await call(cfg, 'Get_Fax_Inbox', {
      sPeriod: 'RANGE',
      sStartDate: params.startYmd,
      sEndDate: params.endYmd,
      sViewedStatus: params.unreadOnly === false ? 'ALL' : 'UNREAD',
      sIncludeSubUsers: 'Y',
    });
    if (r.Status !== 'Success') return { configured: true, ok: false, faxes: [], error: String(r.Result || '') };
    const rows = Array.isArray(r.Result) ? (r.Result as Record<string, unknown>[]) : [];
    const faxes = rows.map((d) => {
      const fileName = String(d.FileName || '');
      const id = fileName.includes('|') ? fileName.split('|').pop() || '' : '';
      return {
        fileName,
        faxDetailsId: id,
        receiveStatus: String(d.ReceiveStatus || ''),
        date: String(d.Date || ''),
        epochTime: Number(d.EpochTime || 0),
        callerId: String(d.CallerID || ''),
        remoteId: String(d.RemoteID || ''),
        pages: Number(d.Pages || 0),
        viewedStatus: String(d.ViewedStatus || ''),
      };
    });
    return { configured: true, ok: true, faxes };
  } catch (err) {
    return { configured: true, ok: false, faxes: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Download one inbound fax as a PDF buffer. */
export async function srfaxRetrieveInbound(fileName: string, markViewed: boolean): Promise<{ ok: boolean; pdf?: Buffer; error?: string }> {
  const cfg = srfaxConfig();
  if (!cfg) return { ok: false, error: 'Fax is not configured.' };
  try {
    const r = await call(cfg, 'Retrieve_Fax', {
      sFaxFileName: fileName,
      sDirection: 'IN',
      sFaxFormat: 'PDF',
      sMarkasViewed: markViewed ? 'Y' : 'N',
    });
    if (r.Status !== 'Success') return { ok: false, error: String(r.Result || '') };
    return { ok: true, pdf: Buffer.from(String(r.Result), 'base64') };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
