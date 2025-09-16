# V5 UI Testing and Troubleshooting Guide

## Quick Start Testing

### 1. Initialize Custodian Levels
```bash
# First, set up custodian levels for V5 tokenization
curl -X POST https://your-domain.com/api/admin/custodian/setup-levels

# Verify setup
curl https://your-domain.com/api/admin/custodian/setup-levels
```

### 2. Test Scenarios

#### Scenario A: Level 3 → Level 3 (Full Tokenization)
- **Custodians**: Platform Custodian ↔ MetaMask (BYOW)
- **Expected Flow**: Agreement → Financial → Execution → Auto-Mint → Auto-Burn
- **UI Elements**: All V5 buttons should appear
- **Tokenization**: TRUSD tokens automatically created

#### Scenario B: Level 1 → Level 1 (Standard Flow)
- **Custodians**: Traditional ↔ Traditional
- **Expected Flow**: Agreement → Financial → Execution → Complete
- **UI Elements**: V5 buttons but no tokenization options
- **Tokenization**: Not available

#### Scenario C: Mixed Levels (Partial Features)
- **Custodians**: Level 1 ↔ Level 3
- **Expected Flow**: Standard V5 flow without tokenization
- **UI Elements**: V5 buttons, tokenization grayed out
- **Tokenization**: Disabled with explanation

## Debug Tools

### 1. Browser Console Logs
Look for these V5-specific log patterns:

```javascript
// Action starts
🚀 V5 ACTION START: agree_send for rollover rollover-123

// State transitions  
🔄 V5 STATE TRANSITION: blockchain.v5.agreement → awaiting_receiver

// Tokenization checks
🪙 V5 TOKENIZATION CHECK: source-custodian (L3) → dest-custodian (L3)

// Contract interactions
📋 V5 CONTRACT CALL: agreeSend

// Success/failure
✅ V5 ACTION SUCCESS: agree_send completed
❌ V5 ACTION FAILED: provide_financial failed
```

### 2. Debug Dashboard
Access comprehensive debugging information:
```
GET /api/debug/v5/{rolloverId}
```

