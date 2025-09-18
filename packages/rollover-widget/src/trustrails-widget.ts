import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * TrustRails Embeddable Widget
 *
 * Web Components are a set of web platform APIs that allow you to create custom,
 * reusable HTML tags. They work in any JavaScript framework or vanilla HTML.
 *
 * Key benefits:
 * - Framework agnostic - works everywhere
 * - Encapsulated styling - no CSS conflicts
 * - Small bundle size - ~25KB gzipped
 * - Native browser support
 *
 * USER EMAIL HANDLING:
 * When the 'user-email' attribute is provided, the widget automatically:
 * 1. Authenticates with the API using partner credentials
 * 2. Creates or retrieves a user account for the provided email
 * 3. Stores user session in sessionStorage for persistence across page refreshes
 * 4. Validates stored sessions against current email and partner ID
 * 5. Handles email changes dynamically during widget lifecycle
 *
 * USAGE EXAMPLES:
 *
 * Basic usage (no user email):
 * <trustrails-widget
 *   partner-id="your-partner-id"
 *   api-key="your-api-key"
 *   environment="production">
 * </trustrails-widget>
 *
 * With user email (recommended):
 * <trustrails-widget
 *   partner-id="your-partner-id"
 *   api-key="your-api-key"
 *   user-email="user@example.com"
 *   environment="production">
 * </trustrails-widget>
 *
 * EVENTS DISPATCHED:
 * - trustrails-user-ready: When user session is established
 * - trustrails-start: When user begins rollover process
 * - trustrails-account-created: Legacy event for backward compatibility
 */

// User-friendly error messages for widget disabling scenarios (customer-agnostic)
const WIDGET_DISABLED_MESSAGES = {
  PAYMENT_REQUIRED: {
    title: "Service Temporarily Unavailable",
    message: "This service is currently unavailable. Please try again later.",
    contactText: "Need help? Contact support"
  },
  COMPLIANCE_VIOLATION: {
    title: "Service Temporarily Unavailable",
    message: "This service is temporarily unavailable. Please try again later.",
    contactText: "Contact support"
  },
  MAINTENANCE: {
    title: "Service Temporarily Unavailable",
    message: "This service is temporarily unavailable. Please try again later.",
    contactText: "Check service status"
  },
  ACCOUNT_SUSPENDED: {
    title: "Service Under Review",
    message: "This service is temporarily unavailable while under review. Please try again later.",
    contactText: "Questions? Contact support"
  },
  RATE_LIMIT_EXCEEDED: {
    title: "Too Many Requests",
    message: "You've reached the maximum number of requests. Please try again later.",
    contactText: "Need immediate help? Contact support"
  }
} as const;

type DisabledReason = keyof typeof WIDGET_DISABLED_MESSAGES;

// Major recordkeepers data (based on market share and competitor analysis)
const MAJOR_RECORDKEEPERS = [
  { id: 'fidelity', name: 'Fidelity', logo: 'F', marketShare: 23.4 },
  { id: 'empower', name: 'Empower', logo: 'E', marketShare: 14.1 },
  { id: 'principal', name: 'Principal', logo: 'P', marketShare: 12.8 },
  { id: 'vanguard', name: 'Vanguard', logo: 'V', marketShare: 11.2 },
  { id: 'john-hancock', name: 'John Hancock', logo: 'JH', marketShare: 8.7 },
  { id: 'massmutual', name: 'MassMutual', logo: 'MM', marketShare: 7.3 },
  { id: 'prudential', name: 'Prudential', logo: 'PR', marketShare: 6.9 },
  { id: 'troweprice', name: 'T. Rowe Price', logo: 'TR', marketShare: 5.2 },
  { id: 'tiaa', name: 'TIAA', logo: 'TI', marketShare: 4.8 },
  { id: 'wellsfargo', name: 'Wells Fargo', logo: 'WF', marketShare: 3.1 },
  { id: 'transamerica', name: 'Transamerica', logo: 'TA', marketShare: 2.5 },
  { id: 'other', name: 'Other / Don\'t See Mine', logo: '?', marketShare: 0 }
] as const;
@customElement('trustrails-widget')
export class TrustRailsWidget extends LitElement {
  // Public properties that partners can configure
  @property({ type: String, attribute: 'partner-id' }) partnerId = '';
  @property({ type: String, attribute: 'api-key' }) apiKey = '';
  @property({ type: String, attribute: 'user-email' }) userEmail = ''; // Optional
  @property({ type: String, attribute: 'user-id' }) userId = ''; // Optional, if partner has it
  @property({ type: String }) environment: 'sandbox' | 'production' = 'sandbox';
  @property({ type: String, attribute: 'api-endpoint' }) apiEndpoint = ''; // Optional custom API endpoint
  @property({ type: String, attribute: 'auth-endpoint' }) authEndpoint = ''; // Optional custom auth endpoint
  @property({ type: String, attribute: 'kyc-required' }) kycRequired = 'auto'; // Options: auto, always, never
  @property({ type: String, attribute: 'persona-template-id' }) personaTemplateId = '';
  @property({ type: String, attribute: 'persona-environment' }) personaEnvironment = 'sandbox'; // sandbox or production
  @property({ type: Object }) theme = {
    primaryColor: '#1a73e8',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: '8px'
  };

  // Internal state
  @state() private isLoading = false;
  @state() private isAuthenticated = false;
  @state() private error: string | null = null;
  @state() private bearerToken: string | null = null;
  @state() private sessionId: string | null = null;
  @state() private userSession: any = null;
  @state() private isUserSessionReady = false;
  @state() private isDisabled = false;
  @state() private disabledReason: DisabledReason | null = null;
  @state() private searchQuery = '';
  @state() private searchResults: any[] = [];
  @state() private isSearching = false;
  @state() private hasSearched = false;
  @state() private currentFlow: 'start' | 'recordkeeper' | 'employer' | 'kyc' = 'start';
  @state() private selectedRecordkeeper: string | null = null;
  @state() private kycState: 'not_started' | 'checking' | 'required' | 'in_progress' | 'completed' | 'failed' = 'not_started';
  @state() private kycError: string | null = null;
  @state() private personaLoaded = false;
  @state() private kycInquiryId: string | null = null;
  @state() private selectedPlan: any = null;

