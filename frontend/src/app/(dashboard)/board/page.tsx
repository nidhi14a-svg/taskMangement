'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  RefreshCw,
  Clock,
  Pencil,
  Trash2,
  Inbox,
  X,
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Spinner } from '@/components/common/Spinner';
import { TaskFormModal } from '@/components/tasks/TaskFormModal';
import { DeleteTaskDialog } from '@/components/tasks/DeleteTaskDialog';
import { taskService } from '@/api/services/taskService';
import { userService } from '@/api/services/userService';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getTaskPermissions } from '@/utils/permissions';
import { Task, TaskStatus, User } from '@/types';
import { extractErrorMessage } from '@/utils/formatters';

interface ColumnDef {
  id: TaskStatus;
  title: string;
  description: string;
  borderVariant: string;
  badgeBg: string;
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'TODO',
    title: 'To Do',
    description: 'Deliverables awaiting assignment or commencement',
    borderVariant: 'border-slate-300',
    badgeBg: 'bg-slate-100 text-slate-700',
  },
  {
    id: 'IN_PROGRESS',
    title: 'In Progress',
    description: 'Active tasks under development or review',
    borderVariant: 'border-blue-300',
    badgeBg: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'COMPLETED',
    title: 'Completed',
    description: 'Verified and delivered deliverables',
    borderVariant: 'border-emerald-300',
    badgeBg: 'bg-emerald-100 text-emerald-700',
  },
];

