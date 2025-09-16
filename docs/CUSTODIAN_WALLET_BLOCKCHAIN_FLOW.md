# Custodian Wallet & Blockchain Integration Flow

## Complete Architecture Overview

### 🎯 The Full Flow: Admin Activates Custodian → Blockchain Ready

```mermaid
graph TD
    A[Admin Dashboard] --> B[Custodian Management]
    B --> C{Action Type}
    
    C -->|Activate| D[Status Toggle]
    C -->|Generate Wallet| E[Wallet Generation]
    C -->|Set Level| F[Product Plan]
    
    D --> G[/api/admin/custodian/status]
    E --> H[/api/admin/custodian/{id}/wallet]
    F --> I[/api/admin/custodian/{id}/level]
    
    H --> J[CustodianWalletService]
    J --> K[Generate Wallet]
    J --> L[Store in Secret Manager]
    
    H --> M[BlockchainRoleService]
    M --> N[Set Level on Contract]
    M --> O[Whitelist on Blockchain]
    
    G --> P[Update Database]
    I --> P
    
    P --> Q[Custodian Ready]
    Q --> R[Can Create Transfers]
```

## UI Elements in Admin Dashboard

### 1. **CustodianStatusManager Component** (`/components/custodian/CustodianStatusManager.tsx`)

Located in: **Admin Dashboard → Custodians Tab → Admin Controls Section**

#### Available Actions:

**System Access Controls:**
- ✅ **Active Toggle** - Activates/deactivates custodian
- ✅ **Verified Toggle** - Marks as KYB verified

**Wallet Configuration:**
- ✅ **Generate Wallet Button** - Creates new platform wallet
- ✅ **Verify BYOW Button** - For bring-your-own-wallet custodians
- ✅ **Wallet Address Display** - Shows current wallet if exists

**Product Plan Management:**
- ✅ **Standard Plan Button** - Sets Level 1 (traditional settlement)
- ✅ **Digital Plan Button** - Sets Level 2 (TRUSD tokenization)

**Blockchain Operations:**
- ✅ **Verify Roles Button** - Checks blockchain permissions
- ✅ **Sync Roles Button** - Auto-fixes mismatched roles

### 2. **WhitelistManager Component** (`/components/admin/WhitelistManager.tsx`)

Located in: **Admin Dashboard → Custodians → Manage Page**

#### Features:
- View all whitelisted custodians
- Add/remove from whitelist
- Batch operations
- Real-time blockchain status

## API Endpoints & Their Functions

### Core Custodian Management

#### 1. **Approve Custodian** - MOST IMPORTANT
**Endpoint:** `POST /api/admin/custodian/approve`
**What it does:**
1. Generates wallet automatically
2. Stores private key in Secret Manager
3. Auto-detects appropriate level (Standard/Digital)
4. Sets level on blockchain contract
5. Updates database
6. Creates audit logs

**This single endpoint handles EVERYTHING when you first approve a custodian!**

#### 2. **Generate Wallet** 
**Endpoint:** `POST /api/admin/custodian/[custodianId]/wallet`
**Body:** `{ action: "generate" }`
**What it does:**
1. Creates new wallet
2. Stores in Secret Manager
3. Whitelists on blockchain
4. Updates custodian record

#### 3. **Set Product Plan/Level**
**Endpoint:** `POST /api/admin/custodian/[custodianId]/level`
**Body:** `{ level: 1 or 2 }`
**What it does:**
1. Updates database level
2. Updates blockchain contract
3. Manages whitelist accordingly

### Blockchain-Specific Operations

#### 4. **Verify Blockchain Roles**
**Endpoint:** `GET /api/admin/blockchain/verify-roles`
**What it does:**
- Checks all custodians' blockchain permissions
- Identifies mismatches
- Can auto-sync to fix issues

#### 5. **Whitelist Management**
**Endpoint:** `POST /api/admin/blockchain/whitelist-custodian`
**Body:** `{ custodianAddress: "0x...", level: 0/1/2 }`
**What it does:**
- Sets custodian level on smart contract
- Level 0 = Remove from whitelist
- Level 1 = Standard plan
- Level 2 = Digital plan

## How Everything Connects

### Scenario 1: New Custodian Onboarding

