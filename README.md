# WaifuX Linux

WaifuX Linux 是一个 Electron 桌面应用，使用本地 Node.js API 提供壁纸搜索、动态壁纸、动漫资料、本地资源库和 Linux 桌面设置能力。

下载内容默认保存到用户图片目录下的 `WaifuX` 文件夹，例如：

```text
~/Pictures/WaifuX
```

应用状态保存到 `~/.local/share/WaifuX`，缓存保存到 `~/.cache/WaifuX`。

## 功能

- Wallhaven 与 4KWallpapers 壁纸搜索。
- MotionBGs 动态壁纸下载和应用。
- Bangumi 动漫趋势、搜索和详情。
- Steam Workshop 浏览和下载，使用用户自行配置的 Linux SteamCMD。
- 本地壁纸、媒体和 Workshop 内容库。
- Linux 静态壁纸设置。
- Linux 动态壁纸依赖检查和自动安装辅助。

## 环境要求

- Node.js 20+
- npm
- 静态壁纸工具：
  - Deepin/GNOME/Cinnamon/MATE: `gsettings`
  - KDE Plasma: `plasma-apply-wallpaperimage`
  - XFCE: `xfconf-query`
  - Sway/Wayland: `swaymsg` 或 `swww`
  - X11 fallback: `feh`
- 动态视频壁纸建议安装 `ffmpeg`、`mpv`，并按桌面环境安装：
  - Wayland: `mpvpaper`
  - X11: `xwinwrap`
  - deepin/DDE X11: deepin 原生视频壁纸插件和 `libmpv-dev`

## 运行

从仓库根目录执行：

```bash
./scripts/run-linux.sh
```

或直接进入 Linux 应用目录：

```bash
cd linux
npm install
npm start
```

## 打包

生成 Debian 安装包：

```bash
./scripts/package-linux.sh
```

构建产物会写入：

```text
dist/waifux-linux_<version>_amd64.deb
dist/waifux-linux-<version>-amd64/
dist/waifux-linux-<version>-amd64.tar.gz
```

发给别人使用时，推荐发送 `dist/waifux-linux-<version>-amd64.tar.gz`。对方解压后执行：

```bash
./install.sh
```

手动安装主程序：

```bash
sudo apt install ./dist/waifux-linux_<version>_amd64.deb
```

deepin/DDE X11 用户要让视频动态壁纸显示在桌面图标后方，还需要发布目录里的：

```text
waifux-dde-video-wallpaper-plugin_<plugin-version>_amd64.deb
```

## 发布说明

- [WaifuX Linux v38.0.94 发布说明](docs/release-v38.0.94.md)
- [安装说明截图](docs/screenshots/waifux-linux-38.0.94-install-guide.png)

## 说明

- Steam Workshop 下载需要在设置里配置自己的 Linux SteamCMD 路径。
- Wallpaper Engine Scene/Web 需要配置 `linux-wallpaperengine` 或兼容 renderer。
- WaifuX 不内置或绕过 Steam、Wallpaper Engine 或任何第三方内容授权。

## 许可证

本项目基于 [GNU General Public License v3.0](LICENSE) 开源。
