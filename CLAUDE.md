# TrustRails Platform - Monorepo Documentation

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run all apps in development
npm run dev

# Build all packages
npm run build

# Run tests
npm run test
```

## 📦 Monorepo Structure

```
trustrails-platform/
├── apps/                     # Applications
│   ├── widget-demo/         # Demo site for testing widget
│   └── trustrails/         # Main TrustRails app (to be migrated, includes admin/partners)
├── packages/                # Shared packages
│   ├── rollover-widget/    # Embeddable Web Component widget
│   ├── api-client/         # TypeScript API client (TODO)
│   ├── shared-types/       # Shared TypeScript types (TODO)
│   └── ui-components/      # Shared UI components (TODO)
├── services/               # Microservices
│   ├── api-gateway/       # GCP API Gateway config (TODO)
│   ├── dol-processor/     # DOL data ingestion service (TODO)
│   └── cache-service/     # Redis/BigQuery cache (TODO)
└── turbo.json             # Turborepo configuration
```

## 🔧 Technology Stack

- **Monorepo Tool**: Turborepo (chosen for performance and Next.js compatibility)
- **Widget Technology**: Web Components with LitElement
- **API Gateway**: GCP API Gateway + Firebase Cloud Functions
- **Authentication**: OAuth 2.0 for Tier 1, API Keys for Tier 2
- **Data Pipeline**: DOL API → Document AI → BigQuery → Firestore

## 🎯 Widget Development

### What are Web Components?

Web Components are a set of web platform APIs that allow you to create custom, reusable HTML elements. They consist of:

1. **Custom Elements**: Define new HTML tags
2. **Shadow DOM**: Encapsulated styling and markup
3. **HTML Templates**: Reusable HTML chunks
4. **ES Modules**: Standard JavaScript module system

### Why Web Components for Our Widget?

- **Framework Agnostic**: Works with React, Vue, Angular, WordPress, vanilla HTML
- **Encapsulation**: CSS and JavaScript won't conflict with host page
- **Small Bundle**: <25KB gzipped (vs 100KB+ for React)
- **Native Browser Support**: No polyfills needed for modern browsers
- **Security**: Shadow DOM provides natural isolation

### Widget Usage

```html
<!-- Basic HTML integration -->
<script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>

<trustrails-widget
  partner-id="your-partner-id"
  api-key="your-api-key"
  environment="production">
</trustrails-widget>
```

### Widget Development Commands

```bash
# Navigate to widget package
cd packages/rollover-widget

# Run development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck

# Run tests
npm run test
```

## 🔐 Authentication Architecture

### Tier 1: Financial Institutions (Banks, Custodians)
- **Method**: OAuth 2.0 Client Credentials + mTLS
- **Token TTL**: 15 minutes
- **Requirements**: SOC 2 Type II, PCI DSS Level 1
- **Rate Limit**: 1000 req/min

### Tier 2: HR Platforms
- **Method**: API Keys with HMAC signing
- **Token TTL**: 24 hours
- **Requirements**: SOC 2 Type I
- **Rate Limit**: 500 req/min

## 📊 Data Ingestion Strategy

### Phase 1: API Proxy (MVP - $1,500)
- Real-time DOL EFAST API integration
- Cloud Functions for processing
- Firestore for widget queries

### Phase 2: CSV Fallback ($2,000)
- Batch processing of DOL CSV files
- Document AI for PDF extraction
- BigQuery for analytics

### Phase 3: Historical Processing ($3,000)
- Bulk historical data import
- AI enhancement with Vertex AI
- Predictive caching

## 🚦 Development Workflow

### Adding a New Feature

1. **Create feature branch**
```bash
git checkout -b feature/your-feature
```

2. **Develop in appropriate package/app**
```bash
cd packages/your-package
npm run dev
```

3. **Test across monorepo**
```bash
npm run test
```

4. **Build all affected packages**
```bash
npm run build
```

5. **Deploy (when ready)**
```bash
npm run deploy
```

## 🛠️ Common Tasks

### Create a New Package
```bash
mkdir packages/new-package
cd packages/new-package
npm init -y
# Update package.json with workspace conventions
```

### Link Packages Locally
```json
// In consuming package's package.json
{
  "dependencies": {
    "@trustrails/shared-types": "workspace:*"
  }
}
```

### Run Specific App
```bash
npm run dev --workspace=@trustrails/widget-demo
```

### Build Specific Package
```bash
npm run build --workspace=@trustrails/rollover-widget
```

## 📝 Environment Variables

Create `.env.local` in root:
```env
# API Configuration
API_URL=https://sandbox-api.trustrails.com
FIREBASE_PROJECT_ID=trustrails-faa3e

# GCP Services
GCP_PROJECT_ID=trustrails-platform
DOCUMENT_AI_PROCESSOR_ID=your-processor-id

# Authentication
PLATFORM_WALLET_PRIVATE_KEY=0x...
```

## 🧪 Testing Strategy

### Unit Tests
- Each package has its own test suite
- Run with `npm test` in package directory

### Integration Tests
- Test inter-package communication
- Located in `/tests/integration`

### E2E Tests
- Test complete user flows
- Located in `/tests/e2e`

## 📚 Key Documentation

- **Architecture Decisions**: See agent recommendations above
- **Security Requirements**: OAuth 2.0 + API Keys hybrid
- **Widget Integration**: `/apps/widget-demo/index.html`
- **API Documentation**: (TODO) `/docs/api`

## 🚨 Important Notes

1. **DO NOT** commit API keys or private keys
2. **ALWAYS** run `npm run typecheck` before committing
3. **USE** workspace protocol for internal dependencies
4. **FOLLOW** the authentication tier system
5. **TEST** widget in demo app before deployment

## 📞 Support

For questions about:
- **Monorepo structure**: Review Turborepo docs
- **Widget development**: Check LitElement docs
- **Authentication**: See security agent recommendations
- **Data pipeline**: Review architecture agent design

## 🎯 Next Steps

1. ✅ Monorepo structure created
2. ✅ Basic widget implemented
3. ✅ Demo app created
4. ⏳ Partner management in admin UI (TODO - see docs/PARTNER_DASHBOARD_INTEGRATION_PLAN.md)
5. ⏳ DOL data ingestion (TODO)
6. ⏳ API Gateway setup (TODO)
7. ⏳ Production deployment (TODO)

---

*Last updated: January 2025*