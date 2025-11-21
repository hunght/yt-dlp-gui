#!/bin/bash

# Script to generate comprehensive screenshots of all LearnifyTube pages for the landing page

echo "🖼️ Generating comprehensive screenshots for all LearnifyTube pages..."
echo ""
echo "📋 Pages that will be captured:"
echo "   • Activity Tracking (Focus Sessions)"
echo "   • Time Analytics Dashboard"
echo "   • Project Management (Kanban)"
echo "   • Activity Classification"
echo "   • Rule-Based Classification"
echo "   • Categorization Overview"
echo "   • Category Management"
echo "   • Uncategorized Activities"
echo "   • Reports"
echo "   • Music/Focus Enhancement"
echo "   • Scheduling"
echo "   • Settings"
echo ""

# Help function
show_help() {
  echo "Usage: $0 [options]"
  echo ""
  echo "Options:"
  echo "  -h, --help     Show this help message"
  echo "  -v, --verbose  Show verbose output during build and test"
  echo ""
  echo "Examples:"
  echo "  $0                    # Generate all screenshots with default settings"
  echo "  $0 --verbose          # Generate with verbose output"
  echo ""
}

# Parse command line arguments
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_help
      exit 0
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    --skip-build)
      echo "❌ The --skip-build option is no longer supported. Screenshots must run against the latest packaged build."
      exit 1
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Ensure we're in the project root
cd "$(dirname "$0")/../.." || exit

# Check for .env file and load environment variables
if [ -f ".env" ]; then
  echo "📚 Loading environment variables from .env file..."
  set -a
  source .env
  set +a
  echo "✅ Environment variables loaded successfully!"
else
  echo "⚠️ No .env file found. Using default environment variables."
fi

# Always build the app first so screenshots reflect the latest UI
echo "📦 Building the app..."
if [ "$VERBOSE" = true ]; then
  DEBUG=electron-forge:* npm run package
else
  npm run package > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
  else
    echo "❌ Build failed. Please check the build output."
    exit 1
  fi
fi

# Run the screenshot tests
echo "📸 Taking screenshots of all pages..."
if [ "$VERBOSE" = true ]; then
  npx playwright test src/tests/e2e/feature-screenshots.spec.ts
else
  npx playwright test src/tests/e2e/feature-screenshots.spec.ts --reporter=line
fi

# Check if screenshots were generated
if [ -d "./screenshots" ]; then
  echo "✅ Screenshots generated successfully in the 'screenshots' directory!"
  echo ""
  echo "📊 Generated screenshots:"
  find ./screenshots -name "*.png" -exec basename {} \; | sort
  echo ""
  echo "📈 Total screenshot count: $(find ./screenshots -name "*.png" | wc -l | tr -d ' ')"

  # Determine landing page repo path
  DEFAULT_WEB_PATH="../learnify-tube-web/public/screenshots"
  FALLBACK_WEB_PATH="../learnifytube-web/public/screenshots"
  TARGET_WEB_PATH="${LANDING_PAGE_SCREENS_DIR:-$DEFAULT_WEB_PATH}"

  # If the default path doesn't exist and a fallback does, switch to fallback
  if [ ! -d "$(dirname "$TARGET_WEB_PATH")" ]; then
    if [ "$TARGET_WEB_PATH" = "$DEFAULT_WEB_PATH" ] && [ -d "$(dirname "$FALLBACK_WEB_PATH")" ]; then
      TARGET_WEB_PATH="$FALLBACK_WEB_PATH"
    fi
  fi

  if [ -d "$(dirname "$TARGET_WEB_PATH")" ]; then
    echo "🚚 Moving screenshots to ${TARGET_WEB_PATH}..."

    mkdir -p "$TARGET_WEB_PATH"
    rm -rf "${TARGET_WEB_PATH}/"*
    cp -R ./screenshots/* "$TARGET_WEB_PATH/"

    if [ $? -eq 0 ]; then
      echo "✅ Screenshots successfully moved to ${TARGET_WEB_PATH}/"
      ls -la "$TARGET_WEB_PATH"
    else
      echo "❌ Failed to move screenshots. Please check permissions for ${TARGET_WEB_PATH}."
    fi
  else
    echo "⚠️ Could not locate landing page repo automatically."
    echo "   - Set LANDING_PAGE_SCREENS_DIR to the desired destination (e.g. /path/to/web/public/screenshots)."
    echo "   - Or ensure ../learnify-tube-web/ (or ../learnifytube-web/) exists relative to this repo."
  fi
else
  echo "❌ Failed to generate screenshots. Please check the test output for errors."
fi

echo "Done! 🎉"
