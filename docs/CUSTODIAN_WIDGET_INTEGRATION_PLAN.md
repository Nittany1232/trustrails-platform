# Custodian Widget Integration Plan

## Overview
Each custodian in the TrustRails system will have the ability to enable and configure an embeddable widget for their platform. This widget allows their users to initiate rollovers directly from the custodian's website or application.

## Key Concept Change
- **NOT** a separate partner system
- **IS** a feature of existing custodians
- Each custodian can enable/disable widget functionality
- Widget configuration is part of custodian settings

## Database Schema Updates

### Extend Custodian Interface
```typescript
// lib/custodians.ts - Add to existing Custodian interface
export interface Custodian {
  // ... existing fields ...

  // Widget Configuration
  widgetEnabled?: boolean;
  widgetSettings?: {
    // API Configuration
    apiKey?: string;  // Hashed
    apiKeyPrefix?: string;  // First 8 chars for identification
    apiKeyCreatedAt?: Timestamp;
    apiKeyLastUsed?: Timestamp;

    // Widget Customization
    primaryColor?: string;
    logoUrl?: string;
    customCSS?: string;
    widgetTitle?: string;
    widgetDescription?: string;

    // Allowed Domains (CORS)
    allowedDomains?: string[];

    // Feature Toggles
    features?: {
      showCalculator?: boolean;
      showEducationContent?: boolean;
      requirePhoneNumber?: boolean;
      allowGuestMode?: boolean;
      enableLiveChat?: boolean;
    };

    // Rate Limiting
    rateLimit?: {
      requestsPerMinute?: number;
      requestsPerHour?: number;
      requestsPerDay?: number;
    };

    // Analytics
    analytics?: {
      totalEmbeds?: number;
      totalSessions?: number;
      totalCompletedRollovers?: number;
      lastActivityAt?: Timestamp;
    };
  };

  // Widget Status
  widgetStatus?: 'active' | 'inactive' | 'suspended' | 'testing';
  widgetActivatedAt?: Timestamp;
  widgetDeactivatedAt?: Timestamp;
}
```

### New Collections

#### Widget Sessions Collection
```typescript
// For tracking widget usage
interface WidgetSession {
  id: string;
  custodianId: string;
  sessionToken: string;
  domain: string;  // Where widget is embedded
  startedAt: Timestamp;
  endedAt?: Timestamp;
  userAgent: string;
  ipAddress: string;  // Hashed for privacy
  rolloverId?: string;  // If rollover was created
  events: Array<{
    type: string;
    timestamp: Timestamp;
    data?: any;
  }>;
}
```

#### Widget API Logs Collection
```typescript
interface WidgetAPILog {
  id: string;
  custodianId: string;
  apiKeyPrefix: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: Timestamp;
  errorMessage?: string;
}
```

## UI Implementation

### 1. Add Widget Tab to Custodian Management

**Location**: `/app/admin/custodians/manage/[custodianId]/page.tsx`

Add new tab to existing custodian detail view:
```typescript
<Tabs>
  <TabsList>
    <TabsTrigger value="profile">Profile</TabsTrigger>
    <TabsTrigger value="users">Users</TabsTrigger>
    <TabsTrigger value="documents">Documents</TabsTrigger>
    <TabsTrigger value="widget">Widget</TabsTrigger> {/* NEW */}
    <TabsTrigger value="analytics">Analytics</TabsTrigger>
  </TabsList>

  <TabsContent value="widget">
    <CustodianWidgetSettings custodian={custodian} />
  </TabsContent>
</Tabs>
```

### 2. Widget Settings Component

**File**: `/app/admin/custodians/components/CustodianWidgetSettings.tsx`