export default function BoardPage() {
  const { user: currentUser } = useCurrentUser();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Drag and Drop State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeDragColumn, setActiveDragColumn] = useState<TaskStatus | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Fetch users directory for assignee lookup
  const fetchUsers = useCallback(async () => {
    try {
      const data = await userService.getUsers();
      setUsers(data);
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

  // Fetch all tasks for the board
  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);

    try {
      const data = await taskService.getTasks({ page_size: 100 });
      setTasks(data.items);
    } catch (err: any) {
      setTasks([]);
      setErrorBanner(
        extractErrorMessage(err?.response?.data?.detail, 'Failed to load Kanban tasks. Please check your connection.')
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  // Persist status change via PATCH /api/v1/tasks/{id}
  const handleStatusChange = async (taskId: string, targetStatus: TaskStatus) => {
    const originalTask = tasks.find((t) => (t.id || t._id) === taskId);
    if (!originalTask || originalTask.status === targetStatus) return;

    // Permissions check: must be Admin, Creator, or Assignee
    const permissions = getTaskPermissions(originalTask, currentUser);
    if (!permissions.canAnyEdit) {
      alert('You do not have permission to modify the status of this task.');
      return;
    }

    try {
      // Optimistically update local state for responsive UI
      setTasks((prev) =>
        prev.map((t) => ((t.id || t._id) === taskId ? { ...t, status: targetStatus } : t))
      );

      await taskService.updateTask(taskId, { status: targetStatus });
      fetchTasks();
    } catch (err: any) {
      // Revert on error
      fetchTasks();
      alert(extractErrorMessage(err?.response?.data?.detail, 'Failed to update task status.'));
    }
  };

  // Drag and drop event handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeDragColumn !== colId) {
      setActiveDragColumn(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, colId: TaskStatus) => {
    // Only clear if leaving the column element itself
    if (activeDragColumn === colId) {
      setActiveDragColumn(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setActiveDragColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);

    if (taskId) {
      await handleStatusChange(taskId, targetStatus);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Kanban Board
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Interactive visual workflow tracking deliverables across lifecycle states
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
            title="Refresh board"
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

      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-slate-500 font-medium">Loading Kanban boards from API...</p>
        </div>
      ) : (
        /* Kanban Columns Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            const isTarget = activeDragColumn === col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={(e) => handleDragLeave(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`rounded-2xl p-4 border transition-colors duration-150 flex flex-col min-h-[580px] ${
                  isTarget
                    ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-400/30'
                    : 'bg-slate-100/70 border-slate-200/90'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-slate-900 tracking-tight">
                        {col.title}
                      </h3>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full shadow-2xs ${col.badgeBg}`}
                      >
                        {colTasks.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{col.description}</p>
                  </div>
                </div>

                {/* Task Cards in Column */}
                <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                  {colTasks.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                      <Inbox className="w-5 h-5 text-slate-300" />
                      <span>No tasks in {col.title.toLowerCase()}</span>
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const id = task.id || task._id || '';
                      const permissions = getTaskPermissions(task, currentUser);

                      const isOverdue =
                        task.due_date &&
                        new Date(task.due_date) < new Date() &&
                        task.status !== 'COMPLETED';

                      const assigneeUser = task.assignee_id
                        ? usersMap.get(String(task.assignee_id))
                        : null;

                      const isBeingDragged = draggedTaskId === id;

                      return (
                        <div
                          key={id}
                          draggable={permissions.canAnyEdit}
                          onDragStart={(e) => handleDragStart(e, id)}
                          className={`bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all duration-150 space-y-3 text-left ${
                            isBeingDragged ? 'opacity-40 scale-95 border-dashed border-indigo-400' : ''
                          } ${
                            permissions.canAnyEdit ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                        >
                          {/* Card Top: Drag Indicator & Title & Actions */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-slate-900 leading-snug break-words">
                                {task.title}
                              </h4>
                              {task.description && (
                                <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                                  {task.description}
                                </p>
                              )}
                            </div>

                            {/* Card Edit & Delete Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              {permissions.canAnyEdit && (
                                <button
                                  onClick={() => setTaskToEdit(task)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                                  title={
                                    permissions.canEditAll
                                      ? 'Edit Task'
                                      : 'Update Status (Assignee)'
                                  }
                                  aria-label="Edit task"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {permissions.canDelete && (
                                <button
                                  onClick={() => setTaskToDelete(task)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                                  title="Delete Task"
                                  aria-label="Delete task"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Priority and Due Date Row */}
                          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                            <Badge priority={task.priority} size="sm" />
                            {task.due_date ? (
                              <span
                                className={`text-[11px] flex items-center gap-1 ${
                                  isOverdue ? 'text-red-600 font-bold' : 'text-slate-500'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                {new Date(task.due_date).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">No deadline</span>
                            )}
                          </div>

                          {/* Assignee Information */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {assigneeUser ? (
                                <>
                                  <div className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-[9px] shrink-0">
                                    {assigneeUser.name[0].toUpperCase()}
                                  </div>
                                  <span className="text-slate-700 font-medium truncate text-[11px]">
                                    {assigneeUser.name}
                                    {currentUser &&
                                      String(currentUser.id || currentUser._id) ===
                                        String(assigneeUser.id || assigneeUser._id) && (
                                        <span className="text-slate-400 ml-1">(You)</span>
                                      )}
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-400 text-[11px] italic">
                                  Unassigned
                                </span>
                              )}
                            </div>

                            {/* Accessible Status Move Controls */}
                            {permissions.canAnyEdit && (
                              <div className="flex items-center gap-1 shrink-0">
                                {col.id !== 'TODO' && (
                                  <button
                                    onClick={() => handleStatusChange(id, 'TODO')}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors font-medium cursor-pointer"
                                    title="Move to To Do"
                                    aria-label="Move to To Do"
                                  >
                                    To Do
                                  </button>
                                )}
                                {col.id !== 'IN_PROGRESS' && (
                                  <button
                                    onClick={() => handleStatusChange(id, 'IN_PROGRESS')}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors font-medium cursor-pointer"
                                    title="Move to In Progress"
                                    aria-label="Move to In Progress"
                                  >
                                    In Progress
                                  </button>
                                )}
                                {col.id !== 'COMPLETED' && (
                                  <button
                                    onClick={() => handleStatusChange(id, 'COMPLETED')}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors font-medium cursor-pointer"
                                    title="Move to Completed"
                                    aria-label="Move to Completed"
                                  >
                                    Done &check;
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
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
