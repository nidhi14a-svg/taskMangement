import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskFormModal } from '@/components/tasks/TaskFormModal';
import { taskService } from '@/api/services/taskService';
import { userService } from '@/api/services/userService';
import * as CurrentUserHook from '@/hooks/useCurrentUser';
import { Task, User } from '@/types';

vi.mock('@/api/services/taskService', () => ({
  taskService: {
    createTask: vi.fn(),
    updateTask: vi.fn(),
  },
}));

vi.mock('@/api/services/userService', () => ({
  userService: {
    getUsers: vi.fn(),
  },
}));

describe('TaskFormModal', () => {
  const mockCurrentUser: User = {
    id: 'user-creator',
    name: 'Alice Creator',
    email: 'alice@example.com',
    role: 'USER',
    created_at: '',
    updated_at: '',
  };

  const mockUsersList: User[] = [
    {
      id: 'user-creator',
      name: 'Alice Creator',
      email: 'alice@example.com',
      role: 'USER',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'user-bob',
      name: 'Bob Engineer',
      email: 'bob@example.com',
      role: 'USER',
      created_at: '',
      updated_at: '',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userService.getUsers).mockResolvedValue(mockUsersList);

    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: mockCurrentUser,
      isAuthenticated: true,
      isLoading: false,
      role: 'USER',
      isAdmin: false,
      name: mockCurrentUser.name,
      email: mockCurrentUser.email,
    });
  });

  it('renders all required form fields and loads users into assignee dropdown', async () => {
    render(<TaskFormModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /create new task/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/workflow status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/priority level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(userService.getUsers).toHaveBeenCalled();
      expect(screen.getByText(/bob engineer/i)).toBeInTheDocument();
    });
  });

  it('validates client-side constraints (title is required)', async () => {
    const user = userEvent.setup();
    render(<TaskFormModal isOpen={true} onClose={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: /create task/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/task title is required/i)).toBeInTheDocument();
    expect(taskService.createTask).not.toHaveBeenCalled();
  });

  it('creates task on valid submission in Create mode', async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const createdTask: Task = {
      id: 'new-id-123',
      title: 'Setup Redis caching',
      status: 'TODO',
      priority: 'HIGH',
      creator_id: 'user-creator',
      created_at: '',
      updated_at: '',
    };
    vi.mocked(taskService.createTask).mockResolvedValueOnce(createdTask);

    render(
      <TaskFormModal
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    await user.type(screen.getByLabelText(/task title/i), 'Setup Redis caching');
    await user.type(screen.getByLabelText(/description/i), 'Add cache layer to task queries');
    await user.selectOptions(screen.getByLabelText(/priority level/i), 'HIGH');

    await user.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => {
      expect(taskService.createTask).toHaveBeenCalledWith({
        title: 'Setup Redis caching',
        description: 'Add cache layer to task queries',
        status: 'TODO',
        priority: 'HIGH',
        due_date: undefined,
        assignee_id: undefined,
      });
      expect(handleSuccess).toHaveBeenCalledWith(createdTask);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('prepopulates form in Edit mode and updates task fields', async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const existingTask: Task = {
      id: 'task-edit-55',
      title: 'Initial Title',
      description: 'Initial Description',
      status: 'TODO',
      priority: 'LOW',
      creator_id: 'user-creator',
      created_at: '',
      updated_at: '',
    };

    const updatedTask: Task = {
      ...existingTask,
      title: 'Updated Title',
      priority: 'MEDIUM',
    };
    vi.mocked(taskService.updateTask).mockResolvedValueOnce(updatedTask);

    render(
      <TaskFormModal
        isOpen={true}
        onClose={handleClose}
        task={existingTask}
        onSuccess={handleSuccess}
      />
    );

    expect(screen.getByRole('heading', { name: /edit task deliverable/i })).toBeInTheDocument();
    const titleInput = screen.getByLabelText(/task title/i);
    expect(titleInput).toHaveValue('Initial Title');

    await user.clear(titleInput);
    await user.type(titleInput, 'Updated Title');
    await user.selectOptions(screen.getByLabelText(/priority level/i), 'MEDIUM');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(taskService.updateTask).toHaveBeenCalledWith('task-edit-55', {
        title: 'Updated Title',
        description: 'Initial Description',
        status: 'TODO',
        priority: 'MEDIUM',
        due_date: null,
        assignee_id: null,
      });
      expect(handleSuccess).toHaveBeenCalledWith(updatedTask);
    });
  });

  it('restricts non-status fields when edited by an assignee (assignee status-only permission)', async () => {
    const user = userEvent.setup();

    // User is assignee, but NOT creator
    const assigneeOnlyUser: User = {
      id: 'user-bob',
      name: 'Bob Engineer',
      email: 'bob@example.com',
      role: 'USER',
      created_at: '',
      updated_at: '',
    };
    vi.spyOn(CurrentUserHook, 'useCurrentUser').mockReturnValue({
      user: assigneeOnlyUser,
      isAuthenticated: true,
      isLoading: false,
      role: 'USER',
      isAdmin: false,
      name: assigneeOnlyUser.name,
      email: assigneeOnlyUser.email,
    });

    const assignedTask: Task = {
      id: 'task-assigned-1',
      title: 'Created by Alice',
      description: 'Alice description',
      status: 'TODO',
      priority: 'HIGH',
      creator_id: 'user-alice', // Different from current user
      assignee_id: 'user-bob', // Matches current user!
      created_at: '',
      updated_at: '',
    };

    vi.mocked(taskService.updateTask).mockResolvedValueOnce({
      ...assignedTask,
      status: 'IN_PROGRESS',
    });

    render(
      <TaskFormModal
        isOpen={true}
        onClose={vi.fn()}
        task={assignedTask}
      />
    );

    // Verify restricted fields are disabled
    expect(screen.getByLabelText(/task title/i)).toBeDisabled();
    expect(screen.getByLabelText(/description/i)).toBeDisabled();
    expect(screen.getByLabelText(/priority level/i)).toBeDisabled();
    expect(screen.getByLabelText(/due date/i)).toBeDisabled();
    expect(screen.getByLabelText(/assignee/i)).toBeDisabled();

    // Verify status dropdown remains ENABLED
    const statusSelect = screen.getByLabelText(/workflow status/i);
    expect(statusSelect).not.toBeDisabled();

    // Verify info banner is displayed
    expect(
      screen.getByText(/you are assigned to this task\. backend access control permits you to update the task status/i)
    ).toBeInTheDocument();

    // Update status and submit
    await user.selectOptions(statusSelect, 'IN_PROGRESS');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      // Must ONLY send status to updateTask
      expect(taskService.updateTask).toHaveBeenCalledWith('task-assigned-1', {
        status: 'IN_PROGRESS',
      });
    });
  });
});
