export function formatDate(dateString?: string): string {
  if (!dateString) return 'No date';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString?: string): string {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/**
 * Safely extracts human-readable error string from backend response.
 * Handles FastAPI / Pydantic validation error lists [{ loc, msg, type, ... }] as well as string details.
 */
export function extractErrorMessage(
  detail: any,
  fallback = 'An unexpected error occurred. Please try again.'
): string {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const field = Array.isArray(item.loc)
            ? item.loc.filter((segment: any) => segment !== 'body').join('.')
            : '';
          const msg = item.msg || JSON.stringify(item);
          return field ? `${field}: ${msg}` : msg;
        }
        return String(item);
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join('; ') : fallback;
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  return String(detail);
}
