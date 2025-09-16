# Level 3 Auto-Mint Failure Post-Mortem

## Executive Summary
Level 3 tokenization broke on August 22, 2025 due to a single-character typo (`this.sdk` instead of `sdk`) that prevented auto-mint detection from running. This went undetected for weeks because the error was silently caught and the system appeared to work (transfers completed on blockchain but UI didn't update).

## Timeline of Events

### ✅ Working State (Before August 22, 2025)
- Level 3 transfers auto-minted correctly
- UI properly advanced to "Minted" state
- Both executed and minted events created with same transaction hash

### 💥 Breaking Change (August 22, 2025 - Commit 28a156e)
**Commit:** `28a156e fix: Add missing auto-completion event creation for Level 3 burn_tokens`
**Change:** Added auto-completion detection for burn_tokens
**Bug Introduced:** Used `this.sdk` instead of `sdk` parameter in createSuccessEvent

```typescript
// WRONG - this.sdk doesn't exist in this context
const transferState = await this.sdk.getTransferState(params.transferId);

// CORRECT - should use the sdk parameter
const transferState = await sdk.getTransferState(params.transferId);
```

### ❌ Broken State (August 22 - September 15, 2025)
- Execute transactions succeeded on blockchain (reached State 6)
- Auto-mint detection silently failed with "Cannot read properties of undefined"
- No minted events created
- UI stuck showing "Execute Transfer" button despite blockchain completion

## Root Cause Analysis

### 1. The Bug
In `lib/blockchain/enhanced/blockchain-service.ts`, the `createSuccessEvent` method receives an `sdk` parameter but incorrectly referenced `this.sdk` which doesn't exist:

```typescript
private async createSuccessEvent(
  action: V6ContractAction,
  params: BlockchainActionParams,
  txHash: string,
  eventData: any,
  sdk: any  // <-- SDK passed as parameter
): Promise<void> {
  // ...
  if (action === 'execute_transfer' && params.supportsTokenization) {
    try {
      // BUG: this.sdk doesn't exist, should be sdk
      const transferState = await this.sdk.getTransferState(params.transferId);
      // This line threw: Cannot read properties of undefined
    } catch (stateError) {
      // Error was silently caught and logged
      this.log('⚠️ Could not check contract state for auto-mint:', stateError.message);
    }
  }
}
```

### 2. Why It Wasn't Caught

1. **Silent Failure**: The error was caught in a try-catch block and only logged, not thrown
2. **Partial Success**: Transfers still executed on blockchain, just UI didn't update
3. **No Tests**: No automated tests for Level 3 auto-mint detection
4. **TypeScript Didn't Catch It**: `sdk` parameter was typed as `any`, so no compile-time error

### 3. Secondary Issues Found

During investigation, discovered custodian level mismatches:
- Custodians were Level 3 on blockchain but Level 2 in Firestore
- Admin UI only updated Firestore, not blockchain
- This compounded the problem by making new custodians unable to tokenize

## How V6 Auto-Mint Actually Works

**IMPORTANT:** For Level 3 custodians, the V6 contract auto-mints TRUSD tokens in the SAME transaction as execute_transfer:

```
execute_transfer(transferId) →
  1. Validates transfer state
  2. Marks transfer as executed (State 5)
  3. IF both custodians are Level 3:
     - Mints TRUSD tokens automatically
     - Advances to State 6 (Minted)
  4. All in ONE atomic transaction
```

This means:
- ✅ BOTH executed and minted events should have the SAME transaction hash
- ✅ This is NOT a duplicate - both events represent different aspects of ONE transaction
- ❌ Creating minted event without hash or with different hash is WRONG

## Fixes Applied

### 1. Fixed SDK Reference (September 15, 2025)
Changed all three instances from `this.sdk` to `sdk`:
- Line 1053: execute_transfer auto-mint detection
- Line 1559: send_funds auto-mint detection
- Line 1596: burn_tokens auto-completion detection

### 2. Fixed Custodian Level Sync
- Updated admin API to update blockchain BEFORE Firestore
- Created scripts to sync existing mismatches
- Added validation to prevent future mismatches

### 3. Created Missing Events
- Added minted events for stuck transfers
- Used same transaction hash as executed event (correct behavior)

## Prevention Measures

### 1. Code Quality
```typescript
// ✅ DO: Use proper TypeScript types
private async createSuccessEvent(
  action: V6ContractAction,
  params: BlockchainActionParams,
  txHash: string,
  eventData: any,
  sdk: V6ContractSDK  // <-- Proper type would catch this.sdk error
): Promise<void>

// ✅ DO: Fail loudly for critical paths
if (autoMintExpected && !autoMintDetected) {
  throw new Error('Auto-mint detection failed for Level 3 transfer');
}

// ❌ DON'T: Silently catch and continue
try {
  // critical operation
} catch (error) {
  console.log('Warning:', error);  // Too easy to miss
}
```

### 2. Testing Requirements

Create automated tests for Level 3 flows:

```javascript
// tests/level3-automint.test.js
describe('Level 3 Auto-Mint', () => {
  it('should create minted event with same hash as executed', async () => {
    const transfer = await createLevel3Transfer();
    await executeTransfer(transfer.id);

    const events = await getEvents(transfer.id);
    const executed = events.find(e => e.eventType === 'blockchain.v5.executed');
    const minted = events.find(e => e.eventType === 'blockchain.v5.minted');

    expect(minted).toBeDefined();
    expect(minted.transactionHash).toBe(executed.transactionHash);
  });

  it('should detect auto-mint from contract state', async () => {
    const transfer = await createLevel3Transfer();
    const result = await blockchainService.execute(transfer.id);

    expect(result.autoMinted).toBe(true);
    expect(result.finalState).toBe(6);
  });
});
```

### 3. Monitoring & Alerts

Add monitoring for Level 3 transfer health:

```javascript
// Monitor for stuck Level 3 transfers
async function checkLevel3Health() {
  // Find Level 3 transfers with executed but no minted event
  const stuck = await db.collection('events')
    .where('eventType', '==', 'blockchain.v5.executed')
    .where('data.level', '==', 3)
    .where('timestamp', '>', oneHourAgo)
    .get();

  for (const doc of stuck.docs) {
    const hasMintedevent = await checkForMintedEvent(doc.data().rolloverId);
    if (!hasMintedEvent) {
      await alertOps('Level 3 transfer stuck without minted event', {
        transferId: doc.data().rolloverId,
        executedAt: doc.data().timestamp
      });
    }
  }
}
```

### 4. Development Process

1. **Before Modifying Blockchain Service:**
   - Run existing Level 2 and Level 3 test transfers
   - Document current working behavior
   - Add tests for any new code paths

2. **Code Review Checklist:**
   - [ ] TypeScript compiles without errors
   - [ ] No `any` types in critical paths
   - [ ] All SDK references use correct variable
   - [ ] Error handling doesn't silently fail
   - [ ] Tests cover new functionality

3. **Post-Deployment Verification:**
   - [ ] Create test Level 3 transfer
   - [ ] Verify auto-mint creates minted event
   - [ ] Check both events have same transaction hash
   - [ ] Confirm UI advances properly

### 5. Documentation

Keep documentation of expected behavior:

```markdown
## Level 3 Transfer Expected Events

1. **Execute Transfer Called**
   - Event: blockchain.v5.executed
   - Hash: 0x123...
   - Contract State: Advances from 4 → 5 → 6 (atomic)

2. **Auto-Mint Detected**
   - Event: blockchain.v5.minted
   - Hash: 0x123... (SAME as executed)
   - Note: Happens in same transaction

3. **UI Updates**
   - Shows "Minted" status
   - No longer shows action buttons
```

## Lessons Learned

1. **TypeScript `any` is dangerous** - Proper types would have caught this at compile time
2. **Silent failures hide critical bugs** - Better to fail loudly and fix quickly
3. **"Working" code needs tests** - Without tests, working code becomes broken code
4. **Monitor what matters** - Level 3 auto-mint is critical, should have monitoring
5. **Document expected behavior** - Confusion about same vs different hashes caused issues

## Action Items

- [x] Fix SDK reference bug
- [x] Sync custodian levels
- [x] Create missing events
- [x] Document root cause
- [ ] Add TypeScript types to blockchain service
- [ ] Create Level 3 automated tests
- [ ] Set up monitoring for stuck transfers
- [ ] Add pre-commit hooks for TypeScript checks

## Contact

For questions about this incident:
- Check git blame on blockchain-service.ts
- Review commits around August 22, 2025
- Test Level 3 transfers on tokenization-test-custodian-1/2