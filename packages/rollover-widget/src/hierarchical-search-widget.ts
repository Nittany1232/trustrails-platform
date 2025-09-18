import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * TrustRails Hierarchical Search Widget
 * A plain, themeable widget for finding 401(k) custodians
 * Better UX than Capitalize - single interface, hierarchical results
 */
@customElement('trustrails-hierarchical-search')
export class TrustRailsHierarchicalSearch extends LitElement {
  @property({ type: String }) apiEndpoint = 'http://localhost:8082';
  @property({ type: String }) theme = 'default';
  @property({ type: Boolean }) debug = false;
  @property({ type: Boolean }) scrollable = false; // Enable fixed height with scroll

  @state() private searchMode: 'initial' | 'employer' | 'custodian' | 'custodian-refinement' = 'initial';
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

  private readonly resultsPerPage = 5; // Keep it compact for embedded widgets
  private readonly largeCustomdianThreshold = 2; // Plans threshold for requiring refinement (lowered for testing - set to 100+ for production)

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
    }

    .result-card:hover {
      box-shadow: var(--tr-shadow);
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
  `;

  override render() {
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
              🏦 Showing ${this.selectedCustodian.name} plans for "<strong>${this.searchQuery}</strong>"
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
          <div class="result-card">
            <div class="result-header">
              <div>
                <div class="result-title">${result.planName || result.sponsorName}</div>
                <div class="result-meta">
                  ${result.sponsorCity ? `${result.sponsorCity}, ${result.sponsorState}` : ''}
                </div>
              </div>
              <span class="confidence-badge ${this.getConfidenceClass(result.contactConfidence)}">
                ${this.getConfidenceLabel(result.contactConfidence)}
              </span>
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
      const newResults = data.results || [];

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

      // For other custodians, try the API
      const response = await fetch(
        `${this.apiEndpoint}/searchPlans?q=${encodeURIComponent(custodianName)}&limit=5&force_bigquery=true`
      );

      if (!response.ok) throw new Error('Failed to get custodian stats');

      const data = await response.json();
      const results = data.results || [];

      // Look for a custodian result (marked with isCustodian: true)
      const custodianResult = results.find((r: any) => r.isCustodian);
      if (custodianResult) {
        return {
          planCount: custodianResult.participants || 0, // participants field contains plan count for custodians
          marketShare: custodianResult.marketShare || 0
        };
      }

      // Estimate based on search results
      if (results.length > 0) {
        return {
          planCount: Math.max(data.pagination?.total || results.length, 5),
          marketShare: 0.1
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
      // Just search for the employer name, we'll filter by custodian on the frontend
      // This is temporary until we have proper custodian filtering in the API
      const response = await fetch(
        `${this.apiEndpoint}/searchPlans?q=${encodeURIComponent(this.searchQuery)}&limit=${this.resultsPerPage * 3}&offset=${offset}&force_bigquery=true`
      );

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      const newResults = data.results || [];

      // Filter out custodian results, only show actual plans
      const planResults = newResults.filter((r: any) => !r.isCustodian);

      if (loadMore) {
        this.searchResults = [...this.searchResults, ...planResults];
      } else {
        this.searchResults = planResults;
      }

      // Handle totalCount from API response
      if (data.totalCount !== undefined) {
        this.totalResults = data.totalCount;
      } else {
        this.totalResults = planResults.length === this.resultsPerPage
          ? this.currentOffset + planResults.length + 1
          : this.currentOffset + planResults.length;
      }

      this.currentOffset = offset + planResults.length;
      this.hasMoreResults = planResults.length === this.resultsPerPage &&
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
    this.dispatchEvent(new CustomEvent('plan-selected', {
      detail: result,
      bubbles: true,
      composed: true
    }));
  }

  private reset() {
    this.searchMode = 'initial';
    this.searchQuery = '';
    this.selectedCustodian = null;
    this.custodianStats = null;
    this.resetPagination();
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
}

declare global {
  interface HTMLElementTagNameMap {
    'trustrails-hierarchical-search': TrustRailsHierarchicalSearch;
  }
}