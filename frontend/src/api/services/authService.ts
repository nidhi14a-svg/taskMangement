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
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user?: User;
}

export const authService = {
  async login(payloadOrEmail: LoginPayload | string, password?: string): Promise<LoginResponse> {
    const payload: LoginPayload =
      typeof payloadOrEmail === 'string'
        ? { email: payloadOrEmail, password: password || '' }
        : payloadOrEmail;

    const response = await apiClient.post<LoginResponse>(ENDPOINTS.AUTH.LOGIN, payload);
    if (response.data.access_token) {
      storage.setToken(response.data.access_token);
    }
    return response.data;
  },

  async register(
    payloadOrEmail: RegisterPayload | string,
    password?: string,
    name?: string
  ): Promise<User> {
    const payload: RegisterPayload =
      typeof payloadOrEmail === 'string'
        ? { email: payloadOrEmail, password: password || '', name: name || '' }
        : payloadOrEmail;

    const response = await apiClient.post<User>(ENDPOINTS.AUTH.REGISTER, payload);
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>(ENDPOINTS.AUTH.ME);
    return response.data;
  },

  logout(): void {
    storage.removeToken();
  },

  isAuthenticated(): boolean {
    return !!storage.getToken();
  },
};

