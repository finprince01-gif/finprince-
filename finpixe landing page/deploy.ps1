# Deployment script for Finpixe Landing Page
# Deploys to: https://finpixe.com

# Configuration
$BUCKET_NAME = "finpixe-landing-page"
$DISTRIBUTION_ID = "YOUR_CLOUDFRONT_DISTRIBUTION_ID"  # Replace with actual ID
$REGION = "us-east-1"

Write-Host "🚀 Starting landing page deployment..." -ForegroundColor Green

# Navigate to landing page directory
Set-Location "c:\108\ai\finpixe landing page"

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "❌ Error: .env file not found!" -ForegroundColor Red
    Write-Host "Please create .env file with production variables" -ForegroundColor Yellow
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path node_modules)) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
    npm install
}

# Build the project
Write-Host "🔨 Building landing page..." -ForegroundColor Cyan
npm run build

# Check if build was successful
if (-not (Test-Path dist)) {
    Write-Host "❌ Error: Build failed - dist directory not found!" -ForegroundColor Red
    exit 1
}

# Upload to S3
Write-Host "☁️  Uploading to S3 bucket: $BUCKET_NAME..." -ForegroundColor Cyan

# Upload with cache headers for assets
aws s3 sync ./dist s3://$BUCKET_NAME `
  --region $REGION `
  --cache-control "public,max-age=31536000,immutable" `
  --exclude "*.html" `
  --delete

# Upload HTML files with no-cache
aws s3 sync ./dist s3://$BUCKET_NAME `
  --region $REGION `
  --cache-control "public,max-age=0,must-revalidate" `
  --exclude "*" `
  --include "*.html" `
  --delete

# Invalidate CloudFront cache
Write-Host "🔄 Invalidating CloudFront cache..." -ForegroundColor Cyan
aws cloudfront create-invalidation `
  --distribution-id $DISTRIBUTION_ID `
  --paths "/*" `
  --region $REGION

Write-Host "✅ Landing page deployed successfully!" -ForegroundColor Green
Write-Host "🌐 URL: https://finpixe.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "⏳ Note: CloudFront invalidation may take 5-15 minutes to complete" -ForegroundColor Yellow
