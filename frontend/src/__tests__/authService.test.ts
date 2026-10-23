import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '@/api/services/authService';
import { apiClient } from '@/api/client';
import { storage } from '@/utils/storage';

vi.mock('@/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
  AUTH_UNAUTHORIZED_EVENT: 'taskflow:unauthorized',
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('login', () => {
    it('authenticates user and stores access token', async () => {
      const mockResponse = {
        data: {
          access_token: 'mock-jwt-token-xyz',
          token_type: 'bearer',
          user: {
            id: '123',
            name: 'Jane Doe',
            email: 'jane@example.com',
            role: 'USER',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await authService.login({
        email: '  Jane@Example.COM  ',
        password: 'Password123!',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/login', {
        email: 'jane@example.com',
        password: 'Password123!',
      });
      expect(storage.getToken()).toBe('mock-jwt-token-xyz');
      expect(result.access_token).toBe('mock-jwt-token-xyz');
      expect(result.user.name).toBe('Jane Doe');
    });

    it('rejects on invalid credentials (401)', async () => {
      const errorResponse = {
        response: {
          status: 401,
          data: { detail: 'Incorrect email or password.' },
        },
      };
      vi.mocked(apiClient.post).mockRejectedValueOnce(errorResponse);

      await expect(
        authService.login({
          email: 'wrong@example.com',
          password: 'badpassword',
        })
      ).rejects.toEqual(errorResponse);

      expect(storage.getToken()).toBeNull();
    });
  });

  describe('register', () => {
    it('registers user without public role selector and returns user profile', async () => {
      const mockResponse = {
        data: {
          id: 'user-789',
          name: 'New User',
          email: 'newuser@example.com',
          role: 'USER',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await authService.register({
        name: '  New User  ',
        email: '  NewUser@Example.COM  ',
        password: 'securePassword123',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/register', {
        name: 'New User',
        email: 'newuser@example.com',
        password: 'securePassword123',
      });
      expect(result.email).toBe('newuser@example.com');
      expect(result.role).toBe('USER');
    });

    it('handles duplicate email conflict (409)', async () => {
      const conflictError = {
        response: {
          status: 409,
          data: { detail: 'A user with this email address already exists.' },
        },
      };
      vi.mocked(apiClient.post).mockRejectedValueOnce(conflictError);

      await expect(
        authService.register({
          name: 'Existing User',
          email: 'existing@example.com',
          password: 'Password123!',
        })
      ).rejects.toEqual(conflictError);
    });
  });

  describe('getCurrentUser', () => {
    it('fetches current user profile via GET /api/v1/auth/me', async () => {
      const mockUser = {
        id: 'me-1',
        name: 'Alex Profile',
        email: 'alex@example.com',
        role: 'USER',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockUser });

      const result = await authService.getCurrentUser();
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/auth/me');
      expect(result).toEqual(mockUser);
    });

    it('throws error when token is expired or unauthorized', async () => {
      const error401 = {
        response: {
          status: 401,
          data: { detail: 'Authentication token has expired.' },
        },
      };
      vi.mocked(apiClient.get).mockRejectedValueOnce(error401);

      await expect(authService.getCurrentUser()).rejects.toEqual(error401);
    });
  });

  describe('logout and isAuthenticated', () => {
    it('clears token on logout and updates isAuthenticated state', () => {
      storage.setToken('test-token-active');
      expect(authService.isAuthenticated()).toBe(true);

      authService.logout();
      expect(storage.getToken()).toBeNull();
      expect(authService.isAuthenticated()).toBe(false);
    });
  });
});