  // Development mode flag - only log sensitive data in development
  private get isDevelopment(): boolean {
    return this.environment === 'sandbox' ||
           (typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' ||
             window.location.hostname.includes('dev') ||
             window.location.hostname.includes('staging')));
  }

  // Scoped styles - won't affect parent page
  static override styles = css`
    :host {
      display: block;
      font-family: var(--trustrails-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      color: var(--trustrails-text-color, #1f2937);
      background: var(--trustrails-background, #ffffff);
      border: 1px solid var(--trustrails-border-color, #e5e7eb);
      border-radius: var(--trustrails-border-radius, 12px);
      padding: var(--trustrails-padding, 0);
      max-width: var(--trustrails-max-width, 600px);
      min-height: var(--trustrails-min-height, 400px);
      box-sizing: border-box;
      overflow: hidden;
      box-shadow: var(--trustrails-shadow, 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06));
    }

    /* Header Styles */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--trustrails-header-padding, 20px 24px);
      background: var(--trustrails-header-bg, linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%));
      border-bottom: 1px solid var(--trustrails-border-color, #e5e7eb);
    }

    .logo {
      width: var(--trustrails-logo-size, 36px);
      height: var(--trustrails-logo-size, 36px);
      margin-right: 12px;
      background: var(--trustrails-primary-color, #3b82f6);
      border-radius: var(--trustrails-logo-radius, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 14px;
    }

    .header-content {
      display: flex;
      align-items: center;
      flex: 1;
    }

    .title {
      font-size: var(--trustrails-title-size, 18px);
      font-weight: 600;
      color: var(--trustrails-heading-color, #1f2937);
      margin: 0;
    }

    .subtitle {
      font-size: 14px;
      color: var(--trustrails-muted-color, #6b7280);
      margin: 2px 0 0 0;
    }

    .progress-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--trustrails-muted-color, #6b7280);
      font-size: 12px;
    }

    .progress-dots {
      display: flex;
      gap: 4px;
    }

    .progress-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--trustrails-border-color, #e5e7eb);
      transition: background 0.2s;
    }

    .progress-dot.active {
      background: var(--trustrails-primary-color, #3b82f6);
    }

    /* Content Container */
    .content {
      padding: var(--trustrails-content-padding, 24px);
      min-height: 300px;
    }

    /* Loading and Error States */
    .loading {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 200px;
      gap: 16px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--trustrails-border-color, #e5e7eb);
      border-top-color: var(--trustrails-primary-color, #3b82f6);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loading-text {
      color: var(--trustrails-muted-color, #6b7280);
      font-size: 14px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error {
      background: var(--trustrails-error-bg, #fef2f2);
      border: 1px solid var(--trustrails-error-border, #fecaca);
      border-radius: var(--trustrails-border-radius, 8px);
      padding: 16px;
      color: var(--trustrails-error-text, #991b1b);
      margin-bottom: 16px;
      font-size: 14px;
    }

    /* Button Styles */
    .button {
      background: var(--trustrails-primary-color, #3b82f6);
      color: white;
      border: none;
      border-radius: var(--trustrails-button-radius, 8px);
      padding: var(--trustrails-button-padding, 12px 24px);
      font-size: var(--trustrails-button-font-size, 14px);
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
      white-space: nowrap;
    }

    .button:hover:not(:disabled) {
      background: var(--trustrails-primary-hover, #2563eb);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
    }

    .button:active:not(:disabled) {
      transform: translateY(0);
    }

    .button:disabled {
      background: var(--trustrails-disabled-bg, #9ca3af);
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .button.secondary {
      background: var(--trustrails-secondary-bg, #f3f4f6);
      color: var(--trustrails-secondary-text, #374151);
      border: 1px solid var(--trustrails-border-color, #e5e7eb);
    }

    .button.secondary:hover:not(:disabled) {
      background: var(--trustrails-secondary-hover, #e5e7eb);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .button.large {
      padding: 16px 32px;
      font-size: 16px;
      font-weight: 600;
    }

    .button.small {
      padding: 8px 16px;
      font-size: 12px;
    }

    /* Flow Selection Screen */
    .flow-selection {
      text-align: center;
      padding: 40px 0 20px;
    }

    .flow-title {
      font-size: var(--trustrails-title-size, 24px);
      font-weight: 700;
      color: var(--trustrails-heading-color, #1f2937);
      margin: 0 0 8px 0;
      line-height: 1.3;
    }

    .flow-subtitle {
      font-size: 16px;
      color: var(--trustrails-muted-color, #6b7280);
      margin: 0 0 32px 0;
      line-height: 1.5;
    }

    .flow-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }

    @media (max-width: 480px) {
      .flow-options {
        grid-template-columns: 1fr;
      }
    }

    .flow-option {
      background: var(--trustrails-card-bg, #ffffff);
      border: 2px solid var(--trustrails-border-color, #e5e7eb);
      border-radius: var(--trustrails-card-radius, 12px);
      padding: 24px 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      min-height: 140px;
      justify-content: center;
    }

    .flow-option:hover {
      border-color: var(--trustrails-primary-color, #3b82f6);
      background: var(--trustrails-primary-bg, #eff6ff);
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(59, 130, 246, 0.15);
    }

    .flow-option-icon {
      font-size: 32px;
      margin-bottom: 4px;
    }

    .flow-option-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--trustrails-heading-color, #1f2937);
      margin: 0;
      text-align: center;
    }

    .flow-option-desc {
      font-size: 13px;
      color: var(--trustrails-muted-color, #6b7280);
      margin: 0;
      text-align: center;
      line-height: 1.4;
    }

    /* Recordkeeper Flow */
    .recordkeeper-flow {
      padding: 20px 0;
    }

    .flow-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .flow-header h2 {
      font-size: 20px;
      font-weight: 600;
      color: var(--trustrails-heading-color, #1f2937);
      margin: 0 0 8px 0;
    }

    .flow-header p {
      font-size: 14px;
      color: var(--trustrails-muted-color, #6b7280);
      margin: 0;
    }

    .back-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--trustrails-primary-color, #3b82f6);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 20px;
      padding: 4px 0;
      transition: color 0.2s;
    }

    .back-button:hover {
      color: var(--trustrails-primary-hover, #2563eb);
    }

    .recordkeeper-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    @media (max-width: 480px) {
      .recordkeeper-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .recordkeeper-card {
      background: var(--trustrails-card-bg, #ffffff);
      border: 2px solid var(--trustrails-border-color, #e5e7eb);
      border-radius: var(--trustrails-card-radius, 12px);
      padding: 20px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      min-height: 120px;
      justify-content: center;
      text-decoration: none;
      color: inherit;
    }

    .recordkeeper-card:hover {
      border-color: var(--trustrails-primary-color, #3b82f6);
      background: var(--trustrails-primary-bg, #eff6ff);
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15);
    }

    .recordkeeper-card.selected {
      border-color: var(--trustrails-primary-color, #3b82f6);
      background: var(--trustrails-primary-bg, #eff6ff);
      box-shadow: 0 0 0 1px var(--trustrails-primary-color, #3b82f6);
    }

    .recordkeeper-logo {
      width: 48px;
      height: 48px;
      background: var(--trustrails-logo-bg, #f3f4f6);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 600;
      color: var(--trustrails-heading-color, #1f2937);
    }

    .recordkeeper-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--trustrails-heading-color, #1f2937);
      text-align: center;
      line-height: 1.3;
      margin: 0;
    }

    /* Employer Search Flow */
    .employer-search {
      padding: 20px 0;
    }

    .search-container {
      margin-bottom: 24px;
    }

    .search-form {
      position: relative;
      margin-bottom: 20px;
    }

    .search-input {
      width: 100%;
      padding: 16px 20px 16px 48px;
      font-size: 16px;
      border: 2px solid var(--trustrails-border-color, #e5e7eb);
      border-radius: var(--trustrails-input-radius, 12px);
      background: var(--trustrails-input-bg, #ffffff);
      color: var(--trustrails-text-color, #1f2937);
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--trustrails-primary-color, #3b82f6);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .search-input::placeholder {
      color: var(--trustrails-placeholder-color, #9ca3af);
    }

    .search-icon {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--trustrails-muted-color, #6b7280);
      font-size: 16px;
      pointer-events: none;
    }

    .search-suggestions {
      background: var(--trustrails-card-bg, #ffffff);
      border: 1px solid var(--trustrails-border-color, #e5e7eb);
      border-radius: var(--trustrails-card-radius, 8px);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      max-height: 300px;
      overflow-y: auto;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 10;
      margin-top: 4px;
    }

    .suggestion-item {
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1px solid var(--trustrails-border-color, #e5e7eb);
      transition: background 0.1s ease;
    }

    .suggestion-item:last-child {
      border-bottom: none;
    }

    .suggestion-item:hover {
      background: var(--trustrails-hover-bg, #f9fafb);
    }

    .suggestion-item.focused {
      background: var(--trustrails-primary-bg, #eff6ff);
    }

    .suggestion-name {
      font-weight: 500;
      color: var(--trustrails-heading-color, #1f2937);
      font-size: 14px;
    }

    .suggestion-details {
      font-size: 12px;
      color: var(--trustrails-muted-color, #6b7280);
      margin-top: 2px;
    }

    /* User Status */
    .user-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: var(--trustrails-info-bg, #f0f9ff);
      border: 1px solid var(--trustrails-info-border, #e0f2fe);
      border-radius: var(--trustrails-border-radius, 8px);
      margin-bottom: 16px;
      font-size: 14px;
    }

    .user-status.ready {
      background: var(--trustrails-success-bg, #f0fdf4);
      border-color: var(--trustrails-success-border, #bbf7d0);
      color: var(--trustrails-success-text, #065f46);
    }

    .user-status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--trustrails-info-color, #0ea5e9);
      flex-shrink: 0;
    }

    .user-status.ready .user-status-indicator {
      background: var(--trustrails-success-color, #10b981);
    }

    /* Results Display */
    .search-results {
      margin-top: 24px;
    }

    .results-header {
      margin-bottom: 16px;
    }

    .results-count {
      font-size: 14px;
      color: var(--trustrails-muted-color, #6b7280);
      margin-bottom: 8px;
    }

    .result-item {
      background: var(--trustrails-card-bg, #ffffff);
      border: 1px solid var(--trustrails-border-color, #e5e7eb);
      border-radius: var(--trustrails-card-radius, 8px);
      padding: 16px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }

    .result-item:hover {
      border-color: var(--trustrails-primary-color, #3b82f6);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
    }

    .result-item.selected {
      border-color: var(--trustrails-primary-color, #3b82f6);
      background: var(--trustrails-primary-bg, #eff6ff);
    }

    .result-item.enterprise {
      border-left: 4px solid #10b981;
      background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%);
    }

    .result-item.large {
      border-left: 4px solid #3b82f6;
    }

    .result-item.medium {
      border-left: 4px solid #f59e0b;
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .result-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--trustrails-heading-color, #1f2937);
      margin: 0;
      flex: 1;
    }

    .result-badges {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-left: 12px;
    }

    .tier-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .tier-badge.enterprise {
      background: #d1fae5;
      color: #065f46;
    }

    .tier-badge.large {
      background: #dbeafe;
      color: #1e40af;
    }

    .tier-badge.medium {
      background: #fef3c7;
      color: #92400e;
    }

    .tier-badge.small {
      background: #f3f4f6;
      color: #6b7280;
    }

    .ml-score {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 6px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 500;
      color: #475569;
    }

    .ml-score.high {
      background: #dcfce7;
      border-color: #bbf7d0;
      color: #166534;
    }

    .ml-score.medium {
      background: #fef3c7;
      border-color: #fde68a;
      color: #92400e;
    }

    .result-details {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 14px;
      color: var(--trustrails-muted-color, #6b7280);
      margin-bottom: 12px;
    }

    .result-detail {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .result-contact {
      padding-top: 12px;
      border-top: 1px solid var(--trustrails-border-color, #e5e7eb);
      margin-top: 12px;
    }

    .contact-name {
      font-weight: 600;
      color: var(--trustrails-primary-color, #3b82f6);
      font-size: 14px;
    }

    .contact-confidence {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      border-radius: 12px;
      font-weight: 600;
      margin-left: 8px;
    }

    .contact-confidence.high {
      background: var(--trustrails-success-bg, #dcfce7);
      color: var(--trustrails-success-text, #166534);
    }

    .contact-confidence.medium {
      background: var(--trustrails-warning-bg, #fef3c7);
      color: var(--trustrails-warning-text, #92400e);
    }

    .contact-confidence.low {
      background: var(--trustrails-muted-bg, #f3f4f6);
      color: var(--trustrails-muted-text, #6b7280);
    }

    .no-results {
      text-align: center;
      padding: 48px 24px;
      color: var(--trustrails-muted-color, #6b7280);
    }

    .no-results h3 {
      margin: 0 0 8px 0;
      font-size: 18px;
      color: var(--trustrails-heading-color, #1f2937);
    }

    /* Disabled State */
    .disabled-message {
      text-align: center;
      padding: 40px 24px;
      background: var(--trustrails-disabled-bg, #f8fafc);
      border: 1px solid var(--trustrails-disabled-border, #e2e8f0);
      border-radius: var(--trustrails-border-radius, 12px);
      margin: 16px 0;
    }

    .disabled-message .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      background: var(--trustrails-disabled-icon, #64748b);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: white;
    }

    .disabled-message h3 {
      margin: 0 0 12px 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--trustrails-disabled-heading, #334155);
    }

    .disabled-message p {
      margin: 0 0 20px 0;
      color: var(--trustrails-disabled-text, #64748b);
      line-height: 1.5;
      font-size: 15px;
    }

    .disabled-message .contact-link {
      display: inline-flex;
      align-items: center;
      color: var(--trustrails-primary-color, #3b82f6);
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
      gap: 6px;
      padding: 10px 20px;
      border: 1px solid var(--trustrails-primary-color, #3b82f6);
      border-radius: var(--trustrails-button-radius, 8px);
      transition: all 0.2s;
    }

    .disabled-message .contact-link:hover {
      background: var(--trustrails-primary-color, #3b82f6);
      color: white;
    }

    .disabled-message .contact-link::after {
      content: '→';
      font-size: 12px;
    }

    /* Mobile Responsiveness and Accessibility */
    @media (max-width: 768px) {
      :host {
        max-width: 100%;
        border-radius: 0;
        border-left: none;
        border-right: none;
        min-height: 100vh;
      }

      .header {
        padding: 16px 20px;
      }

      .content {
        padding: 20px;
      }

      .flow-title {
        font-size: 20px;
      }

      .flow-subtitle {
        font-size: 14px;
      }

      .flow-selection {
        padding: 20px 0;
      }

      .recordkeeper-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }

      .recordkeeper-card {
        padding: 16px 12px;
        min-height: 100px;
      }

      .recordkeeper-logo {
        width: 40px;
        height: 40px;
        font-size: 16px;
      }

      .recordkeeper-name {
        font-size: 12px;
      }

      .search-input {
        padding: 14px 16px 14px 40px;
      }

      .search-icon {
        left: 14px;
      }
    }

    @media (max-width: 480px) {
      .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        padding: 16px;
      }

      .progress-indicator {
        align-self: flex-end;
      }

      .content {
        padding: 16px;
      }

      .result-details {
        flex-direction: column;
        gap: 8px;
      }
    }

    /* Accessibility Enhancements */
    .button:focus,
    .flow-option:focus,
    .recordkeeper-card:focus,
    .search-input:focus {
      outline: 2px solid var(--trustrails-primary-color, #3b82f6);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --trustrails-background: #1f2937;
        --trustrails-text-color: #f9fafb;
        --trustrails-heading-color: #ffffff;
        --trustrails-muted-color: #9ca3af;
        --trustrails-border-color: #374151;
        --trustrails-card-bg: #374151;
        --trustrails-input-bg: #374151;
        --trustrails-hover-bg: #4b5563;
        --trustrails-header-bg: linear-gradient(135deg, #374151 0%, #4b5563 100%);
      }
    }

    /* High Contrast Mode */
    @media (prefers-contrast: high) {
      :host {
        --trustrails-border-color: #000000;
        --trustrails-text-color: #000000;
        --trustrails-background: #ffffff;
      }
    }

    /* Loading States */
    .searching-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 32px;
      color: var(--trustrails-muted-color, #6b7280);
    }

    .small-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--trustrails-border-color, #e5e7eb);
      border-top-color: var(--trustrails-primary-color, #3b82f6);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    /* Screen Reader Only Content */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* KYC Flow Styles */
    .kyc-flow {
      padding: 20px 0;
    }

    .kyc-intro {
      text-align: center;
      padding: 32px 24px;
      background: var(--trustrails-primary-bg, #eff6ff);
      border: 1px solid var(--trustrails-primary-color, #3b82f6);
      border-radius: var(--trustrails-border-radius, 12px);
      margin-bottom: 24px;
    }

    .kyc-intro h3 {
      font-size: 20px;
      font-weight: 600;
      color: var(--trustrails-heading-color, #1f2937);
      margin: 0 0 12px 0;
    }

    .kyc-intro p {
      font-size: 15px;
      color: var(--trustrails-muted-color, #6b7280);
      margin: 0 0 20px 0;
      line-height: 1.5;
    }

    .kyc-intro ul {
      text-align: left;
      max-width: 300px;
      margin: 0 auto 24px;
      padding: 0;
      list-style: none;
    }

    .kyc-intro li {
      padding: 8px 0;
      color: var(--trustrails-text-color, #1f2937);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .kyc-intro li::before {
      content: '✓';
      color: var(--trustrails-success-color, #10b981);
      font-weight: bold;
    }

    .kyc-embed {
      margin: 20px 0;
      border: 1px solid var(--trustrails-border-color, #e5e7eb);
      border-radius: var(--trustrails-border-radius, 12px);
      overflow: hidden;
      min-height: 400px;
    }

    .kyc-success {
      text-align: center;
      padding: 48px 24px;
      background: var(--trustrails-success-bg, #f0fdf4);
      border: 1px solid var(--trustrails-success-border, #bbf7d0);
      border-radius: var(--trustrails-border-radius, 12px);
    }

    .kyc-success .success-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .kyc-success h3 {
      font-size: 20px;
      font-weight: 600;
      color: var(--trustrails-success-text, #065f46);
      margin: 0 0 12px 0;
    }

    .kyc-success p {
      color: var(--trustrails-success-text, #065f46);
      margin: 0;
    }

    .kyc-failed {
      text-align: center;
      padding: 32px 24px;
      background: var(--trustrails-error-bg, #fef2f2);
      border: 1px solid var(--trustrails-error-border, #fecaca);
      border-radius: var(--trustrails-border-radius, 12px);
    }

    .kyc-failed h3 {
      font-size: 18px;
      font-weight: 600;
      color: var(--trustrails-error-text, #991b1b);
      margin: 0 0 12px 0;
    }

    .kyc-failed p {
      color: var(--trustrails-error-text, #991b1b);
      margin: 0 0 24px 0;
    }

    .kyc-checking {
      text-align: center;
      padding: 48px 24px;
      color: var(--trustrails-muted-color, #6b7280);
    }

    .kyc-checking .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--trustrails-border-color, #e5e7eb);
      border-top-color: var(--trustrails-primary-color, #3b82f6);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    .kyc-checking p {
      margin: 0;
      font-size: 14px;
    }

    .btn-link {
      background: none;
      color: var(--trustrails-primary-color, #3b82f6);
      border: none;
      text-decoration: underline;
      cursor: pointer;
      font-size: 14px;
      padding: 8px 16px;
      margin-left: 8px;
    }

    .btn-link:hover {
      color: var(--trustrails-primary-hover, #2563eb);
    }
  `;

  constructor() {
    super();
    this.applyTheme();
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.isDevelopment) {
      console.log('TrustRails Widget Connected', {
        partnerId: this.partnerId,
        apiKey: this.apiKey ? 'set' : 'not set',
        userEmail: this.userEmail || 'not provided',
        environment: this.environment
      });
    }
  }

  override firstUpdated() {
    if (this.isDevelopment) {
      console.log('TrustRails Widget First Updated', {
        partnerId: this.partnerId,
        apiKey: this.apiKey ? 'set' : 'not set',
        userEmail: this.userEmail || 'not provided',
        environment: this.environment
      });
    }

    // Check for existing session first
    this.checkExistingSession();

    // Initialize widget after first render when properties are set
    this.initialize();
  }

  private checkExistingSession() {
    // Check if we have stored tokens
    const storedToken = sessionStorage.getItem('trustrails_bearer_token');
    const storedSessionId = sessionStorage.getItem('trustrails_session_id');
    const storedUserSession = sessionStorage.getItem('trustrails_user_session');

    if (storedToken && storedSessionId) {
      if (this.isDevelopment) {
        console.log('Found existing session, validating...');
      }

      // Parse the JWT to check expiration (without verification - that's backend's job)
      try {
        const tokenParts = storedToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          const expiresAt = payload.exp * 1000; // Convert to milliseconds
          const now = Date.now();

          if (expiresAt > now) {
            // Token still valid
            const hoursLeft = Math.floor((expiresAt - now) / (1000 * 60 * 60));
            if (this.isDevelopment) {
              console.log(`✅ Existing token still valid for ${hoursLeft} hours`);
            }
            this.bearerToken = storedToken;
            this.sessionId = storedSessionId;
            this.isAuthenticated = true;

            // Restore user session if available
            if (storedUserSession) {
              try {
                const parsedSession = JSON.parse(storedUserSession);

                // Check if session has required fields (old sessions may not have email)
                if (!parsedSession.email || !parsedSession.user_id) {
                  if (this.isDevelopment) {
                    console.log('❌ Stored session missing required fields (old format), clearing...');
                  }
                  sessionStorage.removeItem('trustrails_user_session');
                  this.userSession = null;
                  this.isUserSessionReady = false;
                } else {
                  this.userSession = parsedSession;

                  // Validate the restored session
                  if (this.validateUserSession()) {
                    this.isUserSessionReady = true;
                    if (this.isDevelopment) {
                      console.log('✅ Restored user session:', {
                        userId: this.userSession.user_id,
                        email: this.userSession.email,
                        isNewUser: this.userSession.is_new_user
                      });
                    }
                  } else {
                    if (this.isDevelopment) {
                      console.log('❌ Stored user session validation failed, clearing...');
                    }
                    this.userSession = null;
                    this.isUserSessionReady = false;
                    sessionStorage.removeItem('trustrails_user_session');
                  }
                }
              } catch (error) {
                console.error('Error parsing stored user session:', error);
                sessionStorage.removeItem('trustrails_user_session');
              }
            }
            return;
          } else {
            if (this.isDevelopment) {
              console.log('⏰ Token expired, need to re-authenticate');
            }
            this.clearStoredSession();
          }
        }
      } catch (error) {
        console.error('Error checking token expiration:', error);
        this.clearStoredSession();
      }
    }
  }

  private clearStoredSession() {
    sessionStorage.removeItem('trustrails_bearer_token');
    sessionStorage.removeItem('trustrails_session_id');
    sessionStorage.removeItem('trustrails_user_session');
    this.userSession = null;
    this.isUserSessionReady = false;
  }

  private getDisabledReasonFromError(statusCode: number, errorData: any): DisabledReason | null {
    // Map HTTP status codes and error messages to disabled reasons
    switch (statusCode) {
      case 402: // Payment Required
        return 'PAYMENT_REQUIRED';
      case 403: // Forbidden
        if (errorData.code === 'COMPLIANCE_VIOLATION') {
          return 'COMPLIANCE_VIOLATION';
        }
        if (errorData.code === 'ACCOUNT_SUSPENDED') {
          return 'ACCOUNT_SUSPENDED';
        }
        return 'COMPLIANCE_VIOLATION'; // Default for 403
      case 429: // Too Many Requests
        return 'RATE_LIMIT_EXCEEDED';
      case 503: // Service Unavailable
        return 'MAINTENANCE';
      default:
        // Check for specific error codes in the response body
        if (errorData.code) {
          switch (errorData.code) {
            case 'PAYMENT_REQUIRED':
            case 'SUBSCRIPTION_EXPIRED':
              return 'PAYMENT_REQUIRED';
            case 'COMPLIANCE_VIOLATION':
            case 'POLICY_VIOLATION':
              return 'COMPLIANCE_VIOLATION';
            case 'ACCOUNT_SUSPENDED':
            case 'PARTNER_SUSPENDED':
              return 'ACCOUNT_SUSPENDED';
            case 'RATE_LIMIT_EXCEEDED':
            case 'QUOTA_EXCEEDED':
              return 'RATE_LIMIT_EXCEEDED';
            case 'MAINTENANCE':
            case 'SERVICE_UNAVAILABLE':
              return 'MAINTENANCE';
            default:
              return null;
          }
        }
        return null;
    }
  }

  private applyTheme() {
    // Apply custom theme CSS variables
    if (this.theme.primaryColor) {
      this.style.setProperty('--trustrails-primary-color', this.theme.primaryColor);
    }
    if (this.theme.fontFamily) {
      this.style.setProperty('--trustrails-font-family', this.theme.fontFamily);
    }
    if (this.theme.borderRadius) {
      this.style.setProperty('--trustrails-border-radius', this.theme.borderRadius);
    }
  }

  private async initialize() {
    if (this.isDevelopment) {
      console.log('Widget initialize() called', {
        partnerId: this.partnerId,
        apiKey: this.apiKey ? `${this.apiKey.substring(0, 20)}...` : 'not set',
        environment: this.environment,
        isAuthenticated: this.isAuthenticated
      });
    }

    if (!this.partnerId || !this.apiKey) {
      this.error = 'Missing required configuration: partnerId and apiKey';
      console.error('Widget initialization failed:', this.error);
      return;
    }

    // Skip authentication if we already have a valid session
    if (this.isAuthenticated && this.bearerToken) {
      if (this.isDevelopment) {
        console.log('✅ Using existing valid session');
      }

      // Check if we need to handle user email flow for existing session
      if (this.userEmail && !this.isUserSessionReady) {
        if (this.isDevelopment) {
          console.log('User email provided but no user session found, creating...');
        }
        this.isLoading = true;
        this.error = null;
        try {
          await this.handleUserEmailFlow();
        } catch (err) {
          this.error = err instanceof Error ? err.message : 'Failed to create user session';
          console.error('User session creation failed:', err);
        } finally {
          this.isLoading = false;
        }
      }
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      if (this.isDevelopment) {
        console.log('Starting authentication...');
      }
      // Authenticate with TrustRails API
      await this.authenticate();

      // If widget was disabled during authentication, stop here
      if (this.isDisabled) {
        if (this.isDevelopment) {
          console.log('Widget is disabled, stopping initialization');
        }
        return;
      }

      this.isAuthenticated = true;
      if (this.isDevelopment) {
        console.log('Authentication successful!');
      }

      // If user email is provided and we don't have a user session, create/retrieve user
      if (this.userEmail && !this.isUserSessionReady) {
        if (this.isDevelopment) {
          console.log('User email provided, creating/retrieving user session...');
        }
        await this.handleUserEmailFlow();
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to initialize widget';
      console.error('Authentication failed:', err);
    } finally {
      this.isLoading = false;
    }
  }

  private async authenticate() {
    // Use authEndpoint if provided, otherwise fall back to apiEndpoint or defaults
    const apiUrl = this.authEndpoint
      ? this.authEndpoint
      : this.apiEndpoint
        ? `${this.apiEndpoint}/api/widget/auth`
        : this.environment === 'production'
          ? 'https://api.trustrails.com/api/widget/auth'
          : 'http://localhost:3002/api/widget/auth';

    if (this.isDevelopment) {
      console.log('Authenticating with:', apiUrl);
      console.log('Partner ID:', this.partnerId);
      console.log('API Key:', this.apiKey ? `${this.apiKey.substring(0, 20)}...` : 'not set');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TrustRails-API-Key': this.apiKey,
        'X-TrustRails-Partner-ID': this.partnerId
      },
      body: JSON.stringify({
        widget_version: '1.0.0',
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Check for specific error codes that indicate widget should be disabled
      const disabledReason = this.getDisabledReasonFromError(response.status, errorData);
      if (disabledReason) {
        this.isDisabled = true;
        this.disabledReason = disabledReason;
        this.isLoading = false; // Ensure loading state is cleared
        if (this.isDevelopment) {
          console.log('Widget disabled due to:', disabledReason, 'Status:', response.status);
        }
        return; // Don't throw error, just mark as disabled
      }

      throw new Error(errorData.error || `Authentication failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Store bearer token and session info
    this.bearerToken = data.bearer_token;
    this.sessionId = data.session_id;

    if (this.isDevelopment) {
      console.log('Widget storing tokens:', {
        bearerToken: this.bearerToken ? `${this.bearerToken.substring(0, 40)}...` : 'none',
        sessionId: this.sessionId
      });
    }

    // Store in session storage for persistence
    if (typeof sessionStorage !== 'undefined' && this.bearerToken && this.sessionId) {
      sessionStorage.setItem('trustrails_bearer_token', this.bearerToken);
      sessionStorage.setItem('trustrails_session_id', this.sessionId);
      if (this.isDevelopment) {
        console.log('✅ Tokens stored in sessionStorage');
      }
    }

    return data;
  }

  private async handleUserEmailFlow() {
    if (!this.userEmail) {
      if (this.isDevelopment) {
        console.log('No user email provided, skipping user session creation');
      }
      return;
    }

    if (!this.bearerToken) {
      throw new Error('Cannot create user session: no bearer token available');
    }

    try {
      if (this.isDevelopment) {
        console.log('Creating/retrieving user session for email:', this.userEmail);
      }

      const userResult = await this.createUserAccount(this.userEmail);

      this.userSession = {
        user_id: userResult.user.id,
        email: userResult.user.email,
        is_new_user: userResult.is_new_user,
        created_at: userResult.user.created_at,
        partner_id: this.partnerId
      };

      this.isUserSessionReady = true;

      // Store user session in sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('trustrails_user_session', JSON.stringify(this.userSession));
        if (this.isDevelopment) {
          console.log('✅ User session stored in sessionStorage');
        }
      }

      if (this.isDevelopment) {
        console.log('✅ User session ready:', {
          userId: this.userSession.user_id,
          email: this.userSession.email,
          isNewUser: this.userSession.is_new_user
        });
      }

      // Dispatch user session ready event
      this.dispatchEvent(new CustomEvent('trustrails-user-ready', {
        detail: {
          userId: this.userSession.user_id,
          email: this.userSession.email,
          isNewUser: this.userSession.is_new_user,
          userSession: this.userSession
        },
        bubbles: true,
        composed: true
      }));

    } catch (error) {
      console.error('Failed to create/retrieve user session:', error);
      throw new Error(`User session creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createUserAccount(email: string) {
    if (!this.bearerToken) {
      throw new Error('No bearer token available for user account creation');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format provided');
    }

    const apiUrl = this.apiEndpoint
      ? `${this.apiEndpoint}/api/widget/create-account`
      : this.environment === 'production'
        ? 'https://api.trustrails.com/api/widget/create-account'
        : 'http://localhost:3002/api/widget/create-account';

    if (this.isDevelopment) {
      console.log('Creating account for email:', email);
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.bearerToken}`,
        'X-TrustRails-Partner-ID': this.partnerId
      },
      body: JSON.stringify({
        auth_type: 'email',
        email: email,
        password: `TR_${crypto.getRandomValues(new Uint8Array(16)).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')}`, // Generate secure random password
        partner_id: this.partnerId,
        widget_version: '1.0.0',
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      let errorMessage = `Account creation failed: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;

        // Make error messages more user-friendly
        if (errorMessage.includes('Too many attempts for this email')) {
          errorMessage = 'This email has reached the daily limit. Please try again tomorrow or use a different email.';
        } else if (errorMessage.includes('Rate limit exceeded')) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        }
      } catch (parseError) {
        console.error('Error parsing error response:', parseError);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    if (this.isDevelopment) {
      console.log('Account creation/retrieval successful:', {
        userId: result.user.id,
        isNewUser: result.is_new_user
      });
    }

    return result;
  }


  private async handleSearch(e: Event) {
    e.preventDefault();

    if (!this.searchQuery.trim() || this.isSearching) {
      return;
    }

    this.isSearching = true;
    this.error = null;
    this.hasSearched = true;

    try {
      // Use the apiEndpoint directly if provided (it should be the search API URL)
      // The test.html already passes the full search API URL
      const searchUrl = this.apiEndpoint || 'https://searchplans-pixdjghfcq-uc.a.run.app';

      if (this.isDevelopment) {
        console.log('Searching for:', this.searchQuery);
        console.log('Using search endpoint:', searchUrl);
      }

      // Build URL with query parameters for GET request
      const url = new URL(searchUrl);
      url.searchParams.append('q', this.searchQuery);
      url.searchParams.append('limit', '10');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle the nested structure from the search API
      this.searchResults = data.results || [];

      if (this.isDevelopment) {
        console.log('Search response:', data);
        console.log('Search results:', this.searchResults.length, 'plans found');
      }

      // Sort results by ML relevance score and tier for better UX
      this.searchResults.sort((a, b) => {
        const aScore = a.metadata?.mlRelevanceScore || 0;
        const bScore = b.metadata?.mlRelevanceScore || 0;
        const aTier = a.metadata?.tier || 'small';
        const bTier = b.metadata?.tier || 'small';

        // Enterprise tier gets priority
        if (aTier === 'enterprise' && bTier !== 'enterprise') return -1;
        if (bTier === 'enterprise' && aTier !== 'enterprise') return 1;

        // Then sort by ML relevance score
        return bScore - aScore;
      });

      // Dispatch search event with enhanced metadata
      this.dispatchEvent(new CustomEvent('trustrails-search', {
        detail: {
          query: this.searchQuery,
          results: this.searchResults,
          count: this.searchResults.length,
          mlEnhanced: true,
          avgRelevanceScore: this.searchResults.length > 0 ?
            this.searchResults.reduce((sum, r) => sum + (r.metadata?.mlRelevanceScore || 0), 0) / this.searchResults.length : 0,
          enterpriseResults: this.searchResults.filter(r => r.metadata?.tier === 'enterprise').length
        },
        bubbles: true,
        composed: true
      }));

    } catch (error) {
      console.error('Search failed:', error);
      this.error = error instanceof Error ? error.message : 'Search failed';
      this.searchResults = [];
    } finally {
      this.isSearching = false;
    }
  }

  private handleSearchInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.searchQuery = input.value;
  }

  private formatRelation(relation: string): string {
    if (!relation) return '';

    // Map common provider relations to user-friendly terms
    const relationMap: Record<string, string> = {
      'RECORDKEEPER': 'Recordkeeper',
      'RECORD KEEPER': 'Recordkeeper',
      'ADMIN': 'Administrator',
      'ADMINISTRATOR': 'Administrator',
      'PLAN ADMINISTRATOR': 'Plan Administrator',
      'TRUSTEE': 'Trustee',
      'CUSTODIAN': 'Custodian',
      'INVESTMENT MANAGER': 'Investment Manager',
      'INVESTMENT_MANAGER': 'Investment Manager',
      'CONTRACT ADMINISTRATOR': 'Contract Administrator',
      'TPA': 'Third Party Administrator',
      'THIRD PARTY ADMINISTRATOR': 'Third Party Administrator'
    };

    // Check if we have a direct mapping
    const upperRelation = relation.toUpperCase();
    if (relationMap[upperRelation]) {
      return relationMap[upperRelation];
    }

    // Check for partial matches
    if (upperRelation.includes('RECORDKEEP')) return 'Recordkeeper';
    if (upperRelation.includes('ADMIN')) return 'Administrator';
    if (upperRelation.includes('TRUSTEE')) return 'Trustee';
    if (upperRelation.includes('CUSTODIAN')) return 'Custodian';
    if (upperRelation.includes('INVESTMENT')) return 'Investment Manager';

    // Return original with proper casing if no match
    return relation.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private handleSelectPlan(plan: any) {
    if (this.isDevelopment) {
      console.log('Plan selected:', plan);
    }

    this.selectedPlan = plan;

    // Dispatch plan selection event with both old and new structure support
    this.dispatchEvent(new CustomEvent('trustrails-plan-selected', {
      detail: {
        plan: plan,
        planName: plan.planName || plan.PLAN_NAME,
        sponsorName: plan.company?.name || plan.SPONSOR_NAME,
        ein: plan.ein || plan.SPONS_EIN
      },
      bubbles: true,
      composed: true
    }));

    // Check if KYC is required before proceeding
    this.checkKYCRequirement(plan);
  }

  // Flow navigation methods
  private handleFlowSelection(flow: 'recordkeeper' | 'employer') {
    this.currentFlow = flow;
    if (this.isDevelopment) {
      console.log('Flow selected:', flow);
    }
  }

  private handleBackToStart() {
    this.currentFlow = 'start';
    this.selectedRecordkeeper = null;
    this.searchQuery = '';
    this.searchResults = [];
    this.hasSearched = false;
  }

  private handleRecordkeeperSelection(recordkeeperId: string) {
    this.selectedRecordkeeper = recordkeeperId;

    if (recordkeeperId === 'other') {
      // If "Other" is selected, switch to employer search flow
      this.currentFlow = 'employer';
    } else {
      // Search for plans with this recordkeeper
      const recordkeeper = MAJOR_RECORDKEEPERS.find(rk => rk.id === recordkeeperId);
      if (recordkeeper) {
        this.searchQuery = recordkeeper.name;
        this.handleSearch(new Event('submit'));
      }
    }

    if (this.isDevelopment) {
      console.log('Recordkeeper selected:', recordkeeperId);
    }
  }

  // Public getter methods for partner integration
  public getUserSession() {
    return this.userSession;
  }

  public getUserId(): string | null {
    return this.userSession?.user_id || null;
  }

  public getUserEmail(): string | null {
    return this.userSession?.email || null;
  }

  public isUserReady(): boolean {
    return this.isUserSessionReady && this.userSession !== null;
  }

  // Validate that the stored user session matches the current email
  private validateUserSession(): boolean {
    if (!this.userSession || !this.userEmail) {
      return false;
    }

    // Check if the stored user session matches the current email
    if (this.userSession.email !== this.userEmail) {
      if (this.isDevelopment) {
        console.log('Stored user session email mismatch:', {
          stored: this.userSession.email,
          current: this.userEmail
        });
      }
      return false;
    }

    // Check if the stored session belongs to the current partner
    if (this.userSession.partner_id !== this.partnerId) {
      if (this.isDevelopment) {
        console.log('Stored user session partner mismatch:', {
          stored: this.userSession.partner_id,
          current: this.userSession.partner_id
        });
      }
      return false;
    }

    return true;
  }

  // Public method to refresh user session (useful for debugging or partner integration)
  public async refreshUserSession(): Promise<void> {
    if (!this.userEmail) {
      throw new Error('No user email provided for session refresh');
    }

    if (!this.isAuthenticated || !this.bearerToken) {
      throw new Error('Widget not authenticated');
    }

    if (this.isDevelopment) {
      console.log('Refreshing user session for:', this.userEmail);
    }

    // Clear existing session
    this.userSession = null;
    this.isUserSessionReady = false;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('trustrails_user_session');
    }

    // Create new session
    await this.handleUserEmailFlow();
  }

  // Public method to manually set disabled state (useful for testing and debugging)
  public setDisabled(reason: DisabledReason | null = null): void {
    this.isDisabled = reason !== null;
    this.disabledReason = reason;
    if (this.isDevelopment) {
      console.log('Widget disabled state set to:', reason);
    }
  }

  // Public method to check if widget is disabled
  public isWidgetDisabled(): boolean {
    return this.isDisabled;
  }

  // Public method to get the disabled reason
  public getDisabledReason(): DisabledReason | null {
    return this.disabledReason;
  }

  // KYC Integration Methods
  private async checkKYCRequirement(plan: any) {
    if (this.kycRequired === 'never') {
      this.proceedWithoutKYC();
      return;
    }

    if (this.kycRequired === 'always') {
      this.initiateKYC();
      return;
    }

    // Auto mode - check based on plan value or partner settings
    this.kycState = 'checking';

    try {
      // Check if user already has completed KYC
      if (this.userSession?.user_id) {
        const kycStatus = await this.checkUserKYCStatus();
        if (kycStatus === 'completed') {
          this.kycState = 'completed';
          this.proceedWithoutKYC();
          return;
        }
      }

      // For demo purposes, assume KYC is required for larger plans
      const planValue = plan.planDetails?.totalAssets || plan.TOT_ASSETS || 0;
      const requiresKYC = planValue > 50000 || this.kycRequired === 'always';

      if (requiresKYC) {
        this.initiateKYC();
      } else {
        this.proceedWithoutKYC();
      }
    } catch (error) {
      console.error('Error checking KYC requirement:', error);
      this.kycState = 'failed';
      this.kycError = 'Failed to verify identity requirements. Please try again.';
    }
  }

  private async checkUserKYCStatus(): Promise<string> {
    if (!this.bearerToken || !this.userSession?.user_id) {
      return 'not_started';
    }

    try {
      const response = await this.makeAPICall('/api/widget/kyc/status');
      return response.status || 'not_started';
    } catch (error) {
      console.error('Error checking KYC status:', error);
      return 'not_started';
    }
  }

  private initiateKYC() {
    this.currentFlow = 'kyc';
    this.kycState = 'required';
  }

  private proceedWithoutKYC() {
    // Dispatch start event to indicate user is beginning rollover process
    this.dispatchEvent(new CustomEvent('trustrails-start', {
      detail: {
        plan: this.selectedPlan,
        step: 'plan-selected',
        kycRequired: false
      },
      bubbles: true,
      composed: true
    }));
  }

  private async startKYC() {
    if (!this.userSession?.user_id) {
      this.kycError = 'Please create an account first';
      return;
    }

    this.kycState = 'in_progress';
    this.kycError = null;

    try {
      await this.initializePersonaKYC();
    } catch (error) {
      console.error('Error starting KYC:', error);
      this.kycState = 'failed';
      this.kycError = error instanceof Error ? error.message : 'Failed to start verification';
    }
  }

  private async initializePersonaKYC() {
    // Dynamically load Persona SDK if not already loaded
    if (!this.personaLoaded) {
      await this.loadPersonaSDK();
    }

    // Create inquiry session with backend
    const inquiryData = await this.createKYCInquiry();
    this.kycInquiryId = inquiryData.inquiryId;

    // Initialize Persona client
    const PersonaClass = (window as any).Persona;
    if (!PersonaClass) {
      throw new Error('Persona SDK failed to load');
    }

    const client = new PersonaClass.Client({
      templateId: this.personaTemplateId || inquiryData.templateId,
      environmentId: this.personaEnvironment,
      inquiryId: inquiryData.inquiryId,
      sessionToken: inquiryData.sessionToken,
      onReady: () => this.handlePersonaReady(),
      onComplete: (inquiryId: string, status: string, fields: any) =>
        this.handleKYCComplete(inquiryId, status, fields),
      onCancel: () => this.handleKYCCancel(),
      onError: (error: any) => this.handleKYCError(error)
    });

    // Render in Shadow DOM container
    const container = this.shadowRoot?.querySelector('#kyc-container');
    if (container) {
      client.render(container);
    }
  }

  private async loadPersonaSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).Persona) {
        this.personaLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.withpersona.com/dist/persona-v4.js';
      script.async = true;

      script.onload = () => {
        this.personaLoaded = true;
        resolve();
      };

      script.onerror = () => {
        reject(new Error('Failed to load Persona SDK'));
      };

      // Append to document head, not shadow root (external scripts need document context)
      document.head.appendChild(script);
    });
  }

  private async createKYCInquiry() {
    const response = await this.makeAPICall('/api/widget/kyc/create-inquiry', {
      method: 'POST',
      body: JSON.stringify({
        userId: this.userSession?.user_id,
        templateId: this.personaTemplateId,
        environment: this.personaEnvironment
      })
    });

    return response;
  }

  private handlePersonaReady() {
    if (this.isDevelopment) {
      console.log('Persona KYC ready');
    }
  }

  private async handleKYCComplete(inquiryId: string, status: string, fields: any) {
    if (this.isDevelopment) {
      console.log('KYC completed:', { inquiryId, status });
    }

    try {
      // Store the inquiryId as personaId in backend
      await this.makeAPICall('/api/widget/kyc/complete', {
        method: 'POST',
        body: JSON.stringify({
          inquiryId,
          status,
          fields
        })
      });

      this.kycState = 'completed';
      this.kycInquiryId = inquiryId;

      // Wait a moment for user to see success, then proceed
      setTimeout(() => {
        this.proceedAfterKYC();
      }, 2000);

    } catch (error) {
      console.error('Error completing KYC:', error);
      this.kycState = 'failed';
      this.kycError = 'Failed to complete verification. Please try again.';
    }
  }

  private handleKYCCancel() {
    if (this.isDevelopment) {
      console.log('KYC cancelled by user');
    }
    this.kycState = 'required';
  }

  private handleKYCError(error: any) {
    console.error('Persona KYC error:', error);
    this.kycState = 'failed';
    this.kycError = error.message || 'Verification failed. Please try again.';
  }

  private proceedAfterKYC() {
    // Dispatch start event to indicate user is beginning rollover process
    this.dispatchEvent(new CustomEvent('trustrails-start', {
      detail: {
        plan: this.selectedPlan,
        step: 'kyc-completed',
        kycRequired: true,
        kycInquiryId: this.kycInquiryId
      },
      bubbles: true,
      composed: true
    }));
  }

  private retryKYC() {
    this.kycState = 'required';
    this.kycError = null;
  }

  private contactSupport() {
    // Open support contact (could be email, chat, etc.)
    window.open('mailto:support@trustrails.com?subject=KYC%20Verification%20Help', '_blank');
  }

  private renderDisabledMessage() {
    if (!this.isDisabled || !this.disabledReason) {
      return '';
    }

    const messageConfig = WIDGET_DISABLED_MESSAGES[this.disabledReason];

    return html`
      <div class="disabled-message">
        <div class="icon">⚠</div>
        <h3>${messageConfig.title}</h3>
        <p>${messageConfig.message}</p>
        <a href="mailto:support@trustrails.com" class="contact-link">
          ${messageConfig.contactText}
        </a>
      </div>
    `;
  }

  // Legacy method for backward compatibility
  async createAccount(authType: 'oauth' | 'email', data: any) {
    console.warn('createAccount method is deprecated. Use the user-email attribute for automatic user session management.');

    if (!this.bearerToken) {
      throw new Error('No bearer token available');
    }

    const apiUrl = this.apiEndpoint
      ? `${this.apiEndpoint}/api/widget/create-account`
      : this.environment === 'production'
        ? 'https://api.trustrails.com/api/widget/create-account'
        : 'http://localhost:3002/api/widget/create-account';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.bearerToken}`,
        'X-TrustRails-Partner-ID': this.partnerId
      },
      body: JSON.stringify({
        auth_type: authType,
        partner_id: this.partnerId,
        widget_version: '1.0.0',
        timestamp: new Date().toISOString(),
        ...data
      })
    });

    if (!response.ok) {
      let errorMessage = `Account creation failed: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (parseError) {
        console.error('Error parsing error response:', parseError);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    // Update user session if this was an email account creation
    if (authType === 'email' && data.email) {
      this.userSession = {
        user_id: result.user.id,
        email: result.user.email,
        is_new_user: result.is_new_user,
        created_at: result.user.created_at,
        partner_id: this.partnerId
      };
      this.isUserSessionReady = true;

      // Store user session in sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('trustrails_user_session', JSON.stringify(this.userSession));
      }
    }

    // Dispatch event for account created
    this.dispatchEvent(new CustomEvent('trustrails-account-created', {
      detail: {
        userId: result.user.id,
        isNewUser: result.is_new_user,
        nextSteps: result.next_steps
      },
      bubbles: true,
      composed: true
    }));

    return result;
  }

  async makeAPICall(endpoint: string, options: RequestInit = {}) {
    if (!this.bearerToken) {
      throw new Error('Not authenticated');
    }

    if (this.isDisabled) {
      throw new Error('Widget is disabled and cannot make API calls');
    }

    const apiUrl = this.environment === 'production'
      ? `https://api.trustrails.com${endpoint}`
      : `http://localhost:3002${endpoint}`;

    // Include user context in headers if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.bearerToken}`,
      'X-TrustRails-Partner-ID': this.partnerId,
      ...options.headers as Record<string, string>
    };

    // Add user context if available
    if (this.userSession?.user_id) {
      headers['X-TrustRails-User-ID'] = this.userSession.user_id;
    }

    const response = await fetch(apiUrl, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Check if this error should disable the widget
      const disabledReason = this.getDisabledReasonFromError(response.status, errorData);
      if (disabledReason) {
        this.isDisabled = true;
        this.disabledReason = disabledReason;
        if (this.isDevelopment) {
          console.log('Widget disabled during API call due to:', disabledReason);
        }
        throw new Error('Service is currently unavailable');
      }

      let errorMessage = `API call failed: ${response.statusText}`;
      errorMessage = errorData.error || errorMessage;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  protected override updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (changedProperties.has('theme')) {
      this.applyTheme();
    }

    // Handle user email changes
    if (changedProperties.has('userEmail')) {
      this.handleUserEmailChange(changedProperties.get('userEmail') as string);
    }
  }

  private async handleUserEmailChange(previousEmail: string) {
    // Only handle email changes if we're already authenticated
    if (!this.isAuthenticated || !this.bearerToken) {
      return;
    }

    const currentEmail = this.userEmail;

    // If email was cleared
    if (!currentEmail && previousEmail) {
      if (this.isDevelopment) {
        console.log('User email cleared, clearing user session');
      }
      this.userSession = null;
      this.isUserSessionReady = false;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('trustrails_user_session');
      }
      return;
    }

    // If email changed to a different value
    if (currentEmail && currentEmail !== previousEmail) {
      if (this.isDevelopment) {
        console.log('User email changed, creating new user session:', currentEmail);
      }

      // Clear existing session
      this.userSession = null;
      this.isUserSessionReady = false;

      try {
        this.isLoading = true;
        this.error = null;
        await this.handleUserEmailFlow();
      } catch (error) {
        console.error('Failed to handle user email change:', error);
        this.error = error instanceof Error ? error.message : 'Failed to update user session';
      } finally {
        this.isLoading = false;
      }
    }
  }

  override render() {
    return html`
      <div class="header">
        <div class="header-content">
          <div class="logo">TR</div>
          <div>
            <h1 class="title">401(k) Rollover Assistant</h1>
            <p class="subtitle">Find your plan and get contact information</p>
          </div>
        </div>
        ${this.currentFlow !== 'start' ? html`
          <div class="progress-indicator">
            <span class="sr-only">Step ${this.currentFlow === 'recordkeeper' ? '1' : '2'} of 2</span>
            <div class="progress-dots">
              <div class="progress-dot ${this.currentFlow === 'recordkeeper' ? 'active' : ''}"></div>
              <div class="progress-dot ${this.currentFlow === 'employer' ? 'active' : ''}"></div>
            </div>
          </div>
        ` : ''}
      </div>

      ${this.error ? html`
        <div class="error" role="alert" aria-live="polite">
          ${this.error}
        </div>
      ` : ''}

      <div class="content">
        ${this.isDisabled ? this.renderDisabledMessage() :
        this.isLoading ? html`
          <div class="loading" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <div class="loading-text">Initializing secure connection...</div>
          </div>
        ` : this.isAuthenticated ? html`
          ${this.userEmail ? html`
            <div class="user-status ${this.isUserSessionReady ? 'ready' : ''}" role="status" aria-live="polite">
              <div class="user-status-indicator" aria-hidden="true"></div>
              <span>
                ${this.isUserSessionReady
                  ? `User session ready for ${this.userEmail}${this.userSession?.is_new_user ? ' (new user)' : ''}`
                  : `Setting up user session for ${this.userEmail}...`
                }
              </span>
            </div>
          ` : ''}

          ${this.renderCurrentFlow()}
        ` : html`
          <div class="loading" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <div class="loading-text">Initializing secure connection...</div>
          </div>
        `}
      </div>
    `;
  }

  private renderCurrentFlow() {
    switch (this.currentFlow) {
      case 'start':
        return this.renderFlowSelection();
      case 'recordkeeper':
        return this.renderRecordkeeperFlow();
      case 'employer':
        return this.renderEmployerFlow();
      case 'kyc':
        return this.renderKYCFlow();
      default:
        return this.renderFlowSelection();
    }
  }

  private renderFlowSelection() {
    return html`
      <div class="flow-selection">
        <h2 class="flow-title">How would you like to find your 401(k)?</h2>
        <p class="flow-subtitle">Choose the option that works best for you</p>

        <div class="flow-options">
          <button
            class="flow-option"
            @click=${() => this.handleFlowSelection('recordkeeper')}
            aria-describedby="recordkeeper-desc"
          >
            <div class="flow-option-icon" aria-hidden="true">🏦</div>
            <h3 class="flow-option-title">I know my recordkeeper</h3>
            <p class="flow-option-desc" id="recordkeeper-desc">
              Select from major providers like Fidelity, Empower, Principal, and more
            </p>
          </button>

          <button
            class="flow-option"
            @click=${() => this.handleFlowSelection('employer')}
            aria-describedby="employer-desc"
          >
            <div class="flow-option-icon" aria-hidden="true">🔍</div>
            <h3 class="flow-option-title">Search by employer</h3>
            <p class="flow-option-desc" id="employer-desc">
              Find your plan by searching for your current or former employer
            </p>
          </button>
        </div>
      </div>
    `;
  }

  private renderRecordkeeperFlow() {
    return html`
      <div class="recordkeeper-flow">
        <button class="back-button" @click=${this.handleBackToStart}>
          ← Back to options
        </button>

        <div class="flow-header">
          <h2>Select Your Recordkeeper</h2>
          <p>Choose the company that manages your 401(k) plan</p>
        </div>

        <div class="recordkeeper-grid" role="grid" aria-label="Recordkeeper selection">
          ${MAJOR_RECORDKEEPERS.map(recordkeeper => html`
            <button
              class="recordkeeper-card ${this.selectedRecordkeeper === recordkeeper.id ? 'selected' : ''}"
              @click=${() => this.handleRecordkeeperSelection(recordkeeper.id)}
              role="gridcell"
              aria-pressed=${this.selectedRecordkeeper === recordkeeper.id}
              aria-describedby="rk-${recordkeeper.id}-desc"
            >
              <div class="recordkeeper-logo" aria-hidden="true">${recordkeeper.logo}</div>
              <p class="recordkeeper-name">${recordkeeper.name}</p>
              ${recordkeeper.marketShare > 0 ? html`
                <span class="sr-only" id="rk-${recordkeeper.id}-desc">
                  ${recordkeeper.marketShare}% market share
                </span>
              ` : ''}
            </button>
          `)}
        </div>

        ${this.isSearching ? html`
          <div class="searching-indicator" role="status" aria-live="polite">
            <div class="small-spinner" aria-hidden="true"></div>
            <span>Searching with ML-enhanced relevance...</span>
            <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
              Finding Fortune companies and high-confidence matches
            </div>
          </div>
        ` : ''}

        ${this.renderSearchResults()}
      </div>
    `;
  }

  private renderEmployerFlow() {
    return html`
      <div class="employer-search">
        <button class="back-button" @click=${this.handleBackToStart}>
          ← Back to options
        </button>

        <div class="flow-header">
          <h2>Search by Employer</h2>
          <p>Enter your current or former employer's name</p>
        </div>

        <form class="search-form" @submit=${this.handleSearch}>
          <div class="search-icon" aria-hidden="true">🔍</div>
          <input
            type="search"
            class="search-input"
            placeholder="Enter your employer's name..."
            .value=${this.searchQuery}
            @input=${this.handleSearchInput}
            ?disabled=${this.isSearching}
            aria-label="Employer name search"
            autocomplete="organization"
          />
        </form>

        ${this.isSearching ? html`
          <div class="searching-indicator" role="status" aria-live="polite">
            <div class="small-spinner" aria-hidden="true"></div>
            <span>Searching with ML-enhanced relevance...</span>
            <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
              Analyzing Department of Labor data with AI-powered scoring
            </div>
          </div>
        ` : ''}

        ${this.renderSearchResults()}
      </div>
    `;
  }

  private renderSearchResults() {
    if (!this.hasSearched && !this.isSearching) {
      return '';
    }

    return html`
      <div class="search-results" role="region" aria-label="Search results">
        ${this.searchResults.length > 0 ? html`
          <div class="results-header">
            <div class="results-count" aria-live="polite">
              Found ${this.searchResults.length} matching plan${this.searchResults.length === 1 ? '' : 's'}
              ${this.searchResults.filter(r => r.metadata?.tier === 'enterprise').length > 0 ? html`
                <span style="color: #059669; font-weight: 500; margin-left: 8px;">
                  ⭐ ${this.searchResults.filter(r => r.metadata?.tier === 'enterprise').length} Fortune company result${this.searchResults.filter(r => r.metadata?.tier === 'enterprise').length === 1 ? '' : 's'}
                </span>
              ` : ''}
            </div>
            ${this.searchResults.some(r => (r.metadata?.mlRelevanceScore || 0) >= 70) ? html`
              <div style="font-size: 12px; color: #059669; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                <span>🤖</span>
                <span>Results enhanced with ML-powered relevance scoring</span>
              </div>
            ` : ''}
          </div>

          ${this.searchResults.map((result, index) => {
            const tier = result.metadata?.tier || 'small';
            const mlScore = result.metadata?.mlRelevanceScore || 0;
            return html`
            <div
              class="result-item ${tier}"
              @click=${() => this.handleSelectPlan(result)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  this.handleSelectPlan(result);
                }
              }}
              tabindex="0"
              role="button"
              aria-describedby="result-${index}-desc"
            >
              <div class="result-header">
                <h3 class="result-title">
                  ${result.planName || result.PLAN_NAME || 'Unnamed Plan'}
                </h3>
                <div class="result-badges">
                  ${tier === 'enterprise' ? html`
                    <div class="tier-badge enterprise">
                      <span>⭐</span>
                      <span>Fortune</span>
                    </div>
                  ` : tier === 'large' ? html`
                    <div class="tier-badge large">
                      <span>🏢</span>
                      <span>Large</span>
                    </div>
                  ` : tier === 'medium' ? html`
                    <div class="tier-badge medium">
                      <span>🏬</span>
                      <span>Mid</span>
                    </div>
                  ` : html`
                    <div class="tier-badge small">
                      <span>🏪</span>
                      <span>Small</span>
                    </div>
                  `}

                  ${mlScore >= 70 ? html`
                    <div class="ml-score high">
                      <span>🎯</span>
                      <span>${Math.round(mlScore)}</span>
                    </div>
                  ` : mlScore >= 40 ? html`
                    <div class="ml-score medium">
                      <span>📍</span>
                      <span>${Math.round(mlScore)}</span>
                    </div>
                  ` : html`
                    <div class="ml-score">
                      <span>📌</span>
                      <span>${Math.round(mlScore)}</span>
                    </div>
                  `}
                </div>
              </div>

              <div class="result-details" id="result-${index}-desc">
                <div class="result-detail">
                  <span aria-hidden="true">🏢</span>
                  <span>${result.company?.name || result.SPONSOR_NAME || 'Unknown Sponsor'}</span>
                </div>
                ${(result.company?.city || result.SPONS_CITY) ? html`
                  <div class="result-detail">
                    <span aria-hidden="true">📍</span>
                    <span>${result.company?.city || result.SPONS_CITY}, ${result.company?.state || result.SPONS_STATE || ''}</span>
                  </div>
                ` : ''}
                ${result.planDetails?.participants || result.TOT_PARTCP_CNT ? html`
                  <div class="result-detail">
                    <span aria-hidden="true">👥</span>
                    <span>${result.planDetails?.participants || result.TOT_PARTCP_CNT} participants</span>
                  </div>
                ` : ''}
              </div>

              ${result.primaryContact ? html`
                <div class="result-contact">
                  <div class="contact-name">
                    ${result.primaryContact.name}
                    <span class="contact-confidence ${result.contactConfidence || 'medium'}">
                      ${result.contactConfidence === 'high' ? 'Verified' :
                        result.contactConfidence === 'medium' ? 'Likely' : 'Possible'}
                    </span>
                  </div>
                  <div class="result-detail">
                    <span>Role: ${this.formatRelation(result.primaryContact.relation)}</span>
                  </div>
                  ${result.contactGuidance ? html`
                    <div class="contact-guidance">
                      💡 ${result.contactGuidance}
                    </div>
                  ` : ''}
                </div>
              ` : ''}

              ${tier === 'enterprise' || mlScore >= 80 ? html`
                <div class="result-enhancement">
                  <div style="font-size: 12px; color: #059669; font-weight: 500; margin-top: 8px; display: flex; align-items: center; gap: 4px;">
                    <span>✨</span>
                    <span>High-confidence match from ML-enhanced search</span>
                  </div>
                </div>
              ` : ''}
            </div>
          `;})}
        ` : this.hasSearched ? html`
          <div class="no-results" role="status">
            <h3>No plans found</h3>
            <p>Try searching with a different employer or plan name</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderKYCFlow() {
    return html`
      <div class="kyc-flow">
        <button class="back-button" @click=${this.handleBackToStart}>
          ← Back to search
        </button>

        ${this.renderKYCState()}
      </div>
    `;
  }

  private renderKYCState() {
    switch (this.kycState) {
      case 'checking':
        return html`
          <div class="kyc-checking" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <p>Checking verification requirements...</p>
          </div>
        `;

      case 'required':
        return html`
          <div class="kyc-intro">
            <h3>🔐 Identity Verification Required</h3>
            <p>Federal regulations require us to verify your identity before processing the rollover.</p>
            <ul>
              <li>Takes 2-3 minutes</li>
              <li>Government-issued ID required</li>
              <li>Secure and encrypted</li>
              <li>Powered by Persona</li>
            </ul>
            <button class="button large" @click=${this.startKYC}>
              Start Verification
            </button>
            ${this.kycError ? html`
              <div class="error" style="margin-top: 16px;">
                ${this.kycError}
              </div>
            ` : ''}
          </div>
        `;

      case 'in_progress':
        return html`
          <div class="flow-header">
            <h2>Identity Verification</h2>
            <p>Please follow the instructions to verify your identity</p>
          </div>
          <div id="kyc-container" class="kyc-embed">
            <!-- Persona widget renders here -->
            <div class="loading" style="padding: 48px;">
              <div class="spinner" aria-hidden="true"></div>
              <div class="loading-text">Loading verification...</div>
            </div>
          </div>
        `;

      case 'completed':
        return html`
          <div class="kyc-success">
            <div class="success-icon">✅</div>
            <h3>Identity Verified</h3>
            <p>Thank you! Your identity has been successfully verified. Proceeding to the next step...</p>
          </div>
        `;

      case 'failed':
        return html`
          <div class="kyc-failed">
            <h3>⚠️ Verification Issue</h3>
            <p>${this.kycError || 'There was an issue with your verification. Please try again.'}</p>
            <button class="button" @click=${this.retryKYC}>
              Try Again
            </button>
            <button class="btn-link" @click=${this.contactSupport}>
              Contact Support
            </button>
          </div>
        `;

      default:
        return html`
          <div class="loading">
            <div class="spinner" aria-hidden="true"></div>
            <div class="loading-text">Initializing verification...</div>
          </div>
        `;
    }
  }
}