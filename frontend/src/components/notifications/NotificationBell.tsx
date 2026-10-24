'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  Check,
  Clock,
  AlertCircle,
  Inbox,
  X,
  ExternalLink,
  Flame,
  Calendar,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';
import { notificationService } from '@/api/services/notificationService';
import { Notification, NotificationType } from '@/types';

function formatTimeAgo(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'TASK_ASSIGNED':
      return {
        icon: UserCheck,
        bg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        label: 'Assigned',
      };
    case 'TASK_REASSIGNED':
      return {
        icon: UserCheck,
        bg: 'bg-purple-50 text-purple-600 border-purple-200',
        label: 'Reassigned',
      };
    case 'TASK_PRIORITY_CHANGED':
      return {
        icon: Flame,
        bg: 'bg-rose-50 text-rose-600 border-rose-200',
        label: 'Priority',
      };
    case 'TASK_DUE_DATE_CHANGED':
      return {
        icon: Calendar,
        bg: 'bg-blue-50 text-blue-600 border-blue-200',
        label: 'Due Date',
      };
    default:
      return {
        icon: AlertCircle,
        bg: 'bg-indigo-50 text-indigo-600 border-indigo-200',
        label: 'Task Alert',
      };
  }
}

export const NotificationBell: React.FC = () => {
  const router = useRouter();
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [activeToast, setActiveToast] = useState<Notification | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef<number>(0);
  const isInitialFetchRef = useRef<boolean>(true);

  // Fetch unread count for badge
  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await notificationService.getUnreadCount();
      const newCount = data.unread_count;

      // If unread count increased and not initial load, trigger toast alert
      if (!isInitialFetchRef.current && newCount > prevUnreadRef.current) {
        // Fetch the newest notification to show in toast
        try {
          const latestList = await notificationService.getNotifications({ limit: 1 });
          if (latestList.items && latestList.items.length > 0) {
            setActiveToast(latestList.items[0]);
          }
        } catch {
          // Toast fetch failure is non-critical
        }
      }

      isInitialFetchRef.current = false;
      prevUnreadRef.current = newCount;
      setUnreadCount(newCount);
    } catch {
      // Background poll error handled silently
    }
  }, [user?.id]);

  // Fetch full notification list when dropdown is opened
  const fetchNotificationList = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const data = await notificationService.getNotifications({ limit: 20 });
      setNotifications(data.items || []);
      setUnreadCount(data.unread_count);
      prevUnreadRef.current = data.unread_count;
    } catch {
      // List fetch error handled gracefully
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Poll unread count every 15s and on custom events
  useEffect(() => {
    fetchUnreadCount();

    const handleDataChange = () => {
      fetchUnreadCount();
      if (isOpen) {
        fetchNotificationList();
      }
    };

    window.addEventListener('task-created', handleDataChange);
    window.addEventListener('task-updated', handleDataChange);
    window.addEventListener('notification-updated', handleDataChange);

    const interval = setInterval(fetchUnreadCount, 15000);

    return () => {
      window.removeEventListener('task-created', handleDataChange);
      window.removeEventListener('task-updated', handleDataChange);
      window.removeEventListener('notification-updated', handleDataChange);
      clearInterval(interval);
    };
  }, [fetchUnreadCount, fetchNotificationList, isOpen]);

  // Fetch notifications list when opening dropdown
  useEffect(() => {
    if (isOpen) {
      fetchNotificationList();
    }
  }, [isOpen, fetchNotificationList]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dismiss toast after 5s
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => {
        setActiveToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  // Mark a single notification as read
  const handleMarkAsRead = async (
    notification: Notification,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    const id = notification.id || notification._id;
    if (!id || notification.is_read) return;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        (n.id || n._id) === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);

    try {
      await notificationService.markAsRead(id);
    } catch {
      // Revert if API fails
      fetchNotificationList();
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);
    prevUnreadRef.current = 0;

    try {
      await notificationService.markAllAsRead();
    } catch {
      // Revert if API fails
      fetchNotificationList();
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Click on a notification: mark read and route to the task
  const handleNotificationClick = async (notification: Notification) => {
    const id = notification.id || notification._id;
    if (id && !notification.is_read) {
      handleMarkAsRead(notification);
    }
    setIsOpen(false);

    if (notification.task_id) {
      router.push(`/tasks?taskId=${notification.task_id}&filter=assigned`);
    } else {
      router.push('/tasks?filter=assigned');
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer',
          isOpen && 'bg-slate-100 text-slate-800'
        )}
        aria-label="Open notifications"
        aria-expanded={isOpen}
        aria-haspopup="true"
        data-testid="notification-bell-btn"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white animate-pulse"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {isOpen && (
        <div
          data-testid="notification-dropdown"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white shadow-2xl border border-slate-200/90 py-0 z-50 animate-in fade-in zoom-in-95 duration-100 select-auto overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 tracking-tight">
                Notifications
              </span>
              {unreadCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200/70 text-slate-600">
                  All caught up
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingAll}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  data-testid="mark-all-read-btn"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                onClick={() => fetchNotificationList()}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                title="Refresh notifications"
                aria-label="Refresh notifications"
              >
                <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* List Area */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {isLoading && notifications.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-2" />
                <p className="text-xs text-slate-500">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 px-4 text-center" data-testid="empty-notifications">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400 mb-2.5">
                  <Inbox className="w-6 h-6 stroke-[1.5]" />
                </div>
                <p className="text-xs font-semibold text-slate-800">No notifications yet</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[220px] mx-auto leading-relaxed">
                  When tasks are assigned to you or updated, you will see alerts right here.
                </p>
              </div>
            ) : (
              notifications.map((notification) => {
                const id = notification.id || notification._id || '';
                const isUnread = !notification.is_read;
                const iconMeta = getNotificationIcon(notification.type);
                const IconComponent = iconMeta.icon;

                return (
                  <div
                    key={id}
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-item-${id}`}
                    className={cn(
                      'p-3.5 hover:bg-slate-50/90 transition-colors cursor-pointer flex items-start gap-3 relative group',
                      isUnread ? 'bg-indigo-50/40 border-l-2 border-l-indigo-600' : 'bg-white'
                    )}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border',
                        iconMeta.bg
                      )}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={cn(
                            'text-xs truncate',
                            isUnread
                              ? 'font-bold text-slate-900'
                              : 'font-semibold text-slate-700'
                          )}
                        >
                          {notification.title}
                        </span>
                        {isUnread && (
                          <span
                            data-testid="unread-dot"
                            className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"
                            title="Unread notification"
                          />
                        )}
                      </div>

                      <p className="text-[11px] text-slate-600 mt-1 leading-snug line-clamp-2">
                        {notification.message}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {iconMeta.label}
                        </span>
                      </div>
                    </div>

                    {/* Mark single as read button on hover or if unread */}
                    {isUnread && (
                      <button
                        onClick={(e) => handleMarkAsRead(notification, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-slate-200/70 text-slate-400 hover:text-indigo-600 cursor-pointer self-start"
                        title="Mark as read"
                        aria-label="Mark as read"
                        data-testid={`mark-read-btn-${id}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2 border-t border-slate-100 bg-slate-50/70 text-center">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/tasks?filter=assigned');
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors w-full py-1 cursor-pointer flex items-center justify-center gap-1"
              >
                <span>View all assigned tasks</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Real-time Toast Alert for New Task Notification */}
      {activeToast && (
        <div
          role="alert"
          data-testid="notification-toast"
          className="fixed top-4 right-4 z-50 max-w-sm bg-white rounded-xl shadow-2xl border-l-4 border-l-indigo-600 border border-slate-200 p-3.5 flex items-start gap-3 animate-in slide-in-from-top-4 duration-200 cursor-pointer hover:shadow-xl transition-shadow"
          onClick={() => {
            handleNotificationClick(activeToast);
            setActiveToast(null);
          }}
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900">{activeToast.title}</p>
            <p className="text-xs text-slate-600 truncate mt-0.5">{activeToast.message}</p>
            <p className="text-[10px] text-indigo-600 font-semibold mt-1">
              Click to view deliverable
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveToast(null);
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
            aria-label="Dismiss alert"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
