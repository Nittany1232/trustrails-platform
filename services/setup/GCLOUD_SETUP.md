# Google Cloud CLI Installation Guide

## Windows (WSL2)
```bash
# Download and install
curl -O https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz
tar -xf google-cloud-cli-linux-x86_64.tar.gz
./google-cloud-sdk/install.sh

# Initialize
./google-cloud-sdk/bin/gcloud init

# Add to PATH
echo 'export PATH=$PATH:~/google-cloud-sdk/bin' >> ~/.bashrc
source ~/.bashrc
```

## macOS
```bash
# Using Homebrew
brew install google-cloud-sdk

# Or download directly
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

## Linux
```bash
# Add Cloud SDK distribution URI as package source
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

# Import Google Cloud public key
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -

# Update and install
sudo apt-get update && sudo apt-get install google-cloud-cli
```

## Configure Authentication
```bash
# Login to your Google account
gcloud auth login

# Set default project
gcloud config set project trustrails-faa3e

# Set default region
gcloud config set compute/region us-central1

# Verify configuration
gcloud config list
```

## Service Account Setup (for deployment)
```bash
# Create service account for Cloud Functions
gcloud iam service-accounts create dol-processor \
    --display-name="DOL Data Processor"

# Grant necessary permissions
gcloud projects add-iam-policy-binding trustrails-faa3e \
    --member="serviceAccount:dol-processor@trustrails-faa3e.iam.gserviceaccount.com" \
    --role="roles/dataEditor"

gcloud projects add-iam-policy-binding trustrails-faa3e \
    --member="serviceAccount:dol-processor@trustrails-faa3e.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding trustrails-faa3e \
    --member="serviceAccount:dol-processor@trustrails-faa3e.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"
```