import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MonthPicker from './MonthPicker';

describe('MonthPicker', () => {
  it('shows month then year without an unsupported native month input', () => {
    const { container } = render(<MonthPicker value="2026-10" onChange={() => {}} />);
    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveDisplayValue('October');
    expect(selects[1]).toHaveDisplayValue('2026');
    expect(container.querySelector('input[type="month"]')).toBeNull();
  });

  it('emits ISO months for queries and preserves the other selection', () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2026-10" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), { target: { value: '02' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-02');
    fireEvent.change(screen.getByRole('combobox', { name: 'Month year' }), { target: { value: '2027' } });
    expect(onChange).toHaveBeenLastCalledWith('2027-10');
  });

  it('reflects external navigation and keeps out-of-range years selectable', () => {
    const { rerender } = render(<MonthPicker value="2026-12" onChange={() => {}} />);
    rerender(<MonthPicker value="2027-01" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveDisplayValue('January');
    rerender(<MonthPicker value="1899-03" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Month year' })).toHaveDisplayValue('1899');
  });
});
