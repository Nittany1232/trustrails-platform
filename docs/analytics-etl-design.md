# AnalyticsTimeSeries ETL Design

## Strategy: Hybrid Approach

### 1. EVENT-DRIVEN Updates (Real-time)
**Trigger**: `rollover.completed` events
**Action**: Update current day metrics immediately

```javascript
// Cloud Function: analyticsETLTrigger
exports.analyticsETLTrigger = functions.firestore
  .document('events/{eventId}')
  .onCreate(async (snap, context) => {
    const event = snap.data();
    
    if (event.eventType === 'rollover.completed') {
      // 1. Reconstruct rollover state (like transfer ETL)
      // 2. Query SQL for existing transfer data  
      // 3. Update analytics for current day
      // 4. Upsert AnalyticsTimeSeries record
    }
  });
```

### 2. BATCH Updates (Historical/Backfill)
**Trigger**: Manual or scheduled
**Action**: Aggregate historical data by querying SQL Transfer table

```javascript
// Cloud Function: manualAnalyticsETL  
exports.manualAnalyticsETL = functions.https.onRequest(async (req, res) => {
  const { custodianId, startDate, endDate, granularity } = req.body;
  
  // 1. Query SQL Transfer table for date range
  // 2. Query SQL FinancialBreakdown for contribution types
  // 3. Query SQL Account for account type distribution
  // 4. Aggregate by custodian + time period
  // 5. Upsert AnalyticsTimeSeries records
});
```

## Data Sources and Extraction

### Primary: SQL Tables (Most Reliable)
```sql
-- Transfer aggregation query
SELECT 
  sourceCustodianId,
  destinationCustodianId,
  DATE(completedAt) as period,
  COUNT(*) as transferCount,
  SUM(grossAmount) as totalVolume,
  status,
  transferType,
  hasMixedContributions,
  EXTRACT(EPOCH FROM (completedAt - initiatedAt))/3600 as completionHours
FROM transfer
WHERE completedAt BETWEEN $startDate AND $endDate
GROUP BY sourceCustodianId, destinationCustodianId, DATE(completedAt), status, transferType, hasMixedContributions
```

### Secondary: Event Reconstruction (For Token Operations)
```javascript
// Extract token operations from blockchain events
const tokenEvents = events.filter(e => 
  e.eventType.includes('minted') || e.eventType.includes('burned')
);

tokenEvents.forEach(event => {
  if (event.eventType.includes('minted')) {
    analytics.mintedTokens += parseInt(event.data.amount || '0');
  }
  if (event.eventType.includes('burned')) {
    analytics.burnedTokens += parseInt(event.data.amount || '0');
  }
  analytics.totalGasUsed += parseInt(event.data.gasUsed || '0');
});
```

## Key Calculations

### Inbound vs Outbound Logic
```javascript
// For each custodian, determine if transfer is inbound or outbound
function categorizeTransfer(transfer, custodianId) {
  if (transfer.destinationCustodianId === custodianId) {
    return 'inbound';  // Money coming TO this custodian
  }
  if (transfer.sourceCustodianId === custodianId) {
    return 'outbound'; // Money leaving FROM this custodian  
  }
  return null; // Not relevant to this custodian
}
```

### Time Period Aggregation
```javascript
function formatPeriod(date, granularity) {
  const d = new Date(date);
  
  switch (granularity) {
    case 'daily':
      return d.toISOString().split('T')[0]; // YYYY-MM-DD
    case 'weekly':
      const week = getWeekNumber(d);
      return `${d.getFullYear()}-W${week.toString().padStart(2, '0')}`;
    case 'monthly':
      return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}
```

## Error Prevention Strategies

### 1. Amount Conversion Consistency
```javascript
// LESSON LEARNED: Be explicit about units
function ensureCents(amount) {
  // All amounts should be stored as cents in SQL
  // Events may contain cent amounts as strings
  return parseInt(amount || '0');
}
```

### 2. Comprehensive Logging
```javascript
logger.log('📊 Analytics aggregation details', {
  custodianId,
  period,
  granularity,
  transfersProcessed: transfers.length,
  totalVolume: aggregatedData.totalVolume,
  inboundCount: aggregatedData.inboundCount,
  outboundCount: aggregatedData.outboundCount,
  statusDistribution: aggregatedData.statusCounts
});
```

### 3. Data Validation
```javascript
// Validate aggregated data before inserting
function validateAnalyticsData(data) {
  const errors = [];
  
  if (data.totalVolume < 0) {
    errors.push('Total volume cannot be negative');
  }
  
  if (data.inboundCount + data.outboundCount !== data.totalCount) {
    errors.push('Count mismatch: inbound + outbound ≠ total');
  }
  
  if (data.successRate > 100 || data.successRate < 0) {
    errors.push('Success rate must be between 0-100');
  }
  
  return errors;
}
```

## Testing Strategy

### 1. Test with Known Data
```javascript
// Use the corrected transfer data we know exists
const testTransferId = '1ccea0f7cd7c4ec8b361aca36b88a851'; // $6,665.00 transfer
const expectedAnalytics = {
  totalVolume: 666500, // cents
  totalCount: 1,
  completedCount: 1,
  totalPreTaxVolume: 564500, // $5,645.00
  totalRothVolume: 45600,     // $456.00
  totalAfterTaxVolume: 56400  // $564.00
};
```

### 2. Check Cloud Function Logs
```bash
firebase functions:log --only analyticsETLTrigger --lines 20
```

### 3. Verify SQL Results
```javascript
// Query analytics table to verify data was inserted correctly
const verifyQuery = `query GetAnalytics($custodianId: String!, $period: String!) {
  analyticsTimeSeries(where: { 
    custodianId: { eq: $custodianId },
    period: { eq: $period }
  }) {
    totalVolume
    totalCount
    completedCount
    totalPreTaxVolume
    totalRothVolume
  }
}`;
```

## Implementation Priority

1. **Phase 1**: Manual batch ETL for historical backfill
2. **Phase 2**: Event-driven real-time updates  
3. **Phase 3**: Scheduled daily reconciliation
4. **Phase 4**: Advanced metrics (gas costs, performance trends)