import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// Persona SDK types based on actual Persona documentation
interface PersonaClient {
  open(): void;
  cancel(): void;
  destroy(): void;
}

interface PersonaClientConstructor {
  new(config: PersonaConfig): PersonaClient;
}

interface PersonaConfig {
  templateId: string;
  environmentId: string;
  referenceId?: string;
  onReady?: () => void;
  onComplete?: (params: { inquiryId: string; status: string; fields: any }) => void;
  onCancel?: (params: { inquiryId?: string; sessionToken?: string }) => void;
  onError?: (error: { status: number; code: string }) => void;
  onEvent?: (name: string, meta: any) => void;
}

interface Persona {
  Client: PersonaClientConstructor;
}

interface PersonaWindow extends Window {
  Persona?: Persona;
}

interface SelectedPlan {
  ein?: string;
  planName: string;
  planId?: string;
  sponsorName?: string;
  primaryContact?: {
    name: string;
  };
  participants?: number;
}

type FlowState = 'initial' | 'employer' | 'custodian' | 'custodian-refinement' | 'kyc-intro' | 'kyc-verification' | 'docusign-pending';
type SearchMode = 'initial' | 'employer' | 'custodian' | 'custodian-refinement';
type KYCState = 'not-required' | 'checking' | 'required' | 'in-progress' | 'completed' | 'failed';

/**
 * TrustRails Hierarchical Search Widget
 * A plain, themeable widget for finding 401(k) custodians
 * Better UX than Capitalize - single interface, hierarchical results
 */
@customElement('trustrails-hierarchical-search')
export class TrustRailsHierarchicalSearch extends LitElement {
  @property({ type: String }) apiEndpoint = this.getApiEndpoint();
  @property({ type: String, attribute: 'auth-endpoint' }) authEndpoint = this.getAuthEndpoint();
  @property({ type: String }) theme = 'default';
  @property({ type: Boolean }) debug = false;
  @property({ type: Boolean }) scrollable = false; // Enable fixed height with scroll
  @property({ type: String, attribute: 'persona-template-id' }) personaTemplateId = 'itmpl_8432ukrCiAegZZTRnvc6mVi7xvgG';
  @property({ type: String, attribute: 'persona-environment-id' }) personaEnvironmentId = 'env_4edUSdBFUKZ27VKgaPx3Nta3DtaP';
  @property({ type: String, attribute: 'user-email' }) userEmail = '';
  @property({ type: String, attribute: 'partner-id' }) partnerId = '';
  @property({ type: String, attribute: 'api-key' }) apiKey = '';

  @state() private searchMode: SearchMode = 'initial';
  @state() private flowState: FlowState = 'initial';
  @state() private kycState: KYCState = 'not-required';
  @state() private selectedPlan: SelectedPlan | null = null;
  @state() private loading = false;
  @state() private loadingMore = false;
  @state() private searchQuery = '';
  @state() private searchResults: any[] = [];
  @state() private error = '';
  @state() private currentOffset = 0;
  @state() private hasMoreResults = false;
  @state() private totalResults = 0;
  @state() private selectedCustodian: any = null;
  @state() private custodianStats: any = null;
  @state() private personaClient: PersonaClient | null = null;
  @state() private personaLoaded = false;
  @state() private kycError = '';
  @state() private bearerToken = '';
  @state() private userId = '';
  @state() private userSession: any = null;

  private readonly resultsPerPage = 5; // Keep it compact for embedded widgets
  private readonly largeCustomdianThreshold = 2; // Plans threshold for requiring refinement (lowered for testing - set to 100+ for production)

  /**
   * Detect if running in development environment
   */
  private isDevelopment(): boolean {
    return window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname.startsWith('192.168.') ||
           window.location.hostname.endsWith('.local');
  }

  /**
   * Get the appropriate API endpoint based on environment
   */
  private getApiEndpoint(): string {
    if (this.isDevelopment()) {
      // In development, use the proxy server
      const proxyPort = 8091;
      return `http://localhost:${proxyPort}`;
    }

    // In production, use the configured production endpoint
    return 'https://api.trustrails.com'; // TODO: Replace with actual production endpoint
  }

  /**
   * Get the appropriate auth endpoint based on environment
   */
  private getAuthEndpoint(): string {
    if (this.isDevelopment()) {
      // In development, use the proxy server for auth endpoints
      const proxyPort = 8091;
      return `http://localhost:${proxyPort}/api/widget/auth`;
    }

    // In production, use the configured production endpoint
    return 'https://api.trustrails.com/api/widget/auth'; // TODO: Replace with actual production endpoint
  }

  // Major custodians for quick selection
  private readonly custodians = [
    { name: 'Fidelity', id: 'fidelity' },
    { name: 'Empower', id: 'empower' },
    { name: 'Vanguard', id: 'vanguard' },
    { name: 'Principal', id: 'principal' },
    { name: 'TIAA', id: 'tiaa' },
    { name: 'Schwab', id: 'schwab' },
    { name: 'John Hancock', id: 'johnhancock' },
    { name: 'MassMutual', id: 'massmutual' },
    { name: 'T. Rowe Price', id: 'troweprice' },
    { name: 'Prudential', id: 'prudential' },
    { name: 'Wells Fargo', id: 'wellsfargo' },
    { name: 'Transamerica', id: 'transamerica' }
  ];

  override async connectedCallback() {
    super.connectedCallback();

    // Initialize authentication if user-email is provided
    if (this.userEmail && this.partnerId && this.apiKey) {
      await this.initializeUserSession();
    } else {
      if (this.debug) {
        console.log('[Widget] Skipping authentication - missing required attributes:', {
          hasUserEmail: !!this.userEmail,
          hasPartnerId: !!this.partnerId,
          hasApiKey: !!this.apiKey
        });
      }
    }
  }

