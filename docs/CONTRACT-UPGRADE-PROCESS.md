# Contract Upgrade Process

This guide documents how to upgrade to a new smart contract version with minimal code changes.

## Architecture Overview

The TrustRails contract integration is centralized through a single configuration file that abstracts SDK versions and contract details. This allows upgrading from V3 → V4 → V5 etc. with changes to only one file.

### Centralized Configuration

All contract interactions go through:
```
lib/blockchain/rollover-contract-client.ts
```

This file exports:
- Current SDK version (aliased as `CurrentRolloverSDK`)
- Contract configuration (address, ABI, execution delays)
- Utility functions for type conversion
- Standard interfaces for transaction results

### Files That Use Contract Integration

When upgrading contracts, these files automatically inherit the new version:

1. **`app/api/blockchain/execute/route.ts`** - Platform wallet blockchain operations
2. **`lib/services/contract-verification-service.ts`** - Contract state verification
3. Any other files importing from `rollover-contract-client.ts`

## Upgrade Process

### Step 1: Deploy New Contract

Follow the [Contract Deployment Guide](./CONTRACT-DEPLOYMENT-GUIDE.md) to deploy the new contract version.

### Step 2: Update Central Configuration

Edit **ONE FILE**: `lib/blockchain/rollover-contract-client.ts`

```typescript
// UPDATE CONTRACT VERSION
export const CURRENT_CONTRACT_VERSION = 'V4' as const; // Changed from 'V3'

// UPDATE SDK IMPORTS
export { 
  RolloverEscrowV4SDK as CurrentRolloverSDK,        // Changed from V3SDK
  TransferDetailsV4 as TransferDetails,             // Changed from V3
  SerializableTransferDetailsV4 as SerializableTransferDetails, // Changed from V3
  PrepareSendParams,                                // Check if interface changed
  PrepareReceiveParams,                             // Check if interface changed
  TransferStateV4 as TransferState,                 // Changed from V3
  AccountType                                       // Check if enum changed
} from '@/modules/eth-sdk/src/RolloverEscrowV4SDK'; // Changed from V3SDK

// UPDATE CONTRACT CONFIG
export function getContractConfig() {
  const address = process.env.NEXT_PUBLIC_ROLLOVER_ESCROW_V4_ADDRESS || // Add V4 env var
                 process.env.NEXT_PUBLIC_ROLLOVER_ESCROW_V3_ADDRESS || 
                 process.env.NEXT_PUBLIC_ROLLOVER_ESCROW_ADDRESS || '';
  
  return {
    version: CURRENT_CONTRACT_VERSION,
    address,
    executionDelayMinutes: 10, // V4 might have different delay
    abiPath: '@/modules/eth-sdk/abi/RolloverEscrowV4.json' // Changed from V3.json
  };
}
```

### Step 3: Update Environment Variables

Add the new contract address to `.env.local`:

```bash
# Add new V4 address
NEXT_PUBLIC_ROLLOVER_ESCROW_V4_ADDRESS=0x[NEW_V4_CONTRACT_ADDRESS]

# Keep V3 as fallback
NEXT_PUBLIC_ROLLOVER_ESCROW_V3_ADDRESS=0xD312f1DeBF61791D9f85ABAA4D90562db2b63a30
```

### Step 4: Handle Interface Changes

If the new SDK has different method signatures, update the utility functions in the same file:

```typescript
// Example: If V4 SDK changed prepareSend parameters
export async function createRolloverSDK(signer: any): Promise<InstanceType<typeof CurrentRolloverSDK>> {
  const config = getContractConfig();
  const abi = require(config.abiPath);
  
  console.log(`🏗️ Creating ${config.version} SDK for contract: ${config.address}`);
  
  return new CurrentRolloverSDK(config.address, abi, signer);
}

// If account types changed in V4
export function getAccountType(accountType: string): AccountType {
  switch (accountType.toLowerCase()) {
    case 'traditional': return AccountType.Traditional;
    case 'roth': return AccountType.Roth;
    case 'sep': return AccountType.SEP;
    case 'simple': return AccountType.SIMPLE;
    case 'solo401k': return AccountType.Solo401k; // New in V4
    default: return AccountType.Traditional;
  }
}
```

### Step 5: Test Integration

1. **Verify Contract Detection:**
   ```bash
   # Check that apps detect the new version
   curl -X POST http://localhost:3000/api/blockchain/execute \
     -H "Content-Type: application/json" \
     -d '{"action": "prepare_send", "rolloverId": "test", "custodianId": "test"}'
   ```

2. **Check Verification Service:**
   - Create a test transfer
   - Verify that contract verification uses V4 contract
   - Confirm `preparedAt` timestamps sync correctly

3. **Test All Actions:**
   - `prepare_send`
   - `prepare_receive` 
   - `execute_transfer`
   - Contract state verification

### Step 6: Update Documentation

Update these files with new contract information:

- **`README.md`** - Contract address and version
- **`docs/CONTRACT-DEPLOYMENT-GUIDE.md`** - Add V4 deployment info
- **Environment examples** - Add V4 environment variables

## Rollback Process

If issues arise, rollback is simple:

1. **Revert centralized config:**
   ```bash
   git checkout HEAD~1 lib/blockchain/rollover-contract-client.ts
   ```

2. **Switch environment variable:**
   ```bash
   # Point back to V3
   NEXT_PUBLIC_ROLLOVER_ESCROW_ADDRESS=0xD312f1DeBF61791D9f85ABAA4D90562db2b63a30
   ```

3. **Restart application**

## Validation Checklist

Before declaring upgrade complete:

- [ ] New contract deployed and verified on blockchain
- [ ] Environment variables updated
- [ ] Central configuration file updated
- [ ] All API endpoints return successful responses
- [ ] Contract verification service works with new version
- [ ] Test transfers complete end-to-end
- [ ] Execution delays work as expected
- [ ] No console errors in browser or server logs
- [ ] Rollback procedure tested

## Contract Version History

| Version | Contract Address | Execution Delay | Key Changes |
|---------|------------------|-----------------|-------------|
| V3 | `0xD312f1DeBF61791D9f85ABAA4D90562db2b63a30` | 15 minutes | Removed balance tracking, fixed overflow |
| V2 | `0x[OLD_V2_ADDRESS]` | 60 minutes | Original atomic settlement |
| V4 | `0x[FUTURE_V4_ADDRESS]` | TBD | Future improvements |

## Common Issues

### Import Errors
**Problem:** TypeScript errors about missing types
**Solution:** Ensure all type imports are updated in the central config file

### Contract Not Found
**Problem:** "Contract address not configured" errors  
**Solution:** Verify environment variables are set correctly

### Method Signature Mismatch
**Problem:** SDK method calls fail with parameter errors
**Solution:** Check if new SDK version changed method interfaces

### State Sync Issues
**Problem:** Verification service can't read contract state
**Solution:** Ensure ABI path points to correct V4 ABI file

## Future Improvements

This architecture could be enhanced with:

1. **Version Detection:** Automatically detect contract version from blockchain
2. **Multi-Version Support:** Support multiple contract versions simultaneously
3. **Migration Scripts:** Automated scripts to upgrade contract references
4. **Configuration Validation:** Runtime validation of contract compatibility

## Getting Help

If upgrade issues occur:

1. Check console logs for specific error messages
2. Verify contract deployment was successful on Etherscan
3. Test contract methods directly using Hardhat console
4. Compare working V3 integration vs failing V4 integration

For deployment issues, see [Deployment Troubleshooting Guide](./DEPLOYMENT-TROUBLESHOOTING.md).