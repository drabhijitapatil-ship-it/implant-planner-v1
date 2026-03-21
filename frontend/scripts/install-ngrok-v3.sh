#!/bin/bash
# Install ngrok v3 to replace the deprecated v2 binary bundled with @expo/ngrok-bin
# This fixes ERR_NGROK_3200 issues caused by ngrok v2 server deprecation

set -e

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) NGROK_ARCH="amd64" ;;
  aarch64|arm64) NGROK_ARCH="arm64" ;;
  armv7l|armhf) NGROK_ARCH="arm" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "Installing ngrok v3 for $NGROK_ARCH..."

# Download ngrok v3
wget -q "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-${NGROK_ARCH}.tgz" -O /tmp/ngrok-v3.tgz

# Install globally
tar xzf /tmp/ngrok-v3.tgz -C /usr/local/bin 2>/dev/null || true
rm -f /tmp/ngrok-v3.tgz

# Replace the bundled v2 binary in @expo/ngrok-bin with v3
for bin_dir in node_modules/@expo/ngrok-bin-linux-*/; do
  if [ -f "${bin_dir}ngrok" ]; then
    cp /usr/local/bin/ngrok "${bin_dir}ngrok"
    echo "Replaced ${bin_dir}ngrok with v3"
  fi
done

echo "ngrok v3 installed: $(ngrok version)"
