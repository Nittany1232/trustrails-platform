# TrustRails Widget - User Email Handling Guide

## 🎯 Overview

The TrustRails widget now supports automatic user email handling, eliminating the need for partners to manually manage user tokens and sessions. When a `user-email` attribute is provided, the widget automatically:

1. **Authenticates** with the TrustRails API using partner credentials
2. **Creates/retrieves** a user account for the provided email
3. **Stores** the user session in sessionStorage for persistence
4. **Validates** stored sessions across page refreshes
5. **Handles** email changes dynamically

## 🚀 Quick Start

### Basic Usage (No User Email)
```html
<script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>

<trustrails-widget
  partner-id="your-partner-id"
  api-key="your-api-key"
  environment="production">
</trustrails-widget>
```

### Recommended Usage (With User Email)
```html
<script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>

<trustrails-widget
  partner-id="your-partner-id"
  api-key="your-api-key"
  user-email="user@example.com"
  environment="production">
</trustrails-widget>
```

## 📋 Complete API Reference

### HTML Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `partner-id` | string | ✅ | Your TrustRails partner identifier |
| `api-key` | string | ✅ | Your TrustRails API key |
| `user-email` | string | ❌ | User's email address for automatic session management |
| `user-id` | string | ❌ | Legacy: User ID if you already have it |
| `environment` | string | ❌ | `"sandbox"` or `"production"` (default: `"sandbox"`) |

### JavaScript Methods

#### User Session Management
```javascript
const widget = document.querySelector('trustrails-widget');

// Check if user session is ready
const isReady = widget.isUserReady(); // boolean

// Get user information
const userId = widget.getUserId(); // string | null
const userEmail = widget.getUserEmail(); // string | null
const userSession = widget.getUserSession(); // object | null

// Refresh user session (useful for debugging)
await widget.refreshUserSession(); // Promise<void>
```

#### API Calls
```javascript
// Make authenticated API calls with automatic user context
const response = await widget.makeAPICall('/api/user/plans', {
  method: 'GET'
});

// Legacy account creation (deprecated)
const result = await widget.createAccount('email', {
  email: 'user@example.com'
});
```

### Events

#### User Session Events
```javascript
// User session is ready
widget.addEventListener('trustrails-user-ready', (event) => {
  console.log('User session established:', event.detail);
  // event.detail contains:
  // - userId: string
  // - email: string
  // - isNewUser: boolean
  // - userSession: object
});

// Rollover process started
widget.addEventListener('trustrails-start', (event) => {
  console.log('Rollover started:', event.detail);
  // event.detail contains:
  // - partnerId: string
  // - sessionId: string
  // - userId: string | null
  // - userEmail: string | null
});

// Legacy account creation event
widget.addEventListener('trustrails-account-created', (event) => {
  console.log('Account created:', event.detail);
});
```

## 🔄 User Session Lifecycle

### 1. Widget Initialization
```
User provides user-email → Widget authenticates → Creates/retrieves user → Stores session
```

### 2. Page Refresh
```
Widget loads → Checks stored tokens → Validates session → Restores user state
```

### 3. Email Change
```
Email attribute changes → Clears old session → Creates new session → Updates storage
```

### 4. Session Validation
```
Check email match → Check partner match → Check token expiry → Clear if invalid
```

## 🛠️ Framework Integration Examples

### React
```jsx
import React, { useEffect, useRef, useState } from 'react';

function TrustRailsWidget({ userEmail, partnerId, apiKey }) {
  const widgetRef = useRef();
  const [userReady, setUserReady] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Load widget script
    const script = document.createElement('script');
    script.src = 'https://cdn.trustrails.com/widget/v1/trustrails-widget.js';
    document.head.appendChild(script);

    // Set up event listeners
    const handleUserReady = (event) => {
      setUserReady(true);
      setUserId(event.detail.userId);
    };

    if (widgetRef.current) {
      widgetRef.current.addEventListener('trustrails-user-ready', handleUserReady);
    }

    return () => {
      if (widgetRef.current) {
        widgetRef.current.removeEventListener('trustrails-user-ready', handleUserReady);
      }
    };
  }, []);

  return (
    <div>
      {userReady && <p>User session ready for: {userEmail} (ID: {userId})</p>}
      <trustrails-widget
        ref={widgetRef}
        partner-id={partnerId}
        api-key={apiKey}
        user-email={userEmail}
        environment="production"
      />
    </div>
  );
}
```

