# Widget Authentication Testing Guide

## 🎯 Overview

This guide explains how to test the dual API key system and verify that bearer tokens are being used correctly in the TrustRails widget authentication flow.

## 🔑 Understanding the Authentication Flow

### Step 1: Widget Authentication
```mermaid
sequenceDiagram
    Widget->>API: POST /api/widget/auth
    Note over Widget: Headers: X-TrustRails-API-Key (public key)
    API-->>Widget: Bearer Token + Session ID
    Widget->>SessionStorage: Store Bearer Token
```

### Step 2: User Account Creation
```mermaid
sequenceDiagram
    Widget->>API: POST /api/widget/create-account
    Note over Widget: Headers: Authorization: Bearer {token}
    API-->>Widget: User Info + Custom Token
    Widget->>Firebase: Authenticate with Custom Token
```

### Step 3: OAuth Flow (Future)
```mermaid
sequenceDiagram
    Widget->>OAuth Provider: Redirect/Popup
    OAuth Provider-->>Callback: Authorization Code
    Callback->>API: Exchange for User
    API-->>Widget: User Session Linked
```

## 🧪 Testing Steps

### 1. Enable Integration in Admin Dashboard

1. **Login as Admin:**
   ```bash
   # Navigate to http://localhost:3000/login
   # Use admin credentials
   ```

2. **Enable Integration:**
   - Go to **Admin Dashboard** → **Custodians** tab
   - Click on a custodian (e.g., "Empower")
   - Find **Integration Settings** section
   - Toggle ON:
     - 🌐 **Widget Integration** - For widget embedding
     - 🔑 **API Access** - For backend integration

### 2. Generate API Keys as Custodian User

1. **Login as Custodian User:**
   ```bash
   # Use custodian user credentials
   ```

2. **Navigate to Integrations:**
   - Go to **Custodian Dashboard** → **Integrations** tab
   - Click **"Generate New Key"**

3. **Create Public Key for Widget:**
   - **Name:** "Production Widget"
   - **Type:** "Public Key (Widget)"
   - **Environment:** "Production"
   - Click **Generate Key**
   - **SAVE THE KEY** - It will look like: `tr_live_pk_xxxxxxxxxxxxxxxxxxxxx`

4. **Create Secret Key for Backend:**
   - **Name:** "Backend API"
   - **Type:** "Secret Key (Backend)"
   - **Environment:** "Production"
   - Click **Generate Key**
   - **SAVE THE KEY** - It will look like: `tr_live_sk_xxxxxxxxxxxxxxxxxxxxx`

### 3. Test Widget Authentication

#### A. Test in Browser Console

```javascript
// 1. Test widget authentication
const response = await fetch('http://localhost:3000/api/widget/auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-TrustRails-API-Key': 'tr_test_pk_xxxxxxxxxxxxxxxxxxxxx', // Your public key
    'X-TrustRails-Partner-ID': 'your-custodian-id'
  },
  body: JSON.stringify({
    widget_version: '1.0.0',
    timestamp: new Date().toISOString()
  })
});

const authData = await response.json();
console.log('Bearer Token:', authData.bearer_token);
console.log('Session ID:', authData.session_id);

// 2. Test account creation with bearer token
const accountResponse = await fetch('http://localhost:3000/api/widget/create-account', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.bearer_token}` // Using bearer token!
  },
  body: JSON.stringify({
    auth_type: 'email',
    email: 'test@example.com',
    password: 'SecurePassword123!'
  })
});

const userData = await accountResponse.json();
console.log('User Created:', userData);
```

#### B. Test Widget in Demo App

1. **Update Demo Configuration:**
   ```bash
   cd /home/stock1232/projects/trustrails-platform/apps/widget-demo
   # Edit index.html with your actual keys
   ```

2. **Run Widget Demo:**
   ```bash
   npm run dev
   # Open http://localhost:5173
   ```

3. **Monitor Network Tab:**
   - Open DevTools → Network tab
   - Look for `/api/widget/auth` request
   - Verify response contains `bearer_token`
   - Check subsequent requests use `Authorization: Bearer` header

### 4. Verify Bearer Token Usage

#### Check Network Headers:
```bash
# In DevTools Network tab, look for:
1. Initial auth request with API key:
   X-TrustRails-API-Key: tr_test_pk_xxxxx

2. Subsequent requests with bearer token:
   Authorization: Bearer tr_bearer_eyJhbGciOiJIUzI1NiIs...
