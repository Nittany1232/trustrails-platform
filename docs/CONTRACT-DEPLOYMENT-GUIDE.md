# Contract Deployment Guide

This guide documents the complete process for deploying new versions of the TrustRails smart contracts to Sepolia (and eventually mainnet).

## Prerequisites

1. **Environment Setup**
   ```bash
   cd modules/eth-sdk
   npm install
   ```

2. **Required Environment Variables**
   - `SEPOLIA_PRIVATE_KEY` - Deployer wallet private key
   - `SEPOLIA_RPC_URL` - Sepolia RPC endpoint
   - `ETHERSCAN_API_KEY` - For contract verification

3. **Deployer Wallet Requirements**
   - Must have sufficient Sepolia ETH for deployment gas
   - Should be the platform operator wallet for role management

## Deployment Process

### Step 1: Deploy Contract

```bash
cd modules/eth-sdk
npx hardhat run scripts/deploy-rollover-escrow-v3.ts --network sepolia
```

**Expected Output:**
```
RolloverEscrowV3 deployed to: 0x[CONTRACT_ADDRESS]
Deployment transaction: 0x[TX_HASH]
```

### Step 2: Verify Deployment

Run the verification script to confirm deployment success:

```bash
node scripts/verify-v3-deployment.js
```

**Checks performed:**
- Contract is live and responding
- Version number is correct
- Execution delay is properly set
- Contract is not paused
- Deployer has admin role

### Step 3: Update Environment Configuration

Update the contract address in your environment:

```bash
# In .env.local
NEXT_PUBLIC_ROLLOVER_ESCROW_V3_ADDRESS=0x[NEW_CONTRACT_ADDRESS]
```

Update `modules/eth-sdk/deployments.json`:
```json
{
  "sepolia": {
    "RolloverEscrowV3": "0x[NEW_CONTRACT_ADDRESS]"
  }
}
```

### Step 4: Grant Operator Role to Platform Wallet

```bash
node scripts/grant-operator-role-v3.js
```

This grants the OPERATOR_ROLE to the platform wallet, allowing it to verify custodian addresses.

### Step 5: Verify All Existing Custodians

```bash
node scripts/verify-all-custodians-v3.js
```

**What this does:**
- Fetches all custodians from Firestore
- Attempts to verify each custodian wallet address on the new contract
- Reports success/failure for each verification
- Handles checksum validation automatically

### Step 6: Confirm Whitelist Success

```bash
node scripts/verify-whitelist-success-v3.js
```

Final verification that all critical custodians are properly whitelisted.

## Key Deployment Parameters

### V3 Contract Parameters
- **Execution Delay**: 900 seconds (15 minutes)
- **Version**: "3.0.0"
- **Initial State**: Not paused
- **Admin Role**: Deployer wallet
- **Operator Role**: Platform wallet (granted post-deployment)

### Contract Addresses by Network
- **Sepolia**: `0xD312f1DeBF61791D9f85ABAA4D90562db2b63a30` (V3)
- **Mainnet**: TBD

## Script Locations

All deployment and verification scripts are in `scripts/`:

- `deploy-rollover-escrow-v3.ts` - Main deployment script
- `verify-v3-deployment.js` - Verify deployment success
- `grant-operator-role-v3.js` - Grant operator role to platform wallet
- `verify-all-custodians-v3.js` - Batch verify all custodians
- `verify-whitelist-success-v3.js` - Final verification check

## Post-Deployment Checklist

- [ ] Contract deployed successfully
- [ ] Deployment verification passed
- [ ] Environment variables updated
- [ ] deployments.json updated
- [ ] Platform wallet has OPERATOR_ROLE
- [ ] All existing custodians verified
- [ ] Whitelist verification passed
- [ ] Documentation updated with new contract address

## V3 Improvements Over V2

1. **No Balance Tracking**: Eliminates arithmetic overflow errors
2. **Faster Execution**: 15-minute delay vs 1-hour delay
3. **Gas Optimization**: Custom errors and efficient operations
4. **Better Error Handling**: More descriptive error messages
5. **Enhanced Serialization**: Improved BigInt handling for APIs

## Troubleshooting

### Common Issues

1. **Deployment Fails**
   - Check deployer wallet has sufficient ETH
   - Verify private key is correct
   - Ensure RPC endpoint is accessible

2. **Custodian Verification Fails**
   - Address checksum issues (handled automatically by scripts)
   - Platform wallet missing OPERATOR_ROLE
   - Contract not properly deployed

3. **Environment Issues**
   - Double-check all environment variables
   - Ensure deployments.json is updated
   - Restart development server after env changes

### Getting Help

- Check Etherscan for transaction details
- Use `npx hardhat console --network sepolia` for debugging
- Review script output logs for specific error messages

## Security Notes

- Always test on Sepolia before mainnet deployment
- Keep private keys secure and never commit them
- Verify contract addresses match expected deployments
- Test critical functions before announcing deployment