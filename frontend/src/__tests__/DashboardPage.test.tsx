import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '@/app/(dashboard)/dashboard/page';
import { dashboardService } from '@/api/services/dashboardService';
import { taskService } from '@/api/services/taskService';
import { userService } from '@/api/services/userService';
import * as CurrentUserHook from '@/hooks/useCurrentUser';
import { DashboardSummary, Task, User } from '@/types';

vi.mock('@/api/services/dashboardService', () => ({
  dashboardService: {
    getSummary: vi.fn(),
  },
}));

vi.mock('@/api/services/taskService', () => ({
  taskService: {
    getTasks: vi.fn(),
    createTask: vi.fn(),
  },
}));

vi.mock('@/api/services/userService', () => ({
  userService: {
    getUsers: vi.fn(),
  },
}));

vi.mock('recharts', async () => {
  const actual: any = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: 500, height: 300 }}>{children}</div>
    ),
  };
});

describe('DashboardPage', () => {
  const mockUser: User = {
    id: 'user-admin',
    name: 'Executive Admin',
    email: 'exec@taskflow.com',
    role: 'ADMIN',
    created_at: '',
    updated_at: '',
  };

  const mockUsersList: User[] = [
    mockUser,
    {
      id: 'user-dev',
      name: 'Dev Member',
      email: 'dev@taskflow.com',
      role: 'USER',
      created_at: '',
      updated_at: '',
    },
  ];

  const mockSummary: DashboardSummary = {
    total_tasks: 24,
    pending_tasks: 16,
    completed_tasks: 8,
    overdue_tasks: 3,
    status_breakdown: {
      TODO: 10,
      IN_PROGRESS: 6,
      COMPLETED: 8,
    },
    priority_breakdown: {
      LOW: 5,
      MEDIUM: 12,
      HIGH: 7,
      URGENT: 0,
    },
    completion_rate: 33.33,
  };

  const mockRecentTasks: Task[] = [
    {
      id: 'task-101',
      title: 'Upgrade OAuth2 Scopes',
      description: 'Strengthen security scopes',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      due_date: '2026-11-01T12:00:00Z',
      creator_id: 'user-admin',
      assignee_id: 'user-dev',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'task-102',
      title: 'Database Sharding Check',
      description: 'Audit collections',
      status: 'COMPLETED',
      priority: 'MEDIUM',
      due_date: null,
      creator_id: 'user-admin',
      assignee_id: null,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      role: 'ADMIN',
      isAdmin: true,
      name: mockUser.name,
      email: mockUser.email,
    });

    vi.mocked(userService.getUsers).mockResolvedValue(mockUsersList);
    vi.mocked(dashboardService.getSummary).mockResolvedValue(mockSummary);
    vi.mocked(taskService.getTasks).mockResolvedValue({
      items: mockRecentTasks,
      total: 2,
      page: 1,
      page_size: 5,
      total_pages: 1,
    });
  });

  it('renders all 4 dashboard statistics and completion velocity from API response', async () => {
    render(<DashboardPage />);

    expect(await screen.findByText('Total Tasks')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();

    expect(screen.getByText('Pending Tasks')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();

    expect(screen.getByText('Completed Tasks')).toBeInTheDocument();
    expect(screen.getAllByText('8').length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('Overdue Tasks')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Completion rate
    expect(screen.getByText('33.33%')).toBeInTheDocument();
    expect(screen.getByText(/8 of 24 total scoped deliverables completed/i)).toBeInTheDocument();
  });

  it('renders accessible chart regions and hidden screen-reader summaries', async () => {
    render(<DashboardPage />);

    expect(await screen.findByRole('region', { name: /donut chart showing task status breakdown/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /bar chart showing task distribution by priority level/i })).toBeInTheDocument();

    // Check accessible hidden tables for screen readers
    expect(screen.getByText('Task Status Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Task Priority Breakdown')).toBeInTheDocument();
  });

  it('renders recent deliverables list with assignee names and badges', async () => {
    render(<DashboardPage />);

    expect(await screen.findByText('Upgrade OAuth2 Scopes')).toBeInTheDocument();
    expect(screen.getByText('Database Sharding Check')).toBeInTheDocument();

    // Check assignee resolved from users directory
    await waitFor(() => {
      expect(screen.getAllByText('Dev Member').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    // Check status and priority badges
    expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
  });

  it('displays empty states when total tasks is 0', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValueOnce({
      total_tasks: 0,
      pending_tasks: 0,
      completed_tasks: 0,
      overdue_tasks: 0,
      status_breakdown: { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0 },
      priority_breakdown: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 },
      completion_rate: 0.0,
    });
    vi.mocked(taskService.getTasks).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 5,
      total_pages: 0,
    });

    render(<DashboardPage />);

    expect(await screen.findByText('No status data available')).toBeInTheDocument();
    expect(screen.getByText('No priority data available')).toBeInTheDocument();
    expect(screen.getByText('No deliverables yet')).toBeInTheDocument();
  });

  it('refreshes dashboard data on task-created window event', async () => {
    render(<DashboardPage />);

    await screen.findByText('Upgrade OAuth2 Scopes');
    expect(dashboardService.getSummary).toHaveBeenCalledTimes(1);

    // Simulate task creation event anywhere in the app
    act(() => {
      window.dispatchEvent(new CustomEvent('task-created'));
    });

    await waitFor(() => {
      expect(dashboardService.getSummary).toHaveBeenCalledTimes(2);
    });
  });

  it('re-fetches data on manual Refresh button click', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await screen.findByText('Upgrade OAuth2 Scopes');
    const refreshBtn = screen.getByRole('button', { name: /refresh/i });

    await user.click(refreshBtn);

    await waitFor(() => {
      expect(dashboardService.getSummary).toHaveBeenCalledTimes(2);
      expect(taskService.getTasks).toHaveBeenCalledTimes(2);
    });
  });
});
