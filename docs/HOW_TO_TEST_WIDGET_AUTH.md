# 🧪 Complete Widget Authentication Testing Guide

## ✅ Issues Fixed
- **Fixed:** Duplicate `existingKeys` variable declaration
- **Fixed:** Async params destructuring in API routes
- **Fixed:** FieldValue.serverTimestamp() in arrays

## 📋 Step-by-Step Testing Instructions

### Step 1: Start Services

1. **Main TrustRails App** (should already be running on port 3000)
   ```bash
   cd /home/stock1232/projects/trustrails
   npm run dev
   # Runs on http://localhost:3000
   ```

2. **Widget Demo App** (now running on port 3001)
   ```bash
   cd /home/stock1232/projects/trustrails-platform/apps/widget-demo
   npm run dev
   # Runs on http://localhost:3001
   ```

### Step 2: Generate API Keys in TrustRails

1. **Login as Admin** at http://localhost:3000/login
   - Use your admin credentials

2. **Enable Integration for a Custodian:**
   - Go to **Admin Dashboard** → **Custodians** tab
   - Click on **"Empower"** (or any custodian)
   - Find the **Integration Settings** section
   - Toggle ON both:
     - 🌐 **Widget Integration**
     - 🔑 **API Access**

3. **Login as Custodian User**
   - Logout from admin
   - Login with custodian user credentials (e.g., Empower user)

4. **Generate Public API Key:**
   - Go to **Custodian Dashboard** → **Integrations** tab
   - In the **Widget** tab section, find **Public API Keys**
   - Click **"Generate New Key"**
   - Set:
     - **Name:** "Test Widget Key"
     - **Type:** "Public Key (Widget)"
     - **Environment:** "Sandbox"
   - Click **Generate Key**
   - **COPY THE KEY** (format: `tr_test_pk_xxxxxxxxxxxxx`)

### Step 3: Test Widget Authentication

#### Option A: Use the Enhanced Test Page

1. **Open Test Page:** http://localhost:3001/test.html

2. **Configure Widget:**
   - **Custodian ID:** Select "Empower" (or use the ID: `ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8`)
   - **Public API Key:** Paste your generated key
   - **Environment:** Select "Sandbox"

3. **Test Authentication Flow:**
   - Click **"🚀 Initialize Widget"**
   - Watch the logs:
     - Should see "Using Public API Key: tr_test_pk_xxx..."
     - Should see "Authentication Successful!"
     - Should see "Bearer Token: tr_bearer_xxx..."
   - Click **"📡 Test API"** to test with bearer token

#### Option B: Use Browser Console

1. **Open DevTools Console** at http://localhost:3001

2. **Test Authentication:**
```javascript
// Replace with your actual values
const CUSTODIAN_ID = 'ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8';
const API_KEY = 'YOUR_PUBLIC_KEY_HERE'; // tr_test_pk_xxx

// Test authentication
const authResponse = await fetch('http://localhost:3000/api/widget/auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-TrustRails-API-Key': API_KEY,
    'X-TrustRails-Partner-ID': CUSTODIAN_ID
  },
  body: JSON.stringify({
    widget_version: '1.0.0',
    timestamp: new Date().toISOString()
  })
});

const authData = await authResponse.json();
console.log('✅ Bearer Token:', authData.bearer_token);
console.log('✅ Session ID:', authData.session_id);

// Test API call with bearer token
const testResponse = await fetch('http://localhost:3000/api/widget/create-account', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.bearer_token}` // Using bearer token!
  },
  body: JSON.stringify({
    auth_type: 'email',
    email: `test${Date.now()}@example.com`,
    password: 'TestPassword123!'
  })
});

const userData = await testResponse.json();
console.log('✅ User Created:', userData);
```

### Step 4: Verify in Network Tab

1. Open **DevTools → Network tab**
2. Look for these requests:

   **First Request (Widget Auth):**
   - URL: `/api/widget/auth`
   - Request Header: `X-TrustRails-API-Key: tr_test_pk_xxx`
   - Response: Contains `bearer_token` and `session_id`

   **Subsequent Requests:**
   - URL: `/api/widget/create-account`
   - Request Header: `Authorization: Bearer tr_bearer_xxx`
   - Response: User creation success

### Step 5: Check Session Storage

In browser console:
```javascript
// Should see the stored tokens
sessionStorage.getItem('trustrails_bearer_token')
// Returns: "tr_bearer_eyJhbGci..."

sessionStorage.getItem('trustrails_session_id')
// Returns: "ws_1234567890_xxx"
```

## 🔍 What Success Looks Like

✅ **Correct Flow:**
1. Widget uses **public key** (`tr_test_pk_xxx`) for initial auth
2. Receives **bearer token** (`tr_bearer_xxx`) in response
3. All subsequent API calls use **bearer token** in Authorization header
4. Session persists in sessionStorage

❌ **Common Issues:**
- "Invalid API key format" → Make sure key starts with `tr_test_pk_` or `tr_live_pk_`
- "Widget integration not enabled" → Admin needs to enable widget toggle
- "Invalid or expired bearer token" → Token expired after 24 hours, re-authenticate

## 📊 Visual Confirmation

In the test page (http://localhost:3001/test.html), you should see:

1. **Status Badge:** Changes from "Not Connected" (red) to "Connected" (green)
2. **Authentication Log:** Shows successful auth with bearer token
3. **Network Monitor:** Shows headers changing from API key to bearer token
4. **Session Storage:** Displays the stored bearer token and session ID

## 🎯 Key Points

- **Public Keys** (`pk`) are safe for browser, shown in Widget tab
- **Secret Keys** (`sk`) are server-only, shown in API tab
- **Bearer Tokens** are session-based, expire after 24 hours
- **Widget automatically** handles the token exchange

## 🚀 Quick Test Command

If you have the shell script:
```bash
cd /home/stock1232/projects/trustrails
API_KEY="YOUR_PUBLIC_KEY" \
PARTNER_ID="ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8" \
./scripts/test-widget-auth.sh
```

Now you can fully test the widget authentication flow from API key to bearer token!