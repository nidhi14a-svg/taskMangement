export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id?: string;
  _id?: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string | null;
  creator_id: string;
  assignee_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskPaginationResponse {
  items: Task[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DashboardSummary {
  total_tasks: number;
  pending_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  status_breakdown: Record<TaskStatus, number>;
  priority_breakdown: Record<TaskPriority, number>;
  completion_rate: number;
}

export interface TaskFilterParams {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export * from './api';
