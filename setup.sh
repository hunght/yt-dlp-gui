#!/bin/bash

echo "🚀 Setting up YT-DLP GUI Monorepo..."
echo ""

# Check Node version
echo "📋 Checking prerequisites..."
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required (current: $(node -v))"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check npm version
npm_version=$(npm -v | cut -d'.' -f1)
if [ "$npm_version" -lt 9 ]; then
    echo "❌ npm version 9 or higher is required (current: $(npm -v))"
    exit 1
fi
echo "✅ npm $(npm -v)"

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building packages..."
npm run build --workspace=packages/database

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎉 You can now run:"
echo "   npm run dev              # Start the Electron app"
echo "   npm run test             # Run tests"
echo "   npm run db:studio        # Open database studio"
echo ""
