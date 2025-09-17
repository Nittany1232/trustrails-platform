/**
 * Plan search functionality for the widget
 * Connects to the Cloud Functions search API
 */

export interface PlanSearchResult {
  ein: string;
  planNumber: string;
  planName: string;
  company: {
    name: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  planDetails: {
    type: string;
    participants: number;
    assets: number;
    assetFormatted: string;
  };
}

export interface PlanSearchResponse {
  success: boolean;
  results: PlanSearchResult[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  metadata?: {
    searchMethod: string;
    cached: boolean;
    processingTime: string;
  };
}

export class PlanSearchService {
  private apiEndpoint: string;
  private cache: Map<string, { data: PlanSearchResponse; timestamp: number }>;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(environment: 'sandbox' | 'production' = 'sandbox') {
    this.apiEndpoint = environment === 'production'
      ? 'https://us-central1-trustrails-faa3e.cloudfunctions.net/searchPlans'
      : 'http://localhost:8081';

    this.cache = new Map();
  }

  /**
   * Search for retirement plans
   */
  async searchPlans(params: {
    query?: string;
    ein?: string;
    state?: string;
    city?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<PlanSearchResponse> {
    // Build query string
    const queryParams = new URLSearchParams();

    if (params.query) queryParams.append('q', params.query);
    if (params.ein) queryParams.append('ein', params.ein);
    if (params.state) queryParams.append('state', params.state);
    if (params.city) queryParams.append('city', params.city);
    if (params.type) queryParams.append('type', params.type);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());

    const cacheKey = queryParams.toString();

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.apiEndpoint}/searchPlans?${queryParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data: PlanSearchResponse = await response.json();

      // Cache successful response
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      // Clean old cache entries
      this.cleanCache();

      return data;

    } catch (error) {
      console.error('Plan search error:', error);
      throw error;
    }
  }

  /**
   * Search by company name
   */
  async searchByCompany(companyName: string, state?: string): Promise<PlanSearchResult[]> {
    const response = await this.searchPlans({
      query: companyName,
      state,
      limit: 20
    });

    return response.results;
  }

  /**
   * Search by EIN
   */
  async searchByEIN(ein: string): Promise<PlanSearchResult[]> {
    const response = await this.searchPlans({
      ein: ein.replace(/[^0-9]/g, ''), // Clean EIN
      limit: 10
    });

    return response.results;
  }

  /**
   * Get popular plans by state
   */
  async getPopularPlansByState(state: string, limit = 10): Promise<PlanSearchResult[]> {
    const response = await this.searchPlans({
      state,
      limit,
      offset: 0
    });

    return response.results;
  }

  /**
   * Clean old cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Format plan for display in widget
 */
export function formatPlanForDisplay(plan: PlanSearchResult): string {
  const parts = [plan.company.name];

  if (plan.company.city && plan.company.state) {
    parts.push(`${plan.company.city}, ${plan.company.state}`);
  }

  if (plan.planDetails.assetFormatted) {
    parts.push(`Assets: ${plan.planDetails.assetFormatted}`);
  }

  return parts.join(' • ');
}