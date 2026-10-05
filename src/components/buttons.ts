import styles from './Button.module.css';

/**
 * Class names for the shared button look (see Button.module.css). Compose
 * them where a row of actions should match the rest of the portal:
 *
 *   btn          plain action (white, slate border)
 *   btnPrimary   the one action the row is for (navy)
 *   btnDanger    delete and the like (red ink)
 *   btnIcon      a square icon-only button; combine: `${btn} ${btnIcon}`
 *   btnSm        a shorter button for dense rows
 */
export const btn = styles.btn;
export const btnPrimary = `${styles.btn} ${styles.primary}`;
export const btnDanger = `${styles.btn} ${styles.danger}`;
export const btnIcon = styles.icon;
export const btnSm = styles.sm;
