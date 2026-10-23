import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteTaskDialog } from '@/components/tasks/DeleteTaskDialog';
import { taskService } from '@/api/services/taskService';
import { Task } from '@/types';

vi.mock('@/api/services/taskService', () => ({
  taskService: {
    deleteTask: vi.fn(),
  },
}));

describe('DeleteTaskDialog', () => {
  const sampleTask: Task = {
    id: 'task-del-1',
    title: 'Obsolete Deliverable',
    status: 'TODO',
    priority: 'LOW',
    creator_id: 'user-creator',
    created_at: '',
    updated_at: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders confirmation message with task title', () => {
    render(
      <DeleteTaskDialog
        isOpen={true}
        onClose={vi.fn()}
        task={sampleTask}
      />
    );

    expect(screen.getByRole('heading', { name: /delete task/i })).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to delete this task\?/i)).toBeInTheDocument();
    expect(screen.getByText(/obsolete deliverable/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked without deleting', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <DeleteTaskDialog
        isOpen={true}
        onClose={handleClose}
        task={sampleTask}
      />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalled();
    expect(taskService.deleteTask).not.toHaveBeenCalled();
  });

  it('calls taskService.deleteTask and dispatches event on confirmation', async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();
    vi.mocked(taskService.deleteTask).mockResolvedValueOnce();

    render(
      <DeleteTaskDialog
        isOpen={true}
        onClose={handleClose}
        task={sampleTask}
        onSuccess={handleSuccess}
      />
    );

    await user.click(screen.getByRole('button', { name: /^delete task$/i }));

    await waitFor(() => {
      expect(taskService.deleteTask).toHaveBeenCalledWith('task-del-1');
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('displays error alert when delete fails with 403 Forbidden', async () => {
    const user = userEvent.setup();
    vi.mocked(taskService.deleteTask).mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          detail: 'You do not have permission to delete this task. Only the creator or an administrator can delete tasks.',
        },
      },
    });

    render(
      <DeleteTaskDialog
        isOpen={true}
        onClose={vi.fn()}
        task={sampleTask}
      />
    );

    await user.click(screen.getByRole('button', { name: /^delete task$/i }));

    expect(
      await screen.findByText(
        'You do not have permission to delete this task. Only the creator or an administrator can delete tasks.'
      )
    ).toBeInTheDocument();
  });
});
