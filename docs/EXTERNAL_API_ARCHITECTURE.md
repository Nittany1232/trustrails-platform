# TrustRails External API Architecture & Developer Documentation

## Executive Summary

TrustRails already has a **production-ready webhook system** with HMAC signing, retry logic, and comprehensive event tracking. This document outlines how to extend this into a complete external API platform for custodian integrations.

## Current Infrastructure (Already Built) ✅

### Webhook System
- **Complete webhook registration**: `/api/events/webhook-register`
- **HMAC-SHA256 signature verification**
- **Exponential backoff retry logic**
- **Event filtering by type**
- **Background processing via Cloud Functions**
- **Rate limiting**: In-memory with Redis capability
- **49+ event types** covering entire business lifecycle

### Event Tracking
- **Complete user attribution**: userId, email, role, custodianId, IP, session
- **Immutable event store** with cryptographic hashing
- **SOC 2 compliant audit logging**
- **Event-driven architecture** for all business logic

### Document Management
- **Secure upload API**: `/api/rollover-documents/upload`
- **Firebase Storage** with custodian isolation
- **Signed URLs** with 1-hour expiration
- **Security metadata** and access controls

## Phase 1: Google Cloud API Gateway Integration

### 1.1 Architecture Overview

```
External Client → Google API Gateway → Cloud Armor → Next.js API → Firebase
                         ↓
                   Rate Limiting
                   Authentication
                   Transformation
```

### 1.2 API Gateway Configuration

```yaml
# api-gateway.yaml
swagger: "2.0"
info:
  title: TrustRails External API
  version: v1
host: api.trustrails.com
basePath: /v1

paths:
  /rollovers:
    post:
      summary: Create rollover transfer
      x-google-backend:
        address: https://trustrails.vercel.app/api/rollover
        jwt_audience: trustrails-api
      security:
        - ApiKeyAuth: []
        - OAuth2: [write:rollovers]
      
  /webhooks:
    post:
      summary: Register webhook endpoint
      x-google-backend:
        address: https://trustrails.vercel.app/api/events/webhook-register
      security:
        - ApiKeyAuth: []
        
  /documents/upload:
    post:
      summary: Upload document with watermarking
      x-google-backend:
        address: https://trustrails.vercel.app/api/rollover-documents/upload
      security:
        - ApiKeyAuth: []
        - OAuth2: [write:documents]
```

### 1.3 Authentication Flow

```typescript
// Extend existing authentication for API clients
// /lib/auth/api-authentication.ts

export async function authenticateAPIRequest(req: NextRequest): Promise<APIClient | null> {
  // Check for API Key
  const apiKey = req.headers.get('X-API-Key');
  if (apiKey) {
    return await validateAPIKey(apiKey);
  }
  
  // Check for OAuth Bearer token
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return await validateOAuthToken(token);
  }
  
  return null;
}
```

## Phase 2: Document Management API Extensions

### 2.1 Document Watermarking

```typescript
// /lib/document-processor.ts
export class DocumentProcessor {
  async addWatermark(file: File, metadata: WatermarkMetadata): Promise<Buffer> {
    const pdf = await PDFDocument.load(await file.arrayBuffer());
    
    // Add watermark to each page
    const pages = pdf.getPages();
    for (const page of pages) {
      // Add approval metadata
      page.drawText(`APPROVED BY: ${metadata.uploadedBy}`, {
        x: 50,
        y: 50,
        size: 10,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.5
      });
      
      page.drawText(`DATE: ${metadata.uploadedAt}`, {
        x: 50,
        y: 35,
        size: 10,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.5
      });
      
      page.drawText(`CUSTODIAN: ${metadata.custodian}`, {
        x: 50,
        y: 20,
        size: 10,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.5
      });
    }
    
    return Buffer.from(await pdf.save());
  }
}
```

### 2.2 E-Signature Integration

