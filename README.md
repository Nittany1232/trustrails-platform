# TrustRails Platform - Embeddable Widget Monorepo

## Overview

This monorepo contains the embeddable TrustRails widget and supporting services for 401(k) rollovers.

## Architecture Decisions

Based on expert analysis:

1. **Monorepo Tool**: **Turborepo** - Superior performance for TypeScript, native Next.js support
2. **Widget Technology**: **Web Components (LitElement)** - Framework agnostic, <25KB bundle
3. **Authentication**: **Hybrid OAuth 2.0 + API Keys** - Tier-based security for different partners
4. **Data Pipeline**: **API Proxy First** → CSV Fallback → Historical Processing

## Quick Start

```bash
# Install dependencies
npm install

# Run widget demo
cd packages/rollover-widget
npm run dev

# In another terminal, run demo app
cd apps/widget-demo
npm run dev
```

## Project Structure

```
trustrails-platform/
├── apps/
│   ├── widget-demo/        # Demo site for testing widget
│   └── partner-dashboard/  # Partner configuration (TODO)
├── packages/
│   ├── rollover-widget/    # Web Component widget
│   └── api-client/         # TypeScript API client (TODO)
└── services/
    └── dol-processor/      # DOL data ingestion (TODO)
```

## Widget Integration

### Basic HTML
```html
<script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>

<trustrails-widget
  partner-id="your-partner-id"
  api-key="your-api-key"
  environment="production">
</trustrails-widget>
```

### React
```jsx
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.trustrails.com/widget/v1/trustrails-widget.js';
    document.head.appendChild(script);
  }, []);

  return (
    <trustrails-widget
      partner-id="your-partner-id"
      api-key="your-api-key"
      environment="production">
    </trustrails-widget>
  );
}
```

## Security

- **Tier 1 (Banks)**: OAuth 2.0 + mTLS, 15min tokens
- **Tier 2 (HR Platforms)**: API Keys + HMAC, 24hr tokens
- **All Partners**: Rate limiting, audit logging, SOC 2 compliance

## Development

```bash
# Build all packages
npm run build

# Run tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Next Steps

- [x] Monorepo setup with Turborepo
- [x] Basic Web Component widget
- [x] Demo application
- [ ] Partner dashboard
- [ ] DOL data ingestion pipeline
- [ ] API Gateway configuration
- [ ] Production deployment

## License

Proprietary - TrustRails Inc.