# TrustRails Platform - Coding Standards & Best Practices

*Version 1.0 - January 2025*

> **A Collaborative Agreement by the TrustRails Engineering Team**
>
> This document represents the consensus reached by our expert panel:
> - 🏗️ **Alex** - Cloud Architect (GCP/Microservices)
> - 🔐 **Sarah** - Security Advisor (Fintech Compliance)
> - ⚛️ **Marcus** - Frontend Engineer (Web Components/React)
> - 💻 **Elena** - Backend Engineer (Node.js/TypeScript)
> - 🚀 **David** - DevOps Engineer (CI/CD/Monitoring)
> - 🔍 **Rachel** - Principal Code Reviewer (Functional Programming)

---

## 1. Architecture & Design Patterns

### **Alex (Cloud Architect):**
"In a financial services platform, we need clear boundaries between services. No service should know the internal details of another."

### **Agreed Standards:**

#### 1.1 Microservices Boundaries
```typescript
// ✅ GOOD: Clear service boundaries
// packages/rollover-widget/src/api/client.ts
export class WidgetAPIClient {
  constructor(private readonly config: APIConfig) {}

  async authenticate(): Promise<AuthToken> {
    // Widget doesn't know HOW authentication works
    return this.post('/v1/widget/auth', {
      widget_version: VERSION
    });
  }
}

// ❌ BAD: Tight coupling
// Don't directly access other service's database
const user = await db.collection('users').doc(userId).get();
```

#### 1.2 Monorepo Package Structure
```
packages/
  rollover-widget/     # Independent, deployable
  shared-types/        # Shared contracts only
  api-client/          # Centralized API logic

services/
  dol-processor/       # Isolated business logic
  cache-service/       # Stateless, scalable
```

### **Rachel (Code Reviewer):**
"I insist on functional programming principles. Immutability prevents entire classes of bugs in financial calculations."

#### 1.3 Functional Programming Patterns
```typescript
// ✅ GOOD: Pure functions, immutable data
const calculateRolloverFee = (
  amount: Money,
  tier: PricingTier
): Money => ({
  ...amount,
  value: amount.value * tier.feePercentage
});

// ❌ BAD: Mutating state
function addFee(transfer) {
  transfer.amount += transfer.amount * 0.01; // NEVER mutate
  return transfer;
}
```

---

## 2. Security & Compliance Standards

### **Sarah (Security Advisor):**
"Every line of code handling financial data must assume it's under attack. Defense in depth is non-negotiable."

### **Agreed Standards:**

#### 2.1 Data Classification & Handling
```typescript
// All PII must be marked and encrypted
interface UserProfile {
  id: string;
  email: string;                    // PII_EMAIL
  ssn: EncryptedField<string>;     // PII_SSN - Always encrypted
  dateOfBirth: EncryptedField<Date>; // PII_DOB
  publicName: string;               // NON_PII
}

// Encryption helper
class EncryptedField<T> {
  constructor(
    private value: T,
    private classification: PIIClassification
  ) {}

  decrypt(auditContext: AuditContext): T {
    this.auditLog.recordAccess(auditContext);
    return this.kms.decrypt(this.value);
  }
}
```

#### 2.2 Authentication Tier System
```typescript
// Tier 1: Financial Institutions
const authenticateTier1 = async (
  request: Request
): Promise<AuthResult> => {
  // 1. Validate mTLS certificate
  const cert = await validateClientCertificate(request);

  // 2. Verify OAuth token
  const token = await verifyOAuthToken(request.headers.authorization);

  // 3. Check IP allowlist
  if (!isIPAllowed(request.ip, token.partnerId)) {
    throw new SecurityError('IP_NOT_ALLOWED');
  }

  // 4. Rate limiting
  await enforceRateLimit(token.partnerId, 'tier1');

  return { tier: 1, token, cert };
};
```

### **Elena (Backend Engineer):**
"But Sarah, we need to balance security with developer productivity. Not every internal service needs mTLS."

### **Sarah's Response:**
"Fair point. Let's define security levels:"

#### 2.3 Security Levels by Data Sensitivity
```typescript
enum SecurityLevel {
  PUBLIC = 0,      // Marketing content
  INTERNAL = 1,    // Internal metrics
  SENSITIVE = 2,   // User data, requires auth
  FINANCIAL = 3,   // Financial data, requires encryption
  CRITICAL = 4     // SSN, bank accounts, requires HSM
}

// Apply security based on level
@SecurityLevel(SecurityLevel.FINANCIAL)
class TransferService {
  @Encrypted
  @AuditLog
  async initiateTransfer(data: TransferRequest): Promise<Transfer> {
    // Automatic encryption and audit logging
  }
}
```

