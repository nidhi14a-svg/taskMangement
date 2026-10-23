import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import {
  Task,
  TaskPaginationResponse,
  TaskFilterParams,
  TaskCreatePayload,
  TaskUpdatePayload,
} from '@/types';

export const taskService = {
  /**
   * Retrieves paginated task list with optional filtering and sorting.
   * Calls GET /api/v1/tasks.
   */
  async getTasks(params?: TaskFilterParams): Promise<TaskPaginationResponse> {
    const response = await apiClient.get<TaskPaginationResponse>(ENDPOINTS.TASKS.BASE, {
      params,
    });
    return response.data;
  },

  /**
   * Retrieves a single task by ID.
   * Calls GET /api/v1/tasks/{task_id}.
   */
  async getTaskById(id: string): Promise<Task> {
    const response = await apiClient.get<Task>(ENDPOINTS.TASKS.BY_ID(id));
    return response.data;
  },

  /**
   * Creates a new task.
   * Calls POST /api/v1/tasks.
   */
  async createTask(taskData: TaskCreatePayload): Promise<Task> {
    const response = await apiClient.post<Task>(ENDPOINTS.TASKS.BASE, taskData);
    return response.data;
  },

  /**
   * Updates an existing task with role and ownership checks.
   * Calls PATCH /api/v1/tasks/{task_id}.
   */
  async updateTask(id: string, taskData: TaskUpdatePayload): Promise<Task> {
    const response = await apiClient.patch<Task>(ENDPOINTS.TASKS.BY_ID(id), taskData);
    return response.data;
  },

  /**
   * Deletes a task. Permitted for creator or ADMIN.
   * Calls DELETE /api/v1/tasks/{task_id}.
   */
  async deleteTask(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TASKS.BY_ID(id));
  },
};
