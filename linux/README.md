# WaifuX Linux

This directory contains the Electron Linux desktop app for WaifuX. It opens in
its own application window and uses a local Node.js API server for data sources,
downloads, settings, and wallpaper actions.

## Features

- Original-style WaifuX shell: home, wallpaper explore, anime explore,
  media/dynamic wallpaper, library, detail sheets, and settings.
- Wallhaven search plus 4KWallpapers fallback.
- MotionBGs media feed and download parsing.
- Bangumi anime trending/search/detail, with a video-source extraction helper.
- Steam Workshop browse/detail; downloads use the user's own Linux SteamCMD.
- Static wallpaper application through common Linux desktop tools.
- Dynamic wallpaper dependency checks for `mpvpaper` or X11 `mpv` + `xwinwrap`.

Downloads are stored under the user's Pictures directory:

```text
~/Pictures/WaifuX
```

The app uses `xdg-user-dir PICTURES` when available, so localized systems use
the configured pictures directory. State is stored in `~/.local/share/WaifuX`.

## Requirements

- Node.js 20+
- npm
- Static wallpaper support:
  - Deepin/GNOME/Cinnamon/MATE: `gsettings`
  - KDE Plasma: `plasma-apply-wallpaperimage`
  - XFCE: `xfconf-query`
  - Sway/Wayland: `swaymsg` or `swww`
  - X11 fallback: `feh`
- Recommended for dynamic video wallpapers: `ffmpeg`, `mpv`, and either
  `mpvpaper` or X11 `xwinwrap`.
- On deepin/DDE X11, WaifuX prefers the native DDE video wallpaper plugin.
  The plugin also needs the `libmpv.so` compatibility link, usually provided
  by the `libmpv-dev` package.
- Optional Steam Workshop download: a user-configured Linux SteamCMD path.
- Optional Wallpaper Engine Scene/Web: a user-configured `linux-wallpaperengine`
  or compatible renderer path.

## Run

From the repository root:

```bash
./scripts/run-linux.sh
```

Or directly:

```bash
cd linux
npm install
npm start
```

For API-only debugging:

```bash
node linux/waifux-linux.js --port 40900
```

## Package

Build an installable Electron Debian package from the repository root:

```bash
./scripts/package-linux.sh
```

The script writes:

```text
dist/waifux-linux_<version>_amd64.deb
dist/waifux-linux-<version>-amd64/
dist/waifux-linux-<version>-amd64.tar.gz
```

Share the `.tar.gz` bundle with other users. They can extract it and run:

```bash
./install.sh
```

Manual app install:

```bash
sudo apt install ./dist/waifux-linux_<version>_amd64.deb
```

On deepin/DDE X11, native video wallpaper under desktop icons also needs the
`waifux-dde-video-wallpaper-plugin_<plugin-version>_amd64.deb` package from
the release bundle.

After installation, launch `WaifuX` from the application menu or run
`waifux-linux` from a terminal. It opens its own app window, not an external
browser tab.
