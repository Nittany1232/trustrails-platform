# Investigation Analysis: Transfer v5-test-b7902072-6055-4258-9577-d8b769c10541

## Summary of Findings

**Transaction**: `0xf42fcb8f94d09355aaa4066acfc2f6969dfbc46ed12642a193bc3c0028489390`
**Status**: ✅ SUCCESS (Gas Used: 70,212)
**Contract**: `0x74903e40259Ce753B7d9c2C62BB9227D7D0b8B62` (NEW V6 Contract)

## Key Discovery: Function Called

The transaction called the `agreeSend` function with selector `0x5aaa4670`:

```solidity
agreeSend(bytes32,address,address,uint8,uint8,string)
```

### Decoded Parameters:
1. **transferId**: `0x633b513cb1435f4f53f39b0776cfd73f0781ea2dac1cf8f184a0277ca4e4b1db` (32-byte hash, NOT the string transfer ID)
2. **custodianSender**: `0x2f4cc8f4f2c1e13ddaa6fdae5b27a53aadcbc015`
3. **custodianReceiver**: `0x1b7974f64a93c0ca342415f269100b34623e283c`
4. **fromAccount**: `0` (uint8)
5. **toAccount**: `0` (uint8)
6. **senderRefId**: `"v5-test-b7902072-6055-4258-9577-d8b769c10541"` (44 bytes string)

## The Critical Issue: Transfer ID Hash vs String

### What Actually Happened:
1. **User reported**: "Financials can't be submitted without both parties agreeing first"
2. **Transaction evidence**: Shows `agreeSend` function was called successfully
3. **But contract queries fail**: `getTransfer(transferId)` returns "doesn't exist"

### Root Cause Analysis:
The V6 contract appears to use **two different transfer ID formats**:

1. **Hash-based ID**: `0x633b513cb1435f4f53f39b0776cfd73f0781ea2dac1cf8f184a0277ca4e4b1db`
   - Used internally by the contract for storage
   - This is what the `agreeSend` function actually used

2. **String-based ID**: `"v5-test-b7902072-6055-4258-9577-d8b769c10541"`
   - Used by the UI and API calls
   - This is what we're querying with `getTransfer()`

### Why getTransfer() Fails:
When we call `getTransfer("v5-test-b7902072-6055-4258-9577-d8b769c10541")`, the contract:
1. Takes the string ID
2. Converts it to bytes32 (different from the hash used in agreeSend)
3. Looks up using the wrong key
4. Returns "transfer doesn't exist"

But the transfer DOES exist under the hash key `0x633b513cb1435f4f53f39b0776cfd73f0781ea2dac1cf8f184a0277ca4e4b1db`.

## Firebase Events Timeline:
- ✅ `blockchain.v5.agreement` events (receiver and sender agreed)
- ✅ `blockchain.v5.financial` event (financial details provided)
- ❌ Multiple `blockchain.v5.executed.failed` events

The failed execution attempts were likely due to using the wrong transfer ID format when calling `executeTransfer()`.

## Transaction Success vs UI Confusion:
1. **Transaction `0xf42fcb8f...` DID succeed** - it was a sender agreement
2. **It used the hash-based transfer ID** internally
3. **Financial details were later provided** (per Firebase events)
4. **But UI/API queries use string IDs** and can't find the transfer

## Next Steps Required:
1. **Identify how the hash ID is calculated** from the string ID
2. **Check if there's a mapping function** in the contract
3. **Verify other transfers** use the same hash vs string pattern
4. **Update debugging scripts** to use the correct ID format
5. **Fix the executeTransfer calls** to use hash IDs instead of string IDs

## Implications:
This explains why:
- ✅ Individual blockchain transactions succeed
- ❌ Follow-up queries and execute calls fail
- ❌ The UI shows "transfer doesn't exist"
- ❌ But Firebase shows successful blockchain events

The issue is not with the contract state machine, but with **transfer ID format inconsistency** between:
- Contract internal storage (hash-based)
- API/UI queries (string-based)