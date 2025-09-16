# 🛡️ Contract Deployment Prevention Checklist

## Purpose
Prevent partial or broken contract deployments that appear to work but fail at critical operations.

---

## 🚀 PRE-DEPLOYMENT PHASE

### Planning
- [ ] Document ALL contract dependencies
- [ ] Identify initialization requirements (constructor vs. initializer)
- [ ] List ALL required roles and permissions
- [ ] Define success criteria for deployment

### Script Preparation
- [ ] Deployment script includes initialization calls
- [ ] Role granting is included in script
- [ ] Validation steps are built into script
- [ ] Script has rollback plan if validation fails

---

## 📦 DEPLOYMENT PHASE

### Step 1: Deploy Contracts
```javascript
- [ ] Deploy V6/RolloverEscrow contract
- [ ] Deploy TRUSD token contract
- [ ] Record all contract addresses
- [ ] Verify contracts on block explorer
```

### Step 2: Initialize Contracts
```javascript
- [ ] If proxy: Call initialize() function
- [ ] If regular: Verify constructor ran properly
- [ ] Confirm admin role is set
- [ ] Check initialization state variables
```

### Step 3: Configure Permissions
```javascript
- [ ] Grant PLATFORM_OPERATOR_ROLE to platform wallet on V6
- [ ] Grant MINTER_ROLE to V6 contract on TRUSD
- [ ] Grant BURNER_ROLE to V6 contract on TRUSD
```

### Step 4: Configure Custodian Levels (CRITICAL - OFTEN MISSED!)
```javascript
// THIS STEP IS MANDATORY FOR LEVEL 3 TRANSFERS TO WORK
// Without this, transfers will reach state 4 but fail to auto-mint

// Level 2 Custodians (non-tokenized)
- [ ] setCustodianLevel(0x855c53F4B495e83050611a898fA7d7f788951f95, 2) // demo-custodian
- [ ] setCustodianLevel(0x15a944248B73b56487a8f6ccF126258f12075a01, 2) // metamask-test
- [ ] setCustodianLevel(0xbCBB8C9cb1A38f23a3814c569D0DbB7e36bc2B0c, 2) // test-custodian-001

// Level 3 Custodians (tokenized - CRITICAL FOR AUTO-MINT)
- [ ] setCustodianLevel(0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457, 3) // platform-wallet

// Verify after setting
- [ ] getCustodianLevel(platform-wallet) returns 3
- [ ] Level 3 transfers will auto-mint TRUSD tokens
```

---

## ✅ VALIDATION PHASE (CRITICAL!)

### Level 1: Basic Checks
```javascript
// Contract Existence
- [ ] V6 contract has bytecode > 2 bytes
- [ ] TRUSD contract has bytecode > 2 bytes
- [ ] Contracts respond to basic calls

// View Functions Work
- [ ] TRUSD.name() returns "TrustRails USD"
- [ ] TRUSD.symbol() returns "TRUSD"  
- [ ] TRUSD.decimals() returns 2
- [ ] V6.version() returns expected version
```

### Level 2: Permission & Custodian Checks
```javascript
// Check Roles Exist
- [ ] hasRole(ADMIN, deployer) = true
- [ ] hasRole(PLATFORM_OPERATOR, platformWallet) = true
- [ ] hasRole(MINTER_ROLE, v6Contract) = true
- [ ] hasRole(BURNER_ROLE, v6Contract) = true

// ⚠️ CRITICAL: Check Custodian Levels!
- [ ] getCustodianLevel(platformWallet) = 3 (NOT 0!)
- [ ] getCustodianLevel(demoCustodian) = 2 or 3
- [ ] At least one wallet is Level 3 for testing

// ⚠️ CRITICAL: Test Actual Operations!
- [ ] Platform wallet CAN create agreement
- [ ] Platform wallet CAN submit financials
- [ ] V6 contract CAN mint tokens (test mint 1 token)
- [ ] V6 contract CAN burn tokens (test burn 1 token)
```

### Level 3: Full Flow Test
```javascript
// Complete Level 3 Transfer Test
- [ ] Create new transfer
- [ ] Receiver agrees (state 1)
- [ ] Sender agrees (state 2)  
- [ ] Both agreed (state 3)
- [ ] Submit financials (state 4)
- [ ] Execute transfer (state 5) ← CRITICAL TEST
- [ ] Tokens minted (state 6)
- [ ] Tokens burned (state 7)
- [ ] Transfer completed (state 8)

// Verify Results
- [ ] Transfer state is 8 (Completed)
- [ ] Token balance changes are correct
- [ ] Events emitted properly
- [ ] No reverts or errors
```

---

## 🔍 VALIDATION SCRIPT

Save this as `validate-deployment.js` and run after EVERY deployment:

