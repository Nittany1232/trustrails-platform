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

## 🚀 Development Environment Setup

### Prerequisites
Ensure you have the Firebase admin credentials at:
```
/home/stock1232/projects/trustrails/credentials/firebase-admin.json
```

### Complete Development Stack Startup

**After terminal restart, use this single script to start all services:**

```bash
# 1. Start Development Proxy (runs on port 8091)
cd /home/stock1232/projects/trustrails-platform/packages/dev-proxy
npm run build && npm start &

# 2. Start Plan Search API (auto-detected by proxy)
cd /home/stock1232/projects/trustrails-platform/services/plan-search-api/standalone-search
GOOGLE_APPLICATION_CREDENTIALS=/home/stock1232/projects/trustrails/credentials/firebase-admin.json npm run dev &

# 3. Start Widget Demo (runs on port 3001)
cd /home/stock1232/projects/trustrails-platform/apps/widget-demo
npm run dev &

# 4. Start TrustRails App with Auth Service (runs on port 3002)
cd /home/stock1232/projects/trustrails
SKIP_RATE_LIMIT=true PORT=3002 npm run dev &

# 5. Access everything through the proxy
echo "🚀 All services started!"
echo "📱 Widget Demo: http://localhost:3001"
echo "🔍 API Proxy: http://localhost:8091"
echo "🔐 Auth Service: http://localhost:3002"
```

### Service Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Widget Demo   │    │   Dev Proxy      │    │  TrustRails App │
│   Port 3001     │◄──►│   Port 8091      │◄──►│   Port 3002     │
└─────────────────┘    │                  │    │  (Auth Service) │
                       │  Routes to:      │    └─────────────────┘
                       │  - Plan Search   │              ▲
                       │  - Auth APIs     │              │
                       │  - Widget APIs   │              │
                       └──────────────────┘              │
                                │                         │
                                ▼                         │
                       ┌─────────────────┐                │
                       │ Plan Search API │                │
                       │ (Dynamic Port)  │────────────────┘
                       └─────────────────┘
```

### ⚠️ Widget Authentication Service

**Current Location**: The widget authentication endpoints are currently part of the main TrustRails app at `/home/stock1232/projects/trustrails/`
- Auth endpoint: `/app/api/widget/auth/route.ts`
- Account creation: `/app/api/widget/create-account/route.ts`

**Future Architecture**: Widget auth should be extracted as a separate microservice in `services/widget-auth-service/` for better separation of concerns, scalability, and security isolation. See architecture recommendations below.

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

## 🤖 Claude Specialized Agents

**Location**: `/home/stock1232/projects/trustrails-platform/.claude/agents/`

We have 10 specialized Claude agents configured for different development tasks:

### Available Agents

1. **backend-fintech-nodejs** - Principal Backend Engineer for Node.js/TypeScript FinTech development
2. **blockchain-ethereum-custody** - Blockchain Engineer specializing in Ethereum and digital asset custody
3. **cloud-architect-gcp** - GCP Cloud Architect for distributed systems and infrastructure
4. **devops-fintech-automation** - DevOps Engineer for FinTech automation and CI/CD
5. **dol-data-processing-specialist** - DOL Data Processing Specialist for retirement plan data
6. **fiduciary-aware-retirement-strategist** - Financial Professional specializing in ERISA compliance
7. **frontend-react-fintech-viz** - Frontend Engineer for React and financial data visualization
8. **principal-code-reviewer-typescript** - Principal Code Reviewer for TypeScript quality assurance
9. **security-advisor-fintech-cloud** - Security Advisor for FinTech cloud infrastructure
10. **ux-design-behavioral-finance** - UX Designer specializing in behavioral finance

### Using Agents

**In Claude Code**: Agents are automatically available via the Task tool. Simply describe your task and Claude will select the appropriate specialized agent.

**Manual Configuration**: Agents are defined in `.claude/settings.local.json` and can be updated using:
```bash
cd /home/stock1232/projects/trustrails-platform
python3 update-agents.py
```

**Examples**:
- "Use the security agent to review this authentication flow"
- "Have the DOL data specialist optimize this BigQuery query"
- "Use the cloud architect to design this microservice deployment"

## 📞 Support

For questions about:
- **Monorepo structure**: Review Turborepo docs
- **Widget development**: Check LitElement docs
- **Authentication**: Use the `security-advisor-fintech-cloud` agent
- **Data pipeline**: Use the `dol-data-processing-specialist` agent
- **Cloud Architecture**: Use the `cloud-architect-gcp` agent

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