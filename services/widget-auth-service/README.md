# TrustRails Widget Authentication Service

A standalone Next.js microservice extracted from the main TrustRails application to handle widget authentication endpoints.

## Overview

This service provides authentication and user management functionality for the TrustRails embeddable widget. It includes:

- **Widget Authentication** (`/api/widget/auth`) - Bearer token authentication using public API keys
- **Custodian Browsing** (`/api/widget/custodians`) - Public custodian information for widget display
- **User Account Creation** (`/api/widget/create-account`) - OAuth and email/password signup for widget users

## Architecture

### Extracted from Main App

This service was extracted from `/home/stock1232/projects/trustrails/app/api/widget/` to create a dedicated microservice that:

1. **Preserves all existing functionality** including rate limiting and audit logging
2. **Maintains security patterns** from the main application
3. **Uses the same Firebase backend** as the main app
4. **Follows SOC2 compliance** requirements with proper audit logging

### Key Dependencies

- **Firebase Admin SDK** - Database operations and user management
- **Google Cloud Logging** - SOC2 compliant audit event storage
- **JWT** - Bearer token generation and verification
- **Multi-layer Rate Limiting** - Advanced protection against abuse
- **Secure IP Detection** - Protection against spoofing attacks

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Access to the TrustRails Firebase project
- Google Cloud service account credentials

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Firebase credentials
```

### Firebase Setup

1. **Service Account Credentials**: Place your Firebase service account JSON file at:
   ```
   ./credentials/firebase-admin.json
   ```

2. **Environment Variables**: Update `.env.local` with your Firebase configuration:
   ```env
   FIREBASE_PROJECT_ID=trustrails-faa3e
   FIREBASE_CLIENT_EMAIL=your-service-account@trustrails-faa3e.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

### Development

```bash
# Start development server
npm run dev

# The service will be available at http://localhost:3003
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## API Endpoints

### POST /api/widget/auth

Authenticates a widget using a public API key and returns a bearer token.

**Headers:**
- `X-TrustRails-API-Key`: Public API key (tr_live_pk_... or tr_test_pk_...)
- `X-TrustRails-Partner-ID`: Custodian/partner ID

**Request Body:**
```json
{
  "widget_version": "1.0.0",
  "user_token": "optional_returning_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "session_id": "ws_...",
  "bearer_token": "tr_bearer_...",
  "expires_at": "2024-01-01T12:00:00Z",
  "environment": "production",
  "custodian": {
    "id": "partner_id",
    "name": "Partner Name",
    "logo_url": "https://..."
  },
  "widget_config": {
    "theme": { ... },
    "features": { ... }
  }
}
```

### GET /api/widget/custodians

Returns public information about available custodians for transfers.

**Headers:**
- `Authorization`: Bearer token from authentication

**Query Parameters:**
- `type`: Filter by 'source' or 'destination' (optional)
- `search`: Search by custodian name (optional)

**Response:**
```json
{
  "success": true,
  "custodians": [...],
  "host_custodian": { ... },
  "total_count": 50,
  "filters_applied": {
    "type": "source",
    "search": "fidelity"
  }
}
```

### POST /api/widget/create-account

Creates or retrieves a user account for widget users.

**Headers:**
- `Authorization`: Bearer token from authentication

**Request Body:**
```json
{
  "auth_type": "email" | "oauth",
  "email": "user@example.com",
  "password": "password123", // Required for email auth
  "oauth_token": "...", // Required for OAuth
  "provider": "google", // Required for OAuth
  "profile": { ... }, // Optional OAuth profile data
  "source_custodian_id": "optional",
  "destination_custodian_id": "optional",
  "transfer_amount": 50000 // Optional, in cents
}
```

## Security Features

### Rate Limiting

Multiple layers of rate limiting protect against abuse:

- **Global IP limits**: 100 requests per hour per IP
- **Partner limits**: 500 requests per hour per partner
- **User creation limits**: 50 users per day per partner
- **Email limits**: 3 attempts per day per email
- **Session limits**: 10 attempts per 5 minutes per session

### Authentication

- **API Key Validation**: Cryptographic validation of public API keys
- **Bearer Token Security**: JWT tokens with session validation
- **IP Spoofing Protection**: Secure IP detection with trusted proxy support

### Audit Logging

All security events are logged for SOC2 compliance:

- **Authentication events** (success/failure)
- **User creation events**
- **Security violations**
- **Rate limit exceeded events**
- **System errors**

Events are stored in Google Cloud Logging for production and Firestore for development.

## Data Storage

### Firestore Collections

- `custodians` - Partner/custodian information with API keys
- `widget_sessions` - Active widget user sessions
- `users` - Widget user accounts and profiles
- `widget_auth_audit_events` - Audit events (development fallback)

### Session Management

Widget sessions are stored in Firestore with:
- 24-hour expiration
- Automatic cleanup of expired sessions
- Last activity tracking
- IP address and user agent logging

## Environment Variables

### Required

- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_CLIENT_EMAIL` - Service account email
- `FIREBASE_PRIVATE_KEY` - Service account private key
- `WIDGET_JWT_SECRET` - JWT signing secret