```typescript
export function CustodianWidgetSettings({ custodian }: { custodian: Custodian }) {
  return (
    <div className="space-y-6">
      {/* Enable/Disable Widget */}
      <Card>
        <CardHeader>
          <CardTitle>Widget Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Widget</Label>
              <p className="text-sm text-gray-500">
                Allow embedding TrustRails widget on your platform
              </p>
            </div>
            <Switch
              checked={custodian.widgetEnabled}
              onCheckedChange={handleToggleWidget}
            />
          </div>
        </CardContent>
      </Card>

      {custodian.widgetEnabled && (
        <>
          {/* API Key Management */}
          <Card>
            <CardHeader>
              <CardTitle>API Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <ApiKeyManager custodianId={custodian.id} />
            </CardContent>
          </Card>

          {/* Allowed Domains */}
          <Card>
            <CardHeader>
              <CardTitle>Allowed Domains</CardTitle>
            </CardHeader>
            <CardContent>
              <DomainWhitelist custodianId={custodian.id} />
            </CardContent>
          </Card>

          {/* Widget Customization */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent>
              <WidgetCustomizer custodian={custodian} />
            </CardContent>
          </Card>

          {/* Embed Code */}
          <Card>
            <CardHeader>
              <CardTitle>Integration Code</CardTitle>
            </CardHeader>
            <CardContent>
              <EmbedCodeGenerator custodian={custodian} />
            </CardContent>
          </Card>

          {/* Usage Analytics */}
          <Card>
            <CardHeader>
              <CardTitle>Widget Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <WidgetAnalytics custodianId={custodian.id} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
```

### 3. API Key Management Component

```typescript
function ApiKeyManager({ custodianId }: { custodianId: string }) {
  return (
    <div className="space-y-4">
      {/* Current API Key */}
      {apiKey ? (
        <div>
          <Label>Current API Key</Label>
          <div className="flex gap-2">
            <Input
              value={`${apiKey.prefix}...`}
              readOnly
              className="font-mono"
            />
            <Button onClick={handleRotateKey} variant="outline">
              Rotate Key
            </Button>
            <Button onClick={handleRevokeKey} variant="destructive">
              Revoke
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Created: {apiKey.createdAt} |
            Last used: {apiKey.lastUsed || 'Never'}
          </p>
        </div>
      ) : (
        <Button onClick={handleGenerateKey}>
          Generate API Key
        </Button>
      )}

      {/* Rate Limits */}
      <div>
        <Label>Rate Limits</Label>
        <Select value={rateLimit} onValueChange={setRateLimit}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">
              Standard (100 req/min)
            </SelectItem>
            <SelectItem value="enhanced">
              Enhanced (500 req/min)
            </SelectItem>
            <SelectItem value="premium">
              Premium (1000 req/min)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

### 4. Embed Code Generator

```typescript
function EmbedCodeGenerator({ custodian }: { custodian: Custodian }) {
  const embedCode = `
<!-- TrustRails Widget -->
<script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>
<trustrails-widget
  custodian-id="${custodian.id}"
  api-key="${custodian.widgetSettings?.apiKeyPrefix}..."
  primary-color="${custodian.widgetSettings?.primaryColor || '#3B82F6'}"
  environment="production">
</trustrails-widget>`;

  return (
    <div className="space-y-4">
      <div>
        <Label>Embed Code</Label>
        <Textarea
          value={embedCode}
          readOnly
          className="font-mono text-xs h-32"
        />
        <Button
          onClick={() => navigator.clipboard.writeText(embedCode)}
          className="mt-2"
        >
          Copy to Clipboard
        </Button>
      </div>

      <div>
        <Label>Test in Sandbox</Label>
        <Button
          onClick={handleOpenSandbox}
          variant="outline"
        >
          Open Sandbox Environment
        </Button>
      </div>
    </div>
  );
}
```

## API Implementation

### 1. Widget Authentication Endpoint
```typescript
// /app/api/widget/auth/route.ts
export async function POST(req: Request) {
  const { apiKey, custodianId } = await req.json();

  // Validate API key
  const custodian = await getCustodianById(custodianId);
  if (!custodian.widgetEnabled) {
    return NextResponse.json({ error: 'Widget not enabled' }, { status: 403 });
  }

  const isValid = await validateApiKey(apiKey, custodian.widgetSettings?.apiKey);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // Check rate limits
  const rateLimitOk = await checkRateLimit(custodianId);
  if (!rateLimitOk) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Generate session token
  const sessionToken = await generateSessionToken(custodianId);

  return NextResponse.json({
    sessionToken,
    config: custodian.widgetSettings
  });
}
```

### 2. Widget Configuration API
```typescript
// /app/api/admin/custodians/[custodianId]/widget/route.ts
export async function GET(req: Request, { params }: { params: { custodianId: string } }) {
  // Get widget settings
  const custodian = await getCustodianById(params.custodianId);
  return NextResponse.json(custodian.widgetSettings);
}

