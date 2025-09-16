# Deployment Troubleshooting Guide

This guide covers common issues encountered during smart contract deployment and custodian verification, along with their solutions.

## Contract Deployment Issues

### 1. Deployment Transaction Fails

**Symptoms:**
- Transaction reverts during deployment
- Out of gas errors
- Network timeout errors

**Common Causes & Solutions:**

**Insufficient Gas:**
```bash
# Check gas estimation
npx hardhat run scripts/deploy-rollover-escrow-v3.ts --network sepolia --verbose

# If gas estimation fails, try manual gas limit
# In deploy script, add:
const gasLimit = 5000000; // Adjust as needed
const contract = await ContractFactory.deploy({gasLimit});
```

**Insufficient ETH Balance:**
```bash
# Check deployer balance
npx hardhat console --network sepolia
> const balance = await ethers.provider.getBalance("0xYourDeployerAddress");
> console.log(ethers.utils.formatEther(balance));

# Get Sepolia ETH from faucet if needed
```

**Network Issues:**
```bash
# Test RPC connection
curl -X POST $SEPOLIA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Try alternative RPC endpoints:
# - Alchemy: https://eth-sepolia.alchemyapi.io/v2/YOUR-API-KEY
# - Infura: https://sepolia.infura.io/v3/YOUR-PROJECT-ID
```

### 2. Contract Verification Fails

**Symptoms:**
- Contract deploys but can't be verified on Etherscan
- Source code verification fails

**Solutions:**

**Check Etherscan API Key:**
```bash
# Verify API key is valid
curl "https://api-sepolia.etherscan.io/api?module=account&action=balance&address=0x...&tag=latest&apikey=$ETHERSCAN_API_KEY"
```

**Manual Verification:**
1. Go to Etherscan contract page
2. Click "Verify and Publish"
3. Select "Solidity (Single file)"
4. Copy contract source code
5. Match compiler version and optimization settings

### 3. Wrong Contract Address in Logs

**Symptoms:**
- Deployment appears successful but contract doesn't respond
- Wrong address in deployment logs

**Solution:**
```bash
# Double-check transaction receipt
npx hardhat console --network sepolia
> const tx = await ethers.provider.getTransactionReceipt("0xTRANSACTION_HASH");
> console.log("Contract Address:", tx.contractAddress);
```

## Custodian Verification Issues

### 1. "AccessControl: account is missing role" Error

**Symptoms:**
```
Error: Transaction reverted: AccessControl: account 0x... is missing role 0x...
```

**Diagnosis:**
```bash
# Check if platform wallet has OPERATOR_ROLE
node -e "
const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const contract = new ethers.Contract('CONTRACT_ADDRESS', ABI, provider);
const OPERATOR_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('OPERATOR_ROLE'));
contract.hasRole(OPERATOR_ROLE, 'PLATFORM_WALLET_ADDRESS').then(console.log);
"
```

**Solution:**
```bash
# Grant OPERATOR_ROLE to platform wallet
node scripts/grant-operator-role-v3.js

# Verify role was granted
node scripts/verify-v3-deployment.js
```

### 2. "Invalid address checksum" Error

**Symptoms:**
```
Error: invalid address checksum (argument="address", value="0x...", code=INVALID_ARGUMENT)
```

**Cause:**
Address stored in Firestore doesn't match EIP-55 checksum format.

**Automatic Fix:**
Scripts handle this automatically, but you can manually fix:

```javascript
const { ethers } = require('ethers');
const correctAddress = ethers.utils.getAddress(invalidAddress);
```

**Prevention:**
Always store addresses in proper checksum format in Firestore.

### 3. Contract Paused Error

**Symptoms:**
```
Error: Pausable: paused
```

**Check if contract is paused:**
```bash
node -e "
const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const contract = new ethers.Contract('CONTRACT_ADDRESS', ABI, provider);
contract.paused().then(paused => console.log('Contract paused:', paused));
"
```

