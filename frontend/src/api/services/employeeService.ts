import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import {
  User,
  EmployeeImportPreviewResponse,
  EmployeeImportConfirmResponse,
  EmployeeListResponse,
  EmployeeImportPreviewRow,
} from '@/types';

export interface EmployeeFilterQuery {
  search?: string;
  role?: string;
  department?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export const employeeService = {
  /**
   * Retrieves paginated employee directory for Admin.
   * Calls GET /api/v1/employees.
   */
  async getEmployees(params?: EmployeeFilterQuery): Promise<EmployeeListResponse> {
    const response = await apiClient.get<EmployeeListResponse>(ENDPOINTS.EMPLOYEES.BASE, {
      params,
    });
    return response.data;
  },

  /**
   * Retrieves single employee profile by ID.
   * Calls GET /api/v1/employees/{id}.
   */
  async getEmployeeById(id: string): Promise<User> {
    const response = await apiClient.get<User>(ENDPOINTS.EMPLOYEES.BY_ID(id));
    return response.data;
  },

  /**
   * Triggers download of the sample employee CSV template from the backend.
   * Calls GET /api/v1/employees/template.
   */
  async downloadTemplate(): Promise<void> {
    const response = await apiClient.get(ENDPOINTS.EMPLOYEES.TEMPLATE, {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample_employees.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /**
   * Uploads raw CSV file to validation preview endpoint.
   * Does NOT modify database.
   * Calls POST /api/v1/employees/import/preview.
   */
  async previewImport(
    file: File,
    mapping?: Record<string, string>
  ): Promise<EmployeeImportPreviewResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (mapping && Object.keys(mapping).length > 0) {
      formData.append('mapping', JSON.stringify(mapping));
    }

    const response = await apiClient.post<EmployeeImportPreviewResponse>(
      ENDPOINTS.EMPLOYEES.IMPORT_PREVIEW,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Commits approved employee rows to MongoDB.
   * Calls POST /api/v1/employees/import/confirm.
   */
  async confirmImport(
    rows: EmployeeImportPreviewRow[],
    sendInvitations: boolean = true
  ): Promise<EmployeeImportConfirmResponse> {
    const payloadRows = rows.map((r) => ({
      row_number: r.row_number,
      name: r.name,
      email: r.email,
      role: r.role,
      position: r.position,
      department: r.department,
    }));

    const response = await apiClient.post<EmployeeImportConfirmResponse>(
      ENDPOINTS.EMPLOYEES.IMPORT_CONFIRM,
      {
        rows: payloadRows,
        send_invitations: sendInvitations,
      }
    );
    return response.data;
  },

  /**
   * Triggers download of error report CSV for rejected rows.
   * Calls POST /api/v1/employees/import/error-report.
   */
  async downloadErrorReport(rows: EmployeeImportPreviewRow[]): Promise<void> {
    const response = await apiClient.post(
      ENDPOINTS.EMPLOYEES.ERROR_REPORT,
      rows,
      {
        responseType: 'blob',
      }
    );
    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employee_import_errors.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /**
   * Verifies an activation token for an invited employee.
   * Calls GET /api/v1/auth/activate/verify?token=...
   */
  async verifyActivationToken(token: string): Promise<{ valid: boolean; email?: string; name?: string; message?: string }> {
    const response = await apiClient.get(ENDPOINTS.AUTH.ACTIVATE_VERIFY, {
      params: { token },
    });
    return response.data;
  },

  /**
   * Sets password and activates an invited employee account.
   * Calls POST /api/v1/auth/activate.
   */
  async activateAccount(token: string, password: string): Promise<any> {
    const response = await apiClient.post(ENDPOINTS.AUTH.ACTIVATE, {
      token,
      password,
    });
    return response.data;
  },
};
