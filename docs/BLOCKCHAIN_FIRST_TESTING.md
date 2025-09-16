# Blockchain-First Workflow Testing Guide

## Overview

The blockchain-first workflow enhances the existing TrustRails system with:
- **Direct blockchain execution** with retry logic
- **Real-time WebSocket events** (when WSS_URL is configured)
- **Per-transfer feature flags** for controlled testing
- **Automatic fallback** to legacy service on errors

## 🚀 Quick Start Testing

### 1. Enable Blockchain-First for a Transfer

```bash
# Enable enhanced blockchain service for a specific transfer
node scripts/manage-blockchain-first.js enable your-transfer-id-here

# Check if it's enabled
node scripts/manage-blockchain-first.js status your-transfer-id-here
```

### 2. Execute Blockchain Actions

Now when you call the blockchain execute API for that transfer, it will use the enhanced service:

```bash
# The API call remains the same - the feature flag controls which service is used
curl -X POST /api/blockchain/execute \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "agree_send",
    "rolloverId": "your-transfer-id-here",
    "custodianId": "your-custodian-id"
  }'
```

### 3. Monitor Enhanced Logs

Look for these log patterns:
```
🚀 BLOCKCHAIN-FIRST: Enhanced service enabled for transfer: your-transfer-id-here
[EnhancedBlockchain] 🚀 Executing blockchain action: agree_send_your-transfer-id-here
[RetryManager] 🔄 Executing agree_send_your-transfer-id-here (attempt 1/3)
✅ BLOCKCHAIN-FIRST: Enhanced service completed
```

### 4. Disable When Done Testing

```bash
node scripts/manage-blockchain-first.js disable your-transfer-id-here
```

## 🔧 Advanced Configuration

### Environment Variables

Add to your `.env.local` for WebSocket support:
```env
# Enable real-time blockchain events (optional)
SEPOLIA_WSS_URL=wss://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Required for enhanced service
PLATFORM_WALLET_PRIVATE_KEY=your_platform_wallet_key
NEXT_PUBLIC_ROLLOVER_ESCROW_V5_ADDRESS=0xc2B0C01cCcEEB8d5CF53B8E2109B2F3911CDbAbE
NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
```

### Feature Flag Options

You can customize the enhanced service features:

```bash
# Enable with specific options (programmatically)
const transferFlags = getTransferFlagsService(adminDb);
await transferFlags.enableBlockchainFirst('transfer-id', {
  enableWebSocket: true,    // Real-time events
  enableRetry: true,        // Automatic retry on failures
  enableGasOptimization: true,  // Smart gas estimation
  debugLogging: true        // Detailed console logs
});
```

## 📊 Testing Scenarios

### Scenario 1: Basic Agreement Flow

1. **Enable blockchain-first**: `node scripts/manage-blockchain-first.js enable test-transfer-1`
2. **Execute agree_receive**: Call API with `action: "agree_receive"`
3. **Execute agree_send**: Call API with `action: "agree_send"`
4. **Verify events**: Check Firestore events collection for `blockchain.v5.agreement` events
5. **Compare timing**: Note the transaction speed vs legacy service

### Scenario 2: Complete Tokenized Transfer (Level 3)

1. **Create Level 3 → Level 3 transfer** (both custodians must be Level 3)
2. **Enable blockchain-first**: `node scripts/manage-blockchain-first.js enable level3-transfer`
3. **Full workflow**:
   - `agree_receive` 
   - `agree_send`
   - `provide_financial`
   - `execute_transfer` (auto-mints tokens)
   - `burn_tokens` (completes transfer)
4. **Verify tokenization**: Check for `blockchain.v5.minted` and `blockchain.v5.burned` events

### Scenario 3: Error Handling & Retry

1. **Enable blockchain-first** with debug logging
2. **Simulate network issues** (disconnect WiFi briefly during transaction)
3. **Verify retry logic**: Look for retry attempt logs
4. **Check fallback**: Verify it falls back to legacy on permanent failures

### Scenario 4: WebSocket Real-Time Events

1. **Configure SEPOLIA_WSS_URL** in environment
2. **Enable blockchain-first** for a transfer
3. **Execute actions** and watch for real-time event logs:
   ```
   [RealTimeEvents] 📡 Real-time agreement event for transfer-id
   [RealTimeEvents] ✅ Processed agreement event for transfer-id
   ```

## 🔍 Debugging

### Common Issues

**1. "Platform wallet private key not found"**
```
❌ Enhanced service failed: Platform wallet private key not found
🔄 Falling back to legacy service...
```
- Check `PLATFORM_WALLET_PRIVATE_KEY` environment variable
- Verify Secret Manager access (if using GCP)

**2. "Contract state validation failed"**
```
❌ Cannot execute agree_send. Current state: 1, Required: 0 or 1
```
- Check current contract state: existing agreements may already be in place
- Use the debug script to check contract state

**3. WebSocket connection issues**
```
❌ WebSocket error: connection failed
```
- Verify `SEPOLIA_WSS_URL` is correctly configured
- Check if Alchemy WebSocket quota is exceeded

### Debug Commands

```bash
# Check all enabled transfers
node scripts/manage-blockchain-first.js list

# Check specific transfer status
node scripts/manage-blockchain-first.js status transfer-id

# Enable debug mode for a transfer (programmatically)
# This will show detailed logs for all operations
```

### Monitoring Logs

Key log patterns to watch:

**Enhanced Service Activation**:
```
🚀 BLOCKCHAIN-FIRST: Enhanced service enabled for transfer: xxx
```

**Successful Execution**:
```
✅ BLOCKCHAIN-FIRST: Enhanced service completed: {...}
```

**Fallback to Legacy**:
```
❌ BLOCKCHAIN-FIRST: Enhanced service failed: error details
🔄 BLOCKCHAIN-FIRST: Falling back to legacy service...
```

**Retry Logic**:
```
[RetryManager] ⚠️ operation_name failed on attempt 1: error message
[RetryManager] ⏳ Waiting 2000ms before retry...
[RetryManager] 🔄 Executing operation_name (attempt 2/3)
```

## 📈 Performance Comparison

### Metrics to Track

1. **Transaction Latency**: Time from API call to transaction confirmation
2. **Gas Usage**: Compare gas consumption between services
3. **Success Rate**: Monitor error rates and retry effectiveness
4. **Event Sync Speed**: Time from blockchain event to database event

### Expected Improvements

- **Latency**: 30-40% faster due to direct blockchain communication
- **Reliability**: Automatic retry on transient failures
- **Real-time Updates**: Instant state updates via WebSocket (when configured)
- **Better Error Handling**: Classified errors with appropriate retry strategies

## 🔒 Safety Features

### Automatic Fallback

If the enhanced service fails, it automatically falls back to the legacy service:
```
❌ BLOCKCHAIN-FIRST: Enhanced service failed: connection timeout
🔄 BLOCKCHAIN-FIRST: Falling back to legacy service...
[Legacy service continues execution...]
```

### Per-Transfer Control

Feature flags are per-transfer, so you can:
- Test one transfer at a time
- Compare side-by-side with legacy transfers
- Quickly disable if issues arise

### Event Consistency

Both enhanced and legacy services create the same event structure, ensuring:
- UI compatibility
- Analytics consistency
- Audit trail completeness

## 🎯 Next Steps

After testing the basic functionality:

1. **Monitor gas optimization** effectiveness
2. **Test state reconciliation** (upcoming feature)
3. **Implement monitoring dashboards** for production readiness
4. **Document performance improvements** for broader rollout

The blockchain-first workflow is designed to be a drop-in enhancement that preserves all existing functionality while providing significant performance and reliability improvements.