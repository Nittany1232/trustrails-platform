# Physical Separation Architecture for Enterprise Clients

## What is Physical Separation?

**Physical separation** means completely isolated infrastructure:
- Separate databases
- Separate servers/compute
- Separate authentication systems
- Separate networks (VPCs)
- Sometimes even separate AWS/GCP accounts

## How Stripe & Visa Actually Work

### Stripe's Architecture
Stripe does **NOT** use physical separation for most customers. They use:

```
┌─────────────────────────────────────────────────┐
│            Stripe Multi-Tenant Platform          │
├─────────────────────────────────────────────────┤
│                 Shared Infrastructure            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │Customer A│  │Customer B│  │Customer C│      │
│  └──────────┘  └──────────┘  └──────────┘     │
│       ↓              ↓              ↓           │
│  ┌────────────────────────────────────────┐    │
│  │     Logical Isolation (Same DB)         │    │
│  │  - Row-level security                   │    │
│  │  - Encryption per customer              │    │
│  │  - API key scoping                      │    │
│  └────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘

EXCEPT for:
┌─────────────────────────────────────────────────┐
│         Stripe Enterprise (Custom)               │
├─────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐      │
│  │   JPMorgan       │  │    Shopify       │      │
│  │  (Dedicated)     │  │   (Dedicated)    │      │
│  └─────────────────┘  └─────────────────┘      │
└─────────────────────────────────────────────────┘
```

### Visa's Architecture
Visa uses **Network Segmentation** (not full physical separation):

```
┌─────────────────────────────────────────────────┐
│              Visa Network                        │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐      ┌─────────────┐          │
│  │  Issuing    │      │  Acquiring  │          │
│  │   Banks     │      │    Banks    │          │
│  └──────┬──────┘      └──────┬──────┘          │
│         ↓                     ↓                  │
│  ┌────────────────────────────────────────┐    │
│  │         VisaNet Core Network            │    │
│  │    (Shared Processing Platform)         │    │
│  └────────────────────────────────────────┘    │
│         ↓                     ↓                  │
│  ┌──────────────┐      ┌──────────────┐        │
│  │   Region 1    │      │   Region 2    │        │
│  │  (US/Canada)  │      │   (Europe)     │        │
│  └──────────────┘      └──────────────┘        │
└─────────────────────────────────────────────────┘
```

## Implementation Options for TrustRails

### Option 1: Logical Separation (Current - Recommended)
**Cost: $0 additional**

```typescript
// Single Firebase project, logical isolation
const userQuery = db.collection('users')
  .where('custodianId', '==', currentUser.custodianId);  // Logical isolation
```

### Option 2: Database-Level Separation
**Cost: +$500-1,000/month per customer**

```typescript
// Different Firestore databases in same project
const databases = {
  'default': defaultDb,           // Regular customers
  'empower': empowerDb,           // Dedicated database
  'fidelity': fidelityDb,         // Dedicated database
};

const db = databases[customer.tier] || defaultDb;
```

### Option 3: Project-Level Separation
**Cost: +$2,000-5,000/month per customer**

```yaml
# Different GCP projects
projects:
  trustrails-main:        # Shared platform
    - firestore
    - cloud-functions
    - auth

  trustrails-empower:     # Dedicated for Empower
    - firestore-dedicated
    - cloud-functions
    - auth-separate

  trustrails-fidelity:    # Dedicated for Fidelity
    - firestore-dedicated
    - cloud-functions
    - auth-separate
```

### Option 4: Full Physical Separation
**Cost: +$10,000-25,000/month per customer**

```yaml
# Completely separate infrastructure
Customer: Empower
  AWS Account: 123456789
  Region: us-east-1
  VPC: vpc-empower-prod
  Database: RDS PostgreSQL (dedicated)
  Auth: AWS Cognito (separate)
  Compute: EKS Cluster (dedicated)
  Network: Direct Connect to Empower

Customer: Fidelity
  GCP Project: fidelity-trustrails-prod
  Region: us-central1
  VPC: fidelity-isolated-vpc
  Database: Cloud SQL (dedicated)
  Auth: Identity Platform (separate)
  Compute: GKE Cluster (dedicated)
  Network: Private Service Connect
```

## How to Implement Physical Separation

### Architecture Pattern: Multi-Tenant with Isolated Tenants

```typescript
// Route requests to correct infrastructure
export class TenantRouter {
  private configs = {
    // Shared customers
    'default': {
      type: 'shared',
      projectId: 'trustrails-prod',
      authDomain: 'trustrails.firebaseapp.com',
      database: 'default'
    },

    // Enterprise customer with physical separation
    'empower': {
      type: 'dedicated',
      projectId: 'trustrails-empower-prod',
      authDomain: 'empower.trustrails-private.com',
      database: 'empower-dedicated',
      vpc: 'empower-isolated-vpc',
      privateEndpoint: '10.0.0.1'
    }
  };

  async routeRequest(custodianId: string, request: Request) {
    const config = await this.getCustomerConfig(custodianId);

    if (config.type === 'dedicated') {
      // Route to dedicated infrastructure
      return this.routeToDedicated(config, request);
    } else {
      // Use shared infrastructure
      return this.routeToShared(config, request);
    }
  }
}
```