**Solution (Admin only):**
```javascript
// Only contract admin can unpause
await contract.unpause();
```

### 4. Batch Verification Partially Fails

**Symptoms:**
- Some custodians verify successfully
- Others fail with various errors
- Inconsistent results

**Diagnosis Strategy:**

1. **Check individual custodian data:**
```bash
# Review Firestore custodian data
node -e "
const admin = require('./lib/firebase-admin-simple');
const db = admin.firestore();
db.collection('custodians').get().then(snapshot => {
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log('ID:', doc.id);
    console.log('Name:', data.name);
    console.log('Address:', data.walletAddress);
    console.log('Valid:', ethers.utils.isAddress(data.walletAddress || ''));
    console.log('---');
  });
});
"
```

2. **Test individual verification:**
```javascript
// Test one custodian at a time
const testAddress = "0x...";
try {
  await sdk.verifyCustodian(testAddress);
  console.log("✅ Success");
} catch (error) {
  console.log("❌ Failed:", error.message);
}
```

**Common Fixes:**

**Missing wallet addresses:**
```javascript
// Skip custodians without wallet addresses
if (!custodian.walletAddress) {
  console.log(`⚠️ Skipping ${custodian.name}: No wallet address`);
  continue;
}
```

**Invalid address format:**
```javascript
// Validate before attempting verification
try {
  const checksumAddress = ethers.utils.getAddress(custodian.walletAddress);
  await sdk.verifyCustodian(checksumAddress);
} catch (error) {
  if (error.code === 'INVALID_ARGUMENT') {
    console.log(`❌ Invalid address for ${custodian.name}: ${custodian.walletAddress}`);
  } else {
    throw error; // Re-throw other errors
  }
}
```

## Environment Configuration Issues

### 1. RPC Connection Fails

**Symptoms:**
- Scripts hang or timeout
- "Network error" messages
- Connection refused errors

**Debug Steps:**

1. **Test RPC endpoint:**
```bash
curl -X POST $SEPOLIA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}'
```

2. **Check rate limits:**
```bash
# Some RPC providers have rate limits
# Try adding delays between requests or use different endpoint
```

3. **Verify environment variables:**
```bash
echo "RPC URL: $SEPOLIA_RPC_URL"
echo "Private Key length: ${#SEPOLIA_PRIVATE_KEY}"
echo "Etherscan API Key: $ETHERSCAN_API_KEY"
```

### 2. Private Key Issues

**Symptoms:**
- "Invalid private key" errors
- Deployment fails with authentication error

**Checks:**

```bash
# Verify private key format (should be 64 hex characters)
echo "Private key length: ${#SEPOLIA_PRIVATE_KEY}"

# Should output: Private key length: 64

# Check if key has 0x prefix (shouldn't have one in env)
echo $SEPOLIA_PRIVATE_KEY | grep "^0x" && echo "Remove 0x prefix from private key"
```

**Solution:**
Private key should be 64 hex characters without "0x" prefix.

### 3. Wrong Contract Address in Environment

**Symptoms:**
- Scripts run but affect wrong contract
- Verification succeeds but doesn't appear in app

**Check current configuration:**
```bash
grep -r "ROLLOVER_ESCROW" .env* 
grep -r "CONTRACT_ADDRESS" modules/eth-sdk/deployments.json
```

**Fix:**
Update both `.env.local` and `modules/eth-sdk/deployments.json` with correct address.

## Script-Specific Issues

### 1. verify-all-custodians-v3.js Fails

**Common Error: "Cannot read property 'walletAddress' of undefined"**

**Cause:** Firestore data structure mismatch

**Debug:**
```bash
node -e "
const admin = require('./lib/firebase-admin-simple');
const db = admin.firestore();
db.collection('custodians').limit(1).get().then(snapshot => {
  const doc = snapshot.docs[0];
  console.log('Sample custodian structure:');
  console.log(JSON.stringify(doc.data(), null, 2));
});
"
```

**Fix:** Ensure custodians have `walletAddress` field, not `address` or `wallet`.

