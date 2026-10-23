import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '@/app/(auth)/register/page';
import * as AuthHooks from '@/hooks/useAuth';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

describe('RegisterPage', () => {
  const mockRegister = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthHooks, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: mockRegister,
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  });

  it('renders all required registration fields and explicitly NO role selector', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');

    // Strict requirement: Ensure NO role selector exists in the DOM
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByLabelText(/role/i)).toBeNull();
    expect(screen.queryByText(/admin/i)).toBeNull();
  });

  it('toggles password and confirm-password visibility', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const passwordInput = screen.getByPlaceholderText('Minimum 8 characters');
    const confirmInput = screen.getByPlaceholderText('Re-enter your password');

    const togglePasswordBtn = screen.getByRole('button', { name: /^show password$/i });
    const toggleConfirmBtn = screen.getByRole('button', { name: /^show password confirmation$/i });

    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(confirmInput).toHaveAttribute('type', 'password');

    await user.click(togglePasswordBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(toggleConfirmBtn);
    expect(confirmInput).toHaveAttribute('type', 'text');
  });

  it('validates client-side constraints (min 8 char password, matching confirm password)', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const submitBtn = screen.getByRole('button', { name: /create account/i });
    await user.click(submitBtn);

    // Zod validation errors
    expect(await screen.findByText(/full name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/email address is required/i)).toBeInTheDocument();

    // Fill in name and email, but short password
    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/email address/i), 'jane@example.com');
    await user.type(screen.getByPlaceholderText('Minimum 8 characters'), '12345');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), '12345');
    await user.click(submitBtn);

    expect(await screen.findByText(/password must be at least 8 characters long/i)).toBeInTheDocument();

    // Mismatched passwords
    await user.clear(screen.getByPlaceholderText('Minimum 8 characters'));
    await user.clear(screen.getByPlaceholderText('Re-enter your password'));
    await user.type(screen.getByPlaceholderText('Minimum 8 characters'), 'ValidPassword123');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'DifferentPassword123');
    await user.click(submitBtn);

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('handles duplicate-email error (409) from backend API', async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { detail: 'A user with this email address already exists.' },
      },
    });

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), 'Jane Developer');
    await user.type(screen.getByLabelText(/email address/i), 'existing@example.com');
    await user.type(screen.getByPlaceholderText('Minimum 8 characters'), 'SecurePass123!');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email address already exists.'
    );
  });

  it('submits valid registration without role and redirects to /login?registered=true', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValueOnce({
      id: 'usr-new-1',
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      role: 'USER',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/email address/i), 'jane.doe@example.com');
    await user.type(screen.getByPlaceholderText('Minimum 8 characters'), 'StrongSecret99#');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'StrongSecret99#');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      // Must not include role in registration call
      expect(mockRegister).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        password: 'StrongSecret99#',
      });
      expect(mockPush).toHaveBeenCalledWith('/login?registered=true');
    });
  });

  it('redirects to /dashboard if already authenticated', () => {
    vi.spyOn(AuthHooks, 'useAuth').mockReturnValue({
      user: {
        id: '1',
        name: 'Existing User',
        email: 'existing@example.com',
        role: 'USER',
        created_at: '',
        updated_at: '',
      },
      token: 'jwt-token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: mockRegister,
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(<RegisterPage />);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });
});
