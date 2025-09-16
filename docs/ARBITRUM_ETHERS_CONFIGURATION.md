# Arbitrum Ethers.js Configuration Guide

## Current Ethers.js Implementation Analysis

### Existing Setup (Sepolia)
```typescript
// Current: /lib/blockchain/server-provider.ts
const provider = new ethers.JsonRpcProvider(
  process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
);

// Current: /lib/config/websocket-config.ts
const wsProvider = new ethers.WebSocketProvider(
  process.env.SEPOLIA_WS_URL || "wss://ethereum-sepolia-rpc.publicnode.com"
);
```

## Arbitrum-Specific Configuration Changes

### 1. Provider Updates (Minimal Changes)

```typescript
// Updated: /lib/blockchain/server-provider.ts
import { ethers } from 'ethers';

export class ArbitrumProvider {
  private static instance: ethers.JsonRpcProvider;
  
  static getProvider(): ethers.JsonRpcProvider {
    if (!this.instance) {
      const network = process.env.NETWORK || 'arbitrum-sepolia';
      
      const configs = {
        'arbitrum': {
          url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
          chainId: 42161
        },
        'arbitrum-sepolia': {
          url: process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
          chainId: 421614
        },
        'sepolia': {
          url: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
          chainId: 11155111
        }
      };
      
      const config = configs[network];
      this.instance = new ethers.JsonRpcProvider(config.url, config.chainId);
    }
    
    return this.instance;
  }
}
```

### 2. WebSocket Provider Updates

```typescript
// Updated: /lib/config/websocket-config.ts
export function getWebSocketProvider(): ethers.WebSocketProvider {
  const network = process.env.NETWORK || 'arbitrum-sepolia';
  
  const wsUrls = {
    'arbitrum': process.env.ARBITRUM_WS_URL || 'wss://arb1.arbitrum.io/ws',
    'arbitrum-sepolia': process.env.ARBITRUM_SEPOLIA_WS_URL || 'wss://sepolia-rollup.arbitrum.io/ws',
    'sepolia': process.env.SEPOLIA_WS_URL || 'wss://ethereum-sepolia-rpc.publicnode.com'
  };
  
  const wsUrl = wsUrls[network];
  const provider = new ethers.WebSocketProvider(wsUrl);
  
  // Add Arbitrum-specific reconnection logic
  provider.on('error', (error) => {
    console.error('WebSocket error:', error);
    // Arbitrum has different error codes
    if (error.code === 'NETWORK_ERROR') {
      setTimeout(() => provider._reconnect(), 1000);
    }
  });
  
  return provider;
}
```

### 3. Gas Estimation Modifications

```typescript
// Updated: /lib/blockchain/enhanced/blockchain-service.ts
export class EnhancedBlockchainService {
  async estimateGas(transaction: any): Promise<bigint> {
    const isArbitrum = this.chainId === 42161 || this.chainId === 421614;
    
    if (isArbitrum) {
      // Arbitrum-specific gas estimation
      const estimate = await this.provider.estimateGas(transaction);
      // Add 20% buffer for Arbitrum's dynamic gas model
      return (estimate * 120n) / 100n;
    } else {
      // Standard Ethereum estimation
      const estimate = await this.provider.estimateGas(transaction);
      return (estimate * 110n) / 100n; // 10% buffer
    }
  }
  
  getGasConfig(): GasConfig {
    const isArbitrum = this.chainId === 42161 || this.chainId === 421614;
    
    if (isArbitrum) {
      return {
        gasLimit: 2000000n, // Higher limits OK on L2
        maxFeePerGas: ethers.parseUnits("0.1", "gwei"), // 100x cheaper
        maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei")
      };
    } else {
      return {
        gasLimit: 500000n,
        maxFeePerGas: ethers.parseUnits("20", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
      };
    }
  }
}
```

### 4. Transaction Builder Updates

```typescript
// Updated: /lib/blockchain/transaction-builder.ts
export class TransactionBuilder {
  static async buildTransaction(
    params: TransactionParams,
    chainId: number
  ): Promise<ethers.TransactionRequest> {
    const isArbitrum = chainId === 42161 || chainId === 421614;
    
    const tx: ethers.TransactionRequest = {
      to: params.to,
      data: params.data,
      value: params.value || 0n,
      chainId: chainId,
      type: 2, // EIP-1559 supported on Arbitrum
    };
    
    if (isArbitrum) {
      // Arbitrum-optimized gas settings
      tx.gasLimit = params.gasLimit || 2000000n;
      tx.maxFeePerGas = params.maxFeePerGas || ethers.parseUnits("0.1", "gwei");
      tx.maxPriorityFeePerGas = params.maxPriorityFeePerGas || ethers.parseUnits("0.01", "gwei");
    } else {
      // Standard Ethereum gas settings
      tx.gasLimit = params.gasLimit || 500000n;
      tx.maxFeePerGas = params.maxFeePerGas || ethers.parseUnits("20", "gwei");
      tx.maxPriorityFeePerGas = params.maxPriorityFeePerGas || ethers.parseUnits("2", "gwei");
    }
    
    return tx;
  }
}
```

