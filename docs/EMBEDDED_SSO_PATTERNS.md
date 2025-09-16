# Embedded Widget SSO Patterns

## The Challenge

User is already logged into HR platform/custodian site, but your widget needs to authenticate them separately. How to make this seamless?

## Solution Patterns

### Pattern 1: Custodian-Provided User Token (Most Seamless)
The custodian passes a pre-authenticated token to the widget.

```html
<!-- Custodian generates a user token server-side -->
<trustrails-widget
  partner-id="empower-123"
  api-key="tr_live_sk_xxx"
  user-token="<?php echo $userToken ?>"
  user-email="<?php echo $user->email ?>"
  user-name="<?php echo $user->name ?>">
</trustrails-widget>
```

```javascript
// Widget receives pre-authenticated user info
class TrustRailsWidget {
  async init(config) {
    if (config.userToken) {
      // Verify the token with your backend
      const response = await fetch('/api/widget/verify-sso', {
        method: 'POST',
        body: JSON.stringify({
          custodianId: config.partnerId,
          userToken: config.userToken,
          userEmail: config.userEmail
        })
      });

      if (response.ok) {
        // User is authenticated, skip OAuth
        this.user = await response.json();
        this.showRolloverForm();
        return;
      }
    }

    // Fall back to OAuth if no token
    this.showAuthOptions();
  }
}
```

### Pattern 2: SAML/OAuth Pass-Through (Enterprise)
Custodian acts as Identity Provider (IdP).

```javascript
// Custodian implements SAML endpoint
const samlConfig = {
  entryPoint: 'https://hrplatform.com/saml/sso',
  issuer: 'trustrails-widget',
  callbackUrl: 'https://api.trustrails.com/auth/saml/callback',
  cert: 'CUSTODIAN_PUBLIC_CERT'
};

// Widget initiates SAML flow
widget.authenticateWithSAML({
  custodianId: 'empower-123',
  returnUrl: window.location.href
});
```

### Pattern 3: Silent OAuth with Hint (Most Common)
Pre-populate OAuth with user's email to skip selection.

```html
<!-- Custodian provides user email -->
<trustrails-widget
  partner-id="empower-123"
  api-key="tr_live_sk_xxx"
  user-email="john.doe@company.com"
  auth-hint="true">
</trustrails-widget>
```

```javascript
// Widget uses email hint for OAuth
class TrustRailsWidget {
  async authenticate() {
    const config = this.getConfig();

    if (config.userEmail && config.authHint) {
      // Google OAuth with login hint (skips account selection)
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('login_hint', config.userEmail);  // Pre-select account
      authUrl.searchParams.set('prompt', 'none');  // Try silent auth first
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid email profile');

      // Try silent authentication in iframe first
      try {
        const token = await this.silentAuth(authUrl.toString());
        if (token) {
          this.user = token;
          this.showRolloverForm();
          return;
        }
      } catch (e) {
        // Silent auth failed, need user interaction
      }
    }

    // Show auth options if silent auth fails
    this.showAuthOptions();
  }

  async silentAuth(authUrl) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = authUrl;

      window.addEventListener('message', (event) => {
        if (event.origin !== 'https://accounts.google.com') return;
        if (event.data.token) {
          resolve(event.data.token);
        } else {
          reject(new Error('Silent auth failed'));
        }
      });

      document.body.appendChild(iframe);

      // Timeout after 3 seconds
      setTimeout(() => {
        document.body.removeChild(iframe);
        reject(new Error('Silent auth timeout'));
      }, 3000);
    });
  }
}
```

### Pattern 4: Embedded Credentials (Simplest but Less Secure)
Custodian creates TrustRails account on user's behalf.

```javascript
// Custodian's backend creates user automatically
async function onUserFirstAccess(user) {
  const trustrailsUser = await fetch('https://api.trustrails.com/api/widget/create-user', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CUSTODIAN_API_KEY}`,
    },
    body: JSON.stringify({
      email: user.email,
      name: user.name,
      custodianUserId: user.id,
      skipEmailVerification: true  // Trust custodian's verification
    })
  });

  // Get a session token for the widget
  const sessionToken = trustrailsUser.sessionToken;

  // Pass to widget
  return `
    <trustrails-widget
      partner-id="${CUSTODIAN_ID}"
      session-token="${sessionToken}">
    </trustrails-widget>
  `;
}
```

## Implementation Recommendations

### For Most Custodians: Pattern 3 (Silent OAuth)

```typescript
// API endpoint to handle widget authentication
export async function POST(req: NextRequest) {
  const { custodianId, userEmail, authMethod } = await req.json();

  // Verify custodian
  const custodian = await validateCustodian(custodianId);
  if (!custodian.widgetEnabled) {
    return NextResponse.json({ error: 'Widget not enabled' }, { status: 403 });
  }

  // Check if user exists
  let user = await findUserByEmail(userEmail);

  if (!user && custodian.autoCreateUsers) {
    // Auto-create user if custodian is trusted
    user = await createUser({
      email: userEmail,
      role: 'rollover_user',
      custodianId: custodianId,
      authMethod: authMethod || 'custodian_sso',
      emailVerified: custodian.trustEmailVerification
    });
  }

  // Generate session token
  const sessionToken = await generateSessionToken(user, custodian);

  return NextResponse.json({
    sessionToken,
    user: {
      id: user.id,
      email: user.email,
      requiresKYC: !user.kycCompleted
    }
  });
}
```

### Widget Authentication Flow

```javascript
class TrustRailsWidget extends LitElement {
  async connectedCallback() {
    super.connectedCallback();

    // Try authentication methods in order
    const authenticated = await this.tryAuthentication();

    if (authenticated) {
      this.showRolloverInterface();
    } else {
      this.showAuthOptions();
    }
  }

