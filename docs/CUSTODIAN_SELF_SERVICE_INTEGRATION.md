# Custodian Self-Service Widget & API Integration Architecture

## Overview
This document outlines the correct architecture where:
1. **Admin** simply enables widget/API access for custodians (toggle on/off)
2. **Custodian users** manage their own integration through their dashboard

## Architecture Flow

```
Admin Side (Simple)                    Custodian Side (Complex)
┌────────────────────┐                 ┌─────────────────────────┐
│ Admin Dashboard    │                 │ Custodian Dashboard     │
│                    │                 │                         │
│ Custodian Settings │ ─── Enables ──> │ /custodians/dashboard/  │
│ ☑ Widget Access   │                 │   └── /integrations     │
│ ☑ API Access      │                 │       ├── Widget        │
│                    │                 │       ├── API Keys      │
└────────────────────┘                 │       ├── Webhooks      │
                                      │       └── Docs          │
                                      └─────────────────────────┘
```

## 1. Admin Side - Simple Toggle

### Location: `/app/admin/custodians/manage/[custodianId]/page.tsx`

In the existing custodian management tabs, add simple toggles:

```typescript
// In Status or Settings tab
<Card>
  <CardHeader>
    <CardTitle>Integration Access</CardTitle>
    <CardDescription>
      Enable self-service integration features for this custodian
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <Label>Widget Embedding</Label>
        <p className="text-sm text-gray-500">
          Allow custodian to embed TrustRails widget
        </p>
      </div>
      <Switch
        checked={custodian.widgetEnabled}
        onCheckedChange={(checked) => handleToggleFeature('widget', checked)}
      />
    </div>

    <div className="flex items-center justify-between">
      <div>
        <Label>API Integration</Label>
        <p className="text-sm text-gray-500">
          Allow custodian to use API for system integration
        </p>
      </div>
      <Switch
        checked={custodian.apiEnabled}
        onCheckedChange={(checked) => handleToggleFeature('api', checked)}
      />
    </div>
  </CardContent>
</Card>
```

### Database Update for Custodian

```typescript
// lib/custodians.ts
export interface Custodian {
  // ... existing fields ...

  // Integration access (admin controls)
  widgetEnabled?: boolean;  // Admin toggle
  apiEnabled?: boolean;     // Admin toggle
  // Note: All configuration is stored separately, not here
}
```

## 2. Custodian Dashboard - Self-Service Portal

### New Section: Integration Management

**Location**: `/app/custodians/dashboard/[custodianId]/integrations/page.tsx`

### Navigation Structure

```
/custodians/dashboard/[custodianId]/
├── page.tsx                 (Overview - existing)
├── analytics/               (Analytics - existing)
├── audit-logs/             (Audit Logs - existing)
├── rollovers/              (Rollovers - existing)
├── tax-reporting/          (Tax Reporting - existing)
└── integrations/           (NEW - Integration Management)
    ├── page.tsx            (Integration overview)
    ├── widget/
    │   └── page.tsx       (Widget configuration)
    ├── api/
    │   └── page.tsx       (API management)
    ├── webhooks/
    │   └── page.tsx       (Webhook configuration)
    └── docs/
        └── page.tsx       (Documentation & SDKs)
```

### Main Integration Dashboard

```typescript
// app/custodians/dashboard/[custodianId]/integrations/page.tsx

export default function IntegrationsPage() {
  const [custodian, setCustodian] = useState<Custodian | null>(null);
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig | null>(null);

  // Check if features are enabled by admin
  const hasWidgetAccess = custodian?.widgetEnabled;
  const hasAPIAccess = custodian?.apiEnabled;

  if (!hasWidgetAccess && !hasAPIAccess) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Integration Access Not Enabled</AlertTitle>
        <AlertDescription>
          Please contact your TrustRails administrator to enable integration features.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Integration Management</h1>
        <Button asChild>
          <Link href="/custodians/dashboard/[custodianId]/integrations/docs">
            <Book className="mr-2 h-4 w-4" />
            Documentation
          </Link>
        </Button>
      </div>

      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {hasWidgetAccess && (
          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => router.push('./integrations/widget')}>
            <CardHeader>
              <Code2 className="h-8 w-8 mb-2 text-blue-500" />
              <CardTitle>Widget</CardTitle>
              <CardDescription>
                Configure embeddable widget
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={integrationConfig?.widget?.isActive ? 'success' : 'secondary'}>
                {integrationConfig?.widget?.isActive ? 'Active' : 'Not Configured'}
              </Badge>
            </CardContent>
          </Card>
        )}

        {hasAPIAccess && (
          <>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push('./integrations/api')}>
              <CardHeader>
                <Key className="h-8 w-8 mb-2 text-green-500" />
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Manage API credentials
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge>{integrationConfig?.apiKeys?.length || 0} Active</Badge>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push('./integrations/webhooks')}>
              <CardHeader>
                <Webhook className="h-8 w-8 mb-2 text-purple-500" />
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>
                  Event subscriptions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge>{integrationConfig?.webhooks?.length || 0} Configured</Badge>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push('./integrations/docs')}>
              <CardHeader>
                <Book className="h-8 w-8 mb-2 text-orange-500" />
                <CardTitle>Documentation</CardTitle>
                <CardDescription>
                  API docs & SDKs
                </CardDescription>
              </CardHeader>
            </Card>
          </>
        )}
      </div>

      {/* Integration Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">API Calls (24h)</p>
                <p className="text-2xl font-bold">{integrationConfig?.stats?.apiCalls24h || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Widget Sessions</p>
                <p className="text-2xl font-bold">{integrationConfig?.stats?.widgetSessions || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Success Rate</p>
                <p className="text-2xl font-bold">{integrationConfig?.stats?.successRate || 100}%</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Webhooks</p>
                <p className="text-2xl font-bold">{integrationConfig?.stats?.activeWebhooks || 0}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Widget Configuration Page

```typescript
// app/custodians/dashboard/[custodianId]/integrations/widget/page.tsx

