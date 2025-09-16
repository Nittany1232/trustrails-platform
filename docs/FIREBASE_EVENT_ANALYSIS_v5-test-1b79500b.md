# Firebase Event Analysis for Transfer v5-test-1b79500b-dc92-4e11-bc41-f9a789161530

## Summary
Found **12 events** for this transfer with the following custodian field patterns:

## Transfer Setup (from rollover.started event)
- **Source Custodian**: `demo-custodian` 
- **Destination Custodian**: `metamask-test-custodian`
- **Sender Ref ID**: Not set in rollover.started event

## Key Findings

### 1. Custodian Field Location
- **Event-level custodian fields**: All events show `sourceCustodianId`, `destinationCustodianId`, and `senderRefId` as `N/A` 
- **Data-level custodian fields**: Only the `rollover.started` event has custodian info in `data.sourceCustodianId` and `data.destinationCustodianId`
- **Individual event custodianId**: Each event has a `custodianId` field indicating which custodian authored/triggered the event

### 2. Event Flow Analysis
The events show this progression:

1. **rollover.started** (custodian: `demo-custodian`)
   - Sets up transfer: `demo-custodian` → `metamask-test-custodian`

2. **Agreement Events**:
   - `blockchain.v5.agreement` (custodian: `demo-custodian`) - Source custodian agrees
   - `blockchain.v5.agreement` (custodian: `metamask-test-custodian`) - Destination custodian agrees
     - Note: This event has `data.senderRefId: demo-custodian` 

3. **Financial Events**:
   - Multiple `blockchain.v5.financial.failed` events (all custodian: `demo-custodian`)
   - No successful `blockchain.v5.financial` events

### 3. Listener Trigger Analysis

Based on the custodian field patterns found:

#### Current Event Structure:
- Events do **NOT** have `sourceCustodianId`, `destinationCustodianId`, or `senderRefId` at the event level
- Only the `rollover.started` event contains custodian setup info in `data` field
- Individual events only have `custodianId` (the authoring custodian)

#### Blockchain Events Triggering:
- `blockchain.v5.agreement` (custodian: `demo-custodian`) → Should trigger `metamask-test-custodian` listeners
- `blockchain.v5.agreement` (custodian: `metamask-test-custodian`) → Should trigger `demo-custodian` listeners  
- `blockchain.v5.financial.failed` (custodian: `demo-custodian`) → Should trigger `metamask-test-custodian` listeners

### 4. Issues Found

#### Missing Custodian Fields on Blockchain Events:
The blockchain events lack the proper custodian fields that would allow the opposite custodian's listeners to trigger:

- **❌ No `sourceCustodianId`** on blockchain events
- **❌ No `destinationCustodianId`** on blockchain events  
- **❌ No `senderRefId`** on blockchain events (except partial data in one agreement event)

#### Impact:
This means when `demo-custodian` creates a `blockchain.v5.agreement` event, the `metamask-test-custodian`'s listeners won't be able to determine:
1. That this event is relevant to them
2. What the source/destination custodian relationship is
3. How to filter events for their specific transfers

### 5. Current State Issue
- Contract state: **4 (FinancialsProvided)** - Ready for execution
- Database events: Multiple failed financial attempts, but no successful financial event
- This explains why execute_transfer is failing - the database state doesn't match the contract state

## Recommendations

### 1. Fix Blockchain Event Creation
Ensure that when blockchain events are created, they include:
```javascript
{
  eventType: 'blockchain.v5.agreement',
  custodianId: 'authoring-custodian-id',
  sourceCustodianId: 'demo-custodian',        // ← ADD THIS
  destinationCustodianId: 'metamask-test-custodian', // ← ADD THIS  
  senderRefId: 'sender-reference-id',         // ← ADD THIS
  rolloverId: 'v5-test-1b79500b-dc92-4e11-bc41-f9a789161530'
}
```

### 2. Update Event Listeners
Event listeners should be updated to:
- Look for events where they are the `destinationCustodianId` (for events authored by source)
- Look for events where they are the `sourceCustodianId` (for events authored by destination)  
- Use these fields to filter relevant transfer events

### 3. Retry Financial Transaction
Since the contract shows FinancialsProvided but database has failed attempts:
- Clean up the failed blockchain.v5.financial.failed events
- Retry the financial transaction to get the contract and database back in sync

## Files to Investigate

1. **Event Creation**: Look for where blockchain events are created and ensure custodian fields are populated
2. **Event Listeners**: Check listener logic to see if they're looking for the right custodian fields
3. **Financial Transaction Logic**: Investigate why financial transactions are failing despite contract being in the right state

## Tools Used
- `scripts/root-scripts/debug-events.js` - Firebase event inspection
- `scripts/root-scripts/debug-v5-transfer-state.js` - Blockchain contract state verification