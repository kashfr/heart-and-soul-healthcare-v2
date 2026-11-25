import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
vi.mock('@/lib/authedFetch', () => ({ authedFetch: vi.fn() }));
vi.mock('@/components/FaxAttachmentsPicker', () => ({ default: () => null, encodeFaxAttachments: async () => [] }));
import PpotRequestModal, { type PpotSubjectRow } from './PpotRequestModal';

const base = { dob: '01/02/2015', medicaidId: '999888777666', context: 'gapp', lastRequest: null, recert: null, fromReferralId: '' };
const sample = { name: 'Dana R. Sample, MD', specialty: 'Primary Care', office: 'Peachtree Pediatrics', fax: '4045550188' };
const reed = { name: 'Sam Reed, MD', specialty: 'Neurology', office: 'Atlanta Neuro', fax: '4045550102' };
const client = (over: Partial<PpotSubjectRow> = {}): PpotSubjectRow => ({
  ...base, kind: 'client', id: 'p1', name: 'Zz Test Client', authEnd: '',
  physicianName: sample.name, physicianOffice: sample.office, physicianFax: sample.fax, physicians: [sample, reed], ...over,
});
const open = (subjects: PpotSubjectRow[], initial: PpotSubjectRow | null = null) =>
  render(<PpotRequestModal subjects={subjects} initial={initial} onClose={() => undefined} onSent={() => undefined} />);
const pickMember = () => {
  fireEvent.change(screen.getByPlaceholderText(/Search a referral or client/), { target: { value: 'zz' } });
  fireEvent.click(screen.getByRole('button', { name: /Zz Test Client/ }));
};

it('chooses nothing for a client with no authorization: no request type, no physician', () => {
  open([client()]);
  pickMember();
  expect(screen.getByRole('radio', { name: 'Recertification' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'New case (initial request)' })).not.toBeChecked();
  expect(screen.getByPlaceholderText('e.g. Dr. Anita Patel')).toHaveValue('');
  expect(screen.getByPlaceholderText('(404) 555-0101')).toHaveValue('');
});

it('fills the name, office, and fax from the physician picked in the dropdown', () => {
  open([client()]);
  pickMember();
  const select = screen.getByRole('combobox', { name: 'Physician on the record' });
  expect(select).toHaveTextContent('Sam Reed, MD · Neurology · Atlanta Neuro · Fax (404) 555-0102');
  fireEvent.change(select, { target: { value: '0' } });
  expect(screen.getByPlaceholderText('e.g. Dr. Anita Patel')).toHaveValue('Dana R. Sample, MD');
  expect(screen.getByPlaceholderText('e.g. Peachtree Pediatrics')).toHaveValue('Peachtree Pediatrics');
  expect(screen.getByPlaceholderText('(404) 555-0101')).toHaveValue('(404) 555-0188');
  fireEvent.change(select, { target: { value: 'other' } });
  expect(screen.getByPlaceholderText('e.g. Dr. Anita Patel')).toHaveValue('');
  expect(screen.getByPlaceholderText('(404) 555-0101')).toHaveValue('');
});

it('starts a client with an authorization on recertification, and a referral on new case', () => {
  const { unmount } = open([], client({ authEnd: '2027-04-30' }));
  expect(screen.getByRole('radio', { name: 'Recertification' })).toBeChecked();
  unmount();
  open([], client({ kind: 'referral', id: 'r1', context: 'assessment' }));
  expect(screen.getByRole('radio', { name: 'New case (initial request)' })).toBeChecked();
});

it('shows no dropdown when the record lists no physician', () => {
  open([], client({ physicians: [], physicianName: '', physicianFax: '' }));
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
