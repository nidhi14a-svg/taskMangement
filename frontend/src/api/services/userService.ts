import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import { User } from '@/types';

export const userService = {
  /**
   * Retrieves the directory of registered users for task assignment.
   * Calls GET /api/v1/users.
   */
  async getUsers(): Promise<User[]> {
    const response = await apiClient.get<User[]>(ENDPOINTS.USERS.BASE);
    return response.data;
  },
};
