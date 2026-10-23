import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';
import { HealthCheckResponse } from '@/types/api';

export const healthService = {
  /**
   * Fetches the root health check status from GET /health
   */
  async getRootHealth(): Promise<HealthCheckResponse> {
    const response = await apiClient.get<HealthCheckResponse>(ENDPOINTS.HEALTH);
    return response.data;
  },

  /**
   * Fetches the API v1 health check status from GET /api/v1/health
   */
  async getApiV1Health(): Promise<HealthCheckResponse> {
    const response = await apiClient.get<HealthCheckResponse>(ENDPOINTS.API_V1_HEALTH);
    return response.data;
  },
};
