# TrustRails Refactoring & Migration Guide
## Comprehensive Analysis & Implementation Plan for V5→V6 Migration Foundation

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Event System Deep Dive](#event-system-deep-dive)
4. [State Machine Analysis](#state-machine-analysis)
5. [Blockchain Service Architecture](#blockchain-service-architecture)
6. [Component Hierarchy Analysis](#component-hierarchy-analysis)
7. [Error Handling Patterns](#error-handling-patterns)
8. [5 Key Refactoring Opportunities](#5-key-refactoring-opportunities)
9. [PR-Based Implementation Plan](#pr-based-implementation-plan)
10. [Testing Standards & Requirements](#testing-standards--requirements)
11. [Risk Mitigation & Rollback Strategy](#risk-mitigation--rollback-strategy)
12. [Future Context Handoff](#future-context-handoff)

---

## Executive Summary

This document provides a comprehensive analysis of the TrustRails codebase and outlines a **zero-risk refactoring strategy** to build the foundation for V5→V6 blockchain contract migration. The approach focuses on **additive-only changes** that preserve all existing functionality while creating abstractions for easier migration.

### Key Findings:
- **Sophisticated Event-Driven Architecture**: Mature event sourcing with immutable audit trail
- **Complex State Machine**: Well-designed state transitions with role-based views
- **Robust Error Handling**: Multiple layers of error management with retry logic
- **Extensive Testing**: Comprehensive unit and integration test coverage
- **Pre-Launch Status**: No users, extensively tested working software

### Migration Strategy:
- **Git Branch Approach**: Individual PRs merged to main for each increment
- **Firebase Remote Config**: Feature flag system for gradual rollout
- **Zero Shadow Mode**: Clean debugging with no dual code paths
- **Comprehensive Testing**: Unit and integration tests for each PR

---

## Current Architecture Analysis

### **Event-Driven Architecture Foundation**

The TrustRails system implements a sophisticated **event sourcing pattern** with immutable audit trail:

#### Core Components:
- **EventService**: Central hub for event creation, validation, and side effects
- **StateComputationEngine**: Derives rollover state from event stream
- **CustodianStateComputer**: Role-specific state views and action determination
- **WebhookService**: External system integration with retry logic

#### Event Types (46 distinct types):
```typescript
// Initial Phase Events
'rollover.started'              // User submits information and starts rollover
'rollover.acknowledged'         // Custodian acknowledges receipt
'rollover.documents_submitted'  // Documents uploaded by custodian
'rollover.documents_verified'   // Documents verified by admin
'rollover.financial_verified'   // Financial verification completed

// V5 Blockchain Events (Two-Phase + Tokenization)
'blockchain.v5.agreement'       // V5 agreeSend/agreeReceive calls
'blockchain.v5.financial'       // V5 provideFinancialDetails call
'blockchain.v5.executed'        // V5 executeTransfer call
'blockchain.v5.minted'          // V5 TRUSD mint (Level 3 only)
'blockchain.v5.burned'          // V5 TRUSD burn (Level 3 only)

// Settlement Events
'settlement.funds_sent'
'settlement.funds_received'

// Completion Events
'rollover.completed'
'rollover.failed'
'rollover.cancelled'
```

#### Event Structure:
```typescript
interface BaseEvent {
  eventId: string;          // UUID for deduplication
  eventType: string;        // Business event type
  rolloverId: string;       // Reference to rollover
  timestamp: EventTimestamp; // When event occurred
  userId: string;           // Who triggered the event
  custodianId?: string;     // Which custodian (if applicable)
  ipAddress: string;        // For audit trail
  sessionId: string;        // For correlation within session
  correlationId: string;    // Links related events across sessions
  data: any;               // Event-specific data
  metadata?: EventMetadata; // Optional metadata
}
```

### **State Machine Architecture**

#### State Computation Flow:
```
Events → StateComputationEngine → Overall State
                                 ↓
                     CustodianStateComputer → Role-Specific State
                                            → Available Actions
                                            → Progress Tracking
```

#### State Types (13 distinct states):
```typescript
type RolloverState = 
  | 'started'                         // Initial request created
  | 'acknowledged'                    // Custodians acknowledged
  | 'awaiting_financial_verification' // Documents approved, waiting for financial
  | 'in_progress'                     // Ready for blockchain authorization
  | 'awaiting_approval'               // Documents submitted, waiting for admin
  | 'awaiting_sender'                 // Need sender blockchain authorization
  | 'awaiting_receiver'               // Need receiver blockchain authorization  
  | 'ready_to_record'                 // Both authorized, can execute
  | 'awaiting_funds'                  // Need sender to send funds
  | 'funds_in_transit'                // Funds sent, awaiting confirmation
  | 'completed'                       // Transfer fully complete
  | 'failed'                          // Transfer failed
  | 'cancelled';                      // Transfer cancelled
```

#### State Transition Rules:
1. **Terminal State Priority**: `completed`, `cancelled`, `failed` override all others
2. **V5 Tokenization**: `burned` → `completed`, `minted` → `funds_in_transit`
3. **Sequential Flow**: Documents → Agreements → Financial → Execution → Settlement
4. **Role-Based Actions**: Different actions available based on custodian role

---

## Event System Deep Dive

### **Event Validation & Creation**

#### Strict Event Type Validation:
```typescript
export const VALID_ROLLOVER_EVENT_TYPES: readonly RolloverEventType[] = [
  // 46 predefined event types with strict validation
];

// Runtime validation in EventService
if (!VALID_ROLLOVER_EVENT_TYPES.includes(eventType)) {
  throw new Error(`Invalid event type: ${eventType}`);
}
```

#### Event Creation Process:
1. **Type Validation**: Ensure event type is in allowlist
2. **Data Sanitization**: Remove undefined values, encrypt sensitive fields
3. **Audit Metadata**: Add IP, session, correlation tracking
4. **Immutable Storage**: Write to Firestore with compliance metadata
5. **State Recomputation**: Derive new state from updated event stream
6. **Side Effects**: Trigger webhooks, notifications, analytics

### **Event Data Schemas**

#### V5 Blockchain Events:
```typescript
interface V5AgreementEventData {
  transactionHash: string;
  contractVersion: 'v5';
  agreementType: 'sender' | 'receiver';
  transferId: string;
  custodianSender: string;
  custodianReceiver: string;
  state: number;           // V5 state (0-8)
}

interface V5FinancialEventData {
  transactionHash: string;
  fundSources: {
    employeePreTaxAmount: number;  // in cents
    employerMatchAmount: number;   // in cents
    rothAmount: number;            // in cents
    afterTaxAmount: number;        // in cents
    grossAmount: number;           // in cents
    taxYear: number;               // e.g., 2024
  };
  federalTaxWithheld: number;      // in cents
  stateTaxWithheld: number;        // in cents
  state: number;                   // V5 state after financial
}
```

### **Side Effects Processing**

The EventService handles complex side effects:
```typescript
async processSideEffects(event: BaseEvent): Promise<void> {
  // 1. Webhook delivery to external systems
  await this.deliverWebhooks(event);
  
  // 2. State transition checks
  await this.checkAutomaticTransitions(event);
  
  // 3. Transfer completion analytics
  if (event.eventType === 'rollover.completed') {
    await this.createTransferRecord(event);
  }
  
  // 4. Failure alerting
  if (event.eventType.includes('.failed')) {
    await this.sendFailureAlert(event);
  }
}
```

---

## State Machine Analysis

### **StateComputationEngine Logic**

#### State Derivation Priority:
```typescript
private deriveStateFromEvents(events: BaseEvent[]): RolloverState {
  // 1. Check terminal states first
  if (eventTypes.includes('rollover.completed')) return 'completed';
  if (eventTypes.includes('rollover.cancelled')) return 'cancelled';
  if (eventTypes.includes('rollover.failed')) return 'failed';

  // 2. Check V5 tokenization states
  if (eventTypes.includes('blockchain.v5.burned')) return 'completed';
  if (eventTypes.includes('blockchain.v5.minted')) return 'funds_in_transit';

  // 3. Check settlement states
  if (eventTypes.includes('settlement.funds_received')) return 'completed';
  if (eventTypes.includes('settlement.funds_sent')) return 'funds_in_transit';
  
  // 4. Check V5 execution
  if (eventTypes.includes('blockchain.v5.executed')) return 'awaiting_funds';

  // 5. V5 agreement flow logic...
}
```

#### Document Approval Logic:
```typescript
private areDocumentsApproved(events: BaseEvent[]): boolean {
  const approvalEvents = events.filter(e => 
    e.eventType === 'rollover.document_approved' ||
    e.eventType === 'rollover.documents_approved' ||
    e.eventType === 'rollover.documents_verified'
  );
  
  const custodianIds = [...new Set(events.map(e => e.custodianId).filter(Boolean))];
  
  if (custodianIds.length >= 2) {
    // Multi-custodian: BOTH need approvals
    const approvedCustodians = [...new Set(approvalEvents.map(e => e.custodianId))];
    return approvedCustodians.length >= 2;
  } else {
    // Single-custodian: any approval counts
    return approvalEvents.length > 0;
  }
}
```

### **CustodianStateComputer Role-Based Logic**

#### Progress Tracking:
```typescript
interface CustodianProgress {
  acknowledged: boolean;
  documentsSubmitted: boolean;
  documentsApproved: boolean;
  financialVerified: boolean;
  blockchainAuthorized: boolean;
}

// Separate tracking for myProgress vs otherProgress
const myProgress = this.getCustodianProgress(events, viewingCustodianId);
const otherProgress = this.getCustodianProgress(events, otherCustodianId);
```

#### Action Determination:
```typescript
getAvailableAction(state: CustodianSpecificState): {
  action: string | null;
  label: string;
  canAct: boolean;
  isBlockchain?: boolean;
} {
  switch (currentState) {
    case 'awaiting_sender':
      if (isSourceCustodian && !myProgress.blockchainAuthorized) {
        return { action: 'agree_send', label: 'Agree to Send', canAct: true, isBlockchain: true };
      }
      return { action: null, label: 'Waiting for Sender', canAct: false };
      
    case 'awaiting_financial_verification':
      if (isSourceCustodian) {
        return { action: 'provide_financial', label: 'Provide Financial Details', canAct: true, isBlockchain: true };
      }
      return { action: null, label: 'Waiting for Financial Information', canAct: false };
  }
}
```

---

## Blockchain Service Architecture

### **Service Layer Hierarchy**

#### 1. API Route Layer (`/app/api/blockchain/execute/route.ts`)
- **Entry point**: HTTP API for blockchain operations
- **Authentication**: Bearer token validation
- **Request validation**: Action types, required fields
- **Error handling**: Structured error responses
- **Audit logging**: Complete operation tracking

#### 2. Service Layer (`/lib/services/`)
- **BlockchainIntegrationService**: High-level orchestration with event listening
- **UnifiedBlockchainActionService**: Single interface for BYOW vs Platform wallets
- **TransactionService**: Core transaction execution with retry logic

#### 3. Contract Client Layer (`/lib/blockchain/`)
- **Contract interfaces**: Direct blockchain interaction
- **Gas optimization**: Smart gas estimation and pricing
- **State validation**: Contract state verification before operations

### **Execute Route Orchestration Pattern**

```typescript
export async function POST(req: NextRequest) {
  try {
    // 1. Authentication & Validation
    const authToken = await verifyIdToken(bearerToken);
    const { action, rolloverId, custodianId } = await req.json();
    
    // 2. Event-Based State Verification
    const events = await eventService.getEventsForRollover(rolloverId);
    const state = await stateComputationEngine.computeState(events);
    
    // 3. Duplicate Prevention
    const alreadyCompleted = events.some(e => e.eventType === `blockchain.v5.${action}`);
    if (alreadyCompleted) {
      return NextResponse.json({ error: 'Action already completed' }, { status: 409 });
    }
    
    // 4. Pre-execution Validation
    const contractState = await contract.getTransferState(transferHash);
    await validateContractStateForAction(action, contractState);
    
    // 5. Blockchain Execution
    const result = await executeBlockchainAction(action, params);
    
    // 6. Event Creation
    await eventService.appendEvent(`blockchain.v5.${action}`, rolloverId, result.data);
    
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await eventService.appendEvent(`blockchain.v5.${action}.failed`, rolloverId, { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### **V5 Contract State Machine**

#### Contract States (0-8):
- **State 0**: None (doesn't exist)
- **State 1**: ReceiverAgreed
- **State 2**: SenderAgreed  
- **State 3**: BothAgreed (agreements complete, no financials)
- **State 4**: FinancialsProvided ← **Required for execute_transfer**
- **State 5**: Executed
- **State 6**: Minted (TRUSD tokens)
- **State 7**: Burned (TRUSD tokens)
- **State 8**: Completed

#### State Validation:
```typescript
const validTransitions: Record<V6ContractAction, number[]> = {
  'agree_send': [0, 1], // None or ReceiverAgreed
  'agree_receive': [0, 2], // None or SenderAgreed
  'provide_financial': [3], // BothAgreed
  'execute_transfer': [4], // FinancialsProvided
  'mint_tokens': [5], // Executed
  'burn_tokens': [6] // Minted
};
```

---

## Component Hierarchy Analysis

### **Current Shared Components (25+ Components)**

#### Document Management:
- **DocumentItem.tsx**: Individual document display
- **DocumentSection.tsx**: Document group management
- **DocumentsDisplay.tsx**: Complete document interface
- **UniversalDocumentUploader.tsx**: Drag-and-drop with permission control

#### Data Display:
- **SensitiveDataDisplay.tsx**: SOC 2 compliant sensitive data with timed reveal
- **MetricCard.tsx**: Unified metric/stats cards with variants
- **StatusBadge.tsx**: Standardized status indicators
- **LoadingState.tsx**: Comprehensive loading state management

#### Transfer Components:
- **TransferCard.tsx**: Action-aware transfer cards with color coding
- **TransferHeader.tsx**: Transfer status display with action prompts
- **PartnerProgress.tsx**: Partner progress tracking
- **ActionStatusIndicator.tsx**: Action status visual feedback

#### Form Components:
- **AddressDisplay.tsx**: Multi-variant address display with comparison
- **AddressTabsManager.tsx**: Tabbed address management interface
- **AddressSelector.tsx**: Google Places autocomplete for business addresses
- **InlineFinancialVerification.tsx**: Dual-mode financial verification

### **Component Usage Patterns**

#### Action-Aware System:
```typescript
// Single source of truth for action status
function determineActionStatus(rollover: any): 'urgent' | 'action' | 'waiting' {
  const nextAction = rollover.computedState?.nextAction;
  if (!nextAction) return 'waiting';
  
  const urgentActions = ['provide_financial', 'execute_transfer', 'confirm_receipt'];
  return urgentActions.includes(nextAction.actionType) ? 'urgent' : 'action';
}

// Used across TransferCard, ActionStatusIndicator, TransferHeader
const actionStatus = determineActionStatus(rollover);
```

#### Composition Pattern:
```typescript
// DocumentsDisplay composes DocumentSection and DocumentItem
<DocumentsDisplay
  rollover={rollover}
  onViewDocument={setViewingDocument}
  showStateInfo={true}
/>

// Internally uses:
<DocumentSection title="Source Documents" documents={sourceDocuments}>
  {documents.map(doc => 
    <DocumentItem key={doc.id} document={doc} onView={onViewDocument} />
  )}
</DocumentSection>
```

---

## Error Handling Patterns

### **Comprehensive Error Architecture**

#### Error Type Hierarchy:
```typescript
// ETL Error Types (Enumerated)
enum ETLErrorType {
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  TRANSFORMATION_ERROR = 'TRANSFORMATION_ERROR',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  LOAD_FAILED = 'LOAD_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  DATA_INTEGRITY_ERROR = 'DATA_INTEGRITY_ERROR'
}

// Event System Error Types
interface EventError {
  errorType: 'validation' | 'processing' | 'blockchain' | 'webhook' | 'system';
  retryable: boolean;
  resolved: boolean;
}
```

#### Retry Logic Patterns:
```typescript
// Exponential Backoff in Webhook Service
const backoffMs = Math.min(
  1000 * Math.pow(endpoint.retryPolicy.backoffMultiplier, attempts - 1),
  endpoint.retryPolicy.maxBackoffMs
);

// Conditional Retry in ETL Monitor
private async shouldRetryFailure(failureData: any): Promise<boolean> {
  const retryableErrors = ['NETWORK_ERROR', 'CONSTRAINT_VIOLATION'];
  
  // Don't retry validation or integrity errors
  if (['VALIDATION_FAILED', 'DATA_INTEGRITY_ERROR'].includes(failureData.error?.type)) {
    return false;
  }
  
  return isRetryable && retryCount < maxRetries;
}
```

#### User-Facing Error Handling:
```typescript
// Toast Notification System
const { success, error, warning, info, loading } = useToast();

// Predefined patterns for common scenarios
toastPatterns.transactionSuccess({ onViewHistory: () => router.push('/history') });
toastPatterns.documentWarning({ onRetry: () => uploadDocument() });
toastPatterns.blockchainError({ onRetry: () => retryBlockchainAction() });
```

### **Error Recovery Workflows**

#### Automatic Data Reconciliation:
- ETL Orchestrator detects data discrepancies
- Automated fixing of missing records
- Periodic reconciliation between Firestore and SQL

#### Transfer State Recovery:
- Comprehensive blockchain state monitoring
- Automatic retry of failed transfers
- Duplicate prevention mechanisms

---

## 5 Key Refactoring Opportunities

### **1. State Management Abstraction Layer**

**Problem**: State computation logic scattered across multiple services with tight coupling to specific event types and blockchain states.

**Solution**: Create unified State Management Service:

```typescript
// New: StateTransitionEngine
class StateTransitionEngine {
  private eventMappers: Map<string, EventToStateMapper> = new Map();
  private validators: StateValidator[] = [];
  
  registerEventMapper(eventType: string, mapper: EventToStateMapper): void {
    this.eventMappers.set(eventType, mapper);
  }
  
  computeState(events: BaseEvent[]): ComputedRolloverState {
    // Pluggable mapping system for different event types
    const mappedEvents = events.map(event => 
      this.eventMappers.get(event.eventType)?.map(event) || event
    );
    
    // Abstract state computation
    return this.deriveStateFromMappedEvents(mappedEvents);
  }
}

// V6 Event Mapper (new)
class V6EventMapper implements EventToStateMapper {
  map(event: BaseEvent): BaseEvent {
    // Convert V6 events to standard format
    if (event.eventType.startsWith('blockchain.v6.')) {
      return this.convertV6ToStandard(event);
    }
    return event;
  }
}
```

**Migration Benefits**:
- V6 contract states added without modifying core logic
- Easier testing of state transitions in isolation
- Reduced coupling between blockchain and business logic
- Enables parallel development of V5→V6 migration

### **2. Blockchain Operation Command Pattern**

**Problem**: Execute route is monolithic (1,634 lines) with complex conditional logic mixing business rules with blockchain specifics.

**Solution**: Implement Command Pattern:

```typescript
// Abstract Command Base
abstract class BlockchainCommand {
  constructor(
    protected validator: CommandValidator,
    protected executor: CommandExecutor,
    protected eventService: EventService
  ) {}
  
  async execute(params: BlockchainActionParams): Promise<BlockchainOperationResult> {
    // 1. Pre-execution validation
    await this.validator.validate(this.getActionType(), params);
    
    // 2. Create pending event
    const pendingEventId = await this.createPendingEvent(params);
    
    // 3. Execute with retry logic
    try {
      const result = await this.executor.execute(this.getActionType(), params);
      await this.createSuccessEvent(params, result);
      return result;
    } catch (error) {
      await this.createFailureEvent(params, error);
      throw error;
    }
  }
  
  abstract getActionType(): string;
}

// Specific Command Implementations
class AgreeToSendCommand extends BlockchainCommand {
  getActionType(): string { return 'agree_send'; }
  
  protected async executeSpecific(params: BlockchainActionParams): Promise<any> {
    return await this.contract.agreeSend(params.transferId, params.custodianId);
  }
}

class V6AgreeToSendCommand extends BlockchainCommand {
  getActionType(): string { return 'agree_send'; }
  
  protected async executeSpecific(params: BlockchainActionParams): Promise<any> {
    // V6 contract implementation
    return await this.v6Contract.agreeSend(params.transferId, params.custodianId);
  }
}

// Command Composer for Complex Workflows
class CommandComposer {
  async executeWorkflow(commands: BlockchainCommand[], params: BlockchainActionParams): Promise<any> {
    const results = [];
    for (const command of commands) {
      const result = await command.execute(params);
      results.push(result);
    }
    return results;
  }
}
```

**Migration Benefits**:
- V6 operations implemented as new commands
- Easy to test individual operations in isolation
- Simplified error handling and retry logic
- Enables feature flagging at command level

### **3. Event-Driven Testing Framework**

**Problem**: Current testing requires complex setup of event streams and blockchain state simulation.

**Solution**: Create specialized testing utilities:

```typescript
// Event Scenario Builder
class EventScenarioBuilder {
  private events: BaseEvent[] = [];
  private baseTimestamp = Date.now();
  
  addEvent(eventType: string, custodianId?: string, data?: any): this {
    this.events.push(this.createEvent(eventType, custodianId, data));
    return this;
  }
  
  rolloverStarted(sourceCustodianId: string, destCustodianId: string): this {
    return this.addEvent('rollover.started', 'system', {
      sourceCustodianId,
      destinationCustodianId: destCustodianId
    });
  }
  
  documentsApproved(custodianId: string): this {
    return this.addEvent('rollover.documents_verified', custodianId);
  }
  
  v5Agreement(custodianId: string, agreementType: 'sender' | 'receiver'): this {
    return this.addEvent('blockchain.v5.agreement', custodianId, { agreementType });
  }
  
  build(): BaseEvent[] {
    return [...this.events];
  }
}

// State Assertions
class StateAssertions {
  static expectState(state: ComputedRolloverState, expectedState: string): void {
    expect(state.currentState).toBe(expectedState);
  }
  
  static expectAction(state: ComputedRolloverState, expectedAction: string): void {
    expect(state.nextAction?.actionType).toBe(expectedAction);
  }
  
  static expectProgress(state: any, custodian: string, progress: Partial<CustodianProgress>): void {
    const actualProgress = custodian === 'my' ? state.myProgress : state.otherProgress;
    expect(actualProgress).toMatchObject(progress);
  }
}

// Blockchain Simulator
class BlockchainSimulator {
  private contractState = 0;
  private events: BaseEvent[] = [];
  
  agreeSend(): this {
    this.contractState = Math.max(this.contractState, 2);
    this.events.push(this.createBlockchainEvent('blockchain.v5.agreement', { agreementType: 'sender' }));
    return this;
  }
  
  agreeReceive(): this {
    this.contractState = Math.max(this.contractState, 3);
    this.events.push(this.createBlockchainEvent('blockchain.v5.agreement', { agreementType: 'receiver' }));
    return this;
  }
  
  provideFinancial(): this {
    this.contractState = 4;
    this.events.push(this.createBlockchainEvent('blockchain.v5.financial', { fundSources: {} }));
    return this;
  }
  
  getContractState(): number { return this.contractState; }
  getEvents(): BaseEvent[] { return [...this.events]; }
}
```

**Migration Benefits**:
- Rapid testing of V5→V6 migration scenarios
- Automated regression testing of state transitions
- Easier comprehensive integration tests
- Enables property-based testing for complex scenarios

### **4. Configuration-Driven Contract Integration**

**Problem**: Contract addresses, ABIs, and gas settings hardcoded throughout codebase.

**Solution**: Create Contract Configuration System:

```typescript
// Contract Registry
class ContractRegistry {
  private contracts = new Map<string, ContractConfig>();
  
  register(name: string, config: ContractConfig): void {
    this.contracts.set(name, config);
  }
  
  get(name: string): ContractConfig {
    const config = this.contracts.get(name);
    if (!config) throw new Error(`Contract ${name} not found`);
    return config;
  }
}

// Network Configuration
interface NetworkConfig {
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  gasConfig: {
    maxGasPrice: string;
    gasBuffer: number;
  };
}

// Contract Factory
class ContractFactory {
  constructor(
    private registry: ContractRegistry,
    private networkConfig: NetworkConfig
  ) {}
  
  create(contractName: string): Contract {
    const config = this.registry.get(contractName);
    return new ethers.Contract(
      config.address,
      config.abi,
      this.createProvider()
    );
  }
}

// Migration Configuration
interface MigrationConfig {
  useV6Contracts: boolean;
  v6RolloutPercentage: number;
  contractMappings: {
    v5Address: string;
    v6Address: string;
  }[];
}

// Usage in services
class EnhancedBlockchainService {
  constructor(
    private contractFactory: ContractFactory,
    private migrationConfig: MigrationConfig
  ) {}
  
  async executeAction(action: string, params: any): Promise<any> {
    const contractName = this.migrationConfig.useV6Contracts ? 'TrustRailsV6' : 'TrustRailsV5';
    const contract = this.contractFactory.create(contractName);
    
    return await contract[action](...params);
  }
}
```

**Migration Benefits**:
- V6 contracts configured without code changes
- Easy A/B testing between V5 and V6
- Simplified deployment to different networks
- Enables gradual rollout with instant rollback

### **5. Unified Error Handling and Recovery System**

**Problem**: Error handling patterns inconsistent across services with different retry logic and recovery strategies.

**Solution**: Implement Centralized Error Management:

```typescript
// Error Classifier
class ErrorClassifier {
  classify(error: any): ErrorClassification {
    return {
      type: this.determineErrorType(error),
      retryable: this.isRetryable(error),
      severity: this.determineSeverity(error),
      category: this.categorizeError(error)
    };
  }
  
  private determineErrorType(error: any): ErrorType {
    if (error.code === 'NETWORK_ERROR') return 'network';
    if (error.message.includes('gas')) return 'gas_estimate';
    if (error.message.includes('nonce')) return 'nonce_conflict';
    if (error.message.includes('revert')) return 'contract_revert';
    return 'unknown';
  }
}

// Recovery Workflow
class RecoveryWorkflow {
  private strategies = new Map<ErrorType, RecoveryStrategy[]>();
  
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    errorType: ErrorType
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const strategies = this.strategies.get(errorType) || [];
      
      for (const strategy of strategies) {
        try {
          await strategy.recover();
          return await operation(); // Retry after recovery
        } catch (recoveryError) {
          // Log and continue to next strategy
        }
      }
      
      throw error; // All recovery attempts failed
    }
  }
}

// Retry Policy Engine
class RetryPolicyEngine {
  private policies = new Map<string, RetryPolicy>();
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    policyName: string
  ): Promise<T> {
    const policy = this.policies.get(policyName);
    if (!policy) return await operation();
    
    let lastError: Error;
    
    for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (!this.shouldRetry(error, policy, attempt)) {
          throw error;
        }
        
        await this.delay(policy.getBackoffDelay(attempt));
      }
    }
    
    throw lastError;
  }
}

// Usage
const errorHandler = new UnifiedErrorHandler({
  classifier: new ErrorClassifier(),
  recovery: new RecoveryWorkflow(),
  retryEngine: new RetryPolicyEngine()
});

await errorHandler.execute(
  () => blockchainService.executeTransfer(params),
  {
    retryPolicy: 'blockchain_operations',
    recoveryStrategy: 'contract_errors'
  }
);
```

**Migration Benefits**:
- V6 migration errors handled consistently
- Automated recovery from common V5→V6 transition issues
- Better observability during migration
- Reduced manual intervention for transient failures

---

## PR-Based Implementation Plan

### **Git Branch Strategy: Individual PRs → Merge to Main**

#### Process:
1. **Feature branch** → **PR** → **Your review** → **Merge to main**
2. **Next feature branch** (from updated main) → **PR** → **Review** → **Merge to main**
3. Repeat for each incremental change

#### Benefits:
- Main branch always has working, tested code
- Each PR independently testable and revertible
- Clear history of what changed when
- Easy to bisect issues if they arise

### **Firebase Remote Config for Feature Flags**

```typescript
// Firebase Feature Flags Implementation
class FirebaseFeatureFlags {
  private static cache = new Map<string, boolean>();
  private static lastFetch = 0;
  private static CACHE_TTL = 60000; // 1 minute

  static async isEnabled(flag: string): Promise<boolean> {
    await this.refreshCacheIfNeeded();
    return this.cache.get(flag) || false;
  }

  private static async fetchRemoteConfig(): Promise<Record<string, any>> {
    const remoteConfig = getRemoteConfig();
    await fetchAndActivate(remoteConfig);
    
    return {
      enhanced_blockchain_service: getBoolean(remoteConfig, 'enhanced_blockchain_service'),
      new_state_engine: getBoolean(remoteConfig, 'new_state_engine'),
      v6_contracts: getBoolean(remoteConfig, 'v6_contracts')
    };
  }
}
```

### **PR Sequence with Comprehensive Testing**

#### **PR #1: Firebase Feature Flag System**
**Branch**: `feature/firebase-feature-flags`

**Files Added**:
- `/lib/feature-flags/firebase-flags.ts`
- `/lib/feature-flags/firebase-flags.test.ts`

**Testing Requirements**:
- **Unit Tests**: Feature flag fetching, cache behavior, error handling
- **Integration Tests**: Firebase Remote Config connection, persistence
- **Coverage**: 95%+ for new code

**Review Checklist**:
- [ ] All tests pass (`npm run test`)
- [ ] TypeScript clean (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] No impact on existing functionality

---

#### **PR #2: State Management Abstraction**
**Branch**: `feature/state-management-abstraction`

**Files Added**:
- `/lib/state/state-transition-engine.ts`
- `/lib/state/state-transition-engine.test.ts`
- `/lib/state/event-mappers.ts`
- `/lib/state/state-validators.ts`

**Files Modified**:
- Update `StateComputationEngine` to use feature flag (with fallback)

**Testing Requirements**:
- **Unit Tests**: State transition logic, event mapping, validation rules
- **Integration Tests**: End-to-end state computation comparison with existing
- **Performance Tests**: Large event stream processing
- **Coverage**: 90%+ for new code

**Review Checklist**:
- [ ] New code only runs when feature flag enabled
- [ ] Default behavior unchanged (feature flag OFF)
- [ ] All existing tests pass
- [ ] New functionality thoroughly tested
- [ ] Performance benchmarks within acceptable range

---

#### **PR #3: Command Pattern for Blockchain**
**Branch**: `feature/blockchain-command-pattern`

**Files Added**:
- `/lib/blockchain/commands/blockchain-command.ts`
- `/lib/blockchain/commands/agreement-command.ts`
- `/lib/blockchain/commands/execution-command.ts`
- `/lib/blockchain/commands/command-validator.ts`
- `/lib/blockchain/commands/command-executor.ts`
- Comprehensive test suite for all commands

**Files Modified**:
- Update execute route to use feature flag and command pattern

**Testing Requirements**:
- **Unit Tests**: Individual command execution, validation, error handling
- **Integration Tests**: Full blockchain operation workflows
- **Error Scenario Tests**: Command failures and recovery
- **Coverage**: 95%+ for new code

**Review Checklist**:
- [ ] Execute route unchanged when flag disabled
- [ ] All blockchain operations work with new commands
- [ ] Error handling preserved and enhanced
- [ ] Gas estimation and retry logic intact
- [ ] Performance equivalent or better

---

#### **PR #4: Enhanced Testing Framework**
**Branch**: `feature/testing-framework`

**Files Added**:
- `/lib/testing/event-scenario-builder.ts`
- `/lib/testing/blockchain-simulator.ts`
- `/lib/testing/state-assertions.ts`
- `/lib/testing/mock-services.ts`
- Complete test suite demonstrating framework usage

**Testing Requirements**:
- **Unit Tests**: Testing utility functionality
- **Integration Tests**: Complex transfer scenarios using new tools
- **Documentation Tests**: All examples in documentation work
- **Coverage**: 100% for testing utilities

**Review Checklist**:
- [ ] Framework doesn't interfere with existing tests
- [ ] Clear documentation and examples
- [ ] Performance impact minimal
- [ ] Easy to use and understand

---

#### **PR #5: Configuration-Driven Contracts**
**Branch**: `feature/contract-configuration`

**Files Added**:
- `/lib/contracts/contract-registry.ts`
- `/lib/contracts/network-config.ts`
- `/lib/contracts/contract-factory.ts`
- `/lib/contracts/migration-config.ts`
- Full test coverage

**Files Modified**:
- Update blockchain services to use registry (feature flagged)

**Testing Requirements**:
- **Unit Tests**: Contract creation, configuration management
- **Integration Tests**: Contract operations with configuration system
- **Migration Tests**: V5/V6 contract switching
- **Coverage**: 90%+ for new code

---

#### **PR #6: Unified Error Handling**
**Branch**: `feature/unified-error-handling`

**Files Added**:
- `/lib/errors/error-classifier.ts`
- `/lib/errors/recovery-workflow.ts`
- `/lib/errors/retry-policy-engine.ts`
- `/lib/errors/unified-error-handler.ts`
- Complete error handling test suite

**Files Modified**:
- Update error-prone areas to use new system (feature flagged)

**Testing Requirements**:
- **Unit Tests**: Error classification, retry logic, recovery strategies
- **Integration Tests**: End-to-end error handling scenarios
- **Performance Tests**: Error handling overhead
- **Coverage**: 95%+ for new code

---

## Testing Standards & Requirements

### **Unit Test Standards**

#### Coverage Requirements:
- **New Code**: 90%+ line coverage
- **Critical Paths**: 100% coverage for state transitions, blockchain operations
- **Error Scenarios**: All error paths tested
- **Edge Cases**: Boundary conditions and malformed inputs

#### Test Structure:
```typescript
describe('StateTransitionEngine', () => {
  let engine: StateTransitionEngine;
  let mockEventService: jest.Mocked<EventService>;
  
  beforeEach(() => {
    mockEventService = createMockEventService();
    engine = new StateTransitionEngine(mockEventService);
  });
  
  describe('computeState', () => {
    it('should compute state with V5 events', () => {
      // Arrange
      const events = EventScenarioBuilder
        .rolloverStarted('custodian-1', 'custodian-2')
        .documentsApproved('custodian-1')
        .v5Agreement('custodian-1', 'sender')
        .build();
      
      // Act
      const state = engine.computeState(events);
      
      // Assert
      StateAssertions.expectState(state, 'awaiting_receiver');
      StateAssertions.expectAction(state, 'agree_receive');
    });
  });
});
```

### **Integration Test Standards**

#### Full Workflow Testing:
```typescript
describe('V5 to V6 Migration Integration', () => {
  test('V5 workflow should work unchanged', async () => {
    await FirebaseFeatureFlags.set('v6_contracts', false);
    
    const result = await executeFullWorkflow('traditional_rollover');
    
    expect(result.contractVersion).toBe('v5');
    expect(result.success).toBe(true);
  });
  
  test('V6 workflow should produce equivalent results', async () => {
    await FirebaseFeatureFlags.set('v6_contracts', true);
    
    const result = await executeFullWorkflow('traditional_rollover');
    
    expect(result.contractVersion).toBe('v6');
    expect(result.success).toBe(true);
    // Verify result compatibility with V5
  });
});
```

#### Performance Testing:
```typescript
describe('Performance Regression Tests', () => {
  test('state computation should not exceed baseline', async () => {
    const largeEventSet = generateLargeEventSet(1000);
    
    const startTime = performance.now();
    const state = await stateEngine.computeState(largeEventSet);
    const duration = performance.now() - startTime;
    
    expect(duration).toBeLessThan(500); // 500ms baseline
    expect(state).toBeDefined();
  });
});
```

### **Test Commands Per PR**

```bash
# Required before each PR submission
npm run test                    # All unit tests pass
npm run test:integration       # Integration tests pass  
npm run test:coverage          # Coverage requirements met
npm run build                  # Build succeeds
npm run typecheck              # TypeScript clean
npm run lint                   # Code style standards
```

---

## Risk Mitigation & Rollback Strategy

### **Per-PR Rollback**

#### Git-Based Rollback:
```bash
# Rollback specific PR
git revert <merge-commit-hash>

# Multiple PRs
git revert <commit1> <commit2> <commit3>

# Reset to specific point
git reset --hard <safe-commit-hash>
```

#### Feature Flag Rollback:
```javascript
// Firebase Remote Config - Instant disable
{
  "enhanced_blockchain_service": false,
  "new_state_engine": false, 
  "v6_contracts": false
}
```

### **Emergency Rollback Procedures**

#### Immediate Rollback (< 5 minutes):
1. **Disable Feature Flags**: Set all flags to `false` in Firebase
2. **Verify Rollback**: Check that system reverts to existing code
3. **Monitor Systems**: Ensure stability after rollback
4. **Document Issue**: Record what caused the rollback

#### Code Rollback (< 30 minutes):
1. **Identify Problem PR**: Use git bisect or logs to find issue
2. **Revert PR**: `git revert <commit-hash>`
3. **Emergency Deploy**: Push revert to main branch
4. **System Verification**: Comprehensive testing of reverted state

### **Rollback Validation**

#### Automated Checks:
```typescript
// Rollback validation script
async function validateRollback(): Promise<boolean> {
  // 1. Verify feature flags are disabled
  const flagsDisabled = await checkAllFeatureFlags();
  
  // 2. Test critical user flows
  const criticalFlowsWork = await testCriticalFlows();
  
  // 3. Verify database consistency
  const dataConsistent = await validateDataConsistency();
  
  return flagsDisabled && criticalFlowsWork && dataConsistent;
}
```

#### Manual Verification:
- [ ] Transfer creation works
- [ ] Document upload functions
- [ ] Blockchain operations execute
- [ ] State computation accurate
- [ ] Error handling functional

### **Monitoring During Migration**

#### Key Metrics:
- **Error Rate**: < 2% (immediate rollback if exceeded)
- **Response Time**: < 30 seconds for blockchain operations
- **State Computation**: < 500ms for large event sets
- **Memory Usage**: No memory leaks in new code

#### Alert Thresholds:
```typescript
const alertThresholds = {
  errorRate: 0.02,           // 2%
  responseTime: 30000,       // 30 seconds
  stateComputationTime: 500, // 500ms
  memoryUsage: 1024          // 1GB increase
};
```

---

## Future Context Handoff

### **For Next Claude Instance**

This document contains complete context for continuing the TrustRails refactoring project:

#### **Current State**:
- **Pre-launch testing environment**
- **Extensively tested working software**
- **Event-driven architecture with 46 event types**
- **13-state rollover state machine**
- **V5 blockchain contracts deployed and working**
- **V6 contracts ready for migration**

#### **Architecture Understanding**:
- **Event System**: Immutable event sourcing with audit trail
- **State Machine**: StateComputationEngine + CustodianStateComputer
- **Blockchain Layer**: Execute route orchestration with retry logic
- **Component System**: 25+ shared components with action-aware patterns
- **Error Handling**: Multi-layer error management with recovery

#### **Implementation Approach**:
- **Git-based PRs**: Individual feature branches merged to main
- **Firebase Feature Flags**: Remote configuration for gradual rollout
- **Zero Shadow Mode**: Clean debugging without dual code paths
- **Comprehensive Testing**: Unit + integration tests for each PR

#### **Next Steps**:
1. **Start with PR #1**: Firebase Feature Flag System
2. **Follow PR sequence**: Each PR builds on previous work
3. **Review each PR thoroughly**: Ensure zero impact on existing functionality
4. **Use testing framework**: Validate each change comprehensively

#### **Key Files to Reference**:
- **State Engine**: `/lib/events/state-computation-engine.ts`
- **Custodian Computer**: `/lib/events/custodian-state-computer.ts`
- **Event Types**: `/lib/events/types.ts`
- **Execute Route**: `/app/api/blockchain/execute/route.ts`
- **Shared Components**: `/components/shared/`

#### **Critical Success Factors**:
- **Preserve all existing functionality**
- **Maintain event stream immutability**
- **Keep state computation logic consistent**
- **Ensure blockchain operations remain reliable**
- **Provide instant rollback capability**

#### **Contact Points**:
- **Human reviewer**: Reviews all PRs before merge
- **Testing environment**: Full testing before any production deployment
- **Feature flags**: Remote configuration for safe experimentation

This document provides complete architectural understanding and implementation guidance for successfully completing the TrustRails refactoring project while maintaining the stability and reliability of the extensively tested codebase.

---

## Appendix

### **A. Event Type Reference**
Complete list of 46 event types with descriptions and usage patterns.

### **B. State Transition Matrix**
Comprehensive state transition rules and validation logic.

### **C. Component Dependencies**
Detailed component hierarchy and usage patterns.

### **D. Error Classification**
Complete error type taxonomy and handling strategies.

### **E. Testing Scenarios**
Comprehensive test case catalog for all major workflows.

---

*This document serves as the definitive guide for TrustRails refactoring and V5→V6 migration foundation. All implementation should follow the patterns and approaches outlined here to ensure consistency, reliability, and maintainability.*