1. **Admin clicks "Approve" in dashboard**
   - Calls `/api/admin/custodian/approve`
   - Automatically:
     - ✅ Generates wallet
     - ✅ Stores private key securely
     - ✅ Sets blockchain level
     - ✅ Whitelists on contract
     - ✅ Updates database

2. **Result:** Custodian is fully ready for blockchain operations

### Scenario 2: Upgrade Custodian to Digital Plan

1. **Admin clicks "Digital Plan" button in CustodianStatusManager**
   - Calls `/api/admin/custodian/[id]/level` with level: 2
   
2. **Behind the scenes:**
   - Database updated to level 2
   - Blockchain contract updated via platform wallet
   - Whitelist automatically managed
   
3. **Result:** Custodian can now use TRUSD tokenization

### Scenario 3: Manual Wallet Generation

1. **Admin clicks "Generate Wallet" in Admin Controls**
   - Calls `/api/admin/custodian/[id]/wallet`
   
2. **Process:**
   - New wallet created
   - Private key stored in Secret Manager
   - Blockchain whitelisting attempted
   - UI updates with wallet address

## Backend Services Architecture

### CustodianWalletService
**Location:** `/lib/wallet/custodian-wallet-service.ts`
- Generates cryptographically secure wallets
- Stores private keys in Google Secret Manager
- Retrieves wallets for blockchain operations

### BlockchainRoleService  
**Location:** `/lib/services/blockchain-role-service.ts`
- Uses platform wallet for all operations
- Sets custodian levels on contract
- Manages whitelisting
- No gas fees for custodians

### CustodianLevelService
**Location:** `/lib/services/custodian-level-service.ts`
- Manages database levels
- Coordinates with blockchain service
- Handles whitelist synchronization

## Security & Permissions

### Platform Wallet
- **Address:** `0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457`
- **Role:** PLATFORM_PROXY_ROLE on V6 contract
- **Purpose:** Executes all blockchain operations
- **Gas:** Platform pays all fees

### Secret Storage
- **Private Keys:** Google Secret Manager
- **Format:** `custodian-wallet-{custodianId}`
- **Access:** Service account only

### Admin Requirements
- Must be authenticated admin user
- All actions logged for SOC 2 compliance
- Blockchain transactions tracked

## Quick Reference: What Button Does What

| UI Element | API Called | Result |
|------------|------------|--------|
| Approve Button | `/api/admin/custodian/approve` | Full setup: wallet + blockchain |
| Generate Wallet | `/api/admin/custodian/[id]/wallet` | Create wallet + whitelist |
| Standard Plan | `/api/admin/custodian/[id]/level` | Set level 1 + update blockchain |
| Digital Plan | `/api/admin/custodian/[id]/level` | Set level 2 + update blockchain |
| Verify Roles | `/api/admin/blockchain/verify-roles` | Check blockchain permissions |
| Active Toggle | `/api/admin/custodian/status` | Enable/disable custodian |

## Testing the Complete Flow

```bash
# 1. Check platform wallet is ready
node scripts/setup-platform-wallet.js

# 2. Start dev server
npm run dev

# 3. Navigate to Admin Dashboard
# Go to: http://localhost:3000/admin/custodians

# 4. Find a custodian and:
#    - Click "Approve" to do everything automatically
#    OR
#    - Use individual controls for manual management

# 5. Verify on blockchain:
#    - Check WhitelistManager component
#    - Use Verify Roles button
#    - View transaction hashes in responses
```

## Common Issues & Solutions

### "Platform wallet not configured"
**Solution:** Run `node scripts/setup-platform-wallet.js`

### "Insufficient ETH balance"
**Solution:** Fund platform wallet on Arbitrum Sepolia

### "Wallet generation failed"
**Check:**
- Secret Manager credentials
- Service account permissions
- Network connectivity

### "Blockchain whitelisting failed"
**Check:**
- Platform wallet has PLATFORM_PROXY_ROLE
- Arbitrum Sepolia RPC is accessible
- Contract address is correct

## Summary

The system is **fully integrated** with these key points:

1. ✅ **Approval = Everything** - One button does wallet + blockchain
2. ✅ **No manual wallet management** - Platform wallet handles all
3. ✅ **Automatic whitelisting** - Level changes update blockchain
4. ✅ **Complete UI integration** - All functions available in dashboard
5. ✅ **Full audit trail** - Every action logged for compliance