```javascript
const { ethers } = require('ethers');
require('dotenv').config({ path: '.env.local' });

async function validateDeployment() {
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  // Get contract addresses
  const v6Address = process.env.NEXT_PUBLIC_ROLLOVER_ESCROW_V5_ADDRESS;
  const trusdAddress = process.env.NEXT_PUBLIC_TRUSD_ADDRESS;
  
  console.log('🔍 Validating Deployment...\n');
  
  // Test 1: Contracts Exist
  try {
    const v6Code = await provider.getCode(v6Address);
    if (v6Code.length > 2) {
      results.passed.push('V6 contract deployed');
    } else {
      results.failed.push('V6 contract not deployed');
    }
  } catch (e) {
    results.failed.push(`V6 contract check failed: ${e.message}`);
  }
  
  // Test 2: TRUSD Functions
  try {
    const trusdAbi = [
      'function name() view returns (string)',
      'function hasRole(bytes32, address) view returns (bool)'
    ];
    const trusd = new ethers.Contract(trusdAddress, trusdAbi, provider);
    
    const name = await trusd.name();
    if (name === 'TrustRails USD') {
      results.passed.push('TRUSD name correct');
    } else {
      results.failed.push(`TRUSD name wrong: ${name}`);
    }
  } catch (e) {
    results.failed.push(`TRUSD check failed: ${e.message}`);
  }
  
  // Test 3: Critical Permission Test
  try {
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('MINTER_ROLE'));
    const trusdAbi = ['function hasRole(bytes32, address) view returns (bool)'];
    const trusd = new ethers.Contract(trusdAddress, trusdAbi, provider);
    
    const v6CanMint = await trusd.hasRole(MINTER_ROLE, v6Address);
    if (v6CanMint) {
      results.passed.push('V6 has MINTER_ROLE');
    } else {
      results.failed.push('V6 lacks MINTER_ROLE - CRITICAL!');
    }
  } catch (e) {
    results.failed.push(`Role check failed: ${e.message}`);
  }
  
  // Test 4: CRITICAL Custodian Level Check
  try {
    const v6Abi = ['function getCustodianLevel(address) view returns (uint8)'];
    const v6 = new ethers.Contract(v6Address, v6Abi, provider);
    
    const platformWallet = '0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457';
    const level = await v6.getCustodianLevel(platformWallet);
    
    if (Number(level) === 3) {
      results.passed.push('Platform wallet is Level 3 custodian');
    } else if (Number(level) === 0) {
      results.failed.push('Platform wallet NOT configured as custodian - Level 3 transfers WILL FAIL!');
    } else {
      results.warnings.push(`Platform wallet is Level ${level}, not Level 3`);
    }
  } catch (e) {
    results.failed.push(`Custodian level check failed: ${e.message}`);
  }
  
  // Test 4: Actual Mint Test (MOST IMPORTANT)
  try {
    // This would need platform wallet private key
    // Include in production validation
    results.warnings.push('Full mint test requires platform wallet key');
  } catch (e) {
    results.failed.push(`Mint test failed: ${e.message}`);
  }
  
  // Report Results
  console.log('✅ PASSED:', results.passed.length);
  results.passed.forEach(p => console.log('  -', p));
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:', results.warnings.length);
    results.warnings.forEach(w => console.log('  -', w));
  }
  
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED:', results.failed.length);
    results.failed.forEach(f => console.log('  -', f));
    console.log('\n🚨 DEPLOYMENT INVALID - DO NOT USE!');
    process.exit(1);
  } else {
    console.log('\n✅ Deployment validation PASSED!');
  }
}

validateDeployment().catch(console.error);
```

---

## 🚨 RED FLAGS - Stop Deployment If:

1. **Any role check returns false**
2. **Basic functions (name, symbol) return empty/wrong values**
3. **Transactions succeed but state doesn't change**
4. **"Has permission" but operation fails**
5. **Can reach state 4 but not state 5**
6. **Contracts exist but initialization wasn't called**
7. **Admin role not properly configured**

---

## 📝 Post-Deployment Documentation

### Required Documentation
```markdown
## Deployment Record - [DATE]

### Contracts Deployed
- V6 Address: 0x...
- TRUSD Address: 0x...
- Network: Arbitrum Sepolia
- Block Number: ...

### Configuration Applied
- [ ] V6 initialized
- [ ] TRUSD initialized  
- [ ] Platform wallet has PLATFORM_OPERATOR_ROLE
- [ ] V6 has MINTER_ROLE on TRUSD
- [ ] V6 has BURNER_ROLE on TRUSD

### Validation Results
- [ ] All basic checks passed
- [ ] All permission checks passed
- [ ] Full flow test completed
- [ ] No warnings or errors

### Test Transfer
- Transfer ID: ...
- Final State: 8 (Completed)
- Tokens Minted: ... TRUSD
- Tokens Burned: ... TRUSD
```

---

## 🔄 Recovery Plan If Validation Fails

### If Partially Deployed:
1. **DO NOT** update .env.local yet
2. **DO NOT** announce deployment complete
3. **IDENTIFY** what's missing/broken
4. **DECIDE**: Fix existing OR deploy fresh
5. **IF FIXING**: Run missing initialization/configuration
6. **IF FRESH**: Deploy new contracts with full process
7. **VALIDATE** again before using

### If Already in Use:
1. **STOP** new transfers immediately
2. **ASSESS** existing transfers in progress
3. **DEPLOY** new correct contracts
4. **MIGRATE** settings to new contracts
5. **TEST** thoroughly with new contracts
6. **UPDATE** .env.local to new addresses
7. **RESUME** operations with new contracts

---

## ⭐ Golden Rules

1. **Never trust "it should work"** - Always verify it DOES work
2. **Test the operation, not just the permission**
3. **Automate validation** - Humans miss things
4. **Document everything** - Future you will thank you
5. **Full flow or no go** - Partial testing = partial failure

---

## 🎯 Success Criteria

Deployment is ONLY complete when:
- ✅ All contracts deployed with bytecode
- ✅ All initialization functions called
- ✅ All roles and permissions granted
- ✅ Basic view functions return correct values
- ✅ Permission checks return true
- ✅ Actual operations execute without reverting
- ✅ Full end-to-end transfer completes (state 0 → 8)
- ✅ Validation script passes with zero failures
- ✅ Documentation completed and stored

Remember: **A partial deployment is worse than no deployment!**