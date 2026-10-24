export const ENDPOINTS = {
  HEALTH: '/health',
  API_V1: '/api/v1',
  API_V1_HEALTH: '/api/v1/health',
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    REGISTER: '/api/v1/auth/register',
    ME: '/api/v1/auth/me',
    ADMIN_CHECK: '/api/v1/auth/admin-check',
    INVITATIONS: '/api/v1/auth/invitations',
    ACTIVATE_VERIFY: '/api/v1/auth/activate/verify',
    ACTIVATE: '/api/v1/auth/activate',
  },
  TASKS: {
    BASE: '/api/v1/tasks',
    BY_ID: (id: string) => `/api/v1/tasks/${id}`,
  },
  USERS: {
    BASE: '/api/v1/users',
    BY_ID: (id: string) => `/api/v1/users/${id}`,
  },
  EMPLOYEES: {
    BASE: '/api/v1/employees',
    BY_ID: (id: string) => `/api/v1/employees/${id}`,
    TEMPLATE: '/api/v1/employees/template',
    IMPORT_PREVIEW: '/api/v1/employees/import/preview',
    IMPORT_CONFIRM: '/api/v1/employees/import/confirm',
    ERROR_REPORT: '/api/v1/employees/import/error-report',
  },
  DASHBOARD: {
    SUMMARY: '/api/v1/dashboard/summary',
  },
  NOTIFICATIONS: {
    BASE: '/api/v1/notifications',
    UNREAD_COUNT: '/api/v1/notifications/unread-count',
    MARK_READ: (id: string) => `/api/v1/notifications/${id}/read`,
    MARK_ALL_READ: '/api/v1/notifications/mark-all-read',
  },
} as const;