### Database Isolation Patterns

#### Pattern 1: Schema Isolation (PostgreSQL)
```sql
-- Each customer gets their own schema
CREATE SCHEMA empower_prod;
CREATE SCHEMA fidelity_prod;

-- Set search path per connection
SET search_path TO empower_prod;
```

#### Pattern 2: Database Isolation (MongoDB/Firestore)
```javascript
// Separate databases per customer
const connections = {
  'empower': mongoose.createConnection('mongodb://empower-db:27017/empower'),
  'fidelity': mongoose.createConnection('mongodb://fidelity-db:27017/fidelity'),
  'shared': mongoose.createConnection('mongodb://shared-db:27017/trustrails')
};
```

#### Pattern 3: Cluster Isolation (Kubernetes)
```yaml
# Separate namespaces with network policies
apiVersion: v1
kind: Namespace
metadata:
  name: empower-prod
  labels:
    tenant: empower
    isolation: physical
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: empower-isolation
  namespace: empower-prod
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          tenant: empower
```

## Cost Comparison

| Approach | Monthly Cost | Setup Time | Maintenance |
|----------|-------------|------------|-------------|
| Logical Separation (Current) | $0 | 0 days | Low |
| Database Separation | $500-1K per customer | 1 week | Medium |
| Project Separation | $2-5K per customer | 2-4 weeks | High |
| Full Physical Separation | $10-25K per customer | 1-2 months | Very High |

## When Physical Separation is Actually Required

### Regulatory Requirements
- **EU Data Residency**: Data must stay in EU
- **China Operations**: Data cannot leave China
- **Government Contracts**: FedRAMP requires isolation

### Contractual Requirements
- **Fortune 500**: Sometimes demand dedicated infrastructure
- **Banks**: May require separate environments
- **Healthcare**: PHI isolation requirements

### Technical Requirements
- **Performance**: Dedicated resources needed
- **Custom Features**: Customer-specific code
- **Network**: Direct private connections required

## Implementation Strategy for TrustRails

### Phase 1: Start with Logical Separation (Current)
```typescript
// All customers in same infrastructure
{
  'rolloverconnect': { tier: 'standard', isolation: 'logical' },
  'empower': { tier: 'standard', isolation: 'logical' },
  'smallCustodian': { tier: 'standard', isolation: 'logical' }
}
```

### Phase 2: Offer Premium Tier with Database Separation
```typescript
// When customer pays for premium
{
  'empower': {
    tier: 'premium',
    isolation: 'database',
    dedicatedDb: 'firestore-empower',
    monthlyCost: 2000
  }
}
```

### Phase 3: Enterprise with Full Separation (If Needed)
```typescript
// Only for largest customers
{
  'jpmorgan': {
    tier: 'enterprise',
    isolation: 'physical',
    infrastructure: {
      cloud: 'AWS',
      region: 'us-east-1',
      vpc: 'dedicated',
      database: 'RDS PostgreSQL',
      auth: 'Cognito'
    },
    monthlyCost: 25000
  }
}
```

## Security Considerations

### Logical Separation Security
- ✅ Row-level security
- ✅ API key scoping
- ✅ Encrypted at rest per customer
- ✅ Audit logging per tenant
- ⚠️ Shared compute resources
- ⚠️ Noisy neighbor risk

### Physical Separation Security
- ✅ Complete isolation
- ✅ No data commingling
- ✅ Independent security policies
- ✅ Dedicated encryption keys
- ✅ Separate network segments
- ⚠️ Higher complexity
- ⚠️ More attack surface to manage

## Recommendation for TrustRails

**Stay with Logical Separation unless:**

1. **Customer pays premium** ($10K+/month)
2. **Regulatory requirement** (data residency)
3. **Contractual obligation** (Fortune 500 demand)
4. **Scale justifies it** (>$1M ARR from customer)

**Why:**
- Stripe processes $800B/year with logical separation
- Twilio serves enterprises with logical separation
- Auth0 uses logical separation for 99% of customers
- Physical separation adds complexity without proportional security benefit

## Migration Path (If Ever Needed)

```typescript
class TenantMigration {
  async migrateToPhysicalSeparation(custodianId: string) {
    // 1. Provision dedicated infrastructure
    const infra = await this.provisionDedicatedInfra(custodianId);

    // 2. Replicate data
    await this.replicateData(custodianId, infra);

    // 3. Switch DNS/routing
    await this.updateRouting(custodianId, infra);

    // 4. Validate
    await this.validateMigration(custodianId);

    // 5. Cleanup old data
    await this.cleanupSharedData(custodianId);
  }
}
```

This can be done without changing your application architecture if designed properly from the start.