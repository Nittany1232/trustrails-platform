# Empower Blockchain Level Fix Instructions

## Current Issue

Empower custodian has **UI Level 2 (Digital)** but **Blockchain Level 0** instead of the expected **Level 3**.

This prevents tokenization from working between Empower and other Level 3 custodians.

## Root Cause

The platform wallet (`0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457`) doesn't have the required `PLATFORM_PROXY_ROLE` permission on the new V6 contract (`0x4863545df984dF561fcaA0Bff6B5b01F2d6B52C6`).

When the admin UI tries to update the blockchain level, it fails with an access control error.

## Solutions

### Option 1: Grant Platform Wallet Permissions (Recommended)

**Who can do this:** Whoever deployed the V6 contract at `0x4863545df984dF561fcaA0Bff6B5b01F2d6B52C6`

1. **Using Arbitrum Sepolia Explorer:**
   - Go to: https://sepolia-explorer.arbitrum.io/address/0x4863545df984dF561fcaA0Bff6B5b01F2d6B52C6#writeContract
   - Connect the deployment wallet
   - Find the `grantRole` function
   - Enter:
     - `role`: `0x0000000000000000000000000000000000000000000000000000000000000003` (PLATFORM_PROXY_ROLE)
     - `account`: `0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457` (platform wallet)
   - Execute the transaction

2. **Using Foundry (cast command):**
   ```bash
   cast send 0x4863545df984dF561fcaA0Bff6B5b01F2d6B52C6 \
     "grantRole(bytes32,address)" \
     0x0000000000000000000000000000000000000000000000000000000000000003 \
     0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457 \
     --private-key YOUR_DEPLOYMENT_WALLET_PRIVATE_KEY \
     --rpc-url https://arb-sepolia.g.alchemy.com/v2/8i7OJBUH5bByemk2JdNWwtLRHO3QRsE-
   ```

3. **After granting the role:**
   - The admin UI level updates will work automatically
   - Run in browser console while logged in as admin:
   ```javascript
   // Load the browser fix script
   const script = await fetch('/scripts/browser-fix-empower-level.js').then(r => r.text());
   eval(script);
   ```

### Option 2: Direct Blockchain Update (If you have deployment wallet)

If you have the private key for the wallet that deployed the V6 contract:

1. **Add to `.env.local`:**
   ```bash
   DEPLOYMENT_WALLET_PRIVATE_KEY=0x...
   ```

2. **Create and run this script:**
   ```javascript
   // Save as scripts/direct-fix-empower.js
   const { ethers } = require('ethers');
   require('dotenv').config({ path: '.env.local' });

   async function fixEmpower() {
     const provider = new ethers.JsonRpcProvider(
       'https://arb-sepolia.g.alchemy.com/v2/8i7OJBUH5bByemk2JdNWwtLRHO3QRsE-'
     );
     
     const wallet = new ethers.Wallet(
       process.env.DEPLOYMENT_WALLET_PRIVATE_KEY, 
       provider
     );
     
     const V6_ABI = [
       "function setCustodianLevel(address custodian, uint8 level) external"
     ];
     
     const contract = new ethers.Contract(
       '0x4863545df984dF561fcaA0Bff6B5b01F2d6B52C6',
       V6_ABI,
       wallet
     );
     
     const tx = await contract.setCustodianLevel(
       '0x86fC2F9db630E4706d8311e207cfeC24ad5C52D2', // Empower wallet
       3 // Blockchain level 3 for tokenization
     );
     
     console.log('Transaction:', tx.hash);
     await tx.wait();
     console.log('✅ Empower set to blockchain level 3!');
   }

   fixEmpower();
   ```

3. **Run:**
   ```bash
   node scripts/direct-fix-empower.js
   ```

### Option 3: Manual Transaction (Using MetaMask or WalletConnect)

1. **Connect to Arbitrum Sepolia**
2. **Go to the V6 contract on Arbiscan**
3. **Connect wallet that has admin permissions**
4. **Call `setCustodianLevel`:**
   - `custodian`: `0x86fC2F9db630E4706d8311e207cfeC24ad5C52D2`
   - `level`: `3`

## Verification

After fixing, verify the level is correct:

```bash
# Run the verification script
node scripts/verify-blockchain-levels.js
```

Expected output for Empower:
- UI Level: 2
- Blockchain Level: 3
- Status: ✅ Ready for tokenization

## Test Tokenization

Once fixed:

1. Create a NEW transfer between:
   - Empower ↔ Tokenization Test Custodian 1
   - Or Empower ↔ Tokenization Test Custodian 2

2. The transfer should:
   - Show `supportsTokenization: true`
   - Auto-mint TRUSD tokens after execution (State 6)

## Current Status

✅ **Database:** Empower is Level 2 (Digital) in Firebase
❌ **Blockchain:** Empower is Level 0 (not set) on V6 contract
⚠️ **Admin UI:** Updates succeed in database but fail on blockchain due to permissions

## Scripts Available

- `scripts/test-admin-level-update.js` - Test current status and provide instructions
- `scripts/verify-blockchain-levels.js` - Verify all custodian levels
- `scripts/browser-fix-empower-level.js` - Browser console script for admin UI
- `scripts/fix-empower-blockchain-level.js` - Direct fix (requires platform wallet permissions)

## Next Steps

1. **Immediate:** Grant platform wallet permissions on V6 contract
2. **Then:** Run the browser fix script to set Empower to Level 3
3. **Finally:** Test tokenization with a new transfer

## Contact

If you need help identifying who deployed the V6 contract, check:
- Arbitrum Sepolia Explorer: https://sepolia-explorer.arbitrum.io/address/0x4863545df984dF561fcaA0Bff6B5b01F2d6B52C6
- Look for the contract creation transaction
- The "from" address is the deployer who can grant permissions