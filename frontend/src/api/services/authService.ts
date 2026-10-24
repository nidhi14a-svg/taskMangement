import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import { User } from '@/types';
import { storage } from '@/utils/storage';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role?: string;
  position?: string;
  department?: string;
  invite_code?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authService = {
  /**
   * Authenticate user with email and password via POST /api/v1/auth/login.
   * On success, stores the access token in client storage.
   */
  async login(payloadOrEmail: LoginPayload | string, password?: string): Promise<LoginResponse> {
    const payload: LoginPayload =
      typeof payloadOrEmail === 'string'
        ? { email: payloadOrEmail, password: password || '' }
        : payloadOrEmail;

    const response = await apiClient.post<LoginResponse>(ENDPOINTS.AUTH.LOGIN, {
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
    });

    if (response.data.access_token) {
      storage.setToken(response.data.access_token);
    }
    return response.data;
  },

  /**
   * Register a new user account via POST /api/v1/auth/register.
   * Transmits role, position, department, and invitation code to backend where RBAC policies are enforced.
   */
  async register(
    payloadOrEmail: RegisterPayload | string,
    password?: string,
    name?: string
  ): Promise<User> {
    const payload: RegisterPayload =
      typeof payloadOrEmail === 'string'
        ? { email: payloadOrEmail, password: password || '', name: name || '' }
        : payloadOrEmail;

    const requestBody: Record<string, any> = {
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
    };

    if (payload.role) requestBody.role = payload.role;
    if (payload.position) requestBody.position = payload.position;
    if (payload.department) requestBody.department = payload.department;
    if (payload.invite_code) requestBody.invite_code = payload.invite_code;

    const response = await apiClient.post<User>(ENDPOINTS.AUTH.REGISTER, requestBody);
    return response.data;
  },

  /**
   * Fetch current authenticated user's profile via GET /api/v1/auth/me.
   */
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>(ENDPOINTS.AUTH.ME);
    return response.data;
  },

  /**
   * Clears stored authentication token.
   */
  logout(): void {
    storage.removeToken();
  },

  /**
   * Checks whether an access token is currently stored in the client.
   */
  isAuthenticated(): boolean {
    return Boolean(storage.getToken());
  },
};
