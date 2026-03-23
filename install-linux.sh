#!/bin/bash
echo ""
echo "============================================"
echo "   HANDLR AI — Linux Installer"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed! Installing..."
    echo ""
    # Try NodeSource
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
        sudo dnf install -y nodejs
    else
        echo "Please install Node.js manually: https://nodejs.org"
        exit 1
    fi
fi

echo "Found Node.js: $(node -v)"

# Check Chromium/Chrome
CHROME_PATH=""
for p in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome /usr/bin/google-chrome-stable; do
    if [ -f "$p" ]; then
        CHROME_PATH=$p
        break
    fi
done

if [ -z "$CHROME_PATH" ]; then
    echo ""
    echo "Installing Chromium..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y chromium || sudo apt-get install -y chromium-browser
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y chromium
    fi
else
    echo "Found browser: $CHROME_PATH"
fi

# Run setup
echo ""
echo "Starting setup wizard..."
echo ""
node setup.js
