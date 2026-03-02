# ============================================================================
# Production Security Setup Script (PowerShell)
# ============================================================================
# Run this script on Windows to complete security setup
# Usage: .\setup_production_security.ps1
# ============================================================================

Write-Host "🔐 Production Security Setup for finpixe.com" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if .env exists
if (-Not (Test-Path "backend\.env")) {
    Write-Host "❌ Error: backend\.env not found" -ForegroundColor Red
    Write-Host "Please create it from .env.production.template" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Found backend\.env" -ForegroundColor Green
Write-Host ""

# Step 2: Remove .env from Git
Write-Host "📝 Step 1: Removing .env from Git..." -ForegroundColor Yellow
Set-Location backend
git rm --cached .env 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  .env not tracked in Git (this is good!)" -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Verify .gitignore
Write-Host "📝 Step 2: Verifying .gitignore..." -ForegroundColor Yellow
$gitignoreContent = Get-Content .gitignore -ErrorAction SilentlyContinue
if ($gitignoreContent -contains ".env") {
    Write-Host "✅ .env is in .gitignore" -ForegroundColor Green
} else {
    Write-Host "⚠️  Adding .env to .gitignore..." -ForegroundColor Yellow
    Add-Content .gitignore "`n.env"
}
Write-Host ""

# Step 4: Check Django settings
Write-Host "📝 Step 3: Checking Django configuration..." -ForegroundColor Yellow
python manage.py check --deploy 2>&1 | Select-Object -First 20
Write-Host ""

# Step 5: Display manual steps
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "📋 Manual Steps Required:" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. ✏️  Edit backend\.env and update these lines:" -ForegroundColor Yellow
Write-Host "   DJANGO_DEBUG=False" -ForegroundColor White
Write-Host "   JWT_SECRET=c544030c344f40e2de2cd7f72d91d36803fe461757069348ac768a2768419fec" -ForegroundColor White
Write-Host ""

Write-Host "2. 🔑 Rotate Gemini API Key:" -ForegroundColor Yellow
Write-Host "   → Go to: https://makersuite.google.com/app/apikey" -ForegroundColor White
Write-Host "   → Delete old key: AIzaSyCwwv2KU_QaH02fn0ofxhkGk5DQgXbGmo4" -ForegroundColor White
Write-Host "   → Create new key and update .env" -ForegroundColor White
Write-Host ""

Write-Host "3. 🔑 Rotate Twilio Auth Token:" -ForegroundColor Yellow
Write-Host "   → Go to: https://console.twilio.com/" -ForegroundColor White
Write-Host "   → Reset auth token" -ForegroundColor White
Write-Host "   → Update .env with new token" -ForegroundColor White
Write-Host ""

Write-Host "4. 💾 Commit Git changes:" -ForegroundColor Yellow
Write-Host "   git add .gitignore" -ForegroundColor White
Write-Host "   git commit -m 'Remove .env from version control'" -ForegroundColor White
Write-Host "   git push" -ForegroundColor White
Write-Host ""

Write-Host "5. 🔒 Set up HTTPS (on EC2 instance):" -ForegroundColor Yellow
Write-Host "   sudo certbot --nginx -d finpixe.com -d www.finpixe.com" -ForegroundColor White
Write-Host ""

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "After completing these steps, run:" -ForegroundColor Green
Write-Host "  python manage.py check --deploy" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor Cyan
