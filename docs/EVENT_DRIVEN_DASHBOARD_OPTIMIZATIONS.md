# Event-Driven Dashboard Performance Optimizations

## Current Performance Issues

### Problem Statement
The TrustRails dashboard lifecycle tracker takes **10-20 seconds** to load even with fewer than 10 active rollovers. Investigation revealed the root cause:

- **SSE stream sends events for ALL transfers** (100+ transfers), not just active ones
- **No database-level filtering** possible due to Firestore limitations
- **Client-side filtering** happens after receiving all data
- **State computation** occurs for every single transfer

### Performance Bottleneck Analysis
```
Current Flow:
1. Dashboard loads
2. SSE connects and receives ALL events (100+ transfers)
3. Client computes state for ALL transfers
4. Client filters to show only active transfers
5. UI renders (10-20 seconds later)
```

## Required Optimizations

### 1. Server-Side Event Filtering (Priority: HIGH)
**Problem**: SSE stream sends events for all transfers, not just active ones

**Solution**: Implement server-side filtering before SSE transmission
```typescript
// app/api/events/rollover-stream/route.ts
// Add active transfer detection server-side
const activeTransferIds = await getActiveTransferIds(custodianId);
const isRelevantEvent = activeTransferIds.includes(event.rolloverId);
if (isRelevantEvent) {
  // Send SSE message
}
```

**Impact**: Reduce SSE payload by ~90% for users with few active transfers

### 2. Database Denormalization (Priority: HIGH)
**Problem**: Cannot query Firestore for computed states (e.g., "active" transfers)

**Solution**: Add denormalized fields to enable direct queries
```typescript
// Add to rollovers collection
{
  computedPhase: 'execution', // denormalized
  isActive: true,             // denormalized
  lastEventType: 'blockchain.v5.agreement',
  lastEventTimestamp: Timestamp.now()
}
```

**Implementation**:
- Update ETL process to maintain computed fields
- Create Firestore composite indexes for efficient queries
- Migrate existing data with batch update script

**Impact**: Enable database-level filtering, reduce initial load from 100+ to <10 transfers

### 3. Event Batching and Throttling (Priority: MEDIUM)
**Problem**: Rapid event updates cause excessive re-renders

**Solution**: Batch and throttle event processing
```typescript
// contexts/EventDrivenRolloverContext.tsx
const eventBatcher = useMemo(() => {
  return new EventBatcher({
    maxBatchSize: 10,
    flushInterval: 500, // ms
    onFlush: (events) => processEventBatch(events)
  });
}, []);
```

**Impact**: Reduce re-renders by 80%, smoother UI updates

### 4. Progressive Loading (Priority: MEDIUM)
**Problem**: All transfers load at once, blocking UI

**Solution**: Load in stages
```typescript
// Stage 1: Load active transfers (immediate)
const activeTransfers = await loadActiveTransfers();

// Stage 2: Load recent completed (deferred)
setTimeout(() => loadRecentCompleted(), 1000);

// Stage 3: Load historical (on-demand)
const loadHistorical = () => loadAllTransfers();
```

**Impact**: Initial render in <2 seconds, full data loads progressively

### 5. State Computation Caching (Priority: HIGH)
**Problem**: State recomputed for every transfer on every update

**Solution**: Cache computed states with invalidation
```typescript
// lib/events/state-cache.ts
class StateCache {
  private cache = new Map<string, ComputedState>();
  
  getState(rolloverId: string, events: Event[]): ComputedState {
    const cacheKey = `${rolloverId}-${events.length}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    const computed = computeState(events);
    this.cache.set(cacheKey, computed);
    return computed;
  }
}
```

**Impact**: 90% reduction in computation time for unchanged transfers

### 6. Virtual Scrolling (Priority: LOW)
**Problem**: Rendering 100+ transfer cards impacts performance

**Solution**: Implement virtual scrolling for large lists
```typescript
// components/rollover/TransferList.tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={transfers.length}
  itemSize={120}
  width="100%"
>
  {TransferCard}
</FixedSizeList>
```

**Impact**: Render only visible items, constant performance regardless of list size

### 7. SSE Connection Pooling (Priority: LOW)
**Problem**: Multiple SSE connections for different data streams

**Solution**: Multiplex all streams through single connection
```typescript
// lib/sse/connection-pool.ts
class SSEConnectionPool {
  private connection: EventSource;
  
  subscribe(channel: string, handler: Function) {
    // Single connection, multiple channels
  }
}
```

**Impact**: Reduce connection overhead, better resource utilization

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)
1. ✅ Server-side filtering of active transfers
2. ✅ Basic event batching
3. ✅ State computation caching

**Expected Impact**: 50% reduction in load time

### Phase 2: Database Changes (3-5 days)
1. ⏳ Add denormalized fields to Firestore
2. ⏳ Update ETL process
3. ⏳ Create composite indexes
4. ⏳ Migrate existing data

**Expected Impact**: 80% reduction in load time

### Phase 3: UI Optimizations (2-3 days)
1. ⏳ Progressive loading
2. ⏳ Virtual scrolling
3. ⏳ Optimistic updates

**Expected Impact**: <2 second initial load time

## Performance Targets

### Current Performance
- Initial Load: 10-20 seconds
- Transfer Count: 100+ (all)
- SSE Payload: ~500KB
- Re-renders: 100+ per update

### Target Performance
- Initial Load: <2 seconds
- Transfer Count: <10 (active only)
- SSE Payload: ~50KB
- Re-renders: <10 per update

## Technical Constraints

### Firestore Limitations
- No computed field queries
- No aggregation queries
- Limited compound index support
- Document size limit (1MB)

### Workarounds
- Denormalize computed states
- Client-side aggregation
- Strategic index design
- Document splitting for large transfers

## Monitoring and Metrics

### Key Metrics to Track
```typescript
// lib/monitoring/performance.ts
trackMetric('dashboard.load.time', loadTime);
trackMetric('dashboard.transfer.count', transferCount);
trackMetric('dashboard.sse.payload', payloadSize);
trackMetric('dashboard.render.count', renderCount);
```

### Performance Budget
- Initial Load: <2s (p95)
- Update Latency: <100ms (p95)
- SSE Payload: <100KB (p95)
- Memory Usage: <50MB

## Migration Strategy

### Backwards Compatibility
- Keep fallback to current system
- Feature flag new optimizations
- Gradual rollout by custodian

### Data Migration
```typescript
// scripts/migrate-denormalized-fields.ts
async function migrateDenormalizedFields() {
  const batch = db.batch();
  const rollovers = await db.collection('rollovers').get();
  
  for (const doc of rollovers.docs) {
    const events = await getEvents(doc.id);
    const computed = computeState(events);
    
    batch.update(doc.ref, {
      computedPhase: computed.phase,
      isActive: computed.isActive,
      lastEventTimestamp: computed.lastUpdate
    });
  }
  
  await batch.commit();
}
```

## Alternative Approaches Considered

### GraphQL/DataConnect Aggregation
**Rejected**: DataConnect doesn't support real-time subscriptions needed for SSE

### Redis Cache Layer
**Rejected**: Adds infrastructure complexity, Firestore denormalization simpler

### WebSocket Replace SSE
**Rejected**: SSE sufficient for one-way updates, simpler implementation

### Complete Client-Side Computation
**Rejected**: Current approach, proven too slow with 100+ transfers

## Conclusion

The event-driven architecture's current implementation sends too much data to clients and performs too much client-side computation. By implementing server-side filtering, database denormalization, and progressive loading, we can achieve <2 second load times while maintaining real-time updates.

**Estimated Total Impact**: 90% reduction in dashboard load time