  private async initializeUserSession() {
    if (this.debug) {
      console.log('[Widget] Initializing user session for:', this.userEmail);
      console.log('[Widget] Auth endpoint:', this.authEndpoint);
      console.log('[Widget] Partner ID:', this.partnerId);
      console.log('[Widget] API Key:', this.apiKey);
    }

    try {
      // Step 1: Get widget authentication token
      const authResponse = await fetch(this.authEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TrustRails-Partner-ID': this.partnerId,
          'X-TrustRails-API-Key': this.apiKey
        },
        body: JSON.stringify({})
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error('[Widget] Auth response error:', errorText);
        throw new Error(`Failed to authenticate widget: ${authResponse.status} - ${errorText}`);
      }

      const authData = await authResponse.json();
      this.bearerToken = authData.bearer_token;

      // Step 2: Create/retrieve user account
      const createAccountEndpoint = this.authEndpoint.replace('/auth', '/create-account');
      const userResponse = await fetch(createAccountEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bearerToken}`,
          'X-TrustRails-Partner-ID': this.partnerId
        },
        body: JSON.stringify({
          auth_type: 'email',
          email: this.userEmail,
          password: 'temp_password_' + Date.now() // Temporary password for demo
        })
      });

      if (!userResponse.ok) {
        throw new Error('Failed to create/retrieve user account');
      }

      const userData = await userResponse.json();
      this.userSession = userData.user;
      this.userId = userData.user.id;

      if (this.debug) {
        console.log('[Widget] User session established:', {
          userId: this.userId,
          email: this.userSession.email,
          kycStatus: this.userSession.kyc_status,
          personaId: this.userSession.persona_id
        });
      }

      // Dispatch event to notify parent
      this.dispatchEvent(new CustomEvent('trustrails-user-ready', {
        detail: {
          userId: this.userId,
          email: this.userSession.email,
          kycStatus: this.userSession.kyc_status
        },
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error('[Widget] Failed to initialize user session:', error);
    }
  }

  static override styles = css`
    :host {
      /* Themeable CSS Variables */
      --tr-primary-color: var(--primary-color, #2563eb);
      --tr-secondary-color: var(--secondary-color, #64748b);
      --tr-background: var(--background, #ffffff);
      --tr-surface: var(--surface, #f8fafc);
      --tr-border: var(--border, #e2e8f0);
      --tr-text-primary: var(--text-primary, #0f172a);
      --tr-text-secondary: var(--text-secondary, #64748b);
      --tr-radius: var(--radius, 8px);
      --tr-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,0.1));
      --tr-font-family: var(--font-family, system-ui, -apple-system, sans-serif);
      --tr-transition: var(--transition, 150ms ease);

      display: block;
      font-family: var(--tr-font-family);
      color: var(--tr-text-primary);
      line-height: 1.5;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .container {
      background: var(--tr-background);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      padding: 1.5rem;
      max-width: 800px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: var(--tr-text-primary);
    }

    .subtitle {
      font-size: 0.875rem;
      color: var(--tr-text-secondary);
    }

    .search-section {
      margin-bottom: 2rem;
    }

    .question {
      font-size: 1.125rem;
      font-weight: 500;
      margin-bottom: 1rem;
      text-align: center;
    }

    .search-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    @media (max-width: 640px) {
      .search-options {
        grid-template-columns: 1fr;
      }
    }

    .option-card {
      background: var(--tr-surface);
      border: 2px solid var(--tr-border);
      border-radius: var(--tr-radius);
      padding: 1.25rem;
      cursor: pointer;
      transition: all var(--tr-transition);
      text-align: center;
    }

    .option-card:hover {
      border-color: var(--tr-primary-color);
      transform: translateY(-2px);
      box-shadow: var(--tr-shadow);
    }

    .option-card.active {
      border-color: var(--tr-primary-color);
      background: var(--tr-background);
    }

    .option-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .option-title {
      font-weight: 600;
      margin-bottom: 0.25rem;
      color: var(--tr-text-primary);
    }

    .option-desc {
      font-size: 0.75rem;
      color: var(--tr-text-secondary);
    }

    .search-input-group {
      position: relative;
      margin-bottom: 1rem;
    }

    .search-input {
      width: 100%;
      padding: 0.75rem 1rem;
      padding-left: 2.5rem;
      border: 2px solid var(--tr-border);
      border-radius: var(--tr-radius);
      font-size: 1rem;
      font-family: var(--tr-font-family);
      transition: all var(--tr-transition);
      background: var(--tr-background);
      color: var(--tr-text-primary);
    }

    .search-input:focus {
      outline: none;
      border-color: var(--tr-primary-color);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .search-icon {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--tr-text-secondary);
      pointer-events: none;
    }

    .custodian-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .custodian-card {
      background: var(--tr-background);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      padding: 1rem;
      text-align: center;
      cursor: pointer;
      transition: all var(--tr-transition);
      font-size: 0.875rem;
      font-weight: 500;
    }

    .custodian-card:hover {
      border-color: var(--tr-primary-color);
      box-shadow: var(--tr-shadow);
    }

    .results-section {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--tr-border);
    }

    :host([scrollable]) .results-list {
      max-height: 400px; /* Fixed height for embedded widgets */
      overflow-y: auto;
      padding-right: 0.5rem;
      margin-bottom: 1rem;
    }

    :host([scrollable]) .results-list::-webkit-scrollbar {
      width: 6px;
    }

    :host([scrollable]) .results-list::-webkit-scrollbar-track {
      background: var(--tr-surface);
      border-radius: 3px;
    }

    :host([scrollable]) .results-list::-webkit-scrollbar-thumb {
      background: var(--tr-border);
      border-radius: 3px;
    }

    :host([scrollable]) .results-list::-webkit-scrollbar-thumb:hover {
      background: var(--tr-text-secondary);
    }

    .result-card {
      background: var(--tr-surface);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      padding: 1rem;
      margin-bottom: 0.75rem;
      transition: all var(--tr-transition);
      position: relative;
    }

    .result-card:hover {
      box-shadow: var(--tr-shadow);
    }

    /* ML-Enhanced Tier Styling */
    .result-card.enterprise {
      border-left: 4px solid #10b981;
      background: linear-gradient(135deg, var(--tr-surface) 0%, #f0fdf4 100%);
    }

    .result-card.large {
      border-left: 4px solid #3b82f6;
      background: linear-gradient(135deg, var(--tr-surface) 0%, #eff6ff 100%);
    }

    .result-card.medium {
      border-left: 4px solid #f59e0b;
      background: linear-gradient(135deg, var(--tr-surface) 0%, #fefbf0 100%);
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 0.5rem;
    }

    .result-title {
      font-weight: 600;
      color: var(--tr-text-primary);
    }

    .result-meta {
      font-size: 0.75rem;
      color: var(--tr-text-secondary);
      margin-top: 0.25rem;
    }

    .confidence-badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      background: var(--tr-surface);
      border: 1px solid var(--tr-border);
      white-space: nowrap;
    }

    .confidence-high {
      background: #dcfce7;
      border-color: #86efac;
      color: #14532d;
    }

    .confidence-medium {
      background: #fef3c7;
      border-color: #fcd34d;
      color: #713f12;
    }

    .confidence-low {
      background: #fee2e2;
      border-color: #fca5a5;
      color: #7f1d1d;
    }

    /* ML Relevance Score Badges */
    .ml-score {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid;
      font-weight: 500;
      margin-left: 0.5rem;
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

    .ml-score.low {
      background: #f3f4f6;
      border-color: #d1d5db;
      color: #374151;
    }

    /* Tier Badges */
    .tier-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .tier-badge.enterprise {
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #86efac;
    }

    .tier-badge.large {
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #93c5fd;
    }

    .tier-badge.medium {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fcd34d;
    }

    .tier-badge.small {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }

    .result-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
      margin-top: 0.75rem;
    }

    .detail-item {
      font-size: 0.875rem;
    }

    .detail-label {
      color: var(--tr-text-secondary);
      font-size: 0.75rem;
    }

    .detail-value {
      color: var(--tr-text-primary);
      font-weight: 500;
    }

    .hierarchy-path {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding: 0.5rem;
      background: var(--tr-background);
      border-radius: var(--tr-radius);
      font-size: 0.875rem;
      flex-wrap: wrap;
    }

    .path-separator {
      color: var(--tr-text-secondary);
    }

    .action-button {
      background: var(--tr-primary-color);
      color: white;
      border: none;
      border-radius: var(--tr-radius);
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--tr-transition);
      margin-top: 0.75rem;
    }

    .action-button:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .loading {
      text-align: center;
      padding: 2rem;
      color: var(--tr-text-secondary);
    }

    .error {
      background: #fee2e2;
      color: #991b1b;
      padding: 0.75rem;
      border-radius: var(--tr-radius);
      font-size: 0.875rem;
      margin-top: 1rem;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--tr-text-secondary);
    }

    .reset-link {
      color: var(--tr-primary-color);
      text-decoration: none;
      font-size: 0.875rem;
      cursor: pointer;
      margin-top: 1rem;
      display: inline-block;
    }

    .reset-link:hover {
      text-decoration: underline;
    }

    .load-more-container {
      text-align: center;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--tr-border);
    }

    .load-more-button {
      background: var(--tr-background);
      color: var(--tr-primary-color);
      border: 2px solid var(--tr-primary-color);
      border-radius: var(--tr-radius);
      padding: 0.75rem 1.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--tr-transition);
      font-family: var(--tr-font-family);
      min-width: 120px;
    }

    .load-more-button:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .load-more-button:hover:not(:disabled) {
      background: var(--tr-primary-color);
      color: white;
      transform: translateY(-1px);
      box-shadow: var(--tr-shadow);
    }

    .load-more-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .results-info {
      text-align: center;
      color: var(--tr-text-secondary);
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .loading-more {
      text-align: center;
      color: var(--tr-text-secondary);
      font-size: 0.875rem;
      padding: 1rem;
    }

    .no-more-results {
      text-align: center;
      color: var(--tr-text-secondary);
      font-size: 0.875rem;
      padding: 1rem;
      font-style: italic;
    }

    .custodian-refinement {
      background: var(--tr-surface);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      padding: 1.5rem;
      margin-top: 1rem;
    }

    .custodian-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .custodian-name {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--tr-text-primary);
      margin-bottom: 0.5rem;
    }

    .custodian-stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--tr-primary-color);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--tr-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .custodian-message {
      text-align: center;
      color: var(--tr-text-secondary);
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }

    .secondary-search-label {
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--tr-text-primary);
    }

    /* KYC Flow Styles */
    .kyc-intro {
      text-align: center;
      padding: 2rem;
      background: var(--tr-surface);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      margin-top: 1rem;
    }

    .kyc-intro h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--tr-text-primary);
      margin-bottom: 1rem;
    }

