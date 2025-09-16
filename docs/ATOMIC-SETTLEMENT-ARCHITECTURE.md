# Atomic Settlement Architecture

## Overview

The TrustRails platform implements a two-phase commit protocol for atomic settlement of IRA rollovers. This ensures that both custodians commit to the transfer before execution, providing a secure and auditable process for moving retirement funds.

## Key Components

### 1. Smart Contract: RolloverEscrow

The `RolloverEscrow` smart contract implements the atomic settlement logic with the following features:

- **Two-Phase Commit**: Both custodians must prepare before execution
- **Tax Handling**: Supports federal and state tax withholding
- **Account Types**: Handles Traditional, Roth, SEP, and SIMPLE IRAs
- **Timeout Protection**: Automatic cancellation after timeout period
- **Execution Delay**: Configurable delay between preparation and execution

### 2. Transfer States

```
None → SenderPrepared → BothReady → Executed
         ↓                    ↓          ↓
    ReceiverPrepared    Cancelled   Completed
```

### 3. Workflow Phases

1. **Initiation Phase**
   - Create rollover request
   - Validate participant information
   - Calculate tax withholdings
   - Generate unique transfer ID

2. **Preparation Phase**
   - Source custodian calls `prepareSend()`
   - Destination custodian calls `prepareReceive()`
   - Smart contract validates both commitments
   - System enters "BothReady" state

3. **Execution Phase**
   - Either party calls `executeTransfer()`
   - Atomic state change on blockchain
   - Audit trail creation
   - Settlement notifications triggered

4. **Settlement Phase**
   - Real-world fund transfer (ACH/Check/Wire)
   - Tracking number assignment
   - Status updates

5. **Completion Phase**
   - Settlement confirmation
   - Final reconciliation
   - Archive transfer

## Tax Handling

### Traditional to Traditional
- Optional tax withholding
- Net amount = Gross amount - Federal tax - State tax

### Traditional to Roth (Conversion)
- Mandatory tax consideration
- Requires either:
  - Tax withholding (federal/state)
  - Documentation of external tax payment

### Roth to Roth
- No tax withholding
- Full amount transfers

## API Endpoints

### Rollover Management
- `POST /api/rollovers` - Initiate new rollover
- `GET /api/rollovers/:id` - Get rollover details
- `POST /api/rollovers/:id/prepare-send` - Source custodian preparation
- `POST /api/rollovers/:id/prepare-receive` - Destination custodian preparation
- `POST /api/rollovers/:id/execute` - Execute atomic transfer
- `GET /api/rollovers/:id/can-execute` - Check execution readiness
- `PUT /api/rollovers/:id/settlement` - Update settlement status
- `POST /api/rollovers/:id/cancel` - Cancel rollover

## Security Considerations

1. **Role-Based Access**
   - Only involved custodians can access transfer details
   - Admin override for support purposes

2. **Wallet Security**
   - Private keys stored in Google Secret Manager
   - Never exposed to client-side code
   - Separate wallets per custodian

3. **Timeout Protection**
   - Default 7-day timeout
   - Automatic state transition to "TimedOut"
   - Funds never locked indefinitely

4. **Execution Delay**
   - Default 1-hour delay after both parties ready
   - Prevents immediate execution attacks
   - Allows time for final review

## Implementation Example

```typescript
// Initiate rollover
const rollover = await rolloverService.initiateRollover({
  sourceCustodianId: 'fidelity-001',
  destinationCustodianId: 'vanguard-001',
  participantId: 'encrypted-participant-id',
  grossAmount: 50000,
  federalTaxPercent: 20, // 20% federal withholding
  stateTaxPercent: 5,    // 5% state withholding
  sourceAccountType: 'Traditional',
  destinationAccountType: 'Roth',
  settlementMethod: 'ACH',
  userId: 'user-123'
});

// Source custodian prepares
await rolloverService.prepareSend(
  rollover.id,
  'FID-REF-12345',
  'document-hash-abc'
);

// Destination custodian prepares
await rolloverService.prepareReceive(
  rollover.id,
  'VAN-REF-67890'
);

// After execution delay, execute transfer
await rolloverService.executeTransfer(rollover.id);

// Update settlement status
await rolloverService.updateSettlement(rollover.id, {
  trackingNumber: 'ACH-12345',
  estimatedSettlementDate: new Date('2024-01-20'),
  status: 'sent'
});
```

## Benefits

1. **Atomic Guarantee**: Both parties commit or neither does
2. **Audit Trail**: Complete blockchain record of all actions
3. **Tax Compliance**: Built-in tax calculation and withholding
4. **Flexibility**: Supports multiple account types and settlement methods
5. **Security**: No single party can execute without the other
6. **Transparency**: All parties can verify state at any time

## Future Enhancements

1. **Multi-signature Support**: Require multiple approvers per custodian
2. **Batch Processing**: Handle multiple transfers atomically
3. **Cross-chain Support**: Enable transfers across different blockchains
4. **Automated Settlement**: Direct integration with banking APIs
5. **Advanced Tax Rules**: State-specific tax calculations