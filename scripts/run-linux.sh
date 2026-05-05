#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/build/linux-qt"

if ! command -v cmake >/dev/null 2>&1; then
  echo "缺少 CMake，无法构建 WaifuX Qt/QML。" >&2
  exit 1
fi

if ! command -v g++ >/dev/null 2>&1; then
  echo "缺少 g++，无法构建 WaifuX Qt/QML。" >&2
  exit 1
fi

if [[ ! -d /usr/include/x86_64-linux-gnu/qt6/QtQml || ! -d /usr/include/x86_64-linux-gnu/qt6/QtQuick ]]; then
  echo "缺少 Qt QML/Quick 开发包。请先安装：sudo apt-get install -y qt6-declarative-dev" >&2
  exit 1
fi

cmake -S "$ROOT/linux" -B "$BUILD_DIR"
cmake --build "$BUILD_DIR" --parallel
exec "$BUILD_DIR/waifux-linux" "$@"
