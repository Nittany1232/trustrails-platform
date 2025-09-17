/**
 * Widget-specific audit event definitions
 * Extracted from main app for widget auth service
 */

// SOC2 Audit Events relevant to widget authentication
export const SOC2_AUDIT_EVENTS = {
  // Widget authentication events
  WIDGET_AUTH_SUCCESS: 'widget.auth.success',
  WIDGET_AUTH_FAILURE: 'widget.auth.failure',
  WIDGET_SESSION_CREATED: 'widget.session.created',
  WIDGET_SESSION_EXPIRED: 'widget.session.expired',
  WIDGET_USER_CREATED: 'widget.user.created',
  WIDGET_USER_LOGIN: 'widget.user.login',
  WIDGET_API_CALL: 'widget.api.call',

  // Authentication events
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',

  // System events
  SYSTEM_ERROR: 'system.error',
} as const;

export type SOC2EventType = typeof SOC2_AUDIT_EVENTS[keyof typeof SOC2_AUDIT_EVENTS];