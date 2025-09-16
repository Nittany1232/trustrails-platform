# V4 Contract Specification and Migration Guide

## Overview

This document specifies the RolloverEscrowV4 contract that removes the order dependency between `prepareSend` and `prepareReceive` operations. It also provides a comprehensive migration guide to prevent the fragile implementation issues encountered during the V1→V3 migration.

## V4 Contract Key Changes

### 1. Order-Independent Preparation

The V4 contract allows either custodian to prepare first:

```solidity
enum TransferState { 
    None,
    SenderPrepared,
    ReceiverPrepared, 
    BothReady, 
    Executed, 
    Cancelled,
    TimedOut
}
```

### 2. New prepareSend Implementation

```solidity
function prepareSend(
    bytes32 transferId,
    address receiver,
    bytes32 participantId,
    uint256 grossAmount,
    uint256 federalTax,
    uint256 stateTax,
    AccountType fromAccount,
    AccountType toAccount,
    string memory senderRefId,
    bytes32 documentHash
) external onlyVerifiedCustodian nonReentrant {
    Rollover storage r = rollovers[transferId];
    
    // Allow if None or ReceiverPrepared (order independent)
    if (r.state != TransferState.None && r.state != TransferState.ReceiverPrepared) {
        revert InvalidTransferState(r.state, TransferState.None);
    }
    
    // Validate receiver is whitelisted
    if (!verifiedCustodians[receiver]) {
        revert NotVerifiedCustodian(receiver);
    }
    
    // Set sender data
    r.sender = msg.sender;
    r.receiver = receiver;
    r.participantId = participantId;
    r.taxInfo = TaxInfo({
        grossAmount: grossAmount,
        federalTax: federalTax,
        stateTax: stateTax,
        netAmount: grossAmount - federalTax - stateTax,
        taxWithheld: (federalTax + stateTax) > 0,
        fromAccount: fromAccount,
        toAccount: toAccount
    });
    r.senderRefId = senderRefId;
    r.documentHash = documentHash;
    r.timeout = block.timestamp + DEFAULT_TIMEOUT;
    
    // Update state based on current state
    if (r.state == TransferState.None) {
        r.state = TransferState.SenderPrepared;
    } else if (r.state == TransferState.ReceiverPrepared) {
        r.state = TransferState.BothReady;
        r.preparedAt = block.timestamp;
    }
    
    emit TransferPreparedBySender(transferId, msg.sender, grossAmount, r.taxInfo.netAmount, fromAccount, toAccount);
    
    if (r.state == TransferState.BothReady) {
        _emitReadyToExecute(transferId);
    }
}
```

### 3. New prepareReceive Implementation

```solidity
function prepareReceive(
    bytes32 transferId,
    address sender,
    string memory receiverRefId
) external onlyVerifiedCustodian nonReentrant {
    Rollover storage r = rollovers[transferId];
    
    // Allow if None (create minimal record) or SenderPrepared
    if (r.state == TransferState.None) {
        // Create minimal record for receiver-first scenario
        r.receiver = msg.sender;
        r.sender = sender; // Expected sender
        r.receiverRefId = receiverRefId;
        r.state = TransferState.ReceiverPrepared;
        r.timeout = block.timestamp + DEFAULT_TIMEOUT;
        
        emit TransferPreparedByReceiver(transferId, msg.sender, receiverRefId);
    } else if (r.state == TransferState.SenderPrepared) {
        // Validate sender matches
        if (r.sender != sender) {
            revert UnauthorizedAction(msg.sender, transferId);
        }
        if (r.receiver != msg.sender) {
            revert UnauthorizedAction(msg.sender, transferId);
        }
        
        r.receiverRefId = receiverRefId;
        r.state = TransferState.BothReady;
        r.preparedAt = block.timestamp;
        
        emit TransferPreparedByReceiver(transferId, msg.sender, receiverRefId);
        _emitReadyToExecute(transferId);
    } else {
        revert InvalidTransferState(r.state, TransferState.ReceiverPrepared);
    }
}
```

