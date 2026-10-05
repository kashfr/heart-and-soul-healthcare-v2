import styles from './Button.module.css';

/**
 * Class names for the shared button look (see Button.module.css). Compose
 * them where a row of actions should match the rest of the portal:
 *
 *   btn          plain action (white, slate border)
 *   btnPrimary   the one action the row is for (navy)
 *   btnDanger    delete, remove, cancel-a-request and the like (red ink)
 *   btnIcon      a square icon-only button; combine: `${btn} ${btnIcon}`
 *   btnSm        a shorter button for dense rows; combine: `${btn} ${btnSm}`
 *
 * Where each goes:
 *   - Page headers, section actions and modal footers: full size. Cancel is
 *     `btn`, the submit or main action is `btnPrimary`. One primary per row.
 *   - Actions inside table rows, cards and lists: add `btnSm`.
 *   - Icon-only row actions (edit pencil, trash): `${btn} ${btnIcon} ${btnSm}`,
 *     or `${btnDanger} ${btnIcon} ${btnSm}`. Give them aria-label and title.
 *   - Destructive or withdrawing actions: `btnDanger`, never a red fill.
 *
 * Not for: close X icons, text links, tabs, filter chips and toggles,
 * search-result or picker rows, menu items, and the public marketing site.
 * Those keep their own look.
 */
export const btn = styles.btn;
export const btnPrimary = `${styles.btn} ${styles.primary}`;
export const btnDanger = `${styles.btn} ${styles.danger}`;
export const btnIcon = styles.icon;
export const btnSm = styles.sm;
