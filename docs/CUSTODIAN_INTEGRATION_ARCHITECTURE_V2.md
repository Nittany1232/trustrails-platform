# Custodian Integration Architecture v2.0
*Incorporating Security, Scalability, UX Improvements, and Existing Audit System*

## Executive Summary

This document presents the revised custodian integration architecture, addressing critical security vulnerabilities, database scalability issues, and developer experience problems identified in the initial design review. It leverages the existing TrustRails audit system for SOC 2 compliance.

## Key Changes from v1

1. **Security**: Multi-tier authentication with KMS encryption and tenant isolation
2. **Database**: Hybrid approach using Cloud SQL + Redis instead of Firestore-only
3. **UX**: Simplified onboarding with SDK and progressive disclosure
4. **Monitoring**: Reuses existing unified audit logger from TrustRails
5. **Compliance**: Leverages existing SOC 2 compliant audit infrastructure

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin Layer (Simple)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Custodian Management: Enable Integration Access     │   │
│  │  ☑ Widget Access | ☑ API Access (dual toggles)      │   │
│  │  View approval queue and audit logs                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Custodian Self-Service Portal                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  /custodians/dashboard/[id]/integrations             │   │
│  │                                                      │   │
│  │  1. Onboarding Wizard (first time)                  │   │
│  │  2. Integration Dashboard (returning users)          │   │
│  │  3. Developer Tools & Documentation                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 1. Admin Controls

### 1.1 Dual Toggle System

The admin interface provides granular control over integration features:

```typescript
interface IntegrationControls {
  // Widget Integration - Customer-facing embed
  widgetEnabled: boolean;
  widgetEnabledAt?: Timestamp;
  widgetEnabledBy?: string; // Admin UID

  // API Integration - Programmatic access
  apiEnabled: boolean;
  apiEnabledAt?: Timestamp;
  apiEnabledBy?: string; // Admin UID
}
```

**Benefits of Dual Toggles:**
- **Gradual Rollout**: Enable widget first for testing before API access
- **Risk Management**: Disable API if suspicious activity detected while keeping widget active
- **Compliance**: Different audit requirements for widget vs API access
- **Billing**: Separate pricing tiers for widget-only vs full API access

### 1.2 Toggle Behavior

| Widget | API | Dashboard Access | Features Available |
|--------|-----|-----------------|-------------------|
| ✅ | ❌ | Yes | Widget configuration only |
| ❌ | ✅ | Yes | API keys, webhooks only |
| ✅ | ✅ | Yes | Full integration suite |
| ❌ | ❌ | No | No integration features |

## 2. Security Architecture

### 1.1 Multi-Tier Authentication

```typescript
// Tier-based authentication configuration
interface AuthenticationTier {
  tier: 'tier1_financial' | 'tier2_hr';

  // Tier 1: Financial Institutions (mTLS + OAuth 2.0)
  tier1Config?: {
    clientId: string;
    certificateThumbprint: string;
    tokenEndpoint: string;
    scopes: string[];
    tokenTTL: 900; // 15 minutes
    requireMTLS: true;
  };

  // Tier 2: HR Platforms (API Keys with HMAC)
  tier2Config?: {
    apiKeyId: string;
    encryptedSecret: string; // KMS encrypted
    hmacAlgorithm: 'HS256';
    tokenTTL: 86400; // 24 hours
  };
}
```

### 1.2 Credential Management

```typescript
// All credentials encrypted with Google Cloud KMS
export class SecureCredentialManager {
  private kms: GoogleCloudKMS;
  private auditLogger: UnifiedAuditLogger; // Use existing audit system

  async storeCredential(
    custodianId: string,
    credential: SensitiveCredential,
    classification: 'restricted' | 'confidential'
  ): Promise<EncryptedCredential> {
    // 1. Encrypt with KMS
    const encrypted = await this.kms.encrypt(
      credential,
      `projects/${PROJECT_ID}/locations/global/keyRings/custodian-keys/cryptoKeys/${custodianId}`
    );

    // 2. Use existing audit logger
    await this.auditLogger.logEvent({
      eventType: 'INTEGRATION_CREDENTIAL_STORED',
      category: AuditEventCategory.SECURITY,
      severity: AuditSeverity.INFO,
      custodianId,
      resourceType: 'credential',
      resourceId: credential.id,
      dataClassification: classification,
      metadata: {
        credentialType: credential.type,
        expiresIn: '90 days'
      }
    });

    // 3. Store with automatic expiration
    return {
      id: generateSecureId(),
      custodianId,
      encryptedData: encrypted,
      classification,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      rotateAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)   // 30 days
    };
  }
}
```

