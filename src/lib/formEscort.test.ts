// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escortToField } from './formEscort';

describe('escortToField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('focuses the first control inside the target', () => {
    document.body.innerHTML = '<div id="f"><label>Name</label><input id="i" /></div>';
    escortToField('f');
    vi.advanceTimersByTime(400);
    expect(document.activeElement?.id).toBe('i');
  });

  it('focuses the target itself when it holds nothing focusable (a notice panel)', () => {
    document.body.innerHTML = '<div id="panel"><p>We cannot accept this referral.</p></div>';
    escortToField('panel');
    vi.advanceTimersByTime(400);
    const panel = document.getElementById('panel')!;
    expect(panel.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(panel);
  });

  it('keeps an existing tabindex', () => {
    document.body.innerHTML = '<div id="panel" tabindex="0"><p>Note</p></div>';
    escortToField('panel');
    vi.advanceTimersByTime(400);
    expect(document.getElementById('panel')!.getAttribute('tabindex')).toBe('0');
  });

  it('does not animate the scroll when the user prefers reduced motion', () => {
    document.body.innerHTML = '<div id="f"><input /></div>';
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    escortToField('f');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
  });

  it('aligns a target taller than most of the screen to the top, so its first lines show', () => {
    document.body.innerHTML = '<div id="panel"><p>Long note</p></div>';
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    const panel = document.getElementById('panel')!;
    panel.getBoundingClientRect = () => ({ height: window.innerHeight } as DOMRect);
    escortToField('panel');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