### Vue.js
```vue
<template>
  <div>
    <p v-if="userReady">User session ready for: {{ userEmail }} (ID: {{ userId }})</p>
    <trustrails-widget
      :partner-id="partnerId"
      :api-key="apiKey"
      :user-email="userEmail"
      environment="production"
      @trustrails-user-ready="handleUserReady"
    />
  </div>
</template>

<script>
export default {
  props: ['userEmail', 'partnerId', 'apiKey'],
  data() {
    return {
      userReady: false,
      userId: null
    };
  },
  mounted() {
    // Load widget script
    const script = document.createElement('script');
    script.src = 'https://cdn.trustrails.com/widget/v1/trustrails-widget.js';
    document.head.appendChild(script);
  },
  methods: {
    handleUserReady(event) {
      this.userReady = true;
      this.userId = event.detail.userId;
    }
  }
};
</script>
```

### Angular
```typescript
import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-trustrails-widget',
  template: `
    <div>
      <p *ngIf="userReady">User session ready for: {{ userEmail }} (ID: {{ userId }})</p>
      <trustrails-widget
        [attr.partner-id]="partnerId"
        [attr.api-key]="apiKey"
        [attr.user-email]="userEmail"
        environment="production"
        (trustrails-user-ready)="handleUserReady($event)"
      ></trustrails-widget>
    </div>
  `
})
export class TrustRailsWidgetComponent implements OnInit {
  @Input() userEmail: string;
  @Input() partnerId: string;
  @Input() apiKey: string;

  userReady = false;
  userId: string | null = null;

  ngOnInit() {
    // Load widget script
    const script = document.createElement('script');
    script.src = 'https://cdn.trustrails.com/widget/v1/trustrails-widget.js';
    document.head.appendChild(script);
  }

  handleUserReady(event: CustomEvent) {
    this.userReady = true;
    this.userId = event.detail.userId;
  }
}
```

## 🔐 Security & Best Practices

### Session Storage
- User sessions are stored in `sessionStorage` for security
- Sessions are automatically cleared when browser tab is closed
- Sessions are validated against current email and partner ID

### Error Handling
```javascript
widget.addEventListener('error', (event) => {
  console.error('Widget error:', event.detail);
  // Handle authentication failures, network errors, etc.
});
```

### Email Validation
- The widget validates email format before making API calls
- Invalid emails will trigger an error event
- Email changes are handled gracefully with session updates

### Token Management
- Bearer tokens are automatically refreshed
- Expired tokens trigger re-authentication
- Partner credentials are validated on every request

## 🐛 Debugging & Troubleshooting

### Debug Mode
```javascript
// Enable verbose logging (development only)
widget.addEventListener('trustrails-user-ready', (event) => {
  console.log('Full user session:', event.detail.userSession);
});
```

### Common Issues

#### User Session Not Created
```javascript
// Check if email is provided
console.log('User email:', widget.userEmail);

// Check authentication status
console.log('Is authenticated:', widget.isAuthenticated);

// Force session refresh
await widget.refreshUserSession();
```

#### Session Storage Issues
```javascript
// Check stored sessions
console.log('Bearer token:', sessionStorage.getItem('trustrails_bearer_token'));
console.log('Session ID:', sessionStorage.getItem('trustrails_session_id'));
console.log('User session:', sessionStorage.getItem('trustrails_user_session'));

// Clear all sessions
sessionStorage.removeItem('trustrails_bearer_token');
sessionStorage.removeItem('trustrails_session_id');
sessionStorage.removeItem('trustrails_user_session');
```

### API Testing
Use the demo files to test the implementation:
- `/apps/widget-demo/user-email-demo.html` - Interactive user email testing
- `/apps/widget-demo/index.html` - Basic widget functionality

## 🚀 Migration Guide

### From Manual Token Management
```javascript
// OLD WAY (deprecated)
const widget = document.querySelector('trustrails-widget');
await widget.createAccount('email', { email: 'user@example.com' });

// NEW WAY (recommended)
// Just add user-email attribute to HTML
<trustrails-widget user-email="user@example.com" ... />
```

### Event Handling Updates
```javascript
// Update event listeners to use new events
widget.addEventListener('trustrails-user-ready', (event) => {
  // Replaces trustrails-account-created for email flows
  const { userId, email, isNewUser } = event.detail;
});
```

## 📝 Changelog

### v1.1.0 - User Email Support
- ✅ Added `user-email` attribute for automatic user session management
- ✅ Implemented session persistence with sessionStorage
- ✅ Added session validation and recovery
- ✅ Added dynamic email change handling
- ✅ Added comprehensive event system
- ✅ Added public API methods for user session access
- ✅ Maintained backward compatibility with existing API

---

For additional support and examples, see the demo files in `/apps/widget-demo/`.