```

#### Check Session Storage:
```javascript
// In browser console:
sessionStorage.getItem('trustrails_bearer_token')
sessionStorage.getItem('trustrails_session_id')
```

#### Monitor Server Logs:
```bash
# In your terminal running the dev server:
[WIDGET-AUTH] Successful auth for partner xyz from http://localhost:5173
[WIDGET-AUTH] Created user test@example.com for custodian xyz
```

### 5. Test Security Boundaries

#### ❌ Test What Should Fail:

1. **Using Secret Key in Browser:**
   ```javascript
   // This should FAIL with 401
   fetch('/api/widget/auth', {
     headers: {
       'X-TrustRails-API-Key': 'tr_live_sk_xxxxx' // Secret key
     }
   })
   // Error: "Invalid key type. Widget authentication requires a public key (pk)."
   ```

2. **Using Public Key for Backend API:**
   ```javascript
   // This should FAIL with 403
   fetch('/api/custodian/data', {
     headers: {
       'X-API-Key': 'tr_live_pk_xxxxx' // Public key
     }
   })
   // Error: "Public keys can only access widget endpoints"
   ```

3. **Using Expired Bearer Token:**
   ```javascript
   // After 24 hours, token should be invalid
   fetch('/api/widget/create-account', {
     headers: {
       'Authorization': 'Bearer {old_token}'
     }
   })
   // Error: "Invalid or expired bearer token"
   ```

## 🔍 How to Know Bearer Token is Being Used

### Visual Indicators:

1. **Network Tab Shows Bearer Header:**
   - Look for `Authorization: Bearer tr_bearer_...` in request headers
   - NOT `X-TrustRails-API-Key` after initial auth

2. **Session Storage Contains Token:**
   ```javascript
   // Check browser storage
   sessionStorage.trustrails_bearer_token // Should exist
   sessionStorage.trustrails_session_id   // Should exist
   ```

3. **API Response Includes Token:**
   ```json
   {
     "success": true,
     "bearer_token": "tr_bearer_eyJhbGci...",
     "session_id": "ws_1234567890_abcdef",
     "expires_at": "2024-01-15T12:00:00Z"
   }
   ```

4. **Firestore Shows Active Session:**
   - Check Firebase Console → Firestore → `widget_sessions` collection
   - Should see document with your session ID

## 🔐 OAuth Integration (Coming Next)

### Current State:
- ✅ Bearer token infrastructure ready
- ✅ Session management implemented
- ✅ User creation endpoint supports OAuth
- ⚠️ OAuth provider integration not complete
- ⚠️ OAuth popup/redirect flow not implemented

### Next Steps for OAuth:

1. **Add OAuth Provider Configuration:**
   ```javascript
   // Widget needs to implement:
   widget.initiateOAuth('google');
   // Opens popup → Google login → Callback → User created
   ```

2. **Complete OAuth Callback Handler:**
   ```typescript
   // /api/auth/oauth/callback needs to:
   - Verify OAuth token with provider
   - Create/update user in Firebase
   - Link to widget session
   - Return success to widget
   ```

3. **Add OAuth UI in Widget:**
   ```html
   <!-- Widget should show: -->
   <button onclick="signInWithGoogle()">
     Sign in with Google
   </button>
   <button onclick="signInWithMicrosoft()">
     Sign in with Microsoft
   </button>
   ```

## 📊 Testing Checklist

### Basic Flow:
- [ ] Admin enables widget integration
- [ ] Custodian generates public API key
- [ ] Widget authenticates with public key
- [ ] Bearer token returned and stored
- [ ] Subsequent API calls use bearer token
- [ ] Session expires after 24 hours

### Security:
- [ ] Public keys rejected for backend APIs
- [ ] Secret keys rejected from browsers
- [ ] Expired tokens are rejected
- [ ] Rate limiting enforces limits
- [ ] CORS headers restrict origins

### Integration:
- [ ] Widget demo app works
- [ ] React example integration works
- [ ] Session persistence across page reload
- [ ] Error messages are helpful
- [ ] Audit logs capture events

## 🐛 Troubleshooting

### Common Issues:

1. **"Invalid API key format"**
   - Ensure key has correct prefix (`tr_live_pk_` or `tr_test_pk_`)
   - Check key length (should be ~43 characters)

2. **"Widget integration not enabled"**
   - Admin must enable widget toggle first
   - Check custodian settings in admin dashboard

3. **"Invalid or expired bearer token"**
   - Token expires after 24 hours
   - Re-authenticate with `/api/widget/auth`
   - Check session exists in Firestore

4. **CORS Errors:**
   - Add your domain to allowed origins
   - Use correct headers in requests
   - Check browser console for details

## 🚀 Production Deployment

### Environment Variables Needed:
```bash
# .env.local
WIDGET_JWT_SECRET=your-strong-secret-key
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-secret
```

### Security Checklist:
- [ ] Strong JWT secret (min 32 characters)
- [ ] HTTPS only in production
- [ ] Rate limiting configured
- [ ] CORS restricted to known domains
- [ ] Session cleanup job scheduled
- [ ] Audit logging enabled
- [ ] Error messages don't leak secrets

## 📝 Summary

The dual API key system provides:
1. **Public Keys** (`pk`) - Safe for browser, limited permissions
2. **Secret Keys** (`sk`) - Server-only, full API access
3. **Bearer Tokens** - Session-based, 24-hour expiry
4. **OAuth Ready** - Infrastructure in place, providers pending

The widget uses public keys for initial auth, then bearer tokens for all subsequent API calls. This provides security, session management, and prepares for OAuth integration.