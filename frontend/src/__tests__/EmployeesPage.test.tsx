import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmployeesPage from '@/app/(dashboard)/employees/page';
import { employeeService } from '@/api/services/employeeService';
import * as CurrentUserHook from '@/hooks/useCurrentUser';
import { EmployeeListResponse, User } from '@/types';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock employeeService
vi.mock('@/api/services/employeeService', () => ({
  employeeService: {
    getEmployees: vi.fn(),
    downloadTemplate: vi.fn(),
  },
}));

describe('EmployeesPage', () => {
  const mockAdminUser: User = {
    id: 'admin-1',
    name: 'Master Admin',
    email: 'admin@taskflow.dev',
    role: 'ADMIN',
    department: 'Executive',
    position: 'Chief Administrator',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockNonAdminUser: User = {
    id: 'emp-1',
    name: 'Regular Staff',
    email: 'staff@taskflow.dev',
    role: 'EMPLOYEE',
    department: 'Engineering',
    position: 'Developer',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockEmployeeDirectory: EmployeeListResponse = {
    items: [
      mockAdminUser,
      {
        id: 'user-2',
        name: 'Jane Doe',
        email: 'jane.doe@taskflow.dev',
        role: 'TEAM_LEAD',
        department: 'Engineering',
        position: 'Staff Architect',
        status: 'ACTIVE',
        created_at: '2026-01-10T00:00:00Z',
        updated_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'user-3',
        name: 'Alex Pending',
        email: 'alex.pending@taskflow.dev',
        role: 'EMPLOYEE',
        department: 'Design',
        position: 'UX Designer',
        status: 'INVITED',
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
    ],
    total: 3,
    page: 1,
    page_size: 50,
    total_pages: 1,
    total_active: 2,
    total_invited: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restricts access when logged in as non-admin', async () => {
    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockNonAdminUser,
      isLoading: false,
      isAuthenticated: true,
      role: mockNonAdminUser.role,
      isAdmin: false,
      name: mockNonAdminUser.name,
      email: mockNonAdminUser.email,
    });

    render(<EmployeesPage />);

    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(
      screen.getByText(/The Employee Management Directory is reserved exclusively/i)
    ).toBeInTheDocument();
  });

  it('renders employee management directory with stats and staff rows for ADMIN', async () => {
    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockAdminUser,
      isLoading: false,
      isAuthenticated: true,
      role: mockAdminUser.role,
      isAdmin: true,
      name: mockAdminUser.name,
      email: mockAdminUser.email,
    });

    vi.mocked(employeeService.getEmployees).mockResolvedValue(mockEmployeeDirectory);

    render(<EmployeesPage />);

    // Title and Admin Badge
    expect(await screen.findByText('Employee Management Directory')).toBeInTheDocument();
    expect(screen.getByText('Admin Access Only')).toBeInTheDocument();

    // Table Content
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane.doe@taskflow.dev')).toBeInTheDocument();
    expect(screen.getByText('Alex Pending')).toBeInTheDocument();
    expect(screen.getByText('alex.pending@taskflow.dev')).toBeInTheDocument();

    // Status Badges
    expect(screen.getAllByText('Pending Activation').length).toBeGreaterThanOrEqual(1);
  });

  it('triggers CSV template download when clicking CSV Template button', async () => {
    const user = userEvent.setup();
    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockAdminUser,
      isLoading: false,
      isAuthenticated: true,
      role: mockAdminUser.role,
      isAdmin: true,
      name: mockAdminUser.name,
      email: mockAdminUser.email,
    });

    vi.mocked(employeeService.getEmployees).mockResolvedValue(mockEmployeeDirectory);
    vi.mocked(employeeService.downloadTemplate).mockResolvedValue();

    render(<EmployeesPage />);

    const downloadBtn = await screen.findByRole('button', { name: /CSV Template/i });
    await user.click(downloadBtn);

    expect(employeeService.downloadTemplate).toHaveBeenCalledTimes(1);
  });

  it('opens CsvImportModal when clicking Import Employees button', async () => {
    const user = userEvent.setup();
    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockAdminUser,
      isLoading: false,
      isAuthenticated: true,
      role: mockAdminUser.role,
      isAdmin: true,
      name: mockAdminUser.name,
      email: mockAdminUser.email,
    });

    vi.mocked(employeeService.getEmployees).mockResolvedValue(mockEmployeeDirectory);

    render(<EmployeesPage />);

    const importBtn = await screen.findByRole('button', { name: /Import Employees/i });
    await user.click(importBtn);

    expect(screen.getByText('Bulk Import Employees via CSV')).toBeInTheDocument();
  });

  it('opens Assign Task modal pre-selecting the employee when clicking Assign Task', async () => {
    const user = userEvent.setup();
    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockAdminUser,
      isLoading: false,
      isAuthenticated: true,
      role: mockAdminUser.role,
      isAdmin: true,
      name: mockAdminUser.name,
      email: mockAdminUser.email,
    });

    vi.mocked(employeeService.getEmployees).mockResolvedValue(mockEmployeeDirectory);

    render(<EmployeesPage />);

    const assignBtns = await screen.findAllByRole('button', { name: /Assign Task/i });
    expect(assignBtns.length).toBeGreaterThan(0);
    await user.click(assignBtns[0]);

    // Modal opens with Create Task dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create Task')).toBeInTheDocument();
  });
});