---

## 3. TypeScript & JavaScript Standards

### **Elena (Backend Engineer):**
"TypeScript's strict mode isn't optional. Every `any` is a potential runtime error in production."

### **Agreed Standards:**

#### 3.1 TypeScript Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

#### 3.2 Type Safety Patterns
```typescript
// ✅ GOOD: Exhaustive type checking
type TransferStatus = 'pending' | 'completed' | 'failed';

const handleStatus = (status: TransferStatus): string => {
  switch (status) {
    case 'pending':
      return 'Processing...';
    case 'completed':
      return 'Success!';
    case 'failed':
      return 'Error occurred';
    default:
      // This ensures all cases are handled
      const _exhaustive: never = status;
      return _exhaustive;
  }
};

// ✅ GOOD: Type guards
const isValidTransfer = (data: unknown): data is Transfer => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'amount' in data &&
    typeof (data as any).amount === 'number' &&
    (data as any).amount > 0
  );
};
```

### **Rachel (Code Reviewer):**
"And please, no classes unless absolutely necessary. Prefer composition over inheritance."

```typescript
// ✅ GOOD: Composition
const withRetry = <T>(
  fn: () => Promise<T>,
  retries = 3
): Promise<T> => {
  // Retry logic
};

const withCache = <T>(
  fn: () => Promise<T>,
  ttl: number
): Promise<T> => {
  // Cache logic
};

// Compose behaviors
const fetchUserData = withCache(
  withRetry(() => api.getUser(userId)),
  60000
);

// ❌ BAD: Inheritance hierarchy
class RetryableAPIClient extends APIClient {
  // Avoid deep inheritance chains
}
```

---

## 4. API Design & Documentation

### **Elena (Backend Engineer):**
"RESTful principles with clear versioning. Every endpoint must be idempotent where possible."

### **Agreed Standards:**

#### 4.1 API Structure
```typescript
// ✅ GOOD: Clear, versioned, RESTful
POST   /v1/transfers                 // Create transfer
GET    /v1/transfers/:id            // Get transfer
PATCH  /v1/transfers/:id            // Update transfer
GET    /v1/transfers?status=pending // List with filters

// ❌ BAD: Unclear, actions in URLs
GET    /getTransferData
POST   /doTransfer
GET    /transfer-list-pending
```

#### 4.2 Request/Response Standards
```typescript
// Standard error response
interface APIError {
  error: {
    code: string;           // Machine-readable
    message: string;        // Human-readable
    details?: unknown;      // Additional context
    requestId: string;      // For debugging
    timestamp: string;      // ISO 8601
  };
}

// Standard success response
interface APIResponse<T> {
  data: T;
  metadata: {
    requestId: string;
    timestamp: string;
    version: string;
  };
}

// Pagination
interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}
```

#### 4.3 Input Validation
```typescript
// Use Zod for runtime validation
import { z } from 'zod';

const TransferRequestSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.number().positive().max(1000000),
  currency: z.enum(['USD', 'EUR', 'GBP'])
});

// Controller
export const createTransfer = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const validated = TransferRequestSchema.parse(req.body);
    const transfer = await transferService.create(validated);
    res.json({ data: transfer });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors
        }
      });
    }
  }
};
```

---

## 5. Frontend Development Standards

### **Marcus (Frontend Engineer):**
"Web Components give us true encapsulation, but we need standards for consistency across widgets."

### **Agreed Standards:**

#### 5.1 Web Component Structure
```typescript
// ✅ GOOD: Standard LitElement pattern
@customElement('tr-rollover-widget')
export class RolloverWidget extends LitElement {
  // 1. Static properties first
  static styles = css`...`;

  // 2. Public properties (API)
  @property({ type: String }) partnerId = '';
  @property({ type: Object }) theme = {};

  // 3. Internal state
  @state() private loading = false;
  @state() private error: Error | null = null;

  // 4. Lifecycle methods in order
  connectedCallback() {
    super.connectedCallback();
    this.initialize();
  }

  // 5. Public methods
  async refresh(): Promise<void> {
    // ...
  }

  // 6. Private methods
  private async initialize(): Promise<void> {
    // ...
  }

  // 7. Render method last
  render() {
    return html`...`;
  }
}
```

