#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINUX_DIR="$ROOT/linux"
OUT_DIR="$ROOT/dist"
ICON_SOURCE="$LINUX_DIR/icon.png"
VERSION="$(node -p "require('$LINUX_DIR/package.json').version")"
DDE_PLUGIN_VERSION="$(node -p "require('fs').readFileSync('$LINUX_DIR/waifux-linux.js', 'utf8').match(/DDE_VIDEO_PLUGIN_MIN_VERSION = '([^']+)'/)[1]")"
FINAL_DEB="$OUT_DIR/waifux-linux_${VERSION}_amd64.deb"
DDE_PLUGIN_DEB="$HOME/.cache/WaifuX/build/dde-file-manager-extensions/build/waifux-dde-video-wallpaper-plugin_${DDE_PLUGIN_VERSION}_amd64.deb"
RELEASE_DIR="$OUT_DIR/waifux-linux-${VERSION}-amd64"
BUNDLE_TAR="$OUT_DIR/waifux-linux-${VERSION}-amd64.tar.gz"

if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js，无法构建 Electron 应用。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "构建需要 Node.js 20+，当前版本是 $(node --version)。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "缺少 npm，无法安装 Electron 打包依赖。" >&2
  exit 1
fi

if [[ ! -f "$ICON_SOURCE" ]]; then
  echo "缺少应用图标：$ICON_SOURCE" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

pushd "$LINUX_DIR" >/dev/null
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run dist:deb
popd >/dev/null

rm -f "$OUT_DIR"/waifux-linux_*.deb "$OUT_DIR"/waifux-linux-*.deb
cp "$OUT_DIR/electron/waifux-linux-${VERSION}-amd64.deb" "$FINAL_DEB"

echo "已生成桌面应用安装包：$FINAL_DEB"

rm -rf "$RELEASE_DIR" "$BUNDLE_TAR"
mkdir -p "$RELEASE_DIR"
cp "$FINAL_DEB" "$RELEASE_DIR/"

if [[ -f "$DDE_PLUGIN_DEB" ]]; then
  cp "$DDE_PLUGIN_DEB" "$RELEASE_DIR/"
else
  echo "未找到 deepin/DDE 动态壁纸插件包：$DDE_PLUGIN_DEB" >&2
  echo "deepin 用户仍可在 WaifuX 设置页点击自动安装动态壁纸依赖来编译插件。" >&2
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
WaifuX Linux ${VERSION}

包含文件：
- waifux-linux_${VERSION}_amd64.deb
  WaifuX Linux 主程序。
- waifux-dde-video-wallpaper-plugin_${DDE_PLUGIN_VERSION}_amd64.deb
  deepin/DDE X11 原生视频壁纸插件补丁包。只有 deepin/DDE 用户需要。
- install.sh
  自动安装主程序；检测到 deepin/DDE 时会同时安装视频壁纸插件。

推荐安装：
  tar -xzf waifux-linux-${VERSION}-amd64.tar.gz
  cd waifux-linux-${VERSION}-amd64
  ./install.sh

手动安装：
  sudo apt-get install -y ./waifux-linux_${VERSION}_amd64.deb

deepin/DDE 动态壁纸还需要：
  sudo apt-get install -y ./waifux-dde-video-wallpaper-plugin_${DDE_PLUGIN_VERSION}_amd64.deb
  systemctl --user restart dde-shell-plugin@org.deepin.ds.desktop.service

说明：
- 普通静态壁纸、下载、资源库等功能只需要主程序。
- deepin/DDE 上要让视频壁纸位于桌面图标后方，需要安装插件包。
- 其他桌面环境不需要安装 deepin 插件，可在 WaifuX 设置页检查动态壁纸依赖。
EOF

(cd "$RELEASE_DIR" && sha256sum *.deb install.sh README.txt > SHA256SUMS)
tar -C "$OUT_DIR" -czf "$BUNDLE_TAR" "$(basename "$RELEASE_DIR")"

echo "已生成发布目录：$RELEASE_DIR"
echo "已生成发布压缩包：$BUNDLE_TAR"
