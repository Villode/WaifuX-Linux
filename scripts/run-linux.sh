#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINUX_DIR="$ROOT/linux"

if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js，无法启动 WaifuX Linux。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "WaifuX Linux 需要 Node.js 20+，当前版本是 $(node --version)。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "缺少 npm，无法启动 Electron 桌面应用。" >&2
  exit 1
fi

if [[ ! -d "$LINUX_DIR/node_modules" ]]; then
  pushd "$LINUX_DIR" >/dev/null
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  popd >/dev/null
fi

pushd "$LINUX_DIR" >/dev/null
unset ELECTRON_RUN_AS_NODE
exec npm start -- "$@"
