# Immutable Blockchain Audit Trail System

## Overview

This document describes the immutable audit trail system implemented for TrustRails blockchain transactions. The system ensures that all wallet addresses and transaction metadata are cryptographically recorded on-chain for 3rd party verification, while maintaining platform control over gas optimization and execution.

## Architecture

### Platform Proxy Model
- **Platform wallet** executes all blockchain transactions (both BYOW and platform-managed custodians)
- **Custodian wallet addresses** are embedded in contract parameters for immutable audit trails
- **BYOW user actions** are routed through platform API to maintain consistency

### Audit Data Storage

#### On-Chain (Immutable)
Contract parameters contain audit information:
- `participantId`: Encoded wallet addresses
- `documentHash`: Keccak256 hash of complete audit data
- `senderRefId`: Reference ID for audit lookup

#### Off-Chain (Queryable)
- `blockchain-audit` collection: Maps audit hashes to detailed data
- Event system: Records transaction metadata and user actions

## Implementation Details

### 1. Audit Hash Generation

```typescript
const auditData = {
  platformWallet: wallet.address,
  sourceCustodianWallet: sourceWallet?.address,
  destinationCustodianWallet: destWallet?.address,
  rolloverId: rolloverId,
  byowInitiated: body.byowInitiated || false,
  timestamp: Date.now()
};
const auditHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(auditData)));
```

### 2. Contract Parameter Mapping

#### prepareSend Parameters
```typescript
{
  transferId: rolloverId,
  receiver: wallet.address, // Platform wallet
  participantId: `${sourceWallet?.address}-${destWallet?.address}`.substring(0, 32),
  grossAmount: BigInt(amount),
  federalTax: BigInt(federalTax),
  stateTax: BigInt(stateTax),
  fromAccount: 0, // AccountType enum
  toAccount: 0,
  senderRefId: `audit-${rolloverId.substring(0, 20)}`,
  documentHash: auditHash // IMMUTABLE AUDIT HASH
}
```

#### prepareReceive Parameters
```typescript
{
  transferId: rolloverId,
  sender: wallet.address, // Platform wallet
  receiverRefId: auditHash // IMMUTABLE AUDIT HASH
}
```

### 3. Database Storage

#### blockchain-audit Collection
```typescript
{
  [auditHash]: {
    platformWallet: "0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457",
    sourceCustodianWallet: "0x15a944248B73b56487a8f6ccF126258f12075a01",
    destinationCustodianWallet: "0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457",
    rolloverId: "EVENT-DRIVEN-1749774927549",
    byowInitiated: true,
    timestamp: 1749774927549,
    createdAt: Date,
    contractCall: "prepareSend",
    action: "prepare_send"
  }
}
```

#### Event System Records
```typescript
{
  eventType: "blockchain.sender_ready",
  data: {
    transactionHash: "0x...",
    auditTrail: {
      executingWallet: "0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457",
      sourceCustodianWallet: "0x15a944248B73b56487a8f6ccF126258f12075a01",
      destinationCustodianWallet: "0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457",
      byowInitiated: true,
      walletTypes: {
        source: "byow",
        destination: "platform"
      },
      byowUserWallet: {
        address: "0x15a944248B73b56487a8f6ccF126258f12075a01",
        walletType: "metamask",
        chainId: "11155111"
      }
    }
  }
}
```

## 3rd Party Verification Process

### Step 1: Extract On-Chain Data
1. Find transaction on blockchain explorer (Etherscan)
2. Decode transaction input data
3. Extract `documentHash` from contract call parameters

### Step 2: Verify Audit Hash
```bash
# Get audit data from API
curl https://api.trustrails.com/blockchain-audit/{documentHash}

# Verify hash matches
echo '{"platformWallet":"0x...","sourceCustodianWallet":"0x..."}' | \
  keccak256 | \
  compare_with_on_chain_hash
```

### Step 3: Cross-Reference Data
- Verify wallet addresses match custodian registrations
- Confirm transaction amounts and timing
- Validate rollover ID and business logic

## API Endpoints for 3rd Party Access

### GET /api/blockchain-audit/{auditHash}
Returns complete audit data for hash verification.

