#!/bin/bash
# Pulse CLI - Binary Installation Script
# Usage: curl -fsSL https://yourdomain.com/install.sh | bash

set -e

VERSION="1.0.0"
REPO="gauravkr/emergent-assignment"
BINARY_NAME="pulse"
INSTALL_DIR="/usr/local/bin"

echo "🚀 Installing Pulse CLI..."

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Linux*)     PLATFORM="linux";;
  Darwin*)    PLATFORM="macos";;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="win";;
  *)
    echo "❌ Unsupported OS: $OS"
    echo "Please download manually from: https://github.com/$REPO/releases"
    exit 1
    ;;
esac

# Set binary name
if [ "$PLATFORM" = "win" ]; then
  BINARY="pulse-cli-win.exe"
  EXT=".exe"
else
  BINARY="pulse-cli-$PLATFORM"
  EXT=""
fi

# Download URL
DOWNLOAD_URL="https://github.com/$REPO/releases/download/v$VERSION/$BINARY"

echo "📦 Downloading Pulse CLI for $PLATFORM..."
echo "   URL: $DOWNLOAD_URL"

# Create temp directory
TMP_DIR=$(mktemp -d)
TMP_FILE="$TMP_DIR/$BINARY_NAME$EXT"

# Download
if command -v curl > /dev/null 2>&1; then
  curl -L -o "$TMP_FILE" "$DOWNLOAD_URL"
elif command -v wget > /dev/null 2>&1; then
  wget -O "$TMP_FILE" "$DOWNLOAD_URL"
else
  echo "❌ Neither curl nor wget found. Please install one of them."
  exit 1
fi

# Make executable
chmod +x "$TMP_FILE"

# Test the binary
echo "🧪 Testing binary..."
if ! "$TMP_FILE" --version > /dev/null 2>&1; then
  echo "⚠️  Warning: Binary test failed, but continuing installation..."
fi

# Install
echo "📥 Installing to $INSTALL_DIR..."
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP_FILE" "$INSTALL_DIR/$BINARY_NAME$EXT"
else
  echo "🔐 Root access required to install to $INSTALL_DIR"
  sudo mv "$TMP_FILE" "$INSTALL_DIR/$BINARY_NAME$EXT"
fi

# Cleanup
rm -rf "$TMP_DIR"

# Verify installation
if command -v pulse > /dev/null 2>&1; then
  echo "✅ Pulse CLI installed successfully!"
  echo ""
  echo "Usage:"
  echo "  pulse login       # Login to your account"
  echo "  pulse get-color   # Get your favorite color"
  echo "  pulse set-color   # Set your favorite color"
  echo "  pulse status      # Check login status"
  echo "  pulse --help      # Show all commands"
  echo ""
  echo "Get started: pulse login"
else
  echo "⚠️  Installation completed but 'pulse' command not found in PATH"
  echo "You may need to add $INSTALL_DIR to your PATH or restart your terminal"
fi
