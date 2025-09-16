# TrustRails Authentication Architecture

## Overview

TrustRails uses a **multi-tier authentication system** designed for different use cases:

## 1. Authentication Tiers

### Tier 1: Enterprise Financial Institutions (Not Yet Implemented)
- **Method**: OAuth 2.0 Client Credentials + mTLS
- **Use Case**: Banks, large custodians with direct API integration
- **Security**: Highest - requires mutual TLS certificates
- **Rate Limit**: 1000 req/min
- **Requirements**: SOC 2 Type II, PCI DSS Level 1

### Tier 2: Digital Custodians (Currently Active)
- **Method**: API Keys
- **Use Case**: HR platforms, 401k providers, smaller custodians
- **Security**: Standard - HMAC signed requests
- **Rate Limit**: 500 req/min
- **Requirements**: SOC 2 Type I

## 2. Three-Party Authentication Flow

When the widget is embedded on a custodian's website:

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  End User   │────▶│ HR Platform  │────▶│ TrustRails │
└─────────────┘     └──────────────┘     └────────────┘
      ▲                     │                    │
      │                     │ API Key            │
      │                     ▼                    │
      │             ┌──────────────┐            │
      └─────────────│    Widget    │◀───────────┘
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ OAuth (Google)│
                    └──────────────┘
```

### Authentication Layers:

1. **Custodian Authentication** (API Key)
   - HR platform embeds widget with their API key
   - Validates custodian has widget access enabled
   - Rate limiting per custodian

2. **End User Authentication** (OAuth)
   - User clicks "Start Rollover" in widget
   - Redirected to Google/Auth0 OAuth
   - Creates/links user account under custodian

3. **Session Management**
   - Widget maintains session after OAuth
   - Session tied to both user AND custodian
   - 24-hour expiry with refresh capability

## 3. Widget Integration Example

### For HR Platform/Custodian:

```html
<!-- Embed the widget with custodian credentials -->
<script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>

<trustrails-widget
  partner-id="custodian-abc123"
  api-key="tr_live_sk_1234567890"
  oauth-provider="google"
  environment="production">
</trustrails-widget>
```

### Widget Authentication Flow:

```javascript
// 1. Widget initializes with custodian API key
const widget = new TrustRailsWidget({
  partnerId: 'custodian-abc123',
  apiKey: 'tr_live_sk_1234567890'
});

// 2. User clicks "Start Rollover"
widget.on('rollover:start', async () => {
  // 3. Check if user is authenticated
  if (!widget.isUserAuthenticated()) {
    // 4. Redirect to OAuth provider
    await widget.authenticateUser({
      provider: 'google',
      redirectUrl: window.location.href
    });
  }

  // 5. User returns authenticated
  const user = widget.getCurrentUser();
  console.log('Authenticated user:', user.email);

  // 6. Check KYC status
  if (!user.kycCompleted) {
    await widget.startKYCProcess();
  }
});
```

## 4. KYC Process

After OAuth authentication, users must complete KYC:

1. **Identity Verification**
   - Government ID upload
   - Selfie verification
   - Address proof

2. **Account Verification**
   - 401k account details
   - Current custodian verification
   - Balance confirmation

3. **Compliance Checks**
   - AML screening
   - OFAC check
   - Risk assessment

## 5. API Key vs OAuth 2.0

### API Keys (Current Implementation)
**Used for**: Server-to-server communication
**Who uses it**: Custodians/HR platforms
**How it works**:
```javascript
// Custodian's backend server
const response = await fetch('https://api.trustrails.com/v1/rollovers', {
  headers: {
    'Authorization': 'Bearer tr_live_sk_1234567890',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'user-123',
    amount: 50000
  })
});
```

### OAuth 2.0 (For End Users)
**Used for**: User authentication in widget
**Who uses it**: End users (employees)
**How it works**:
```javascript
// In the widget (client-side)
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
  'client_id=YOUR_GOOGLE_CLIENT_ID&' +
  'redirect_uri=https://trustrails.com/auth/callback&' +
  'response_type=code&' +
  'scope=openid email profile';

window.location.href = authUrl;
```

## 6. Security Considerations

### For Embedded Widgets:

1. **CORS Configuration**
   - Allow specific custodian domains
   - Validate origin headers
   - Use credentials: 'include' for cookies

2. **Frame-Ancestors**
   - CSP headers to prevent clickjacking
   - X-Frame-Options for older browsers

3. **Token Storage**
   - API keys: Never exposed to frontend
   - User tokens: Stored in sessionStorage (not localStorage)
   - Refresh tokens: HTTP-only cookies

4. **Communication Security**
   - PostMessage API for widget-parent communication
   - Validate message origins
   - Encrypt sensitive data

## 7. Common Scenarios

### Scenario 1: Employee at HR Platform
1. Employee logs into HR platform
2. Navigates to benefits/401k section
3. Sees TrustRails widget embedded
4. Clicks "Transfer my 401k"
5. Authenticates with Google
6. Completes KYC
7. Initiates rollover

### Scenario 2: Direct Integration
1. Custodian integrates TrustRails API
2. Uses API key for backend calls
3. Manages user sessions internally
4. Calls TrustRails API for operations

### Scenario 3: Hybrid Approach
1. Custodian embeds widget for UI
2. Uses API for backend operations
3. Widget handles user auth
4. API handles data operations

## 8. Implementation Status

✅ **Implemented**:
- API Key generation and management
- Basic custodian authentication
- Widget embedding capability
- Admin dashboard for key management

🚧 **In Progress**:
- Google OAuth integration
- KYC workflow
- Session management

📋 **Planned**:
- OAuth 2.0 Client Credentials flow
- mTLS for Tier 1 partners
- Auth0/Okta integration
- SAML support

## 9. Environment Variables Required

```env
# OAuth Providers
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Auth0 (Optional)
NEXT_PUBLIC_AUTH0_DOMAIN=your-auth0-domain
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret

# Widget Configuration
NEXT_PUBLIC_ALLOWED_ORIGINS=https://hrplatform.com,https://custodian.com
NEXT_PUBLIC_APP_URL=https://app.trustrails.com

# Session Configuration
SESSION_SECRET=your-session-secret
SESSION_DURATION=86400 # 24 hours in seconds
```

## 10. Testing Authentication

### Test API Key Authentication:
```bash
curl -X GET https://api.trustrails.com/v1/custodian/info \
  -H "Authorization: Bearer tr_test_sk_1234567890"
```

### Test OAuth Flow:
1. Open widget in test mode
2. Click "Start Rollover"
3. Authenticate with Google
4. Verify user creation in Firebase
5. Check session creation

---

**Note**: This architecture supports both current needs (API keys for custodians) and future requirements (OAuth for end users, enterprise OAuth 2.0 for banks).