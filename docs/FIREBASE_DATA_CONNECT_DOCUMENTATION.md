# TrustRails Firebase Collections and Data Connect Tables Documentation

This document provides a comprehensive overview of all Firebase Firestore collections and Data Connect tables used in the TrustRails 401(k) to IRA rollover platform.

## Table of Contents
1. [Firebase Firestore Collections](#firebase-firestore-collections)
2. [Data Connect Tables](#data-connect-tables)
3. [ETL Process Mappings](#etl-process-mappings)
4. [Collection Relationships](#collection-relationships)
5. [Known Issues and Gotchas](#known-issues-and-gotchas)
6. [Type Definitions](#type-definitions)

---

## Firebase Firestore Collections

Firebase Firestore serves as the primary real-time database for the TrustRails platform, storing event-driven data, user sessions, and operational state.

### 1. `events` Collection
**Purpose**: Immutable event store for audit trail and business logic (SOC 2 compliance)
**Key Concept**: Single source of truth - all transfer data derived from events

**Document Structure**:
```typescript
{
  eventId: string,           // Unique event identifier (UUID)
  eventType: string,         // Type of event (validated against allowlist)
  rolloverId: string,        // Links to rollover transaction
  timestamp: Timestamp,      // When event occurred
  userId: string,            // User who triggered event
  custodianId?: string,      // Associated custodian (optional)
  ipAddress: string,         // Source IP for audit
  sessionId: string,         // User session identifier
  correlationId: string,     // Links related events
  data: object,              // Event-specific data (encrypted if sensitive)
  metadata: {
    source: 'ui' | 'api' | 'webhook' | 'system',
    version: string,
    retryCount: number,
    originalEventId?: string  // For retry events
  },
  audit: {
    immutable: true,
    storedAt: Timestamp,
    eventHash: string,        // Cryptographic integrity hash
    complianceVersion: string
  }
}
```

**Valid Event Types** (from types.ts):
- `rollover.started`
- `rollover.acknowledged` 
- `rollover.documents_submitted`
- `rollover.documents_approved`
- `rollover.financial_verified`
- `blockchain.sender_ready`
- `blockchain.receiver_ready`
- `blockchain.executed`
- `blockchain.v5.agreement`
- `blockchain.v5.financial` 
- `blockchain.v5.executed`
- `blockchain.v5.minted`
- `blockchain.v5.burned`
- `settlement.funds_sent`
- `settlement.funds_received`
- `rollover.completed`
- `rollover.failed`

**Indexes**: 
- `rolloverId` (for event replay)
- `eventType` (for monitoring)
- `timestamp` (chronological ordering)
- `userId` (audit queries)

### 2. `rollover_states` Collection
**Purpose**: Computed rollover state cache (recomputable from events)

**Document Structure**:
```typescript
{
  rolloverId: string,
  currentState: string,      // Current business state
  displayName: string,       // Human-readable state name
  description: string,       // State description
  canRetry: boolean,        // Whether failed operations can be retried
  nextAction?: object,      // Next required action
  estimatedCompletion?: Timestamp,
  lastUpdated: Timestamp,
  eventCount: number        // Number of events processed
}
```

### 3. `custodians` Collection
**Purpose**: Financial institution master data

**Document Structure**:
```typescript
{
  id: string,                // UUID
  name: string,              // Institution name
  type: 'custodian' | 'recordkeeper' | 'advisor-platform',
  status: 'pending' | 'verified' | 'active' | 'suspended',
  
  // Business Information
  taxId?: string,            // Encrypted EIN
  secRegistration?: string,  // SEC registration number
  website?: string,
  
  // Address Information
  registeredAddress: {
    line1: string,
    line2?: string,
    city: string,
    state: string,
    zip: string,
    country: string
  },
  
  // Settlement Configuration
  settlementType: 'check' | 'ach' | 'trustrails',
  productPlan: 'standard' | 'accelerated' | 'direct',
  walletPreference: 'platform' | 'byow',
  
  // Blockchain Configuration
  walletAddress?: string,
  walletCreatedByPlatform: boolean,
  level: 1 | 2 | 3,         // 1=basic, 2=blockchain, 3=tokenization
  
  // Status flags
  isActive: boolean,         // Admin controlled
  isVerified: boolean,       // Admin controlled
  documentsApproved: boolean,
  
  // Timestamps
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 4. `users` Collection
**Purpose**: User accounts and authentication data

**Document Structure**:
```typescript
{
  id: string,                // Firebase Auth UID
  email: string,
  profile: {
    firstName: string,
    lastName: string,
    phone?: string,
    dateOfBirth?: Timestamp,
    ssn?: string             // Encrypted
  },
  role: 'admin' | 'custodian_user' | 'rollover_user',
  custodianId?: string,      // Link to custodian for custodian_users
  permissions: string[],
  status: 'active' | 'suspended' | 'pending_verification',
  kycStatus: 'pending' | 'verified' | 'rejected' | 'expired',
  complianceFlags: {
    amlPassed: boolean,
    sanctionsCheck: boolean,
    riskScore: number,
    lastChecked: Timestamp
  },
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastLoginAt?: Timestamp,
  metadata: {
    ipAddress?: string,
    userAgent?: string,
    registrationSource: string
  }
}
```

### 5. `transfers` Collection
**Purpose**: Computed transfer records for analytics (generated from events)

**Document Structure**:
```typescript
{
  id: string,                // Same as rolloverId for correlation
  transferNumber: string,    // Human-readable identifier
  initiatedBy: string,       // User ID
  sourceCustodian: {
    id: string,
    name: string,
    accountNumber: string,
    accountType: string,
    routingNumber?: string
  },
  destinationCustodian: {
    id: string,
    name: string,
    accountNumber?: string,
    accountType: string,
    routingNumber?: string
  },
  financial: {
    amount: number,          // Amount in cents
    grossAmount: number,     // Amount in cents  
    netAmount: number,       // Amount in cents
    currency: 'USD',
    fees: {
      processing: number,
      blockchain: number,
      custodian: number
    },
    taxWithholding: {
      federal: number,
      state: number
    }
  },
  status: 'completed' | 'pending' | 'failed',
  assetType: string,
  direction: 'inbound' | 'outbound',
  priority: 'low' | 'normal' | 'high' | 'urgent',
  createdAt: Timestamp,
  updatedAt: Timestamp,
  completedAt?: Timestamp,
  settlement: {
    method: string,
    trackingNumber?: string
  },
  blockchain: {
    network: string,
    status: string,
    transactionHashes: Record<string, string>,
    gasUsed: number,
    blockNumber?: number,
    transactionHash?: string
  },
  compliance: {
    amlStatus: 'pending' | 'cleared' | 'flagged',
    riskScore: number,
    sanctionsCheck: boolean,
    fraudCheck: boolean,
    manualReviewRequired: boolean
  },
  workflow: {
    currentStage: string,
    stages: Record<string, {
      completed: boolean,
      completedAt?: Timestamp
    }>
  },
  metadata: {
    source: string,
    rolloverId: string,      // Link back to event-driven rollover
    eventCount: number,
    tags: string[]
  },
  audit: {
    createdFromEvents: boolean,
    eventCount: number,
    sourceSystem: string,
    complianceVersion: string,
    regulatoryCompliant: boolean,
    auditTrail: string,
    lastVerified: Timestamp
  }
}
```

### 6. `config` Collection
**Purpose**: System configuration and settings

**Document Structure**:
```typescript
{
  id: string,                // Config identifier
  category: string,          // 'blockchain', 'limits', 'compliance'
  config: object,            // Configuration data
  updatedBy: string,
  updatedAt: Timestamp,
  version: number
}
```

### 7. `custodianAuditLogs` Collection
**Purpose**: SOC 2 compliance audit trail for custodian operations

**Document Structure**:
```typescript
{
  id: string,                // UUID
  custodianId: string,
  action: string,
  performedBy: string,       // User ID
  timestamp: Timestamp,
  ipAddress: string,
  userAgent: string,
  details: string            // JSON stringified details
}
```

### 8. `custodianInvitations` Collection
**Purpose**: User invitations for custodian access

**Document Structure**:
```typescript
{
  id: string,                // UUID
  custodianId: string,
  email: string,
  status: 'pending' | 'accepted' | 'expired',
  createdBy: string,         // Admin user ID
  createdAt: Timestamp,
  expiresAt: Timestamp
}
```

### 9. `analytics` Collection
**Purpose**: System analytics and events

**Document Structure**:
```typescript
{
  eventType: string,
  data: object,
  metadata: {
    source: string,
    version: string
  },
  timestamp: Timestamp
}
```

### 10. ETL Processing Collections

#### `etl_processed`
**Purpose**: Track which rollovers have been processed by ETL

**Document Structure**:
```typescript
{
  rolloverId: string,        // Document ID
  processedAt: Timestamp,
  eventCount: number,
  status: 'success' | 'failed',
  retryCount: number
}
```

#### `etl_failures`
**Purpose**: Track ETL processing failures for retry

**Document Structure**:
```typescript
{
  rolloverId: string,
  failedAt: Timestamp,
  errorMessage: string,
  errorStack: string,
  retryCount: number,
  lastRetryAt?: Timestamp
}
```

#### `user_etl_processed` / `user_etl_failures`
**Purpose**: Track user data ETL processing

#### `custodian_etl_processed` / `custodian_etl_failures`  
**Purpose**: Track custodian data ETL processing

---

## Data Connect Tables

Firebase Data Connect provides structured, relational data access with GraphQL queries backed by Cloud SQL PostgreSQL.

### Core Schema Structure

All tables follow the schema defined in `/dataconnect/schema/schema.gql`.

### 1. `User` Table
**Purpose**: User accounts synced from Firebase Auth

**Schema**:
```sql
CREATE TABLE users (
  id VARCHAR(100) PRIMARY KEY,              -- Firebase Auth UID
  email VARCHAR(100) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL,                -- admin, custodian_user, rollover_user
  custodian_id VARCHAR(100),
  status VARCHAR(20) NOT NULL,              -- active, suspended, pending_verification
  kyc_status VARCHAR(20) NOT NULL,          -- pending, verified, rejected, expired
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Compliance fields
  aml_passed BOOLEAN NOT NULL DEFAULT FALSE,
  sanctions_check BOOLEAN NOT NULL DEFAULT FALSE,
  risk_score FLOAT DEFAULT 0.0,
  
  FOREIGN KEY (custodian_id) REFERENCES custodians(id)
);
```

### 2. `Custodian` Table
**Purpose**: Financial institutions managing retirement accounts

**Schema**:
```sql
CREATE TABLE custodians (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL,                -- custodian, recordkeeper, advisor-platform
  status VARCHAR(20) NOT NULL,              -- pending, verified, active, suspended
  
  -- Business Information
  tax_id VARCHAR(20),
  sec_registration VARCHAR(50),
  website VARCHAR(100),
  
  -- Address Information
  address_line1 VARCHAR(100) NOT NULL,
  address_line2 VARCHAR(100),
  city VARCHAR(50) NOT NULL,
  state VARCHAR(20) NOT NULL,
  zip_code VARCHAR(10) NOT NULL,
  country VARCHAR(50) NOT NULL,
  
  -- Settlement Configuration
  settlement_type VARCHAR(20) NOT NULL,     -- check, ach, trustrails
  product_plan VARCHAR(20) NOT NULL,        -- standard, accelerated, direct
  wallet_preference VARCHAR(20) NOT NULL,   -- platform, byow
  
  -- Blockchain Configuration
  wallet_address VARCHAR(100),
  wallet_created_by_platform BOOLEAN NOT NULL DEFAULT FALSE,
  level INTEGER NOT NULL DEFAULT 1,         -- 1=basic, 2=blockchain, 3=tokenization
  
  -- Status flags
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  documents_approved BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 3. `RetirementPlan` Table
**Purpose**: Detailed employer plan information

**Schema**:
```sql
CREATE TABLE retirement_plans (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  custodian_id VARCHAR(100) NOT NULL,
  plan_id VARCHAR(50) NOT NULL,             -- Plan identifier
  plan_number VARCHAR(50),                  -- Plan number
  plan_name VARCHAR(100) NOT NULL,
  
  -- Employer Information
  employer_name VARCHAR(100) NOT NULL,
  employer_tax_id VARCHAR(20),
  
  -- Plan Type and Configuration
  plan_type VARCHAR(30) NOT NULL,           -- 401k, 403b, 457, profit_sharing
  allows_loans BOOLEAN NOT NULL DEFAULT FALSE,
  allows_hardship_withdrawals BOOLEAN NOT NULL DEFAULT FALSE,
  allows_in_service_distributions BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Vesting Information
  vesting_schedule_type VARCHAR(20),        -- immediate, graded, cliff
  vesting_years INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (custodian_id) REFERENCES custodians(id)
);
```

### 4. `Account` Table
**Purpose**: Individual retirement accounts with enhanced details

**Schema**:
```sql
CREATE TABLE accounts (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id VARCHAR(100) NOT NULL,
  account_role VARCHAR(20) NOT NULL,        -- source, destination
  
  -- Account Identification
  custodian_id VARCHAR(100) NOT NULL,
  account_number VARCHAR(50) NOT NULL,      -- May be masked
  account_number_masked VARCHAR(50),        -- Display version
  
  -- Account Type Details
  account_type VARCHAR(30) NOT NULL,        -- traditional_ira, roth_ira, 401k, 403b, etc.
  registration_type VARCHAR(20) NOT NULL,   -- individual, joint, trust
  
  -- Plan Association (for employer plans)
  plan_id VARCHAR(100),
  
  -- Owner Information
  owner_name VARCHAR(100) NOT NULL,         -- May be encrypted
  owner_ssn VARCHAR(20),                    -- Encrypted
  
  -- Employment Details (for employer plans)
  current_employer_name VARCHAR(100),
  years_employed INTEGER,
  employment_status VARCHAR(20),            -- active, terminated, retired
  
  -- Vesting Information
  total_vested_percentage FLOAT DEFAULT 100.0,  -- Percentage (0-100)
  unvested_amount INTEGER DEFAULT 0,        -- in cents
  treat_unvested_as_traditional BOOLEAN DEFAULT TRUE,
  
  -- Outstanding Loans
  outstanding_loan_balance INTEGER DEFAULT 0,    -- in cents
  number_of_active_loans INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (transfer_id) REFERENCES transfers(id),
  FOREIGN KEY (custodian_id) REFERENCES custodians(id),
  FOREIGN KEY (plan_id) REFERENCES retirement_plans(id)
);
```

### 5. `Transfer` Table
**Purpose**: Core transaction records with enhanced account relationships

**Schema**:
```sql
CREATE TABLE transfers (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number VARCHAR(50) NOT NULL,
  rollover_id VARCHAR(100) NOT NULL,       -- Links to event-driven rollover
  initiated_by VARCHAR(100) NOT NULL,      -- User ID
  
  -- Custodian References
  source_custodian_id VARCHAR(100) NOT NULL,
  destination_custodian_id VARCHAR(100) NOT NULL,
  
  -- Financial Summary (amounts in cents)
  gross_amount INTEGER NOT NULL,           -- Total transfer amount
  net_amount INTEGER NOT NULL,             -- Amount after taxes and fees
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  tax_year INTEGER NOT NULL,               -- Tax year for reporting
  
  -- Tax Withholding (in cents)
  federal_tax_withheld INTEGER DEFAULT 0,
  state_tax_withheld INTEGER DEFAULT 0,
  
  -- Fee Summary (in cents)
  total_processing_fees INTEGER DEFAULT 0,
  total_blockchain_fees INTEGER DEFAULT 0,
  total_custodian_fees INTEGER DEFAULT 0,
  
  -- Transfer Type and Configuration
  transfer_type VARCHAR(30) NOT NULL,      -- direct_rollover, indirect_rollover, trustee_to_trustee
  settlement_method VARCHAR(20) NOT NULL,  -- ach, wire, check, tokens
  has_mixed_contributions BOOLEAN NOT NULL, -- Traditional + Roth split
  requires_split_destination BOOLEAN NOT NULL, -- Different accounts for traditional/roth
  
  -- Status and Workflow
  status VARCHAR(20) NOT NULL,             -- pending, in_progress, minted, burned, completed, failed, cancelled
  current_stage VARCHAR(30) NOT NULL,      -- initiation, preparation, execution, settlement, completed
  
  -- Blockchain Information
  blockchain_transaction_hash VARCHAR(100),
  contract_state INTEGER DEFAULT 0,        -- V5/V6 contract state (0-8)
  
  -- Compliance and Risk
  aml_status VARCHAR(20) NOT NULL,
  risk_score FLOAT DEFAULT 0.0,
  requires_spousal_approval BOOLEAN DEFAULT FALSE,
  
  -- Performance Metrics
  initiated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  processing_time_hours FLOAT,             -- Calculated field
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (initiated_by) REFERENCES users(id),
  FOREIGN KEY (source_custodian_id) REFERENCES custodians(id),
  FOREIGN KEY (destination_custodian_id) REFERENCES custodians(id)
);
```

### 6. `FinancialBreakdown` Table
**Purpose**: Detailed contribution type breakdown matching V5/V6 contracts

**Schema**:
```sql
CREATE TABLE financial_breakdowns (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id VARCHAR(100) NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  breakdown_type VARCHAR(20) NOT NULL,     -- source_total, destination_split
  
  -- Core Financial Amounts (in cents) - matching V5/V6 FundSourceBreakdown
  employee_pre_tax_amount INTEGER NOT NULL DEFAULT 0,    -- Employee traditional 401k contributions
  employer_match_amount INTEGER NOT NULL DEFAULT 0,      -- Company matching contributions
  roth_amount INTEGER NOT NULL DEFAULT 0,                -- Roth (after-tax) employee contributions
  after_tax_amount INTEGER NOT NULL DEFAULT 0,           -- Additional after-tax non-Roth contributions
  
  -- Calculated Totals
  total_pre_tax_amount INTEGER NOT NULL DEFAULT 0,       -- employeePreTax + employerMatch
  total_after_tax_amount INTEGER NOT NULL DEFAULT 0,     -- roth + afterTax
  gross_amount INTEGER NOT NULL DEFAULT 0,               -- Sum of all above
  
  -- Earnings Breakdown
  pre_tax_earnings INTEGER DEFAULT 0,      -- Earnings on pre-tax contributions
  roth_earnings INTEGER DEFAULT 0,         -- Earnings on Roth contributions
  after_tax_earnings INTEGER DEFAULT 0,    -- Earnings on after-tax contributions
  total_earnings INTEGER DEFAULT 0,        -- Sum of all earnings
  
  -- Vesting Information
  vested_amount INTEGER NOT NULL DEFAULT 0,    -- Total vested amount
  unvested_amount INTEGER DEFAULT 0,           -- Forfeited employer contributions
  vesting_percentage FLOAT DEFAULT 100.0,      -- Percentage vested (0-100)
  
  -- Tax Year and Contribution Period
  tax_year INTEGER NOT NULL,               -- Primary tax year
  contribution_start_date DATE,            -- When contributions began
  contribution_end_date DATE,              -- When contributions ended
  
  -- Destination Routing (for split transfers)
  destination_account_id VARCHAR(100),     -- Target account for this breakdown
  routing_instructions TEXT,               -- JSON routing details
  
  -- Status
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,  -- Financial verification complete
  verified_by VARCHAR(100),                -- User who verified
  verified_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (transfer_id) REFERENCES transfers(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (destination_account_id) REFERENCES accounts(id)
);
```

### 7. `Event` Table
**Purpose**: Immutable event store for audit trail and business logic

**Schema**:
```sql
CREATE TABLE events (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(100) NOT NULL UNIQUE,
  event_type VARCHAR(50) NOT NULL,
  rollover_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  custodian_id VARCHAR(100),
  
  -- Event Data (JSON)
  event_data TEXT NOT NULL,                -- JSON stringified data
  
  -- Blockchain Information
  blockchain_tx_hash VARCHAR(100),
  block_number INTEGER,
  gas_used VARCHAR(50),
  
  -- Metadata
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  source VARCHAR(30) NOT NULL,             -- api, blockchain, webhook, system
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (custodian_id) REFERENCES custodians(id)
);
```

### 8. `AnalyticsTimeSeries` Table
**Purpose**: Pre-aggregated time series analytics data with contribution breakdowns

**Schema**:
```sql
CREATE TABLE analytics_time_series (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  custodian_id VARCHAR(100) NOT NULL,
  granularity VARCHAR(10) NOT NULL,        -- daily, weekly, monthly
  period VARCHAR(20) NOT NULL,             -- YYYY-MM-DD or YYYY-WW format
  
  -- Transfer Metrics
  inbound_count INTEGER NOT NULL DEFAULT 0,
  inbound_volume INTEGER NOT NULL DEFAULT 0,        -- in cents
  outbound_count INTEGER NOT NULL DEFAULT 0,
  outbound_volume INTEGER NOT NULL DEFAULT 0,       -- in cents
  total_count INTEGER NOT NULL DEFAULT 0,
  total_volume INTEGER NOT NULL DEFAULT 0,          -- in cents
  net_volume INTEGER NOT NULL DEFAULT 0,            -- inbound - outbound
  
  -- Contribution Type Breakdowns (in cents)
  total_pre_tax_volume INTEGER NOT NULL DEFAULT 0,  -- Employee + Employer pre-tax
  total_roth_volume INTEGER NOT NULL DEFAULT 0,     -- Roth contributions
  total_after_tax_volume INTEGER NOT NULL DEFAULT 0, -- Non-Roth after-tax
  employer_match_volume INTEGER NOT NULL DEFAULT 0,  -- Employer matching only
  
  -- Account Type Distribution
  traditional_ira_count INTEGER NOT NULL DEFAULT 0,
  roth_ira_count INTEGER NOT NULL DEFAULT 0,
  plan_401k_count INTEGER NOT NULL DEFAULT 0,
  plan_403b_count INTEGER NOT NULL DEFAULT 0,
  sep_ira_count INTEGER NOT NULL DEFAULT 0,
  simple_ira_count INTEGER NOT NULL DEFAULT 0,
  
  -- Status Breakdown
  pending_count INTEGER NOT NULL DEFAULT 0,
  in_progress_count INTEGER NOT NULL DEFAULT 0,
  minted_count INTEGER NOT NULL DEFAULT 0,
  burned_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  cancelled_count INTEGER NOT NULL DEFAULT 0,
  
  -- Performance Metrics
  average_completion_time_hours FLOAT DEFAULT 0.0,
  success_rate FLOAT DEFAULT 0.0,          -- Percentage (0-100)
  average_transfer_amount INTEGER DEFAULT 0, -- in cents
  
  -- Mixed Transfer Analytics
  mixed_transfer_count INTEGER NOT NULL DEFAULT 0,      -- Transfers with both traditional and Roth
  split_destination_count INTEGER NOT NULL DEFAULT 0,   -- Transfers requiring multiple destination accounts
  
  -- Blockchain Metrics
  minted_tokens INTEGER NOT NULL DEFAULT 0,  -- TRUSD tokens minted
  burned_tokens INTEGER NOT NULL DEFAULT 0,  -- TRUSD tokens burned
  total_gas_used VARCHAR(50),
  average_gas_cost VARCHAR(50),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (custodian_id) REFERENCES custodians(id)
);
```

### 9. `TaxForm` Table
**Purpose**: Tax forms for regulatory compliance with enhanced contribution details

**Schema**:
```sql
CREATE TABLE tax_forms (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id VARCHAR(100) NOT NULL,
  custodian_id VARCHAR(100) NOT NULL,
  form_type VARCHAR(10) NOT NULL,          -- 1099R, 5498
  tax_year INTEGER NOT NULL,
  
  -- Payer/Trustee Information
  payer_name VARCHAR(100) NOT NULL,
  payer_tin VARCHAR(20) NOT NULL,
  
  -- Recipient Information
  recipient_name VARCHAR(100) NOT NULL,
  recipient_tin VARCHAR(20) NOT NULL,
  recipient_address VARCHAR(200) NOT NULL,
  
  -- Form 1099-R specific fields (in cents)
  box1_gross_distribution INTEGER DEFAULT 0,
  box2a_taxable_amount INTEGER DEFAULT 0,
  box2b_taxable_amount_not_determined BOOLEAN DEFAULT FALSE,
  box4_federal_tax_withheld INTEGER DEFAULT 0,
  box5_employee_contributions INTEGER DEFAULT 0,
  box6_net_unrealized_appreciation INTEGER DEFAULT 0,
  box7_distribution_code VARCHAR(10),      -- IRS distribution codes
  box8_other_percent FLOAT DEFAULT 0.0,
  box9a_your_percent_of_total FLOAT DEFAULT 0.0,
  box9b_total_employee_contributions INTEGER DEFAULT 0,
  
  -- Form 5498 specific fields (in cents)
  box1_ira_contributions INTEGER DEFAULT 0,
  box2_rollover_contributions INTEGER DEFAULT 0,
  box3_roth_ira_conversion_amount INTEGER DEFAULT 0,
  box4_recharacterized_contributions INTEGER DEFAULT 0,
  box5_fair_market_value INTEGER DEFAULT 0,
  box6_life_insurance_cost INTEGER DEFAULT 0,
  box7_ira_contributions_plus_50 INTEGER DEFAULT 0,
  box8_sep_contributions INTEGER DEFAULT 0,
  box9_simple_contributions INTEGER DEFAULT 0,
  box10_roth_ira_contributions INTEGER DEFAULT 0,
  box11_required_minimum_distribution INTEGER DEFAULT 0,
  box12a_postponed_contribution INTEGER DEFAULT 0,
  box12b_year INTEGER,
  box13a_postponed_contribution INTEGER DEFAULT 0,
  box13b_year INTEGER,
  box14a_repayments INTEGER DEFAULT 0,
  box14b_code VARCHAR(10),
  
  -- Account Information
  account_number VARCHAR(50) NOT NULL,
  account_type VARCHAR(20) NOT NULL,       -- IRA, SEP, SIMPLE, ROTH_IRA
  
  -- Enhanced Distribution Codes and Special Situations
  is_direct_rollover BOOLEAN DEFAULT FALSE,
  is_trustee_to_trustee BOOLEAN DEFAULT FALSE,
  has_employer_stock BOOLEAN DEFAULT FALSE,
  has_unrealized_appreciation BOOLEAN DEFAULT FALSE,
  
  -- Status and Filing
  status VARCHAR(20) NOT NULL,             -- draft, filed, corrected, voided
  filed_date DATE,
  corrected_form_id VARCHAR(100),          -- Links to original if correction
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (transfer_id) REFERENCES transfers(id),
  FOREIGN KEY (custodian_id) REFERENCES custodians(id),
  FOREIGN KEY (corrected_form_id) REFERENCES tax_forms(id)
);
```

### 10. `AuditLog` Table
**Purpose**: Audit logs for compliance and security

**Schema**:
```sql
CREATE TABLE audit_logs (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource VARCHAR(50) NOT NULL,
  resource_id VARCHAR(100),
  
  -- Request Information
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  
  -- Audit Details
  details TEXT,                            -- JSON stringified details
  outcome VARCHAR(20) NOT NULL,            -- success, failure, blocked
  
  -- Timestamps
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 11. `BlockchainTransaction` Table
**Purpose**: Blockchain transaction records

**Schema**:
```sql
CREATE TABLE blockchain_transactions (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_hash VARCHAR(100) NOT NULL UNIQUE,
  rollover_id VARCHAR(100) NOT NULL,
  contract_address VARCHAR(100) NOT NULL,
  
  -- Transaction Details
  from_address VARCHAR(100) NOT NULL,
  to_address VARCHAR(100) NOT NULL,
  value VARCHAR(50) NOT NULL,              -- Wei amount as string
  gas_used VARCHAR(50) NOT NULL,
  gas_price VARCHAR(50) NOT NULL,
  
  -- Contract State
  contract_state INTEGER NOT NULL DEFAULT 0,  -- 0-8 for V5/V6 contracts
  event_type VARCHAR(30) NOT NULL,        -- agreement, financial, executed, minted, burned
  
  -- Financial Breakdown on Blockchain (BigInt amounts as strings)
  employee_pre_tax_amount_wei VARCHAR(100),
  employer_match_amount_wei VARCHAR(100),
  roth_amount_wei VARCHAR(100),
  after_tax_amount_wei VARCHAR(100),
  gross_amount_wei VARCHAR(100),
  
  -- Status
  status VARCHAR(20) NOT NULL,             -- pending, confirmed, failed
  block_number INTEGER,
  confirmations INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMP
);
```

### 12. `TokenOperation` Table
**Purpose**: TRUSD token operations for Level 3 custodians

**Schema**:
```sql
CREATE TABLE token_operations (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  rollover_id VARCHAR(100) NOT NULL,
  operation_type VARCHAR(10) NOT NULL,     -- mint, burn
  token_address VARCHAR(100) NOT NULL,
  
  -- Token Details
  amount VARCHAR(50) NOT NULL,             -- Token amount as string (18 decimals)
  recipient VARCHAR(100) NOT NULL,
  
  -- Financial Breakdown for Token Operations
  tokenized_pre_tax_amount VARCHAR(50),
  tokenized_roth_amount VARCHAR(50),
  tokenized_employer_match_amount VARCHAR(50),
  
  -- Transaction Information
  transaction_hash VARCHAR(100) NOT NULL,
  block_number INTEGER,
  gas_used VARCHAR(50),
  
  -- Status
  status VARCHAR(20) NOT NULL,             -- pending, confirmed, failed
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMP
);
```

---

## ETL Process Mappings

The ETL (Extract, Transform, Load) process synchronizes data between Firebase Firestore and Data Connect tables.

### ETL Architecture

1. **Firestore Extractor** (`/etl/functions/src/extractors/firestore-extractor.ts`)
   - Extracts data from Firebase collections
   - Handles event ordering and data integrity
   - Supports batch processing

2. **Rollover Transformer** (`/etl/functions/src/transformers/rollover-transformer.ts`)
   - Transforms event-driven data to relational format
   - Computes derived fields and aggregations
   - Handles data normalization

3. **Data Connect Loader** (`/etl/functions/src/loaders/dataconnect-loader.ts`)
   - Loads transformed data to Data Connect tables
   - Handles upserts and conflict resolution
   - Maintains referential integrity

### ETL Triggers

ETL processing is triggered by:
1. **Event Completion**: When `rollover.completed` event is stored
2. **Manual Trigger**: Admin-initiated processing
3. **Scheduled Sync**: Periodic reconciliation jobs
4. **User/Custodian Updates**: Profile changes trigger ETL

### Collection → Table Mappings

| Firebase Collection | Data Connect Table(s) | ETL Process |
|---------------------|------------------------|-------------|
| `events` | `events` | Direct copy with data validation |
| `events` (rollover.started) | `transfers`, `accounts`, `financial_breakdowns` | Complex transformation extracting financial data |
| `custodians` | `custodians`, `retirement_plans` | Direct mapping with plan extraction |
| `users` | `users` | Direct mapping with compliance flags |
| `rollover_states` | N/A | Computed from events, not persisted to Data Connect |
| `transfers` | `transfers` | Generated by ETL from events, not source data |

### ETL Data Flow

```
Firebase Events → Event Service → ETL Processor → Data Connect Tables → Analytics Queries
                      ↓
               Computed States
                      ↓  
            Real-time Dashboard
```

### Known ETL Issues

1. **Duplicate Prevention**: ETL tracks processed rollovers in `etl_processed` collection
2. **Retry Logic**: Failed ETL jobs stored in `etl_failures` with exponential backoff
3. **Data Consistency**: Events are the source of truth; Data Connect tables are derived
4. **Race Conditions**: ETL uses document locks to prevent concurrent processing

---

## Collection Relationships

### Firebase Collections Relationships

```
users
  ├── custodianId → custodians
  └── audit logs → custodianAuditLogs

custodians
  ├── created users → custodianInvitations
  └── audit logs → custodianAuditLogs

events
  ├── rolloverId → rollover_states
  ├── userId → users
  └── custodianId → custodians

transfers (computed from events)
  ├── initiatedBy → users
  ├── sourceCustodian.id → custodians
  └── destinationCustodian.id → custodians
```

### Data Connect Table Relationships

```
users
  └── custodian_id → custodians

custodians
  ├── retirement_plans (one-to-many)
  ├── accounts (one-to-many)
  └── analytics_time_series (one-to-many)

transfers
  ├── initiated_by → users
  ├── source_custodian_id → custodians
  ├── destination_custodian_id → custodians
  ├── accounts (one-to-many)
  ├── financial_breakdowns (one-to-many)
  ├── tax_forms (one-to-many)
  └── blockchain_transactions (one-to-many via rollover_id)

accounts
  ├── transfer_id → transfers
  ├── custodian_id → custodians
  ├── plan_id → retirement_plans
  └── financial_breakdowns (one-to-many)

financial_breakdowns
  ├── transfer_id → transfers
  ├── account_id → accounts
  └── destination_account_id → accounts

events
  ├── user_id → users
  └── custodian_id → custodians

blockchain_transactions
  └── rollover_id → (links to transfer via rollover_id field)

token_operations
  └── rollover_id → (links to transfer via rollover_id field)
```

---

## Known Issues and Gotchas

### Firebase Firestore Issues

1. **BigInt Serialization**: Smart contract amounts (BigInt) must be converted to strings before Firestore storage
2. **Undefined Fields**: Firestore rejects `undefined` values; use null or omit fields
3. **Timestamp Handling**: Use Firebase Admin Timestamp, not JavaScript Date for server operations
4. **Collection Limits**: Firestore has query limits (e.g., `in` queries limited to 10 values)
5. **Transaction Limits**: Maximum 500 operations per transaction

### Data Connect Issues

1. **Authentication**: Queries use `@auth(level: NO_ACCESS)` for ETL access
2. **Field Naming**: GraphQL uses camelCase, SQL uses snake_case (handled by generated schema)
3. **Date Queries**: Use `ge`/`le` operators, not `gte`/`lte`
4. **Aggregation**: No built-in aggregation functions; compute in application logic
5. **Joins**: Use relationship fields, not manual joins

### ETL Issues

1. **Event Ordering**: Events must be processed in chronological order
2. **Race Conditions**: Multiple ETL instances can conflict; use locking
3. **Data Skew**: Large rollovers may have hundreds of events
4. **Retry Logic**: Failed ETL jobs need exponential backoff
5. **Schema Evolution**: Adding new event types requires ETL updates

### Security Issues

1. **PII Encryption**: SSN, account numbers require encryption before storage
2. **Audit Logging**: All data access must be logged for SOC 2 compliance
3. **Access Control**: Data Connect queries require proper authentication
4. **IP Logging**: Track source IP for all operations

---

## Type Definitions

### Key TypeScript Interfaces

Located in `/lib/events/types.ts`:

```typescript
// Event Types
export type RolloverEventType = 
  | 'rollover.started'
  | 'rollover.acknowledged'
  | 'rollover.documents_submitted'
  // ... (see events section for complete list)

export interface BaseEvent {
  eventId: string;
  eventType: RolloverEventType;
  rolloverId: string;
  timestamp: Timestamp;
  userId: string;
  custodianId?: string;
  ipAddress: string;
  sessionId: string;
  correlationId: string;
  data: any;
  metadata: EventMetadata;
}

export interface ComputedRolloverState {
  rolloverId: string;
  currentState: RolloverState;
  displayName: string;
  description: string;
  canRetry: boolean;
  nextAction?: NextAction;
  estimatedCompletion?: Date;
  // ... additional fields
}
```

### GraphQL Generated Types

Data Connect generates TypeScript types from GraphQL schema in `/dataconnect/generated/`.

### Database Schema Types

Located in various service files:
- `/lib/firebase-admin.ts` - Firebase types
- `/lib/custodians.ts` - Custodian types
- `/etl/functions/src/types/etl-types.ts` - ETL types

---

## Configuration Files

### Data Connect Configuration
- `/dataconnect/dataconnect.yaml` - Main configuration
- `/dataconnect/schema/schema.gql` - Table schema definitions
- `/dataconnect/connector/queries.gql` - Query definitions
- `/dataconnect/connector/mutations.gql` - Mutation definitions
- `/dataconnect/connector/analytics-queries.gql` - Analytics queries

### Firebase Configuration
- `firebase.json` - Firebase project configuration
- `firestore.rules` - Firestore security rules
- `firestore.indexes.json` - Firestore composite indexes

### ETL Configuration
- `/etl/functions/package.json` - ETL function dependencies
- `/etl/functions/src/index.ts` - ETL Cloud Function entry point

---

## Monitoring and Debugging

### Firebase Console
- **Firestore Database**: View collections and documents
- **Cloud Functions**: Monitor ETL execution
- **Authentication**: Manage users

### Data Connect Console
- **Schema Explorer**: Browse table structure
- **Query Editor**: Test GraphQL queries
- **Monitoring**: View query performance

### Application Logs
- **Event Processing**: Check `/api/events/` endpoints
- **ETL Logs**: Monitor Cloud Function logs
- **Analytics**: Check `/api/analytics/` endpoints

---

This documentation provides a comprehensive overview of the TrustRails data architecture. For implementation details, refer to the specific source files mentioned throughout this document.