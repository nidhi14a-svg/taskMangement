import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivatePage from '@/app/(auth)/activate/page';
import { employeeService } from '@/api/services/employeeService';

const mockPush = vi.fn();
let mockSearchToken = 'valid-test-token-12345';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'token' ? mockSearchToken : null),
  }),
}));

vi.mock('@/api/services/employeeService', () => ({
  employeeService: {
    verifyActivationToken: vi.fn(),
    activateAccount: vi.fn(),
  },
}));

describe('ActivatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchToken = 'valid-test-token-12345';
  });

  it('verifies valid activation token on mount and displays employee details', async () => {
    vi.mocked(employeeService.verifyActivationToken).mockResolvedValue({
      valid: true,
      email: 'newhire@taskflow.dev',
      name: 'Sarah Connor',
      message: 'Token is valid.',
    });

    render(<ActivatePage />);

    expect(await screen.findByText('Set Account Password')).toBeInTheDocument();
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText('newhire@taskflow.dev')).toBeInTheDocument();
    expect(screen.getByLabelText(/New Password/i)).toBeInTheDocument();
  });

  it('displays error message when activation token is invalid or expired', async () => {
    vi.mocked(employeeService.verifyActivationToken).mockResolvedValue({
      valid: false,
      message: 'This activation link is invalid, expired, or has already been used.',
    });

    render(<ActivatePage />);

    expect(await screen.findByText('Invalid or Expired Link')).toBeInTheDocument();
    expect(
      screen.getByText(/This activation link is invalid, expired, or has already been used./i)
    ).toBeInTheDocument();
  });

  it('validates password requirements before submitting activation', async () => {
    const user = userEvent.setup();
    vi.mocked(employeeService.verifyActivationToken).mockResolvedValue({
      valid: true,
      email: 'newhire@taskflow.dev',
      name: 'Sarah Connor',
      message: 'Token is valid.',
    });

    render(<ActivatePage />);

    const passwordInput = await screen.findByLabelText(/New Password/i);
    const confirmInput = screen.getByLabelText(/Confirm Password/i);
    const submitBtn = screen.getByRole('button', { name: /Activate Account/i });

    // Test password too short (< 8 chars)
    await user.type(passwordInput, 'short');
    await user.type(confirmInput, 'short');
    await user.click(submitBtn);

    expect(
      await screen.findByText('Password must be at least 8 characters long')
    ).toBeInTheDocument();
    expect(employeeService.activateAccount).not.toHaveBeenCalled();

    // Test password mismatch
    await user.clear(passwordInput);
    await user.clear(confirmInput);
    await user.type(passwordInput, 'validpass123');
    await user.type(confirmInput, 'differentpass123');
    await user.click(submitBtn);

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(employeeService.activateAccount).not.toHaveBeenCalled();
  });

  it('activates account on valid submission and redirects to dashboard', async () => {
    const user = userEvent.setup();
    vi.mocked(employeeService.verifyActivationToken).mockResolvedValue({
      valid: true,
      email: 'newhire@taskflow.dev',
      name: 'Sarah Connor',
      message: 'Token is valid.',
    });
    vi.mocked(employeeService.activateAccount).mockResolvedValue({
      access_token: 'fake-jwt-token',
      token_type: 'bearer',
      user: {
        id: 'u-123',
        email: 'newhire@taskflow.dev',
        name: 'Sarah Connor',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      },
    });

    render(<ActivatePage />);

    const passwordInput = await screen.findByLabelText(/New Password/i);
    const confirmInput = screen.getByLabelText(/Confirm Password/i);
    const submitBtn = screen.getByRole('button', { name: /Activate Account/i });

    await user.type(passwordInput, 'SecurePass123!');
    await user.type(confirmInput, 'SecurePass123!');
    await user.click(submitBtn);

    expect(employeeService.activateAccount).toHaveBeenCalledWith(
      'valid-test-token-12345',
      'SecurePass123!'
    );
    expect(await screen.findByText('Account Activated!')).toBeInTheDocument();
  });
});
