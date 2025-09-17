#!/bin/bash

# Deployment script that properly handles monorepo structure

# Add gcloud to PATH
export PATH=$PATH:~/google-cloud-sdk/bin

echo "🚀 Deploying DOL Processor from monorepo..."

PROJECT_ID="trustrails-faa3e"
REGION="us-central1"

# Change to monorepo root for proper path resolution
cd ../..
MONOREPO_ROOT=$(pwd)

echo "📦 Building TypeScript from monorepo root..."
cd services/dol-processor
npm run build
cd $MONOREPO_ROOT

echo "📋 Creating deployment package..."
# Create a temporary directory for deployment
DEPLOY_DIR=$(mktemp -d)
echo "Using temporary directory: $DEPLOY_DIR"

# Copy the necessary files
cp -r services/dol-processor/dist $DEPLOY_DIR/
cp -r services/dol-processor/node_modules $DEPLOY_DIR/
cp services/dol-processor/package*.json $DEPLOY_DIR/
cp -r lib $DEPLOY_DIR/

# Create the proper entry point
cat > $DEPLOY_DIR/index.js << 'EOF'
// Entry point wrapper for Cloud Functions
const functions = require('@google-cloud/functions-framework');
const { syncDOLData } = require('./dist/services/dol-processor/index.js');

// Register the function
functions.http('syncDOLData', syncDOLData);

// Export for testing
exports.syncDOLData = syncDOLData;
EOF

echo "☁️ Deploying function from $DEPLOY_DIR..."
cd $DEPLOY_DIR

# Deploy the sync function
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
    else
        echo "⚠️ Could not retrieve function URL"
    fi
else
    echo "❌ Function deployment failed"
fi

# Clean up
echo "🧹 Cleaning up temporary directory..."
rm -rf $DEPLOY_DIR

cd $MONOREPO_ROOT/services/dol-processor