### 1.3 Tenant Isolation

```typescript
// Row-level security implementation
export function createTenantIsolationPolicy() {
  return `
    CREATE POLICY tenant_isolation ON integration_configs
    FOR ALL
    USING (custodian_id = current_setting('app.current_custodian_id')::uuid)
    WITH CHECK (custodian_id = current_setting('app.current_custodian_id')::uuid);
  `;
}

// Middleware for API requests
export function tenantIsolationMiddleware(req: Request, res: Response, next: NextFunction) {
  const custodianId = req.user.custodianId;

  // Set tenant boundary for this request
  req.tenantContext = {
    custodianId,
    boundary: `custodian_${custodianId}`,
    dataScope: { custodianId }
  };

  // Set database session variable for RLS
  req.db.query(`SET app.current_custodian_id = $1`, [custodianId]);

  next();
}
```

## 2. Database Architecture

### 2.1 Hybrid Database Strategy

```yaml
# Database Selection by Use Case
Cloud SQL (PostgreSQL):
  - Custodian configurations
  - API keys and credentials
  - Webhook configurations
  - Audit logs (backup)

Redis:
  - API key validation cache (5 min TTL)
  - Rate limiting counters
  - Session tokens
  - Configuration cache

BigQuery:
  - API usage analytics
  - Performance metrics
  - Historical data
  - Aggregated statistics

Cloud Storage:
  - Large CSS files
  - Logo images
  - Documentation
  - SDK downloads

Google Cloud Logging:
  - Primary audit log storage (existing system)
  - SOC 2 compliance events
  - Security events
  - Integration events
```

### 2.2 Optimized Schema Design

```sql
-- PostgreSQL schema with proper indexes
CREATE TABLE custodian_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custodian_id UUID NOT NULL REFERENCES custodians(id),
  integration_enabled BOOLEAN DEFAULT false,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('tier1_financial', 'tier2_hr')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- Tenant isolation
  tenant_boundary VARCHAR(255) GENERATED ALWAYS AS ('custodian_' || custodian_id::text) STORED,

  CONSTRAINT unique_custodian_integration UNIQUE(custodian_id)
);

CREATE INDEX idx_custodian_integrations_custodian ON custodian_integrations(custodian_id);
CREATE INDEX idx_custodian_integrations_tenant ON custodian_integrations(tenant_boundary);

-- Separate table for widget configuration
CREATE TABLE widget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custodian_id UUID NOT NULL REFERENCES custodians(id),
  is_active BOOLEAN DEFAULT false,
  primary_color VARCHAR(7),
  logo_url TEXT,
  custom_css_url TEXT, -- Stored in Cloud Storage

  CONSTRAINT unique_custodian_widget UNIQUE(custodian_id)
);

-- API keys with proper security
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custodian_id UUID NOT NULL,
  key_hash VARCHAR(256) NOT NULL, -- SHA-256 hash
  key_prefix VARCHAR(8) NOT NULL,  -- For identification
  name VARCHAR(255) NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['read'],
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT check_status CHECK (status IN ('active', 'revoked', 'expired'))
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_custodian_status ON api_keys(custodian_id, status);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at) WHERE status = 'active';
```

### 2.3 Caching Strategy

```typescript
export class IntegrationDataService {
  constructor(
    private db: PostgresClient,
    private cache: RedisClient,
    private metrics: MetricsCollector
  ) {}

  async getIntegrationConfig(custodianId: string): Promise<IntegrationConfig> {
    const cacheKey = `integration:${custodianId}`;

    // L1 Cache: Redis (5 minute TTL)
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.metrics.increment('cache.hit.redis');
      return JSON.parse(cached);
    }

    // L2: Database with connection pooling
    const config = await this.db.query(
      `SELECT * FROM custodian_integrations
       WHERE custodian_id = $1`,
      [custodianId]
    );

    // Cache for next requests
    await this.cache.setex(cacheKey, 300, JSON.stringify(config));
    this.metrics.increment('cache.miss.redis');

    return config;
  }

  async invalidateCache(custodianId: string): Promise<void> {
    const keys = [
      `integration:${custodianId}`,
      `widget:${custodianId}`,
      `apikeys:${custodianId}`
    ];
    await this.cache.del(...keys);
  }
}
```

## 3. Improved Developer Experience

### 3.1 Simplified Onboarding Flow