export default function WidgetConfigurationPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Widget Configuration</h1>
      </div>

      <Tabs defaultValue="setup">
        <TabsList>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          {/* API key for widget, embed code generation */}
        </TabsContent>

        <TabsContent value="appearance">
          {/* Color customization, branding */}
        </TabsContent>

        <TabsContent value="domains">
          {/* Allowed domains management */}
        </TabsContent>

        <TabsContent value="testing">
          {/* Sandbox environment, test widget */}
        </TabsContent>

        <TabsContent value="analytics">
          {/* Widget usage stats */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### API Management Page

```typescript
// app/custodians/dashboard/[custodianId]/integrations/api/page.tsx

export default function APIManagementPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="oauth">OAuth Setup</TabsTrigger>
          <TabsTrigger value="explorer">API Explorer</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="keys">
          {/* API key generation, management */}
        </TabsContent>

        <TabsContent value="oauth">
          {/* OAuth 2.0 configuration */}
        </TabsContent>

        <TabsContent value="explorer">
          {/* Interactive API testing */}
        </TabsContent>

        <TabsContent value="monitoring">
          {/* Usage metrics, error logs */}
        </TabsContent>

        <TabsContent value="security">
          {/* IP whitelisting, rate limits */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

## 3. Database Schema

### New Collections

```typescript
// Integration configurations (separate from custodian)
interface IntegrationConfig {
  id: string;
  custodianId: string;

  // Widget configuration
  widget?: {
    isActive: boolean;
    apiKey?: string;  // Hashed
    apiKeyPrefix?: string;
    primaryColor?: string;
    logoUrl?: string;
    allowedDomains?: string[];
    customCSS?: string;
    features?: {
      showCalculator?: boolean;
      requirePhone?: boolean;
      // etc.
    };
  };

  // API configuration
  api?: {
    isActive: boolean;
    clientId?: string;
    clientSecret?: string;  // Hashed
    scopes?: string[];
    rateLimit?: {
      perMinute: number;
      perHour: number;
      perDay: number;
    };
    ipWhitelist?: string[];
    certificates?: {
      mtls?: string;
    };
  };

  // Statistics
  stats?: {
    apiCalls24h: number;
    widgetSessions: number;
    successRate: number;
    activeWebhooks: number;
    lastActivity?: Date;
  };

  createdAt: Date;
  updatedAt: Date;
}

// API Keys (separate collection)
interface APIKey {
  id: string;
  custodianId: string;
  name: string;
  key: string;  // Hashed
  prefix: string;  // First 8 chars
  scopes: string[];
  status: 'active' | 'revoked' | 'expired';
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

// Webhooks (separate collection)
interface Webhook {
  id: string;
  custodianId: string;
  url: string;
  secret: string;  // For HMAC signing
  events: string[];
  status: 'active' | 'inactive' | 'failed';
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
  };
  lastDeliveryAt?: Date;
  failureCount: number;
}
```

## 4. API Endpoints

### Admin Endpoints (Simple)
```
PUT /api/admin/custodians/[id]/features
  - Enable/disable widget and API access
```

### Custodian Self-Service Endpoints
```
# Configuration Management
GET    /api/custodian/integration/config
PUT    /api/custodian/integration/config

# Widget Management
POST   /api/custodian/integration/widget/api-key
DELETE /api/custodian/integration/widget/api-key
PUT    /api/custodian/integration/widget/settings
PUT    /api/custodian/integration/widget/domains

# API Key Management
GET    /api/custodian/integration/api-keys
POST   /api/custodian/integration/api-keys
DELETE /api/custodian/integration/api-keys/[keyId]
POST   /api/custodian/integration/api-keys/[keyId]/rotate

# OAuth Configuration
GET    /api/custodian/integration/oauth/config
PUT    /api/custodian/integration/oauth/config
POST   /api/custodian/integration/oauth/regenerate-secret

# Webhook Management
GET    /api/custodian/integration/webhooks
POST   /api/custodian/integration/webhooks
PUT    /api/custodian/integration/webhooks/[id]
DELETE /api/custodian/integration/webhooks/[id]
POST   /api/custodian/integration/webhooks/[id]/test

# Monitoring
GET    /api/custodian/integration/stats
GET    /api/custodian/integration/logs
GET    /api/custodian/integration/rate-limits
```

## 5. Navigation Updates

### Add Integration Link to Custodian Dashboard Navigation

```typescript
// In custodian dashboard layout or navigation component

const navigationItems = [
  { href: `/custodians/dashboard/${custodianId}`, label: 'Overview', icon: Home },
  { href: `/custodians/dashboard/${custodianId}/analytics`, label: 'Analytics', icon: BarChart },
  { href: `/custodians/dashboard/${custodianId}/rollovers`, label: 'Rollovers', icon: ArrowRightLeft },
  { href: `/custodians/dashboard/${custodianId}/integrations`, label: 'Integrations', icon: Plug }, // NEW
  { href: `/custodians/dashboard/${custodianId}/audit-logs`, label: 'Audit Logs', icon: FileText },
  { href: `/custodians/dashboard/${custodianId}/tax-reporting`, label: 'Tax Reporting', icon: Receipt },
];
```

### Conditional Display Based on Access

```typescript
// Only show integrations if admin has enabled it
{(custodian?.widgetEnabled || custodian?.apiEnabled) && (
  <Link href={`/custodians/dashboard/${custodianId}/integrations`}>
    <Plug className="mr-2 h-4 w-4" />
    Integrations
  </Link>
)}
```

## 6. Security & Permissions

### Access Control Levels

1. **Admin Level**
   - Can enable/disable widget and API features for any custodian
   - Cannot access custodian's API keys or configuration

2. **Custodian Admin Level**
   - Full access to integration configuration
   - Can generate/revoke API keys
   - Can configure webhooks
   - Can manage team permissions

3. **Custodian Developer Level**
   - Can view integration configuration
   - Can use API explorer
   - Can view logs and monitoring
   - Cannot generate/revoke keys

4. **Custodian Viewer Level**
   - Read-only access to integration status
   - Can view documentation
   - Cannot make configuration changes

## 7. Implementation Timeline

### Phase 1: Admin Controls (Week 1)
- [ ] Add feature toggles to custodian model
- [ ] Create admin UI toggles in custodian management
- [ ] Implement permission checks

### Phase 2: Custodian Dashboard Structure (Week 2)
- [ ] Create integrations section in custodian dashboard
- [ ] Set up navigation and routing
- [ ] Build overview dashboard

### Phase 3: Widget Configuration (Week 3)
- [ ] Widget settings management
- [ ] Embed code generation
- [ ] Domain whitelisting
- [ ] Appearance customization

### Phase 4: API Management (Week 4)
- [ ] API key generation and management
- [ ] OAuth configuration
- [ ] API explorer
- [ ] Rate limiting setup

### Phase 5: Advanced Features (Week 5)
- [ ] Webhook management
- [ ] Monitoring and analytics
- [ ] Documentation portal
- [ ] SDK downloads

## 8. Key Benefits of This Architecture

1. **Separation of Concerns**
   - Admin focuses on business decisions (enable/disable)
   - Custodians manage their own technical implementation

2. **Self-Service**
   - Reduces admin support burden
   - Custodians can iterate quickly

3. **Security**
   - Custodians can only access their own configuration
   - API keys are isolated per custodian

4. **Scalability**
   - Each custodian manages their own integration
   - No bottleneck on admin team

5. **Audit Trail**
   - All configuration changes are logged
   - Clear accountability for actions

## 9. Migration from Current State

Since this is a new feature:

1. **No existing integrations to migrate**
2. **Start with pilot custodians**
3. **Gradual rollout to all custodians**
4. **Documentation and training for custodian users**

## Summary

The correct architecture is:
- **Admin**: Simple on/off toggles in custodian management
- **Custodian Users**: Full self-service portal at `/custodians/dashboard/[id]/integrations`
- **Clear separation**: Admin enables, custodian configures