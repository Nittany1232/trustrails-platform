# Empower Transfer Limit Detection Fix

## Issue Summary

The Empower custodian's transfer limit ($10,000) was not being detected on the financial details page, causing the system to fall back to default limits ($5,000,000) and display error messages.

## Root Cause Analysis

### 1. Data Storage Investigation

**Empower Custodian Data (Document ID: `ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8`):**
```json
{
  "name": "Empower",
  "maxTransferLimit": 1000000,  // $10,000 in cents - CORRECTLY STORED
  "status": "active",
  "level": 2,
  // ... other fields
}
```

✅ **Field name match confirmed**: The limit is stored as `maxTransferLimit` (1000000 cents = $10,000)

### 2. Hook Query Logic Investigation

**File: `/hooks/useCustodianLimits.ts` (Line 71)**
```typescript
// Hook correctly looks for the right field names:
const maxLimit = custodianData.maxTransferLimit || operations.maxTransferLimit;
```

✅ **Hook logic is correct**: Looks for `maxTransferLimit` at root level and in `operations` object

### 3. Database Query Bug Discovered

**File: `/lib/server-custodians.ts` - `getCustodianById()` function**

**BROKEN IMPLEMENTATION:**
```typescript
// Searches for documents with an 'id' FIELD matching the custodianId
const querySnapshot = await adminDb.collection('custodians')
  .where('id', '==', custodianId).limit(1).get();
```

**PROBLEM:** Empower custodian document does NOT have an `id` field - it uses the document ID as the identifier.

**VERIFICATION:**
- ❌ Query `where('id', '==', 'ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8')` returns EMPTY
- ✅ Direct access `doc('ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8').get()` returns the document

## Impact Analysis

### Data Flow Breakdown:
1. **Financial Details Page** → calls `useCustodianLimits('ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8')`
2. **Hook** → calls `/api/custodians?custodianId=ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8`
3. **API Route** → calls `getCustodianById('ad6fe4e9-632b-4ba4-bd3f-dbde109d6ee8')`
4. **getCustodianById** → ❌ **BROKEN QUERY RETURNS NULL**
5. **API** → returns 404 Not Found
6. **Hook** → falls back to DEFAULT_LIMITS ($5M)
7. **UI** → shows "Could not load transfer limits. Using default restrictions."

## Fix Implementation

### Fixed Function (`/lib/server-custodians.ts`)

```typescript
export async function getCustodianById(custodianId: string): Promise<any | null> {
  try {
    // PRIMARY: Get document by document ID (standard approach)
    const docRef = await adminDb.collection('custodians').doc(custodianId).get();

    if (docRef.exists) {
      return { id: docRef.id, ...docRef.data() };
    }

    // FALLBACK: Search by 'id' field (for backward compatibility)
    const querySnapshot = await adminDb.collection('custodians')
      .where('id', '==', custodianId).limit(1).get();

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }

    return null;
  } catch (error) {
    console.error('Error fetching custodian:', error);
    throw new Error('Failed to fetch custodian. Please try again.');
  }
}
```

### Why Hybrid Approach?

**Analysis of custodian collection:**
- 12/18 custodians have an `id` field
- 6/18 custodians (including Empower) only use document ID
- Hybrid approach ensures backward compatibility

## Expected Results After Fix

### Before Fix (Broken):
- ❌ API returns 404 Not Found for Empower
- ❌ Hook displays "Could not load transfer limits" error
- ❌ Uses default $5,000,000 maximum limit
- ❌ No proper transfer validation

### After Fix (Working):
- ✅ API returns Empower custodian data with `maxTransferLimit: 1000000`
- ✅ Hook shows `limits.hasLimits: true`
- ✅ UI displays "Transfer limits: $1.00 - $10,000.00"
- ✅ Proper transfer validation against $10,000 limit
- ✅ No error messages about missing limits

## Verification

### Test Scripts Created:
1. `/scripts/test-empower-transfer-limit.js` - Demonstrates the bug
2. `/scripts/fix-custodian-query-bug.js` - Tests the fix approach
3. `/scripts/test-empower-limit-fix.js` - Verifies end-to-end fix

### Test Results:
```bash
node scripts/test-empower-limit-fix.js
# ✅ FIX VERIFIED: Empower transfer limits will now be detected correctly!
```

## Files Modified

- **`/lib/server-custodians.ts`** - Fixed `getCustodianById()` function with hybrid query approach

## Components Affected

- **Primary**: `FinancialTab.tsx` (line 127 error message will no longer show)
- **Hook**: `useCustodianLimits.ts` (will receive correct data instead of null)
- **API**: `/api/custodians` route (will return Empower data instead of 404)

## Testing Checklist

After deployment:
- [ ] Navigate to a rollover with Empower as source custodian
- [ ] Check financial details page
- [ ] Verify "Transfer limits: $1.00 - $10,000.00" is displayed
- [ ] Confirm no "Could not load transfer limits" error message
- [ ] Test transfer validation with amounts > $10,000 (should be rejected)
- [ ] Test transfer validation with amounts < $10,000 (should be accepted)

## Related Investigation Scripts

- **Debug Script**: `scripts/check-empower-custodian.js` - Shows Empower custodian has correct data
- **Verification**: All scripts confirm Empower's `maxTransferLimit: 1000000` exists in Firebase

## Notes

This fix resolves the transfer limit detection for Empower specifically, but the hybrid approach ensures all custodians continue to work regardless of whether they use document IDs or embedded `id` fields for identification.