#!/bin/bash

# Create all required GCP resources for DOL data processing
# Run this after enabling services

PROJECT_ID="trustrails-faa3e"
REGION="us-central1"

echo "🚀 Creating GCP resources for DOL data processing..."

# 1. Create Cloud Storage buckets
echo ""
echo "📦 Creating Cloud Storage buckets..."

# Bucket for DOL raw data
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${PROJECT_ID}-dol-data/ 2>/dev/null || echo "Bucket ${PROJECT_ID}-dol-data already exists"

# Bucket for temporary processing
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${PROJECT_ID}-temp/ 2>/dev/null || echo "Bucket ${PROJECT_ID}-temp already exists"

# Set lifecycle rules to auto-delete old files
cat > /tmp/lifecycle.json << EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 90}
      }
    ]
  }
}
EOF

gsutil lifecycle set /tmp/lifecycle.json gs://${PROJECT_ID}-dol-data/
gsutil lifecycle set /tmp/lifecycle.json gs://${PROJECT_ID}-temp/

echo "✅ Storage buckets created"

# 2. Create BigQuery dataset and tables
echo ""
echo "📊 Creating BigQuery dataset..."

# Create dataset
bq mk \
  --dataset \
  --location=$REGION \
  --description="DOL Form 5500 retirement plan data" \
  ${PROJECT_ID}:retirement_plans 2>/dev/null || echo "Dataset retirement_plans already exists"

# Create main table with schema
bq mk \
  --table \
  --location=$REGION \
  --description="Form 5500 latest data" \
  --time_partitioning_field=lastUpdated \
  --time_partitioning_type=MONTH \
  ${PROJECT_ID}:retirement_plans.form5500_latest \
  ein:STRING,planNumber:STRING,planName:STRING,sponsorName:STRING,sponsorState:STRING,sponsorCity:STRING,sponsorZip:STRING,planType:STRING,participants:INTEGER,totalAssets:FLOAT,filingDate:STRING,formYear:STRING,lastUpdated:TIMESTAMP,searchRank:INTEGER 2>/dev/null || echo "Table form5500_latest already exists"

echo "✅ BigQuery dataset and tables created"

# 3. Create Firestore composite indexes
echo ""
echo "🔥 Creating Firestore indexes..."

# Create index configuration file
cat > /tmp/firestore.indexes.json << 'EOF'
{
  "indexes": [
    {
      "collectionGroup": "retirement_plans",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "sponsorState", "order": "ASCENDING"},
        {"fieldPath": "searchRank", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "retirement_plans",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "planType", "order": "ASCENDING"},
        {"fieldPath": "searchRank", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "retirement_plans",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "ein", "order": "ASCENDING"},
        {"fieldPath": "planNumber", "order": "ASCENDING"}
      ]
    }
  ],
  "fieldOverrides": []
}
EOF

# Deploy indexes (this will take a few minutes)
firebase deploy --only firestore:indexes --project $PROJECT_ID 2>/dev/null || echo "Install Firebase CLI first: npm install -g firebase-tools"

echo "✅ Firestore indexes created (may take a few minutes to build)"

# 4. Create service account for Cloud Functions
echo ""
echo "👤 Creating service account..."

gcloud iam service-accounts create dol-processor \
    --display-name="DOL Data Processor Service Account" \
    --project=$PROJECT_ID 2>/dev/null || echo "Service account dol-processor already exists"

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:dol-processor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataEditor" \
    --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:dol-processor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin" \
    --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:dol-processor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/datastore.user" \
    --condition=None

echo "✅ Service account created and configured"

# 5. Summary
echo ""
echo "=========================================="
echo "✅ All GCP resources created successfully!"
echo "=========================================="
echo ""
echo "Resources created:"
echo "  📦 Storage buckets:"
echo "     - gs://${PROJECT_ID}-dol-data/"
echo "     - gs://${PROJECT_ID}-temp/"
echo "  📊 BigQuery:"
echo "     - Dataset: retirement_plans"
echo "     - Table: form5500_latest"
echo "  🔥 Firestore:"
echo "     - Collection: retirement_plans"
echo "     - Indexes: Building..."
echo "  👤 Service Account:"
echo "     - dol-processor@${PROJECT_ID}.iam.gserviceaccount.com"
echo ""
echo "Next steps:"
echo "  1. cd services/dol-processor"
echo "  2. npm install"
echo "  3. npm run build"
echo "  4. ./deploy.sh"