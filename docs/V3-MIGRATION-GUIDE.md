# RolloverEscrowV3 Migration Guide

## Overview

RolloverEscrowV3 addresses critical architectural issues from V2 while maintaining backward compatibility and enhancing the system for better performance and reliability.

## Key Changes in V3

### 🔧 Fixed Issues
- **Removed custodian balance tracking** - Eliminates arithmetic overflow errors
- **Reduced execution delay** - From 1 hour to 15 minutes for better UX
- **Enhanced BigInt compatibility** - Better API serialization with string conversion methods
- **Gas optimization** - Custom errors and optimized struct packing

### ✨ New Features
- **Batch custodian verification** - Gas-efficient bulk operations
- **Enhanced events** - Better off-chain indexing and monitoring
- **API-safe methods** - Built-in BigInt to string conversion
- **Improved error reporting** - More specific error messages with context

## Migration Steps

### 1. Deploy V3 Contract

```bash
cd modules/eth-sdk
npm run deploy:v3
```

This will:
- Deploy RolloverEscrowV3 to Sepolia
- Generate new ABI file
- Update deployments.json
- Provide new contract address

### 2. Update Environment Configuration

Update `.env.local`:
```bash
# Old V2 address (keep for reference)
# NEXT_PUBLIC_ROLLOVER_ESCROW_ADDRESS=0x1264968Df5996bB543d4095809E9bE1f0095b0ca

# New V3 address
NEXT_PUBLIC_ROLLOVER_ESCROW_ADDRESS=<NEW_V3_ADDRESS>
```

### 3. Update SDK Imports

Replace V2 SDK usage with V3:

```typescript
// Before (V2)
import { RolloverEscrowSDK } from '@/modules/eth-sdk/src/RolloverEscrowSDK';

// After (V3)
import { RolloverEscrowV3SDK } from '@/modules/eth-sdk/src/RolloverEscrowV3SDK';
```

### 4. Re-verify All Custodians

Since smart contracts are immutable, all custodians need verification on V3:

```typescript
// Use batch verification for efficiency
const custodianAddresses = ['0x...', '0x...'];
const custodianNames = ['Demo Custodian', 'MetaMask Test'];

await v3SDK.batchVerifyCustodians({
  custodians: custodianAddresses,
  names: custodianNames
});
```

### 5. Update Service Layer

Update blockchain services to use V3 patterns:

```typescript
// lib/services/contract-verification-service.ts
export async function createContractVerificationServiceV3(): Promise<ContractVerificationService> {
  const provider = createServerProvider();
  const signer = createServerSigner(provider);
  
  const contractAddress = process.env.NEXT_PUBLIC_ROLLOVER_ESCROW_ADDRESS;
  const { abi } = require('@/modules/eth-sdk/abi/RolloverEscrowV3.json');
  
  const sdk = new RolloverEscrowV3SDK(contractAddress!, abi, signer);
  
  return {
    async verifyTransfer(transferId: string) {
      // Use API-safe method for better serialization
      const details = await sdk.getTransferDetailsForAPI(transferId);
      return createSafeResponse(details);
    },
    
    async canExecute(transferId: string) {
      const result = await sdk.canExecute(transferId);
      return createSafeResponse(result);
    }
  };
}
```

## BigInt Serialization Improvements

V3 provides built-in BigInt handling:

### Contract Methods
```solidity
// V3 provides both raw and API-safe methods
function getTransferDetails(bytes32 transferId) // Returns BigInt values
function getTransferDetailsForAPI(bytes32 transferId) // Returns string values
```

### SDK Usage
```typescript
// Raw BigInt values (for calculations)
const details = await sdk.getTransferDetails(transferId);
console.log(details.grossAmount); // bigint

// API-safe string values (for serialization)
const apiDetails = await sdk.getTransferDetailsForAPI(transferId);
console.log(apiDetails.grossAmount); // string

// Utility for converting existing BigInt data
const safeData = RolloverEscrowV3SDK.sanitizeTransferDetails(details);
```

## Testing Strategy

### 1. Parallel Testing
- Keep V2 running for existing transfers
- Test V3 with new transfers
- Compare behavior and performance

### 2. Execution Delay Testing
```typescript
// Test reduced delay (15 minutes vs 1 hour)
const delay = await sdk.getExecutionDelay();
console.log(`Execution delay: ${delay} seconds`); // Should be 900 (15 minutes)

// For testing, can temporarily reduce further
await sdk.setExecutionDelay(300); // 5 minutes for testing
```

