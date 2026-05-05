#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/build/linux-qt"
OUT_DIR="$ROOT/dist"
VERSION="$(sed -nE 's/^project\(WaifuXLinux VERSION ([^ )]+).*/\1/p' "$ROOT/linux/CMakeLists.txt" | head -n1)"
DDE_PLUGIN_VERSION="$(sed -nE 's/^constexpr auto DdePluginMinVersion = "([^"]+)";/\1/p' "$ROOT/linux/src/AppController.cpp" | head -n1)"
FINAL_DEB="$OUT_DIR/waifux-linux_${VERSION}_amd64.deb"
DDE_PLUGIN_DEB="$HOME/.cache/WaifuX/build/dde-file-manager-extensions/build/waifux-dde-video-wallpaper-plugin_${DDE_PLUGIN_VERSION}_amd64.deb"
RELEASE_DIR="$OUT_DIR/waifux-linux-${VERSION}-amd64"
BUNDLE_TAR="$OUT_DIR/waifux-linux-${VERSION}-amd64.tar.gz"

if [[ -z "$VERSION" || -z "$DDE_PLUGIN_VERSION" ]]; then
  echo "无法读取 WaifuX 或 DDE 插件版本号。" >&2
  exit 1
fi

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

mkdir -p "$OUT_DIR"
cmake -S "$ROOT/linux" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR" --parallel
cmake --build "$BUILD_DIR" --target package

rm -f "$OUT_DIR"/waifux-linux_*.deb "$OUT_DIR"/waifux-linux-*.deb
cp "$BUILD_DIR/waifux-linux_${VERSION}_amd64.deb" "$FINAL_DEB"
echo "已生成桌面应用安装包：$FINAL_DEB"

rm -rf "$RELEASE_DIR" "$BUNDLE_TAR"
mkdir -p "$RELEASE_DIR"
cp "$FINAL_DEB" "$RELEASE_DIR/"

if [[ -f "$DDE_PLUGIN_DEB" ]]; then
  cp "$DDE_PLUGIN_DEB" "$RELEASE_DIR/"
else
  echo "未找到 deepin/DDE 动态壁纸插件包：$DDE_PLUGIN_DEB" >&2
  echo "deepin 用户仍可按文档安装/构建 WaifuX DDE 视频壁纸插件。" >&2
fi

cat > "$RELEASE_DIR/install.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

HERE="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
APP_DEB="\$HERE/waifux-linux_${VERSION}_amd64.deb"
DDE_PLUGIN_DEB="\$HERE/waifux-dde-video-wallpaper-plugin_${DDE_PLUGIN_VERSION}_amd64.deb"

sudo apt-get install -y "\$APP_DEB"

desktop="\${XDG_CURRENT_DESKTOP:-} \${DESKTOP_SESSION:-}"
if [[ -f "\$DDE_PLUGIN_DEB" ]] && [[ "\${desktop,,}" == *dde* || "\${desktop,,}" == *deepin* || -x /usr/bin/dde-shell ]]; then
  sudo apt-get install -y "\$DDE_PLUGIN_DEB"
  systemctl --user restart dde-shell-plugin@org.deepin.ds.desktop.service || true
fi

echo "安装完成。可以从应用菜单启动 WaifuX，或在终端运行：waifux-linux"
EOF
chmod +x "$RELEASE_DIR/install.sh"

cat > "$RELEASE_DIR/README.txt" <<EOF
WaifuX Linux Qt/QML ${VERSION}

包含文件：
- waifux-linux_${VERSION}_amd64.deb
  WaifuX Linux Qt/QML 主程序。
- waifux-dde-video-wallpaper-plugin_${DDE_PLUGIN_VERSION}_amd64.deb
  deepin/DDE X11 原生视频壁纸插件补丁包。只有 deepin/DDE 用户需要。
- install.sh
  自动安装主程序；检测到 deepin/DDE 时会同时安装视频壁纸插件。

推荐安装：
  tar -xzf waifux-linux-${VERSION}-amd64.tar.gz
  cd waifux-linux-${VERSION}-amd64
  ./install.sh

说明：
- 本版本不包含 Electron、Node 前端、HTML 或 CSS UI。
- UI 使用 Qt Quick/QML；网络、下载、壁纸和动态壁纸逻辑由 C++/Qt 实现。
EOF

(cd "$RELEASE_DIR" && sha256sum *.deb install.sh README.txt > SHA256SUMS)
tar -C "$OUT_DIR" -czf "$BUNDLE_TAR" "$(basename "$RELEASE_DIR")"

echo "已生成发布目录：$RELEASE_DIR"
echo "已生成发布压缩包：$BUNDLE_TAR"
