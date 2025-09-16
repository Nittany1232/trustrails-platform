# Blockchain Architecture

## Overview

TrustRails uses a hybrid architecture combining custodian wallets with a central smart contract.

## Components

### 1. Custodian Wallets
Each custodian has their own Ethereum wallet:
- **Purpose**: Sign transactions, pay gas fees
- **Storage**: Private keys in Google Secret Manager
- **Public Info**: Address stored in Firestore

### 2. TransferCoordinator Smart Contract
Single deployed contract that manages all transfers:
- **Purpose**: Mint/burn tokens, enforce rules, maintain audit trail
- **Deployment**: One per network (mainnet, testnet)
- **Ownership**: Controlled by platform admin wallet

## Security Model

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Custodian A     │     │ TransferCoordinator │     │ Custodian B    │
│ Wallet: 0xABC...│────▶│ Contract: 0xDEF... │◀────│ Wallet: 0x123...│
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Secret Manager  │     │   Blockchain      │     │ Secret Manager  │
│ Private Key A   │     │   Public Ledger   │     │ Private Key B   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Environment Configuration

### Development (.env.local)
```bash
# Each environment has its own contract
NEXT_PUBLIC_TRANSFER_CONTRACT_ADDRESS=0x123...  # Sepolia testnet
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/KEY
```

### Production (.env.production)
```bash
# Production uses mainnet contract
NEXT_PUBLIC_TRANSFER_CONTRACT_ADDRESS=0x456...  # Ethereum mainnet
NEXT_PUBLIC_RPC_URL=https://mainnet.infura.io/v3/KEY
```

## Transaction Flow

1. **Custodian initiates transfer**
   - Frontend calls API with transfer details

2. **API validates and prepares**
   - Retrieves custodian's private key from Secret Manager
   - Creates wallet signer instance

3. **Smart contract interaction**
   - Wallet signs transaction
   - Calls mint/burn on TransferCoordinator contract
   - Contract emits events

4. **Blockchain confirmation**
   - Transaction mined
   - Events logged
   - State updated in Firestore

## Key Security Points

- ✅ Private keys never leave Secret Manager
- ✅ Wallet addresses are public (safe in Firestore)
- ✅ Each custodian controls only their own wallet
- ✅ Contract enforces business rules on-chain
- ✅ All transactions are auditable on blockchain

## Production Deployment

1. **Deploy Contract**
   ```bash
   cd modules/eth-sdk
   npx hardhat run scripts/deploy.ts --network mainnet
   ```

2. **Configure Environment**
   ```bash
   # Set in production environment
   NEXT_PUBLIC_TRANSFER_CONTRACT_ADDRESS=<deployed-address>
   NEXT_PUBLIC_DEFAULT_NETWORK=mainnet
   ```

3. **Verify Contract**
   ```bash
   npx hardhat verify --network mainnet <address>
   ```

## Cost Considerations

- **Gas Fees**: Each custodian pays for their own transactions
- **Contract Deployment**: One-time platform cost (~0.5-2 ETH)
- **Storage**: Minimal on-chain storage keeps costs low