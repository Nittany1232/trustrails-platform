# V4 Custodian Verification Process

## Overview

RolloverEscrowV4 introduces proxy execution capabilities while maintaining strict custodian verification. Here's how the verification process works when you activate a new custodian.

## Verification Workflow

### 1. Frontend Custodian Registration
```javascript
// User completes verification in your frontend
const custodianData = {
  name: "New Financial Custodian",
  type: "platform", // or "byow"
  walletAddress: "0x123...", // Their actual wallet address
  // ... other verification data
};
```

### 2. Backend Verification Process
```javascript
// In your custodian verification API
async function verifyCustodian(custodianData) {
  // 1. Perform your business verification
  const verified = await performBusinessVerification(custodianData);
  
  if (verified) {
    // 2. Add to your database
    await saveCustodianToDatabase(custodianData);
    
    // 3. Add to blockchain contract
    await addCustodianToContract(custodianData.walletAddress);
    
    return { success: true, custodianId: newCustodianId };
  }
}
```

### 3. Blockchain Contract Registration
```javascript
// Add custodian to V4 contract
async function addCustodianToContract(walletAddress) {
  const { createRolloverSDK } = await import('@/lib/blockchain/rollover-contract-client');
  
  // Use platform wallet (has admin rights)
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
  const platformWallet = new ethers.Wallet(process.env.PLATFORM_WALLET_PRIVATE_KEY, provider);
  
  const sdk = await createRolloverSDK(platformWallet);
  
  // Add to verified custodians list
  const tx = await sdk.addVerifiedCustodian(walletAddress);
  await tx.wait();
  
  console.log(`✅ Custodian ${walletAddress} added to contract`);
}
```

## Custodian Types & Wallet Addresses

### Platform Custodians
- **Wallet Address**: Platform wallet address (`0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457`)
- **Gas Payment**: Platform pays gas
- **Proxy Execution**: Platform wallet executes on their behalf
- **Audit Trail**: Platform wallet recorded as both executing and custodian wallet

### BYOW Custodians  
- **Wallet Address**: User's actual wallet address (e.g., `0x15a944248B73b56487a8f6ccF126258f12075a01`)
- **Gas Payment**: User pays their own gas
- **Direct Execution**: User's wallet executes directly
- **Audit Trail**: User's wallet recorded as both executing and custodian wallet

## Contract Verification Flow

### When Custodian Verification Completes:

1. **Database Update**
   ```sql
   UPDATE custodians 
   SET verified = true, wallet_address = '0x123...'
   WHERE custodian_id = 'new-custodian-123';
   ```

2. **Contract Registration**
   ```solidity
   // Contract call
   addVerifiedCustodian(0x123...);
   
   // Result: verifiedCustodians[0x123...] = true
   ```

3. **Capability Unlocked**
   - Custodian can now participate in transfers
   - Platform can execute on their behalf (if platform custodian)
   - BYOW can execute directly (if BYOW custodian)

## API Integration Example

```javascript
// In your custodian verification API endpoint
app.post('/api/custodians/verify', async (req, res) => {
  try {
    const { custodianId, walletAddress, verificationType } = req.body;
    
    // 1. Business verification logic
    const businessVerified = await verifyBusinessRequirements(custodianId);
    
    if (businessVerified) {
      // 2. Update database
      await updateCustodianStatus(custodianId, 'verified', walletAddress);
      
      // 3. Add to blockchain contract
      const contractTx = await addCustodianToBlockchain(walletAddress);
      
      // 4. Response
      res.json({
        success: true,
        custodianId,
        walletAddress,
        contractTransaction: contractTx.hash,
        message: 'Custodian verified and added to blockchain'
      });
    } else {
      res.status(400).json({ error: 'Business verification failed' });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Platform Wallet Setup

The platform wallet needs specific permissions:

```javascript
// During initial contract deployment
async function setupPlatformWallet() {
  const contract = await deployV4Contract();
  
  // Add platform wallet as proxy
  await contract.addPlatformProxy(platformWalletAddress);
  
  // Platform wallet can now execute on behalf of platform custodians
  console.log('Platform proxy capabilities enabled');
}
```

## Transfer Scenarios Support

With proper verification, V4 supports all 4 scenarios:

| Source | Destination | Sender Execution | Receiver Execution |
|--------|-------------|------------------|-------------------|
| BYOW | BYOW | Direct MetaMask | Direct MetaMask |
| BYOW | Platform | Direct MetaMask | Platform Proxy |
| Platform | Platform | Platform Proxy | Platform Proxy |
| Platform | BYOW | Platform Proxy | Direct MetaMask |

## Monitoring & Verification

### Check Custodian Status
```javascript
// Verify a custodian is properly registered
async function checkCustodianStatus(walletAddress) {
  const sdk = await createRolloverSDK(signer);
  
  const isVerified = await sdk.isVerifiedCustodian(walletAddress);
  const isPlatformProxy = await sdk.isPlatformProxy(walletAddress);
  
  console.log({
    walletAddress,
    isVerified,
    isPlatformProxy,
    canParticipate: isVerified || isPlatformProxy
  });
}
```

## Error Handling

Common verification errors:

- `NotVerifiedCustodian(address)`: Wallet not added to contract
- `UnauthorizedProxy(address)`: Platform wallet not configured as proxy
- Database/blockchain sync issues

Always verify both database and blockchain state match after verification.