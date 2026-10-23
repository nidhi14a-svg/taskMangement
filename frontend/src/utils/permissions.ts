import { Task, User } from '@/types';

export interface TaskPermissions {
  isAdmin: boolean;
  isCreator: boolean;
  isAssignee: boolean;
  canEditAll: boolean;
  canEditStatusOnly: boolean;
  canDelete: boolean;
  canAnyEdit: boolean;
}

/**
 * Calculates UI action permissions for a task based on the backend security policy:
 * - ADMIN can manage all tasks.
 * - USER can edit and delete tasks they created.
 * - USER can update the status of tasks assigned to them.
 * - Users cannot modify fields for which they lack permission.
 */
export function getTaskPermissions(
  task: Task | null | undefined,
  currentUser: User | null | undefined
): TaskPermissions {
  if (!task || !currentUser) {
    return {
      isAdmin: false,
      isCreator: false,
      isAssignee: false,
      canEditAll: false,
      canEditStatusOnly: false,
      canDelete: false,
      canAnyEdit: false,
    };
  }

  const currentUserId = String(currentUser.id || currentUser._id || '');
  const creatorId = String(task.creator_id || '');
  const assigneeId = task.assignee_id ? String(task.assignee_id) : null;

  const isAdmin = currentUser.role === 'ADMIN';
  const isCreator = currentUserId.length > 0 && currentUserId === creatorId;
  const isAssignee = assigneeId !== null && currentUserId.length > 0 && currentUserId === assigneeId;

  const canEditAll = isAdmin || isCreator;
  const canEditStatusOnly = isAssignee && !canEditAll;
  const canDelete = isAdmin || isCreator;
  const canAnyEdit = canEditAll || canEditStatusOnly;

  return {
    isAdmin,
    isCreator,
    isAssignee,
    canEditAll,
    canEditStatusOnly,
    canDelete,
    canAnyEdit,
  };
}
