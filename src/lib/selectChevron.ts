import type { CSSProperties } from 'react';

/**
 * THE site-standard <select> look: native chevron suppressed, replaced with
 * the same inline-SVG chevron the submissions filters / contact form use.
 *
 * Every <select> must go through this (or a local const built from it) —
 * styling a <select> with a plain text-input style leaves the browser's
 * default chevron, which mismatches the rest of the portal. This exact
 * mistake has shipped repeatedly; wrap the page's input style instead:
 *
 *   const select = withSelectChevron(input);
 *   <select style={select}>…</select>
 */
export function withSelectChevron(base: CSSProperties): CSSProperties {
  return {
    ...base,
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    paddingRight: 34,
    cursor: 'pointer',
    background:
      "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 11px center",
    backgroundSize: '14px',
  };
}