  async tryAuthentication() {
    // 1. Check if session token provided
    if (this.sessionToken) {
      return await this.validateSessionToken();
    }

    // 2. Check if user token provided (SSO)
    if (this.userToken) {
      return await this.validateSSOToken();
    }

    // 3. Try silent OAuth if email provided
    if (this.userEmail) {
      try {
        return await this.silentOAuth();
      } catch (e) {
        console.log('Silent auth failed, user interaction required');
      }
    }

    // 4. Check for existing session cookie
    return await this.checkExistingSession();
  }

  render() {
    if (!this.authenticated) {
      return html`
        <div class="auth-options">
          <h3>Sign in to continue</h3>

          <!-- Google (with email hint if available) -->
          <button @click=${() => this.authWithGoogle()}>
            <img src="google-icon.svg" />
            Continue with Google
            ${this.userEmail ? html`<br><small>${this.userEmail}</small>` : ''}
          </button>

          <!-- Email/Password (if custodian allows) -->
          ${this.custodian.allowEmailAuth ? html`
            <button @click=${() => this.showEmailAuth()}>
              Continue with Email
            </button>
          ` : ''}

          <!-- SSO (if custodian provides) -->
          ${this.custodian.ssoEnabled ? html`
            <button @click=${() => this.authWithCustodianSSO()}>
              Continue with ${this.custodian.name} Account
            </button>
          ` : ''}
        </div>
      `;
    }

    return html`
      <div class="rollover-form">
        <!-- Rollover interface -->
      </div>
    `;
  }

  async authWithGoogle() {
    const params = new URLSearchParams({
      client_id: this.googleClientId,
      redirect_uri: `${window.location.origin}/widget/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state: this.generateState(),
      ...(this.userEmail && { login_hint: this.userEmail })  // Pre-fill email
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
}
```

## Security Considerations

### Trust Levels

```typescript
enum CustodianTrustLevel {
  FULL = 'full',        // Auto-create users, skip email verification
  VERIFIED = 'verified', // Auto-create users, require email verification
  BASIC = 'basic'       // Require full OAuth flow
}

// Configure per custodian
const custodianConfig = {
  'empower': {
    trustLevel: 'FULL',
    autoCreateUsers: true,
    skipEmailVerification: true,
    allowedAuthMethods: ['sso', 'google', 'email']
  },
  'hr-platform': {
    trustLevel: 'VERIFIED',
    autoCreateUsers: true,
    skipEmailVerification: false,
    allowedAuthMethods: ['google']
  },
  'rolloverconnect': {
    trustLevel: 'BASIC',
    autoCreateUsers: false,
    skipEmailVerification: false,
    allowedAuthMethods: ['google', 'email']
  }
};
```

## Best Practices

1. **Always validate the custodian first**
2. **Use silent auth when possible** to reduce friction
3. **Pre-populate email** to streamline OAuth
4. **Cache sessions** to avoid re-authentication
5. **Implement timeout** for silent auth attempts
6. **Fallback gracefully** to manual auth options
7. **Log all authentication attempts** for security

## Example: Complete Widget Implementation

```html
<!-- Custodian embeds widget with user context -->
<script>
  // Custodian can provide various levels of user info
  const widgetConfig = {
    partnerId: 'empower-123',
    apiKey: 'tr_live_sk_xxx',

    // Option 1: Just email (least friction)
    userEmail: '<?= $user->email ?>',

    // Option 2: Pre-authenticated token (no OAuth needed)
    userToken: '<?= generateTrustRailsToken($user) ?>',

    // Option 3: Full SSO (enterprise)
    ssoEndpoint: 'https://empower.com/sso/trustrails',

    // Styling to match custodian site
    theme: {
      primaryColor: '#003366',
      fontFamily: 'Arial, sans-serif'
    }
  };

  // Initialize widget
  const widget = new TrustRailsWidget(widgetConfig);
  widget.mount('#rollover-container');

  // Handle events
  widget.on('auth:required', () => {
    // User needs to authenticate
    console.log('User authentication required');
  });

  widget.on('auth:complete', (user) => {
    // User authenticated successfully
    console.log('User authenticated:', user.email);
  });

  widget.on('rollover:started', (data) => {
    // Rollover process initiated
    console.log('Rollover started:', data);
  });
</script>

<div id="rollover-container"></div>
```

## Summary

**For TrustRails, implement this priority:**

1. **Email hint with Google OAuth** (easiest, works everywhere)
2. **Session token from custodian** (for trusted partners)
3. **SAML/SSO** (only if enterprise customer demands it)

This gives users a smooth experience while maintaining security. The key is making authentication feel seamless since they're already on a trusted platform.