#!/bin/sh
# Installs git-csm from the latest GitHub release.
#   curl -fsSL https://raw.githubusercontent.com/harshG775/git-scm/main/install.sh | sh
# Pin a version: GIT_CSM_VERSION=v0.1.0 sh install.sh
set -eu

REPO="harshG775/git-scm"
BIN="git-csm"

case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64 ;;
  x86_64|amd64)  ARCH=amd64 ;;
  *) echo "error: unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# Termux sets $PREFIX; elsewhere fall back to ~/.local/bin.
if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
  DEST="$PREFIX/bin"
else
  DEST="$HOME/.local/bin"
  mkdir -p "$DEST"
fi

if [ -n "${GIT_CSM_VERSION:-}" ]; then
  BASE="https://github.com/$REPO/releases/download/$GIT_CSM_VERSION"
else
  BASE="https://github.com/$REPO/releases/latest/download"
fi

if ! command -v git >/dev/null 2>&1; then
  if command -v pkg >/dev/null 2>&1; then
    echo "Installing git..."
    pkg install -y git
  else
    echo "warning: git is not installed; git-csm needs it at runtime" >&2
  fi
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ASSET="$BIN-linux-$ARCH"
echo "Downloading $ASSET..."
curl -fsSL "$BASE/$ASSET" -o "$TMP/$ASSET"
curl -fsSL "$BASE/checksums.txt" -o "$TMP/checksums.txt"

# Verify against the published checksum before installing.
WANT="$(grep " $ASSET\$" "$TMP/checksums.txt" | cut -d' ' -f1)"
GOT="$(sha256sum "$TMP/$ASSET" | cut -d' ' -f1)"
if [ -z "$WANT" ] || [ "$WANT" != "$GOT" ]; then
  echo "error: checksum mismatch for $ASSET" >&2
  exit 1
fi

chmod +x "$TMP/$ASSET"
mv "$TMP/$ASSET" "$DEST/$BIN"

echo "Installed $DEST/$BIN"
case ":$PATH:" in
  *":$DEST:"*) ;;
  *) echo "note: add $DEST to your PATH" ;;
esac
echo "Run: $BIN   (then open http://localhost:8080)"
