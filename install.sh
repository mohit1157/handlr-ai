#!/bin/bash

echo ""
echo "  ┌────────────────────────────────────────┐"
echo "  │         JARVIS PI INSTALLER v4          │"
echo "  │    Full AI Assistant for Raspberry Pi    │"
echo "  └────────────────────────────────────────┘"
echo ""

# 1. System deps
echo "[1/5] Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq chromium 2>/dev/null || true
sudo npm install -g pm2 2>/dev/null || true
echo "  ✓ System deps"

# 2. Node deps
echo "[2/5] Installing Node.js dependencies..."
npm install
echo "  ✓ Node deps"

# 3. Config
echo "[3/5] Setting up configuration..."
if [ -f .env ]; then
  echo "  .env exists, skipping."
else
  read -p "  Telegram bot token: " BOT_TOKEN
  read -p "  Telegram chat ID (or 1 if unknown): " OWNER_ID
  read -p "  OpenAI API key: " API_KEY
  cat > .env << EOF
TELEGRAM_BOT_TOKEN=$BOT_TOKEN
TELEGRAM_OWNER_ID=$OWNER_ID
OPENAI_API_KEY=$API_KEY
MODEL=gpt-4o-mini
EOF
  echo "  ✓ .env created"
fi

# 4. Data dirs
echo "[4/5] Creating data directories..."
mkdir -p data/chat_history data/screenshots data/documents data/tasks data/backups
echo "  ✓ Data dirs"

# 5. PM2
echo "[5/5] Starting with PM2..."
pm2 delete jarvis 2>/dev/null || true
pm2 start index.js --name jarvis --restart-delay=10000
pm2 save
sudo env PATH=$PATH:/usr/bin $(which pm2) startup systemd -u $USER --hp $HOME 2>/dev/null || true
pm2 save

echo ""
echo "  ✅ Jarvis v4 is running!"
echo ""
echo "  Commands: pm2 logs jarvis | pm2 restart jarvis"
echo "  Telegram: /start /status /approve /model /help"
echo ""
