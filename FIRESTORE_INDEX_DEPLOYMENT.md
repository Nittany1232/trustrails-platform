# Firestore Index Deployment Instructions

## Current Status

✅ **Working Queries (No Index Required):**
- State search: `?state=CA`
- State + limit: `?state=TX&limit=5`

❌ **Queries Requiring Indexes:**
- EIN search: `?ein=942404110`
- Text/name search: `?q=oracle`
- Combined filters: `?state=CA&type=401k`

## Index Deployment Steps

### Step 1: Authenticate with Firebase

```bash
firebase login --reauth
```

This will open a browser window for authentication.

### Step 2: Deploy the Indexes

```bash
cd /home/stock1232/projects/trustrails-platform
firebase deploy --only firestore:indexes --project trustrails-faa3e
```

### Step 3: Monitor Index Building

Indexes take 5-10 minutes to build. Check status at:
https://console.firebase.google.com/project/trustrails-faa3e/firestore/indexes

### Step 4: Verify Search Functionality

Once indexes are built, test the search API:

```bash
# Test EIN search
curl "https://searchplans-pixdjghfcq-uc.a.run.app?ein=942404110"

# Test text search
curl "https://searchplans-pixdjghfcq-uc.a.run.app?q=oracle"

# Test combined filters
curl "https://searchplans-pixdjghfcq-uc.a.run.app?state=CA&type=401k"
```

## Index Coverage

The `firestore.indexes.json` file includes comprehensive indexes for:

1. **Basic Searches:**
   - EIN equality with participant filtering
   - Sponsor name range queries (fuzzy search)
   - Search tokens array contains
   - Plan type filtering
   - State filtering

2. **Combined Searches:**
   - State + Type + Participants
   - Text search + State
   - Text search + Type
   - All combinations with search rank ordering

3. **Special Indexes:**
   - Participant count > 0 filtering (excludes zero-participant plans)
   - Search rank descending (shows best matches first)
   - Fuzzy name search with range queries

## Troubleshooting

If you get authentication errors:
```bash
# Logout and login again
firebase logout
firebase login

# Or try with a different account
firebase login:use
```

If deployment fails:
```bash
# Check Firebase CLI version
firebase --version

# Update if needed
npm install -g firebase-tools
```

## API Endpoints

**Production Search API:**
https://searchplans-pixdjghfcq-uc.a.run.app

**Query Parameters:**
- `q`: Text search (company/plan name)
- `ein`: Employer Identification Number
- `state`: State abbreviation (e.g., CA, TX)
- `city`: City name
- `type`: Plan type (401k, 403b, pension)
- `limit`: Max results (default 20, max 100)
- `offset`: Pagination offset

## Next Steps

After indexes are deployed and verified:
1. Widget can now perform all search types
2. Monitor query performance in Cloud Console
3. Consider adding analytics to track popular searches