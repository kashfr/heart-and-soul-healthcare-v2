import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { sendProviderListEmail } from '@/lib/emails/providerList';
import { validateSettings, SettingsValidationError, type ProviderListEmailSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send the caller a test copy of the family-facing GAPP provider-list email so
 * the wording can be checked in a real inbox before it ever reaches a family.
 *
 * SAFETY: the recipient is taken from the authenticated caller's own account
 * and is NEVER read from the request body. There is deliberately no way to aim
 * this route at an arbitrary address, so it can't be turned into a sender for
 * someone else's inbox.
 *
 * An optional `copy` draft lets the settings page test unsaved edits; it goes
 * through the same validator as a real save, so a test can't bypass the length
 * caps or the no-PHI-in-subject rule.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!caller.email) {
    return NextResponse.json(
      { error: 'Your account has no email address on file, so there is nowhere to send the test.' },
      { status: 400 }
    );
  }

  let body: { copy?: unknown; childName?: unknown; familyName?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* no body is fine — test the saved copy with sample names */
  }

  let copy: ProviderListEmailSettings | undefined;
  if (body.copy !== undefined) {
    try {
      copy = validateSettings({ emails: { providerList: body.copy } }).emails.providerList;
    } catch (err) {
      if (err instanceof SettingsValidationError) {
        return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
      }
      throw err;
    }
  }

  // Sample names so the greeting and {{childName}} render as a family would see
  // them, rather than going out blank.
  const familyName = typeof body.familyName === 'string' && body.familyName.trim()
    ? body.familyName.trim()
    : caller.profile?.displayName || 'Test Parent';
  const childName = typeof body.childName === 'string' && body.childName.trim()
    ? body.childName.trim()
    : 'Sample Child';

  const result = await sendProviderListEmail({
    to: caller.email,
    familyName,
    childName,
    copy,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Could not send the test email.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: caller.email });
}
