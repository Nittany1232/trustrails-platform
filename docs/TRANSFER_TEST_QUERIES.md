# Transfer Data Verification Queries
## Rollover ID: v5-test-3090a65a-a534-4a86-aff9-f3ff403321d9

Copy and paste these queries into the Firebase Data Connect VS Code extension to test your transfer data:

## 1️⃣ MAIN TRANSFER QUERY (Copy this first!)

```graphql
query GetTransferByRolloverId {
  transfers(where: { rolloverId: { eq: "v5-test-3090a65a-a534-4a86-aff9-f3ff403321d9" } }) {
    id
    transferNumber
    rolloverId
    status
    currentStage
    grossAmount
    netAmount
    currency
    taxYear
    transferType
    settlementMethod
    blockchainTransactionHash
    contractState
    sourceCustodianId
    destinationCustodianId
    initiatedAt
    completedAt
    federalTaxWithheld
    stateTaxWithheld
    totalProcessingFees
    totalBlockchainFees
    totalCustodianFees
    hasMixedContributions
    requiresSplitDestination
    amlStatus
    riskScore
    
    # Get source custodian details
    sourceCustodian {
      id
      name
      type
      level
      settlementType
    }
    
    # Get destination custodian details
    destinationCustodian {
      id
      name
      type
      level
      settlementType
    }
    
    # Get related accounts
    accounts: accounts_on_transfer {
      id
      accountRole
      accountNumber
      accountType
      registrationType
      custodianId
      ownerName
      custodian {
        name
        type
      }
    }
    
    # Get financial breakdowns
    financialBreakdowns: financialBreakdowns_on_transfer {
      id
      breakdownType
      employeePreTaxAmount
      employerMatchAmount
      rothAmount
      afterTaxAmount
      grossAmount
      taxYear
      isVerified
      verifiedAt
      accountId
    }
  }
}
```

## 2️⃣ BLOCKCHAIN TRANSACTIONS QUERY

```graphql
query GetBlockchainTransactions {
  blockchainTransactions(where: { rolloverId: { eq: "v5-test-3090a65a-a534-4a86-aff9-f3ff403321d9" } }) {
    id
    transactionHash
    rolloverId
    contractAddress
    fromAddress
    toAddress
    value
    gasUsed
    gasPrice
    contractState
    eventType
    employeePreTaxAmountWei
    employerMatchAmountWei
    rothAmountWei
    afterTaxAmountWei
    grossAmountWei
    status
    blockNumber
    confirmations
    createdAt
    confirmedAt
  }
}
```

## 3️⃣ TOKEN OPERATIONS QUERY (Level 3 only)

```graphql
query GetTokenOperations {
  tokenOperations(where: { rolloverId: { eq: "v5-test-3090a65a-a534-4a86-aff9-f3ff403321d9" } }) {
    id
    rolloverId
    operationType
    tokenAddress
    amount
    recipient
    tokenizedPreTaxAmount
    tokenizedRothAmount
    tokenizedEmployerMatchAmount
    transactionHash
    blockNumber
    gasUsed
    status
    createdAt
    confirmedAt
  }
}
```

## 4️⃣ EVENTS QUERY

```graphql
query GetTransferEvents {
  events(where: { rolloverId: { eq: "v5-test-3090a65a-a534-4a86-aff9-f3ff403321d9" } }, limit: 50) {
    id
    eventId
    eventType
    rolloverId
    timestamp
    source
    eventData
    blockchainTxHash
    blockNumber
    gasUsed
    userId
    custodianId
  }
}
```

## 5️⃣ DUPLICATE CHECK QUERY

```graphql
query CheckDuplicateTransfers {
  transfers(where: { rolloverId: { eq: "v5-test-3090a65a-a534-4a86-aff9-f3ff403321d9" } }) {
    id
    transferNumber
    createdAt
  }
}
```

## 6️⃣ DASHBOARD SUMMARY QUERY

```graphql
query GetTransferDashboard {
  transfers(where: { rolloverId: { eq: "v5-test-3090a65a-a534-4a86-aff9-f3ff403321d9" } }) {
    id
    transferNumber
    rolloverId
    grossAmount
    netAmount
    status
    currentStage
    initiatedAt
    completedAt
    hasMixedContributions
    
    # Source info
    sourceCustodian {
      name
      type
    }
    
    # Destination info  
    destinationCustodian {
      name
      type
    }
    
    # Financial summary
    financialBreakdowns: financialBreakdowns_on_transfer {
      breakdownType
      employeePreTaxAmount
      employerMatchAmount
      rothAmount
      afterTaxAmount
      grossAmount
    }
  }
}
```

---

## 🔍 What to Check For:

### ✅ Expected Results:
- **Transfer table**: Exactly 1 record (no duplicates)
- **Accounts**: 2 records (source & destination)
- **Financial Breakdown**: Amounts should match what you entered in UI
- **Blockchain Transactions**: Should exist if Level 2/3 custodian
- **Token Operations**: Only if Level 3 custodian with TRUSD tokens
- **Events**: Multiple events showing the transfer timeline

### 🚨 Red Flags:
- Multiple transfer records = duplicates
- Zero transfer records = ETL didn't process
- Missing financial data = ETL failed
- Amounts don't match UI input = conversion errors

### 💰 Amount Conversion:
All amounts are stored in **cents**. So:
- $1,000.00 in UI = 100000 in database
- $50,000.00 in UI = 5000000 in database

---

## 📝 How to Use:

1. Open **Firebase Data Connect** in VS Code
2. Copy query #1 (main transfer query) 
3. Paste into query editor
4. Click **"Run"**
5. Verify the results match your UI input
6. Repeat for other queries as needed

This is exactly how your UI will fetch data from Data Connect!