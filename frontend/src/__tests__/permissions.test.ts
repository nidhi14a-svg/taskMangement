import { describe, it, expect } from 'vitest';
import { getTaskPermissions } from '@/utils/permissions';
import { Task, User } from '@/types';

describe('getTaskPermissions', () => {
  const adminUser: User = {
    id: 'user-admin',
    name: 'Admin User',
    email: 'admin@taskflow.com',
    role: 'ADMIN',
    created_at: '',
    updated_at: '',
  };

  const creatorUser: User = {
    id: 'user-creator',
    name: 'Creator User',
    email: 'creator@taskflow.com',
    role: 'USER',
    created_at: '',
    updated_at: '',
  };

  const assigneeUser: User = {
    id: 'user-assignee',
    name: 'Assignee User',
    email: 'assignee@taskflow.com',
    role: 'USER',
    created_at: '',
    updated_at: '',
  };

  const thirdPartyUser: User = {
    id: 'user-other',
    name: 'Other User',
    email: 'other@taskflow.com',
    role: 'USER',
    created_at: '',
    updated_at: '',
  };

  const sampleTask: Task = {
    id: 'task-100',
    title: 'Important feature',
    status: 'TODO',
    priority: 'HIGH',
    creator_id: 'user-creator',
    assignee_id: 'user-assignee',
    created_at: '',
    updated_at: '',
  };

  it('grants full edit and delete permissions to ADMIN users', () => {
    const permissions = getTaskPermissions(sampleTask, adminUser);
    expect(permissions.isAdmin).toBe(true);
    expect(permissions.canEditAll).toBe(true);
    expect(permissions.canDelete).toBe(true);
    expect(permissions.canAnyEdit).toBe(true);
    expect(permissions.canEditStatusOnly).toBe(false);
  });

  it('grants full edit and delete permissions to the task CREATOR', () => {
    const permissions = getTaskPermissions(sampleTask, creatorUser);
    expect(permissions.isCreator).toBe(true);
    expect(permissions.canEditAll).toBe(true);
    expect(permissions.canDelete).toBe(true);
    expect(permissions.canAnyEdit).toBe(true);
    expect(permissions.canEditStatusOnly).toBe(false);
  });

  it('grants ONLY status update permissions to the ASSIGNEE (no delete, no edit other fields)', () => {
    const permissions = getTaskPermissions(sampleTask, assigneeUser);
    expect(permissions.isAssignee).toBe(true);
    expect(permissions.canEditAll).toBe(false);
    expect(permissions.canDelete).toBe(false);
    expect(permissions.canEditStatusOnly).toBe(true);
    expect(permissions.canAnyEdit).toBe(true);
  });

  it('denies edit and delete permissions to unassociated third-party users', () => {
    const permissions = getTaskPermissions(sampleTask, thirdPartyUser);
    expect(permissions.canEditAll).toBe(false);
    expect(permissions.canDelete).toBe(false);
    expect(permissions.canEditStatusOnly).toBe(false);
    expect(permissions.canAnyEdit).toBe(false);
  });

  it('returns all false when task or user is null', () => {
    const permissions = getTaskPermissions(null, null);
    expect(permissions.canAnyEdit).toBe(false);
    expect(permissions.canDelete).toBe(false);
  });
});
