import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import * as AuthHooks from '@/hooks/useAuth';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading session indicator while session authentication is loading', () => {
    vi.spyOn(AuthHooks, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Private Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Verifying session...')).toBeInTheDocument();
    expect(screen.queryByText('Private Protected Content')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to /login and does not render children when user is unauthenticated', () => {
    vi.spyOn(AuthHooks, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    const { container } = render(
      <ProtectedRoute>
        <div>Private Protected Content</div>
      </ProtectedRoute>
    );

    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Private Protected Content')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders children when user is authenticated', () => {
    vi.spyOn(AuthHooks, 'useAuth').mockReturnValue({
      user: {
        id: '123',
        name: 'Authenticated User',
        email: 'auth@example.com',
        role: 'USER',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-valid-token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Private Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Private Protected Content')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
