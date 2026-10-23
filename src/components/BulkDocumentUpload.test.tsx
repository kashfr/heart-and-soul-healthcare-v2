import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BulkDocumentUpload from './BulkDocumentUpload';
it('saves multiple originals with individual metadata and retries only failed uploads', async () => {
  const upload = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(undefined);
  const onClose = vi.fn();
  render(<BulkDocumentUpload upload={upload} onClose={onClose} />);
  const pdf = new File(['pdf'], 'orders.pdf', { type: 'application/pdf' });
  const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText(/Choose documents/), { target: { files: [pdf, photo] } });
  fireEvent.change(screen.getByLabelText('Title for orders.pdf'), { target: { value: 'Physician orders' } });
  fireEvent.change(screen.getByLabelText('Date for orders.pdf'), { target: { value: '10/18/2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload pending files' }));
  await screen.findByText('Failed: Connection lost');
  // A failure keeps the modal open with a plain summary.
  expect(screen.getByRole('alert')).toHaveTextContent('1 uploaded, 1 failed.');
  expect(onClose).not.toHaveBeenCalled();
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0][0]).toMatchObject({ file: pdf, title: 'Physician orders', docDate: '2026-10-18', periodStart: '', periodEnd: '' });
  expect(upload.mock.calls[1][0].file).toBe(photo);
  expect(screen.getByLabelText('Title for orders.pdf')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Upload pending files' }));
  // The retry uploads only the failed file, and once everything saved the modal closes itself.
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(upload).toHaveBeenCalledTimes(3);
  expect(upload.mock.calls[2][0].file).toBe(photo);
});
it('rejects unsupported and oversized files before uploading', () => {
  const upload = vi.fn(); render(<BulkDocumentUpload upload={upload} onClose={() => {}} />);
  const input = screen.getByLabelText(/Choose documents/);
  fireEvent.change(input, { target: { files: [new File(['x'], 'bad.exe')] } });
  expect(screen.getByRole('alert')).toHaveTextContent('bad.exe');
  const large = new File(['x'], 'large.pdf'); Object.defineProperty(large, 'size', { value: 20 * 1024 * 1024 });
  fireEvent.change(input, { target: { files: [large] } });
  expect(screen.getByRole('alert')).toHaveTextContent('under 20 MB');
  expect(upload).not.toHaveBeenCalled();
});
it('seeds a new file from the previous one, applies one file\'s labeling to all, and sends the period as ISO bounds', async () => {
  const upload = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onComplete = vi.fn();
  render(<BulkDocumentUpload upload={upload} onClose={onClose} onComplete={onComplete} />);
  // No defaults block: a single file shows no "apply to all".
  expect(screen.queryByRole('button', { name: 'Apply to all files' })).toBeNull();
  fireEvent.change(screen.getByLabelText(/Choose documents/), { target: { files: [new File(['pdf'], 'eligibility.pdf', { type: 'application/pdf' })] } });
  expect(screen.queryByRole('button', { name: 'Apply to all files' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Category for eligibility.pdf' }), { target: { value: 'Eligibility / Medicaid' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Period covered for eligibility.pdf' }), { target: { value: 'month' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Month covered for eligibility.pdf' }), { target: { value: '10' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Month covered for eligibility.pdf year' }), { target: { value: '2026' } });
  // The next file inherits the previous file's category, date and period.
  fireEvent.change(screen.getByLabelText(/Choose documents/), { target: { files: [new File(['pdf'], 'letter.pdf', { type: 'application/pdf' })] } });
  expect(screen.getByRole('combobox', { name: 'Category for letter.pdf' })).toHaveValue('Eligibility / Medicaid');
  expect(screen.getByRole('combobox', { name: 'Month covered for letter.pdf' })).toHaveDisplayValue('October');
  // Change the first to a range and push it to the other file.
  fireEvent.change(screen.getByRole('combobox', { name: 'Period covered for eligibility.pdf' }), { target: { value: 'range' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Period start for eligibility.pdf' }), { target: { value: '10/01/2026' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Apply to all files' })[0]);
  expect(screen.getByRole('combobox', { name: 'Period covered for letter.pdf' })).toHaveValue('range');
  fireEvent.click(screen.getByRole('button', { name: 'Upload pending files' }));
  expect(screen.getByRole('alert')).toHaveTextContent('eligibility.pdf: Enter the start and end of the period covered');
  expect(upload).not.toHaveBeenCalled();
  for (const name of ['eligibility.pdf', 'letter.pdf']) fireEvent.change(screen.getByRole('textbox', { name: `Period end for ${name}` }), { target: { value: '12/31/2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload pending files' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(upload).toHaveBeenCalledTimes(2);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls[0][0]).toMatchObject({ category: 'Eligibility / Medicaid', periodStart: '2026-10-01', periodEnd: '2026-12-31' });
  expect(upload.mock.calls[1][0]).toMatchObject({ periodStart: '2026-10-01', periodEnd: '2026-12-31' });
  expect(upload.mock.calls[0][0]).not.toHaveProperty('period');
  expect(upload.mock.calls[0][0]).not.toHaveProperty('status');
});
it('shows how many files are queued instead of the browser\'s cleared-input text', () => {
  render(<BulkDocumentUpload upload={vi.fn()} onClose={() => {}} />);
  expect(screen.getByText('No files chosen yet')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Choose documents/), { target: { files: [new File(['pdf'], 'rights.pdf', { type: 'application/pdf' })] } });
  expect(screen.getByText('1 file ready to upload')).toBeInTheDocument();
  expect(screen.getByText('Add More Files')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Choose documents/), { target: { files: [new File(['jpg'], 'card.jpg', { type: 'image/jpeg' })] } });
  expect(screen.getByText('2 files ready to upload')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
  expect(screen.getByText('1 file ready to upload')).toBeInTheDocument();
});
