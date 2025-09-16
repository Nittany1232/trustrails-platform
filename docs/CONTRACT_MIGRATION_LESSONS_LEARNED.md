# Contract Migration Lessons Learned

## Critical Issue: Wrong Network RPC Configuration

### The Problem
During the Arbitrum Sepolia migration, blockchain transactions appeared to succeed in the UI but were not actually being recorded on the correct blockchain. The system showed "successful" agreement events with valid transaction hashes, but these transactions didn't exist on Arbitrum Sepolia.

### Root Cause
**Transactions were being sent to the wrong network** - Sepolia Ethereum instead of Arbitrum Sepolia.

Despite having:
- ✅ Contract addresses deployed on Arbitrum (OLD: `0xE88Cd9f63252D21075cFDBdF5655080D36382A78`, NEW: `0x74903e40259Ce753B7d9c2C62BB9227D7D0b8B62`)
- ✅ `NEXT_PUBLIC_DEFAULT_NETWORK=arbitrumSepolia` configured
- ✅ Proper Arbitrum configuration in network-config.ts

The system was using the wrong RPC URL due to:
- ❌ `NEXT_PUBLIC_RPC_URL` was hardcoded to Sepolia Ethereum: `https://eth-sepolia.g.alchemy.com/v2/...`
- ❌ This overrode the network-specific configuration in some code paths

### Why It Appeared to Work
1. Transactions were successfully sent to Sepolia Ethereum
2. They got mined and received real transaction hashes
3. BUT no contract existed at the target address on Sepolia Ethereum
4. Transactions consumed gas but executed no logic (0 logs)
5. UI created "success" events because transactions didn't revert

### The Fix
Updated `.env.local` line 46:
```bash
# WRONG - Points to Sepolia Ethereum
NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/8i7OJBUH5bByemk2JdNWwtLRHO3QRsE-

# CORRECT - Points to Arbitrum Sepolia  
NEXT_PUBLIC_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/8i7OJBUH5bByemk2JdNWwtLRHO3QRsE-
```

## Migration Checklist - Network Configuration

When migrating to a new network, verify ALL of these:

### 1. Environment Variables
- [ ] `NEXT_PUBLIC_DEFAULT_NETWORK` - Set to correct network name
- [ ] `NEXT_PUBLIC_RPC_URL` - Points to correct network RPC
- [ ] `[NETWORK]_RPC_URL` - Network-specific RPC URL (e.g., `ARBITRUM_SEPOLIA_RPC_URL`)
- [ ] `NEXT_PUBLIC_WSS_URL` - WebSocket URL for correct network
- [ ] Contract addresses - Updated for new network deployment

### 2. Verify Network Connection
```javascript
// Test script to verify correct network
const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
const network = await provider.getNetwork();
console.log('Chain ID:', network.chainId); // Should match target network
```

Expected Chain IDs:
- Sepolia Ethereum: `11155111`
- Arbitrum Sepolia: `421614`
- Arbitrum One: `42161`

### 3. Verify Contract Deployment
```javascript
// Verify contract exists on the network
const code = await provider.getCode(contractAddress);
if (code === '0x') {
  console.error('No contract at this address on this network!');
}
```

### 4. Test Transaction Submission
Before running the full application:
```javascript
// Send a test transaction to verify network
const tx = await wallet.sendTransaction({
  to: wallet.address,
  value: ethers.parseEther('0.000001')
});
const receipt = await tx.wait();
console.log('Block:', receipt.blockNumber);
// Verify on correct block explorer
```

### 5. Verify Transaction on Correct Explorer
- Sepolia Ethereum: `https://sepolia.etherscan.io/tx/{hash}`
- Arbitrum Sepolia: `https://sepolia.arbiscan.io/tx/{hash}`
- If transaction shows on wrong explorer, RPC configuration is incorrect

## Common Migration Pitfalls

### 1. Mixed Network Configuration
**Issue**: Different parts of the system using different networks
**Solution**: Ensure ALL environment variables point to the same network

