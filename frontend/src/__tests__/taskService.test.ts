import { describe, it, expect, vi, beforeEach } from 'vitest';
import { taskService } from '@/api/services/taskService';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  AUTH_UNAUTHORIZED_EVENT: 'taskflow:unauthorized',
}));

describe('taskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls GET /api/v1/tasks with query params and returns pagination response', async () => {
    const mockPagination = {
      items: [
        {
          id: 'task-1',
          title: 'Design UI',
          status: 'TODO' as const,
          priority: 'HIGH' as const,
          creator_id: 'user-1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockPagination });

    const result = await taskService.getTasks({
      search: 'Design',
      status: 'TODO',
      page: 1,
      page_size: 10,
    });

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/tasks', {
      params: {
        search: 'Design',
        status: 'TODO',
        page: 1,
        page_size: 10,
      },
    });
    expect(result).toEqual(mockPagination);
  });

  it('calls GET /api/v1/tasks/{id} and returns a single task', async () => {
    const mockTask = {
      id: 'task-123',
      title: 'Fix issue',
      status: 'IN_PROGRESS' as const,
      priority: 'MEDIUM' as const,
      creator_id: 'user-2',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockTask });

    const result = await taskService.getTaskById('task-123');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/tasks/task-123');
    expect(result).toEqual(mockTask);
  });

  it('calls POST /api/v1/tasks to create a task', async () => {
    const payload = {
      title: 'New Deliverable',
      status: 'TODO' as const,
      priority: 'HIGH' as const,
    };
    const createdTask = {
      id: 'task-new',
      ...payload,
      creator_id: 'user-current',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: createdTask });

    const result = await taskService.createTask(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/tasks', payload);
    expect(result.id).toBe('task-new');
  });

  it('calls PATCH /api/v1/tasks/{id} to update task fields', async () => {
    const updatePayload = {
      status: 'COMPLETED' as const,
    };
    const updatedTask = {
      id: 'task-123',
      title: 'Existing',
      status: 'COMPLETED' as const,
      priority: 'LOW' as const,
      creator_id: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: updatedTask });

    const result = await taskService.updateTask('task-123', updatePayload);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/tasks/task-123', updatePayload);
    expect(result.status).toBe('COMPLETED');
  });

  it('calls DELETE /api/v1/tasks/{id} to delete task', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: null });

    await taskService.deleteTask('task-999');
    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/tasks/task-999');
  });
});
