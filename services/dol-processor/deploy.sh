#!/bin/bash

# Deployment script for DOL Processor Cloud Function Gen 2

echo "🚀 Deploying DOL Processor to Cloud Functions Gen 2..."

# Build the function
echo "📦 Building TypeScript..."
npm run build

# Deploy the sync function
echo "☁️ Deploying syncDOLData function..."
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
  --set-env-vars="NODE_ENV=production,FIREBASE_PROJECT_ID=trustrails-faa3e" \
  --service-account=firebase-admin@trustrails-faa3e.iam.gserviceaccount.com

# Get the function URL
FUNCTION_URL=$(gcloud functions describe syncDOLData --gen2 --region=us-central1 --format='value(serviceConfig.uri)')
echo "✅ Function deployed at: $FUNCTION_URL"

# Create Cloud Scheduler job for monthly execution
echo "⏰ Setting up Cloud Scheduler..."
gcloud scheduler jobs create http dol-sync-monthly \
  --location=us-central1 \
  --schedule="0 2 2 * *" \
  --uri="$FUNCTION_URL" \
  --http-method=POST \
  --oidc-service-account-email=firebase-admin@trustrails-faa3e.iam.gserviceaccount.com \
  --attempt-deadline=3600s \
  --time-zone="America/New_York" \
  --description="Monthly DOL Form 5500 data sync (2nd of each month at 2 AM EST)"

echo "✅ Deployment complete!"
echo ""
echo "Test the function manually with:"
echo "curl -X POST $FUNCTION_URL"
echo ""
echo "View logs with:"
echo "gcloud functions logs read syncDOLData --gen2 --region=us-central1"