# Custodian Level Management Guide

## Overview
Custodian levels determine the capabilities of each custodian on the TrustRails platform:
- **Level 1**: Basic transfers (deprecated, use Level 2)
- **Level 2**: Standard ACH settlement (off-chain)
- **Level 3**: Tokenized settlement with TRUSD (on-chain mint/burn)

## Critical Requirement for Level 3
**For auto-mint/burn to work, custodians MUST have their level set on the blockchain contract**, not just in the database.

## What You Need

### 1. Custodian Wallet Address
Each custodian needs a wallet address. This can be:
- **Platform-managed wallet**: Created by TrustRails
- **BYOW (Bring Your Own Wallet)**: Custodian's own wallet

To find a custodian's wallet address:
```javascript
// Check Firestore
custodians/{custodianId}/wallet.address
// or
custodians/{custodianId}/byowConfiguration.walletAddress
```

### 2. Admin Wallet with Permissions
You need an admin wallet that has `DEFAULT_ADMIN_ROLE` on the V6 contract.
- Current admin: `0xbCBB8C9cb1A38f23a3814c569D0DbB7e36bc2B0c`
- Must have ETH for gas fees (~0.001 ETH per custodian)

## Setting Custodian Levels

### Quick Setup (Using Script)
```bash
# Check current levels
node set-custodian-levels.js --check

# Set levels for test custodians
node set-custodian-levels.js

# The script will:
# 1. Connect to Arbitrum Sepolia
# 2. Use admin wallet to set levels
# 3. Verify the changes
```

### Manual Setup (For Production)
```javascript
const { ethers } = require('ethers');

// Setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
const v6Address = '0xE88Cd9f63252D21075cFDBdF5655080D36382A78';

// Contract interface
const abi = ['function setCustodianLevel(address custodian, uint8 level)'];
const contract = new ethers.Contract(v6Address, abi, adminWallet);

// Set custodian to Level 3
await contract.setCustodianLevel(custodianWallet, 3);
```

## Level Transition Process

### Upgrading Level 2 → Level 3
1. **Get custodian wallet address** from Firestore
2. **Set level on contract**: `setCustodianLevel(wallet, 3)`
3. **Update Firestore**: Set `custodians/{id}/level = 3`
4. **Test**: Create a transfer between two Level 3 custodians

### Downgrading Level 3 → Level 2
1. **Warning**: Existing tokenized transfers may fail
2. **Set level on contract**: `setCustodianLevel(wallet, 2)`
3. **Update Firestore**: Set `custodians/{id}/level = 2`

## Platform Activation Checklist

### Initial Setup
- [ ] Deploy V6 contract to network
- [ ] Deploy TRUSD token contract
- [ ] Grant V6 contract MINTER_ROLE on TRUSD
- [ ] Grant V6 contract BURNER_ROLE on TRUSD
- [ ] Grant platform wallet PLATFORM_OPERATOR_ROLE on V6

### Per-Custodian Setup
- [ ] Create/identify custodian wallet address
- [ ] Fund custodian wallet with ETH (for BYOW)
- [ ] Set custodian level on V6 contract
- [ ] Update custodian level in Firestore
- [ ] Verify with test transfer

## How Auto-Mint/Burn Works

The V6 contract has built-in logic for Level 3:

```solidity
// In executeTransfer function
if (senderLevel == 3 && receiverLevel == 3) {
    _mintTransferToken(transferId);  // Auto-mint TRUSD
} else {
    transfer.state = TransferState.Completed;  // Skip to complete for Level 2
}
```

### Level 3 Flow:
1. **Execute Transfer** → Auto-mints TRUSD to receiver's wallet
2. **Receiver confirms receipt** → Burns TRUSD
3. **Transfer marked complete**

### Level 2 Flow:
1. **Execute Transfer** → Marks transfer executed
2. **Send funds** (off-chain) → Records settlement event
3. **Confirm receipt** (off-chain) → Marks complete

## Troubleshooting

### Issue: Level 3 transfer not auto-minting
**Cause**: Custodian levels not set on contract
```bash
# Check levels
node set-custodian-levels.js --check

# If Level 0, set to Level 3
node set-custodian-levels.js
```

### Issue: "Insufficient privileges" error
**Cause**: Admin wallet doesn't have DEFAULT_ADMIN_ROLE
**Solution**: Use the correct admin wallet or grant role

### Issue: Transaction fails with "InvalidState"
**Cause**: Transfer not in correct state for operation
**Solution**: Check transfer state on blockchain, may need recovery

## Important Notes

1. **Wallet Address Required**: The contract uses wallet addresses, not custodian IDs
2. **On-Chain Configuration**: Levels MUST be set on the blockchain contract
3. **Both Custodians**: For Level 3, BOTH sender and receiver must be Level 3
4. **Gas Fees**: Admin wallet needs ETH for setting levels
5. **Persistence**: Levels persist on blockchain even if database changes

## Scripts Available

- `get-custodian-wallets.js` - Find custodian wallet addresses
- `set-custodian-levels.js` - Set levels on blockchain
- `test-arbitrum-config.js` - Verify contract configuration

## Environment Variables

```bash
# Required for scripts
NEXT_PUBLIC_ROLLOVER_ESCROW_V5_ADDRESS=0xE88Cd9f63252D21075cFDBdF5655080D36382A78
ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
```

## Security Considerations

- Only admin wallets can set custodian levels
- Levels affect financial operations - verify before changing
- Keep admin private keys secure
- Test changes on testnet first