### 2. Cached Provider Instances
**Issue**: Old provider instances may persist with wrong network
**Solution**: Restart the application after configuration changes

### 3. Hardcoded URLs
**Issue**: Hardcoded RPC URLs override environment configuration
**Solution**: Search codebase for hardcoded URLs:
```bash
grep -r "eth-sepolia\|arbitrum" --include="*.ts" --include="*.tsx"
```

### 4. Contract ABI Mismatches
**Issue**: Using old contract ABI with new deployment
**Solution**: Regenerate contract types after deployment:
```bash
cd modules/eth-sdk
npm run typechain
```

### 5. Silent Transaction Failures
**Issue**: Transactions sent to wrong network don't revert, they just do nothing
**Solution**: Always verify transactions on the correct block explorer

## Debugging Wrong Network Issues

### Symptoms
- Transaction hashes exist but not on expected network
- UI shows success but blockchain state doesn't change
- Gas is consumed but no contract events emitted
- Contract calls fail with "transfer not found" errors

### Diagnostic Steps
1. Check transaction hash on multiple explorers
2. Verify provider chain ID matches expected network
3. Check contract deployment on target network
4. Review all RPC URL environment variables
5. Test with simple ETH transfer first

### Debug Script
```javascript
// Save as debug-network.js
const { ethers } = require('ethers');
require('dotenv').config({ path: '.env.local' });

async function debugNetwork() {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  console.log('RPC URL:', rpcUrl);
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  
  console.log('Network Name:', network.name);
  console.log('Chain ID:', network.chainId);
  console.log('Expected: Arbitrum Sepolia (421614)');
  
  if (network.chainId !== 421614n) {
    console.error('❌ WRONG NETWORK!');
  }
}

debugNetwork();
```

## Critical Issue 2: TRUSD Token Contract Not Working

### The Problem
Even after fixing the network configuration, Level 3 transfers were failing at the execute stage with "cannot mint" errors. The system could reach state 4 (FinancialsProvided) but failed when trying to mint TRUSD tokens.

### Root Cause
The TRUSD token contract deployed on Arbitrum was **never properly initialized**:
- The contract was deployed as an upgradeable proxy
- The `initialize()` function was never called
- Without initialization, the contract had no admin roles configured
- The V6 contract couldn't mint/burn tokens without proper roles

### Why It Partially Worked
- Basic ERC20 functions (name, symbol, decimals) worked
- Transfers could reach state 4 because that doesn't require minting
- Only failed at execute when trying to mint tokens (state 6)

### The Fix
Deployed new properly initialized contracts:
```bash
# OLD (Broken) Contracts - Partially functional
V6: 0xE88Cd9f63252D21075cFDBdF5655080D36382A78
TRUSD: 0xdE0C62d09e6F5EA8f3c4E3dA118a66AEefA5191C (never initialized)

# NEW (Working) Contracts - Fully functional
V6: 0x74903e40259Ce753B7d9c2C62BB9227D7D0b8B62
TRUSD: 0xc674251feDcD08D2A198D20406F4Bc4118949ACC (properly initialized)
```

The new TRUSD contract:
- Uses constructor-based initialization (not proxy pattern)
- Has V6 contract granted MINTER_ROLE and BURNER_ROLE
- Works properly for Level 3 tokenization

## Key Takeaways

1. **Always verify the actual network** being used, not just the configuration
2. **Test transactions on block explorer** to ensure they're on the right network
3. **Don't trust UI success indicators** without blockchain verification
4. **Check ALL RPC URL variables** - any one could override the others
5. **Silent failures are dangerous** - transactions to wrong network don't revert
6. **Verify contract initialization** - deployed doesn't mean functional
7. **Test the full flow** - partial functionality can mask critical issues

## Additional Resources

- [Arbitrum Sepolia Explorer](https://sepolia.arbiscan.io)
- [Sepolia Ethereum Explorer](https://sepolia.etherscan.io)
- [Network Configuration Guide](./NETWORK_CONFIGURATION.md)
- [Contract Deployment Guide](./CONTRACT_DEPLOYMENT.md)