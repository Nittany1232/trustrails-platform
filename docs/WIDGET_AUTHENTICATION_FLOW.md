# Widget Authentication Flow - Where Keys and Tokens Go

## 📍 Where Each Key/Token is Used

### 1️⃣ **Initial Widget Embed (HTML)**
```html
<!-- Customer embeds this on their website -->
<script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>

<trustrails-widget
  partner-id="empower-custodian-id"
  api-key="tr_live_pk_1234567890abcdef"  <!-- 👈 PUBLIC KEY GOES HERE -->
  environment="production">
</trustrails-widget>
```

**The PUBLIC KEY (`tr_live_pk_xxx`):**
- ✅ Goes directly in the HTML embed
- ✅ Safe to put in client-side code
- ✅ Can be visible in page source
- ✅ Generated from Widget tab in Integrations

### 2️⃣ **Widget Initialization (Behind the Scenes)**

When the widget loads, it automatically:

```javascript
// This happens inside the widget automatically
// Custodian doesn't write this code!

// Step 1: Widget uses the public key to authenticate
const response = await fetch('/api/widget/auth', {
  headers: {
    'X-TrustRails-API-Key': 'tr_live_pk_1234567890abcdef', // From HTML attribute
    'X-TrustRails-Partner-ID': 'empower-custodian-id'       // From HTML attribute
  }
});

// Step 2: Widget receives and stores bearer token
const { bearer_token, session_id } = await response.json();
// Returns: { bearer_token: "tr_bearer_eyJhbGc...", session_id: "ws_123..." }

// Step 3: Widget stores in session
sessionStorage.setItem('trustrails_bearer_token', bearer_token);
```

### 3️⃣ **All Subsequent API Calls**

After initial auth, the widget uses the BEARER TOKEN for everything:

```javascript
// This also happens automatically inside widget
// Bearer token is never exposed to custodian's code!

// Creating user account
await fetch('/api/widget/create-account', {
  headers: {
    'Authorization': `Bearer ${bearer_token}`  // 👈 BEARER TOKEN (not API key!)
  }
});

// Getting rollover data
await fetch('/api/widget/rollover-status', {
  headers: {
    'Authorization': `Bearer ${bearer_token}`  // 👈 Always bearer token
  }
});
```

## 🔑 Key Types Summary

| Key Type | Format | Where Used | Who Sees It |
|----------|--------|------------|-------------|
| **Public Key** | `tr_live_pk_xxx` | HTML embed attribute | ✅ Everyone (safe) |
| **Bearer Token** | `tr_bearer_eyJ...` | API calls (automatic) | ❌ Hidden (widget internal) |
| **Secret Key** | `tr_live_sk_xxx` | Server-side only | ❌ Never in browser |

## 🎯 Simple Flow Diagram

```
1. CUSTODIAN EMBEDS WIDGET
   └─> Puts PUBLIC KEY in HTML

2. WIDGET LOADS
   └─> Uses PUBLIC KEY to get BEARER TOKEN
       └─> Stores token in sessionStorage

3. USER INTERACTS
   └─> Widget uses BEARER TOKEN for all API calls
       └─> Token expires after 24 hours
       └─> Widget re-authenticates with PUBLIC KEY
```

## 💡 Important Points

### What the Custodian Does:
1. **Generates** public key in TrustRails dashboard
2. **Embeds** widget with public key in HTML
3. **That's it!** Widget handles the rest

### What Happens Automatically:
1. Widget exchanges public key for bearer token
2. Widget manages token storage and renewal
3. Widget uses bearer token for all API calls
4. Widget re-authenticates when token expires

### Security Benefits:
- **Public key** is rate-limited and has minimal permissions
- **Bearer token** is session-based and expires
- **Secret keys** never touch the browser
- **No credentials** exposed to end users

## 🧪 How to Verify It's Working

### 1. Check Network Tab
```
First request (widget init):
  Header: X-TrustRails-API-Key: tr_live_pk_xxx ✅

All other requests:
  Header: Authorization: Bearer tr_bearer_xxx ✅
```

### 2. Check Session Storage
```javascript
// In browser console
sessionStorage.getItem('trustrails_bearer_token')
// Should return: "tr_bearer_eyJhbGciOiJIUzI1..."
```

### 3. Check Widget Attributes
```javascript
// In browser console
document.querySelector('trustrails-widget').getAttribute('api-key')
// Should return: "tr_live_pk_1234567890..."
```

## ❌ Common Mistakes

### Wrong: Putting Secret Key in Widget
```html
<!-- NEVER DO THIS! -->
<trustrails-widget
  api-key="tr_live_sk_xxx">  <!-- ❌ Secret key exposed! -->
</trustrails-widget>
```

### Wrong: Using Bearer Token in HTML
```html
<!-- IMPOSSIBLE - Bearer token doesn't exist yet! -->
<trustrails-widget
  bearer-token="tr_bearer_xxx">  <!-- ❌ Can't do this -->
</trustrails-widget>
```

### Correct: Only Public Key in HTML
```html
<!-- ✅ CORRECT -->
<trustrails-widget
  partner-id="your-custodian-id"
  api-key="tr_live_pk_xxx">  <!-- ✅ Public key only -->
</trustrails-widget>
```

## 📝 Complete Example

### Step 1: Custodian Gets Public Key
1. Login to TrustRails
2. Go to Integrations → Widget tab
3. Generate public key
4. Copy key (e.g., `tr_live_pk_abc123...`)

### Step 2: Custodian Embeds Widget
```html
<!DOCTYPE html>
<html>
<head>
  <title>Empower Retirement</title>
</head>
<body>
  <h1>401(k) Rollover Portal</h1>

  <!-- TrustRails Widget -->
  <script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>

  <trustrails-widget
    partner-id="empower-12345"
    api-key="tr_live_pk_abc123def456ghi789"
    environment="production">
  </trustrails-widget>
</body>
</html>
```

### Step 3: End User Experience
1. User sees widget on custodian's site
2. Clicks "Start Rollover"
3. Widget (internally) exchanges public key for bearer token
4. Widget guides user through rollover process
5. All API calls use bearer token automatically

The custodian **never sees or handles the bearer token** - it's completely managed by the widget!