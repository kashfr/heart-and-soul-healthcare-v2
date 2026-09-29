import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const auth = { user: null as unknown, loading: true };
const replace = vi.fn();
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('redirect=/admin/clients'),
}));
vi.mock('@/lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({ signInWithEmailAndPassword: vi.fn() }));

import LoginPage from './page';

beforeEach(() => {
  replace.mockClear();
});

describe('login page before the session is known', () => {
  it('shows the loading screen, not the form, while auth is still resolving', () => {
    auth.user = null;
    auth.loading = true;
    render(<LoginPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('keeps the loading screen for a signed-in visitor and redirects them', () => {
    auth.user = { uid: 'u1' };
    auth.loading = false;
    render(<LoginPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Signing you in');
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(replace).toHaveBeenCalledWith('/admin/clients');
  });

  it('shows the form once we know nobody is signed in', () => {
    auth.user = null;
    auth.loading = false;
    render(<LoginPage />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
