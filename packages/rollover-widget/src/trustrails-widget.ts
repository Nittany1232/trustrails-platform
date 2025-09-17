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
  @property({ type: Object }) theme = {
    primaryColor: '#1a73e8',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: '8px'
  };

  // Internal state
  @state() private isLoading = false;
  @state() private isAuthenticated = false;
  @state() private error: string | null = null;
  @state() private currentStep = 0;
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
      color: var(--trustrails-text-color, #333);
      background: var(--trustrails-background, #fff);
      border: 1px solid var(--trustrails-border-color, #e0e0e0);
      border-radius: var(--trustrails-border-radius, 8px);
      padding: 24px;
      max-width: 600px;
      box-sizing: border-box;
    }

    .header {
      display: flex;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--trustrails-border-color, #e0e0e0);
    }

    .logo {
      width: 32px;
      height: 32px;
      margin-right: 12px;
      background: var(--trustrails-primary-color, #1a73e8);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }

    .title {
      font-size: 20px;
      font-weight: 600;
      color: var(--trustrails-heading-color, #1a1a1a);
    }

    .content {
      min-height: 200px;
    }

    .loading {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 200px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--trustrails-border-color, #e0e0e0);
      border-top-color: var(--trustrails-primary-color, #1a73e8);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 12px;
      color: #991b1b;
      margin-bottom: 16px;
    }

    .button {
      background: var(--trustrails-primary-color, #1a73e8);
      color: white;
      border: none;
      border-radius: var(--trustrails-button-radius, 6px);
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .button:hover {
      background: var(--trustrails-primary-hover, #1557b0);
    }

    .button:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }

    .steps {
      display: flex;
      justify-content: space-between;
      margin-bottom: 32px;
    }

    .step {
      flex: 1;
      text-align: center;
      position: relative;
    }

    .step:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 20px;
      left: 50%;
      width: 100%;
      height: 2px;
      background: var(--trustrails-border-color, #e0e0e0);
    }

    .step.active .step-number {
      background: var(--trustrails-primary-color, #1a73e8);
      color: white;
    }

    .step.completed .step-number {
      background: #10b981;
      color: white;
    }

    .step-number {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--trustrails-border-color, #e0e0e0);
      color: #6b7280;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      position: relative;
      z-index: 1;
    }

    .step-label {
      margin-top: 8px;
      font-size: 14px;
      color: #6b7280;
    }

    .welcome {
      text-align: center;
      padding: 32px 0;
    }

    .welcome h2 {
      margin: 0 0 16px 0;
      font-size: 24px;
      color: var(--trustrails-heading-color, #1a1a1a);
    }

    .welcome p {
      margin: 0 0 24px 0;
      color: #6b7280;
      line-height: 1.6;
    }

    .user-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .user-status.ready {
      background: #f0f9f4;
      border-color: #d1fae5;
      color: #065f46;
    }

    .user-status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #9ca3af;
    }

    .user-status.ready .user-status-indicator {
      background: #10b981;
    }

    .disabled-message {
      text-align: center;
      padding: 32px 24px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: var(--trustrails-border-radius, 8px);
      margin: 16px 0;
    }

    .disabled-message .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      background: #64748b;
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
      color: #334155;
    }

    .disabled-message p {
      margin: 0 0 20px 0;
      color: #64748b;
      line-height: 1.5;
      font-size: 15px;
    }

    .disabled-message .contact-link {
      display: inline-flex;
      align-items: center;
      color: var(--trustrails-primary-color, #1a73e8);
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid var(--trustrails-primary-color, #1a73e8);
      border-radius: 6px;
      transition: all 0.2s;
    }

    .disabled-message .contact-link:hover {
      background: var(--trustrails-primary-color, #1a73e8);
      color: white;
    }

    .disabled-message .contact-link::after {
      content: '→';
      font-size: 12px;
    }

    .search-container {
      padding: 24px 0;
    }

    .search-header {
      margin-bottom: 24px;
    }

    .search-header h2 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: var(--trustrails-heading-color, #1a1a1a);
    }

    .search-header p {
      margin: 0;
      color: #6b7280;
      line-height: 1.5;
    }

    .search-form {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
    }

    .search-input {
      flex: 1;
      padding: 12px 16px;
      font-size: 16px;
      border: 1px solid var(--trustrails-border-color, #e0e0e0);
      border-radius: var(--trustrails-button-radius, 6px);
      transition: border-color 0.2s;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--trustrails-primary-color, #1a73e8);
    }

    .search-button {
      padding: 12px 32px;
      background: var(--trustrails-primary-color, #1a73e8);
      color: white;
      border: none;
      border-radius: var(--trustrails-button-radius, 6px);
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .search-button:hover:not(:disabled) {
      background: var(--trustrails-primary-hover, #1557b0);
    }

    .search-button:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }

    .search-results {
      border-top: 1px solid var(--trustrails-border-color, #e0e0e0);
      padding-top: 24px;
    }

    .search-results h3 {
      margin: 0 0 16px 0;
      font-size: 18px;
      color: var(--trustrails-heading-color, #1a1a1a);
    }

    .result-item {
      padding: 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .result-item:hover {
      background: #f3f4f6;
      border-color: var(--trustrails-primary-color, #1a73e8);
    }

    .result-item.selected {
      background: #eff6ff;
      border-color: var(--trustrails-primary-color, #1a73e8);
      border-width: 2px;
    }

    .result-item h4 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--trustrails-heading-color, #1a1a1a);
    }

    .result-item .details {
      display: flex;
      gap: 16px;
      font-size: 14px;
      color: #6b7280;
    }

    .result-item .detail-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .no-results {
      text-align: center;
      padding: 48px 24px;
      background: #f9fafb;
      border-radius: 6px;
      color: #6b7280;
    }

    .no-results h3 {
      margin: 0 0 8px 0;
      font-size: 18px;
      color: #374151;
    }

    .searching-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 32px;
      color: #6b7280;
    }

    .small-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--trustrails-border-color, #e0e0e0);
      border-top-color: var(--trustrails-primary-color, #1a73e8);
      border-radius: 50%;
      animation: spin 1s linear infinite;
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

      // Dispatch search event
      this.dispatchEvent(new CustomEvent('trustrails-search', {
        detail: {
          query: this.searchQuery,
          results: this.searchResults,
          count: this.searchResults.length
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

  private handleSelectPlan(plan: any) {
    if (this.isDevelopment) {
      console.log('Plan selected:', plan);
    }

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

    // Move to next step
    this.currentStep = 2;
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
        <div class="logo">TR</div>
        <div class="title">401(k) Rollover Assistant</div>
      </div>

      ${this.error ? html`
        <div class="error">
          ${this.error}
        </div>
      ` : ''}

      <div class="content">
        ${this.isDisabled ? this.renderDisabledMessage() :
        this.isLoading ? html`
          <div class="loading">
            <div class="spinner"></div>
          </div>
        ` : this.isAuthenticated ? html`
          ${this.userEmail ? html`
            <div class="user-status ${this.isUserSessionReady ? 'ready' : ''}">
              <div class="user-status-indicator"></div>
              <span>
                ${this.isUserSessionReady
                  ? `User session ready for ${this.userEmail}${this.userSession?.is_new_user ? ' (new user)' : ''}`
                  : `Setting up user session for ${this.userEmail}...`
                }
              </span>
            </div>
          ` : ''}

          ${this.currentStep > 0 ? html`
            <div class="steps">
              <div class="step ${this.currentStep >= 1 ? 'active' : ''}">
                <div class="step-number">1</div>
                <div class="step-label">Account Info</div>
              </div>
              <div class="step ${this.currentStep >= 2 ? 'active' : ''}">
                <div class="step-number">2</div>
                <div class="step-label">Plan Search</div>
              </div>
              <div class="step ${this.currentStep >= 3 ? 'active' : ''}">
                <div class="step-number">3</div>
                <div class="step-label">Verification</div>
              </div>
              <div class="step ${this.currentStep >= 4 ? 'active' : ''}">
                <div class="step-number">4</div>
                <div class="step-label">Complete</div>
              </div>
            </div>
          ` : ''}

          ${this.currentStep === 0 ? html`
            <div class="search-container">
              <div class="search-header">
                <h2>Find Your 401(k) Plan</h2>
                <p>Search for your employer or plan name to get started with your rollover</p>
              </div>

              <form class="search-form" @submit=${this.handleSearch}>
                <input
                  type="text"
                  class="search-input"
                  placeholder="Enter employer or plan name..."
                  .value=${this.searchQuery}
                  @input=${this.handleSearchInput}
                  ?disabled=${this.isSearching}
                />
                <button
                  type="submit"
                  class="search-button"
                  ?disabled=${!this.searchQuery.trim() || this.isSearching}
                >
                  ${this.isSearching ? html`
                    <div class="small-spinner"></div>
                    Searching...
                  ` : 'Search'}
                </button>
              </form>

              ${this.isSearching ? html`
                <div class="searching-indicator">
                  <div class="small-spinner"></div>
                  <span>Searching Department of Labor database...</span>
                </div>
              ` : this.hasSearched ? html`
                <div class="search-results">
                  ${this.searchResults.length > 0 ? html`
                    <h3>Found ${this.searchResults.length} matching plan${this.searchResults.length === 1 ? '' : 's'}</h3>
                    ${this.searchResults.map(result => html`
                      <div class="result-item" @click=${() => this.handleSelectPlan(result)}>
                        <h4>${result.planName || result.PLAN_NAME || 'Unnamed Plan'}</h4>
                        <div class="details">
                          <div class="detail-item">
                            <span>🏢</span>
                            <span>${result.company?.name || result.SPONSOR_NAME || 'Unknown Sponsor'}</span>
                          </div>
                          ${(result.company?.city || result.SPONS_CITY) ? html`
                            <div class="detail-item">
                              <span>📍</span>
                              <span>${result.company?.city || result.SPONS_CITY}, ${result.company?.state || result.SPONS_STATE || ''}</span>
                            </div>
                          ` : ''}
                          ${result.planDetails?.participants || result.TOT_PARTCP_CNT ? html`
                            <div class="detail-item">
                              <span>👥</span>
                              <span>${result.planDetails?.participants || result.TOT_PARTCP_CNT} participants</span>
                            </div>
                          ` : ''}
                        </div>
                      </div>
                    `)}
                  ` : html`
                    <div class="no-results">
                      <h3>No plans found</h3>
                      <p>Try searching with a different employer or plan name</p>
                    </div>
                  `}
                </div>
              ` : ''}
            </div>
          ` : this.currentStep === 1 ? html`
            <div class="welcome">
              <h2>Account Information</h2>
              <p>Please provide your account details to continue with the rollover process.</p>
              <button
                class="button"
                @click=${() => this.currentStep = 2}
              >
                Continue
              </button>
            </div>
          ` : this.currentStep === 2 ? html`
            <div class="welcome">
              <h2>Verify Your Plan</h2>
              <p>Please verify the plan information is correct.</p>
              <button
                class="button"
                @click=${() => this.currentStep = 3}
              >
                Verify
              </button>
            </div>
          ` : html`
            <div class="welcome">
              <h2>Rollover Complete</h2>
              <p>Your rollover request has been submitted successfully.</p>
            </div>
          `}
        ` : html`
          <div class="welcome">
            <p>Initializing secure connection...</p>
          </div>
        `}
      </div>
    `;
  }
}