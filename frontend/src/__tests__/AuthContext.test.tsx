import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { authService } from '@/api/services/authService';
import { storage } from '@/utils/storage';
import { AUTH_UNAUTHORIZED_EVENT } from '@/api/client';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
}));

vi.mock('@/api/services/authService', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}));

function ConsumerComponent() {
  const { user, token, isAuthenticated, isLoading, login, logout } = useAuth();

  if (isLoading) {
    return <div data-testid="loading">Loading session...</div>;
  }

  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>
      <div data-testid="user-name">{user?.name || 'No User'}</div>
      <div data-testid="user-role">{user?.role || 'No Role'}</div>
      <div data-testid="token-val">{token || 'No Token'}</div>
      <button
        onClick={() =>
          login({ email: 'test@example.com', password: 'password123' })
        }
      >
        Trigger Login
      </button>
      <button onClick={logout}>Trigger Logout</button>
    </div>
  );
}

describe('AuthContext and AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initializes as unauthenticated when no token exists in storage', async () => {
    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    // Initial check finishes
    expect(await screen.findByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('No User');
    expect(screen.getByTestId('token-val')).toHaveTextContent('No Token');
  });

  it('initializes as authenticated when valid token exists in storage and /me succeeds', async () => {
    storage.setToken('stored-valid-token');
    const mockUser = {
      id: 'usr-1',
      name: 'John Developer',
      email: 'john@example.com',
      role: 'ADMIN' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    vi.mocked(authService.getCurrentUser).mockResolvedValueOnce(mockUser);

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('John Developer');
    expect(screen.getByTestId('user-role')).toHaveTextContent('ADMIN');
    expect(screen.getByTestId('token-val')).toHaveTextContent('stored-valid-token');
  });

  it('resets session to unauthenticated when token has expired (401 on /me)', async () => {
    storage.setToken('expired-token');
    vi.mocked(authService.getCurrentUser).mockRejectedValueOnce({
      response: { status: 401, data: { detail: 'Authentication token has expired.' } },
    });

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('No User');
    expect(storage.getToken()).toBeNull();
  });

  it('updates state on successful login action', async () => {
    const user = userEvent.setup();
    const mockUser = {
      id: 'usr-2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'USER' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    vi.mocked(authService.login).mockResolvedValueOnce({
      access_token: 'new-login-token-777',
      token_type: 'bearer',
      user: mockUser,
    });

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    await screen.findByTestId('auth-status');
    await user.click(screen.getByText('Trigger Login'));

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('Jane Smith');
    expect(screen.getByTestId('token-val')).toHaveTextContent('new-login-token-777');
  });

  it('clears state and redirects to /login on logout', async () => {
    const user = userEvent.setup();
    storage.setToken('token-to-logout');
    vi.mocked(authService.getCurrentUser).mockResolvedValueOnce({
      id: 'usr-3',
      name: 'Logged In User',
      email: 'user@example.com',
      role: 'USER' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');

    await user.click(screen.getByText('Trigger Logout'));

    expect(authService.logout).toHaveBeenCalled();
    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('No User');
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('clears session when global taskflow:unauthorized event is dispatched', async () => {
    storage.setToken('valid-token-active');
    vi.mocked(authService.getCurrentUser).mockResolvedValueOnce({
      id: 'usr-4',
      name: 'Active User',
      email: 'active@example.com',
      role: 'USER' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('No User');
  });
});
