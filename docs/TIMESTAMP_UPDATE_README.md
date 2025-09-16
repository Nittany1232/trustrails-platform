# Data Connect Timestamp Update Scripts

## Problem
The ETL system was fixed to use correct event timestamps, but existing Data Connect records have incorrect timestamps where `completedAt = initiatedAt` (both set to when the ETL ran instead of actual completion time). This causes all transfers to appear to complete in 0.0 days on analytics dashboards.

## Solution
These scripts update existing Data Connect records with correct timestamps from Firestore completion events.

## Scripts

### 1. `test-timestamp-update.js` (Run First)
A safe test script that:
- Checks the first 3 completion events
- Shows what would be updated without making changes
- Validates the approach before running the full update

**Usage:**
```bash
node test-timestamp-update.js
```

### 2. `update-data-connect-timestamps.js` (Main Script)
The main script that:
- Updates all Data Connect transfer records with correct completion timestamps
- Safe to run multiple times (skips already correct records)
- Provides detailed progress reporting by custodian
- Includes error handling and verification

**Usage:**
```bash
node update-data-connect-timestamps.js
```

## Features

### Safety
- **Idempotent**: Can be run multiple times safely
- **Verification**: Checks updates after applying them
- **Error handling**: Continues processing even if individual updates fail
- **Progress tracking**: Shows detailed progress and statistics

### Performance
- **Batch processing**: Processes events in batches of 5 with delays
- **Progress reporting**: Shows updates per custodian and overall stats
- **Memory efficient**: Streams data rather than loading everything at once

### Reliability
- **Firebase Admin SDK**: Uses proper authentication and admin privileges
- **Data Connect Admin**: Uses server-side Data Connect with NO_ACCESS auth level
- **Graceful shutdown**: Handles SIGINT/SIGTERM properly
- **Detailed logging**: Comprehensive logging for debugging

## Expected Results

After running the update script successfully:

1. **Dashboard Analytics**: Average completion times will show real durations (8.5 days, 20.6 days, 24.9 days) instead of 0.0 days
2. **Consistent Data**: All monthly stats cards will use Data Connect data with correct timestamps
3. **Completions Card**: Will now use Data Connect data instead of real-time Firestore

## Verification

The script includes automatic verification, but you can also manually verify by:

1. **Check Analytics Dashboard**: Refresh to see updated completion times
2. **Browser Console**: Look for updated `averageCompletionTime` values in API responses
3. **Database Query**: Run queries against Data Connect to verify timestamps

## Troubleshooting

### Common Issues
- **Firebase credentials**: Ensure `./credentials/firebase-admin.json` exists
- **Data Connect config**: Verify `DATA_CONNECT_SERVICE_ID` and `DATA_CONNECT_LOCATION`
- **Network connectivity**: Ensure connection to Firebase services

### Environment Variables
```bash
# Optional - defaults are usually correct
export DATA_CONNECT_SERVICE_ID=1232
export DATA_CONNECT_LOCATION=asia-northeast1
```

### Logs
The script provides detailed logs showing:
- Number of events processed per custodian
- Examples of updated records
- Error details for any failures
- Final statistics and success rate

## Impact

This update ensures:
- All monthly analytics cards use consistent Data Connect data
- Performance metrics show accurate completion times
- Dashboard displays meaningful business intelligence
- Compliance reporting has correct timestamps