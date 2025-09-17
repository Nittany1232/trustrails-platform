# 🚀 Complete DOL Data Processing Setup Instructions

## Prerequisites Checklist
- [ ] Google Cloud account with billing enabled
- [ ] Project ID: `trustrails-faa3e`
- [ ] Firebase Admin credentials at: `trustrails/credentials/firebase-admin.json`
- [ ] Node.js 20+ installed
- [ ] About 30 minutes for setup

## Step 1: Install Google Cloud CLI

### For WSL2/Ubuntu:
```bash
cd ~
curl -O https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz
tar -xf google-cloud-cli-linux-x86_64.tar.gz
./google-cloud-sdk/install.sh

# Add to PATH
echo 'export PATH=$PATH:~/google-cloud-sdk/bin' >> ~/.bashrc
source ~/.bashrc

# Login and set project
gcloud auth login
gcloud config set project trustrails-faa3e
```

## Step 2: Enable Required GCP Services

```bash
cd /home/stock1232/projects/trustrails-platform/services/setup
chmod +x enable-gcp-services.sh
./enable-gcp-services.sh
```

This enables:
- ✅ Cloud Functions Gen 2
- ✅ Cloud Run (backend for Gen 2)
- ✅ BigQuery
- ✅ Cloud Storage
- ✅ Cloud Scheduler
- ✅ Cloud Build

## Step 3: Create GCP Resources

```bash
chmod +x create-gcp-resources.sh
./create-gcp-resources.sh
```

This creates:
- 📦 Storage buckets for DOL data
- 📊 BigQuery dataset and tables
- 🔥 Firestore indexes
- 👤 Service account with permissions

## Step 4: Test DOL Data Locally (Optional but Recommended)

```bash
# Install test dependencies
cd /home/stock1232/projects/trustrails-platform/services/setup
npm install unzipper csv-parser

# Run test to see actual DOL data
node test-dol-data.js
```

This will:
- Download a sample DOL ZIP file (~200MB)
- Show you the actual CSV structure
- Display sample data rows
- Verify all required fields exist

## Step 5: Deploy DOL Processor Function

```bash
cd /home/stock1232/projects/trustrails-platform/services/dol-processor

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy to Cloud Functions Gen 2
gcloud functions deploy syncDOLData \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --memory=8GB \
  --timeout=3600s \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point=syncDOLData \
  --source=. \
  --set-env-vars="NODE_ENV=production"
```

## Step 6: Deploy Search API Function

```bash
cd /home/stock1232/projects/trustrails-platform/services/plan-search-api

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy search API
gcloud functions deploy searchPlans \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --memory=2GB \
  --timeout=60s \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point=searchPlans \
  --source=.
```

## Step 7: Set Up Monthly Schedule

```bash
# Get the function URL
FUNCTION_URL=$(gcloud functions describe syncDOLData --gen2 --region=us-central1 --format='value(serviceConfig.uri)')

# Create monthly schedule (2nd of each month at 2 AM)
gcloud scheduler jobs create http dol-sync-monthly \
  --location=us-central1 \
  --schedule="0 2 2 * *" \
  --uri="$FUNCTION_URL" \
  --http-method=POST \
  --attempt-deadline=3600s \
  --time-zone="America/New_York"
```

## Step 8: Run Initial Data Sync

```bash
# Trigger the DOL sync manually for initial data
FUNCTION_URL=$(gcloud functions describe syncDOLData --gen2 --region=us-central1 --format='value(serviceConfig.uri)')

curl -X POST $FUNCTION_URL \
  -H "Content-Type: application/json" \
  -d '{}'
```

⚠️ **This will take 20-30 minutes** to download and process 800,000+ plans!

## Step 9: Test the Search API

```bash
# Get search API URL
SEARCH_URL=$(gcloud functions describe searchPlans --gen2 --region=us-central1 --format='value(serviceConfig.uri)')

# Test search by company name
curl "$SEARCH_URL?q=google&state=CA"

# Test search by EIN
curl "$SEARCH_URL?ein=123456789"

# Test search by state
curl "$SEARCH_URL?state=CA&limit=10"
```

## Step 10: Update Widget with API URLs

Update your widget configuration with the deployed function URLs:

```typescript
// In packages/rollover-widget/src/plan-search.ts
constructor(environment: 'sandbox' | 'production' = 'sandbox') {
  this.apiEndpoint = environment === 'production'
    ? 'https://searchplans-xxxxx-uc.a.run.app' // Replace with your actual URL
    : 'http://localhost:8081';
}
```

## Monitoring & Logs

### View function logs:
```bash
# DOL processor logs
gcloud functions logs read syncDOLData --gen2 --region=us-central1 --limit=50

# Search API logs
gcloud functions logs read searchPlans --gen2 --region=us-central1 --limit=50
```

### Check BigQuery data:
```sql
-- In BigQuery console
SELECT
  COUNT(*) as total_plans,
  COUNT(DISTINCT ein) as unique_employers,
  AVG(participants) as avg_participants,
  SUM(totalAssets) as total_assets
FROM `trustrails-faa3e.retirement_plans.form5500_latest`
```

### Check Firestore cache:
```bash
# In Firebase console, look for:
# Collection: retirement_plans
# Documents: Should have ~5000 top plans cached
```

## Troubleshooting

### If deployment fails:
```bash
# Check if APIs are enabled
gcloud services list --enabled | grep -E "(cloudfunctions|run|bigquery)"

# Check service account permissions
gcloud projects get-iam-policy trustrails-faa3e

# Check function status
gcloud functions describe syncDOLData --gen2 --region=us-central1
```

### If data sync fails:
1. Check function logs for errors
2. Verify DOL website is accessible
3. Check BigQuery dataset exists
4. Verify service account has correct permissions

### Common Issues:
- **"Permission denied"**: Run `gcloud auth login` again
- **"API not enabled"**: Run the enable-gcp-services.sh script
- **"Quota exceeded"**: Check GCP quotas, especially for BigQuery
- **"Timeout"**: Normal for first sync, takes 20-30 minutes

## Success Indicators
✅ Cloud Functions deployed successfully
✅ Initial DOL sync completes
✅ BigQuery shows 800,000+ rows
✅ Firestore has 5,000 cached plans
✅ Search API returns results

## Monthly Costs
- DOL Processor: ~$20/month (1 hour/month at 8GB)
- Search API: ~$5-10/month (depends on usage)
- BigQuery Storage: ~$5/month (10GB)
- Total: **~$30-35/month**