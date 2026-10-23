/**
 * Storage Utility for TaskFlow Authentication Tokens.
 *
 * Security Architecture & Trade-Off Documentation:
 * ------------------------------------------------
 * 1. Backend Contract:
 *    The FastAPI backend implements standard OAuth2 Bearer token authentication
 *    via `fastapi.security.HTTPBearer`. Tokens are emitted in the response payload
 *    of `POST /api/v1/auth/login` and validated from the `Authorization: Bearer <token>`
 *    request header. The backend does NOT issue or manage HttpOnly session cookies,
 *    nor does it expose CSRF synchronization endpoints.
 *
 * 2. Token Storage Selection:
 *    Given the backend's bearer token contract, client-side storage (`localStorage`)
 *    is used to persist the JWT across page refreshes and browser tabs.
 *
 * 3. Security Considerations & Trade-Offs:
 *    - Trade-off: `localStorage` is accessible to client-side JavaScript executing in
 *      the origin. This introduces vulnerability if an XSS (Cross-Site Scripting)
 *      vulnerability is introduced.
 *    - Mitigations in Place:
 *      a) Strict React DOM auto-escaping (no `dangerouslySetInnerHTML`).
 *      b) All form inputs are sanitized and validated with Zod.
 *      c) Short-lived/controlled token lifetimes enforced by backend JWT signing.
 *      d) Immediate token clearance on 401 Unauthorized responses or explicit logout.
 *      e) Production recommendation: If HttpOnly cookie support is added to the FastAPI
 *         backend in the future along with CSRF protection, migration to cookies is
 *         seamless via apiClient configuration.
 */

const TOKEN_KEY = 'taskflow_auth_token';

export const storage = {
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      console.warn('Unable to access localStorage for auth token', e);
      return null;
    }
  },

  setToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.error('Failed to save auth token to localStorage', e);
    }
  },

  removeToken: (): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.error('Failed to remove auth token from localStorage', e);
    }
  },
};
