# Platform Wallet Architecture

## Overview

The platform uses a hybrid approach where:
1. Each custodian has their own wallet address (for ownership/compliance)
2. The platform has an operator wallet that executes transactions (pays gas)
3. Smart contracts track the relationship between custodians and their assets

## How It Works

### 1. Wallet Roles

```
┌─────────────────────────────────────────────────────────┐
│                    Smart Contract                        │
├─────────────────────────────────────────────────────────┤
│  Custodian Wallets (Owners)    │  Platform Wallet       │
│  ├── Fidelity: 0x123...        │  (Operator)            │
│  ├── Vanguard: 0x456...        │  0xPLATFORM...         │
│  └── Schwab: 0x789...          │  └── Pays all gas      │
│                                 │  └── Executes txns     │
└─────────────────────────────────────────────────────────┘
```

### 2. Token Ownership Model

```solidity
// Simplified contract structure
contract TransferToken {
    // Track token ownership by custodian wallet
    mapping(uint256 => address) public tokenOwner;
    
    // Platform operator can mint/burn on behalf of custodians
    address public platformOperator;
    
    // Mint tokens TO a custodian's wallet
    function mintTo(address custodian, uint256 amount, string transferId) 
        onlyPlatformOperator {
        _mint(custodian, amount);
        emit TokensMinted(custodian, amount, transferId);
    }
    
    // Burn tokens FROM a custodian's wallet (with permission)
    function burnFrom(address custodian, uint256 amount, string transferId) 
        onlyPlatformOperator {
        _burn(custodian, amount);
        emit TokensBurned(custodian, amount, transferId);
    }
}
```

### 3. Transaction Flow

#### Outbound Transfer (Mint)
```
1. User initiates transfer from Custodian A to Custodian B
2. Platform wallet calls: mintTo(custodianB.wallet, amount, transferId)
3. Tokens are minted to Custodian B's wallet
4. Gas paid by platform, ownership to Custodian B
```

#### Inbound Transfer (Burn)
```
1. Tokens arrive at Custodian A from external source
2. Platform wallet calls: burnFrom(custodianA.wallet, amount, transferId)
3. Tokens are burned from Custodian A's wallet
4. Gas paid by platform, tokens removed from Custodian A
```

## Benefits

### 1. Compliance & Audit Trail
- Each custodian has a unique wallet address
- On-chain ownership is clear: tokens are IN custodian wallets
- Complete audit trail of who owns what
- Etherscan shows: "Custodian A owns X tokens"

### 2. User Experience
- Custodians don't need ETH for gas
- No "out of gas" errors
- Platform subsidizes transaction costs
- Seamless operations

### 3. Security
- Custodian wallets are "cold" (no private keys needed)
- Only platform operator wallet needs secured private key
- Custodians can verify their balances independently
- Can implement multi-sig for platform operator

## Implementation Example

```typescript
// In blockchain service
class PlatformBlockchainService {
  private platformWallet: Wallet;  // Executes transactions
  
  async mintTokens(
    toCustodianAddress: string,    // Custodian's wallet (owner)
    amount: number,
    transferId: string
  ) {
    const contract = new Contract(
      CONTRACT_ADDRESS,
      ABI,
      this.platformWallet         // Platform pays gas
    );
    
    // Mint TO the custodian's wallet
    const tx = await contract.mintTo(
      toCustodianAddress,         // Tokens go here
      amount,
      transferId
    );
    
    // On-chain result: Custodian wallet owns the tokens
    // Gas paid by: Platform wallet
    return tx;
  }
}
```

## Real-World Analogy

Think of it like a bank wire system:
- **Custodian Wallets** = Bank account numbers (identity/ownership)
- **Platform Wallet** = Wire operator (executes transfers)
- **Smart Contract** = Wire system (enforces rules)

The wire operator (platform) executes transfers between accounts, but the accounts (custodians) own the funds.

## For Production

1. **Deploy smart contracts** that implement this operator model
2. **Each custodian gets a wallet address** (can be generated, no private key needed)
3. **Platform operator wallet** handles all execution
4. **On-chain verification**: Anyone can verify custodian balances

## For Testing

You can test this approach by:
1. Using the existing contract (already supports this pattern)
2. Funding only the platform wallet with test ETH
3. Custodian wallets just need addresses (no ETH required)