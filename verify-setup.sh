#!/bin/bash

echo "🔍 Verifying Monorepo Setup..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0
warnings=0

# Check workspace structure
echo "📁 Checking workspace structure..."
if [ -f "package.json" ] && grep -q '"workspaces"' package.json; then
    echo -e "${GREEN}✅ Root package.json with workspaces${NC}"
else
    echo -e "${RED}❌ Root package.json missing or no workspaces configured${NC}"
    ((errors++))
fi

if [ -f "turbo.json" ]; then
    echo -e "${GREEN}✅ turbo.json exists${NC}"
else
    echo -e "${RED}❌ turbo.json missing${NC}"
    ((errors++))
fi

# Check packages
echo ""
echo "📦 Checking packages..."

if [ -d "packages/database" ] && [ -f "packages/database/package.json" ]; then
    echo -e "${GREEN}✅ @yt-dlp-gui/database package exists${NC}"

    if [ -d "packages/database/dist" ]; then
        echo -e "${GREEN}✅ @yt-dlp-gui/database is built${NC}"
    else
        echo -e "${YELLOW}⚠️  @yt-dlp-gui/database not built yet${NC}"
        echo "   Run: npm run build --workspace=packages/database"
        ((warnings++))
    fi
else
    echo -e "${RED}❌ @yt-dlp-gui/database package missing${NC}"
    ((errors++))
fi

if [ -d "packages/tsconfig" ] && [ -f "packages/tsconfig/package.json" ]; then
    echo -e "${GREEN}✅ @yt-dlp-gui/tsconfig package exists${NC}"
else
    echo -e "${RED}❌ @yt-dlp-gui/tsconfig package missing${NC}"
    ((errors++))
fi

# Check Electron app
echo ""
echo "⚡ Checking Electron app..."

if [ -d "apps/electron" ] && [ -f "apps/electron/package.json" ]; then
    echo -e "${GREEN}✅ @yt-dlp-gui/electron app exists${NC}"

    # Check if it references the database package
    if grep -q '@yt-dlp-gui/database' apps/electron/package.json; then
        echo -e "${GREEN}✅ Electron app references @yt-dlp-gui/database${NC}"
    else
        echo -e "${YELLOW}⚠️  Electron app doesn't reference @yt-dlp-gui/database${NC}"
        ((warnings++))
    fi
else
    echo -e "${RED}❌ @yt-dlp-gui/electron app missing${NC}"
    ((errors++))
fi

# Check node_modules
echo ""
echo "📚 Checking dependencies..."

if [ -d "node_modules" ]; then
    echo -e "${GREEN}✅ Root node_modules exists${NC}"

    # Check if turbo is installed
    if [ -f "node_modules/.bin/turbo" ]; then
        echo -e "${GREEN}✅ Turborepo is installed${NC}"
    else
        echo -e "${RED}❌ Turborepo not installed${NC}"
        echo "   Run: npm install"
        ((errors++))
    fi
else
    echo -e "${RED}❌ Dependencies not installed${NC}"
    echo "   Run: npm install"
    ((errors++))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Monorepo is ready!${NC}"
    echo ""
    echo "🚀 You can now run:"
    echo "   npm run dev              # Start Electron app"
    echo "   npm run build            # Build all packages"
    echo "   npm run test             # Run tests"
    exit 0
elif [ $errors -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Setup complete with ${warnings} warning(s)${NC}"
    echo ""
    echo "Everything should work, but consider addressing the warnings above."
    exit 0
else
    echo -e "${RED}❌ Setup incomplete: ${errors} error(s), ${warnings} warning(s)${NC}"
    echo ""
    echo "Please fix the errors above before proceeding."
    exit 1
fi
