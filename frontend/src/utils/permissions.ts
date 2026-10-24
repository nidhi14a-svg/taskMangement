import { Task, User } from '@/types';

export interface TaskPermissions {
  isAdmin: boolean;
  isTeamLead: boolean;
  isCreator: boolean;
  isAssignee: boolean;
  canEditAll: boolean;
  canEditStatusOnly: boolean;
  canDelete: boolean;
  canAnyEdit: boolean;
}

/**
 * Calculates UI action permissions for a task based on the backend security policy:
 * - ADMIN can manage and delete all tasks.
 * - TEAM_LEAD can manage and delete tasks within their department or created by them.
 * - EMPLOYEE / USER can edit and delete tasks they created.
 * - Assignees can update the status of tasks assigned to them.
 */
export function getTaskPermissions(
  task: Task | null | undefined,
  currentUser: User | null | undefined
): TaskPermissions {
  if (!task || !currentUser) {
    return {
      isAdmin: false,
      isTeamLead: false,
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
  const isTeamLead = currentUser.role === 'TEAM_LEAD';
  const isCreator = currentUserId.length > 0 && currentUserId === creatorId;
  const isAssignee = assigneeId !== null && currentUserId.length > 0 && currentUserId === assigneeId;

  const isTeamLeadForTask =
    isTeamLead &&
    (!currentUser.department || !task.department || currentUser.department === task.department || isCreator);

  const canEditAll = isAdmin || isCreator || isTeamLeadForTask;
  const canEditStatusOnly = isAssignee && !canEditAll;
  const canDelete = isAdmin || isCreator || isTeamLeadForTask;
  const canAnyEdit = canEditAll || canEditStatusOnly;

  return {
    isAdmin,
    isTeamLead,
    isCreator,
    isAssignee,
    canEditAll,
    canEditStatusOnly,
    canDelete,
    canAnyEdit,
  };
}
