// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { isTextLikeInput, nextFormControl, shouldAdvanceOnEnter } from './enterToNext';

const form = (html: string): HTMLFormElement => {
  document.body.innerHTML = `<form id="f">${html}</form>`;
  return document.getElementById('f') as HTMLFormElement;
};
const byId = (id: string) => document.getElementById(id)!;

describe('shouldAdvanceOnEnter', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('advances from every single-line text-like input type', () => {
    for (const type of ['text', 'email', 'tel', 'number', 'date', 'search', 'url']) {
      form(`<input id="i" type="${type}" />`);
      expect(shouldAdvanceOnEnter('Enter', false, byId('i'))).toBe(true);
    }
  });

  it('treats an input with no type as text', () => {
    form('<input id="i" />');
    expect(isTextLikeInput(byId('i'))).toBe(true);
  });

  it('leaves textareas, checkboxes, radios, selects and buttons alone', () => {
    form(`
      <textarea id="t"></textarea>
      <input id="c" type="checkbox" />
      <input id="r" type="radio" />
      <select id="s"><option>a</option></select>
      <button id="b" type="button">Go</button>`);
    for (const id of ['t', 'c', 'r', 's', 'b']) {
      expect(shouldAdvanceOnEnter('Enter', false, byId(id))).toBe(false);
    }
  });

  it('ignores Enter while an IME composition is open', () => {
    form('<input id="i" type="text" />');
    expect(shouldAdvanceOnEnter('Enter', true, byId('i'))).toBe(false);
  });

  it('ignores every other key', () => {
    form('<input id="i" type="text" />');
    expect(shouldAdvanceOnEnter('Tab', false, byId('i'))).toBe(false);
    expect(shouldAdvanceOnEnter('a', false, byId('i'))).toBe(false);
  });
});

describe('nextFormControl', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('moves to the next control in DOM order, whatever kind it is', () => {
    const f = form(`
      <input id="a" type="text" />
      <a id="link" href="#x">A link</a>
      <select id="b"><option>x</option></select>
      <input id="c" type="checkbox" />
      <textarea id="d"></textarea>`);
    expect(nextFormControl(f, byId('a'))?.id).toBe('b');
    expect(nextFormControl(f, byId('b'))?.id).toBe('c');
    expect(nextFormControl(f, byId('c'))?.id).toBe('d');
  });

  it('skips disabled, hidden, tabindex=-1 and marked controls', () => {
    const f = form(`
      <input id="a" type="text" />
      <input type="hidden" name="h" />
      <input id="dis" type="text" disabled />
      <button id="neg" type="button" tabindex="-1">Hidden</button>
      <div hidden><input id="inHidden" type="text" /></div>
      <button id="prev" type="button" data-enter-skip>Previous Step</button>
      <button id="submit" type="button">Submit Referral</button>`);
    expect(nextFormControl(f, byId('a'))?.id).toBe('submit');
  });

  it('lands on the Submit button from the last field', () => {
    const f = form(`
      <input id="last" type="tel" />
      <div><button id="prev" type="button" data-enter-skip>Previous Step</button>
      <button id="submit" type="button">Submit Referral</button></div>`);
    expect(nextFormControl(f, byId('last'))?.id).toBe('submit');
  });

  it('returns null when nothing follows or the start is not in the form', () => {
    const f = form('<input id="only" type="text" />');
    expect(nextFormControl(f, byId('only'))).toBeNull();
    const stray = document.createElement('input');
    expect(nextFormControl(f, stray)).toBeNull();
  });

  it('wired to a form, Enter moves focus and is prevented, so nothing submits', () => {
    const f = form(`
      <input id="a" type="text" />
      <input id="b" type="email" />`);
    let submitted = false;
    f.addEventListener('submit', (e) => { submitted = true; e.preventDefault(); });
    f.addEventListener('keydown', (e) => {
      if (!shouldAdvanceOnEnter(e.key, e.isComposing, e.target)) return;
      e.preventDefault();
      nextFormControl(f, e.target as Element)?.focus();
    });
    byId('a').focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    byId('a').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('b');
    expect(submitted).toBe(false);
  });
});
