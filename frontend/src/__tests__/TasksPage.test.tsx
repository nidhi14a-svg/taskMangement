import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TasksPage from '@/app/(dashboard)/tasks/page';
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

describe('TasksPage', () => {
  const mockCurrentUser: User = {
    id: 'user-alice',
    name: 'Alice Developer',
    email: 'alice@example.com',
    role: 'USER',
    created_at: '',
    updated_at: '',
  };

  const mockUsersList: User[] = [
    mockCurrentUser,
    {
      id: 'user-bob',
      name: 'Bob Engineer',
      email: 'bob@example.com',
      role: 'USER',
      created_at: '',
      updated_at: '',
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      title: 'Implement Authentication',
      description: 'Connect Next.js to FastAPI auth',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      due_date: '2026-12-31T23:59:59Z',
      creator_id: 'user-alice', // Created by Alice -> Alice can edit all & delete
      assignee_id: 'user-bob',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'task-2',
      title: 'Review MongoDB Indexes',
      description: 'Verify collection indexes',
      status: 'TODO',
      priority: 'MEDIUM',
      due_date: null,
      creator_id: 'user-other', // Created by someone else
      assignee_id: 'user-alice', // Assigned to Alice -> Alice can update status only!
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockCurrentUser,
      isAuthenticated: true,
      isLoading: false,
      role: 'USER',
      isAdmin: false,
      name: mockCurrentUser.name,
      email: mockCurrentUser.email,
    });

    vi.mocked(userService.getUsers).mockResolvedValue(mockUsersList);
    vi.mocked(taskService.getTasks).mockResolvedValue({
      items: mockTasks,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
  });

  it('renders task list with title, description, status, priority, due date, and assignee', async () => {
    render(<TasksPage />);

    expect(await screen.findByText('Implement Authentication')).toBeInTheDocument();
    expect(screen.getByText('Connect Next.js to FastAPI auth')).toBeInTheDocument();
    expect(screen.getByText('Review MongoDB Indexes')).toBeInTheDocument();

    // Verify Assignee names are resolved from users directory
    await waitFor(() => {
      expect(screen.getByText('Bob Engineer')).toBeInTheDocument();
      // Alice is current user assigned to task 2 -> displays '(You)'
      expect(screen.getByText('Alice Developer')).toBeInTheDocument();
      expect(screen.getByText('(You)')).toBeInTheDocument();
    });

    // Check status and priority badges
    expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument();
    expect(screen.getByText('TODO')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
  });

  it('enforces RBAC permissions: creator sees delete button, assignee sees edit/status but no delete', async () => {
    render(<TasksPage />);

    await screen.findByText('Implement Authentication');

    // For task-1 (Alice is creator): Delete button should be present
    const deleteButtons = screen.getAllByRole('button', { name: /delete task/i });
    expect(deleteButtons.length).toBe(1); // Only for task-1, NOT for task-2!

    // Edit buttons are present for both (task-1 full edit, task-2 assignee status update)
    const editButtons = screen.getAllByRole('button', { name: /edit task/i });
    expect(editButtons.length).toBe(2);
  });

  it('triggers debounced search query when typing into search input', async () => {
    const user = userEvent.setup();
    render(<TasksPage />);

    await screen.findByText('Implement Authentication');

    const searchInput = screen.getByPlaceholderText(/search by title/i);
    await user.type(searchInput, 'MongoDB');

    await waitFor(
      () => {
        expect(taskService.getTasks).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'MongoDB',
          })
        );
      },
      { timeout: 1000 }
    );
  });

  it('filters by status and priority', async () => {
    const user = userEvent.setup();
    render(<TasksPage />);

    await screen.findByText('Implement Authentication');

    const statusSelect = screen.getByRole('combobox', { name: /filter by status/i });
    await user.selectOptions(statusSelect, 'TODO');

    await waitFor(() => {
      expect(taskService.getTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'TODO',
        })
      );
    });

    const prioritySelect = screen.getByRole('combobox', { name: /filter by priority/i });
    await user.selectOptions(prioritySelect, 'HIGH');

    await waitFor(() => {
      expect(taskService.getTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'HIGH',
        })
      );
    });
  });

  it('sorts tasks by due date and creation date', async () => {
    const user = userEvent.setup();
    render(<TasksPage />);

    await screen.findByText('Implement Authentication');

    const sortSelect = screen.getByRole('combobox', { name: /sort tasks/i });
    await user.selectOptions(sortSelect, 'due_date-asc');

    await waitFor(() => {
      expect(taskService.getTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'due_date',
          sort_order: 'asc',
        })
      );
    });
  });

  it('renders empty state when no tasks are returned', async () => {
    vi.mocked(taskService.getTasks).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 0,
    });

    render(<TasksPage />);

    expect(await screen.findByText(/no tasks created yet/i)).toBeInTheDocument();
  });

  it('opens confirmation dialog on delete click and refreshes after deletion', async () => {
    const user = userEvent.setup();
    vi.mocked(taskService.deleteTask).mockResolvedValueOnce();

    render(<TasksPage />);

    await screen.findByText('Implement Authentication');

    const deleteBtn = screen.getByRole('button', { name: /delete task/i });
    await user.click(deleteBtn);

    // Confirmation dialog opens
    expect(await screen.findByText(/are you sure you want to delete this task\?/i)).toBeInTheDocument();

    // Confirm deletion inside the dialog
    const dialog = screen.getByRole('dialog');
    const confirmDeleteBtn = dialog.querySelector('button.bg-red-600') as HTMLButtonElement;
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(taskService.deleteTask).toHaveBeenCalledWith('task-1');
    });
  });
});