## Critical Code Areas That Must Be Updated for V4

### 1. Environment Variables
**Files to Update:**
- `.env.local`
- `.env.local.example`
- All deployment scripts

**Changes:**
```bash
# Add new V4 contract address
NEXT_PUBLIC_ROLLOVER_ESCROW_V4_ADDRESS=0x[V4_CONTRACT_ADDRESS]
```

### 2. Contract Configuration
**File:** `/lib/blockchain/rollover-contract-client.ts`

**Current Fragile Code:**
```typescript
const address = process.env.NEXT_PUBLIC_ROLLOVER_ESCROW_V3_ADDRESS || 
               process.env.NEXT_PUBLIC_ROLLOVER_ESCROW_ADDRESS || 
               '0xD312f1DeBF61791D9f85ABAA4D90562db2b63a30';
```

**V4 Update Required:**
```typescript
export const CURRENT_CONTRACT_VERSION = 'V4' as const;

export function getContractConfig() {
  // Single source of truth - no fallbacks
  const v4Address = process.env.NEXT_PUBLIC_ROLLOVER_ESCROW_V4_ADDRESS;
  
  if (!v4Address) {
    throw new Error('V4 contract address not configured');
  }
  
  return {
    version: CURRENT_CONTRACT_VERSION,
    address: v4Address,
    executionDelayMinutes: 15,
    abiPath: '@/modules/eth-sdk/abi/RolloverEscrowV4.json'
  };
}
```

### 3. SDK Implementation
**New File:** `/modules/eth-sdk/src/RolloverEscrowV4SDK.ts`

**Key Changes:**
- Import V4 ABI
- Update type definitions for new state flows
- Add helper methods for order-independent operations

### 4. API Routes
**Files to Update:**
- `/app/api/blockchain/execute/route.ts`
- `/app/api/transfers/blockchain/route.ts` (if still exists)

**Critical Change:**
Remove ALL references to old contract versions. No fallback logic.

### 5. Component Updates
**Files to Update:**
- `/components/rollover/RealBlockchainRolloverActions.tsx`
- `/components/rollover/PlatformBlockchainActions.tsx`
- `/components/rollover/StrategyAwareRolloverActions.tsx`

**Change Pattern:**
```typescript
// Old import
import { RolloverEscrowV3SDK } from '@/lib/blockchain/rollover-contract-client';

// New import
import { RolloverEscrowV4SDK } from '@/lib/blockchain/rollover-contract-client';
```

### 6. Wallet Service
**File:** `/lib/wallet/walletService-platform.ts`

**Update:** Ensure it uses V4 operations exclusively.

### 7. Contract Verification Service
**File:** `/lib/services/contract-verification-service.ts`

**Updates Required:**
- Update to use V4 SDK
- Adjust state verification logic for order-independent flows
- Update contract address references

### 8. Deployment Configuration
**File:** `/modules/eth-sdk/deployments.json`

**Add V4 Entry:**
```json
{
  "sepolia": {
    "RolloverEscrowV4": {
      "address": "0x[V4_CONTRACT_ADDRESS]",
      "deploymentBlock": "[BLOCK_NUMBER]",
      "deploymentTx": "0x[TX_HASH]",
      "deployedAt": "[ISO_DATE]",
      "version": "4.0.0",
      "executionDelay": "900",
      "features": [
        "Order-independent preparation",
        "All V3 features",
        "Enhanced state management"
      ]
    }
  }
}
```

### 9. Test Data Creation
**Files to Update:**
- `/app/api/test-data/create/route.ts`
- All test scripts in `/scripts/`

**Ensure:** Test data creation uses V4 contract exclusively.

### 10. Scripts to Update
**Critical Scripts:**
- `deploy-rollover-escrow-v4.ts` (new)
- `verify-all-custodians-v4.js` (new)
- `whitelist-all-custodian-wallets-v4.js` (new)

## Pre-Deployment Checklist

