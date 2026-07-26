// Pure content builder for the "GAPP provider list" email sent to a family
// when no partner agency can take their referral. Split from the sender (which
// is server-only) so the copy is unit-testable AND so the settings page can
// render a live preview client-side with no round-trip.
//
// The copy itself now lives in settings (`emails.providerList`, editable at
// /admin/settings); this module only assembles it. Defaults live in settings.ts.
//
// Copy rules: family-facing and warm; no PHI in the subject (enforced at save
// time — validateSettings rejects {{childName}} there); and NO em or en dashes
// anywhere (the user's writing style: sent under the org's name, dashes read as
// AI-written). The test suite enforces the dash rule on the DEFAULT copy;
// admin-entered copy can't be checked at build time, so the settings form warns.

import { PROVIDER_LIST_URL } from '../shareLink';
import { DEFAULT_SETTINGS, type ProviderListEmailSettings } from '../settings';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(full?: string): string {
  const n = (full || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

interface Vars {
  childName: string;
  phone: string;
}

function substitute(text: string, vars: Partial<Vars>): string {
  let out = text;
  if (vars.childName !== undefined) {
    out = out.replace(/\{\{\s*childName\s*\}\}/g, vars.childName);
  }
  if (vars.phone !== undefined) {
    out = out.replace(/\{\{\s*phone\s*\}\}/g, vars.phone);
  }
  return out;
}

/**
 * Escape admin-entered copy FIRST, then substitute already-escaped values.
 * That ordering is what makes the copy inert: `{{`/`}}` survive escaping so
 * substitution still works, but any markup the admin typed is neutralized
 * before values land in it.
 */
function fillHtml(template: string, vars: Vars): string {
  return substitute(escapeHtml(template), vars);
}

/** Blank line = paragraph break; single newlines become <br />. */
function paragraphs(template: string, vars: Vars): string {
  return template
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p style="margin:0 0 12px;">${fillHtml(chunk, vars).replace(/\n/g, '<br />')}</p>`)
    .join('\n      ');
}

export interface ProviderListEmailInput {
  /** Family contact name for the greeting (falls back to "Hello,"). */
  familyName?: string;
  /** The child the referral is about (falls back to "your child"). */
  childName?: string;
  /** Overrides the callback number from settings. Rarely needed. */
  phone?: string;
}

export interface ProviderListEmailContent {
  subject: string;
  html: string;
}

export function buildProviderListEmail(
  input: ProviderListEmailInput,
  copy: ProviderListEmailSettings = DEFAULT_SETTINGS.emails.providerList
): ProviderListEmailContent {
  const rawPhone = input.phone || copy.phone;
  const vars: Vars = {
    childName: input.childName ? escapeHtml(input.childName) : 'your child',
    phone: escapeHtml(rawPhone),
  };
  const greetName = firstName(input.familyName);
  const greeting = greetName ? `Hi ${escapeHtml(greetName)},` : 'Hello,';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:600px;line-height:1.55;">
      <p style="margin:0 0 12px;">${greeting}</p>
      ${paragraphs(copy.intro, vars)}
      ${paragraphs(copy.explainer, vars)}
      <p style="margin:0 0 16px;">
        <a href="${PROVIDER_LIST_URL}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">${fillHtml(copy.ctaLabel, vars)}</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">If the button does not work, copy and paste this link into your browser:<br />${PROVIDER_LIST_URL}</p>
      ${paragraphs(copy.closing, vars)}
      <p style="margin:14px 0 0;color:#6b7280;font-size:13px;">${fillHtml(copy.signOff, vars)}</p>
    </div>`;

  return {
    // Subject is a plain-text header, NOT html — escaping it would leak
    // entities like &#39; into the inbox. childName is deliberately not
    // substituted here (PHI); validateSettings rejects it in the subject.
    subject: substitute(copy.subject, { phone: rawPhone }),
    html,
  };
}

/** Em/en dashes read as AI-written, so the settings form flags them. */
export const DASH_RE = /[–—]/;

/** Editable fields containing a dash, for the settings-form warning. */
export function findDashFields(copy: ProviderListEmailSettings): (keyof ProviderListEmailSettings)[] {
  return (Object.keys(copy) as (keyof ProviderListEmailSettings)[]).filter((k) =>
    DASH_RE.test(copy[k])
  );
}
