#!/bin/bash

# Deployment script for Finpixe Landing Page
# Deploys to: https://finpixe.com

set -e  # Exit on error

# Configuration
BUCKET_NAME="finpixe-landing-page"
DISTRIBUTION_ID="YOUR_CLOUDFRONT_DISTRIBUTION_ID"  # Replace with actual ID
REGION="us-east-1"

echo "🚀 Starting landing page deployment..."

# Navigate to landing page directory
cd "c:\108\ai\finpixe landing page"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create .env file with production variables"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the project
echo "🔨 Building landing page..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Error: Build failed - dist directory not found!"
    exit 1
fi

# Upload to S3
echo "☁️  Uploading to S3 bucket: $BUCKET_NAME..."

# Upload with cache headers for assets
aws s3 sync ./dist s3://$BUCKET_NAME \
  --region $REGION \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html" \
  --delete

# Upload HTML files with no-cache
aws s3 sync ./dist s3://$BUCKET_NAME \
  --region $REGION \
  --cache-control "public,max-age=0,must-revalidate" \
  --exclude "*" \
  --include "*.html" \
  --delete

# Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*" \
  --region $REGION

echo "✅ Landing page deployed successfully!"
echo "🌐 URL: https://finpixe.com"
echo ""
echo "⏳ Note: CloudFront invalidation may take 5-15 minutes to complete"
