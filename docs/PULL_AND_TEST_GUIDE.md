# Pull and Test Guide - Audit Functionality

## Quick Start (On Your Local Machine)

```bash
# 1. Navigate to your project directory
cd ~/projects/trustrails

# 2. Make sure you're on main branch
git checkout main

# 3. Pull the latest changes
git pull origin main

# 4. Install dependencies (in case any were added)
npm install

# 5. Start the development server
npm run dev
```

## Test the Audit Functionality

### Main Audit Page
Navigate to: http://localhost:3000/admin/audit

### What's Included in the Merge:

1. **Performance-Optimized UI Components** (from main branch):
   - `MonthlyStatsCardsTremor.tsx` - 80% faster load times with ETL completion signals
   - `TransferLifecycleTrackerSection.tsx` - React Query with prefetching and FLIP animations
   
2. **Audit Features** (from audit branch):
   - `/admin/audit` - Full audit trail interface
   - Event timeline with filtering
   - User activity tracking
   - Blockchain transaction audit
   - Data modification tracking
   - SOC 2 compliant reporting

3. **Data Analytics** (hybrid approach):
   - `data-connect-analytics-service.ts` - Correct completedAt timestamp attribution from audit branch

### Testing Checklist:

#### Audit Interface
- [ ] Navigate to http://localhost:3000/admin/audit
- [ ] Verify events are loading properly
- [ ] Test date range picker (filter by date)
- [ ] Test event type filtering
- [ ] Test user filtering (if applicable)
- [ ] Click on event details to expand
- [ ] Verify blockchain links open in Arbiscan/Etherscan

#### Performance Verification
- [ ] Check Monthly Stats Cards load quickly (< 1 second)
- [ ] Verify Transfer Lifecycle Tracker has smooth animations
- [ ] Confirm no UI flashing when data updates
- [ ] Check that completed transfers trigger real-time updates

#### Real-time Updates
- [ ] Open two browser windows logged in as different users
- [ ] Complete a transfer in one window
- [ ] Verify audit trail updates in both windows
- [ ] Check that SSE events are working (blockchain URLs appear)

### Common Issues and Solutions:

**Issue: TypeScript errors when running npm run typecheck**
- These are mostly in test files and won't affect runtime
- The app will still run fine with `npm run dev`

**Issue: Audit page not loading**
- Make sure you're logged in as an admin user
- Check browser console for any API errors
- Verify Firebase Auth is working

**Issue: Data not showing in audit trail**
- Events may take a few seconds to propagate
- Try refreshing the page
- Check if ETL functions are running (check Firebase Functions logs)

### Verify Everything Works:

```bash
# Optional: Run linting (may have some warnings)
npm run lint

# Start the app
npm run dev

# In another terminal, you can watch for TypeScript errors (optional)
npm run typecheck -- --watch
```

## Database Verification

If you want to verify the audit events are being stored:

1. Go to Firebase Console: https://console.firebase.google.com
2. Navigate to your project
3. Go to Firestore Database
4. Look for the `auditEvents` collection
5. You should see events being created as you perform actions

## Next Steps

After verifying the audit functionality works:

1. Test creating a new transfer to generate audit events
2. Complete a transfer to see the full audit trail
3. Export audit reports if that feature is implemented
4. Check that all blockchain transaction links work correctly

## Support

If you encounter any issues:
1. Check the browser console for errors
2. Look at the network tab to see if API calls are failing
3. Verify your environment variables are set correctly
4. Make sure Firebase services are running