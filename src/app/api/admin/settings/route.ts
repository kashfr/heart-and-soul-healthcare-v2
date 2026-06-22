import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import {
  mergeWithDefaults,
  validateSettings,
  SettingsValidationError,
} from '@/lib/settings';

/**
 * Org-wide settings stored at `settings/global`. One doc, one source
 * of truth. Read by every signed-in user; written by admin only.
 *
 * GET /api/admin/settings → returns the merged-with-defaults shape so
 * the caller never has to worry about missing fields. If the doc
 * doesn't exist yet (fresh install) this returns the pure defaults.
 *
 * PUT /api/admin/settings → validates the payload, merges with the
 * existing doc, and writes it back with audit fields (updatedAt /
 * updatedBy). Admin only — supervisors don't get to change org-wide
 * defaults that would affect everyone.
 */

const SETTINGS_DOC_PATH = 'settings/global';

export async function GET(request: Request) {
  // Any signed-in staff member (incl. the VA) can read settings — the client
  // hook needs the values to render UI defaults (branding, etc.).
  try {
    await requireRole(request, ['admin', 'supervisor', 'nurse', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const snap = await adminDb().doc(SETTINGS_DOC_PATH).get();
  const settings = mergeWithDefaults(snap.exists ? snap.data() : null);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  let next;
  try {
    next = validateSettings(body);
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    throw err;
  }

  // Audit who last touched the doc + when. Useful when something looks
  // off and we want to know who toggled what.
  await adminDb()
    .doc(SETTINGS_DOC_PATH)
    .set(
      {
        ...next,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
        updatedByName: caller.profile.displayName || caller.email || '',
      },
      { merge: false }, // overwrite — we just merged client-side via validateSettings
    );

  return NextResponse.json({ settings: next });
}
