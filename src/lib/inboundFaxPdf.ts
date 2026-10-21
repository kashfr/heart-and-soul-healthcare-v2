import 'server-only';
import { adminBucket } from './firebaseAdmin';
import { srfaxRetrieveInbound } from './fax/srfax';

/**
 * The bytes of an inbound fax recorded under verbalOrderInbound. Faxes the
 * sweep found on the SRFax line are fetched from SRFax by file name; faxes
 * someone added by hand (received on another line, or on paper) were stored
 * in Cloud Storage when they were added, so those are read from there.
 */
export async function readInboundFaxBytes(
  d: { fileName?: unknown; storagePath?: unknown },
  markViewed: boolean,
): Promise<{ ok: boolean; pdf?: Buffer; error?: string }> {
  const storagePath = String(d.storagePath || '');
  if (storagePath) {
    try {
      const [bytes] = await adminBucket().file(storagePath).download();
      return { ok: true, pdf: bytes };
    } catch (err) {
      console.error('Inbound fax read failed:', err);
      return { ok: false, error: 'Could not read the stored fax.' };
    }
  }
  const fileName = String(d.fileName || '');
  if (!fileName) return { ok: false, error: 'Fax not found.' };
  return srfaxRetrieveInbound(fileName, markViewed);
}

/** Inbound fax ids: SRFax's numeric FaxDetailsID, or an upload's own id. */
export const INBOUND_FAX_ID_RE = /^(up_)?[A-Za-z0-9_-]{1,40}$/;
