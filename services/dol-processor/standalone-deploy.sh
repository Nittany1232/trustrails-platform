#!/bin/bash

# Standalone deployment script for DOL Processor

# Add gcloud to PATH
export PATH=$PATH:~/google-cloud-sdk/bin

echo "🚀 Creating standalone DOL Processor function..."

PROJECT_ID="trustrails-faa3e"
REGION="us-central1"

# Create a standalone directory with all dependencies
STANDALONE_DIR="standalone-function"
rm -rf $STANDALONE_DIR
mkdir -p $STANDALONE_DIR

echo "📦 Copying source files..."
# Copy the main function file
cp index.ts $STANDALONE_DIR/

# Copy the GCP config
mkdir -p $STANDALONE_DIR/lib
cp ../../lib/gcp-config.ts $STANDALONE_DIR/lib/

# Copy package files
cp package*.json $STANDALONE_DIR/

# Copy tsconfig
cp tsconfig.json $STANDALONE_DIR/

# Update tsconfig for standalone structure
cat > $STANDALONE_DIR/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Update imports in index.ts for standalone structure
sed -i "s|'../../lib/gcp-config'|'./lib/gcp-config'|g" $STANDALONE_DIR/index.ts

# Copy Firebase credentials
mkdir -p $STANDALONE_DIR/trustrails/credentials
cp ../../trustrails/credentials/firebase-admin.json $STANDALONE_DIR/trustrails/credentials/

cd $STANDALONE_DIR

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building TypeScript..."
npm run build

echo "☁️ Deploying function..."
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

        # Create Cloud Scheduler job
        echo "⏰ Setting up Cloud Scheduler..."

        # Delete existing job if exists
        gcloud scheduler jobs delete dol-sync-monthly \
          --location=$REGION \
          --project=$PROJECT_ID \
          --quiet 2>/dev/null || true

        # Create scheduler job
        gcloud scheduler jobs create http dol-sync-monthly \
          --location=$REGION \
          --schedule="0 2 2 * *" \
          --uri="$FUNCTION_URL" \
          --http-method=POST \
          --attempt-deadline=3600s \
          --time-zone="America/New_York" \
          --description="Monthly DOL Form 5500 data sync" \
          --project=$PROJECT_ID

        echo ""
        echo "=========================================="
        echo "✅ Deployment complete!"
        echo "=========================================="
        echo ""
        echo "Function URL: $FUNCTION_URL"
        echo ""
        echo "Test with: curl -X POST $FUNCTION_URL"
    fi
else
    echo "❌ Deployment failed"
fi

cd ..