**Response:**
```json
{
  "platformWallet": "0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457",
  "sourceCustodianWallet": "0x15a944248B73b56487a8f6ccF126258f12075a01",
  "destinationCustodianWallet": "0xf3BEa4888159A06fbD0B1C6Bd6704D9ada990457",
  "rolloverId": "EVENT-DRIVEN-1749774927549",
  "byowInitiated": true,
  "timestamp": 1749774927549,
  "createdAt": "2024-12-06T...",
  "contractCall": "prepareSend",
  "action": "prepare_send"
}
```

### GET /api/blockchain-audit/verify/{auditHash}
Verifies hash integrity and returns validation status.

## Contract V4 Migration Requirements

### Required Contract Parameters

#### For prepareSend
- `documentHash`: Must support 32-byte hash storage
- `participantId`: Should support encoded wallet addresses (or separate audit parameters)
- `senderRefId`: Reference ID for audit lookup

#### For prepareReceive  
- `receiverRefId`: Must support audit hash reference
- `sender`: Should support platform wallet proxy model

#### New Audit-Specific Parameters (Recommended for V4)
```solidity
struct AuditTrail {
    address platformWallet;      // Executing wallet
    address sourceCustodian;     // Source custodian wallet
    address destinationCustodian; // Destination custodian wallet
    bytes32 auditHash;          // Hash of complete audit data
    bool byowInitiated;         // BYOW flag
    uint256 timestamp;          // Execution timestamp
}
```

### Enhanced V4 Functions
```solidity
function prepareSendWithAudit(
    bytes32 transferId,
    address receiver,
    uint256 grossAmount,
    uint256 federalTax,
    uint256 stateTax,
    AccountType fromAccount,
    AccountType toAccount,
    AuditTrail calldata auditTrail
) external;

function prepareReceiveWithAudit(
    bytes32 transferId,
    address sender,
    bytes32 receiverRefId,
    AuditTrail calldata auditTrail
) external;
```

## Security Considerations

### Hash Integrity
- Use keccak256 for consistency with Ethereum
- Include timestamp to prevent replay attacks
- Store complete audit data off-chain for verification

### Platform Wallet Security
- Platform wallet must be secured with multi-sig or hardware security
- Private key access should be limited and audited
- Consider key rotation strategies

### BYOW User Privacy
- User wallet addresses are recorded for audit but not exposed publicly
- Consider hashing user wallet addresses for additional privacy
- Provide clear privacy policy regarding on-chain data storage

## Benefits

### For TrustRails
- **Full gas control**: Platform wallet manages all transactions
- **Consistent state**: No authorization conflicts between wallet types  
- **Value-added services**: Can offer gas optimization, batching, etc.
- **Audit compliance**: Immutable trails for regulatory requirements

### For Custodians
- **BYOW flexibility**: Users can still use preferred wallets (MetaMask, etc.)
- **Platform reliability**: Consistent transaction execution regardless of wallet type
- **Audit transparency**: All actions are cryptographically verifiable

### For Regulators/3rd Parties
- **Immutable records**: Cannot be altered after blockchain confirmation
- **Independent verification**: Can verify without trusting TrustRails infrastructure
- **Complete audit trail**: Full transaction history and wallet mappings
- **Cryptographic proof**: Hash-based verification of data integrity

## Implementation Checklist for V4

### Contract Design
- [ ] Add AuditTrail struct to contract
- [ ] Implement prepareSendWithAudit function
- [ ] Implement prepareReceiveWithAudit function
- [ ] Add events for audit trail logging
- [ ] Test with platform proxy model

### Backend Implementation  
- [ ] Update SDK to support new audit parameters
- [ ] Modify API to generate audit hashes
- [ ] Create blockchain-audit collection
- [ ] Implement 3rd party verification endpoints
- [ ] Add audit hash validation

### Frontend Updates
- [ ] Update BYOW components to pass audit data
- [ ] Add audit trail viewing in admin interface
- [ ] Create 3rd party verification tools
- [ ] Update documentation and user guides

### Testing & Validation
- [ ] Test with both BYOW and platform wallets
- [ ] Verify audit hash generation and validation
- [ ] Test 3rd party verification process
- [ ] Security audit of platform wallet implementation
- [ ] Load testing with multiple concurrent transactions

---

**Last Updated:** December 6, 2024  
**Contract Version:** V3 (targeting V4)  
**Implementation Status:** Active in V3 with limited parameters