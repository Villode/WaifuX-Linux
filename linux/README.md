# WaifuX Linux Qt/QML

This directory contains the Linux-only Qt 6 / QML rewrite of WaifuX. The app no
longer uses Electron, Node frontend runtime, HTML, CSS, Tailwind, or a WebView.

## Features

- Qt Quick/QML interface with virtualized `GridView` and `ListView` pages.
- Wallhaven and 4KWallpapers wallpaper search, download, and Linux wallpaper application.
- MotionBGs media browsing and video download.
- Steam Workshop browsing and SteamCMD download.
- Bangumi anime trending/search.
- Local wallpaper, media, and Workshop library scanning.
- Static wallpaper support through common Linux desktop tools.
- Dynamic wallpaper support through deepin/DDE native video wallpaper, mpvpaper,
  or X11 xwinwrap + mpv.
- Dependency detection with a generated local install helper script.
- Existing settings remain compatible with:

```text
~/.local/share/WaifuX/linux-state.json
```

Downloads are stored under:

```text
~/Pictures/WaifuX
```

## Requirements

- CMake
- g++
- Qt 6 base development files
- Qt 6 declarative/QML development files
- Qt Quick runtime modules

On deepin/Debian-like systems:

```bash
sudo apt-get install -y cmake g++ qt6-base-dev qt6-declarative-dev \
  qml6-module-qtquick qml6-module-qtquick-controls qml6-module-qtquick-layouts \
  qml6-module-qtquick-window qml6-module-qtquick-dialogs
```

Optional runtime tools:

- Static wallpaper: `gsettings`, `plasma-apply-wallpaperimage`, `xfconf-query`,
  `swww`, or `feh`.
- Dynamic wallpaper: deepin/DDE native video wallpaper plugin, `mpvpaper`, or
  X11 `mpv` + `xwinwrap`.
- Steam Workshop: Linux `steamcmd`.

## Run

From the repository root:

```bash
./scripts/run-linux.sh
```

Manual build:

```bash
cmake -S linux -B build/linux-qt
cmake --build build/linux-qt --parallel
./build/linux-qt/waifux-linux
```

## Package

Build a Debian package and release bundle:

```bash
./scripts/package-linux.sh
```

The script writes:

```text
dist/waifux-linux_<version>_amd64.deb
dist/waifux-linux-<version>-amd64/
dist/waifux-linux-<version>-amd64.tar.gz
```

On deepin/DDE X11, native video wallpaper under desktop icons still needs the
`waifux-dde-video-wallpaper-plugin_<plugin-version>_amd64.deb` package from the
release bundle.
