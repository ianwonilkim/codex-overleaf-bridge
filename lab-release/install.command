#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER_DIR="$SCRIPT_DIR/installer"
ARCHIVE_NAME="overleaf-approved-bridge-installer-20260909-r8.tar.gz"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/codex-overleaf-install.XXXXXX")"
trap 'rm -rf "$TEMP_ROOT"' EXIT

cd "$INSTALLER_DIR"
shasum -a 256 -c SHA256SUMS
tar -xzf "$ARCHIVE_NAME" -C "$TEMP_ROOT"

node "$TEMP_ROOT/overleaf-approved-bridge-installer-20260909-r8/scripts/install-approved-bridge-macos.mjs" "$@"

if open -Ra "Google Chrome" >/dev/null 2>&1; then
  open -a "Google Chrome" "chrome://extensions"
else
  echo "주의: Google Chrome을 찾지 못했습니다. Chrome 설치 후 chrome://extensions를 직접 여세요."
fi
open "$HOME/.codex-overleaf/approved-extension-v2.3.5"

echo
echo "설치 완료: Chrome에서 Developer mode → Load unpacked를 누르고 열린 확장 폴더를 선택하세요."
echo "그다음 Codex를 다시 시작하고 Overleaf 프로젝트에서 '이 프로젝트 연결해'라고 요청하세요."
