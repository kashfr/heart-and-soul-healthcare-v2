import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

const addDocMock = vi.fn(async () => ({}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: (...args: unknown[]) => addDocMock(...(args as [])),
  serverTimestamp: vi.fn(() => 'ts'),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/app/actions', () => ({ processReferralSubmission: vi.fn(async () => ({ success: true })) }));
vi.mock('@/components/animations', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition']);
  const pass = (tag: string) =>
    function Passthrough({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) {
      const domProps = Object.fromEntries(Object.entries(rest).filter(([k]) => !MOTION_PROPS.has(k)));
      return React.createElement(tag, domProps, children);
    };
  return {
    motion: { div: pass('div'), p: pass('p') },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import ReferralPage from './page';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const change = (id: string, value: string) => fireEvent.change($(id), { target: { value } });
const settle = () => act(() => { vi.advanceTimersByTime(400); });
const pressEnter = (el: HTMLElement) => {
  el.focus();
  return fireEvent.keyDown(el, { key: 'Enter' });
};
const BANNER = 'Please complete the following required fields:';

function fillStep1(program = 'gapp', dob = '2015-03-01') {
  change('programInterest', program);
  change('clientCounty', 'Fulton');
  change('clientFirstName', 'Test');
  change('clientLastName', 'Child');
  change('clientDOB', dob);
  change('clientPhone', '4045550100');
  change('clientSecondaryPhone', '4045550101');
  change('clientEmail', 'family@example.com');
  fireEvent.click(screen.getByRole('button', { name: /Next Step/ }));
}

// GAPP step 2 with every required answer except the ones a test leaves out.
function fillGappStep2(opts: { equipment?: string[]; staff?: 'yes' | 'no'; paid?: 'yes' | 'no'; name?: string } = {}) {
  change('referralSource', 'family');
  if (opts.name !== '') change('referrerName', opts.name ?? 'Parent Name');
  change('relationship', 'parent');
  fireEvent.click(screen.getByLabelText('Autism or autism spectrum disorder'));
  for (const label of opts.equipment ?? []) fireEvent.click(screen.getByLabelText(label));
  change('behaviorRisk', 'none');
  change('seekingPaidCaregiver', opts.paid ?? 'yes');
  if ((opts.paid ?? 'yes') === 'yes') change('careNeeds', 'personal');
  change('wantsAgencyStaff', opts.staff ?? 'yes');
}

beforeEach(() => {
  vi.useFakeTimers();
  addDocMock.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Referral form: Return / Go never submits', () => {
  it('moves to the next field on step 1 and never runs the validation sweep', () => {
    render(<ReferralPage />);
    const prevented = !pressEnter($('clientFirstName'));
    expect(prevented).toBe(true);
    expect(document.activeElement?.id).toBe('clientLastName');
    pressEnter($('clientZip'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Next Step/ }));
    expect(screen.queryByText(BANNER)).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('on a complete step 2, Return in an optional field moves on and does not send the referral', () => {
    render(<ReferralPage />);
    fillStep1('now-comp');
    change('referralSource', 'family');
    change('referrerName', 'Parent Name');
    change('seekingPaidCaregiver', 'no');
    pressEnter($('physicianName'));
    expect(document.activeElement?.id).toBe('physicianOffice');
    pressEnter($('referrerName'));
    expect(document.activeElement?.id).toBe('referrerPhone');
    expect(addDocMock).not.toHaveBeenCalled();
    expect(screen.queryByText(BANNER)).toBeNull();
    // A deliberate click still sends it.
    fireEvent.click(screen.getByRole('button', { name: /Submit Referral/ }));
    expect(addDocMock).toHaveBeenCalledTimes(1);
  });

  it('has no hidden submit button left in the form', () => {
    render(<ReferralPage />);
    expect(document.querySelector('form button[type="submit"]')).toBeNull();
  });
});

describe('Referral form: blocked or incomplete attempts', () => {
  it('lists missing answers as links worded like the questions, and each link escorts to its field', () => {
    render(<ReferralPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next Step/ }));
    settle();
    expect(document.activeElement?.id).toBe('programInterest');
    const banner = screen.getByText(BANNER).parentElement!;
    const link = within(banner).getByRole('link', { name: 'Email Address' });
    fireEvent.click(link);
    settle();
    expect(document.activeElement?.id).toBe('clientEmail');
  });

  it('a stop that a blank equipment answer could lift escorts to the first missing field, not the refusal', () => {
    render(<ReferralPage />);
    fillStep1();
    fillGappStep2();
    expect($('ref-block-behavioral')).toBeTruthy();
    let messageAtScroll: string | null | undefined;
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      messageAtScroll = this.querySelector('[role="alert"]')?.textContent;
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit Referral/ }));
    // The outlines and messages are committed before the escort measures, so
    // the message is already inside the target when it scrolls.
    expect(messageAtScroll).toMatch(/check at least one/i);
    settle();
    // The equipment heading (question, hint and message) takes focus.
    expect(document.activeElement?.id).toBe('ref-field-equipment');
    expect(within($('ref-field-equipment')).getByRole('alert')).toBeTruthy();
    const banner = screen.getByText(BANNER).parentElement!;
    expect(within(banner).getByRole('link', { name: 'Which of these does your child need at home?' })).toBeTruthy();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('once those answers are in, a blocked Submit focuses the stop panel, which names the trigger and a way forward', () => {
    render(<ReferralPage />);
    fillStep1();
    fillGappStep2({ equipment: ['Needs help with feeding'] });
    fireEvent.click(screen.getByRole('button', { name: /Submit Referral/ }));
    settle();
    const panel = $('ref-block-behavioral');
    expect(document.activeElement).toBe(panel);
    expect(panel.getAttribute('tabindex')).toBe('-1');
    expect(panel.textContent).toContain('The diagnoses you checked are all developmental or behavioral');
    fireEvent.click(within(panel).getByRole('link', { name: 'Change the Paid Caregiver Answer' }));
    settle();
    expect(document.activeElement?.id).toBe('seekingPaidCaregiver');
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('a staff stop with nothing missing moves focus to its panel', () => {
    render(<ReferralPage />);
    fillStep1();
    // A skilled need that is not trach or vent, so the panel (not the
    // high-acuity popup) explains the stop.
    fillGappStep2({ paid: 'no', staff: 'no', equipment: ['Feeding tube (G-tube, NG or J-tube)'] });
    $('referrerName').focus();
    fireEvent.click(screen.getByRole('button', { name: /Submit Referral/ }));
    settle();
    expect(document.activeElement?.id).toBe('ref-block-staff');
    const panel = $('ref-block-staff');
    fireEvent.click(within(panel).getByRole('link', { name: 'Change the Nurse or Aide Answer' }));
    settle();
    expect(document.activeElement?.id).toBe('wantsAgencyStaff');
  });

  it('the young-child stop offers to add skilled needs, escorting to the equipment list', () => {
    render(<ReferralPage />);
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 3);
    fillStep1('gapp', dob.toISOString().slice(0, 10));
    change('referralSource', 'family');
    change('referrerName', 'Parent Name');
    change('relationship', 'parent');
    fireEvent.click(screen.getByLabelText('Seizures or epilepsy'));
    fireEvent.click(screen.getByLabelText('Needs help with feeding'));
    change('behaviorRisk', 'none');
    change('seekingPaidCaregiver', 'yes');
    change('careNeeds', 'personal');
    change('wantsAgencyStaff', 'yes');
    fireEvent.click(screen.getByRole('button', { name: /Submit Referral/ }));
    settle();
    const panel = $('ref-block-youngChild');
    expect(document.activeElement).toBe(panel);
    fireEvent.click(within(panel).getByRole('link', { name: 'Add Skilled Medical Needs' }));
    settle();
    expect(document.activeElement?.id).toBe('ref-field-equipment');
  });

  it('Previous then Next keeps step 2 marked', () => {
    render(<ReferralPage />);
    fillStep1();
    fillGappStep2({ name: '', equipment: ['Tracheostomy'] });
    fireEvent.click(screen.getByRole('button', { name: /Submit Referral/ }));
    expect(screen.getByText('Please enter your name.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous Step' }));
    expect(screen.queryByText(BANNER)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Next Step/ }));
    expect(screen.getByText('Please enter your name.')).toBeTruthy();
    expect(screen.getByText(BANNER)).toBeTruthy();
  });
});

describe('Referral form: trach and vent families who decline a nurse', () => {
  it('opens the popup on No, and Yes, I Will Accept a Nurse switches the answer', () => {
    render(<ReferralPage />);
    fillStep1();
    fillGappStep2({ paid: 'no', staff: 'no', equipment: ['Tracheostomy'] });
    const dialog = screen.getByRole('dialog', { name: 'Trach and Ventilator Care Needs a Skilled Nurse' });
    expect(within(dialog).getByText(/your child has a tracheostomy/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, I Will Accept a Nurse' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(($('wantsAgencyStaff') as HTMLSelectElement).value).toBe('yes');
  });

  it('Keep My Answer closes it, the stop stands, and Submit brings the popup back', () => {
    render(<ReferralPage />);
    fillStep1();
    fillGappStep2({ paid: 'no', staff: 'no', equipment: ['Ventilator, BiPAP or CPAP'] });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep My Answer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(($('wantsAgencyStaff') as HTMLSelectElement).value).toBe('no');
    fireEvent.click(screen.getByRole('button', { name: /Submit Referral/ }));
    settle();
    expect(screen.getByRole('dialog', { name: 'Trach and Ventilator Care Needs a Skilled Nurse' })).toBeTruthy();
  });

  it('does not open for other skilled needs', () => {
    render(<ReferralPage />);
    fillStep1();
    fillGappStep2({ paid: 'no', staff: 'no', equipment: ['Oxygen'] });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Referral form: program preselected from the link', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('arrives with GAPP chosen from ?program=gapp', () => {
    window.history.replaceState({}, '', '/referral?program=gapp');
    render(<ReferralPage />);
    expect(($('programInterest') as HTMLSelectElement).value).toBe('gapp');
  });

  it('ignores an unknown program', () => {
    window.history.replaceState({}, '', '/referral?program=bogus');
    render(<ReferralPage />);
    expect(($('programInterest') as HTMLSelectElement).value).toBe('');
  });
});
