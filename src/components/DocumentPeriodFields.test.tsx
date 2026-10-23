import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentPeriodFields from './DocumentPeriodFields';
import { EMPTY_PERIOD_DRAFT, type DocumentPeriodDraft } from '@/lib/documentPeriod';

function Harness() {
  const [draft, setDraft] = useState<DocumentPeriodDraft>({ ...EMPTY_PERIOD_DRAFT, mode: 'range' });
  return <DocumentPeriodFields draft={draft} onChange={setDraft} labelStyle={{}} inputStyle={{}} selectStyle={{}} />;
}

it('inserts the slashes as a date range is typed digit by digit', () => {
  render(<Harness />);
  const from = screen.getByLabelText('Period start');
  let typed = '';
  for (const key of '10222026') {
    typed = (from as HTMLInputElement).value + key;
    fireEvent.change(from, { target: { value: typed } });
  }
  expect(from).toHaveValue('10/22/2026');

  const to = screen.getByLabelText('Period end');
  fireEvent.change(to, { target: { value: '12312026' } });
  expect(to).toHaveValue('12/31/2026');
});