```typescript
// /app/api/v1/documents/esignature/route.ts
export async function POST(req: NextRequest) {
  const { documentId, signers, returnUrl } = await req.json();
  
  // Create DocuSign envelope
  const envelope = {
    emailSubject: 'Please sign this document',
    documents: [{
      documentBase64: await getDocumentBase64(documentId),
      name: 'Document.pdf',
      fileExtension: 'pdf',
      documentId: '1'
    }],
    recipients: {
      signers: signers.map((signer, index) => ({
        email: signer.email,
        name: signer.name,
        recipientId: String(index + 1),
        routingOrder: String(index + 1)
      }))
    },
    status: 'sent',
    customFields: {
      textCustomFields: [{
        name: 'rolloverId',
        value: documentId.split('_')[0]
      }]
    }
  };
  
  const docuSignResponse = await docuSignClient.createEnvelope(envelope);
  
  return NextResponse.json({
    envelopeId: docuSignResponse.envelopeId,
    signingUrl: docuSignResponse.signingUrl
  });
}
```

### 2.3 Document API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/documents/upload` | POST | Upload with OCR and watermarking |
| `/v1/documents/{id}` | GET | Retrieve document metadata |
| `/v1/documents/{id}/download` | GET | Download with audit trail |
| `/v1/documents/bulk/approve` | POST | Bulk approve documents |
| `/v1/documents/esignature` | POST | Send for e-signature |
| `/v1/documents/search` | GET | Search with metadata filters |

## Phase 3: Webhook Management System

### 3.1 Enhanced Webhook Registration

```typescript
// Extend existing webhook registration
POST /v1/webhooks
{
  "url": "https://custodian.com/webhooks/trustrails",
  "eventTypes": [
    "rollover.started",
    "rollover.completed",
    "blockchain.executed",
    "documents.approved"
  ],
  "filters": {
    "custodianId": "custodian-123",
    "minimumAmount": 100000
  },
  "retryPolicy": {
    "maxRetries": 5,
    "backoffMultiplier": 2
  },
  "authentication": {
    "type": "bearer",
    "token": "custodian-webhook-token"
  }
}
```

### 3.2 Webhook Testing Tools

```typescript
// /app/api/v1/webhooks/test/route.ts
export async function POST(req: NextRequest) {
  const { webhookId, eventType } = await req.json();
  
  // Generate test payload
  const testPayload = generateTestPayload(eventType);
  
  // Send test webhook
  const result = await webhookService.sendTestWebhook(webhookId, testPayload);
  
  return NextResponse.json({
    success: result.success,
    responseStatus: result.responseStatus,
    responseBody: result.responseBody,
    deliveryTime: result.deliveryTime,
    signature: result.signature
  });
}
```

### 3.3 Webhook Event Types

```typescript
export const WEBHOOK_EVENT_TYPES = {
  // Rollover lifecycle
  'rollover.started': 'Transfer initiated',
  'rollover.acknowledged': 'Recipient acknowledged',
  'rollover.documents_uploaded': 'Documents uploaded',
  'rollover.documents_approved': 'Documents approved',
  'rollover.ready_to_execute': 'Ready for blockchain',
  'rollover.completed': 'Transfer completed',
  'rollover.failed': 'Transfer failed',
  
  // Blockchain events
  'blockchain.sender_ready': 'Sender prepared',
  'blockchain.receiver_ready': 'Receiver prepared',
  'blockchain.executed': 'Blockchain executed',
  'blockchain.minted': 'Tokens minted',
  'blockchain.burned': 'Tokens burned',
  
  // Settlement events
  'settlement.funds_sent': 'Funds sent',
  'settlement.funds_received': 'Funds received',
  
  // Document events
  'document.uploaded': 'Document uploaded',
  'document.approved': 'Document approved',
  'document.rejected': 'Document rejected',
  'document.esigned': 'Document e-signed'
};
```

## Phase 4: API Client Management

### 4.1 OAuth 2.0 Client Registration

```typescript
// Create OAuth client
POST /v1/oauth/clients
{
  "name": "Custodian ERP Integration",
  "description": "Integration with internal ERP system",
  "scopes": [
    "read:rollovers",
    "write:rollovers",
    "read:documents",
    "write:webhooks"
  ],
  "redirectUris": [
    "https://erp.custodian.com/oauth/callback"
  ],
  "clientType": "confidential"
}

// Response
{
  "clientId": "tr_a1b2c3d4e5f6",
  "clientSecret": "sk_live_abcdef123456", // Only shown once
  "scopes": [...],
  "rateLimitTier": "basic"
}
```

