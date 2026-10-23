import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BoardPage from '@/app/(dashboard)/board/page';
import { taskService } from '@/api/services/taskService';
import { userService } from '@/api/services/userService';
import * as CurrentUserHook from '@/hooks/useCurrentUser';
import { Task, User } from '@/types';

vi.mock('@/api/services/taskService', () => ({
  taskService: {
    getTasks: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    createTask: vi.fn(),
  },
}));

vi.mock('@/api/services/userService', () => ({
  userService: {
    getUsers: vi.fn(),
  },
}));

describe('BoardPage (Kanban)', () => {
  const mockCurrentUser: User = {
    id: 'user-charlie',
    name: 'Charlie Admin',
    email: 'charlie@taskflow.com',
    role: 'ADMIN',
    created_at: '',
    updated_at: '',
  };

  const mockUsersList: User[] = [
    mockCurrentUser,
    {
      id: 'user-dave',
      name: 'Dave Engineer',
      email: 'dave@taskflow.com',
      role: 'USER',
      created_at: '',
      updated_at: '',
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task-todo-1',
      title: 'Setup MongoDB Indexing',
      description: 'Index title and status fields',
      status: 'TODO',
      priority: 'HIGH',
      due_date: '2026-11-15T00:00:00Z',
      creator_id: 'user-charlie',
      assignee_id: 'user-dave',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'task-prog-1',
      title: 'Build Kanban Drag and Drop',
      description: 'HTML5 accessible drag and drop',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      due_date: null,
      creator_id: 'user-charlie',
      assignee_id: 'user-charlie',
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
    {
      id: 'task-done-1',
      title: 'Implement Auth Service',
      description: 'JWT bearer token integration',
      status: 'COMPLETED',
      priority: 'LOW',
      due_date: null,
      creator_id: 'user-charlie',
      assignee_id: null,
      created_at: '2026-01-03T00:00:00Z',
      updated_at: '2026-01-03T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockCurrentUser,
      isAuthenticated: true,
      isLoading: false,
      role: 'ADMIN',
      isAdmin: true,
      name: mockCurrentUser.name,
      email: mockCurrentUser.email,
    });

    vi.mocked(userService.getUsers).mockResolvedValue(mockUsersList);
    vi.mocked(taskService.getTasks).mockResolvedValue({
      items: mockTasks,
      total: 3,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });
  });

  it('renders all three columns: To Do, In Progress, and Completed', async () => {
    render(<BoardPage />);

    expect(await screen.findByRole('heading', { name: 'To Do' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'In Progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeInTheDocument();

    // Verify task titles are rendered in their respective columns
    expect(screen.getByText('Setup MongoDB Indexing')).toBeInTheDocument();
    expect(screen.getByText('Build Kanban Drag and Drop')).toBeInTheDocument();
    expect(screen.getByText('Implement Auth Service')).toBeInTheDocument();

    // Verify assignee names
    await waitFor(() => {
      expect(screen.getByText('Dave Engineer')).toBeInTheDocument();
      expect(screen.getByText(/charlie admin/i)).toBeInTheDocument();
      expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
    });
  });

  it('allows status changes using accessible move button controls and persists via PATCH', async () => {
    const user = userEvent.setup();
    vi.mocked(taskService.updateTask).mockResolvedValueOnce({
      ...mockTasks[0],
      status: 'IN_PROGRESS',
    });

    render(<BoardPage />);

    await screen.findByText('Setup MongoDB Indexing');

    // Click "In Progress" button on the task card in the "To Do" column
    const moveButtons = screen.getAllByRole('button', { name: /move to in progress/i });
    expect(moveButtons.length).toBeGreaterThan(0);
    await user.click(moveButtons[0]);

    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith('task-todo-1', {
        status: 'IN_PROGRESS',
      });
    });
  });

  it('handles HTML5 drag-and-drop drop event to advance task status', async () => {
    vi.mocked(taskService.updateTask).mockResolvedValueOnce({
      ...mockTasks[0],
      status: 'COMPLETED',
    });

    render(<BoardPage />);

    await screen.findByText('Setup MongoDB Indexing');

    // Find the Completed column container
    const completedHeading = screen.getByRole('heading', { name: 'Completed' });
    const completedColumn = completedHeading.closest('div[class*="rounded-2xl"]');
    expect(completedColumn).not.toBeNull();

    // Simulate drop on the Completed column with task id
    fireEvent.drop(completedColumn!, {
      dataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? 'task-todo-1' : ''),
      },
    });

    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith('task-todo-1', {
        status: 'COMPLETED',
      });
    });
  });

  it('disables drag-and-drop and status modification for users lacking permission', async () => {
    // Current user is a regular user who is NEITHER creator NOR assignee
    const unprivilegedUser: User = {
      id: 'user-unprivileged',
      name: 'Unprivileged User',
      email: 'guest@example.com',
      role: 'USER',
      created_at: '',
      updated_at: '',
    };
    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: unprivilegedUser,
      isAuthenticated: true,
      isLoading: false,
      role: 'USER',
      isAdmin: false,
      name: unprivilegedUser.name,
      email: unprivilegedUser.email,
    });

    render(<BoardPage />);

    await screen.findByText('Setup MongoDB Indexing');

    // Card should not be draggable
    const taskCard = screen.getByText('Setup MongoDB Indexing').closest('div[draggable]');
    expect(taskCard).toHaveAttribute('draggable', 'false');

    // Move buttons should not be present
    expect(screen.queryByRole('button', { name: /move to in progress/i })).toBeNull();
  });
});
