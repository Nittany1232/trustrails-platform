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
 */
@customElement('trustrails-widget')
export class TrustRailsWidget extends LitElement {
  // Public properties that partners can configure
  @property({ type: String }) partnerId = '';
  @property({ type: String }) apiKey = '';
  @property({ type: String }) environment: 'sandbox' | 'production' = 'sandbox';
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
  `;

  constructor() {
    super();
    this.applyTheme();
  }

  override connectedCallback() {
    super.connectedCallback();
    console.log('TrustRails Widget Connected', {
      partnerId: this.partnerId,
      environment: this.environment
    });

    // Initialize widget when connected to DOM
    this.initialize();
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
    if (!this.partnerId || !this.apiKey) {
      this.error = 'Missing required configuration: partnerId and apiKey';
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      // Authenticate with TrustRails API
      await this.authenticate();
      this.isAuthenticated = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to initialize widget';
    } finally {
      this.isLoading = false;
    }
  }

  private async authenticate() {
    const apiUrl = this.environment === 'production'
      ? 'https://api.trustrails.com/api/widget/auth'
      : 'http://localhost:3000/api/widget/auth';

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
      throw new Error(errorData.error || `Authentication failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Store bearer token and session info
    this.bearerToken = data.bearer_token;
    this.sessionId = data.session_id;

    // Store in session storage for persistence
    if (typeof sessionStorage !== 'undefined' && this.bearerToken && this.sessionId) {
      sessionStorage.setItem('trustrails_bearer_token', this.bearerToken);
      sessionStorage.setItem('trustrails_session_id', this.sessionId);
    }

    return data;
  }

  private handleStartRollover() {
    this.currentStep = 1;
    // Dispatch custom event that parent can listen to
    this.dispatchEvent(new CustomEvent('trustrails-start', {
      detail: { partnerId: this.partnerId, sessionId: this.sessionId },
      bubbles: true,
      composed: true
    }));
  }

  async createAccount(authType: 'oauth' | 'email', data: any) {
    if (!this.bearerToken) {
      throw new Error('No bearer token available');
    }

    const apiUrl = this.environment === 'production'
      ? 'https://api.trustrails.com/api/widget/create-account'
      : 'http://localhost:3000/api/widget/create-account';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.bearerToken}`
      },
      body: JSON.stringify({
        auth_type: authType,
        ...data
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Account creation failed: ${response.statusText}`);
    }

    const result = await response.json();

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

    const apiUrl = this.environment === 'production'
      ? `https://api.trustrails.com${endpoint}`
      : `http://localhost:3000${endpoint}`;

    const response = await fetch(apiUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.bearerToken}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API call failed: ${response.statusText}`);
    }

    return response.json();
  }

  protected override updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (changedProperties.has('theme')) {
      this.applyTheme();
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
        ${this.isLoading ? html`
          <div class="loading">
            <div class="spinner"></div>
          </div>
        ` : this.isAuthenticated ? html`
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
            <div class="welcome">
              <h2>Start Your 401(k) Rollover</h2>
              <p>
                Move your retirement savings to a better plan in minutes.
                We'll guide you through every step of the process.
              </p>
              <button class="button" @click=${this.handleStartRollover}>
                Get Started
              </button>
            </div>
          ` : html`
            <div>
              Step ${this.currentStep} content will go here...
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