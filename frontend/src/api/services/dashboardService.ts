import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import { DashboardSummary } from '@/types';

export const dashboardService = {
  async getSummary(): Promise<DashboardSummary> {
    const response = await apiClient.get<DashboardSummary>(ENDPOINTS.DASHBOARD.SUMMARY);
    return response.data;
  },
};
