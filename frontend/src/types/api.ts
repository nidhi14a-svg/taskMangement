export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'offline';
  app_name: string;
  version: string;
  environment: string;
  database: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  detail: string | { loc: string[]; msg: string; type: string }[];
  status_code?: number;
}
