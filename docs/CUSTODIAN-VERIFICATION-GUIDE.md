# Custodian Verification Guide

This guide documents the process for verifying custodian wallet addresses on TrustRails smart contracts.

## Overview

Custodian verification is a critical security process that whitelists custodian wallet addresses on the smart contract, allowing them to participate in rollover transfers. Only verified custodians can initiate or receive transfers.

## Verification Scripts

### Batch Verification (Recommended)

```bash
node scripts/verify-all-custodians-v3.js
```

**What it does:**
- Fetches all custodians from Firestore
- Validates wallet addresses (handles checksum automatically)
- Batch verifies all valid addresses on the V3 contract
- Reports detailed results for each custodian

**Sample Output:**
```
✅ Custodian 'Demo Custodian' verified: 0x1234...
❌ Custodian 'Test Custodian' failed: Invalid address checksum
✅ Platform wallet verified with OPERATOR role
📊 Results: 9/10 custodians verified successfully
```

### Individual Verification

For verifying specific custodian addresses:

```javascript
// Example script structure
const { RolloverEscrowV3SDK } = require('../modules/eth-sdk/src');

async function verifySingleCustodian(address) {
  const sdk = new RolloverEscrowV3SDK();
  
  // Validate address format
  if (!ethers.utils.isAddress(address)) {
    throw new Error('Invalid address format');
  }
  
  // Convert to proper checksum
  const checksumAddress = ethers.utils.getAddress(address);
  
  // Verify on contract
  await sdk.verifyCustodian(checksumAddress);
  console.log(`✅ Verified: ${checksumAddress}`);
}
```

### Verification Status Check

```bash
node scripts/verify-whitelist-success-v3.js
```

Checks which custodians are currently verified on the contract.

## Verification Requirements

### Address Format
- Must be valid Ethereum address (42 characters, starting with 0x)
- Automatically converted to proper checksum format
- Invalid addresses are skipped with error message

### Permissions
- Only accounts with OPERATOR_ROLE can verify custodians
- Platform wallet should have OPERATOR_ROLE (granted during deployment)
- Contract admin can grant OPERATOR_ROLE to additional accounts

### Contract State
- Contract must not be paused
- Contract must be properly deployed and responding

## Custodian Data Structure

Custodians in Firestore should have this structure:

```javascript
{
  id: "custodian_123",
  name: "Demo Custodian",
  walletAddress: "0x1234567890123456789012345678901234567890",
  type: "platform" | "byow",
  isActive: true,
  // ... other fields
}
```

## Role Management

### Granting Operator Role

```bash
node scripts/grant-operator-role-v3.js
```

This script grants OPERATOR_ROLE to the platform wallet, enabling it to verify custodians.

### Checking Roles

```javascript
// Check if address has operator role
const hasRole = await contract.hasRole(OPERATOR_ROLE, address);
console.log(`Has operator role: ${hasRole}`);
```

## Error Handling

### Common Errors and Solutions

1. **"Invalid address checksum"**
   - **Cause**: Address format doesn't match EIP-55 checksum
   - **Solution**: Scripts automatically handle checksum conversion
   - **Manual fix**: Use `ethers.utils.getAddress(address)`

2. **"AccessControl: account 0x... is missing role"**
   - **Cause**: Calling account lacks OPERATOR_ROLE
   - **Solution**: Grant OPERATOR_ROLE or use account that has it
   - **Check**: `await contract.hasRole(OPERATOR_ROLE, account.address)`

3. **"Contract is paused"**
   - **Cause**: Contract is in paused state
   - **Solution**: Unpause contract (admin only)
   - **Check**: `await contract.paused()`

4. **"Transaction failed"**
   - **Cause**: Various (gas, network, contract state)
   - **Solution**: Check transaction details on Etherscan
   - **Debug**: Use verbose logging in scripts

## Verification Workflow

### For New Custodians

1. **Create custodian in Firestore**
   ```javascript
   const custodianData = {
     name: "New Custodian",
     walletAddress: "0x...",
     type: "platform",
     isActive: true
   };
   await db.collection('custodians').add(custodianData);
   ```

2. **Verify the custodian**
   ```bash
   node scripts/verify-all-custodians-v3.js
   ```

3. **Confirm verification**
   ```bash
   node scripts/verify-whitelist-success-v3.js
   ```

### For Existing Custodians (New Contract)

1. **Deploy new contract** (see Contract Deployment Guide)

2. **Grant operator role to platform wallet**
   ```bash
   node scripts/grant-operator-role-v3.js
   ```

3. **Batch verify all existing custodians**
   ```bash
   node scripts/verify-all-custodians-v3.js
   ```

4. **Verify success**
   ```bash
   node scripts/verify-whitelist-success-v3.js
   ```

## Script Implementation Details

### Address Validation
```javascript
function validateAddress(address) {
  if (!address || !ethers.utils.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return ethers.utils.getAddress(address); // Returns checksummed address
}
```

### Batch Processing
```javascript
async function verifyAllCustodians() {
  const custodians = await fetchCustodiansFromFirestore();
  const results = [];
  
  for (const custodian of custodians) {
    try {
      const checksumAddress = validateAddress(custodian.walletAddress);
      await sdk.verifyCustodian(checksumAddress);
      results.push({ custodian: custodian.name, status: 'success' });
    } catch (error) {
      results.push({ custodian: custodian.name, status: 'failed', error: error.message });
    }
  }
  
  return results;
}
```

### Error Recovery
- Scripts continue processing even if individual verifications fail
- Detailed error reporting for debugging
- Retry logic for network issues

## Security Considerations

1. **Operator Role Management**
   - Only trusted accounts should have OPERATOR_ROLE
   - Regularly audit accounts with verification permissions
   - Consider multi-sig for critical operations

2. **Address Validation**
   - Always validate addresses before verification
   - Use checksum addresses to prevent typos
   - Double-check addresses against known custodian data

3. **Contract State**
   - Verify contract is not paused before batch operations
   - Monitor for unusual verification patterns
   - Keep audit logs of verification activities

## Monitoring and Maintenance

### Regular Checks
- Monthly verification status audit
- Monitor for failed verifications in logs
- Check for new custodians needing verification

### Automation Opportunities
- Auto-verify new custodians on creation
- Monitor Firestore changes for new wallet addresses
- Alert on verification failures

## Integration with TrustRails

### Frontend Integration
- Custodian dashboard shows verification status
- Admin panel for manual verification
- Real-time status updates

### API Integration
- Verification status in custodian API responses
- Webhook notifications for verification events
- Batch verification via admin API

### Database Sync
- Keep Firestore in sync with contract state
- Cache verification status for performance
- Regular reconciliation between DB and blockchain