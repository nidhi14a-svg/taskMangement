export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type UserRole = 'ADMIN' | 'TEAM_LEAD' | 'EMPLOYEE' | 'USER';
export type AccountStatus = 'ACTIVE' | 'INVITED' | 'DEACTIVATED';

export interface User {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: UserRole;
  position?: string | null;
  department?: string | null;
  status?: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface EmployeeImportPreviewRow {
  row_number: number;
  name: string;
  email: string;
  role: string;
  position?: string | null;
  department?: string | null;
  is_valid: boolean;
  status: 'VALID' | 'ERROR' | 'DUPLICATE_IN_FILE' | 'EXISTING_IN_DB';
  errors: string[];
  warnings: string[];
  original_data: Record<string, string>;
}

export interface EmployeeImportPreviewResponse {
  total_rows: number;
  valid_rows_count: number;
  invalid_rows_count: number;
  duplicate_rows_count: number;
  existing_rows_count: number;
  headers_detected: string[];
  column_mapping: Record<string, string>;
  mapping_required: boolean;
  rows: EmployeeImportPreviewRow[];
}

export interface EmployeeImportConfirmResponse {
  total_processed: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  email_delivery: boolean;
  email_delivery_message: string;
  imported_employees: User[];
  errors: Array<{ row_number: number; email: string; reason: string }>;
}

export interface AccountActivateVerifyResponse {
  valid: boolean;
  email?: string | null;
  name?: string | null;
  message?: string | null;
}

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_PRIORITY_CHANGED'
  | 'TASK_DUE_DATE_CHANGED'
  | 'TASK_STATUS_CHANGED';

export interface Notification {
  id?: string;
  _id?: string;
  recipient_id: string;
  title: string;
  message: string;
  task_id?: string | null;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export interface NotificationListResponse {
  items: Notification[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface EmployeeListResponse {
  items: User[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  total_active: number;
  total_invited: number;
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
  department?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCreatePayload {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  assignee_id?: string | null;
  department?: string | null;
}

export interface TaskUpdatePayload {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  assignee_id?: string | null;
  department?: string | null;
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
  total_employees?: number;
  total_team_members?: number;
  department?: string | null;
}

export interface TaskFilterParams {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  filter?: 'created' | 'assigned' | string;
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
