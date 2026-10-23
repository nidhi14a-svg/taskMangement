import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/(auth)/login/page';
import * as AuthHooks from '@/hooks/useAuth';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}));

describe('LoginPage', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();

    vi.spyOn(AuthHooks, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  });

  it('renders all login elements and navigation links', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: /sign in to taskflow/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/register');
  });

  it('toggles password visibility when the toggle button is clicked', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const passwordInput = screen.getByPlaceholderText('••••••••');
    const toggleButton = screen.getByRole('button', { name: /show password/i });

    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('displays client-side validation errors when submitting blank or invalid fields', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitBtn);

    expect(screen.getByText(/email address is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();

    // Type invalid email format
    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'invalid-email');
    await user.click(submitBtn);

    expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
  });

  it('displays clear invalid-credential message when login returns 401', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { detail: 'Incorrect email or password.' },
      },
    });

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });

  it('displays backend connection failure message on network error', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({
      code: 'ERR_NETWORK',
    });

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to connect to the backend server. Please verify that the API is running at http://127.0.0.1:8000.'
    );
  });

  it('displays success banner when ?registered=true query param is present', () => {
    mockSearchParams = new URLSearchParams('registered=true');
    render(<LoginPage />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Account created successfully! Please sign in with your email and password.'
    );
  });

  it('successfully authenticates and redirects to /dashboard', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      access_token: 'valid-jwt-token',
      token_type: 'bearer',
      user: {
        id: '1',
        name: 'Test User',
        email: 'user@example.com',
        role: 'USER',
      },
    });

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'validpass123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'validpass123',
      });
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
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
      login: mockLogin,
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(<LoginPage />);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });
});
