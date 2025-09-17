#!/bin/bash

# Fixed deployment script for DOL Processor Cloud Function Gen 2

# Add gcloud to PATH
export PATH=$PATH:~/google-cloud-sdk/bin

echo "🚀 Deploying DOL Processor to Cloud Functions Gen 2..."

PROJECT_ID="trustrails-faa3e"
REGION="us-central1"

# Build the function
echo "📦 Building TypeScript..."
npm run build

# Deploy the sync function WITHOUT specifying service account (uses default)
echo "☁️ Deploying syncDOLData function..."
gcloud functions deploy syncDOLData \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --memory=8GB \
  --timeout=3600s \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point=syncDOLData \
  --source=. \
  --set-env-vars="NODE_ENV=production,FIREBASE_PROJECT_ID=$PROJECT_ID" \
  --project=$PROJECT_ID

# Check deployment status
if [ $? -eq 0 ]; then
    echo "✅ Function deployed successfully!"

    # Get the function URL
    FUNCTION_URL=$(gcloud functions describe syncDOLData --gen2 --region=$REGION --project=$PROJECT_ID --format='value(serviceConfig.uri)')

    if [ -n "$FUNCTION_URL" ]; then
        echo "✅ Function URL: $FUNCTION_URL"

        # Create Cloud Scheduler job for monthly execution
        echo "⏰ Setting up Cloud Scheduler..."

        # Delete existing job if it exists
        gcloud scheduler jobs delete dol-sync-monthly \
          --location=$REGION \
          --project=$PROJECT_ID \
          --quiet 2>/dev/null || true

        # Create new scheduler job
        gcloud scheduler jobs create http dol-sync-monthly \
          --location=$REGION \
          --schedule="0 2 2 * *" \
          --uri="$FUNCTION_URL" \
          --http-method=POST \
          --attempt-deadline=3600s \
          --time-zone="America/New_York" \
          --description="Monthly DOL Form 5500 data sync (2nd of each month at 2 AM EST)" \
          --project=$PROJECT_ID

        if [ $? -eq 0 ]; then
            echo "✅ Cloud Scheduler job created successfully!"
        else
            echo "⚠️ Cloud Scheduler job creation failed. You can create it manually later."
        fi

        echo ""
        echo "=========================================="
        echo "✅ Deployment complete!"
        echo "=========================================="
        echo ""
        echo "Function URL: $FUNCTION_URL"
        echo ""
        echo "Test the function manually with:"
        echo "curl -X POST $FUNCTION_URL"
        echo ""
        echo "View logs with:"
        echo "gcloud functions logs read syncDOLData --gen2 --region=$REGION --project=$PROJECT_ID"
        echo ""
        echo "Trigger the scheduler job manually:"
        echo "gcloud scheduler jobs run dol-sync-monthly --location=$REGION --project=$PROJECT_ID"
    else
        echo "⚠️ Could not retrieve function URL. Check deployment status with:"
        echo "gcloud functions describe syncDOLData --gen2 --region=$REGION --project=$PROJECT_ID"
    fi
else
    echo "❌ Function deployment failed. Check the error messages above."
    echo ""
    echo "Common issues:"
    echo "1. Make sure you're logged in: gcloud auth login"
    echo "2. Set the project: gcloud config set project $PROJECT_ID"
    echo "3. Enable required APIs:"
    echo "   gcloud services enable cloudfunctions.googleapis.com"
    echo "   gcloud services enable run.googleapis.com"
    echo "   gcloud services enable cloudbuild.googleapis.com"
fi