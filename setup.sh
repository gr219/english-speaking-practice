#!/bin/bash
# Setup script to download required dependencies before building with Docker
# Run this script once before `docker compose up --build`

set -e

VOSK_VERSION="v0.3.45"
MODEL_URL="https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"

echo "=== Setting up Speech dependencies ==="

# 1. Download libvosk.so
echo "[1/2] Downloading libvosk shared library..."
mkdir -p deps
if [ ! -f deps/libvosk.so ]; then
  curl -L "https://github.com/alphacep/vosk-api/releases/download/${VOSK_VERSION}/vosk-linux-x86_64-${VOSK_VERSION#v}.zip" -o /tmp/vosk-linux.zip
  unzip -o /tmp/vosk-linux.zip -d /tmp/vosk-linux
  cp /tmp/vosk-linux/vosk-linux-x86_64-${VOSK_VERSION#v}/libvosk.so deps/libvosk.so
  rm -rf /tmp/vosk-linux /tmp/vosk-linux.zip
  echo "  -> deps/libvosk.so downloaded"
else
  echo "  -> deps/libvosk.so already exists, skipping"
fi

# 2. Download Vosk model
echo "[2/2] Downloading Vosk English model (small)..."
if [ ! -d model ]; then
  curl -L "$MODEL_URL" -o /tmp/vosk-model.zip
  unzip -o /tmp/vosk-model.zip -d /tmp/vosk-model
  mv /tmp/vosk-model/vosk-model-small-en-us-0.15 model
  rm -rf /tmp/vosk-model /tmp/vosk-model.zip
  echo "  -> model/ directory created"
else
  echo "  -> model/ directory already exists, skipping"
fi

echo ""
echo "=== Setup complete! ==="
echo "Run: docker compose up --build"