export async function PUT(req: Request, { params }: { params: { custodianId: string } }) {
  // Update widget settings
  const settings = await req.json();
  await updateCustodianWidgetSettings(params.custodianId, settings);
  return NextResponse.json({ success: true });
}
```

### 3. API Key Management
```typescript
// /app/api/admin/custodians/[custodianId]/widget/api-key/route.ts
export async function POST(req: Request, { params }: { params: { custodianId: string } }) {
  // Generate new API key
  const apiKey = generateApiKey();
  const hashedKey = await hashApiKey(apiKey);

  await updateCustodian(params.custodianId, {
    'widgetSettings.apiKey': hashedKey,
    'widgetSettings.apiKeyPrefix': apiKey.substring(0, 8),
    'widgetSettings.apiKeyCreatedAt': serverTimestamp(),
  });

  // Return full key only once
  return NextResponse.json({ apiKey });
}

export async function DELETE(req: Request, { params }: { params: { custodianId: string } }) {
  // Revoke API key
  await updateCustodian(params.custodianId, {
    'widgetSettings.apiKey': null,
    'widgetSettings.apiKeyPrefix': null,
  });

  return NextResponse.json({ success: true });
}
```

## Widget Package Updates

### Update Widget to Support Custodian Mode
```typescript
// packages/rollover-widget/src/trustrails-widget.ts
@customElement('trustrails-widget')
export class TrustRailsWidget extends LitElement {
  @property({ type: String, attribute: 'custodian-id' })
  custodianId?: string;

  @property({ type: String, attribute: 'api-key' })
  apiKey?: string;

  @property({ type: String, attribute: 'partner-id' })
  partnerId?: string;  // Legacy support

  async connectedCallback() {
    super.connectedCallback();

    if (this.custodianId && this.apiKey) {
      // Authenticate with custodian credentials
      await this.authenticateCustodian();
    } else if (this.partnerId) {
      // Legacy partner mode
      await this.authenticatePartner();
    }
  }

  private async authenticateCustodian() {
    const response = await fetch(`${this.apiUrl}/widget/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custodianId: this.custodianId,
        apiKey: this.apiKey,
      }),
    });

    if (response.ok) {
      const { sessionToken, config } = await response.json();
      this.sessionToken = sessionToken;
      this.applyConfiguration(config);
    }
  }
}
```

## Implementation Timeline

### Week 1: Database & API Foundation
- [ ] Extend Custodian interface with widget fields
- [ ] Create widget-related collections
- [ ] Build authentication API endpoints
- [ ] Implement API key generation/management

### Week 2: Admin UI Integration
- [ ] Add Widget tab to custodian management
- [ ] Build widget settings components
- [ ] Create API key management UI
- [ ] Implement domain whitelist management

### Week 3: Widget Package Updates
- [ ] Update widget to support custodian authentication
- [ ] Add custodian-specific configuration
- [ ] Implement session management
- [ ] Add analytics tracking

### Week 4: Testing & Documentation
- [ ] End-to-end testing
- [ ] Create integration documentation
- [ ] Build sandbox environment
- [ ] Deploy to staging

## Security Considerations

1. **API Key Security**
   - Store only hashed keys (bcrypt/argon2)
   - Show full key only once at generation
   - Implement key rotation
   - Add expiration dates

2. **Domain Validation**
   - Strict CORS enforcement
   - Domain whitelist validation
   - Referrer checking

3. **Rate Limiting**
   - Per-custodian rate limits
   - Sliding window algorithm
   - Graceful degradation

4. **Session Management**
   - JWT tokens for widget sessions
   - Short TTL (15 minutes)
   - Refresh token mechanism

## Success Metrics

- Widget enablement rate > 50% of active custodians
- API response time < 100ms
- Widget load time < 2 seconds
- Zero security incidents
- 99.9% uptime

## Migration Notes

- No breaking changes to existing custodian structure
- Widget is opt-in feature
- Backward compatible with any existing partner implementations
- Can coexist with future partner system if needed