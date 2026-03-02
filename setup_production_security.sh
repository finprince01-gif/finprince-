#!/bin/bash
# ============================================================================
# Production Security Setup Script
# ============================================================================
# This script helps you complete the final security setup steps
# Run this on your local machine or EC2 instance
# ============================================================================

echo "🔐 Production Security Setup for finpixe.com"
echo "=============================================="
echo ""

# Step 1: Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo "❌ Error: backend/.env not found"
    echo "Please create it from .env.production.template"
    exit 1
fi

echo "✅ Found backend/.env"
echo ""

# Step 2: Remove .env from Git
echo "📝 Step 1: Removing .env from Git..."
cd backend
git rm --cached .env 2>/dev/null || echo "⚠️  .env not tracked in Git (this is good!)"
git status | grep ".env"
echo ""

# Step 3: Verify .gitignore
echo "📝 Step 2: Verifying .gitignore..."
if grep -q "^\.env$" .gitignore; then
    echo "✅ .env is in .gitignore"
else
    echo "⚠️  Adding .env to .gitignore..."
    echo ".env" >> .gitignore
fi
echo ""

# Step 4: Check Django settings
echo "📝 Step 3: Checking Django configuration..."
python manage.py check --deploy 2>&1 | head -20
echo ""

# Step 5: Summary
echo "=============================================="
echo "📋 Manual Steps Required:"
echo "=============================================="
echo ""
echo "1. ✏️  Edit backend/.env and update these lines:"
echo "   DJANGO_DEBUG=False"
echo "   JWT_SECRET=c544030c344f40e2de2cd7f72d91d36803fe461757069348ac768a2768419fec"
echo ""
echo "2. 🔑 Rotate Gemini API Key:"
echo "   → Go to: https://makersuite.google.com/app/apikey"
echo "   → Delete old key: AIzaSyCwwv2KU_QaH02fn0ofxhkGk5DQgXbGmo4"
echo "   → Create new key and update .env"
echo ""
echo "3. 🔑 Rotate Twilio Auth Token:"
echo "   → Go to: https://console.twilio.com/"
echo "   → Reset auth token"
echo "   → Update .env with new token"
echo ""
echo "4. 💾 Commit Git changes:"
echo "   git add .gitignore"
echo "   git commit -m 'Remove .env from version control'"
echo "   git push"
echo ""
echo "5. 🔒 Set up HTTPS (on EC2 instance):"
echo "   sudo certbot --nginx -d finpixe.com -d www.finpixe.com"
echo ""
echo "=============================================="
echo "After completing these steps, run:"
echo "  python manage.py check --deploy"
echo "=============================================="
