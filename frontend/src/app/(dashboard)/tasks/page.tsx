'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Plus,
  Calendar,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { taskService } from '@/api/services/taskService';
import { Task, TaskStatus, TaskPriority } from '@/types';

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await taskService.getTasks({
        search: search.trim() || undefined,
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
    } catch {
      // Fallback empty state for unauthenticated preview
      setTasks([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [search, status, priority, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    fetchTasks();
    const handleCreated = () => fetchTasks();
    window.addEventListener('task-created', handleCreated);
    return () => window.removeEventListener('task-created', handleCreated);
  }, [fetchTasks]);

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await taskService.updateTask(taskId, { status: newStatus });
      fetchTasks();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to update task status.');
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await taskService.deleteTask(taskId);
      fetchTasks();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to delete task.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Task Directory
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Showing {total} {total === 1 ? 'task' : 'tasks'} matching active filters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTasks}
            isLoading={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Input
              placeholder="Search title..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          {/* Status Filter */}
          <Select
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
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All Priorities' },
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
            ]}
          />

          {/* Sorting */}
          <Select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split('-');
              setSortBy(sb);
              setSortOrder(so as 'asc' | 'desc');
              setPage(1);
            }}
            options={[
              { value: 'created_at-desc', label: 'Newest First' },
              { value: 'created_at-asc', label: 'Oldest First' },
              { value: 'due_date-asc', label: 'Due Date: Earliest' },
              { value: 'due_date-desc', label: 'Due Date: Latest' },
              { value: 'title-asc', label: 'Title: A to Z' },
            ]}
          />
        </div>
      </Card>

      {/* Task List Table / Cards */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 font-medium">Loading tasks from MongoDB...</p>
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No tasks found"
          description="There are no tasks matching your selected filters, or you haven't created any tasks yet."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearch('');
            setStatus('');
            setPriority('');
            setPage(1);
          }}
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
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => {
                  const id = task.id || task._id || '';
                  const isOverdue =
                    task.due_date &&
                    new Date(task.due_date) < new Date() &&
                    task.status !== 'COMPLETED';

                  return (
                    <tr
                      key={id}
                      className="hover:bg-slate-50/60 transition-colors duration-100 group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {task.title}
                        </div>
                        {task.description && (
                          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {task.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge status={task.status} dot />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge priority={task.priority} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600">
                        {task.due_date ? (
                          <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
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
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {task.status !== 'COMPLETED' ? (
                            <button
                              onClick={() => handleStatusChange(id, 'COMPLETED')}
                              className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Mark as completed"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusChange(id, 'IN_PROGRESS')}
                              className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Reopen task"
                            >
                              <ArrowUpDown className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(id)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
            <div className="px-4 py-3 bg-slate-50/60 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Page {page} of {totalPages}
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
    </div>
  );
}