### 2. grant-operator-role-v3.js Fails

**Error: "Transaction reverted without a reason string"**

**Possible Causes:**
- Deployer wallet doesn't have admin role
- Contract address is wrong
- Network issues

**Debug:**
```bash
# Check deployer has admin role
node -e "
const { ethers } = require('ethers');
// ... check DEFAULT_ADMIN_ROLE for deployer address
"
```

### 3. Scripts Can't Connect to Firestore

**Error: "Could not load the default credentials"**

**Solution:**
```bash
# For local development
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"

# Or use Application Default Credentials
gcloud auth application-default login
```

## Performance Issues

### 1. Slow Batch Verification

**Symptoms:**
- Verification takes very long
- RPC rate limiting errors

**Solutions:**

**Add delays:**
```javascript
// Add delay between verifications
await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
```

**Batch processing:**
```javascript
// Process in smaller batches
const batchSize = 5;
for (let i = 0; i < custodians.length; i += batchSize) {
  const batch = custodians.slice(i, i + batchSize);
  await Promise.all(batch.map(processCustodian));
  await new Promise(resolve => setTimeout(resolve, 2000)); // Pause between batches
}
```

### 2. High Gas Costs

**Monitor gas usage:**
```javascript
const tx = await contract.verifyCustodian(address);
const receipt = await tx.wait();
console.log('Gas used:', receipt.gasUsed.toString());
```

**Optimize:**
- Batch multiple verifications in single transaction (if contract supports)
- Time deployments during low network congestion

## Monitoring and Alerts

### 1. Set Up Monitoring

**Check contract health:**
```bash
# Create monitoring script
cat > scripts/monitor-contract.js << 'EOF'
const { ethers } = require('ethers');

async function checkContract() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  
  try {
    const version = await contract.version();
    const paused = await contract.paused();
    console.log(`Contract version: ${version}, paused: ${paused}`);
    
    if (paused) {
      console.error('⚠️ Contract is paused!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Contract check failed:', error.message);
    process.exit(1);
  }
}

checkContract();
EOF
```

**Run health check:**
```bash
node scripts/monitor-contract.js
```

### 2. Log Analysis

**Check for patterns in failures:**
```bash
# Analyze verification logs
grep "Failed to verify" logs/*.log | cut -d: -f3 | sort | uniq -c | sort -nr
```

## Recovery Procedures

### 1. Complete Deployment Failure

**If deployment completely fails:**

1. Check deployer wallet balance
2. Verify network connectivity
3. Try deployment with increased gas limit
4. Consider alternative RPC endpoint

### 2. Partial Verification Failure

**If some custodians fail verification:**

1. Run verification status check
2. Identify failed custodians
3. Fix data issues in Firestore
4. Re-run verification for failed custodians only

### 3. Contract State Issues

**If contract is in unexpected state:**

1. Check if contract is paused
2. Verify deployer still has admin role
3. Check for any upgrade or migration needs
4. Consider redeployment if state is corrupted

## Getting Help

### 1. Information to Gather

Before seeking help, collect:
- Contract address
- Transaction hashes of failed operations
- Error messages (full stack traces)
- Network (Sepolia/Mainnet)
- Script versions and commit hash

### 2. Useful Debug Commands

```bash
# Get contract information
npx hardhat verify --network sepolia CONTRACT_ADDRESS

# Check transaction details
npx hardhat console --network sepolia
> await ethers.provider.getTransaction("0xTX_HASH")

# Get contract events
> const filter = contract.filters.CustodianVerified();
> const events = await contract.queryFilter(filter);
```

### 3. External Resources

- [Etherscan Sepolia](https://sepolia.etherscan.io/) - Transaction and contract verification
- [Sepolia Faucet](https://sepoliafaucet.com/) - Get test ETH
- [Hardhat Documentation](https://hardhat.org/docs) - Framework documentation
- [Ethers.js Documentation](https://docs.ethers.io/) - Library documentation