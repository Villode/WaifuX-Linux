# Contributing to WaifuX Linux

感谢你愿意参与 WaifuX Linux。

## 报告问题

提交 bug 时请尽量包含：

- Linux 发行版和版本。
- 桌面环境，例如 deepin/DDE、GNOME、KDE、XFCE、Sway。
- 会话类型：X11 或 Wayland。
- 复现步骤。
- 终端输出或设置页依赖检查结果。

动态壁纸问题还请说明是否安装了 `mpv`、`ffmpeg`、`mpvpaper`、`xwinwrap`，deepin/DDE 下是否安装了原生视频壁纸插件和 `libmpv-dev`。

## 本地开发

```bash
git clone https://github.com/yourusername/WaifuX.git
cd WaifuX
./scripts/run-linux.sh
```

也可以直接进入应用目录：

```bash
cd linux
npm install
npm start
```

## 打包验证

```bash
./scripts/package-linux.sh
```

生成的 Debian 包会写入 `dist/`。

## 代码风格

- 保持改动聚焦，优先沿用现有 Electron/Node 实现方式。
- 不提交 `node_modules/`、`dist/` 或本地配置。
- 改动依赖检查、下载、壁纸设置逻辑时，请补充实际桌面环境下的验证说明。
- UI 文案默认使用简体中文。

## Pull Request

1. 从 `main` 创建分支。
2. 保持提交说明清晰。
3. 更新受影响的 README 或运行说明。
4. 在 PR 中说明已验证的命令和桌面环境。
