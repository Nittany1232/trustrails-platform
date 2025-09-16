# Gas Payment Options for TrustRails

## Current Model: Custodians Pay
Each custodian pays for their own gas fees from their wallet.

**Pros:**
- Simple implementation
- Clear cost attribution
- No platform liability

**Cons:**
- Custodians need ETH in their wallets
- Barrier to adoption
- Manual top-ups required

## Option 1: Platform Pays (Recommended)

### Implementation: Relayer Pattern
```typescript
// Platform has a "relayer" wallet that pays for all transactions
const relayerService = new GaslessWalletService();
await relayerService.executeGaslessTransaction(
  custodianId,
  contractAddress,
  abi,
  'mintTokens',
  [amount, recipient]
);
```

**Pros:**
- Better user experience
- No ETH needed in custodian wallets
- Platform controls costs

**Cons:**
- Platform pays all gas costs
- Need to monitor relayer balance
- Potential for abuse

### Setup:
1. Create a platform relayer wallet
2. Fund it with ETH
3. Store private key in Secret Manager
4. Use `walletService-gasless.ts`

## Option 2: Hybrid Model

Platform pays for certain operations:
- ✅ Onboarding (first transaction)
- ✅ High-value transfers
- ❌ Regular operations (custodian pays)

## Option 3: OpenZeppelin Defender

Professional meta-transaction service:
- Automated relayer management
- Built-in monitoring
- Rate limiting
- Webhook integration

### Benefits:
- Enterprise-grade security
- Automatic gas price optimization
- No private key management
- Detailed analytics

### Setup:
```bash
# Install Defender SDK
npm install @openzeppelin/defender-relay-client

# Configure in code
const { Relayer } = require('@openzeppelin/defender-relay-client');
const relayer = new Relayer({apiKey, apiSecret});
```

## Option 4: Account Abstraction (ERC-4337)

Future-proof solution using smart contract wallets:
- Custodians don't need ETH
- Flexible payment options
- Better security

**Status**: Still emerging, consider for v2

## Cost Estimates

### Per Transaction:
- Simple transfer: 0.002-0.01 ETH ($5-25)
- Complex operation: 0.01-0.05 ETH ($25-125)

### Monthly (100 custodians, 10 tx each):
- Low activity: 2-10 ETH ($5,000-25,000)
- High activity: 10-50 ETH ($25,000-125,000)

## Recommended Approach

1. **Start with**: Custodians pay (current model)
2. **Pilot program**: Platform pays for select partners
3. **Scale with**: OpenZeppelin Defender
4. **Future**: Account abstraction

## Implementation Checklist

- [ ] Decide on gas payment model
- [ ] Create relayer wallet if needed
- [ ] Fund relayer with ETH
- [ ] Implement monitoring/alerts
- [ ] Set transaction limits
- [ ] Document cost model for custodians