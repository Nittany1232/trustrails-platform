#!/bin/bash

# Enable required GCP services for DOL data processing
# Run this script once to enable all necessary APIs

PROJECT_ID="trustrails-faa3e"

echo "🚀 Enabling GCP services for project: $PROJECT_ID"

# Set the project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "📦 Enabling Cloud Functions API..."
gcloud services enable cloudfunctions.googleapis.com

echo "📦 Enabling Cloud Functions Gen 2 (Cloud Run)..."
gcloud services enable run.googleapis.com

echo "📦 Enabling Cloud Build API (required for deployments)..."
gcloud services enable cloudbuild.googleapis.com

echo "📦 Enabling Cloud Scheduler API..."
gcloud services enable cloudscheduler.googleapis.com

echo "📦 Enabling BigQuery API..."
gcloud services enable bigquery.googleapis.com

echo "📦 Enabling Cloud Storage API..."
gcloud services enable storage.googleapis.com

echo "📦 Enabling Artifact Registry API (for function containers)..."
gcloud services enable artifactregistry.googleapis.com

echo "📦 Enabling Cloud Logging API..."
gcloud services enable logging.googleapis.com

echo "📦 Enabling Eventarc API (for event triggers)..."
gcloud services enable eventarc.googleapis.com

# Check enabled services
echo ""
echo "✅ Verifying enabled services:"
gcloud services list --enabled --filter="name:(cloudfunctions OR run OR bigquery OR storage OR cloudscheduler OR cloudbuild)"

echo ""
echo "✅ All required services enabled!"