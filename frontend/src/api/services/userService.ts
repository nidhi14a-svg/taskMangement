import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import { User } from '@/types';

export const userService = {
  /**
   * Retrieves the directory of registered users for task assignment.
   * Calls GET /api/v1/users.
   * Scoped by backend: ADMIN sees all; TEAM_LEAD sees their department; EMPLOYEE sees their department.
   */
  async getUsers(department?: string): Promise<User[]> {
    const params = department ? { department } : {};
    const response = await apiClient.get<User[]>(ENDPOINTS.USERS.BASE, { params });
    return response.data;
  },

  /**
   * Retrieves single user details by ID.
   */
  async getUserById(id: string): Promise<User> {
    const response = await apiClient.get<User>(ENDPOINTS.USERS.BY_ID(id));
    return response.data;
  },

  /**
   * Updates an existing user's details (e.g. role, department, position).
   * Authorized for ADMIN.
   */
  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const response = await apiClient.patch<User>(ENDPOINTS.USERS.BY_ID(id), data);
    return response.data;
  },
};
