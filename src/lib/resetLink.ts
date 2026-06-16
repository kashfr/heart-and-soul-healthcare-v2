/**
 * Rewrites a Firebase password-reset link so it points at OUR branded
 * /reset-password page instead of Firebase's default hosted action handler.
 *
 * Firebase's default page, after a successful reset, just shows a generic
 * "your password was changed" message with no clear way back to the portal —
 * which left nurses stranded. Our page sets the new password and then signs
 * them straight in (falling back to the login page).
 *
 * The Firebase link carries the one-time `oobCode`; that's all our page needs
 * (the client SDK already has the project apiKey). If the link can't be parsed
 * for any reason, we fall back to the original Firebase link so the reset path
 * never breaks.
 */
const RESET_PAGE = 'https://www.heartandsoulhc.org/reset-password';

export function toAppResetLink(firebaseLink: string): string {
  try {
    const code = new URL(firebaseLink).searchParams.get('oobCode');
    if (code) return `${RESET_PAGE}?oobCode=${encodeURIComponent(code)}`;
  } catch {
    // fall through
  }
  return firebaseLink;
}
