# Blockchain-First Workflow: Verification & Troubleshooting Guide

## How to Verify Blockchain-First is Active

### 1. Check Console Logs

When blockchain-first is enabled for a transfer, you'll see these key log messages:

```
🚀 BLOCKCHAIN-FIRST: Enhanced service enabled for transfer: [transferId]
```

If it's NOT enabled, you'll see the legacy flow:
```
🔄 Using legacy blockchain service for: { action, rolloverId }
```

### 2. Feature Flag Status

The blockchain-first workflow uses a per-transfer feature flag system. To check if a transfer has blockchain-first enabled:

```javascript
// In Firebase Console or via API
// Collection: transfer_feature_flags
// Document ID: [transferId]
{
  blockchainFirst: true,        // This must be true for blockchain-first
  enableWebSocket: true,        // WebSocket support
  enableRetry: true,            // Retry logic enabled
  enableGasOptimization: true,  // Gas optimization
  debugLogging: true,           // Verbose logging
  createdAt: "2025-01-11T..."
}
```

### 3. Enable Blockchain-First for a Transfer

To enable blockchain-first for a specific transfer:

```bash
# Via the test endpoint
POST /api/test-data/enable-blockchain-first
{
  "transferId": "your-transfer-id"
}
```

Or programmatically:
```javascript
const transferFlags = getTransferFlagsService(adminDb);
await transferFlags.enableBlockchainFirst('your-transfer-id', {
  enableWebSocket: true,
  enableRetry: true,
  enableGasOptimization: true,
  debugLogging: true
});
```

## Key Differences: Blockchain-First vs Legacy

### Blockchain-First Enhanced Service
- ✅ **Retry Logic**: Automatic retry on network errors (up to 3 attempts)
- ✅ **WebSocket Support**: Real-time event monitoring
- ✅ **Gas Optimization**: Smart gas pricing
- ✅ **Better Error Handling**: Classified errors with specific recovery
- ✅ **Debug Logging**: Detailed console output with emojis

### Legacy Service
- ❌ Single attempt, fails on network issues
- ❌ HTTP polling only
- ❌ Fixed gas estimates
- ❌ Basic error messages
- ❌ Minimal logging

## Console Log Patterns to Watch

### Successful Blockchain-First Flow

```
🚀 BLOCKCHAIN-FIRST: Enhanced service enabled for transfer: v5-test-xxx
🚀 Executing blockchain action: agree_send_v5-test-xxx
✅ Contract state validated: 0 is valid for agree_send
🔄 Executing agree_send_v5-test-xxx (attempt 1/3)
✅ agree_send_v5-test-xxx completed successfully
✅ BLOCKCHAIN-FIRST: Transaction successful
```

### Retry in Action

```
🔄 Executing agree_send_v5-test-xxx (attempt 1/3)
⚠️ agree_send_v5-test-xxx failed (attempt 1), retrying: network error
🔄 Refreshing nonce for agree_send_v5-test-xxx
🔄 Executing agree_send_v5-test-xxx (attempt 2/3)
✅ agree_send_v5-test-xxx completed successfully
```

### Error with Classification

```
❌ agree_send_v5-test-xxx failed permanently: contract reverted
// Look for error classification:
// - network: Retryable network issue
// - gas_estimate: Gas estimation failed
// - nonce_conflict: Nonce already used
// - contract_revert: Smart contract rejected (not retryable)
// - user_rejection: User cancelled in wallet
```

## Troubleshooting Common Issues

### 1. "Transfer not using blockchain-first"

**Check:**
```bash
# In browser console while on dashboard
console.log('Checking transfer flags...')
// Look for the transfer in Firebase > transfer_feature_flags collection
```

**Fix:**
Enable blockchain-first for the transfer (see section 3 above)

### 2. "Transaction failing with retry"

**Check logs for:**
- Error classification
- Retry attempts
- Final error message

**Common causes:**
- **Network errors**: Usually resolve with retry
- **Gas issues**: Check if gas price is too low
- **Contract state**: Transfer might be in wrong state
- **Nonce conflicts**: Platform wallet might have pending transactions

### 3. "Cannot find enhanced service logs"

**Verify:**
1. Feature flag is enabled for transfer
2. You're using the `/api/blockchain/execute` endpoint
3. Check browser Network tab for the API call
4. Look for server-side logs (not browser console)

### 4. "WebSocket not connecting"

**Check:**
- `SEPOLIA_WSS_URL` environment variable is set
- WebSocket URL is valid (wss://...)
- No firewall blocking WebSocket connections

## Debug Commands

### Check Transfer State
```javascript
// In browser console
const transferId = 'your-transfer-id';
const response = await fetch(`/api/blockchain/verify?transferId=${transferId}`);
const data = await response.json();
console.log('Transfer state:', data);
```

### List All Blockchain-First Transfers
```javascript
// Need admin access
const response = await fetch('/api/admin/blockchain-first/list');
const transfers = await response.json();
console.log('Blockchain-first enabled transfers:', transfers);
```

### Force Retry Logic Test
```javascript
// Temporarily disconnect network or use wrong RPC URL
// Should see retry attempts in logs
```

## Performance Metrics

When blockchain-first is working correctly, you should see:

1. **Transaction Confirmation**: < 30 seconds (vs 60+ seconds legacy)
2. **Retry Success Rate**: > 95% for network errors
3. **Gas Optimization**: 10-15% savings on average
4. **Error Recovery**: Automatic recovery from transient errors

## Advanced Debugging

### Enable Maximum Logging

Set all debug flags:
```javascript
await transferFlags.enableBlockchainFirst(transferId, {
  enableWebSocket: true,
  enableRetry: true,
  enableGasOptimization: true,
  debugLogging: true  // This enables verbose logs
});
```

### Monitor Network Traffic

1. Open Browser DevTools > Network tab
2. Filter by "blockchain"
3. Look for `/api/blockchain/execute` calls
4. Check request payload and response

### Check Event Stream

Blockchain-first creates specific events:
- `blockchain.v5.agreement.pending` - Before transaction
- `blockchain.v5.agreement` - After success
- `blockchain.v5.agreement.failed` - On failure

## Recovery Procedures

### If Transaction Succeeds but Event Creation Fails

You'll see:
```json
{
  "success": true,
  "transactionHash": "0x...",
  "warning": "Transaction succeeded but event creation failed",
  "needsRecovery": true,
  "recoveryInfo": {
    "action": "agree_send",
    "rolloverId": "xxx",
    "blockchainSucceeded": true,
    "eventFailed": true
  }
}
```

**Recovery:** The system should auto-reconcile, or manually create the missing event.

### If Transfer Gets Stuck

1. Check actual blockchain state: `/api/blockchain/verify?transferId=xxx`
2. Compare with database events
3. Use state reconciliation service (Phase 2 feature)

## Summary Checklist

✅ **Blockchain-First is Active When:**
- Console shows "🚀 BLOCKCHAIN-FIRST: Enhanced service enabled"
- Transfer has feature flag `blockchainFirst: true`
- Retry attempts appear in logs
- Enhanced error messages with classification
- WebSocket connection logs (if enabled)

❌ **Using Legacy Flow When:**
- Console shows "🔄 Using legacy blockchain service"
- No retry attempts on errors
- Basic error messages
- No feature flag for transfer

## Need Help?

1. Check server logs for detailed error messages
2. Verify feature flags in Firebase
3. Test with debug logging enabled
4. Use `/test/blockchain` for controlled testing