#### 5.2 Accessibility Standards (WCAG 2.1 AA)
```typescript
// Every interactive element must be keyboard accessible
render() {
  return html`
    <button
      @click=${this.handleClick}
      @keydown=${this.handleKeydown}
      aria-label="Start rollover process"
      aria-busy=${this.loading}
      ?disabled=${this.loading}
    >
      ${this.loading ? 'Processing...' : 'Start Rollover'}
    </button>
  `;
}

private handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    this.handleClick();
  }
}
```

#### 5.3 Performance Standards
```typescript
// Bundle size limits
const PERFORMANCE_BUDGETS = {
  'rollover-widget': {
    js: 25 * 1024,        // 25KB max
    css: 10 * 1024,       // 10KB max
    total: 40 * 1024      // 40KB max gzipped
  }
};

// Lazy loading for non-critical features
const loadAdvancedFeatures = async () => {
  const { AdvancedChart } = await import('./components/AdvancedChart');
  return AdvancedChart;
};
```

---

## 6. Testing Requirements

### **David (DevOps Engineer):**
"Testing pyramid: lots of unit tests, some integration tests, few E2E tests. And everything must be automated."

### **Agreed Standards:**

#### 6.1 Test Coverage Requirements
```yaml
coverage_thresholds:
  statements: 80%
  branches: 75%
  functions: 80%
  lines: 80%

critical_paths:  # 100% coverage required
  - authentication
  - payment_processing
  - data_encryption
```

#### 6.2 Test Structure
```typescript
// ✅ GOOD: Descriptive, isolated tests
describe('TransferService', () => {
  describe('createTransfer', () => {
    it('should create a transfer with valid data', async () => {
      // Arrange
      const mockData = createMockTransferRequest();
      const service = new TransferService(mockRepo);

      // Act
      const result = await service.createTransfer(mockData);

      // Assert
      expect(result).toMatchObject({
        id: expect.any(String),
        status: 'pending',
        amount: mockData.amount
      });
    });

    it('should reject transfers exceeding daily limit', async () => {
      // Test the unhappy path
    });
  });
});
```

#### 6.3 E2E Test Standards
```typescript
// Playwright for E2E tests
test('complete rollover flow', async ({ page }) => {
  // Use data-testid for reliable selectors
  await page.goto('/rollover');
  await page.locator('[data-testid="start-rollover"]').click();
  await page.locator('[data-testid="account-input"]').fill('12345');

  // Assert critical business logic
  await expect(page.locator('[data-testid="fee-display"]'))
    .toContainText('$0.00');
});
```

---

## 7. Error Handling & Logging

### **Elena (Backend Engineer) and Sarah (Security Advisor) debate:**

**Elena:** "We need detailed error messages for debugging."

**Sarah:** "But not so detailed that they leak sensitive information!"

### **Consensus:**

#### 7.1 Error Handling Standards
```typescript
// Custom error classes with security in mind
export class TransferError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'TransferError';
  }

  toJSON() {
    // Never expose stack traces to clients
    if (process.env.NODE_ENV === 'production') {
      return {
        code: this.code,
        message: 'An error occurred processing your request'
      };
    }
    return {
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}
```

#### 7.2 Logging Standards
```typescript
// Structured logging with context
import { logger } from '@trustrails/logger';

// ✅ GOOD: Structured, searchable
logger.info('Transfer initiated', {
  transferId: transfer.id,
  userId: user.id,
  amount: transfer.amount,
  correlationId: context.correlationId,
  timestamp: new Date().toISOString()
});

// ❌ BAD: Unstructured, includes PII
console.log(`Transfer ${transfer.id} for user ${user.email}`);

// Security logging
logger.security('authentication_attempt', {
  partnerId: request.partnerId,
  success: false,
  reason: 'INVALID_CERTIFICATE',
  ip: request.ip,
  timestamp: new Date().toISOString()
});
```

---

## 8. Performance Standards

### **Alex (Cloud Architect) and Marcus (Frontend Engineer) agree:**
"Performance is a feature, especially for embedded widgets."

### **Agreed Standards:**

#### 8.1 Performance Budgets
```typescript
const PERFORMANCE_REQUIREMENTS = {
  api: {
    p50: 200,   // 50th percentile < 200ms
    p95: 500,   // 95th percentile < 500ms
    p99: 1000   // 99th percentile < 1s
  },
  widget: {
    initialLoad: 2000,      // 2s max
    interaction: 100,       // 100ms max response
    bundleSize: 25 * 1024   // 25KB gzipped
  }
};
```

