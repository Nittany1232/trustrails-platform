/**
 * Audit system enums and constants
 * Extracted from main app for widget auth service
 */

export enum AuditEventCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  ADMINISTRATIVE = 'administrative',
  SECURITY = 'security',
  FINANCIAL = 'financial',
  COMPLIANCE = 'compliance',
  TRANSACTION = 'transaction',
  SYSTEM = 'system'
}

export enum AuditSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}