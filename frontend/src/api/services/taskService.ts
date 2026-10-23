import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import { Task, TaskPaginationResponse, TaskFilterParams } from '@/types';

export const taskService = {
  async getTasks(params?: TaskFilterParams): Promise<TaskPaginationResponse> {
    const response = await apiClient.get<TaskPaginationResponse>(ENDPOINTS.TASKS.BASE, {
      params,
    });
    return response.data;
  },

  async getTaskById(id: string): Promise<Task> {
    const response = await apiClient.get<Task>(ENDPOINTS.TASKS.BY_ID(id));
    return response.data;
  },

  async createTask(taskData: Partial<Task>): Promise<Task> {
    const response = await apiClient.post<Task>(ENDPOINTS.TASKS.BASE, taskData);
    return response.data;
  },

  async updateTask(id: string, taskData: Partial<Task>): Promise<Task> {
    const response = await apiClient.patch<Task>(ENDPOINTS.TASKS.BY_ID(id), taskData);
    return response.data;
  },

  async deleteTask(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TASKS.BY_ID(id));
  },
};
