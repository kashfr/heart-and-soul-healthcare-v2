/**
 * Render tests for the vitals recheck section: a recheck shows only the
 * vitals the nurse picked, an abnormal first reading offers a one-click
 * recheck of exactly that vital, and a recheck still out of range asks what
 * was done.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import type { FormValues } from '../types';
import VitalsRecheckSection from './VitalsRecheckSection';
import { VITALS_RECHECK_COUNT_KEY, vitalsRecheckFieldKey } from '@/lib/vitalsRecheck';

function Harness({ defaults }: { defaults: Record<string, string> }) {
  const { register, watch, setValue } = useForm<FormValues>({ defaultValues: defaults });
  return <VitalsRecheckSection register={register} watch={watch} setValue={setValue} />;
}

const adult = { q1_formRev: '4', q5_ageYears: '30', q7_shiftStart: '09:00' };

describe('VitalsRecheckSection', () => {
  it('a new recheck shows no vital inputs until one is chosen', () => {
    render(<Harness defaults={{ ...adult, q18_pulse: '72' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Add a later vitals reading/ }));
    expect(screen.getByText('Choose which vitals you retook.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Pulse \(bpm\)/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pulse' }));
    expect(screen.getByLabelText(/Pulse \(bpm\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Temperature \(°F\)/)).toBeNull();
  });

  it('an abnormal first reading offers a recheck of that vital, with only its input', () => {
    render(<Harness defaults={{ ...adult, q18_pulse: '102' }} />);
    expect(screen.getByText(/Recheck needed/)).toBeInTheDocument();
    expect(screen.getByText(/102 bpm/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add a recheck for pulse/ }));
    expect(screen.getByLabelText(/Pulse \(bpm\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Temperature \(°F\)/)).toBeNull();
    expect(screen.queryByLabelText('Recheck 1 systolic')).toBeNull();
  });

  it('a recheck back in range clears the notice and asks nothing more', () => {
    render(
      <Harness
        defaults={{
          ...adult,
          q18_pulse: '102',
          [VITALS_RECHECK_COUNT_KEY]: '1',
          [vitalsRecheckFieldKey(1, 'time')]: '11:00',
          [vitalsRecheckFieldKey(1, 'pulse')]: '96',
        }}
      />,
    );
    expect(screen.getByText(/Rechecked/)).toBeInTheDocument();
    expect(screen.getByText(/Back in range on the recheck/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Action taken/)).toBeNull();
  });

  it('a recheck still out of range asks what was done, and a baseline claim asks for the baseline', async () => {
    render(
      <Harness
        defaults={{
          ...adult,
          q18_pulse: '102',
          [VITALS_RECHECK_COUNT_KEY]: '1',
          [vitalsRecheckFieldKey(1, 'time')]: '11:00',
          [vitalsRecheckFieldKey(1, 'pulse')]: '104',
        }}
      />,
    );
    expect(screen.getByText(/Still outside the expected range after recheck: pulse/)).toBeInTheDocument();
    const action = screen.getByLabelText(/Action taken/);
    fireEvent.change(action, { target: { value: 'Notified RN supervisor' } });
    await waitFor(() => expect(screen.getByLabelText(/^Time \*/)).toBeInTheDocument());
    fireEvent.change(action, { target: { value: "Within this client's known baseline per care plan" } });
    await waitFor(() => expect(screen.getByLabelText(/What is the documented baseline/)).toBeInTheDocument());
    expect(screen.queryByLabelText(/^Time \*/)).toBeNull();
  });
});