**Returns:**
- Current rollover state
- V5 flow analysis (which phase, what's missing)
- Custodian levels and tokenization support
- Recent errors with suggestions
- Troubleshooting tips

### 3. Export Debug Logs
```bash
curl -X POST /api/debug/v5/{rolloverId} > debug-logs.json
```

## Common Issues and Solutions

### Issue 1: "Tokenization not supported"
**Symptoms**: Mint/burn buttons disabled, no TRUSD creation
**Cause**: One or both custodians are not Level 3
**Debug**: 
```bash
curl /api/custodians/{custodianId}/level
```
**Solution**: 
```bash
curl -X POST /api/custodians/{custodianId}/level \
  -d '{"level": 3, "walletAddress": "0x...", "updatedBy": "admin"}'
```

### Issue 2: "Financial data required"
**Symptoms**: `provide_financial` action fails
**Cause**: Missing or invalid financial breakdown
**Debug**: Check browser console for validation errors
**Solution**: Ensure fund sources sum to gross amount:
```javascript
{
  employeePreTaxAmount: 50000,
  employerMatchAmount: 25000, 
  rothAmount: 0,
  afterTaxAmount: 25000,
  grossAmount: 100000, // Must equal sum above
  taxYear: 2024
}
```

### Issue 3: MetaMask Connection Issues
**Symptoms**: BYOW actions fail with wallet errors
**Debug Logs**:
```javascript
🦊 V5 BYOW INTERACTION: MetaMask disconnected
```
**Solution**: 
1. Check MetaMask is connected to correct network (Sepolia)
2. Verify account has sufficient ETH for gas
3. Check browser console for wallet connection errors

### Issue 4: "Event service not available"
**Symptoms**: Warning in BYOW transactions
**Cause**: Expected behavior - BYOW creates events via API
**Debug**: Look for successful API event creation after transaction
**Solution**: No action needed if transaction succeeds

### Issue 5: Stuck in "Awaiting Financial Verification"
**Symptoms**: Both parties agreed but can't proceed
**Debug**: Check if V5 financial event exists
**Solution**: Source custodian needs to click "Submit Financial Details"

## Logging Levels

### Console Log Prefixes
- `🚀` Action Start
- `✅` Success 
- `❌` Error
- `🔄` State Change
- `🪙` Tokenization
- `📋` Contract Call
- `💰` Financial Validation
- `📝` Event Creation
- `🌐` API Call
- `🦊` MetaMask/BYOW

### Debug Data Structure
Each log includes:
```javascript
{
  context: {
    rolloverId: "rollover-123",
    action: "agree_send", 
    custodianId: "custodian-456",
    timestamp: "2024-06-19T19:00:00Z"
  },
  // Additional data specific to log type
}
```

## Testing Checklist

### Pre-Test Setup
- [ ] V5 contracts deployed to Sepolia
- [ ] Environment variables set (V5 contract addresses)
- [ ] Custodian levels initialized via admin API
- [ ] MetaMask connected to Sepolia testnet

### V5 Flow Testing
- [ ] Both custodians can agree (Phase 1)
- [ ] Source custodian can provide financial details (Phase 2) 
- [ ] Either party can execute transfer (Phase 3)
- [ ] Level 3 → Level 3 transfers auto-mint TRUSD tokens
- [ ] Tokens auto-burn after settlement simulation
- [ ] State correctly updates through each phase
- [ ] UI buttons appear/disappear appropriately

### Error Handling
- [ ] Invalid financial data shows validation errors
- [ ] Non-Level 3 transfers don't show tokenization
- [ ] MetaMask rejection handled gracefully
- [ ] API failures show appropriate error messages
- [ ] Retry mechanism works for transient failures

### Analytics Integration
- [ ] V5 events appear in analytics dashboard
- [ ] Transfer amounts calculated correctly from V5 events
- [ ] Volume charts include V5 transfers
- [ ] State transitions tracked properly

## Performance Monitoring

### Key Metrics
- V5 action completion time
- MetaMask interaction latency  
- Contract gas usage
- API response times
- Error rates by action type

### Browser Performance
- Monitor memory usage during BYOW transactions
- Check for console errors/warnings
- Verify no memory leaks in long sessions

## Support Information

### When Filing Bug Reports Include:
1. Rollover ID
2. Export from `/api/debug/v5/{rolloverId}`
3. Browser console logs (filter by "V5")
4. Screenshots of UI state
5. Steps to reproduce
6. Expected vs actual behavior

### Emergency Rollback
If V5 causes critical issues:
1. V4 contracts remain fully functional
2. Existing transfers complete normally
3. New transfers can be forced to V4 if needed
4. Analytics continue working with mixed V4/V5 data

## Advanced Debugging

### Database Inspection
```javascript
// Check V5 events directly
db.collection('events')
  .where('rolloverId', '==', 'rollover-123')
  .where('eventType', '>=', 'blockchain.v5.')
  .where('eventType', '<', 'blockchain.v5.z')
  .get();

// Check custodian levels
db.collection('custodian_levels').doc('custodian-id').get();

// Check rollover state  
db.collection('rollover_states').doc('rollover-123').get();
```

### Manual Event Creation (Emergency Only)
```bash
curl -X POST /api/events/append \
  -d '{
    "rolloverId": "rollover-123",
    "eventType": "blockchain.v5.agreement", 
    "data": {...},
    "metadata": {...}
  }'
```

### Contract Verification
```javascript
// Check V5 contract state directly
const contract = new ethers.Contract(V5_ADDRESS, V5_ABI, provider);
const transferState = await contract.getTransferState(transferId);
const custodianLevel = await contract.getCustodianLevel(custodianAddress);
const supportsTokenization = await contract.supportsTokenization(transferId);
```