### 1. Contract Deployment
- [ ] Deploy V4 contract to testnet
- [ ] Verify contract on Etherscan
- [ ] Record deployment address and block

### 2. Whitelist All Wallets
```javascript
// Script: whitelist-all-custodians-v4.js
const walletsToWhitelist = [
  // Platform wallets
  '0x855c53F4B495e83050611a898fA7d7f788951f95', // Demo Custodian
  '0xbCBB8C9cb1A38f23a3814c569D0DbB7e36bc2B0c', // Platform Wallet Test
  
  // BYOW wallets
  '0x15a944248B73b56487a8f6ccF126258f12075a01', // MetaMask Test
  
  // Add ALL custodian wallets from database
];
```

### 3. Environment Setup
- [ ] Update all `.env` files with V4 contract address
- [ ] Remove ALL references to V1, V2, V3 addresses
- [ ] Verify no hardcoded addresses remain

### 4. Code Updates
- [ ] Update rollover-contract-client.ts to V4
- [ ] Update all SDK imports
- [ ] Update all API routes
- [ ] Update all components
- [ ] Remove all legacy code

### 5. Testing Protocol
- [ ] Test sender-first flow
- [ ] Test receiver-first flow
- [ ] Test both BYOW and platform wallets
- [ ] Verify state transitions
- [ ] Test execution after delay

## Lessons Learned from V1→V3 Migration

### 1. **Multiple Contract Versions in Production**
**Problem:** Different code paths used different contract versions.
**Solution:** Single source of truth for contract configuration with no fallbacks.

### 2. **Environment Variable Confusion**
**Problem:** Multiple env vars pointing to different contracts.
**Solution:** One env var per contract version, clear naming convention.

### 3. **Incomplete Migration**
**Problem:** Some APIs still used old contract versions.
**Solution:** Comprehensive search and replace, no legacy code remains.

### 4. **Test Data Inconsistency**
**Problem:** Test data created on wrong contract version.
**Solution:** All test data creation must use current contract version.

### 5. **Wallet Whitelist Issues**
**Problem:** Wallets whitelisted on one contract but not another.
**Solution:** Whitelist all wallets on new contract before migration.

## Migration Steps

### Phase 1: Preparation
1. Deploy V4 contract
2. Whitelist all custodian wallets
3. Grant operator roles
4. Verify contract configuration

### Phase 2: Code Update
1. Update contract client to V4
2. Update all imports
3. Remove ALL legacy references
4. Update test data creation

### Phase 3: Testing
1. Create test transfers with both order scenarios
2. Verify BYOW functionality
3. Verify platform wallet functionality
4. Test edge cases

### Phase 4: Cutover
1. Update production environment variables
2. Monitor first transactions
3. Verify no V3 transactions remain
4. Archive V3 code

## Post-Migration Verification

```javascript
// verify-v4-migration.js
async function verifyV4Migration() {
  // 1. Check no V3 references remain
  // 2. Verify all wallets whitelisted
  // 3. Test both preparation orders
  // 4. Verify state transitions
  // 5. Confirm execution works
}
```

## Contract Interface Changes

### V3 Limitations (Current)
- `prepareSend` must be called first
- `prepareReceive` requires existing transfer
- Rigid state machine

### V4 Improvements
- Either party can prepare first
- Flexible state transitions
- Maintains security and atomicity
- Better user experience

## Summary

The V4 contract removes the order dependency that causes issues when custodians attempt operations in different sequences. By allowing either party to prepare first, we eliminate a major source of confusion and errors while maintaining the security properties of the two-phase commit protocol.

This migration guide addresses all the fragility issues encountered during V1→V3 migration by:
1. Providing clear, single sources of truth
2. Eliminating legacy code completely
3. Ensuring comprehensive wallet whitelisting
4. Testing all scenarios before cutover
5. Maintaining detailed documentation

---
**Document Created:** January 6, 2025
**Purpose:** V4 Contract Specification and Migration Guide
**Status:** Ready for implementation when V4 development begins