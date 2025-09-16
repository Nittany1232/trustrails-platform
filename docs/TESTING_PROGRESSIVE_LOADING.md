# Testing Progressive Loading Implementation

## Quick Start Testing

### 1. Start Your Development Server
```bash
npm run dev
```

### 2. Set Environment Variables
Add to your `.env.local` file:
```bash
# Enable the feature
NEXT_PUBLIC_PROGRESSIVE_LOADING_ENABLED=true

# Set to 100% for testing (you'll definitely get it)
NEXT_PUBLIC_PROGRESSIVE_LOADING_PERCENTAGE=100

# Optional: Test with specific custodian
# NEXT_PUBLIC_PROGRESSIVE_LOADING_CUSTODIANS=your-test-custodian-id

# Optional: Test with specific user
# NEXT_PUBLIC_PROGRESSIVE_LOADING_USERS=your-test-user-id
```

### 3. Navigate to Test Page
Open: http://localhost:3000/test-progressive

## What You'll See

### Debug Controls Panel
- **Feature Status**: Shows if progressive loading is enabled
- **Rollout Percentage**: Current percentage setting
- **Emergency Disable Button**: Instantly switch to legacy implementation
- **Re-enable Button**: Turn progressive loading back on
- **Force Refresh Button**: Reload the component without page refresh

### Monthly Statistics Section
This will show the actual progressive loading cards. Watch for:
- Initial skeleton loading states
- Progressive data appearing (critical → primary → background)
- Real-time updates when transfers complete

## Testing Scenarios

### Scenario 1: Basic Functionality
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Navigate to test page
4. Look for these console logs:
   ```
   🚀 [Progressive] Setting up SSE connection for custodian: undefined
   ✅ [Progressive] SSE connection established
   ✅ [Progressive] Critical data received: {...}
   ✅ [Progressive] Primary data received: {...}
   ✅ [Progressive] Background data received: {...}
   ```

### Scenario 2: Network Monitoring
1. Open DevTools → **Network** tab
2. Filter by "EventStream" or search for "global-stream"
3. You should see:
   - Request: `/api/events/global-stream?mode=dashboard&custodianId=...`
   - Status: 200
   - Type: eventsource
   - Messages tab shows incoming events

### Scenario 3: Progressive Loading Timing
1. Open DevTools → **Network** tab
2. Clear network log
3. Click "Force Refresh" button
4. Watch the EventStream messages:
   - `dashboard-critical` should arrive < 500ms
   - `dashboard-primary` should arrive < 1500ms
   - `dashboard-background` arrives when ready
   - `dashboard-complete` signals all done

### Scenario 4: Error Recovery
1. Open DevTools → **Network** tab
2. Right-click on the EventStream request
3. Select "Block request URL"
4. Click "Force Refresh"
5. Watch console for reconnection attempts:
   ```
   ❌ [Progressive] SSE error: Event {...}
   🔄 [Progressive] Reconnecting in 1000ms (attempt 1)
   🔄 [Progressive] Reconnecting in 2000ms (attempt 2)
   ```

### Scenario 5: Emergency Disable
1. Component loads with progressive loading
2. Click "Emergency Disable" button
3. Component should reload with legacy implementation
4. Console shows: `📊 [Progressive] Feature disabled, using fallback`
5. Click "Re-enable" to switch back

### Scenario 6: Feature Flag Testing
Test different rollout scenarios:

#### Test A: Percentage-based (you're NOT selected)
```bash
NEXT_PUBLIC_PROGRESSIVE_LOADING_ENABLED=true
NEXT_PUBLIC_PROGRESSIVE_LOADING_PERCENTAGE=1  # Only 1% get it
```
You should see legacy implementation

#### Test B: User Allowlist (you ARE selected)
```bash
NEXT_PUBLIC_PROGRESSIVE_LOADING_ENABLED=true
NEXT_PUBLIC_PROGRESSIVE_LOADING_USERS=your-user-id
```
You should see progressive implementation

#### Test C: Completely Disabled
```bash
NEXT_PUBLIC_PROGRESSIVE_LOADING_ENABLED=false
```
Everyone gets legacy implementation

## Performance Comparison

### Legacy Implementation (3 API calls)
1. Open Network tab
2. Disable progressive loading
3. Note these requests:
   - `/api/analytics/timeseries`
   - `/api/rollover/summary`
   - `/api/analytics/monthly-summary`
4. Total time: Sum of all three

### Progressive Implementation (1 SSE stream)
1. Enable progressive loading
2. Note single request:
   - `/api/events/global-stream?mode=dashboard`
3. Critical data time: Time to first `dashboard-critical` event
4. Full load time: Time to `dashboard-complete` event

## What to Look For

### ✅ Success Indicators
- Single SSE connection instead of multiple API calls
- Cards load progressively (not all at once)
- No 429 rate limiting errors
- Smooth transition when switching implementations
- Real-time updates when transfers complete

### ❌ Failure Indicators
- Cards stuck in loading state
- Console errors about parsing or connection
- Multiple reconnection attempts
- 429 or 401 errors
- Empty or missing data in cards

## Advanced Testing

### Browser DevTools Console Commands

```javascript
// Check current feature flag status
progressiveLoadingFlag.getConfig()

// Emergency disable (instant effect)
progressiveLoadingFlag.emergencyDisable()

// Re-enable after emergency disable
progressiveLoadingFlag.reenable()

// Check if emergency disabled
progressiveLoadingFlag.isEmergencyDisabled()

// Check if enabled for specific user/custodian
progressiveLoadingFlag.isEnabled('custodian-id', 'user-id')
```

### Simulating Production Scenarios

1. **High Latency**: Use Chrome DevTools → Network → Throttling → Slow 3G
2. **Connection Loss**: Use Chrome DevTools → Network → Offline mode
3. **Multiple Users**: Open multiple incognito windows
4. **Long Sessions**: Leave page open for extended time, monitor memory

## Monitoring Success

### Key Metrics to Track
1. **Load Time**: Time to first meaningful paint
2. **Error Rate**: Check console for errors
3. **Memory Usage**: DevTools → Memory tab
4. **Network Efficiency**: Single connection vs multiple
5. **User Experience**: Smooth progressive enhancement

### Expected Improvements
- **Before**: 3 API calls, potential 429 errors, waterfall loading
- **After**: 1 SSE stream, no rate limiting, progressive enhancement

## Troubleshooting

### Issue: Cards stuck loading
- Check Network tab for SSE connection
- Look for authentication errors (401)
- Verify custodianId is being passed

### Issue: No real-time updates
- Ensure SSE connection stays open
- Check for reconnection loops
- Verify event handlers are registered

### Issue: Feature flag not working
- Clear browser cache and session storage
- Check environment variables are loaded
- Verify user/custodian ID matching

## Production Rollout Plan

1. **Stage 1**: Deploy with 5% rollout, monitor for 24 hours
2. **Stage 2**: Increase to 25% if stable
3. **Stage 3**: Increase to 50% after 48 hours stable
4. **Stage 4**: Full rollout at 100%
5. **Emergency**: Use emergency disable if issues arise