### 4.2 Scoped Permissions

| Scope | Description | Operations |
|-------|-------------|------------|
| `read:rollovers` | View transfer data | GET /rollovers/* |
| `write:rollovers` | Create/update transfers | POST, PUT /rollovers/* |
| `read:documents` | Access documents | GET /documents/* |
| `write:documents` | Upload documents | POST /documents/* |
| `read:webhooks` | View webhooks | GET /webhooks/* |
| `write:webhooks` | Manage webhooks | POST, DELETE /webhooks/* |
| `admin:all` | Full access | All operations |

### 4.3 Rate Limiting Tiers

| Tier | Requests/Hour | Burst | Monthly Limit | Price |
|------|---------------|-------|---------------|-------|
| Basic | 1,000 | 100 | 100,000 | Free |
| Pro | 10,000 | 1,000 | 1,000,000 | $99/mo |
| Enterprise | 100,000 | 10,000 | Unlimited | Custom |

## Phase 5: Cloud Functions Architecture

### 5.1 Document Processing Pipeline

```typescript
// /functions/src/document-pipeline.ts
export const processDocument = functions.storage
  .bucket('trustrails-documents')
  .object()
  .onFinalize(async (object) => {
    const pipeline = new DocumentPipeline();
    
    await pipeline.run([
      virusScan,
      extractText,     // OCR
      extractMetadata, // EXIF, PDF metadata
      generateThumbnail,
      indexContent,    // Search indexing
      classifyDocument // ML classification
    ], object);
  });
```

### 5.2 Event Aggregation

```typescript
// Aggregate multiple events for batch webhooks
export const aggregateEvents = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const aggregator = new EventAggregator();
    
    // Get custodians with batch webhooks enabled
    const custodians = await getCustodiansWithBatchWebhooks();
    
    for (const custodian of custodians) {
      const events = await aggregator.getEventsForCustodian(
        custodian.id,
        custodian.batchWindow
      );
      
      if (events.length > 0) {
        await webhookService.sendBatchWebhook(custodian, events);
      }
    }
  });
```

## Security Implementation

### Request Signing

```typescript
// Client-side request signing
const signature = crypto
  .createHmac('sha256', clientSecret)
  .update(`${method}\n${url}\n${timestamp}\n${body}`)
  .digest('hex');

headers['X-TrustRails-Signature'] = signature;
headers['X-TrustRails-Timestamp'] = timestamp;
```

### IP Whitelisting

```typescript
// Configure IP whitelist for production
POST /v1/oauth/clients/{clientId}/whitelist
{
  "ipAddresses": [
    "203.0.113.0/24",  // Office network
    "198.51.100.42"    // Production server
  ]
}
```

### Audit Logging

Every API request generates an audit event:
```typescript
{
  eventType: 'api.request',
  clientId: 'tr_a1b2c3d4e5f6',
  endpoint: '/v1/rollovers',
  method: 'POST',
  statusCode: 201,
  responseTime: 234,
  ipAddress: '203.0.113.42',
  userAgent: 'TrustRails-Python-SDK/1.0.0',
  timestamp: '2024-01-15T10:30:00Z'
}
```

## SDK Examples

### Python SDK

```python
from trustrails import TrustRailsClient

client = TrustRailsClient(api_key="sk_live_...")

# Create rollover
rollover = client.rollovers.create(
    source_custodian_id="custodian-123",
    destination_custodian_id="custodian-456",
    user_info={
        "name": "John Doe",
        "email": "john@example.com"
    }
)

# Upload document with watermarking
document = client.documents.upload(
    rollover_id=rollover.id,
    file_path="/path/to/document.pdf",
    document_type="account_statement",
    watermark={
        "approved_by": "john@example.com",
        "security_level": "confidential"
    }
)

# Register webhook
webhook = client.webhooks.create(
    url="https://myapp.com/webhooks/trustrails",
    event_types=["rollover.completed", "documents.approved"],
    secret=client.generate_webhook_secret()
)
```

### Node.js SDK

```javascript
const TrustRails = require('@trustrails/sdk');

const client = new TrustRails({
  apiKey: process.env.TRUSTRAILS_API_KEY
});

// Create rollover with async/await
async function createTransfer() {
  const rollover = await client.rollovers.create({
    sourceCustodianId: 'custodian-123',
    destinationCustodianId: 'custodian-456',
    userInfo: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  });
  
  // Handle webhook in Express
  app.post('/webhooks/trustrails', (req, res) => {
    const signature = req.headers['x-trustrails-signature'];
    
    if (!TrustRails.verifyWebhookSignature(req.body, signature, webhookSecret)) {
      return res.status(401).send('Invalid signature');
    }
    
    const event = req.body;
    
    switch (event.eventType) {
      case 'rollover.completed':
        handleRolloverCompleted(event.data);
        break;
      case 'documents.approved':
        handleDocumentsApproved(event.data);
        break;
    }
    
    res.status(200).send('OK');
  });
}
```

## Integration Examples

### ERP Integration

```typescript
// Sync rollovers with internal ERP
class ERPSync {
  async syncRollover(rollover: Rollover) {
    // Map TrustRails data to ERP format
    const erpData = {
      caseId: rollover.id,
      client: rollover.displayName,
      status: this.mapStatus(rollover.state),
      documents: await this.syncDocuments(rollover.id)
    };
    
    // Push to ERP
    await this.erpClient.createCase(erpData);
    
    // Register for updates
    await this.trustRails.webhooks.create({
      url: `${this.baseUrl}/erp/webhook`,
      eventTypes: ['rollover.completed'],
      filters: { rolloverId: rollover.id }
    });
  }
}
```

### Treasury Management

```typescript
// Integrate with treasury systems
class TreasuryIntegration {
  async initiateTransfer(rollover: Rollover) {
    if (rollover.state !== 'ready_to_execute') return;
    
    const transfer = await this.treasury.createTransfer({
      from: rollover.sourceCustodian.account,
      to: rollover.destinationCustodian.account,
      amount: rollover.financial.netAmount,
      reference: `TR-${rollover.id}`
    });
    
    // Update TrustRails with treasury ID
    await this.trustRails.rollovers.update(rollover.id, {
      treasuryTransferId: transfer.id
    });
  }
}
```

## Monitoring & Analytics

### API Usage Dashboard

```typescript
// Real-time usage monitoring
GET /v1/analytics/usage
{
  "period": "2024-01",
  "totalRequests": 45678,
  "uniqueEndpoints": 12,
  "averageResponseTime": 234,
  "errorRate": 0.02,
  "topEndpoints": [
    { "path": "/v1/rollovers", "count": 12345 },
    { "path": "/v1/documents/upload", "count": 8765 }
  ],
  "webhookDeliveries": {
    "total": 23456,
    "successful": 23400,
    "failed": 56,
    "averageDeliveryTime": 567
  }
}
```

## Compliance Features

### SOC 2 Evidence Collection

- All API requests logged with full attribution
- Webhook delivery attempts tracked
- Document access audited
- Rate limit violations recorded
- Authentication failures monitored

### GDPR Compliance

- PII automatically encrypted
- Data retention policies enforced
- Right to erasure supported
- Data portability via API exports

## Support & Resources

### Developer Portal
- Interactive API documentation: https://developers.trustrails.com
- SDK downloads and examples
- Webhook testing tools
- API status page

### Getting Started
1. Register at https://trustrails.com/developers
2. Create OAuth client or API key
3. Install SDK for your language
4. Follow quickstart guide
5. Test with sandbox environment

### Contact
- API Support: api-support@trustrails.com
- Security: security@trustrails.com
- Sales: enterprise@trustrails.com

## Conclusion

This external API architecture extends TrustRails' robust event-driven system into a comprehensive platform for custodian integrations, maintaining security, compliance, and developer experience standards required in financial services.