import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { notificationService } from '@/api/services/notificationService';
import * as AuthHook from '@/hooks/useAuth';
import { Notification } from '@/types';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/api/services/notificationService', () => ({
  notificationService: {
    getUnreadCount: vi.fn(),
    getNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  },
}));

describe('NotificationBell Component', () => {
  const mockUser = {
    id: 'user-emp-1',
    name: 'Sarah Connor',
    email: 'sarah@example.com',
    role: 'EMPLOYEE' as const,
    created_at: '',
    updated_at: '',
  };

  const mockNotifications: Notification[] = [
    {
      id: 'notif-1',
      recipient_id: 'user-emp-1',
      title: 'New task assigned',
      message: 'Alex assigned you "Implement Payment Gateway". Priority: High.',
      task_id: 'task-101',
      type: 'TASK_ASSIGNED',
      is_read: false,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-2',
      recipient_id: 'user-emp-1',
      title: 'Task priority updated',
      message: 'Priority for "Fix Memory Leak" changed from Medium to Urgent.',
      task_id: 'task-102',
      type: 'TASK_PRIORITY_CHANGED',
      is_read: true,
      created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      read_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthHook, 'useAuth').mockReturnValue({
      user: mockUser,
      token: 'fake-jwt',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({
      unread_count: 1,
    });
    vi.mocked(notificationService.getNotifications).mockResolvedValue({
      items: mockNotifications,
      total: 2,
      unread_count: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    vi.mocked(notificationService.markAsRead).mockResolvedValue({
      ...mockNotifications[0],
      is_read: true,
    });
    vi.mocked(notificationService.markAllAsRead).mockResolvedValue({
      message: 'Marked all as read',
      marked_read_count: 1,
    });
  });

  it('renders notification bell icon and displays unread badge count', async () => {
    render(<NotificationBell />);

    expect(screen.getByTestId('notification-bell-btn')).toBeInTheDocument();
    await waitFor(() => {
      const badge = screen.getByTestId('notification-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('1');
    });
  });

  it('opens dropdown panel on bell click and loads latest notifications', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    const bellBtn = screen.getByTestId('notification-bell-btn');
    await user.click(bellBtn);

    await waitFor(() => {
      expect(screen.getByTestId('notification-dropdown')).toBeInTheDocument();
      expect(screen.getByText('New task assigned')).toBeInTheDocument();
      expect(screen.getByText('Task priority updated')).toBeInTheDocument();
    });

    expect(notificationService.getNotifications).toHaveBeenCalledWith({ limit: 20 });
  });

  it('visually distinguishes unread notifications with an unread dot and background', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await user.click(screen.getByTestId('notification-bell-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('unread-dot')).toBeInTheDocument();
      const unreadItem = screen.getByTestId('notification-item-notif-1');
      expect(unreadItem.className).toContain('bg-indigo-50/40');
    });
  });

  it('marks a single notification as read on button click', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await user.click(screen.getByTestId('notification-bell-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('mark-read-btn-notif-1')).toBeInTheDocument();
    });

    const markReadBtn = screen.getByTestId('mark-read-btn-notif-1');
    await user.click(markReadBtn);

    await waitFor(() => {
      expect(notificationService.markAsRead).toHaveBeenCalledWith('notif-1');
    });
  });

  it('marks all notifications as read when clicking Mark all read', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await user.click(screen.getByTestId('notification-bell-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('mark-all-read-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('mark-all-read-btn'));

    await waitFor(() => {
      expect(notificationService.markAllAsRead).toHaveBeenCalled();
    });
  });

  it('navigates to related task when clicking a notification item', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await user.click(screen.getByTestId('notification-bell-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('notification-item-notif-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('notification-item-notif-1'));

    expect(mockPush).toHaveBeenCalledWith('/tasks?taskId=task-101&filter=assigned');
  });

  it('displays sensible empty state when there are no notifications', async () => {
    vi.mocked(notificationService.getUnreadCount).mockResolvedValue({
      unread_count: 0,
    });
    vi.mocked(notificationService.getNotifications).mockResolvedValue({
      items: [],
      total: 0,
      unread_count: 0,
      page: 1,
      page_size: 20,
      total_pages: 0,
    });

    const user = userEvent.setup();
    render(<NotificationBell />);

    await user.click(screen.getByTestId('notification-bell-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('empty-notifications')).toBeInTheDocument();
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
  });
});
