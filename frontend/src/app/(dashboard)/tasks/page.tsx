'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Search,
  Plus,
  RefreshCw,
  Inbox,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { TaskFormModal } from '@/components/tasks/TaskFormModal';
import { DeleteTaskDialog } from '@/components/tasks/DeleteTaskDialog';
import { taskService } from '@/api/services/taskService';
import { userService } from '@/api/services/userService';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getTaskPermissions } from '@/utils/permissions';
import { Task, TaskStatus, TaskPriority, User } from '@/types';

export default function TasksPage() {
  const { user: currentUser } = useCurrentUser();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Search and Filter State
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch users directory for resolving assignee names
  const fetchUsers = useCallback(async () => {
    try {
      const userList = await userService.getUsers();
      setUsers(userList);
    } catch {
      // Continue even if user directory fetch fails
    }
  }, []);

  const usersMap = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) {
      if (u.id) map.set(String(u.id), u);
      if (u._id) map.set(String(u._id), u);
    }
    return map;
  }, [users]);

  // Fetch paginated tasks from GET /api/v1/tasks
  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);

    try {
      const data = await taskService.getTasks({
        search: debouncedSearch.trim() || undefined,
        status: status ? (status as TaskStatus) : undefined,
        priority: priority ? (priority as TaskPriority) : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        page_size: pageSize,
      });

      setTasks(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: any) {
      setTasks([]);
      setTotal(0);
      setTotalPages(1);
      setErrorBanner(
        err?.response?.data?.detail || 'Failed to load tasks. Please verify your connection.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, status, priority, sortBy, sortOrder, page, pageSize]);

  // Initial load and event subscriptions for real-time reactivity
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchTasks();

    const handleDataChange = () => {
      fetchTasks();
    };

    window.addEventListener('task-created', handleDataChange);
    window.addEventListener('task-updated', handleDataChange);
    window.addEventListener('task-deleted', handleDataChange);

    return () => {
      window.removeEventListener('task-created', handleDataChange);
      window.removeEventListener('task-updated', handleDataChange);
      window.removeEventListener('task-deleted', handleDataChange);
    };
  }, [fetchTasks, currentUser]);

  // Status transition handler via PATCH /api/v1/tasks/{id}
  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    const taskId = task.id || task._id || '';
    try {
      await taskService.updateTask(taskId, { status: newStatus });
      fetchTasks();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update task status.');
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatus('');
    setPriority('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(1);
  };

  const isFilterActive = Boolean(
    debouncedSearch || status || priority || sortBy !== 'created_at' || sortOrder !== 'desc'
  );

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Task Management
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {total} {total === 1 ? 'task deliverable' : 'task deliverables'} under management
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchUsers();
              fetchTasks();
            }}
            isLoading={isLoading}
            className="flex items-center gap-1.5"
            title="Refresh list from backend"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 shadow-sm font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Task</span>
          </Button>
        </div>
      </div>

      {errorBanner && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between font-medium"
        >
          <span>{errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="p-1 text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <Card className="p-4 bg-white shadow-2xs border-slate-200/90">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Debounced Search */}
          <div className="relative">
            <Input
              id="tasks-search-input"
              placeholder="Search by title..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          {/* Status Filter */}
          <Select
            id="status-filter-select"
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'TODO', label: 'To Do' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'COMPLETED', label: 'Completed' },
            ]}
          />

          {/* Priority Filter */}
          <Select
            id="priority-filter-select"
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All Priorities' },
              { value: 'LOW', label: 'Low Priority' },
              { value: 'MEDIUM', label: 'Medium Priority' },
              { value: 'HIGH', label: 'High Priority' },
            ]}
          />

          {/* Due-Date & Creation Sorting */}
          <Select
            id="sort-select"
            aria-label="Sort tasks"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split('-');
              setSortBy(sb);
              setSortOrder(so as 'asc' | 'desc');
              setPage(1);
            }}
            options={[
              { value: 'created_at-desc', label: 'Newest Created' },
              { value: 'created_at-asc', label: 'Oldest Created' },
              { value: 'due_date-asc', label: 'Due Date: Earliest First' },
              { value: 'due_date-desc', label: 'Due Date: Latest First' },
              { value: 'title-asc', label: 'Title: A to Z' },
            ]}
          />
        </div>

        {isFilterActive && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Active filters are applied to the query</span>
            <button
              onClick={clearFilters}
              className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Reset all filters
            </button>
          </div>
        )}
      </Card>

      {/* Task List Table */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 font-medium">Loading tasks from API...</p>
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={isFilterActive ? 'No tasks match your criteria' : 'No tasks created yet'}
          description={
            isFilterActive
              ? 'Try modifying or clearing your active search and filter options.'
              : 'Get started by creating your first task deliverable.'
          }
          actionLabel={isFilterActive ? 'Clear Filters' : 'Create Task'}
          onAction={isFilterActive ? clearFilters : () => setIsCreateModalOpen(true)}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Task Deliverable</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Assignee</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => {
                  const id = task.id || task._id || '';
                  const permissions = getTaskPermissions(task, currentUser);

                  const isOverdue =
                    task.due_date &&
                    new Date(task.due_date) < new Date() &&
                    task.status !== 'COMPLETED';

                  const assigneeUser = task.assignee_id
                    ? usersMap.get(String(task.assignee_id))
                    : null;

                  return (
                    <tr
                      key={id}
                      className="hover:bg-slate-50/70 transition-colors duration-100 group"
                    >
                      {/* Title and Description Preview */}
                      <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                        <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {task.title}
                        </div>
                        {task.description && (
                          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {task.description}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge status={task.status} dot />
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge priority={task.priority} />
                      </td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600">
                        {task.due_date ? (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              isOverdue ? 'text-red-600 font-semibold' : ''
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(task.due_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {isOverdue && ' (Overdue)'}
                          </span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>

                      {/* Assignee */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        {assigneeUser ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-semibold text-[10px]">
                              {assigneeUser.name[0].toUpperCase()}
                            </div>
                            <span className="text-slate-700 font-medium truncate max-w-[140px]">
                              {assigneeUser.name}
                              {currentUser &&
                                String(currentUser.id || currentUser._id) ===
                                  String(assigneeUser.id || assigneeUser._id) && (
                                  <span className="text-slate-400 ml-1 text-[11px]">(You)</span>
                                )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Permitted Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick Status Advance (Permitted for Admin, Creator, or Assignee) */}
                          {permissions.canAnyEdit && (
                            <>
                              {task.status !== 'COMPLETED' ? (
                                <button
                                  onClick={() => handleStatusChange(task, 'COMPLETED')}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                                  title="Mark as completed"
                                  aria-label="Mark as completed"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStatusChange(task, 'IN_PROGRESS')}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                  title="Reopen task (set to In Progress)"
                                  aria-label="Reopen task"
                                >
                                  <ArrowUpDown className="w-4 h-4" />
                                </button>
                              )}

                              {/* Edit Modal (Admin & Creator full edit; Assignee status edit) */}
                              <button
                                onClick={() => setTaskToEdit(task)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                title={
                                  permissions.canEditAll
                                    ? 'Edit Task'
                                    : 'Update Status (Assignee)'
                                }
                                aria-label="Edit task"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {/* Delete Action (Strictly Admin or Creator) */}
                          {permissions.canDelete && (
                            <button
                              onClick={() => setTaskToDelete(task)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete Task"
                              aria-label="Delete task"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Page <span className="font-semibold text-slate-800">{page}</span> of{' '}
                <span className="font-semibold text-slate-800">{totalPages}</span> ({total} items)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Task Modal */}
      <TaskFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => fetchTasks()}
      />

      {/* Edit Task Modal */}
      <TaskFormModal
        isOpen={Boolean(taskToEdit)}
        onClose={() => setTaskToEdit(null)}
        task={taskToEdit}
        onSuccess={() => {
          setTaskToEdit(null);
          fetchTasks();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteTaskDialog
        isOpen={Boolean(taskToDelete)}
        onClose={() => setTaskToDelete(null)}
        task={taskToDelete}
        onSuccess={() => {
          setTaskToDelete(null);
          fetchTasks();
        }}
      />
    </div>
  );
}