```typescript
// Progressive disclosure onboarding wizard
export const OnboardingWizard: React.FC = () => {
  const [step, setStep] = useState<OnboardingStep>('choose_integration');
  const auditLogger = useAuditLogger(); // Hook to access existing audit system

  const steps: OnboardingStep[] = [
    'choose_integration',  // Widget, API, or Both
    'setup_auth',         // Configure authentication
    'test_connection',    // Verify setup works
    'go_live'            // Activate production
  ];

  const handleStepComplete = async (stepName: string, data: any) => {
    // Log onboarding progress using existing audit system
    await auditLogger.logEvent({
      eventType: 'INTEGRATION_ONBOARDING_STEP',
      category: AuditEventCategory.ADMINISTRATIVE,
      severity: AuditSeverity.INFO,
      action: `onboarding_${stepName}_completed`,
      metadata: {
        step: stepName,
        configuration: data
      }
    });
  };

  return (
    <WizardContainer>
      {step === 'choose_integration' && (
        <IntegrationTypeSelector
          onSelect={(type) => {
            handleStepComplete('choose_integration', { type });
            // Customize flow based on selection
            if (type === 'widget_only') {
              setStep('test_connection');
            } else {
              setStep('setup_auth');
            }
          }}
        />
      )}

      {step === 'setup_auth' && (
        <AuthenticationSetup
          tier={custodian.tier}
          onComplete={(auth) => {
            handleStepComplete('setup_auth', { authType: auth.type });
            testAuthentication(auth);
            setStep('test_connection');
          }}
        />
      )}
    </WizardContainer>
  );
};
```

### 3.2 Developer-Friendly SDK

```typescript
import { UnifiedAuditLogger } from '@/lib/audit/unified-audit-logger';

// Simplified SDK hiding complexity
export class TrustRailsIntegration {
  private config: IntegrationConfig;
  private auth: AuthenticationManager;
  private auditLogger: UnifiedAuditLogger;

  constructor(options: { custodianId: string, environment?: 'sandbox' | 'production' }) {
    this.config = this.loadConfig(options);
    this.auth = new AuthenticationManager(this.config);
    this.auditLogger = new UnifiedAuditLogger();
  }

  // Simple widget initialization
  async initWidget(containerId: string, options?: WidgetOptions): Promise<Widget> {
    try {
      // Log widget initialization attempt
      await this.auditLogger.logEvent({
        eventType: 'INTEGRATION_WIDGET_INIT',
        category: AuditEventCategory.SYSTEM,
        severity: AuditSeverity.INFO,
        custodianId: this.config.custodianId,
        metadata: { containerId, options }
      });

      // Handle all authentication automatically
      const token = await this.auth.getToken();

      // Create and mount widget
      const widget = new TrustRailsWidget({
        ...this.config.widget,
        ...options,
        token
      });

      widget.mount(containerId);

      // Auto-refresh token before expiry
      this.auth.onTokenExpiring(() => widget.refreshAuth());

      return widget;
    } catch (error) {
      // Log initialization failure
      await this.auditLogger.logEvent({
        eventType: 'INTEGRATION_WIDGET_INIT_FAILED',
        category: AuditEventCategory.SYSTEM,
        severity: AuditSeverity.ERROR,
        custodianId: this.config.custodianId,
        errorCode: error.code,
        errorMessage: error.message
      });

      // Developer-friendly error messages
      throw new IntegrationError(
        `Failed to initialize widget: ${error.message}`,
        error.code,
        this.getSolutionForError(error)
      );
    }
  }
}
```

## 4. Leveraging Existing Audit System

### 4.1 Integration-Specific Audit Events