### 3. Balance Tracking Removal
V3 eliminates balance tracking, so:
- No more arithmetic overflow errors
- No need to set initial custodian balances
- Transfers can execute immediately when both parties are ready

## API Updates

### Updated Endpoints

Update API endpoints to use V3 SDK:

```typescript
// app/api/blockchain/verify/route.ts
import { createContractVerificationServiceV3 } from '@/lib/services/contract-verification-service';

export async function POST(req: NextRequest) {
  const service = await createContractVerificationServiceV3();
  const result = await service.verifyTransfer(transferId);
  return NextResponse.json(result);
}
```

### Enhanced Error Handling

V3 provides better error messages:

```typescript
try {
  await sdk.executeTransfer(transferId);
} catch (error) {
  if (error.message.includes('ExecutionDelayNotMet')) {
    // Handle specific V3 error
    return { error: 'Please wait for execution delay to pass' };
  }
  if (error.message.includes('InvalidTransferState')) {
    // Handle state validation error
    return { error: 'Transfer is not ready for execution' };
  }
}
```

## Monitoring and Rollback

### Health Checks
```typescript
// Monitor V3 deployment
const version = await sdk.getVersion(); // "3.0.0"
const delay = await sdk.getExecutionDelay(); // 900
const isVerified = await sdk.isVerifiedCustodian(address);
```

### Rollback Plan
If issues arise with V3:
1. Revert environment variable to V2 address
2. Allow V3 transfers to complete naturally
3. Investigate and fix V3 issues
4. Re-deploy V3 with fixes

## Performance Improvements

### Gas Optimization
- **Custom errors**: More efficient than string messages
- **Batch operations**: Verify multiple custodians in one transaction
- **Optimized events**: Better indexing with more structured data

### Execution Time
- **15-minute delay**: Improved from 1-hour delay
- **No balance checks**: Eliminates complex arithmetic operations
- **Enhanced validation**: Faster state verification

## Backward Compatibility

V3 maintains API compatibility:
- Same method signatures where possible
- Enhanced methods marked with V3 suffix
- Existing BigInt handling patterns preserved
- Service layer interfaces unchanged

## Security Considerations

### Access Control
- Same role-based access control (CUSTODIAN_ROLE, OPERATOR_ROLE)
- Enhanced input validation with custom errors
- Maintained emergency pause functionality

### Audit Trail
- Enhanced events provide more context
- Better off-chain monitoring capabilities
- Improved error reporting for debugging

## Timeline

### Phase 1: Deployment (Week 1)
- [x] Deploy V3 contract to Sepolia
- [x] Update environment configuration
- [x] Basic SDK testing

### Phase 2: Integration (Week 2)
- [ ] Update service layer
- [ ] Re-verify all custodians
- [ ] Test transfer workflows

### Phase 3: Monitoring (Week 3)
- [ ] Parallel operation with V2
- [ ] Performance monitoring
- [ ] User acceptance testing

### Phase 4: Full Migration (Week 4)
- [ ] Complete V2 transfer completion
- [ ] Full V3 adoption
- [ ] Documentation updates

## Troubleshooting

### Common Issues

1. **Custodian not verified on V3**
   ```typescript
   const isVerified = await sdk.isVerifiedCustodian(address);
   if (!isVerified) {
     await sdk.verifyCustodian(address, name);
   }
   ```

2. **BigInt serialization errors**
   ```typescript
   // Use V3 API-safe methods
   const details = await sdk.getTransferDetailsForAPI(transferId);
   ```

3. **Execution delay confusion**
   ```typescript
   const canExecute = await sdk.canExecute(transferId);
   console.log(canExecute.reason); // Detailed explanation
   ```

## Success Metrics

- ✅ Zero arithmetic overflow errors
- ✅ 75% reduction in execution delay
- ✅ Improved gas efficiency
- ✅ Better API reliability
- ✅ Enhanced monitoring capabilities

## Contact and Support

For migration assistance:
- Check the troubleshooting section above
- Review SDK documentation
- Test thoroughly on Sepolia before mainnet
- Monitor gas costs and performance

Remember: V3 is designed to be a long-term solution that eliminates architectural issues while preparing for future enhancements like Circle USDC integration.