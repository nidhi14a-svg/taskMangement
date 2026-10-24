import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import {
  Notification,
  NotificationListResponse,
  UnreadCountResponse,
} from '@/types';

export interface NotificationFilterParams {
  page?: number;
  limit?: number;
  unread_only?: boolean;
}

export interface MarkAllReadResponse {
  message: string;
  marked_read_count: number;
}

export const notificationService = {
  /**
   * Retrieves paginated notifications for the current authenticated user.
   * Calls GET /api/v1/notifications.
   */
  async getNotifications(params?: NotificationFilterParams): Promise<NotificationListResponse> {
    const response = await apiClient.get<NotificationListResponse>(
      ENDPOINTS.NOTIFICATIONS.BASE,
      { params }
    );
    return response.data;
  },

  /**
   * Retrieves unread notification count for badge display.
   * Calls GET /api/v1/notifications/unread-count.
   */
  async getUnreadCount(): Promise<UnreadCountResponse> {
    const response = await apiClient.get<UnreadCountResponse>(
      ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT
    );
    return response.data;
  },

  /**
   * Marks a single notification as read.
   * Calls PATCH /api/v1/notifications/{id}/read.
   */
  async markAsRead(id: string): Promise<Notification> {
    const response = await apiClient.patch<Notification>(
      ENDPOINTS.NOTIFICATIONS.MARK_READ(id)
    );
    return response.data;
  },

  /**
   * Marks all notifications as read for current user.
   * Calls POST /api/v1/notifications/mark-all-read.
   */
  async markAllAsRead(): Promise<MarkAllReadResponse> {
    const response = await apiClient.post<MarkAllReadResponse>(
      ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ
    );
    return response.data;
  },
};
