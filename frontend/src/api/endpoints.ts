export const ENDPOINTS = {
  HEALTH: '/health',
  API_V1: '/api/v1',
  API_V1_HEALTH: '/api/v1/health',
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    REGISTER: '/api/v1/auth/register',
    ME: '/api/v1/auth/me',
    ADMIN_CHECK: '/api/v1/auth/admin-check',
  },
  TASKS: {
    BASE: '/api/v1/tasks',
    BY_ID: (id: string) => `/api/v1/tasks/${id}`,
  },
  USERS: {
    BASE: '/api/v1/users',
  },
  DASHBOARD: {
    SUMMARY: '/api/v1/dashboard/summary',
  },
} as const;