```typescript
// Extend existing SOC2_EVENT_TYPES for integration events
export const INTEGRATION_EVENT_TYPES = {
  // Integration Management
  INTEGRATION_ENABLED: 'integration.enabled',
  INTEGRATION_DISABLED: 'integration.disabled',
  INTEGRATION_CONFIG_CHANGED: 'integration.config.changed',

  // API Key Management
  INTEGRATION_API_KEY_CREATED: 'integration.api_key.created',
  INTEGRATION_API_KEY_ROTATED: 'integration.api_key.rotated',
  INTEGRATION_API_KEY_REVOKED: 'integration.api_key.revoked',
  INTEGRATION_API_KEY_USED: 'integration.api_key.used',

  // Widget Configuration
  INTEGRATION_WIDGET_CONFIGURED: 'integration.widget.configured',
  INTEGRATION_WIDGET_DOMAIN_ADDED: 'integration.widget.domain.added',
  INTEGRATION_WIDGET_DOMAIN_REMOVED: 'integration.widget.domain.removed',

  // Webhook Management
  INTEGRATION_WEBHOOK_CREATED: 'integration.webhook.created',
  INTEGRATION_WEBHOOK_UPDATED: 'integration.webhook.updated',
  INTEGRATION_WEBHOOK_DELETED: 'integration.webhook.deleted',
  INTEGRATION_WEBHOOK_DELIVERED: 'integration.webhook.delivered',
  INTEGRATION_WEBHOOK_FAILED: 'integration.webhook.failed',

  // Security Events
  INTEGRATION_AUTH_SUCCESS: 'integration.auth.success',
  INTEGRATION_AUTH_FAILED: 'integration.auth.failed',
  INTEGRATION_RATE_LIMIT_EXCEEDED: 'integration.rate_limit.exceeded',
  INTEGRATION_SUSPICIOUS_ACTIVITY: 'integration.suspicious.activity'
};
```

### 4.2 Using Existing Unified Audit Logger

```typescript
import { UnifiedAuditLogger, AuditEventCategory, AuditSeverity } from '@/lib/audit/unified-audit-logger';

export class IntegrationService {
  private auditLogger: UnifiedAuditLogger;

  constructor() {
    this.auditLogger = new UnifiedAuditLogger();
  }

  async enableIntegration(custodianId: string, userId: string): Promise<void> {
    try {
      // Enable integration logic
      await this.db.update('custodian_integrations', {
        custodianId,
        integrationEnabled: true
      });

      // Log using existing audit system
      await this.auditLogger.logEvent({
        eventType: INTEGRATION_EVENT_TYPES.INTEGRATION_ENABLED,
        category: AuditEventCategory.ADMINISTRATIVE,
        severity: AuditSeverity.INFO,
        userId,
        custodianId,
        resourceType: 'integration',
        resourceId: custodianId,
        action: 'enable',
        status: 'success',
        metadata: {
          enabledBy: userId,
          enabledAt: new Date().toISOString()
        }
      });
    } catch (error) {
      // Log failure
      await this.auditLogger.logEvent({
        eventType: INTEGRATION_EVENT_TYPES.INTEGRATION_ENABLED,
        category: AuditEventCategory.ADMINISTRATIVE,
        severity: AuditSeverity.ERROR,
        userId,
        custodianId,
        status: 'failure',
        errorCode: error.code,
        errorMessage: error.message
      });
      throw error;
    }
  }

  async generateAPIKey(custodianId: string, keyName: string, userId: string): Promise<APIKey> {
    const apiKey = await this.createAPIKey(custodianId, keyName);

    // Log API key generation with existing audit system
    await this.auditLogger.logEvent({
      eventType: INTEGRATION_EVENT_TYPES.INTEGRATION_API_KEY_CREATED,
      category: AuditEventCategory.SECURITY,
      severity: AuditSeverity.WARNING, // Higher severity for security operations
      userId,
      custodianId,
      resourceType: 'api_key',
      resourceId: apiKey.id,
      action: 'create',
      status: 'success',
      dataClassification: 'restricted',
      metadata: {
        keyName,
        keyPrefix: apiKey.prefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt
      }
    });

    return apiKey;
  }

  async trackAPIUsage(apiKeyId: string, endpoint: string, statusCode: number): Promise<void> {
    // For high-volume events, batch and send to BigQuery
    // Only log failures and suspicious activity to audit log
    if (statusCode >= 400) {
      await this.auditLogger.logEvent({
        eventType: INTEGRATION_EVENT_TYPES.INTEGRATION_AUTH_FAILED,
        category: AuditEventCategory.SECURITY,
        severity: statusCode >= 500 ? AuditSeverity.ERROR : AuditSeverity.WARNING,
        resourceType: 'api_key',
        resourceId: apiKeyId,
        action: 'api_call',
        status: 'failure',
        metadata: {
          endpoint,
          statusCode,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
}
```

### 4.3 Integration with Existing Audit UI

```typescript
// The existing admin audit log viewer will automatically show integration events
// Location: /app/api/admin/audit-logs/unified/route.ts

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Existing filters work for integration events
  const category = searchParams.get('category');
  const severity = searchParams.get('severity');
  const custodianId = searchParams.get('custodianId');

  // Query will automatically include integration events
  // since they use the same unified audit logger
  const events = await auditLogger.queryEvents({
    category: category || undefined,
    severity: severity || undefined,
    custodianId: custodianId || undefined,
    // Integration events will be included when filtering by category
    eventTypes: category === 'integration' ? Object.values(INTEGRATION_EVENT_TYPES) : undefined
  });

  return NextResponse.json(events);
}
```

