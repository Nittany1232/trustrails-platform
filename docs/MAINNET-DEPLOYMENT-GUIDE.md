# Mainnet Contract Deployment Guide

## Prerequisites

1. **Deployment Wallet**
   - Need ~0.5-2 ETH for deployment (depending on gas prices)
   - Use a secure wallet (hardware wallet recommended)
   - This wallet will be the contract owner

2. **Infrastructure**
   - Infura or Alchemy account for RPC access
   - Etherscan API key for verification

## Step-by-Step Deployment

### 1. Prepare the Contract
```bash
cd modules/eth-sdk
npm install
```

### 2. Configure Environment
Create `.env` in `modules/eth-sdk/`:
```bash
# Deployment wallet private key (USE HARDWARE WALLET IN PRODUCTION!)
PRIVATE_KEY=your_deployment_wallet_private_key

# Mainnet RPC
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID

# For contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### 3. Test on Sepolia First
```bash
# Deploy to testnet
npx hardhat run scripts/deploy.ts --network sepolia

# Test all functions thoroughly
```

### 4. Deploy to Mainnet
```bash
# Check gas prices first
# https://etherscan.io/gastracker

# Deploy when gas is reasonable (< 50 gwei)
npx hardhat run scripts/deploy.ts --network mainnet

# Save the contract address!
# Example output: Contract deployed to: 0x123...
```

### 5. Verify Contract
```bash
npx hardhat verify --network mainnet YOUR_CONTRACT_ADDRESS
```

### 6. Update Production Environment
```bash
NEXT_PUBLIC_TRANSFER_CONTRACT_ADDRESS=0x123...  # Your deployed address
NEXT_PUBLIC_DEFAULT_NETWORK=mainnet
NEXT_PUBLIC_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
```

## Estimated Costs

- **Contract Deployment**: 0.5-2 ETH (depending on gas prices)
- **Each Transfer**: ~0.01-0.05 ETH per transaction
- **Best Practice**: Deploy during low gas times (weekends, early morning UTC)

## Security Checklist

- [ ] Use hardware wallet for deployment
- [ ] Test thoroughly on testnet first
- [ ] Verify contract on Etherscan
- [ ] Set up monitoring for contract events
- [ ] Document the contract address securely
- [ ] Transfer ownership to multisig (optional but recommended)