    .kyc-intro p {
      color: var(--tr-text-secondary);
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }

    .kyc-verification {
      padding: 1rem;
      background: var(--tr-background);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      margin-top: 1rem;
    }

    .kyc-container {
      min-height: 400px;
      background: var(--tr-background);
      border-radius: var(--tr-radius);
    }

    .kyc-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      color: var(--tr-text-secondary);
    }

    .kyc-loading .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--tr-border);
      border-top-color: var(--tr-primary-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .kyc-success {
      text-align: center;
      padding: 2rem;
      background: var(--tr-surface);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      margin-top: 1rem;
    }

    .success-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .kyc-success h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--tr-text-primary);
      margin-bottom: 0.5rem;
    }

    .kyc-failed {
      text-align: center;
      padding: 2rem;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: var(--tr-radius);
      margin-top: 1rem;
    }

    .kyc-failed h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #991b1b;
      margin-bottom: 1rem;
    }

    .kyc-failed p {
      color: #7f1d1d;
      margin-bottom: 1.5rem;
    }

    .docusign-pending {
      text-align: center;
      padding: 2rem;
      background: var(--tr-surface);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      margin-top: 1rem;
    }

    .docusign-pending h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--tr-text-primary);
      margin-bottom: 1rem;
    }

    .docusign-pending p {
      color: var(--tr-text-secondary);
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }

    .btn-primary {
      background: var(--tr-primary-color);
      color: white;
      border: none;
      border-radius: var(--tr-radius);
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--tr-transition);
      margin: 0.5rem;
    }

    .btn-primary:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: var(--tr-background);
      color: var(--tr-primary-color);
      border: 2px solid var(--tr-primary-color);
      border-radius: var(--tr-radius);
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--tr-transition);
      margin: 0.5rem;
    }

    .btn-secondary:hover {
      background: var(--tr-primary-color);
      color: white;
    }

    .btn-link {
      background: none;
      color: var(--tr-primary-color);
      border: none;
      font-size: 0.875rem;
      cursor: pointer;
      text-decoration: underline;
      margin: 0.5rem;
    }

    .plan-summary {
      background: var(--tr-surface);
      border: 1px solid var(--tr-border);
      border-radius: var(--tr-radius);
      padding: 1rem;
      margin-bottom: 1.5rem;
    }

    .plan-summary h4 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--tr-text-primary);
      margin-bottom: 0.5rem;
    }

    .plan-summary p {
      font-size: 0.875rem;
      color: var(--tr-text-secondary);
      margin: 0.25rem 0;
    }
  `;

  override render() {
    // If a plan is selected, show the KYC flow
    if (this.selectedPlan) {
      return html`
        <div class="container">
          <div class="header">
            <h2 class="title">Complete Your Rollover</h2>
            <p class="subtitle">We'll guide you through the next steps</p>
          </div>

          ${this.renderPlanSummary()}
          ${this.renderKYCFlow()}

          <a class="reset-link" @click=${() => this.reset()}>
            ← Start over
          </a>
        </div>
      `;
    }

    // Otherwise show the search interface
    return html`
      <div class="container">
        <div class="header">
          <h2 class="title">Find Your 401(k)</h2>
          <p class="subtitle">We'll help you locate your retirement account</p>
        </div>

        <div class="search-section">
          <p class="question">How would you like to search?</p>

          <div class="search-options">
            <div
              class="option-card ${this.searchMode === 'employer' ? 'active' : ''}"
              @click=${() => this.setSearchMode('employer')}>
              <div class="option-icon">🏢</div>
              <div class="option-title">By Employer</div>
              <div class="option-desc">I know my company name</div>
            </div>

            <div
              class="option-card ${this.searchMode === 'custodian' ? 'active' : ''}"
              @click=${() => this.setSearchMode('custodian')}>
              <div class="option-icon">🏦</div>
              <div class="option-title">By Provider</div>
              <div class="option-desc">I know who manages my 401(k)</div>
            </div>
          </div>

          ${this.searchMode === 'employer' ? this.renderEmployerSearch() : ''}
          ${this.searchMode === 'custodian' ? this.renderCustodianSearch() : ''}
          ${this.searchMode === 'custodian-refinement' ? this.renderCustodianRefinement() : ''}
        </div>

        ${this.loading ? html`
          <div class="loading">
            <div>🔍 Searching...</div>
          </div>
        ` : ''}

        ${this.error ? html`
          <div class="error">
            ⚠️ ${this.error}
          </div>
        ` : ''}

        ${this.searchResults.length > 0 ? this.renderResults() : ''}

        ${this.searchMode !== 'initial' ? html`
          <a class="reset-link" @click=${() => this.reset()}>
            ← Start over
          </a>
        ` : ''}
      </div>
    `;
  }

  private renderEmployerSearch() {
    return html`
      <div class="search-input-group">
        <div class="search-icon">🔍</div>
        <input
          type="text"
          class="search-input"
          placeholder="Type your employer name (e.g., Microsoft, Walmart)"
          .value=${this.searchQuery}
          @input=${(e: Event) => this.searchQuery = (e.target as HTMLInputElement).value}
          @keyup=${(e: KeyboardEvent) => e.key === 'Enter' && this.performSearch()}
        />
      </div>
    `;
  }

  private renderCustodianSearch() {
    return html`
      <div class="custodian-grid">
        ${this.custodians.map(custodian => html`
          <div class="custodian-card" @click=${() => this.selectCustodian(custodian)}>
            ${custodian.name}
          </div>
        `)}
      </div>
    `;
  }

  private renderCustodianRefinement() {
    if (!this.selectedCustodian || !this.custodianStats) {
      return html``;
    }

    return html`
      <div class="custodian-refinement">
        <div class="custodian-header">
          <div class="custodian-name">${this.selectedCustodian.name}</div>

          <div class="custodian-stats">
            <div class="stat-item">
              <div class="stat-value">${this.custodianStats.planCount?.toLocaleString()}</div>
              <div class="stat-label">Retirement Plans</div>
            </div>
            ${this.custodianStats.marketShare ? html`
              <div class="stat-item">
                <div class="stat-value">${this.custodianStats.marketShare}%</div>
                <div class="stat-label">Market Share</div>
              </div>
            ` : ''}
          </div>

          <div class="custodian-message">
            ${this.selectedCustodian.name} manages ${this.custodianStats.planCount?.toLocaleString()} retirement plans across the US.<br>
            Please search for your employer to find your specific plan.
          </div>
        </div>

        <div class="secondary-search-label">Search for your employer:</div>
        <div class="search-input-group">
          <div class="search-icon">🔍</div>
          <input
            type="text"
            class="search-input"
            placeholder="Type your employer name (e.g., Microsoft, Walmart)"
            .value=${this.searchQuery}
            @input=${(e: Event) => this.searchQuery = (e.target as HTMLInputElement).value}
            @keyup=${(e: KeyboardEvent) => e.key === 'Enter' && this.performCustodianEmployerSearch()}
          />
        </div>
      </div>
    `;
  }

  private renderResults() {
    const resultsTitle = this.searchMode === 'custodian-refinement' && this.selectedCustodian
      ? `${this.selectedCustodian.name} Plans`
      : 'Search Results';

    return html`
      <div class="results-section">
        <h3 style="margin-bottom: 1rem;">${resultsTitle}</h3>

        ${this.searchMode === 'custodian-refinement' && this.selectedCustodian ? html`
          <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--tr-surface); border-radius: var(--tr-radius); border: 1px solid var(--tr-border);">
            <div style="font-size: 0.875rem; color: var(--tr-text-secondary);">
              🏦 Searching within ${this.selectedCustodian.name}'s ${this.custodianStats?.planCount?.toLocaleString()} plans for "<strong>${this.searchQuery}</strong>"
            </div>
            <div style="font-size: 0.75rem; color: var(--tr-text-secondary); margin-top: 0.25rem;">
              Only plans managed by ${this.selectedCustodian.name} are shown in these results.
            </div>
          </div>
        ` : ''}

        ${this.totalResults > 0 ? html`
          <div class="results-info">
            Showing ${this.searchResults.length} of ${this.totalResults.toLocaleString()} results
          </div>
        ` : ''}

        <div class="results-list">
          ${this.searchResults.map(result => html`
          <div class="result-card ${this.getTierClass(result)}">
            ${this.renderTierBadge(result)}
            <div class="result-header">
              <div>
                <div class="result-title">${result.planName || result.sponsorName}</div>
                <div class="result-meta">
                  ${result.sponsorCity ? `${result.sponsorCity}, ${result.sponsorState}` : ''}
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="confidence-badge ${this.getConfidenceClass(result.contactConfidence)}">
                  ${this.getConfidenceLabel(result.contactConfidence)}
                </span>
                ${this.renderMLScore(result)}
              </div>
            </div>

            <div class="result-details">
              ${result.participants ? html`
                <div class="detail-item">
                  <div class="detail-label">Participants</div>
                  <div class="detail-value">${result.participants.toLocaleString()}</div>
                </div>
              ` : ''}

              ${result.primaryContact?.name ? html`
                <div class="detail-item">
                  <div class="detail-label">Custodian</div>
                  <div class="detail-value">${result.primaryContact.name}</div>
                </div>
              ` : ''}
            </div>

            ${result.sponsorName && result.primaryContact?.name ? html`
              <div class="hierarchy-path">
                <span>${result.sponsorName}</span>
                <span class="path-separator">→</span>
                <span>${result.planName}</span>
                <span class="path-separator">→</span>
                <span><strong>${result.primaryContact.name}</strong></span>
              </div>
            ` : ''}

            <button class="action-button" @click=${() => this.selectResult(result)}>
              Select This Plan
            </button>
          </div>
        `)}

        ${this.searchResults.length === 0 && !this.loading ? html`
          <div class="empty-state">
            <p>No results found. Try a different search term.</p>
          </div>
        ` : ''}
        </div>

        ${this.searchResults.length > 0 ? this.renderPaginationControls() : ''}
      </div>
    `;
  }

  private renderPaginationControls() {
    return html`
      <div class="load-more-container">
        ${this.loadingMore ? html`
          <div class="loading-more">
            🔍 Loading more results...
          </div>
        ` : this.hasMoreResults ? html`
          <button
            class="load-more-button"
            @click=${this.loadMoreResults}
            ?disabled=${this.loadingMore}
            aria-label="Load more search results"
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.loadMoreResults();
              }
            }}
          >
            Load More Results
          </button>
        ` : this.searchResults.length >= this.resultsPerPage ? html`
          <div class="no-more-results">
            ✓ All results loaded
          </div>
        ` : ''}
      </div>
    `;
  }

  private setSearchMode(mode: 'employer' | 'custodian') {
    this.searchMode = mode;
    this.resetPagination();

    if (mode === 'employer') {
      // Auto-focus the input after render
      this.updateComplete.then(() => {
        const input = this.shadowRoot?.querySelector('.search-input') as HTMLInputElement;
        input?.focus();
      });
    }
  }

  private resetPagination() {
    this.searchResults = [];
    this.error = '';
    this.currentOffset = 0;
    this.hasMoreResults = false;
    this.totalResults = 0;
  }

  private async performSearch(loadMore = false) {
    if (!this.searchQuery.trim()) return;

    if (loadMore) {
      this.loadingMore = true;
    } else {
      this.loading = true;
      this.resetPagination();
    }

    this.error = '';

    try {
      const offset = loadMore ? this.currentOffset : 0;
      const response = await fetch(
        `${this.apiEndpoint}/searchPlans?q=${encodeURIComponent(this.searchQuery)}&limit=${this.resultsPerPage}&offset=${offset}&force_bigquery=true`
      );

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      let newResults = data.results || [];

      // Apply ML enhancements to results
      newResults = this.enhanceSearchResults(newResults);
      newResults = this.sortResultsByRelevance(newResults);

      if (loadMore) {
        this.searchResults = [...this.searchResults, ...newResults];
      } else {
        this.searchResults = newResults;
      }

      // Handle totalCount from API response, or estimate based on results
      if (data.totalCount !== undefined) {
        this.totalResults = data.totalCount;
      } else {
        // If no totalCount, estimate based on whether we got a full page
        this.totalResults = newResults.length === this.resultsPerPage
          ? this.currentOffset + newResults.length + 1 // At least one more page
          : this.currentOffset + newResults.length;      // This is the last page
      }

      this.currentOffset = offset + newResults.length;
      this.hasMoreResults = newResults.length === this.resultsPerPage &&
                            (data.totalCount === undefined || this.currentOffset < this.totalResults);

      if (this.searchResults.length === 0 && !loadMore) {
        this.error = 'No results found. Try a different search term.';
      }
    } catch (error) {
      const errorMessage = loadMore
        ? 'Failed to load more results. Please try again.'
        : 'Failed to search. Please try again.';
      this.error = errorMessage;
      console.error('Search error:', error);
    } finally {
      this.loading = false;
      this.loadingMore = false;
    }
  }

  private async selectCustodian(custodian: any) {
    this.loading = true;
    this.error = '';

    try {
      // First, get custodian statistics to determine if it's a large custodian
      const custodianStats = await this.getCustodianStats(custodian.name);

      if (custodianStats && custodianStats.planCount > this.largeCustomdianThreshold) {
        // Large custodian - show refinement interface
        this.selectedCustodian = custodian;
        this.custodianStats = custodianStats;
        this.searchMode = 'custodian-refinement';
        this.searchQuery = '';

        // Auto-focus the input after render
        this.updateComplete.then(() => {
          const input = this.shadowRoot?.querySelector('.search-input') as HTMLInputElement;
          input?.focus();
        });
      } else {
        // Small custodian - show results directly
        this.searchQuery = custodian.name;
        await this.performSearch(false);
      }
    } catch (error) {
      console.error('Error selecting custodian:', error);
      this.error = 'Failed to get custodian information. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  private async getCustodianStats(custodianName: string): Promise<any> {
    try {
      // For now, simulate custodian stats based on known major custodians
      // In production, this would call the updated API with custodian search
      const custodianData: Record<string, any> = {
        'fidelity': { planCount: 1547, marketShare: 23.2 },
        'empower': { planCount: 1223, marketShare: 18.4 },
        'vanguard': { planCount: 892, marketShare: 13.4 },
        'principal': { planCount: 756, marketShare: 11.3 },
        'tiaa': { planCount: 634, marketShare: 9.5 },
        'schwab': { planCount: 445, marketShare: 6.7 },
        'johnhancock': { planCount: 234, marketShare: 3.5 },
        'massmutual': { planCount: 187, marketShare: 2.8 },
        'troweprice': { planCount: 156, marketShare: 2.3 },
        'prudential': { planCount: 123, marketShare: 1.8 },
        'wellsfargo': { planCount: 89, marketShare: 1.3 },
        'transamerica': { planCount: 67, marketShare: 1.0 }
      };

      const custodianKey = custodianName.toLowerCase();
      if (custodianData[custodianKey]) {
        return custodianData[custodianKey];
      }

      // For other custodians, try the API with custodian filtering to get count
      const response = await fetch(
        `${this.apiEndpoint}/searchPlans?custodian=${encodeURIComponent(custodianName)}&limit=1&force_bigquery=true`
      );

      if (!response.ok) throw new Error('Failed to get custodian stats');

      const data = await response.json();

      // Use the total count from pagination to get the actual number of plans
      if (data.pagination?.total > 0) {
        return {
          planCount: data.pagination.total,
          marketShare: 0.1 // Placeholder market share
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting custodian stats:', error);
      return null;
    }
  }

  private async performCustodianEmployerSearch(loadMore = false) {
    if (!this.searchQuery.trim() || !this.selectedCustodian) return;

    if (loadMore) {
      this.loadingMore = true;
    } else {
      this.loading = true;
      this.resetPagination();
    }

    this.error = '';

    try {
      const offset = loadMore ? this.currentOffset : 0;
      // Search with custodian filtering using the new API parameter
      const response = await fetch(
        `${this.apiEndpoint}/searchPlans?q=${encodeURIComponent(this.searchQuery)}&custodian=${encodeURIComponent(this.selectedCustodian.name)}&limit=${this.resultsPerPage}&offset=${offset}&force_bigquery=true`
      );

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      let newResults = data.results || [];

      // Apply ML enhancements to results
      newResults = this.enhanceSearchResults(newResults);
      newResults = this.sortResultsByRelevance(newResults);

      if (loadMore) {
        this.searchResults = [...this.searchResults, ...newResults];
      } else {
        this.searchResults = newResults;
      }

      // Handle totalCount from API response
      if (data.totalCount !== undefined) {
        this.totalResults = data.totalCount;
      } else {
        this.totalResults = newResults.length === this.resultsPerPage
          ? this.currentOffset + newResults.length + 1
          : this.currentOffset + newResults.length;
      }

      this.currentOffset = offset + newResults.length;
      this.hasMoreResults = newResults.length === this.resultsPerPage &&
                            (data.totalCount === undefined || this.currentOffset < this.totalResults);

      if (this.searchResults.length === 0 && !loadMore) {
        this.error = `No plans found for "${this.searchQuery}" with ${this.selectedCustodian.name}. Try a different employer name.`;
      }
    } catch (error) {
      const errorMessage = loadMore
        ? 'Failed to load more results. Please try again.'
        : 'Failed to search. Please try again.';
      this.error = errorMessage;
      console.error('Custodian employer search error:', error);
    } finally {
      this.loading = false;
      this.loadingMore = false;
    }
  }

  private selectResult(result: any) {
    // Store the selected plan with required information
    this.selectedPlan = {
      ein: result.ein || result.planId || '',
      planName: result.planName || result.sponsorName || '',
      planId: result.planId || result.id || '',
      sponsorName: result.sponsorName || '',
      primaryContact: result.primaryContact || null,
      participants: result.participants || 0
    };

    // Emit plan-selected event
    this.dispatchEvent(new CustomEvent('plan-selected', {
      detail: this.selectedPlan,
      bubbles: true,
      composed: true
    }));

    // Transition to KYC intro
    this.flowState = 'kyc-intro';
    this.kycState = 'required';

    // Emit flow state change event
    this.dispatchEvent(new CustomEvent('flow-state-changed', {
      detail: { state: this.flowState, plan: this.selectedPlan },
      bubbles: true,
      composed: true
    }));
  }

  private reset() {
    this.searchMode = 'initial';
    this.flowState = 'initial';
    this.searchQuery = '';
    this.selectedCustodian = null;
    this.custodianStats = null;
    this.selectedPlan = null;
    this.kycState = 'not-required';
    this.kycError = '';
    this.resetPagination();

    // Clean up Persona client if it exists
    if (this.personaClient) {
      try {
        this.personaClient.destroy();
      } catch (error) {
        console.warn('Error destroying Persona client:', error);
      }
      this.personaClient = null;
    }
  }

  private async loadMoreResults() {
    if (this.hasMoreResults && !this.loadingMore) {
      if (this.searchMode === 'custodian-refinement') {
        await this.performCustodianEmployerSearch(true);
      } else {
        await this.performSearch(true);
      }
    }
  }

  private getConfidenceClass(confidence: string): string {
    switch (confidence?.toLowerCase()) {
      case 'high': return 'confidence-high';
      case 'medium': return 'confidence-medium';
      case 'low': return 'confidence-low';
      default: return '';
    }
  }

  private getConfidenceLabel(confidence: string): string {
    switch (confidence?.toLowerCase()) {
      case 'high': return '✓ Verified';
      case 'medium': return '~ Likely';
      case 'low': return '? Uncertain';
      default: return 'Unknown';
    }
  }

  // ML-Enhanced Helper Methods
  private enhanceSearchResults(results: any[]): any[] {
    return results.map(result => {
      // Add ML metadata if not present
      if (!result.metadata) {
        result.metadata = this.generateMLMetadata(result);
      }
      return result;
    });
  }

  private generateMLMetadata(result: any): any {
    const sponsorName = (result.sponsorName || '').toUpperCase();
    const participants = result.participants || 0;

    // Determine company tier based on size and recognition
    let tier = 'small';
    let mlRelevanceScore = 50; // Base score

    // Fortune company recognition (enterprise tier)
    const isFortuneCompany = /\b(MICROSOFT|APPLE|AMAZON|GOOGLE|META|FACEBOOK|TESLA|NETFLIX|ORACLE|SALESFORCE|ADOBE|NVIDIA|INTEL|IBM|CISCO|WALMART|TARGET|HOME DEPOT|JPMORGAN|BANK OF AMERICA|WELLS FARGO|GOLDMAN SACHS)\b/.test(sponsorName);

    if (isFortuneCompany) {
      tier = 'enterprise';
      mlRelevanceScore += 30; // Significant boost for Fortune companies
    } else if (participants >= 10000) {
      tier = 'large';
      mlRelevanceScore += 20;
    } else if (participants >= 1000) {
      tier = 'medium';
      mlRelevanceScore += 10;
    }

    // Participant size scoring
    if (participants >= 50000) {
      mlRelevanceScore += 15;
    } else if (participants >= 10000) {
      mlRelevanceScore += 10;
    } else if (participants >= 1000) {
      mlRelevanceScore += 5;
    }

    // Asset-based scoring (if available)
    if (result.totalAssets) {
      if (result.totalAssets >= 1000000000) { // $1B+
        mlRelevanceScore += 10;
      } else if (result.totalAssets >= 100000000) { // $100M+
        mlRelevanceScore += 5;
      }
    }

    // Cap the score at 100
    mlRelevanceScore = Math.min(100, mlRelevanceScore);

    return {
      tier,
      mlRelevanceScore,
      searchRank: mlRelevanceScore,
      resultConfidence: mlRelevanceScore >= 80 ? 1.0 : mlRelevanceScore >= 60 ? 0.8 : 0.6
    };
  }

  private sortResultsByRelevance(results: any[]): any[] {
    return results.sort((a, b) => {
      const aTier = a.metadata?.tier || 'small';
      const bTier = b.metadata?.tier || 'small';

      // Tier priority: enterprise > large > medium > small
      const tierOrder = { enterprise: 4, large: 3, medium: 2, small: 1 };
      const aTierScore = tierOrder[aTier as keyof typeof tierOrder] || 1;
      const bTierScore = tierOrder[bTier as keyof typeof tierOrder] || 1;

      if (aTierScore !== bTierScore) {
        return bTierScore - aTierScore; // Higher tier first
      }

      // Within same tier, sort by ML relevance score
      const aScore = a.metadata?.mlRelevanceScore || 50;
      const bScore = b.metadata?.mlRelevanceScore || 50;
      return bScore - aScore;
    });
  }

  private getTierClass(result: any): string {
    return result.metadata?.tier || 'small';
  }

  private renderTierBadge(result: any) {
    const tier = result.metadata?.tier;
    if (!tier || tier === 'small') return '';

    const tierConfig = {
      enterprise: { label: '⭐ Fortune', icon: '⭐' },
      large: { label: '🏢 Large Corp', icon: '🏢' },
      medium: { label: '🏬 Mid-Size', icon: '🏬' }
    };

    const config = tierConfig[tier as keyof typeof tierConfig];
    if (!config) return '';

    return html`
      <div class="tier-badge ${tier}">
        ${config.icon} ${config.label}
      </div>
    `;
  }

  private renderMLScore(result: any) {
    const score = result.metadata?.mlRelevanceScore;
    if (!score) return '';

    const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    const icon = score >= 70 ? '🎯' : score >= 40 ? '📍' : '📌';

    return html`
      <span class="ml-score ${scoreClass}">
        ${icon} ${Math.round(score)}
      </span>
    `;
  }

  // KYC Flow Rendering Methods
  private renderPlanSummary() {
    if (!this.selectedPlan) return '';

    return html`
      <div class="plan-summary">
        <h4>Selected Retirement Plan</h4>
        <p><strong>Plan:</strong> ${this.selectedPlan.planName}</p>
        ${this.selectedPlan.sponsorName ? html`<p><strong>Employer:</strong> ${this.selectedPlan.sponsorName}</p>` : ''}
        ${this.selectedPlan.primaryContact?.name ? html`<p><strong>Provider:</strong> ${this.selectedPlan.primaryContact.name}</p>` : ''}
        ${this.selectedPlan.participants ? html`<p><strong>Participants:</strong> ${this.selectedPlan.participants.toLocaleString()}</p>` : ''}
      </div>
    `;
  }

  private renderKYCFlow() {
    switch (this.kycState) {
      case 'checking':
        return html`
          <div class="kyc-loading">
            <div class="spinner"></div>
            <p>Checking verification requirements...</p>
          </div>
        `;

      case 'required':
        return html`
          <div class="kyc-intro">
            <h3>🔐 Identity Verification Required</h3>
            <p>For your benefit, we need to gather and verify information before making a request to the record keeper.</p>
            <p>This secure process takes just 2-3 minutes and helps protect your retirement savings.</p>
            <ul style="text-align: left; display: inline-block; margin: 1rem 0;">
              <li>Government-issued ID required</li>
              <li>Bank-level security & encryption</li>
              <li>Compliant with federal regulations</li>
            </ul>
            <button class="btn-primary" @click=${this.startKYC}>
              Start Verification
            </button>
          </div>
        `;

      case 'in-progress':
        return html`
          <div class="kyc-verification">
            <div class="kyc-loading">
              <div class="spinner"></div>
              <p>Loading Persona verification...</p>
            </div>
          </div>
        `;

      case 'completed':
        return html`
          <div class="kyc-success">
            <div class="success-icon">✅</div>
            <h3>Identity Verified Successfully</h3>
            <p>Thank you! Your identity has been verified. Proceeding to document signing...</p>
            <button class="btn-primary" @click=${this.proceedToDocuSign}>
              Continue to Documents
            </button>
          </div>
        `;

      case 'failed':
        return html`
          <div class="kyc-failed">
            <h3>⚠️ Verification Issue</h3>
            <p>${this.kycError || 'We encountered an issue verifying your identity. Please try again or contact support.'}</p>
            <button class="btn-secondary" @click=${this.retryKYC}>
              Try Again
            </button>
            <button class="btn-link" @click=${this.contactSupport}>
              Contact Support
            </button>
          </div>
        `;

      default:
        if (this.flowState === 'docusign-pending') {
          return html`
            <div class="docusign-pending">
              <h3>📄 Document Signing</h3>
              <p>Great! Your identity has been verified. Next, you'll need to sign the rollover authorization documents.</p>
              <p>You'll receive an email with a secure link to sign your documents electronically.</p>
              <button class="btn-primary" @click=${this.initiateDocuSign}>
                Send Documents for Signing
              </button>
            </div>
          `;
        }
        return '';
    }
  }

  // KYC Flow Methods
  private async startKYC() {
    this.kycState = 'in-progress';
    this.flowState = 'kyc-verification';
    this.kycError = '';

    try {
      // Emit KYC started event
      this.dispatchEvent(new CustomEvent('kyc-started', {
        detail: { plan: this.selectedPlan },
        bubbles: true,
        composed: true
      }));

      // Load Persona SDK and initialize
      await this.loadPersonaSDK();
      await this.initializePersona();
    } catch (error) {
      console.error('Error starting KYC:', error);
      this.kycState = 'failed';
      this.kycError = 'Failed to initialize verification. Please try again.';
    }
  }

  private async loadPersonaSDK(): Promise<void> {
    if (this.personaLoaded) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // Using the correct Persona SDK URL from npm
      script.src = 'https://cdn.withpersona.com/dist/persona-v5.3.1.js';
      script.crossOrigin = 'anonymous';
      // TODO: Add integrity hash from Persona dashboard for production
      // script.integrity = 'sha384-YOUR_INTEGRITY_HASH_HERE';
      script.async = true;
      script.onload = () => {
        this.personaLoaded = true;
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load Persona SDK'));
      };

      // Append to document head instead of shadow root for global availability
      document.head.appendChild(script);
    });
  }

  private async initializePersona() {
    const personaWindow = window as PersonaWindow;

    if (!personaWindow.Persona) {
      throw new Error('Persona SDK not loaded');
    }

    if (!this.personaEnvironmentId) {
      throw new Error('Persona environment ID is required. Please provide persona-environment-id attribute.');
    }

    try {
      let currentInquiryId: string | null = null;

      // Generate a unique reference ID for this user session
      const referenceId = `trustrails_${this.selectedPlan?.ein || 'unknown'}_${Date.now()}`;

      // Create Persona client matching the documentation exactly
      this.personaClient = new personaWindow.Persona.Client({
        templateId: this.personaTemplateId, // itmpl_8432ukrCiAegZZTRnvc6mVi7xvgG
        environmentId: this.personaEnvironmentId, // Must be provided by partner
        referenceId: referenceId, // Optional but recommended for tracking
        onReady: () => {
          console.log('Persona client ready, opening verification flow...');
          // Open the Persona modal immediately when ready (as per documentation)
          this.personaClient?.open();
        },
        onEvent: (name: string, meta: any) => {
          console.log(`Received event: ${name}`);

          switch (name) {
            case 'start':
              // Collect and save the inquiry ID for future use
              currentInquiryId = meta['inquiryId'];
              console.log(`Inquiry started with ID: ${currentInquiryId}`);
              break;
            default:
              console.log(`Event meta:`, JSON.stringify(meta));
          }
        },
        onComplete: ({ inquiryId, status, fields }) => {
          // Inquiry completed. Optionally tell your server about it.
          console.log(`Sending finished inquiry ${inquiryId} to backend`);
          console.log('KYC Status:', status);

          // Destroy the client to close the modal
          if (this.personaClient) {
            this.personaClient.destroy();
            this.personaClient = null;
          }

          this.handleKYCComplete(inquiryId, status, fields);
        },
        onCancel: ({ inquiryId, sessionToken }) => {
          console.log('onCancel', { inquiryId, sessionToken });

          // Destroy the client to close the modal
          if (this.personaClient) {
            this.personaClient.destroy();
            this.personaClient = null;
          }

          this.handleKYCCancel();
        },
        onError: (error: { status: number; code: string }) => {
          console.log('onError:', error);

          // Destroy the client to close the modal
          if (this.personaClient) {
            this.personaClient.destroy();
            this.personaClient = null;
          }

          this.handleKYCError(error);
        }
      });
    } catch (error) {
      console.error('Error initializing Persona:', error);
      throw error;
    }
  }

  private async handleKYCComplete(inquiryId: string, status: string, _fields: any) {
    console.log('Persona inquiry completed:', { inquiryId, status });

    // Update Firebase user with KYC completion
    if (this.bearerToken && this.userId) {
      try {
        const kycUpdateEndpoint = this.authEndpoint.replace('/auth', '/kyc/complete');

        const updateResponse = await fetch(kycUpdateEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bearerToken}`,
            'X-TrustRails-Partner-ID': this.partnerId
          },
          body: JSON.stringify({
            userId: this.userId,
            personaId: inquiryId,
            kycStatus: status === 'completed' ? 'completed' : 'failed',
            kycCompletedAt: new Date().toISOString(),
            kycVerificationLevel: 'standard'
          })
        });

        if (updateResponse.ok) {
          console.log('Successfully updated user KYC status in Firebase');

          // Update local user session
          if (this.userSession) {
            this.userSession.persona_id = inquiryId;
            this.userSession.kyc_status = 'completed';
            this.userSession.kyc_completed_at = new Date().toISOString();
          }
        } else {
          console.error('Failed to update KYC status:', await updateResponse.text());
        }
      } catch (error) {
        console.error('Error updating KYC status:', error);
      }
    }

    this.kycState = 'completed';

    // Auto-proceed to DocuSign after a short delay
    setTimeout(() => {
      this.proceedToDocuSign();
    }, 2000);
  }

  private handleKYCCancel() {
    console.log('KYC cancelled by user');

    this.kycState = 'required';
    this.flowState = 'kyc-intro';

    // Emit KYC cancelled event
    this.dispatchEvent(new CustomEvent('kyc-cancelled', {
      detail: { plan: this.selectedPlan },
      bubbles: true,
      composed: true
    }));
  }

  private handleKYCError(error: { status?: number; code?: string } | any) {
    console.error('KYC error:', error);

    this.kycState = 'failed';

    // Handle specific Persona error codes from documentation
    if (error.code) {
      switch (error.code) {
        case 'application_error':
          this.kycError = 'An internal error occurred. Please contact support.';
          break;
        case 'invalid_config':
          this.kycError = 'Invalid configuration. Please contact support.';
          break;
        case 'unauthenticated':
          this.kycError = 'Session expired. Please refresh and try again.';
          break;
        case 'inactive_template':
          this.kycError = 'Verification template is inactive. Please contact support.';
          break;
        default:
          this.kycError = `Verification error: ${error.code}. Please try again.`;
      }
    } else {
      this.kycError = 'Verification failed. Please try again or contact support if the issue persists.';
    }
  }

  private retryKYC() {
    this.kycState = 'required';
    this.flowState = 'kyc-intro';
    this.kycError = '';

    // Clean up existing Persona client
    if (this.personaClient) {
      try {
        this.personaClient.destroy();
      } catch (error) {
        console.warn('Error destroying Persona client:', error);
      }
      this.personaClient = null;
    }
  }

  private proceedToDocuSign() {
    this.flowState = 'docusign-pending';

    // Emit flow state change event
    this.dispatchEvent(new CustomEvent('flow-state-changed', {
      detail: { state: this.flowState, plan: this.selectedPlan },
      bubbles: true,
      composed: true
    }));
  }

  private initiateDocuSign() {
    // Emit DocuSign initiation event
    this.dispatchEvent(new CustomEvent('docusign-initiated', {
      detail: { plan: this.selectedPlan },
      bubbles: true,
      composed: true
    }));

    // In a real implementation, this would redirect to DocuSign or open DocuSign embed
    alert('DocuSign integration would be initiated here. This is a placeholder for the demo.');
  }

  private contactSupport() {
    // Emit support contact event
    this.dispatchEvent(new CustomEvent('support-contact-requested', {
      detail: { reason: 'kyc-failed', plan: this.selectedPlan },
      bubbles: true,
      composed: true
    }));

    // In a real implementation, this would open a support chat or contact form
    alert('Support contact would be initiated here. This is a placeholder for the demo.');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'trustrails-hierarchical-search': TrustRailsHierarchicalSearch;
  }
}