### 5. BYOW (MetaMask) Integration Updates

```typescript
// Updated: /lib/blockchain/enhanced/byow-execution-helper.ts
export class BYOWExecutionHelper {
  async requestNetworkSwitch(): Promise<void> {
    const targetNetwork = process.env.NETWORK || 'arbitrum-sepolia';
    
    const networks = {
      'arbitrum': {
        chainId: '0xA4B1', // 42161 in hex
        chainName: 'Arbitrum One',
        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://arbiscan.io'],
        nativeCurrency: {
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18
        }
      },
      'arbitrum-sepolia': {
        chainId: '0x66EEE', // 421614 in hex
        chainName: 'Arbitrum Sepolia',
        rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://sepolia.arbiscan.io'],
        nativeCurrency: {
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18
        }
      }
    };
    
    const networkConfig = networks[targetNetwork];
    
    try {
      // Try to switch to the network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: networkConfig.chainId }]
      });
    } catch (switchError: any) {
      // Network not added, add it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [networkConfig]
        });
      } else {
        throw switchError;
      }
    }
  }
}
```

## No Additional Dependencies Required

The current ethers.js v6 fully supports Arbitrum. Optional packages for enhanced functionality:

```json
// package.json - OPTIONAL additions
{
  "dependencies": {
    "ethers": "^6.11.0", // Current version - NO CHANGE NEEDED
    // Optional for bridge operations:
    "@arbitrum/sdk": "^3.1.3", // Only if bridging assets
    // Optional for cross-chain messaging:
    "@arbitrum/nitro-contracts": "^1.0.0" // Only if using L1<->L2 messaging
  }
}
```

## Environment Variables Update

```bash
# .env.arbitrum-sepolia
NETWORK=arbitrum-sepolia
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_SEPOLIA_WS_URL=wss://sepolia-rollup.arbitrum.io/ws
CHAIN_ID=421614
BLOCK_EXPLORER=https://sepolia.arbiscan.io

# .env.arbitrum-mainnet
NETWORK=arbitrum
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
ARBITRUM_WS_URL=wss://arb1.arbitrum.io/ws
CHAIN_ID=42161
BLOCK_EXPLORER=https://arbiscan.io
```

## Migration Steps

### Step 1: Update Environment Variables
```bash
# Copy existing .env to preserve other settings
cp .env .env.backup
cp .env.arbitrum-sepolia .env
```

### Step 2: Test Provider Connection
```typescript
// test-arbitrum-connection.ts
import { ArbitrumProvider } from './lib/blockchain/server-provider';

async function testConnection() {
  const provider = ArbitrumProvider.getProvider();
  
  try {
    const network = await provider.getNetwork();
    console.log('Connected to:', network.name);
    console.log('Chain ID:', network.chainId);
    
    const blockNumber = await provider.getBlockNumber();
    console.log('Current block:', blockNumber);
    
    const gasPrice = await provider.getFeeData();
    console.log('Gas price:', ethers.formatUnits(gasPrice.gasPrice || 0n, 'gwei'), 'gwei');
    
    return true;
  } catch (error) {
    console.error('Connection failed:', error);
    return false;
  }
}

testConnection();
```

### Step 3: Deploy Contracts
```bash
# Use existing deployment scripts with new network
npx hardhat run scripts/deploy.ts --network arbitrum-sepolia
```

### Step 4: Update SDK Manager
No changes needed - SDK Manager will automatically use the new provider.

### Step 5: Test Recovery System
Recovery system works unchanged with new provider.

## Key Differences from Ethereum

### 1. Block Time
- **Ethereum**: ~12 seconds
- **Arbitrum**: ~2 seconds
- **Impact**: Faster confirmations, adjust timeout logic if needed

### 2. Gas Costs
- **Ethereum**: $2-50 per transaction
- **Arbitrum**: $0.02 per transaction
- **Impact**: Can increase gas limits for safety

### 3. Finality
- **Ethereum**: Immediate finality
- **Arbitrum**: Soft finality in 2s, hard finality in ~1 week
- **Impact**: For most operations, soft finality is sufficient

### 4. Error Messages
- **Ethereum**: Standard revert messages
- **Arbitrum**: May include L2-specific errors
- **Impact**: Error handling remains the same

## Testing Checklist

- [ ] Provider connects to Arbitrum network
- [ ] WebSocket receives events
- [ ] Gas estimation returns reasonable values
- [ ] Transactions confirm in ~2 seconds
- [ ] BYOW/MetaMask network switching works
- [ ] Recovery system functions correctly
- [ ] Event listeners capture all events
- [ ] Gas costs are significantly reduced

## Rollback Procedure

If issues arise, rollback is simple:

```bash
# Restore original environment
cp .env.backup .env

# Restart services
npm run dev

# No code changes needed - just environment variables
```

## Summary

The ethers.js configuration for Arbitrum requires **minimal changes**:
1. Update RPC/WebSocket URLs (environment variables)
2. Adjust gas settings for L2 economics
3. Add network configuration for MetaMask
4. No new dependencies required
5. No breaking changes to existing code

The migration is **backwards compatible** - the same code works on both Ethereum and Arbitrum with just environment variable changes.