#### 8.2 Optimization Patterns
```typescript
// ✅ GOOD: Memoization for expensive operations
const calculateComplexFee = memoize(
  (amount: number, tier: string): number => {
    // Expensive calculation
  },
  { maxAge: 60000 } // Cache for 1 minute
);

// ✅ GOOD: Pagination for large datasets
const getTransfers = async (
  page = 1,
  pageSize = 20
): Promise<PaginatedResponse<Transfer>> => {
  const offset = (page - 1) * pageSize;
  const transfers = await db.transfers
    .orderBy('createdAt', 'desc')
    .limit(pageSize)
    .offset(offset)
    .get();

  return {
    data: transfers,
    pagination: {
      page,
      pageSize,
      total: await db.transfers.count(),
      hasMore: transfers.length === pageSize
    }
  };
};
```

---

## 9. Code Review Process

### **Rachel (Principal Code Reviewer):**
"Every PR is an opportunity to improve our codebase. Reviews should be educational, not punitive."

### **Agreed Standards:**

#### 9.1 Pull Request Checklist
```markdown
## PR Checklist
- [ ] Tests pass locally and in CI
- [ ] Coverage meets or exceeds 80%
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Security scan passes
- [ ] Documentation updated
- [ ] Performance impact assessed
- [ ] Accessibility checked (if UI)
- [ ] Breaking changes documented
```

#### 9.2 Review Guidelines
```typescript
// Code review comments should be:
// 1. Constructive
// 2. Specific
// 3. Actionable

// ✅ GOOD comment:
"Consider extracting this logic into a pure function for easier testing.
Example:
```typescript
const calculateFee = (amount: number, rate: number) => amount * rate;
```"

// ❌ BAD comment:
"This code is messy"
```

#### 9.3 Approval Requirements
- **Regular changes**: 1 approval
- **Security-related**: 2 approvals (including security team member)
- **Architecture changes**: 2 approvals (including architect)
- **Breaking changes**: 3 approvals + documentation

---

## 10. Git Workflow & Commits

### **David (DevOps Engineer):**
"Consistent git history makes debugging production issues much easier."

### **Agreed Standards:**

#### 10.1 Branch Naming
```bash
feature/widget-authentication    # New features
fix/transfer-validation-error    # Bug fixes
refactor/api-client-structure    # Refactoring
docs/api-authentication          # Documentation
test/transfer-service            # Test additions
perf/widget-bundle-size          # Performance
security/sql-injection-fix       # Security fixes
```

#### 10.2 Commit Message Format
```bash
# Conventional Commits
type(scope): subject

body (optional)

footer (optional)

# Examples:
feat(widget): add OAuth 2.0 authentication
fix(api): validate transfer amount before processing
docs(security): update tier-based auth documentation
perf(widget): reduce bundle size by 15KB
security(api): patch SQL injection vulnerability
```

#### 10.3 Git Hooks (Enforced)
```json
// .husky/pre-commit
{
  "hooks": {
    "pre-commit": [
      "npm run typecheck",
      "npm run lint",
      "npm run test:affected"
    ],
    "commit-msg": "commitlint -e"
  }
}
```

---

## Enforcement & Tooling

### **Consensus from All Experts:**

These standards are enforced through:

1. **ESLint Configuration** - Catches style and quality issues
2. **TypeScript Strict Mode** - Prevents type errors
3. **Prettier** - Consistent formatting
4. **Husky + lint-staged** - Pre-commit validation
5. **CI/CD Pipeline** - Automated testing and validation
6. **SonarQube** - Code quality and security scanning
7. **Bundle Size Action** - Performance budget enforcement
8. **Dependabot** - Dependency security updates

---

## Living Document

### **Rachel (Principal Code Reviewer):**
"Standards should evolve with our understanding. What we agree on today might change tomorrow, and that's okay."

### **Update Process:**
1. Propose changes via RFC (Request for Comments)
2. Team discussion in architecture review meeting
3. Trial period for significant changes
4. Update documentation after consensus
5. Communicate changes in team channels

---

## Quick Reference Card

```typescript
// The TrustRails Way™
✅ Functional > Object-Oriented
✅ Composition > Inheritance
✅ Immutable > Mutable
✅ Pure > Side Effects
✅ Types > Any
✅ Explicit > Implicit
✅ Simple > Clever
✅ Secure > Convenient
✅ Tested > "It works on my machine"
✅ Documented > Self-documenting
```

---

*"Code is written once but read many times. Optimize for the reader, not the writer."*
— The TrustRails Engineering Team

*Last Updated: January 2025*
*Version: 1.0.0*