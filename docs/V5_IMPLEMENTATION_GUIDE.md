# V5 Contract Implementation Guide

## Overview

V5 contracts implement a two-phase rollover flow with Level 3 tokenization support, resolving V4's parameter mismatch issues while adding TRUSD token capabilities.

## Architecture

### Two-Phase Flow
1. **Phase 1: Agreement** - Both parties agree to transfer without amounts
2. **Phase 2: Financial Details** - Source custodian provides verified amounts
3. **Phase 3: Execution** - Contract executes with verified amounts
4. **Phase 4: Tokenization** - Auto-mint/burn TRUSD tokens (Level 3 only)

### Custodian Levels
- **Level 1 (Basic)**: Standard rollover functionality only
- **Level 2 (Enhanced)**: Advanced reporting and analytics
- **Level 3 (Tokenized)**: Full TRUSD tokenization support

## Key Components

### 1. V5 Contract Client (`/lib/blockchain/rollover-contract-client-v5.ts`)
```typescript
// Agreement phase (no amounts required)
await v5Client.agreeSend(params, eventParams);
await v5Client.agreeReceive(params, eventParams);

// Financial details phase
await v5Client.provideFinancialDetails(financialParams, eventParams);

// Execution phase
await v5Client.executeTransfer(transferId, eventParams);

// Tokenization phase (Level 3 only)
await v5Client.autoMintTokens(transferId, fundSources, eventParams);
await v5Client.autoBurnTokens(transferId, eventParams);
```

### 2. Custodian Level Service (`/lib/services/custodian-level-service.ts`)
```typescript
// Check tokenization support
const supports = await custodianLevelService.supportsTokenization(
  sourceCustodianId, 
  destCustodianId
);

// Auto-detect custodian level
const level = await custodianLevelService.autoDetectCustodianLevel(custodianId);

// Set custodian level (admin only)
await custodianLevelService.setCustodianLevel(
  custodianId, 
  walletAddress, 
  CustodianLevel.Tokenized, 
  'admin-user'
);
```

### 3. Unified Action Service (`/lib/services/unified-blockchain-action-service.ts`)
```typescript
// Execute V5 actions
const result = await unifiedBlockchainActionService.executeAction({
  action: 'agree_send', // V5 actions
  rollover,
  custodianId,
  signer, // For BYOW
  financialData // For financial phase
});

// Check tokenization support
const supports = await unifiedBlockchainActionService.checkTokenizationSupport(rollover);
```

## API Endpoints

### Custodian Level Management
- `GET /api/custodians/[custodianId]/level` - Get custodian level
- `POST /api/custodians/[custodianId]/level` - Set custodian level (admin)
- `POST /api/admin/custodian/setup-levels` - Initialize all levels

### Blockchain Execution
- `POST /api/blockchain/execute` - Execute V5 actions
  - Supports: `agree_send`, `agree_receive`, `provide_financial`, `execute_transfer`, `mint_tokens`, `burn_tokens`

## Event Types

### V5 Events
- `blockchain.v5.agreement` - Phase 1 agreements (sender/receiver)
- `blockchain.v5.financial` - Phase 2 financial details
- `blockchain.v5.executed` - Phase 3 execution
- `blockchain.v5.minted` - Phase 4 token minting
- `blockchain.v5.burned` - Phase 4 token burning

### Analytics Compatibility
V5 events are automatically converted for analytics using the compatibility layer in `/lib/events/v5-compatibility.ts`.

## State Management

### V5 States
- **None** → **SenderAgreed/ReceiverAgreed** → **BothAgreed** → **FinancialsProvided** → **Executed** → **Minted** → **Burned** → **Completed**

### UI State Mapping
```typescript
// State computation handles V5 flow
const state = stateEngine.computeState(events);

// V5-specific state checks
const hasV5Agreements = events.some(e => e.eventType === 'blockchain.v5.agreement');
const hasV5Financial = events.some(e => e.eventType === 'blockchain.v5.financial');
```

## Tokenization Logic

### Level 3 Detection
```typescript
// Auto-detection rules
if (custodian.type === 'platform' || 
    (custodian.wallet?.createdByPlatform === false && custodian.name?.includes('MetaMask'))) {
  return CustodianLevel.Tokenized; // Level 3
}
```

### TRUSD Token Flow
1. **Mint**: Triggered automatically after successful execution for Level 3 → Level 3 transfers
2. **Metadata**: Fund source breakdown stored on-chain
3. **Burn**: Triggered after settlement completion
4. **Compliance**: Each token represents a unique transfer with IRS-compliant breakdown

## Testing

### Unit Tests
- `/tests/services/custodian-level-service.test.ts`
- `/tests/services/unified-blockchain-action-service-v5.test.ts`

### Integration Tests
- `/tests/blockchain/blockchain-v5-integration.test.ts`

### Test Scenarios
1. **Level 1 → Level 1**: Standard V5 flow without tokenization
2. **Level 3 → Level 3**: Full tokenization flow with TRUSD
3. **Mixed Levels**: Level 1/2 → Level 3 (no tokenization)
4. **BYOW Transactions**: MetaMask integration with V5
5. **Platform Transactions**: Server-side V5 execution

## Deployment Steps

1. **Deploy V5 Contracts**
   ```bash
   cd modules/eth-sdk
   npm run deploy:v5
   ```

2. **Set Environment Variables**
   ```bash
   NEXT_PUBLIC_ROLLOVER_ESCROW_V5_ADDRESS=0x...
   NEXT_PUBLIC_TRUSD_ADDRESS=0x...
   ```

3. **Initialize Custodian Levels**
   ```bash
   curl -X POST /api/admin/custodian/setup-levels
   ```

4. **Verify Setup**
   ```bash
   curl /api/admin/custodian/setup-levels
   ```

## Migration from V4

### No Breaking Changes
- V4 events continue to work
- Analytics automatically handle both V4 and V5 events
- Existing transfers complete normally

### Gradual Migration
- New transfers automatically use V5
- No UI changes required (same button flow)
- Tokenization appears automatically for Level 3 transfers

## Troubleshooting

### Common Issues
1. **"Tokenization not supported"** - Check both custodians are Level 3
2. **"Financial data required"** - Ensure financialData passed to provide_financial action
3. **"Fund sources don't sum"** - Validate fund breakdown totals match gross amount
4. **"Event service not available"** - Expected for BYOW transactions (events created via API)

### Debug Logs
All V5 operations include extensive console logging with prefixes:
- `🤝 V5 Agreement`
- `💰 V5 Financial Details`
- `⚡ V5 Execute Transfer`
- `🪙 V5 TRUSD Minted`
- `🔥 V5 TRUSD Burned`

### State Verification
```typescript
// Check current V5 state
const state = await eventService.getComputedState(rolloverId);
console.log('V5 State:', state.v5State);

// Check tokenization support
const supports = await custodianLevelService.supportsTokenization(sourceId, destId);
console.log('Supports Tokenization:', supports);
```