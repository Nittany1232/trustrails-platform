# BYOW Financial Visibility Fix

## Problem
BYOW (Bring Your Own Wallet) financial events are missing `sourceCustodianId` and `destinationCustodianId`, causing unreliable visibility for counterparties.

## Root Cause
1. BYOW executes transactions directly from the UI using `byowExecutionHelper.executeSecureAction()`
2. The UI doesn't pass `sourceCustodianId` and `destinationCustodianId` parameters
3. Financial events are created without these IDs, relying on fallback visibility logic

## Current State of Fix

### ✅ Completed
1. **Modified `/lib/blockchain/enhanced/byow-execution-helper.ts`** (lines 448-471)
   - Now expects `params.sourceCustodianId` and `params.destinationCustodianId`
   - Adds these to financial event data when action is `provide_financial`
   - Logs warning if IDs are missing

### ❌ Still Needed
1. **Update UI code that calls BYOW execution helper**
   - Find where `byowExecutionHelper.executeSecureAction()` is called for `provide_financial`
   - Pass the custodian IDs from rollover context:
   ```javascript
   await byowExecutionHelper.executeSecureAction('provide_financial', {
     ...existingParams,
     sourceCustodianId: rollover.sourceCustodianId,      // Add this
     destinationCustodianId: rollover.destinationCustodianId  // Add this
   });
   ```

## Why This Fix is Safe

1. **Fallback visibility remains intact** (lines 391-392 in `custodian-state-computer.ts`)
   - When both IDs are missing, both parties can still see financial data
   - Existing transfers continue to work

2. **No breaking changes**
   - Old events without IDs still work via fallback
   - New events with IDs have better visibility control
   - Non-BYOW flows are unaffected

3. **Multiple event sources provide redundancy**
   - v5-client creates events with IDs
   - API/enhanced blockchain service creates events with IDs
   - BYOW will create events with IDs once UI is updated

## Testing Results

All recent financial events are using fallback visibility (missing custodian IDs):
- BYOW as source: ⚠️ Using fallback
- BYOW as destination: ⚠️ Using fallback  
- Level 3 to Level 3: ⚠️ Using fallback

This is working but not ideal. Once the UI is updated to pass custodian IDs, new BYOW financial events will have proper visibility control.

## Next Steps

1. Search for UI code that calls `byowExecutionHelper.executeSecureAction`
2. Update it to pass `sourceCustodianId` and `destinationCustodianId` from rollover context
3. Test with a new BYOW transfer to verify IDs are included
4. Verify both parties can see financial details properly

## Files Modified
- `/lib/blockchain/enhanced/byow-execution-helper.ts` - Ready to receive custodian IDs