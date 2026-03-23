#!/bin/bash
echo ""
echo "============================================"
echo "   HANDLR AI — macOS Installer"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed!"
    echo ""
    echo "Install with Homebrew:"
    echo "  brew install node"
    echo ""
    echo "Or download from: https://nodejs.org"
    exit 1
fi

echo "Found Node.js: $(node -v)"

# Check Chrome
if [ -d "/Applications/Google Chrome.app" ]; then
    echo "Found Chrome: /Applications/Google Chrome.app"
else
    echo ""
    echo "WARNING: Google Chrome not found!"
    echo "Browser automation requires Chrome."
    echo "Install from: https://google.com/chrome"
    echo ""
fi

# Run setup
echo ""
echo "Starting setup wizard..."
echo ""
node setup.js
