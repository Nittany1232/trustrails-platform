# SSE Catch-up Functionality Testing Guide

## Overview

This guide explains how to test the newly implemented SSE catch-up functionality that ensures monthly stats cards update properly even after SSE disconnections.

## Implementation Summary

### Changes Made

1. **SSE Endpoint (`/app/api/events/global-stream/route.ts`)**:
   - Added `lastEventTime` query parameter support
   - Implemented catch-up logic to send missed events on reconnection
   - Limited catch-up to 1 hour and 50 events to prevent overwhelming the client
   - Added `timestampMs` field to all events for precise timestamp tracking

2. **SSE Hook (`/lib/hooks/useRobustSSE.ts`)**:
   - Added `trackEventTimestamps` option to enable event timestamp tracking
   - Tracks `lastEventTimestamp` in state for all received events
   - Automatically includes `lastEventTime` parameter when reconnecting
   - Handles catch-up control messages (`catchup_complete`, `catchup_error`)

3. **Monthly Cards Component (`/components/rollover/RobustMonthlyStatsCards.tsx`)**:
   - Enabled `trackEventTimestamps: true` for the SSE connection
   - Enhanced logging to distinguish between real-time and catch-up events
   - Faster refresh for catch-up events (1 second vs 5 seconds)
   - Shows last event timestamp in the status display

## Testing Scenarios

### Scenario 1: Fresh Connection (No Catch-up)

**Expected Behavior**: First-time connections should work normally without catch-up.

1. Start development server: `npm run dev`
2. Open custodian dashboard in browser
3. Open browser dev tools console
4. Look for logs:
   ```
   🌐 [Robust SSE] Connecting to: /api/events/global-stream
   ✅ [Robust SSE] Connection confirmed
   🌐 [Robust Cards] SSE connected
   ```
5. **No catch-up logs should appear** on first connection

### Scenario 2: Reconnection After Brief Disconnect

**Expected Behavior**: After disconnection, client should catch up on missed events.

1. With dashboard open, simulate SSE disconnection:
   - In dev tools Network tab, go offline for 30 seconds
   - Or close/reopen browser tab
   - Or pause/resume JavaScript execution

2. While disconnected, create a test event (simulate transfer completion):
   ```javascript
   // In another browser tab, create test event
   fetch('/api/test-data/active-custodians/complete-transfer', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     credentials: 'include',
     body: JSON.stringify({
       rolloverId: 'test-rollover-' + Date.now(),
       custodianId: 'YOUR_CUSTODIAN_ID'
     })
   });
   ```

3. Reconnect (go back online)

4. Look for catch-up logs:
   ```
   🔄 [Robust SSE] Connecting with catch-up from timestamp: 1234567890
   🔄 [SSE CATCHUP] Checking for missed events since [timestamp]
   📤 [SSE CATCHUP] Found N missed events, sending catch-up
   🔄 [Robust SSE] Catch-up complete: N events received
   ⚡ [Robust Cards] Transfer completion received (catch-up): {...}
   📤 [Robust Cards] Processing catch-up event (no toast)
   ```

### Scenario 3: Long Disconnection (Limited Catch-up)

**Expected Behavior**: Very long disconnections should only catch up for the last hour.

1. Open browser dev tools console
2. Set a breakpoint or manually edit localStorage to simulate old timestamp:
   ```javascript
   // In console, simulate SSE hook thinking last event was 2 hours ago
   // This will test the 1-hour catch-up limit
   ```

3. Reconnect and verify catch-up is limited:
   ```
   🔄 [SSE CATCHUP] Checking for missed events since [1 hour ago timestamp]
   ```

### Scenario 4: No Missed Events

**Expected Behavior**: If no events occurred during disconnection, no catch-up should happen.

1. Disconnect SSE (go offline)
2. Wait 30 seconds (without creating any events)
3. Reconnect
4. Look for logs:
   ```
   🔄 [SSE CATCHUP] Checking for missed events since [timestamp]
   ✅ [SSE CATCHUP] No missed events found since [timestamp]
   ```

## Testing Checklist

### ✅ Basic Functionality
- [ ] Fresh connections work without catch-up
- [ ] Real-time events still work as before
- [ ] Monthly cards update immediately on real-time events
- [ ] Toast notifications appear for real-time events

