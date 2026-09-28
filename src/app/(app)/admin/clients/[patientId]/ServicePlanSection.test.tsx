import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ServicePlanRecord } from '@/lib/servicePlanShared';

const store: { plans: ServicePlanRecord[] } = { plans: [] };
vi.mock('@/lib/servicePlans', () => ({
  getServicePlans: vi.fn(async () => store.plans),
  servicePlanPdfUrl: (id: string) => `/api/service-plans/${id}/pdf`,
  servicePlanReviewPdfUrl: (id: string, r: string) => `/api/service-plans/${id}/reviews/${r}/pdf`,
}));
vi.mock('@/components/PdfPreviewModal', () => ({
  default: ({ title }: { title: string }) => <div data-testid="pdf-preview">{title}</div>,
}));

import ServicePlanSection from './ServicePlanSection';

const base: ServicePlanRecord = {
  id: 'new',
  patientId: 'p1',
  clientName: 'ZZ Test Client',
  dob: '2010-01-01',
  address: '1 Main St',
  diagnosis: 'Cerebral palsy',
  functionalLimitations: 'Total assist',
  serviceTypes: ['nursing'],
  nutritionalNeeds: 'Pureed',
  allergies: 'NKA',
  expectedTimesFrequency: 'Weekdays',
  expectedDuration: 'Ongoing',
  descriptionOfServices: 'Skilled nursing',
  regularDiet: 'no',
  specialDiets: [],
  specialDietOther: '',
  specialTreatments: '',
  specialEquipment: '',
  behaviors: '',
  tubBath: 'no',
  bedBath: 'yes',
  lotionToBack: 'yes',
  goals: [{ goal: 'Skin intact', objective: 'Turn q2h' }],
  medications: 'Keppra',
  dischargePlans: 'Family',
  supervisorName: 'S. Lilian Payne',
  supervisorCredentials: 'RN',
  signature: '',
  revisesPlanId: '',
  caregiverName: '',
  caregiverRelationship: '',
  caregiverSignature: '',
  developedWith: [],
  developedWithNotes: '',
  reviews: [],
  signedDate: '2026-09-28',
  createdAt: null,
  createdBy: 'u1',
  createdByName: 'S. Lilian Payne',
  documentId: 'd1',
};

beforeEach(() => {
  store.plans = [];
});

describe('ServicePlanSection', () => {
  it('shows the empty state, with the write button only for an author', async () => {
    const { unmount } = render(<ServicePlanSection patientId="p1" canAuthor={false} />);
    expect(await screen.findByText(/No service plan on file/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /write service plan/i })).toBeNull();
    unmount();
    render(<ServicePlanSection patientId="p1" canAuthor />);
    expect(await screen.findByRole('link', { name: /write service plan/i })).toHaveAttribute('href', '/admin/clients/p1/service-plan/new');
  });

  it('shows the newest plan as current, lets an earlier one be opened, and previews the PDF', async () => {
    store.plans = [base, { ...base, id: 'old', signedDate: '2025-06-01', diagnosis: 'Older diagnosis', revisesPlanId: '' }];
    render(<ServicePlanSection patientId="p1" canAuthor />);
    expect(await screen.findByText('Cerebral palsy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /revise service plan/i })).toBeInTheDocument();
    expect(screen.getByText('Skin intact')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '06/01/2025' }));
    expect(await screen.findByText('Older diagnosis')).toBeInTheDocument();
    expect(screen.getByText(/superseded/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /revise from this plan/i })).toHaveAttribute('href', '/admin/clients/p1/service-plan/new?from=old');

    fireEvent.click(screen.getByRole('button', { name: /view pdf/i }));
    expect(await screen.findByTestId('pdf-preview')).toHaveTextContent('Service Plan, signed 06/01/2025');
  });

  it('shows reviews, the next due date, and both actions on the current plan', async () => {
    store.plans = [{
      ...base,
      signedDate: '2026-07-01',
      reviews: [{ id: 'r1', planId: 'new', patientId: 'p1', reviewedDate: '2026-08-30', reviewerUid: 'u', reviewerName: 'S. Lilian Payne', reviewerCredentials: 'RN', signature: '', note: 'No change in condition.', differencesAcknowledged: [], documentId: '', createdAt: null }],
    }];
    render(<ServicePlanSection patientId="p1" canAuthor />);
    expect(await screen.findByText(/last reviewed 08\/30\/2026/)).toBeInTheDocument();
    // 08/30/2026 + 62 days
    expect(screen.getByText(/10\/31\/2026/)).toBeInTheDocument();
    expect(screen.getByText('No change in condition.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review, no changes/i })).toHaveAttribute('href', '/admin/clients/p1/service-plan/review');
    expect(screen.getByRole('link', { name: /revise service plan/i })).toHaveAttribute('href', '/admin/clients/p1/service-plan/new');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByTestId('pdf-preview')).toHaveTextContent('Service Plan Review, 08/30/2026');
  });

  it('offers no actions to a nurse', async () => {
    store.plans = [base];
    render(<ServicePlanSection patientId="p1" canAuthor={false} />);
    expect(await screen.findByText('Cerebral palsy')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /review, no changes/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /revise/i })).toBeNull();
  });
});
