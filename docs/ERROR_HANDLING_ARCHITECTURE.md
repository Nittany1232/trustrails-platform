# Error Handling Architecture - TrustRails Platform

## Overview
The TrustRails platform implements a sophisticated multi-layered error handling system designed to maintain UI/blockchain state consistency and provide automatic recovery for certain error conditions.

## Core Principles

1. **UI State Consistency**: The UI should never advance without blockchain confirmation
2. **Selective Recovery**: Only certain errors trigger automatic recovery (e.g., InvalidState)
3. **User Transparency**: Clear error messages with appropriate recovery actions
4. **Event-Driven State**: Failure events change UI state, so they must be created judiciously

## Error Categories

### 1. Recoverable Errors (Trigger Recovery System)
- **InvalidState Errors** (`0x77e5c5f2`): Contract state mismatch
  - Automatically triggers blockchain state synchronization
  - Recovery system queries smart contract for actual state
  - Creates missing events to align database with blockchain
  - UI can retry action after successful recovery

### 2. Non-Recoverable User Errors (No Recovery, No Failure Event)
- **Insufficient Funds**: Platform wallet lacks ETH for gas
  - Pre-flight gas check prevents transaction attempt
  - No failure event created (prevents UI state corruption)
  - Error bubbles up with `skipRecovery` flag
  - User must fund wallet before retrying

- **User Rejection**: User cancels MetaMask transaction
  - No recovery needed
  - User can retry when ready

### 3. System Errors (Create Failure Event)
- **Network Errors**: Temporary connectivity issues
- **Gas Estimation Errors**: Transaction complexity issues
- **Contract Errors**: Unexpected revert reasons
- These create failure events that update UI state to "failed"

## Error Flow Architecture

```
User Action
    ↓
useTransferActions Hook
    ↓
API Route (/api/blockchain/execute)
    ↓
BlockchainService
    ├─→ Pre-flight Gas Check (NEW)
    │   └─→ Insufficient? Throw without failure event
    ↓
Execute Transaction
    ├─→ Success: Create success event → Update UI
    └─→ Error: Classify error type
        ├─→ InvalidState? → Trigger Recovery
        │   └─→ Recovery Service
        │       ├─→ Query blockchain
        │       ├─→ Create missing events
        │       └─→ Return retry recommendation
        ├─→ Insufficient Funds? → No failure event
        └─→ Other errors → Create failure event
```

## Key Components

### 1. BlockchainService (`lib/blockchain/enhanced/blockchain-service.ts`)
- **Pre-flight Gas Check**: Estimates gas and checks wallet balance BEFORE transaction
- **Error Classification**: Determines error type and appropriate handling
- **Selective Event Creation**: Only creates failure events for non-recoverable system errors

```typescript
// Critical logic for preventing UI state corruption
if (isInsufficientFunds) {
  // DON'T create failure event - wallet just needs funding
  throw error;
} else if (isInvalidState) {
  // DON'T create failure event - recovery will handle it
  throw error;
} else {
  // DO create failure event for actual failures
  await this.createFailureEvent(action, params, error);
}
```

### 2. Recovery Hook (`hooks/useBlockchainRecovery.ts`)
- **Timeout Detection**: 30-second timeout triggers recovery check
- **InvalidState Handling**: Automatic state synchronization
- **Retry Logic**: Determines if action should be retried after recovery

### 3. Transfer Actions Hook (`hooks/useTransferActions.ts`)
- **Recovery Integration**: Wraps blockchain calls with recovery system
- **Error Propagation**: Special handling for `skipRecovery` flag
- **Success Detection**: Recognizes `_recoverySuccess` to prevent error toasts

### 4. API Routes (`app/api/blockchain/execute/route.ts`)
- **Error Enhancement**: Adds metadata for client-side handling
- **Insufficient Funds Detection**: Special response for funding errors
- **InvalidState Preservation**: Maintains error structure for recovery

## Critical Fixes Implemented

### 1. Pre-flight Gas Checks
**Problem**: Transactions attempted without checking wallet balance
**Solution**: Check balance vs estimated gas (+20% buffer) before transaction
**Impact**: Prevents failure events when wallet just needs funding

### 2. Selective Failure Event Creation
**Problem**: All errors created failure events, corrupting UI state
**Solution**: Only create failure events for actual blockchain failures
**Impact**: UI remains in correct state when wallet needs funding

### 3. Error Classification
**Problem**: All errors treated the same way
**Solution**: Classify errors into recoverable/non-recoverable/user categories
**Impact**: Appropriate handling for each error type

## Error Codes and Patterns

### Blockchain Error Codes
- `0x77e5c5f2`: InvalidState - wrong contract state for action
- `0x06d4a5a8`: AlreadyAgreed - duplicate agreement attempt
- `INSUFFICIENT_FUNDS`: Wallet lacks ETH for gas
- `USER_REJECTED`: User cancelled transaction

### Detection Patterns
```typescript
// Insufficient Funds Detection
errorMessage.includes('insufficient funds') ||
errorMessage.includes('insufficient balance') ||
errorMessage.includes('insufficient eth') ||
error.code === 'INSUFFICIENT_FUNDS'

// InvalidState Detection  
errorMessage.includes('InvalidState') ||
errorMessage.includes('0x77e5c5f2') ||
error.errorCode === 'INVALID_STATE'
```

## Testing the Error Handling

### Test Insufficient Funds
1. Ensure platform wallet has 0 ETH
2. Attempt any blockchain action
3. Verify: No failure event created, UI state unchanged, clear error message

### Test InvalidState Recovery
1. Manipulate contract state directly
2. Attempt action requiring different state
3. Verify: Recovery triggered, state synchronized, action can retry

### Test Network Errors
1. Disconnect network during transaction
2. Verify: Failure event created, UI shows failed state

## Monitoring and Alerts

### Failure Events
- Events with `.failed` suffix trigger admin alerts
- Exception: Insufficient funds errors don't create failure events

### Recovery Metrics
- Track recovery attempts and success rates
- Monitor which errors trigger recovery most often
- Identify patterns in state mismatches

## Best Practices

1. **Always perform pre-flight checks** for resource availability
2. **Classify errors immediately** to determine handling strategy
3. **Preserve error context** through the entire stack
4. **Create failure events judiciously** - they change UI state
5. **Test error paths** as thoroughly as success paths

## Future Improvements

1. **Automated Wallet Funding**: Detect low balance and auto-transfer from reserve
2. **Predictive Recovery**: Detect likely InvalidState before user action
3. **Error Analytics**: Dashboard showing error patterns and recovery rates
4. **Retry Queue**: Automatic retry for transient network errors
5. **User Notifications**: Email/SMS for critical errors requiring attention