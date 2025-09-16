# Minimal Arbitrum Migration Checklist

## Core Changes Required (ONLY THESE)

### 1. Environment Variables (.env.local)
```bash
# Add Arbitrum RPC
NEXT_PUBLIC_DEFAULT_NETWORK=arbitrumSepolia
ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
ARBITRUM_SEPOLIA_WSS_URL=wss://arb-sepolia.g.alchemy.com/v2/YOUR_KEY

# Updated contract addresses (NEW working contracts on Arbitrum)
NEXT_PUBLIC_ROLLOVER_ESCROW_V5_ADDRESS=0x74903e40259Ce753B7d9c2C62BB9227D7D0b8B62
NEXT_PUBLIC_TRUSD_ADDRESS=0xc674251feDcD08D2A198D20406F4Bc4118949ACC
```

### 2. Network Config (lib/config/network-config.ts)
- Add arbitrumSepolia network configuration
- Update explorerUrl to use Arbiscan

### 3. API Route (app/api/blockchain/execute/route.ts)
- Add network-aware RPC selection (Sepolia vs Arbitrum)
- NO OTHER CHANGES

### 4. Fix Hardcoded Explorer URLs in UI Components

These components have hardcoded Sepolia Etherscan URLs that need to be dynamic:

#### Files to Update:
```typescript
// components/rollover/RolloverWorkflow.tsx (3 instances)
// Lines ~459, ~472, ~485
// Change from:
href={`https://sepolia.etherscan.io/tx/${hash}`}
// To:
import { getExplorerTxUrl } from '@/lib/config/network-config';
href={getExplorerTxUrl(hash)}

// components/rollover/BlockchainExecutionHandler.tsx (2 instances)  
// Lines ~142, ~156
// Change from:
href={`https://sepolia.etherscan.io/tx/${transactionHash}`}
onClick={() => window.open(`https://sepolia.etherscan.io/tx/${transactionHash}`, '_blank')}
// To:
import { getExplorerTxUrl } from '@/lib/config/network-config';
href={getExplorerTxUrl(transactionHash)}
onClick={() => window.open(getExplorerTxUrl(transactionHash), '_blank')}

// components/shared/TransactionHashDisplay.tsx
// Add Arbitrum chain IDs (421614 for Arbitrum Sepolia)
// Lines ~36 and ~42
case 421614: // Arbitrum Sepolia
  return `https://sepolia.arbiscan.io/tx/${txHash}`;
```

#### Already Working (Don't Change):
- ✅ `components/rollover/BlockchainTab.tsx` - Already uses `getExplorerTxUrl()`
- ✅ `components/rollover/BlockchainActions.tsx` - Already uses `getExplorerTxUrl()`

### 5. Deployment & Wallet Management

#### Critical Wallet Distinction
```bash
# DEPLOYMENT WALLET (for deploying contracts)
# - Has the private key in .env
# - Used ONLY for deployment scripts
# - Should have minimal ETH for gas
DEPLOYER_PRIVATE_KEY=0x...

# PLATFORM WALLET (for executing transactions)
# - Different from deployment wallet!
# - Needs to be funded with ETH on Arbitrum
# - Used by the API for blockchain operations
PLATFORM_WALLET_PRIVATE_KEY=0x...
```

#### Deployment Script (if needed)
Create `scripts/deploy-arbitrum.js`:
```javascript
const { ethers } = require('ethers');
require('dotenv').config();

async function deployToArbitrum() {
  // CRITICAL: Use DEPLOYER wallet, not PLATFORM wallet
  const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  console.log('Deploying from:', deployer.address);
  console.log('Network:', await provider.getNetwork());
  
  // Contract is already deployed at:
  // V6: 0x74903e40259Ce753B7d9c2C62BB9227D7D0b8B62 (NEW)
  // TRUSD: 0xc674251feDcD08D2A198D20406F4Bc4118949ACC (NEW)
  // OLD V6: 0xE88Cd9f63252D21075cFDBdF5655080D36382A78 (deprecated - partial functionality)
  // OLD TRUSD: 0xdE0C62d09e6F5EA8f3c4E3dA118a66AEefA5191C (deprecated - can't mint)
  
  // Just verify they exist
  const v6Code = await provider.getCode('0x74903e40259Ce753B7d9c2C62BB9227D7D0b8B62');
  const trusdCode = await provider.getCode('0xc674251feDcD08D2A198D20406F4Bc4118949ACC');
  
  console.log('V6 Contract deployed:', v6Code.length > 2);
  console.log('TRUSD Contract deployed:', trusdCode.length > 2);
}
```

#### Wallet Funding Checklist
1. **Platform Wallet** (for transactions):
   ```bash
   # Get address from private key
   PLATFORM_WALLET_ADDRESS=0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457
   
   # Must have ETH on Arbitrum Sepolia for:
   - Custodian agreements
   - Financial submissions  
   - Transfer execution
   - Mint/burn operations
   
   # Recommended: 0.1 ETH minimum
   ```

2. **DO NOT MIX**:
   - ❌ Don't use deployment wallet for platform operations
   - ❌ Don't use platform wallet for deployments
   - ❌ Don't commit private keys

3. **Environment Variables**:
   ```bash
   # .env.local (NEVER commit this)
   PLATFORM_WALLET_PRIVATE_KEY=0x... # For API operations
   DEPLOYER_PRIVATE_KEY=0x...        # For deployments only
   
   # Double-check the addresses match expected:
   # Platform: 0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457
   # Deployer: 0xbCBB8C9cb1A38f23a3814c569D0DbB7e36bc2B0c
   ```

#### Contract Role Configuration
After deployment, grant required roles:
```javascript
// scripts/grant-roles-arbitrum.js
async function grantRoles() {
  // V6 Contract needs PLATFORM_OPERATOR_ROLE
  // TRUSD needs to grant MINTER_ROLE and BURNER_ROLE to V6
  
  const PLATFORM_OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PLATFORM_OPERATOR_ROLE"));
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  
  // Grant platform wallet the operator role on V6
  await v6Contract.grantRole(PLATFORM_OPERATOR_ROLE, PLATFORM_WALLET_ADDRESS);
  
  // Grant V6 contract mint/burn roles on TRUSD
  await trusdContract.grantRole(MINTER_ROLE, V6_CONTRACT_ADDRESS);
  await trusdContract.grantRole(BURNER_ROLE, V6_CONTRACT_ADDRESS);
}
```

### 6. That's it! 

## What NOT to Change
- ❌ Don't add new actions (execute_and_mint)
- ❌ Don't modify state machine logic
- ❌ Don't change event types
- ❌ Don't modify recovery logic
- ❌ Don't change UI components (except explorer URLs)

## Testing Order
1. Create new Level 2 transfer
2. Test full flow (agree → financial → execute → settle)
3. Create new Level 3 transfer  
4. Test full flow (agree → financial → execute with auto-mint → burn)
5. Only fix issues that actually break

## Key Principle
**If it worked on Sepolia, it should work on Arbitrum with just the network change**

The V6 contract on Arbitrum has the same interface as V5 on Sepolia. The only difference is:
- Network (Arbitrum instead of Ethereum)
- Slightly different gas costs
- Faster block times

Everything else should remain the same!