// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every <select> in the portal must carry the site chevron (see
 * selectChevron.ts). This has shipped wrong repeatedly, always the same way:
 * a <select> styled with a text-input style const or an inline object. The
 * guard reads every component and fails on any <select> whose style/class
 * does not come from a chevron-styled source, naming the file and line.
 *
 * Accepted: `style={select…}` / `style={{ ...select… }}` / `withSelectChevron(…)`
 * (any expression mentioning "select" or "Chevron"), or a className that
 * mentions "select" (the marketing `form-select` and the note forms'
 * `styles.select`, both chevron-styled in CSS).
 */
const ROOT = join(__dirname, '..');
/** Components that receive an already chevron-styled style through a prop
 *  and pass it straight to a <select>. Empty today: MonthPicker applies
 *  withSelectChevron itself. Extend only for that pattern. */
const STYLE_FROM_PROP = new Set<string>([]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return name.endsWith('.tsx') && !name.endsWith('.test.tsx') ? [full] : [];
  });
}

function offenders(): string[] {
  const out: string[] = [];
  for (const file of tsxFiles(ROOT)) {
    const rel = relative(ROOT, file);
    if (STYLE_FROM_PROP.has(rel)) continue;
    const src = readFileSync(file, 'utf8');
    // An arrow in an inline handler (`=>`) must not end the tag early.
    const re = /<select\b((?:=>|[^>])*?)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const attrs = m[1];
      // A bare `<select>` only ever appears in prose (comments); JSX always has attributes.
      if (!attrs.trim()) continue;
      const styled = /style=\{[^}]*?(select|Chevron)/i.test(attrs) || /style=\{\{[\s\S]*?(select|Chevron)/i.test(attrs);
      const classed = /className=\{?[^}\n]*select/i.test(attrs);
      if (!styled && !classed) out.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  return out;
}

describe('select chevron guard', () => {
  it('styles every <select> through withSelectChevron or a chevron-styled class', () => {
    expect(offenders()).toEqual([]);
  });
});
