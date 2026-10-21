/**
 * The logo at the top of every email we send.
 *
 * PNG, not the site's WebP: desktop Outlook can't render WebP. A white (not
 * transparent) background keeps the dark wordmark readable when a mail app
 * switches to dark mode. The URL is absolute because mail clients fetch it
 * from the live site; the file ships with the same deploy as these templates.
 */
export const EMAIL_LOGO_URL = 'https://www.heartandsoulhc.org/images/logo-2026-email.png';

// 440x116 source shown at 180px wide, so it stays sharp on retina screens.
const IMG = `<img src="${EMAIL_LOGO_URL}" width="180" height="47" alt="Heart and Soul Healthcare" style="display:block;width:180px;height:auto;border:0;outline:none;text-decoration:none;">`;

/** First row of the table-layout templates (inside the 560px card). */
export function emailLogoRow(): string {
  return `<tr><td style="padding:24px 32px 4px;">${IMG}</td></tr>`;
}

/** Top of the simple div-layout templates. */
export function emailLogoBlock(): string {
  return `<div style="margin:0 0 20px;">${IMG}</div>`;
}