### Optional

- `FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON
- `TRUSTED_PROXIES` - Comma-separated list of trusted proxy IPs
- `NODE_ENV` - Environment (development/production)

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3003
CMD ["npm", "start"]
```

### Cloud Run / Container Platforms

The service is designed to run as a stateless container:

- **Port**: 3003 (configurable)
- **Health Check**: `/api/health` (implement if needed)
- **Graceful Shutdown**: Handles SIGTERM signals
- **Logging**: JSON structured logs for container environments

## Monitoring

### Health Checks

Implement health check endpoints:

```typescript
// src/app/api/health/route.ts
export async function GET() {
  // Check Firebase connectivity
  // Check rate limiter status
  // Return 200 OK or 503 Service Unavailable
}
```

### Metrics

Monitor key metrics:

- **Request rate** per endpoint
- **Error rate** by status code
- **Rate limit** hit rates
- **Session creation** rate
- **Authentication success/failure** rates

## Security Considerations

### Production Checklist

- [ ] Update `WIDGET_JWT_SECRET` to a strong, unique value
- [ ] Configure proper `TRUSTED_PROXIES` for your infrastructure
- [ ] Set up Google Cloud Logging for audit events
- [ ] Implement health check endpoints
- [ ] Configure proper CORS policies
- [ ] Set up monitoring and alerting
- [ ] Review rate limiting thresholds
- [ ] Ensure HTTPS termination at load balancer

### Firebase Security

- [ ] Service account has minimal required permissions
- [ ] Firestore security rules properly configured
- [ ] API keys are properly stored and hashed
- [ ] Regular security audits of Firebase access

## Troubleshooting

### Common Issues

1. **Firebase Connection Errors**
   - Check service account credentials
   - Verify project ID matches
   - Ensure proper permissions

2. **Rate Limiting Issues**
   - Review rate limit configurations
   - Check IP detection settings
   - Monitor rate limit metrics

3. **Token Verification Failures**
   - Verify JWT secret configuration
   - Check session expiration settings
   - Review Firebase connectivity

### Debugging

Enable debug logging:

```env
DEBUG=widget-auth:*
NODE_ENV=development
```

## Migration from Main App

This service was extracted from the main TrustRails application. Key migration considerations:

1. **Same Firebase Backend**: Uses the exact same Firestore collections and data structure
2. **Preserved Functionality**: All existing widget auth features are maintained
3. **Audit Compliance**: SOC2 audit logging is preserved with service-specific log names
4. **Rate Limiting**: Same multi-layer protection as the main app
5. **Security**: All security patterns and protections are maintained

## Contributing

Follow the established patterns from the main TrustRails application:

- **Error Handling**: Comprehensive error logging and user-friendly messages
- **Audit Logging**: Log all security-relevant events
- **Rate Limiting**: Apply appropriate rate limits to new endpoints
- **Testing**: Include unit and integration tests
- **Documentation**: Update this README for any new features

## License

Private - TrustRails Platform