### 4.4 Compliance Reporting

```typescript
// Leverage existing SOC 2 compliance reporting
export class IntegrationComplianceReporter {
  private auditLogger: UnifiedAuditLogger;

  async generateComplianceReport(custodianId: string, period: DateRange): Promise<ComplianceReport> {
    // Query existing audit logs for integration events
    const events = await this.auditLogger.queryEvents({
      custodianId,
      startDate: period.start,
      endDate: period.end,
      categories: [
        AuditEventCategory.SECURITY,
        AuditEventCategory.ADMINISTRATIVE,
        AuditEventCategory.DATA_ACCESS
      ]
    });

    // Generate report including integration-specific metrics
    return {
      custodianId,
      period,
      integrationMetrics: {
        apiKeyRotations: events.filter(e => e.eventType === INTEGRATION_EVENT_TYPES.INTEGRATION_API_KEY_ROTATED).length,
        authFailures: events.filter(e => e.eventType === INTEGRATION_EVENT_TYPES.INTEGRATION_AUTH_FAILED).length,
        configChanges: events.filter(e => e.eventType === INTEGRATION_EVENT_TYPES.INTEGRATION_CONFIG_CHANGED).length,
        suspiciousActivities: events.filter(e => e.severity === AuditSeverity.WARNING || e.severity === AuditSeverity.CRITICAL).length
      },
      complianceStatus: this.evaluateCompliance(events),
      recommendations: this.generateRecommendations(events)
    };
  }
}
```

## 5. Implementation Roadmap

### Phase 1: Security Foundation (Weeks 1-2)
- [ ] Implement KMS encryption for credentials
- [ ] Set up tenant isolation with RLS
- [ ] Integrate with existing unified audit logger
- [ ] Extend audit event types for integration events
- [ ] Build multi-tier authentication

### Phase 2: Database Migration (Weeks 3-4)
- [ ] Set up Cloud SQL with proper schema
- [ ] Implement Redis caching layer
- [ ] Create data migration scripts
- [ ] Set up BigQuery for analytics (separate from audit logs)

### Phase 3: Core Integration Features (Weeks 5-6)
- [ ] Build onboarding wizard with audit logging
- [ ] Create basic SDK with audit integration
- [ ] Implement widget configuration
- [ ] Set up API key management with full audit trail

### Phase 4: Developer Experience (Weeks 7-8)
- [ ] Create interactive API explorer
- [ ] Build testing tools
- [ ] Write comprehensive documentation
- [ ] Implement monitoring dashboard using existing audit data

### Phase 5: Production Hardening (Weeks 9-10)
- [ ] Performance testing and optimization
- [ ] Security audit and penetration testing
- [ ] Disaster recovery setup
- [ ] Load testing at scale
- [ ] Verify SOC 2 compliance with new events

## 6. Success Metrics

### Security Metrics
- Zero security breaches
- 100% credential encryption
- < 1% unauthorized access attempts
- Full audit trail coverage (using existing system)

### Performance Metrics
- API response time < 100ms (p95)
- Dashboard load time < 2 seconds
- 99.9% uptime SLA
- Support 10,000+ API calls/second

### Developer Experience Metrics
- Time to first successful integration < 30 minutes
- Support ticket reduction > 50%
- Developer satisfaction score > 8/10
- SDK adoption rate > 80%

### Compliance Metrics (Using Existing Audit System)
- 100% of integration events logged
- Audit log retention meets SOC 2 requirements
- Zero compliance violations in quarterly audits
- Complete traceability of all configuration changes

## 7. Risk Mitigation

### Technical Risks
- **Database migration failure**: Maintain parallel systems during transition
- **Performance degradation**: Implement gradual rollout with monitoring
- **Security vulnerabilities**: Regular security audits and penetration testing
- **Audit system overload**: Use batching for high-volume events

### Business Risks
- **Custodian adoption**: Provide migration assistance and training
- **Support burden**: Create comprehensive self-service documentation
- **Compliance issues**: Leverage existing audit system for full coverage

## Conclusion

This revised architecture addresses the critical security, scalability, and usability issues while leveraging the existing TrustRails unified audit logging system for SOC 2 compliance. By reusing the proven audit infrastructure, we ensure consistent compliance reporting and reduce implementation complexity while adding comprehensive integration management capabilities.