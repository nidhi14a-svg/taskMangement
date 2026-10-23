'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog } from '@/components/common/Dialog';
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { Select } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { taskService } from '@/api/services/taskService';
import { userService } from '@/api/services/userService';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getTaskPermissions } from '@/utils/permissions';
import { Task, TaskStatus, TaskPriority, User } from '@/types';
import { AlertCircle, Info } from 'lucide-react';

const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Task title is required')
    .max(255, 'Task title cannot exceed 255 characters'),
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  due_date: z.string().optional(),
  assignee_id: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

export interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: Task | null;
  onSuccess?: (savedTask: Task) => void;
}

// Helper to format ISO date to datetime-local input string
function formatForDateTimeLocal(isoDate?: string | null): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  } catch {
    return '';
  }
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  isOpen,
  onClose,
  task,
  onSuccess,
}) => {
  const { user: currentUser } = useCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isEditMode = Boolean(task);
  const permissions = useMemo(
    () => getTaskPermissions(task, currentUser),
    [task, currentUser]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'TODO',
      priority: 'MEDIUM',
      due_date: '',
      assignee_id: '',
    },
  });

  // Fetch users directory for assignment dropdown
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingUsers(true);

    userService
      .getUsers()
      .then((data) => {
        if (isMounted) setUsers(data);
      })
      .catch((err) => {
        console.warn('Could not load users for assignment selection:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingUsers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Synchronize form with active task in Edit mode or reset in Create mode
  useEffect(() => {
    if (!isOpen) return;

    setServerError(null);
    if (task) {
      reset({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'TODO',
        priority: task.priority || 'MEDIUM',
        due_date: formatForDateTimeLocal(task.due_date),
        assignee_id: task.assignee_id ? String(task.assignee_id) : '',
      });
    } else {
      reset({
        title: '',
        description: '',
        status: 'TODO',
        priority: 'MEDIUM',
        due_date: '',
        assignee_id: '',
      });
    }
  }, [isOpen, task, reset]);

  const onSubmit = async (data: TaskFormData) => {
    setServerError(null);

    try {
      let savedTask: Task;
      const formattedDueDate = data.due_date
        ? new Date(data.due_date).toISOString()
        : null;

      if (isEditMode && task) {
        const taskId = task.id || task._id || '';

        // If user is assignee only, backend strictly allows updating status
        if (permissions.canEditStatusOnly) {
          savedTask = await taskService.updateTask(taskId, {
            status: data.status as TaskStatus,
          });
        } else {
          // ADMIN or Creator can update all fields
          savedTask = await taskService.updateTask(taskId, {
            title: data.title.trim(),
            description: data.description?.trim() || null,
            status: data.status as TaskStatus,
            priority: data.priority as TaskPriority,
            due_date: formattedDueDate,
            assignee_id: data.assignee_id ? data.assignee_id : null,
          });
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('task-updated', { detail: { task: savedTask } })
          );
        }
      } else {
        // Create Mode
        savedTask = await taskService.createTask({
          title: data.title.trim(),
          description: data.description?.trim() || undefined,
          status: data.status as TaskStatus,
          priority: data.priority as TaskPriority,
          due_date: formattedDueDate || undefined,
          assignee_id: data.assignee_id ? data.assignee_id : undefined,
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('task-created', { detail: { task: savedTask } })
          );
        }
      }

      if (onSuccess) onSuccess(savedTask);
      onClose();
    } catch (err: any) {
      setServerError(
        err?.response?.data?.detail ||
          'An error occurred while saving the task. Please verify your permissions.'
      );
    }
  };

  const userOptions = [
    { value: '', label: isLoadingUsers ? 'Loading directory...' : 'Unassigned' },
    ...users.map((u) => ({
      value: String(u.id || u._id || ''),
      label: `${u.name} (${u.email})${
        currentUser && String(currentUser.id || currentUser._id) === String(u.id || u._id)
          ? ' — (You)'
          : ''
      }`,
    })),
  ];

  // Disable restricted fields if user is assignee only in edit mode
  const isRestrictedAssignee = isEditMode && permissions.canEditStatusOnly;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title={isEditMode ? 'Edit Task Deliverable' : 'Create New Task'}
      description={
        isEditMode
          ? 'Update task specifications, state, or assignment'
          : 'Define a new task deliverable in the workspace'
      }
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && (
          <div
            role="alert"
            className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-start gap-2.5 font-medium leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}

        {isRestrictedAssignee && (
          <div className="p-3 text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded-lg flex items-start gap-2.5 font-medium leading-relaxed">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              You are assigned to this task. Backend access control permits you to update the
              task status. Other task properties can only be altered by the creator or an administrator.
            </span>
          </div>
        )}

        {/* Title */}
        <Input
          id="task-title-input"
          label="Task Title"
          required
          placeholder="e.g. Implement OAuth2 Bearer Authentication"
          {...register('title')}
          error={errors.title?.message}
          disabled={isSubmitting || isRestrictedAssignee}
          autoFocus={!isEditMode}
        />

        {/* Description */}
        <Textarea
          id="task-description-input"
          label="Description"
          placeholder="Detailed deliverable context, acceptance criteria, or technical references..."
          rows={3}
          {...register('description')}
          error={errors.description?.message}
          disabled={isSubmitting || isRestrictedAssignee}
        />

        {/* Status & Priority Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="task-status-select"
            label="Workflow Status"
            {...register('status')}
            error={errors.status?.message}
            disabled={isSubmitting}
            options={[
              { value: 'TODO', label: 'To Do' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'COMPLETED', label: 'Completed' },
            ]}
          />

          <Select
            id="task-priority-select"
            label="Priority Level"
            {...register('priority')}
            error={errors.priority?.message}
            disabled={isSubmitting || isRestrictedAssignee}
            options={[
              { value: 'LOW', label: 'Low Priority' },
              { value: 'MEDIUM', label: 'Medium Priority' },
              { value: 'HIGH', label: 'High Priority' },
            ]}
          />
        </div>

        {/* Due Date & Assignee Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="task-due-date-input"
            label="Due Date (UTC Deadline)"
            type="datetime-local"
            {...register('due_date')}
            error={errors.due_date?.message}
            disabled={isSubmitting || isRestrictedAssignee}
          />

          <Select
            id="task-assignee-select"
            label="Assignee (User Directory)"
            {...register('assignee_id')}
            error={errors.assignee_id?.message}
            disabled={isSubmitting || isRestrictedAssignee || isLoadingUsers}
            options={userOptions}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            className="font-semibold shadow-sm"
          >
            {isSubmitting
              ? isEditMode
                ? 'Saving Changes...'
                : 'Creating Task...'
              : isEditMode
              ? 'Save Changes'
              : 'Create Task'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
