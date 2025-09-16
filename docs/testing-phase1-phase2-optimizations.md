# Testing Phase 1 & Phase 2 Performance Optimizations

## Quick Test Steps

### 1. Initial Page Load Test (Phase 1)
```bash
# Start the development server if not running
npm run dev

# Navigate to custodian dashboard
http://localhost:3000/custodians/dashboard/metamask-test-custodian
```

**What to check:**
- ✅ **NO toast notifications should appear** on initial page load
- ✅ Rollovers should load into correct filter tabs immediately (not redistribute)
- ✅ Filter counts should be accurate from the start
- ✅ No "Transfer complete" or "Analytics will refresh" messages on load

### 2. Filter Performance Test (Phase 1)
- Click between filter tabs (Initiation, Preparation, Execution, Settlement)
- **Expected:** Instant filtering with no lag
- **Check:** Console for any errors

### 3. Refresh Test
```bash
# Hard refresh to bypass cache
Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
```
- **Should see:** Clean load without toasts
- **Should NOT see:** Data jumping between filters

## Detailed Testing with DevTools

### 1. Open Chrome DevTools
Press `F12` or right-click → Inspect

### 2. Network Tab Testing (Phase 2)
1. Go to **Network** tab
2. Filter by `Fetch/XHR`
3. Refresh the page
4. Look for these new endpoints:
   - `/api/rollover/batch` - Should see batch requests
   - `/api/rollover/summary` - Should see summary requests

**Check response times:**
- Batch endpoint: Should be < 1500ms (was 2000-5000ms)
- Summary endpoint: Should be < 500ms
- Look for `304 Not Modified` on subsequent loads (caching working)

### 3. Console Testing
Open Console tab and look for:
```javascript
// You should see these logs:
"📊 Waiting for data to settle before initializing MonthlyStatsCardsTremor..."
"📊 Initializing MonthlyStatsCardsTremor with completedCount: X"
"[BATCH-API] Computing states for X rollovers"
"[BATCH-API] Cache hit for rollover-id" // On subsequent loads

// You should NOT see:
"🔄 New rollover completed! Refreshing analytics..." // On initial load
"Transfer completed!" // On initial load
```

### 4. Performance Testing
1. Go to **Performance** tab
2. Click record button (⚫)
3. Refresh the page
4. Stop recording after page loads
5. Check:
   - **Scripting time:** Should be reduced by ~40%
   - **Rendering:** Should be smoother with less re-renders
   - **Total blocking time:** Should be lower

## Test Scenarios

### Scenario 1: Cold Load (First Visit)
1. Clear browser cache: `Ctrl+Shift+Delete` → Clear cached images and files
2. Visit dashboard
3. **Expected results:**
   - No toasts on load
   - Batch API called for state computation
   - ~1-2 second total load time

### Scenario 2: Warm Load (Return Visit)
1. Visit dashboard again within 60 seconds
2. **Expected results:**
   - Faster load (~500ms)
   - Cache hits in console
   - ETag headers preventing redundant fetches

### Scenario 3: Real-time Update Test
1. Keep dashboard open
2. Complete a transfer in another tab/window
3. **Expected results:**
   - Toast SHOULD appear for real completion
   - "Transfer completed!" message
   - Data updates without full page refresh

### Scenario 4: Multiple Custodians Test
```bash
# Test with different custodian IDs
http://localhost:3000/custodians/dashboard/metamask-test-custodian
http://localhost:3000/custodians/dashboard/tokenization-test-custodian-2
```
- Each should have independent cache
- No cross-contamination of data

## API Testing with cURL

### Test Batch Endpoint
```bash
# Replace with your actual auth token
curl -X POST http://localhost:3000/api/rollover/batch \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "custodianId": "metamask-test-custodian",
    "rolloverIds": ["rollover-id-1", "rollover-id-2"]
  }'
```

### Test Summary Endpoint
```bash
curl http://localhost:3000/api/rollover/summary?custodianId=metamask-test-custodian \
  -H "Cookie: your-auth-cookie"
```

## Performance Metrics to Track

### Before Optimizations
- Initial load: 3-5 seconds
- Toast notifications: Appear incorrectly
- Filter switching: 200-500ms delay
- API calls: Multiple redundant calls

### After Optimizations (Expected)
- Initial load: 1-2 seconds (50-60% improvement)
- Toast notifications: None on initial load
- Filter switching: < 50ms (instant)
- API calls: Batched and cached
- Cache hit rate: 70% after warmup

## Debugging Commands

### Check Cache Statistics
In browser console:
```javascript
// Monitor network requests
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('/api/rollover'))
  .forEach(r => console.log(r.name, r.duration + 'ms'));
```

### Monitor Memory Usage
```javascript
// Check if memory is stable (no leaks)
console.log('Memory:', performance.memory.usedJSHeapSize / 1048576, 'MB');
```

## Common Issues & Solutions

### Issue: Toasts still appearing
- **Check:** Hard refresh browser (Ctrl+Shift+R)
- **Check:** Console for initialization logs
- **Solution:** Clear browser cache completely

### Issue: Slow performance
- **Check:** Network tab for failed requests
- **Check:** Console for errors
- **Solution:** Check if backend is running properly

### Issue: Data not updating
- **Check:** WebSocket connections in Network tab
- **Check:** Firebase listeners in console
- **Solution:** Check authentication status

## Success Criteria ✅

1. **No toasts on initial page load**
2. **Page loads in < 2 seconds**
3. **Filters work instantly**
4. **Cache hits show in console after first load**
5. **Real-time updates still work correctly**
6. **No console errors**
7. **Memory usage stable (no leaks)**

## Quick Verification Script

Run in browser console after page loads:
```javascript
// Quick health check
(() => {
  const checks = {
    'No toast container visible': !document.querySelector('[data-sonner-toast]'),
    'Rollover data loaded': document.querySelectorAll('[data-rollover-card]').length > 0,
    'Filters working': document.querySelectorAll('[data-filter-badge]').length === 4,
    'No console errors': !window.consoleErrors
  };
  
  console.table(checks);
  const passed = Object.values(checks).every(v => v);
  console.log(passed ? '✅ All checks passed!' : '❌ Some checks failed');
})();
```

---

## Testing Checklist

- [ ] Page loads without toasts
- [ ] Data appears in correct filters immediately  
- [ ] Batch API endpoint working (< 1500ms)
- [ ] Summary API endpoint working (< 500ms)
- [ ] Cache hits on second load
- [ ] Real-time updates still work
- [ ] No console errors
- [ ] Memory stable (no leaks)
- [ ] Performance improved by 50%+

If all checks pass, the optimizations are working correctly! 🎉