### ✅ Catch-up Functionality
- [ ] Reconnection triggers catch-up query
- [ ] Missed events are sent during catch-up
- [ ] Catch-up events are marked with `isCatchup: true`
- [ ] No toast notifications for catch-up events
- [ ] Monthly cards update faster for catch-up events (1s vs 5s)
- [ ] Multiple catch-up events are processed correctly

### ✅ Edge Cases
- [ ] No missed events scenario works correctly
- [ ] Long disconnection limited to 1 hour catch-up
- [ ] Large number of events limited to 50 events
- [ ] Catch-up errors handled gracefully
- [ ] Multiple rapid reconnections don't cause issues

### ✅ UI/UX
- [ ] Last event timestamp shown in status display
- [ ] Real-time updates status indicator works
- [ ] Error states display appropriately
- [ ] No duplicate notifications or updates

## Console Log Examples

### Successful Catch-up
```
🔄 [Robust SSE] Connecting with catch-up from timestamp: 1703123456789
🌐 [Robust SSE] Connecting to: /api/events/global-stream?lastEventTime=1703123456789
✅ [Robust SSE] Connection confirmed
🔄 [SSE CATCHUP] Checking for missed events since 2023-12-20T10:30:56.789Z
📤 [SSE CATCHUP] Found 3 missed events, sending catch-up
🔄 [Robust SSE] Catch-up complete: 3 events received
⚡ [Robust Cards] Transfer completion received (catch-up): {rolloverId: "...", isCatchup: true}
🔄 [Robust Cards] Completion affects custodian test-custodian-123 (catch-up)
📤 [Robust Cards] Processing catch-up event (no toast)
```

### No Missed Events
```
🔄 [Robust SSE] Connecting with catch-up from timestamp: 1703123456789
🌐 [Robust SSE] Connecting to: /api/events/global-stream?lastEventTime=1703123456789
✅ [Robust SSE] Connection confirmed
🔄 [SSE CATCHUP] Checking for missed events since 2023-12-20T10:30:56.789Z
✅ [SSE CATCHUP] No missed events found since 2023-12-20T10:30:56.789Z
```

### Real-time Event (No Catch-up)
```
⚡ [Robust Cards] Transfer completion received (real-time): {rolloverId: "...", isCatchup: false}
🔄 [Robust Cards] Completion affects custodian test-custodian-123 (real-time)
```

## Manual Testing Commands

### Create Test Event (via browser console)
```javascript
// Create a test rollover completion event
fetch('/api/test-events/create-completion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    rolloverId: 'test-rollover-' + Date.now(),
    custodianId: 'your-custodian-id-here',
    sourceCustodianId: 'your-custodian-id-here',
    destinationCustodianId: 'dest-custodian-123'
  })
});
```

### Simulate SSE Disconnection
```javascript
// In browser console - force close EventSource
const eventSources = window.performance.getEntries()
  .filter(entry => entry.name.includes('global-stream'));
console.log('Active SSE connections:', eventSources);

// Or simply go offline in Network tab for 30 seconds
```

## Troubleshooting

### Common Issues

1. **No catch-up logs appearing**
   - Verify `trackEventTimestamps: true` is set in the SSE hook
   - Check that events have `timestampMs` field
   - Ensure `lastEventTime` parameter is being added to URL

2. **Catch-up events not affecting monthly cards**
   - Verify custodian ID matching logic
   - Check ETL processing delay (should be 1 second for catch-up)
   - Ensure catch-up events have proper `sourceCustodianId`/`destinationCustodianId`

3. **Too many catch-up events**
   - Verify 1-hour time limit is working
   - Check 50-event limit is applied
   - Look for duplicate event processing

4. **Real-time events broken**
   - Ensure backward compatibility is maintained
   - Check that non-catch-up events still work
   - Verify toast notifications still appear

## Performance Considerations

- Catch-up queries are limited to 50 events to prevent overwhelming the client
- Catch-up time window is limited to 1 hour to prevent excessive data transfer
- Faster refresh for catch-up events (1 second) to improve perceived performance
- No toast notifications for catch-up events to avoid spam

## Security Notes

- Catch-up functionality requires authentication (same as existing SSE)
- Events are filtered by timestamp to prevent unauthorized access to old data
- No additional security vulnerabilities introduced
- Same rate limiting and connection limits apply

## Next Steps

After testing, consider:
1. Adding metrics to track catch-up effectiveness
2. Implementing catch-up for other SSE event types
3. Adding user preference for catch-up time window
4. Implementing more sophisticated event deduplication