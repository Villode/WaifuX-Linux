#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile, execFileSync } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const DEFAULT_PORT = 40888;
const HOST = '127.0.0.1';
const APP_DIR = path.join(os.homedir(), '.local', 'share', 'WaifuX');
const CACHE_DIR = path.join(os.homedir(), '.cache', 'WaifuX');
const STATE_PATH = path.join(APP_DIR, 'linux-state.json');
const STATIC_DIR = path.join(__dirname, 'app');
const USER_AGENT = 'WaifuX-Linux/38.0 (+https://github.com/jipika/WaifuX)';
const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const WALLHAVEN_API = 'https://wallhaven.cc/api/v1';
const FOUR_K_BASE = 'https://4kwallpapers.com';
const MOTIONBGS_BASE = 'https://motionbgs.com';
const BANGUMI_API = 'https://api.bgm.tv';
const STEAM_WORKSHOP_BASE = 'https://steamcommunity.com';
const WALLPAPER_ENGINE_APP_ID = '431960';

let liveWallpaperProcess = null;
let deepinDesktopRepairTimer = null;
const memoryItems = new Map();

function resolvePicturesDir() {
  try {
    const resolved = execFileSync('xdg-user-dir', ['PICTURES'], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (resolved && path.isAbsolute(resolved)) {
      return resolved;
    }
  } catch {
    // Fall back to the common XDG default below.
  }

  return path.join(os.homedir(), 'Pictures');
}

function resolveXdgUserDir(type, fallbackName) {
  try {
    const resolved = execFileSync('xdg-user-dir', [type], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (resolved && path.isAbsolute(resolved)) {
      return resolved;
    }
  } catch {
    // Fall back to the common XDG default below.
  }

  return path.join(os.homedir(), fallbackName);
}

const PICTURES_DIR = resolvePicturesDir();
const VIDEOS_DIR = resolveXdgUserDir('VIDEOS', 'Videos');
const DOWNLOAD_ROOT = path.join(PICTURES_DIR, 'WaifuX');
const WALLPAPER_DIR = path.join(DOWNLOAD_ROOT, 'Wallpapers');
const MEDIA_DIR = path.join(DOWNLOAD_ROOT, 'Media');
const WORKSHOP_DIR = path.join(DOWNLOAD_ROOT, 'Workshop');
const IMPORT_DIR = path.join(DOWNLOAD_ROOT, 'Imported');
const DDE_VIDEO_WALLPAPER_DIR = path.join(VIDEOS_DIR, 'video-wallpaper');
const DDE_VIDEO_DCONFIG_APP = 'org.deepin.dde.file-manager';
const DDE_VIDEO_DCONFIG_RESOURCE = 'org.deepin.dde.file-manager.desktop.videowallpaper';
const DDE_VIDEO_DCONFIG_KEY = 'enable';
const DDE_VIDEO_PLUGIN_PATHS = [
  '/usr/lib/x86_64-linux-gnu/dde-file-manager/plugins/desktop-edge/libddplugin-videowallpaper.so',
  '/usr/lib/x86_64-linux-gnu/dde-file-manager/plugins/desktop-core/libddplugin-videowallpaper.so',
];
const DDE_VIDEO_PLUGIN_PACKAGE = 'waifux-dde-video-wallpaper-plugin';
const DDE_VIDEO_PLUGIN_MIN_VERSION = '1.0.11';
const INSTALLER_DIR = path.join(CACHE_DIR, 'installers');
const DEP_INSTALL_LOG = path.join(CACHE_DIR, 'dependency-install.log');
const LIVE_WALLPAPER_LOG = path.join(CACHE_DIR, 'live-wallpaper.log');
const XWINWRAP_REPO = 'https://github.com/mmhobi7/xwinwrap.git';
const DDE_FILE_MANAGER_EXTENSIONS_REPO = 'https://github.com/linuxdeepin/dde-file-manager-extensions.git';

function parseArgs(argv) {
  const out = { port: DEFAULT_PORT, open: false };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--open') {
      out.open = true;
    } else if (arg === '--no-open') {
      out.open = false;
    } else if (arg === '--port' && argv[i + 1]) {
      out.port = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--port=')) {
      out.port = Number(arg.slice('--port='.length));
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }

  if (!Number.isInteger(out.port) || out.port < 1024 || out.port > 65535) {
    out.port = DEFAULT_PORT;
  }

  return out;
}

function printHelp() {
  console.log(`WaifuX Linux

用法:
  node linux/waifux-linux.js [--port 40888] [--open]

这是 WaifuX Linux 桌面应用的本地 API 后端。正常使用请运行 Electron：
  cd linux && npm start

所有下载内容会保存到:
  ${DOWNLOAD_ROOT}
`);
}

async function ensureDirs() {
  await fs.mkdir(APP_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(DOWNLOAD_ROOT, { recursive: true });
  await fs.mkdir(WALLPAPER_DIR, { recursive: true });
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.mkdir(WORKSHOP_DIR, { recursive: true });
  await fs.mkdir(IMPORT_DIR, { recursive: true });
  await fs.mkdir(DDE_VIDEO_WALLPAPER_DIR, { recursive: true });
}

function packageVersion() {
  try {
    return require('./package.json').version;
  } catch {
    return '0.0.0';
  }
}

function defaultState() {
  return {
    language: 'zh-CN',
    grainTexture: true,
    wallpaperSource: 'wallhaven',
    wallpaperApiKey: '',
    steamcmdPath: '',
    wallpaperEngineRendererPath: '',
    liveWallpaperMode: 'auto',
    favorites: { wallpapers: [], media: [], anime: [] },
    progress: {},
    lastWallpaper: null,
    lastLiveWallpaper: null,
  };
}

async function readState() {
  await ensureDirs();
  try {
    const data = JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
    return mergeState(defaultState(), data);
  } catch {
    return defaultState();
  }
}

function mergeState(base, patch) {
  const out = { ...base, ...patch };
  out.favorites = { ...base.favorites, ...(patch?.favorites || {}) };
  out.progress = { ...base.progress, ...(patch?.progress || {}) };
  return out;
}

async function writeState(next) {
  await ensureDirs();
  await fs.writeFile(STATE_PATH, JSON.stringify(next, null, 2));
}

async function patchState(patch) {
  const current = await readState();
  const next = mergeState(current, patch);
  await writeState(next);
  return next;
}

function publicSettings(state) {
  return {
    language: state.language,
    grainTexture: state.grainTexture,
    wallpaperSource: state.wallpaperSource,
    wallpaperApiKeyConfigured: Boolean(state.wallpaperApiKey),
    wallpaperApiKey: state.wallpaperApiKey ? '********' : '',
    steamcmdPath: state.steamcmdPath || '',
    wallpaperEngineRendererPath: state.wallpaperEngineRendererPath || '',
    liveWallpaperMode: state.liveWallpaperMode || 'auto',
  };
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function textResponse(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      throw new Error('请求内容过大。');
    }
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function commandExists(command) {
  if (!command) return false;
  if (path.isAbsolute(command)) {
    try {
      await fs.access(command, fssync.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await execFileAsync('which', [command], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

async function resolveCommand(command) {
  if (!command) return null;
  if (path.isAbsolute(command)) {
    return (await commandExists(command)) ? command : null;
  }
  try {
    const { stdout } = await execFileAsync('which', [command], { encoding: 'utf8', timeout: 1500 });
    const resolved = stdout.trim().split('\n')[0];
    return resolved || null;
  } catch {
    return null;
  }
}

async function findLdConfigLibrary(libraryPattern) {
  try {
    const { stdout } = await execFileAsync('ldconfig', ['-p'], { encoding: 'utf8', timeout: 1500 });
    const match = stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => libraryPattern.test(line));
    return match?.match(/=>\s+(.+)$/)?.[1] || '';
  } catch {
    return '';
  }
}

async function deepinLibMpvStatus() {
  const versionlessCandidates = [
    '/usr/lib/x86_64-linux-gnu/libmpv.so',
    '/lib/x86_64-linux-gnu/libmpv.so',
    '/usr/local/lib/libmpv.so',
    '/usr/lib64/libmpv.so',
    '/usr/lib/libmpv.so',
    '/lib64/libmpv.so',
    '/lib/libmpv.so',
  ];
  const versionlessPath = versionlessCandidates.find((candidate) => fssync.existsSync(candidate))
    || await findLdConfigLibrary(/^libmpv\.so\s/);
  const runtimePath = versionlessPath
    || await findLdConfigLibrary(/^libmpv\.so\.\d+\s/)
    || [
      '/usr/lib/x86_64-linux-gnu/libmpv.so.2',
      '/lib/x86_64-linux-gnu/libmpv.so.2',
      '/usr/lib64/libmpv.so.2',
      '/usr/lib/libmpv.so.2',
    ].find((candidate) => fssync.existsSync(candidate))
    || '';

  return {
    ok: Boolean(versionlessPath),
    versionlessPath,
    runtimePath,
    packageHint: 'libmpv-dev',
  };
}

function compareDottedVersions(left, right) {
  const a = String(left || '').split(/[.+:~-]/).map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right || '').split(/[.+:~-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
}

async function installedPackageVersion(packageName) {
  if (!(await commandExists('dpkg-query'))) return '';
  try {
    const { stdout } = await execFileAsync('dpkg-query', [
      '-W',
      '-f=${Version}',
      packageName,
    ], { encoding: 'utf8', timeout: 2000 });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function runCommand(command, args, options = {}) {
  await execFileAsync(command, args, { timeout: options.timeout || 12000 });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function fileUri(filePath) {
  const resolved = path.resolve(filePath);
  return `file://${resolved.split(path.sep).map(encodeURIComponent).join('/')}`;
}

async function gsettingsSchemaExists(schema) {
  try {
    const { stdout } = await execFileAsync('gsettings', ['list-schemas'], { timeout: 3000 });
    return stdout.split('\n').includes(schema);
  } catch {
    return false;
  }
}

async function tryGSettings(filePath) {
  if (!(await commandExists('gsettings'))) return false;

  const uri = fileUri(filePath);
  const desktop = `${process.env.XDG_CURRENT_DESKTOP || ''} ${process.env.DESKTOP_SESSION || ''}`.toLowerCase();
  const candidates = [];

  if (desktop.includes('cinnamon')) {
    candidates.push({ schema: 'org.cinnamon.desktop.background', key: 'picture-uri', value: uri });
  }
  if (desktop.includes('mate')) {
    candidates.push({ schema: 'org.mate.background', key: 'picture-filename', value: filePath });
  }
  if (desktop.includes('deepin') || desktop.includes('dde')) {
    candidates.push({ schema: 'com.deepin.wrap.gnome.desktop.background', key: 'picture-uri', value: uri });
  }

  candidates.push(
    { schema: 'org.gnome.desktop.background', key: 'picture-uri', value: uri },
    { schema: 'org.gnome.desktop.background', key: 'picture-uri-dark', value: uri },
    { schema: 'com.deepin.wrap.gnome.desktop.background', key: 'picture-uri', value: uri },
    { schema: 'org.cinnamon.desktop.background', key: 'picture-uri', value: uri },
    { schema: 'org.mate.background', key: 'picture-filename', value: filePath },
  );

  let applied = false;
  const seen = new Set();
  for (const item of candidates) {
    const id = `${item.schema}:${item.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!(await gsettingsSchemaExists(item.schema))) continue;

    try {
      await runCommand('gsettings', ['set', item.schema, item.key, item.value]);
      applied = true;
    } catch {
      // Keep trying other schemas.
    }
  }
  return applied;
}

async function tryKde(filePath) {
  if (await commandExists('plasma-apply-wallpaperimage')) {
    await runCommand('plasma-apply-wallpaperimage', [filePath]);
    return true;
  }
  return false;
}

async function tryXfce(filePath) {
  if (!(await commandExists('xfconf-query'))) return false;

  let stdout = '';
  try {
    const result = await execFileAsync('xfconf-query', ['-c', 'xfce4-desktop', '-l'], { timeout: 3000 });
    stdout = result.stdout;
  } catch {
    return false;
  }

  const properties = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('/last-image'));

  if (!properties.length) return false;

  let applied = false;
  for (const property of properties) {
    try {
      await runCommand('xfconf-query', ['-c', 'xfce4-desktop', '-p', property, '-s', filePath]);
      applied = true;
    } catch {
      // Continue with other monitors/workspaces.
    }
  }
  return applied;
}

async function trySway(filePath) {
  if (process.env.SWAYSOCK && (await commandExists('swaymsg'))) {
    await runCommand('swaymsg', ['output', '*', 'bg', filePath, 'fill']);
    return true;
  }
  if (await commandExists('swww')) {
    try {
      await runCommand('swww', ['query'], { timeout: 2500 });
    } catch {
      try {
        await runCommand('swww', ['init'], { timeout: 2500 });
      } catch {
        // swww-daemon may already be managed outside this process.
      }
    }
    await runCommand('swww', ['img', filePath]);
    return true;
  }
  return false;
}

async function tryFeh(filePath) {
  if (process.env.DISPLAY && (await commandExists('feh'))) {
    await runCommand('feh', ['--bg-fill', filePath]);
    return true;
  }
  return false;
}

async function tryDeepinAppearance(filePath) {
  const desktop = `${process.env.XDG_CURRENT_DESKTOP || ''} ${process.env.DESKTOP_SESSION || ''}`.toLowerCase();
  if (!desktop.includes('dde') && !desktop.includes('deepin')) return false;
  if (!(await commandExists('busctl'))) return false;

  await runCommand('busctl', [
    '--user',
    'call',
    'org.deepin.dde.Appearance1',
    '/org/deepin/dde/Appearance1',
    'org.deepin.dde.Appearance1',
    'SetCurrentWorkspaceBackground',
    's',
    fileUri(filePath),
  ], { timeout: 3000 });
  return true;
}

async function setLinuxWallpaper(filePath) {
  const absolutePath = path.resolve(filePath);
  const attempts = [
    ['Deepin Appearance', () => tryDeepinAppearance(absolutePath)],
    ['KDE Plasma', () => tryKde(absolutePath)],
    ['GNOME/Cinnamon/MATE/Deepin', () => tryGSettings(absolutePath)],
    ['XFCE', () => tryXfce(absolutePath)],
    ['Sway/swww', () => trySway(absolutePath)],
    ['feh', () => tryFeh(absolutePath)],
  ];

  const errors = [];
  for (const [name, attempt] of attempts) {
    try {
      if (await attempt()) return { appliedBy: name };
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }

  throw new Error([
    '未能通过当前已支持的 Linux 工具设置壁纸。',
    '请安装或启用以下工具之一：gsettings（GNOME/Cinnamon/MATE/Deepin）、plasma-apply-wallpaperimage（KDE）、xfconf-query（XFCE）、swaymsg/swww（Wayland）或 feh（X11）。',
    ...errors,
  ].join('\n'));
}

async function stopLiveWallpaper() {
  if (deepinDesktopRepairTimer) {
    clearTimeout(deepinDesktopRepairTimer);
    deepinDesktopRepairTimer = null;
  }
  if (isDeepinDdeX11()) {
    await setDeepinNativeVideoWallpaperEnabled(false).catch(() => {});
    await fixDeepinDesktopWindowHints().catch(() => {});
  }
  if (liveWallpaperProcess && !liveWallpaperProcess.killed) {
    try {
      process.kill(-liveWallpaperProcess.pid, 'SIGTERM');
    } catch {
      liveWallpaperProcess.kill('SIGTERM');
    }
  }
  liveWallpaperProcess = null;
  await stopOrphanedLiveWallpaperProcesses();
}

async function stopOrphanedLiveWallpaperProcesses() {
  let output = '';
  try {
    const result = await execFileAsync('ps', ['-eo', 'pid=,pgid=,args='], { encoding: 'utf8', timeout: 2000 });
    output = result.stdout || '';
  } catch {
    return;
  }

  const groups = new Set();
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const pgid = Number(match[2]);
    const args = match[3] || '';
    if (pid === process.pid || !Number.isInteger(pgid)) continue;
    if ((args.includes('xwinwrap') && args.includes('waifux-mpv'))
      || (args.includes('mpv --wid=') && args.includes(`${DOWNLOAD_ROOT}/Media`))) {
      groups.add(pgid);
    }
  }

  for (const pgid of groups) {
    try {
      process.kill(-pgid, 'SIGTERM');
    } catch {
      // The process may already have exited.
    }
  }
}

function isDeepinDdeX11() {
  const desktop = `${process.env.XDG_CURRENT_DESKTOP || ''} ${process.env.DESKTOP_SESSION || ''}`.toLowerCase();
  return Boolean(process.env.DISPLAY)
    && !process.env.WAYLAND_DISPLAY
    && (desktop.includes('dde') || desktop.includes('deepin'));
}

function deepinLiveWallpaperMessage() {
  return 'deepin/DDE 的桌面图标和背景在同一个桌面窗口里，xwinwrap/mpv 会遮挡桌面图标。WaifuX 在自动模式下会使用 DDE 原生视频壁纸插件。';
}

function deepinNativeVideoWallpaperPluginPath() {
  return DDE_VIDEO_PLUGIN_PATHS.find((item) => fssync.existsSync(item)) || '';
}

async function deepinNativeVideoWallpaperStatus() {
  const pluginPath = deepinNativeVideoWallpaperPluginPath();
  const libMpv = await deepinLibMpvStatus();
  const packageVersion = await installedPackageVersion(DDE_VIDEO_PLUGIN_PACKAGE);
  const lifecyclePatchOk = packageVersion
    ? compareDottedVersions(packageVersion, DDE_VIDEO_PLUGIN_MIN_VERSION) >= 0
    : false;
  const hasDconfigCli = await commandExists('dde-dconfig');
  let configReadable = false;
  let enabled = false;

  if (hasDconfigCli) {
    try {
      const { stdout } = await execFileAsync('dde-dconfig', [
        'get',
        '-a',
        DDE_VIDEO_DCONFIG_APP,
        '-r',
        DDE_VIDEO_DCONFIG_RESOURCE,
        '-k',
        DDE_VIDEO_DCONFIG_KEY,
      ], { encoding: 'utf8', timeout: 3000 });
      configReadable = true;
      enabled = stdout.trim() === 'true';
    } catch {
      configReadable = false;
    }
  }

  let issue = '';
  if (!pluginPath) issue = '未找到 deepin 原生视频壁纸插件。';
  else if (!configReadable) issue = '无法读取 deepin 视频壁纸 DConfig 配置。';
  else if (!libMpv.ok) issue = '缺少 libmpv.so 兼容链接；通常安装 libmpv-dev 后重启 DDE 桌面插件即可。';
  else if (!lifecyclePatchOk) issue = `需要安装 WaifuX DDE 视频壁纸插件 ${DDE_VIDEO_PLUGIN_MIN_VERSION}+ 补丁，否则可能出现单独的“桌面”窗口、视频黑屏或窗口尺寸不适配屏幕。`;

  return {
    ok: Boolean(pluginPath && configReadable && libMpv.ok && lifecyclePatchOk),
    pluginPath,
    configReadable,
    enabled,
    libMpv,
    packageName: DDE_VIDEO_PLUGIN_PACKAGE,
    packageVersion,
    requiredPackageVersion: DDE_VIDEO_PLUGIN_MIN_VERSION,
    lifecyclePatchOk,
    issue,
    sourceDir: DDE_VIDEO_WALLPAPER_DIR,
  };
}

async function setDeepinNativeVideoWallpaperEnabled(enabled) {
  if (!(await commandExists('dde-dconfig'))) {
    throw new Error('未找到 dde-dconfig，无法控制 deepin 原生视频壁纸开关。');
  }
  await runCommand('dde-dconfig', [
    'set',
    '-a',
    DDE_VIDEO_DCONFIG_APP,
    '-r',
    DDE_VIDEO_DCONFIG_RESOURCE,
    '-k',
    DDE_VIDEO_DCONFIG_KEY,
    '-v',
    enabled ? 'true' : 'false',
  ], { timeout: 5000 });
}

async function restartDeepinDesktopPlugin() {
  if (await commandExists('systemctl')) {
    try {
      await runCommand('systemctl', ['--user', 'restart', 'dde-shell-plugin@org.deepin.ds.desktop.service'], { timeout: 12000 });
      return true;
    } catch {
      // The plugin can still react to DConfig changes if already loaded.
    }
  }
  return false;
}

async function deepinDesktopWindowIds() {
  if (!(await commandExists('wmctrl'))) return [];
  try {
    const { stdout } = await execFileAsync('wmctrl', ['-l', '-x'], { encoding: 'utf8', timeout: 3000 });
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => (
        line.includes('dde-shell/desktop')
        || (line.includes('org.deepin.dde-shell') && /\s桌面$/.test(line))
      ))
      .map((line) => line.split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fixDeepinDesktopWindowHints() {
  if (!isDeepinDdeX11()) return;
  const ids = await deepinDesktopWindowIds();
  if (!ids.length) return;

  const hasXprop = await commandExists('xprop');
  const hasWmctrl = await commandExists('wmctrl');
  const hasXdotool = await commandExists('xdotool');
  for (const id of ids) {
    if (hasXprop) {
      await runCommand('xprop', ['-id', id, '-f', '_NET_WM_WINDOW_TYPE', '32a', '-set', '_NET_WM_WINDOW_TYPE', '_NET_WM_WINDOW_TYPE_DESKTOP'], { timeout: 2000 }).catch(() => {});
      await runCommand('xprop', ['-id', id, '-f', '_NET_WM_DESKTOP', '32c', '-set', '_NET_WM_DESKTOP', '0xffffffff'], { timeout: 2000 }).catch(() => {});
      await runCommand('xprop', ['-id', id, '-f', '_MOTIF_WM_HINTS', '32c', '-set', '_MOTIF_WM_HINTS', '0x2, 0x0, 0x0, 0x0, 0x0'], { timeout: 2000 }).catch(() => {});
      await runCommand('xprop', ['-id', id, '-f', '_DEEPIN_NO_TITLEBAR', '32c', '-set', '_DEEPIN_NO_TITLEBAR', '1'], { timeout: 2000 }).catch(() => {});
      await runCommand('xprop', ['-id', id, '-f', '_DEEPIN_FORCE_DECORATE', '32c', '-set', '_DEEPIN_FORCE_DECORATE', '0'], { timeout: 2000 }).catch(() => {});
    }
    if (hasXdotool) {
      await runCommand('xdotool', ['set_window', '--classname', 'dde-shell/desktop', '--class', 'org.deepin.dde-shell', id], { timeout: 2000 }).catch(() => {});
      await runCommand('xdotool', ['set_desktop_for_window', id, '0xffffffff'], { timeout: 2000 }).catch(() => {});
      await runCommand('xdotool', ['windowlower', id], { timeout: 2000 }).catch(() => {});
    }
    if (hasWmctrl) {
      await runCommand('wmctrl', ['-i', '-r', id, '-b', 'remove,maximized_vert,maximized_horz'], { timeout: 2000 }).catch(() => {});
      await runCommand('wmctrl', ['-i', '-r', id, '-t', '-1'], { timeout: 2000 }).catch(() => {});
      for (const state of ['fullscreen', 'below', 'sticky', 'skip_taskbar', 'skip_pager']) {
        await runCommand('wmctrl', ['-i', '-r', id, '-b', `add,${state}`], { timeout: 2000 }).catch(() => {});
      }
    }
    if (hasXprop) {
      await runCommand('xprop', ['-id', id, '-f', '_NET_WM_STATE', '32a', '-set', '_NET_WM_STATE', '_NET_WM_STATE_FULLSCREEN, _NET_WM_STATE_BELOW, _NET_WM_STATE_STICKY, _NET_WM_STATE_SKIP_TASKBAR, _NET_WM_STATE_SKIP_PAGER, _NET_WM_STATE_SKIP_SWITCHER, _KDE_NET_WM_STATE_SKIP_SWITCHER'], { timeout: 2000 }).catch(() => {});
      await runCommand('xprop', ['-id', id, '-f', '_NET_WM_ALLOWED_ACTIONS', '32a', '-set', '_NET_WM_ALLOWED_ACTIONS', '_NET_WM_ACTION_CHANGE_DESKTOP'], { timeout: 2000 }).catch(() => {});
    }
    if (hasWmctrl) {
      for (const state of ['fullscreen', 'below', 'sticky', 'skip_taskbar', 'skip_pager']) {
        await runCommand('wmctrl', ['-i', '-r', id, '-b', `add,${state}`], { timeout: 2000 }).catch(() => {});
      }
    }
  }
}

function scheduleDeepinDesktopWindowHintRepair(durationMs = 45000) {
  if (!isDeepinDdeX11()) return;
  if (deepinDesktopRepairTimer) {
    clearTimeout(deepinDesktopRepairTimer);
    deepinDesktopRepairTimer = null;
  }

  const deadline = durationMs > 0 ? Date.now() + durationMs : Number.POSITIVE_INFINITY;
  const tick = async () => {
    await fixDeepinDesktopWindowHints().catch(() => {});
    if (Date.now() >= deadline) {
      deepinDesktopRepairTimer = null;
      return;
    }
    deepinDesktopRepairTimer = setTimeout(tick, 900);
    deepinDesktopRepairTimer.unref?.();
  };

  deepinDesktopRepairTimer = setTimeout(tick, 0);
  deepinDesktopRepairTimer.unref?.();
}

async function deepinDesktopWindowNeedsReload() {
  if (!isDeepinDdeX11() || !(await commandExists('wmctrl')) || !(await commandExists('xprop'))) return false;
  const ids = await deepinDesktopWindowIds();
  for (const id of ids) {
    try {
      const { stdout } = await execFileAsync('xprop', ['-id', id], { encoding: 'utf8', timeout: 3000 });
      const classLooksDesktop = stdout.includes('WM_CLASS(STRING) = "dde-shell/desktop", "org.deepin.dde-shell"');
      const actionsLookManaged = /_NET_WM_ACTION_(MOVE|RESIZE|MINIMIZE|CLOSE)/.test(stdout);
      const typeLooksNormalOnly = /_NET_WM_WINDOW_TYPE\(ATOM\) = _NET_WM_WINDOW_TYPE_NORMAL\b/.test(stdout);
      if (!classLooksDesktop || actionsLookManaged || typeLooksNormalOnly) return true;
    } catch {
      // The window may have been recreated between wmctrl and xprop.
      return true;
    }
  }
  return false;
}

async function settleDeepinDesktopWindowHints() {
  if (!isDeepinDdeX11()) return;
  for (const delay of [0, 200, 700, 1400, 2600]) {
    if (delay) await sleep(delay);
    await fixDeepinDesktopWindowHints();
  }
}

async function settleDeepinNativeVideoDesktop() {
  await settleDeepinDesktopWindowHints();
}

async function prepareDeepinNativeVideo(filePath) {
  await fs.mkdir(DDE_VIDEO_WALLPAPER_DIR, { recursive: true });
  const ext = normalizeExtension(path.extname(filePath)) || '.mp4';
  const target = path.join(DDE_VIDEO_WALLPAPER_DIR, `000-waifux-current${ext}`);
  const entries = await fs.readdir(DDE_VIDEO_WALLPAPER_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile() && /^(?:0+-)?waifux-current\./i.test(entry.name)) {
      await fs.rm(path.join(DDE_VIDEO_WALLPAPER_DIR, entry.name), { force: true });
    }
  }
  try {
    await fs.link(filePath, target);
  } catch {
    await fs.copyFile(filePath, target);
  }
  return target;
}

async function applyDeepinNativeVideoWallpaper(filePath) {
  const status = await deepinNativeVideoWallpaperStatus();
  if (!status.ok) {
    throw new Error([
      'deepin 原生视频壁纸当前不可用。',
      status.issue || '请先在设置页点击“自动安装动态壁纸依赖”，安装完成后再应用动态壁纸。',
      status.libMpv?.runtimePath && !status.libMpv?.versionlessPath
        ? `已检测到 ${status.libMpv.runtimePath}，但 deepin 插件还需要 libmpv.so 兼容名（${status.libMpv.packageHint} 会提供）。`
        : '',
    ].filter(Boolean).join('\n'));
  }
  const target = await prepareDeepinNativeVideo(filePath);
  await fixDeepinDesktopWindowHints();
  await setDeepinNativeVideoWallpaperEnabled(true);
  scheduleDeepinDesktopWindowHintRepair(0);
  await settleDeepinNativeVideoDesktop();
  return {
    appliedBy: 'deepin 原生视频壁纸插件',
    path: target,
    sourceDir: DDE_VIDEO_WALLPAPER_DIR,
    pluginPath: status.pluginPath,
  };
}

async function applyDeepinEmbeddedMpvWallpaper(filePath) {
  if (!(await commandExists('mpv'))) {
    throw new Error('deepin 真视频桌面模式需要 mpv。请先安装 mpv。');
  }
  if (!(await commandExists('wmctrl'))) {
    throw new Error('deepin 真视频桌面模式需要 wmctrl 来定位 DDE 桌面窗口。请先安装 wmctrl。');
  }

  await setDeepinNativeVideoWallpaperEnabled(false).catch(() => {});
  await settleDeepinDesktopWindowHints();

  const ids = await deepinDesktopWindowIds();
  const desktopWindowId = ids[0];
  if (!desktopWindowId) {
    throw new Error('没有找到 deepin/DDE 桌面窗口，无法嵌入视频壁纸。');
  }

  scheduleDeepinDesktopWindowHintRepair(0);
  liveWallpaperProcess = await spawnLiveWallpaper('mpv', [
    `--wid=${desktopWindowId}`,
    '--loop-file=inf',
    '--no-audio',
    '--no-osc',
    '--no-input-default-bindings',
    '--no-terminal',
    '--panscan=1',
    '--keepaspect=no',
    '--profile=low-latency',
    '--title=waifux-embedded-mpv',
    filePath,
  ], 'deepin desktop mpv');

  return {
    appliedBy: 'deepin 桌面嵌入 mpv',
    pid: liveWallpaperProcess.pid,
    desktopWindowId,
    logPath: LIVE_WALLPAPER_LOG,
  };
}

async function tailText(filePath, limit = 2000) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text.slice(-limit).trim();
  } catch {
    return '';
  }
}

async function appendLiveWallpaperLog(message) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.appendFile(LIVE_WALLPAPER_LOG, `${message}\n`);
}

function waitForProcessStartup(child, label, timeout = 1200) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = async (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      if (error) {
        const logTail = await tailText(LIVE_WALLPAPER_LOG);
        const details = logTail ? `\n\n最近日志：\n${logTail}` : '';
        reject(new Error(`${label} 启动后立即退出：${error}${details}`));
      } else {
        resolve();
      }
    };
    const onError = (error) => finish(error.message);
    const onExit = (code, signal) => finish(`退出码 ${code ?? '无'}，信号 ${signal ?? '无'}`);
    timer = setTimeout(() => finish(null), timeout);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

async function spawnLiveWallpaper(command, args, label) {
  await appendLiveWallpaperLog([
    '',
    `===== ${new Date().toISOString()} ${label} =====`,
    [command, ...args].join(' '),
  ].join('\n'));

  const logFd = fssync.openSync(LIVE_WALLPAPER_LOG, 'a');
  const child = spawn(command, args, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  fssync.closeSync(logFd);
  await waitForProcessStartup(child, label);
  child.unref();
  return child;
}

async function applyVideoWallpaper(filePath) {
  const absolutePath = path.resolve(filePath);
  await fs.access(absolutePath, fssync.constants.R_OK);
  await stopLiveWallpaper();
  const state = await readState();
  const mode = state.liveWallpaperMode || 'auto';

  if (process.env.WAYLAND_DISPLAY && (await commandExists('mpvpaper'))) {
    liveWallpaperProcess = await spawnLiveWallpaper('mpvpaper', ['*', absolutePath, '-o', 'no-audio loop-file=inf'], 'mpvpaper');
    return { appliedBy: 'mpvpaper', pid: liveWallpaperProcess.pid };
  }

  if (isDeepinDdeX11() && mode !== 'xwinwrap-icon-overlay' && mode !== 'deepin-embedded-mpv') {
    return applyDeepinNativeVideoWallpaper(absolutePath);
  }

  if (isDeepinDdeX11() && mode === 'deepin-embedded-mpv') {
    return applyDeepinEmbeddedMpvWallpaper(absolutePath);
  }

  if (process.env.DISPLAY && (await commandExists('xwinwrap')) && (await commandExists('mpv'))) {
    liveWallpaperProcess = await spawnLiveWallpaper('xwinwrap', [
      '-ov',
      '-fs',
      '-ni',
      '-b',
      '-nf',
      '-un',
      '-s',
      '-st',
      '-sp',
      '--',
      'sh',
      '-c',
      'exec mpv --wid="$1" --vo=x11 --loop-file=inf --no-audio --no-osc --no-input-default-bindings --no-terminal --title=waifux-mpv "$2"',
      'waifux-mpv',
      'WID',
      absolutePath,
    ], 'xwinwrap + mpv');
    return { appliedBy: 'xwinwrap + mpv', pid: liveWallpaperProcess.pid, logPath: LIVE_WALLPAPER_LOG };
  }

  throw new Error('当前缺少动态壁纸运行依赖。X11/deepin 建议安装 mpv 与 xwinwrap；Wayland 建议安装 mpvpaper。ffmpeg 仅用于媒体分析，不能单独把视频挂到桌面。');
}

async function applyWallpaperEngineProject(projectPath) {
  const state = await readState();
  const renderer = state.wallpaperEngineRendererPath || await resolveCommand('linux-wallpaperengine');
  if (!renderer || !(await commandExists(renderer))) {
    throw new Error('未配置可用的 Wallpaper Engine Linux 渲染器。请在设置中填写 linux-wallpaperengine 或兼容 renderer 的可执行文件路径。');
  }

  await stopLiveWallpaper();
  liveWallpaperProcess = spawn(renderer, ['--screen-root', projectPath], {
    detached: true,
    stdio: 'ignore',
  });
  liveWallpaperProcess.unref();
  return { appliedBy: 'linux-wallpaperengine', pid: liveWallpaperProcess.pid };
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return '.jpg';
  if (normalized === 'video/mp4') return '.mp4';
  if (normalized === 'video/webm') return '.webm';
  return '';
}

function normalizeExtension(ext) {
  if (!ext) return '';
  const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mkv', '.mov'].includes(normalized)
    ? (normalized === '.jpeg' ? '.jpg' : normalized)
    : '';
}

function extensionFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return '.jpg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') return '.gif';
  if (buffer.slice(4, 8).toString('ascii') === 'ftyp') return '.mp4';
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return '.webm';
  return '';
}

function extensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    return normalizeExtension(path.extname(parsed.pathname));
  } catch {
    // Handled by caller.
  }
  return '';
}

function safeFileName(prefix, sourceUrl, contentType, fallbackExtension = '', bufferExtension = '') {
  const clean = String(prefix || 'waifux')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150) || 'waifux';
  const ext = extensionFromUrl(sourceUrl)
    || extensionFromContentType(contentType)
    || normalizeExtension(bufferExtension)
    || normalizeExtension(fallbackExtension)
    || '.bin';
  return `${clean}${ext}`;
}

function absoluteUrl(value, base) {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attr(block, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(block || '');
  return match ? decodeHtml(match[1] || match[2] || match[3] || '') : '';
}

async function fetchText(url, options = {}) {
  const headers = {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
    'user-agent': BROWSER_USER_AGENT,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  const body = await response.text().catch(() => '');
  if (response.ok && !looksLikeCloudflareChallenge(body)) {
    return body;
  }

  if ((response.status === 403 || looksLikeCloudflareChallenge(body)) && await commandExists('curl')) {
    return fetchTextWithCurl(url, headers);
  }

  throw new Error(formatHttpError(response.status, body));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 220)}`);
  }
  return response.json();
}

function looksLikeCloudflareChallenge(body) {
  const text = String(body || '').slice(0, 2000).toLowerCase();
  return text.includes('<title>just a moment')
    || text.includes('cf-browser-verification')
    || text.includes('cf-challenge')
    || text.includes('challenge-form')
    || text.includes('verify you are human')
    || text.includes('checking your browser');
}

function formatHttpError(status, body) {
  const text = String(body || '').trim();
  if (looksLikeCloudflareChallenge(text)) {
    return `HTTP ${status}: 目标站点启用了 Cloudflare/反爬验证，当前请求被拒绝。请稍后重试，或在浏览器中确认该站点可访问。`;
  }
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.includes('<head>')) {
    return `HTTP ${status}: 目标站点返回了 HTML 错误页，可能是反爬、地区限制或临时维护。`;
  }
  return `HTTP ${status}: ${text.slice(0, 260)}`;
}

async function fetchTextWithCurl(url, headers = {}) {
  const args = [
    '-fL',
    '-sS',
    '--compressed',
    '--max-time',
    '25',
    '-A',
    BROWSER_USER_AGENT,
    '-H',
    `Accept: ${headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}`,
    '-H',
    `Accept-Language: ${headers['accept-language'] || 'zh-CN,zh;q=0.9,en;q=0.7'}`,
  ];

  if (headers.referer || headers.Referer) {
    args.push('-e', headers.referer || headers.Referer);
  }

  args.push(url);

  try {
    const { stdout } = await execFileAsync('curl', args, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (looksLikeCloudflareChallenge(stdout)) {
      throw new Error('目标站点仍然要求 Cloudflare 浏览器验证。');
    }
    return stdout;
  } catch (error) {
    throw new Error(`目标站点拒绝了自动抓取请求。系统 curl 回退也失败：${error.message}`);
  }
}

async function downloadToFile(sourceUrl, prefix, targetDir, accept = '*/*', fallbackExtension = '') {
  await fs.mkdir(targetDir, { recursive: true });
  const response = await fetch(sourceUrl, {
    headers: { accept, 'user-agent': BROWSER_USER_AGENT },
  });
  if (!response.ok && (response.status !== 403 || !(await commandExists('curl')))) {
    const body = await response.text().catch(() => '');
    throw new Error(formatHttpError(response.status, body));
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = response.ok
    ? Buffer.from(await response.arrayBuffer())
    : await downloadWithCurl(sourceUrl, accept);
  const fileName = safeFileName(prefix, response.url || sourceUrl, contentType, fallbackExtension, extensionFromBuffer(buffer));
  const targetPath = path.join(targetDir, fileName);
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

async function downloadWithCurl(sourceUrl, accept = '*/*') {
  try {
    const { stdout } = await execFileAsync('curl', [
      '-fL',
      '-sS',
      '--compressed',
      '--max-time',
      '120',
      '-A',
      BROWSER_USER_AGENT,
      '-H',
      `Accept: ${accept}`,
      sourceUrl,
    ], {
      encoding: 'buffer',
      timeout: 125000,
      maxBuffer: 1024 * 1024 * 1024,
    });
    return Buffer.from(stdout);
  } catch (error) {
    throw new Error(`下载失败，系统 curl 回退也失败：${error.message}`);
  }
}

function normalizeWallhaven(item) {
  const wallpaper = {
    id: String(item.id),
    source: 'wallhaven',
    kind: 'wallpaper',
    title: `Wallhaven ${item.id}`,
    url: item.url,
    thumbnail: item.thumbs?.large || item.thumbs?.small || item.path,
    preview: item.thumbs?.original || item.thumbs?.large || item.path,
    image: item.path || item.thumbs?.original,
    resolution: item.resolution || `${item.dimension_x || 0}x${item.dimension_y || 0}`,
    ratio: item.ratio,
    purity: item.purity,
    category: item.category,
    fileSize: item.file_size,
    fileType: item.file_type,
    colors: item.colors || [],
    tags: (item.tags || []).map((tag) => tag.name || tag).filter(Boolean),
    raw: item,
  };
  memoryItems.set(`wallpaper:${wallpaper.id}`, wallpaper);
  return wallpaper;
}

function normalizedPurity(value, apiKey) {
  const raw = String(value || '100').replace(/[^01]/g, '').padEnd(3, '0').slice(0, 3);
  if (apiKey) return raw;
  return `${raw[0] || '1'}${raw[1] || '0'}0`;
}

async function searchWallhaven(searchParams) {
  const state = await readState();
  const target = new URL(`${WALLHAVEN_API}/search`);
  const allowList = ['q', 'page', 'categories', 'sorting', 'order', 'topRange', 'resolutions', 'ratios', 'colors'];
  for (const key of allowList) {
    const value = searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  target.searchParams.set('purity', normalizedPurity(searchParams.get('purity'), state.wallpaperApiKey));
  if (!target.searchParams.has('categories')) target.searchParams.set('categories', '111');
  if (!target.searchParams.has('sorting')) target.searchParams.set('sorting', 'favorites');
  if (!target.searchParams.has('order')) target.searchParams.set('order', 'desc');

  const data = await fetchJson(target, {
    headers: state.wallpaperApiKey ? { 'X-API-Key': state.wallpaperApiKey } : {},
  });

  return {
    data: (data.data || []).map(normalizeWallhaven),
    meta: data.meta || {},
    source: 'wallhaven',
  };
}

function fourKListUrl(searchParams) {
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const category = (searchParams.get('category') || '').trim();
  if (query) {
    const url = new URL('/search/', FOUR_K_BASE);
    url.searchParams.set('q', query);
    if (page > 1) url.searchParams.set('page', String(page));
    return url.toString();
  }
  const pathname = category ? `/${category.replace(/[^a-z0-9-]/gi, '')}/` : '/most-popular-4k-wallpapers/';
  const url = new URL(pathname, FOUR_K_BASE);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

function parseFourKList(html) {
  const items = [];
  const blocks = html.match(/<p\b[^>]*class=["'][^"']*wallpapers__item[^"']*["'][\s\S]*?<\/p>/gi) || [];
  for (const block of blocks) {
    const imgMatch = /<img\b[^>]*itemprop=["']thumbnail["'][^>]*>/i.exec(block) || /<img\b[^>]*>/i.exec(block);
    const linkMatch = /<a\b[^>]*class=["'][^"']*wallpapers__canvas_image[^"']*["'][^>]*>/i.exec(block) || /<a\b[^>]*href=["'][^"']+["'][^>]*>/i.exec(block);
    const thumb = imgMatch ? absoluteUrl(attr(imgMatch[0], 'src') || attr(imgMatch[0], 'data-src'), FOUR_K_BASE) : null;
    const detailUrl = linkMatch ? absoluteUrl(attr(linkMatch[0], 'href'), FOUR_K_BASE) : null;
    if (!thumb || !detailUrl) continue;

    const idMatch = /-(\d+)\.(?:jpg|jpeg|png|webp)/i.exec(thumb) || /-(\d+)\.html/i.exec(detailUrl);
    const id = idMatch ? idMatch[1] : Buffer.from(detailUrl).toString('base64url').slice(0, 12);
    const title = stripTags(block.match(/<span\b[^>]*class=["'][^"']*wallpapers__title[^"']*["'][\s\S]*?<\/span>/i)?.[0])
      || decodeURIComponent(path.basename(detailUrl).replace(/-\d+\.html$/i, '').replace(/-/g, ' '));
    const keywords = attr(block.match(/<meta\b[^>]*itemprop=["']keywords["'][^>]*>/i)?.[0] || '', 'content')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const wallpaper = {
      id: `4k_${id}`,
      source: '4kwallpapers',
      kind: 'wallpaper',
      title,
      url: detailUrl,
      thumbnail: thumb,
      preview: thumb.replace('/thumbs/', '/thumbs_3t/'),
      image: thumb.replace('/thumbs/', '/thumbs_3t/'),
      resolution: '4K',
      ratio: '',
      purity: 'sfw',
      category: keywords.some((tag) => /anime/i.test(tag)) ? 'anime' : 'general',
      tags: keywords,
      raw: { detailUrl, thumbnail: thumb },
    };
    memoryItems.set(`wallpaper:${wallpaper.id}`, wallpaper);
    items.push(wallpaper);
  }
  return items;
}

async function searchFourK(searchParams) {
  const url = fourKListUrl(searchParams);
  const html = await fetchText(url);
  return {
    data: parseFourKList(html),
    meta: { current_page: Number(searchParams.get('page') || 1), per_page: 24 },
    source: '4kwallpapers',
  };
}

async function searchWallpapers(searchParams) {
  const source = searchParams.get('source') || (await readState()).wallpaperSource || 'wallhaven';
  if (source === '4kwallpapers') return searchFourK(searchParams);
  if (source === 'auto') {
    try {
      return await searchWallhaven(searchParams);
    } catch (error) {
      const fallback = await searchFourK(searchParams);
      fallback.warning = `Wallhaven 加载失败，已切换 4KWallpapers：${error.message}`;
      return fallback;
    }
  }
  return searchWallhaven(searchParams);
}

async function getWallpaperDetail(id) {
  const cached = memoryItems.get(`wallpaper:${id}`);
  if (cached?.source === '4kwallpapers') {
    return enrichFourKOriginal(cached);
  }
  if (cached?.source === 'wallhaven') return cached;

  if (id.startsWith('4k_')) {
    const item = memoryItems.get(`wallpaper:${id}`);
    if (!item) throw new Error('4KWallpapers 详情需要先从列表中打开。');
    return enrichFourKOriginal(item);
  }

  const state = await readState();
  const data = await fetchJson(`${WALLHAVEN_API}/w/${encodeURIComponent(id)}`, {
    headers: state.wallpaperApiKey ? { 'X-API-Key': state.wallpaperApiKey } : {},
  });
  return normalizeWallhaven(data.data);
}

async function enrichFourKOriginal(item) {
  if (item.originalImage) return item;
  const html = await fetchText(item.url);
  const resolutionLink = html.match(/<a\b[^>]*id=["']resolution["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  const imageLink = resolutionLink?.[1]
    || html.match(/href=["']([^"']+\/images\/wallpapers\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1]
    || html.match(/content=["']([^"']+\/images\/wallpapers\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1];
  const original = absoluteUrl(imageLink, FOUR_K_BASE) || item.image;
  item.originalImage = original;
  item.image = original;
  memoryItems.set(`wallpaper:${item.id}`, item);
  return item;
}

async function downloadWallpaperFromItem(input) {
  const item = input?.wallpaper || input?.item || input || {};
  let resolved = item;
  if (item.id && !item.image && !item.originalImage) {
    resolved = await getWallpaperDetail(item.id);
  }
  const imageUrl = resolved.originalImage || resolved.image || resolved.url;
  if (!imageUrl) throw new Error('缺少图片下载地址。');
  const prefix = resolved.source === '4kwallpapers' ? `4kwallpapers-${resolved.id.replace(/^4k_/, '')}` : `wallhaven-${resolved.id || 'wallpaper'}`;
  const targetPath = await downloadToFile(imageUrl, prefix, WALLPAPER_DIR, 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8');
  return { path: targetPath, item: resolved };
}

function motionListUrl(query, tag, page) {
  if (query) {
    const url = new URL('/search', MOTIONBGS_BASE);
    url.searchParams.set('q', query);
    if (page > 1) url.searchParams.set('page', String(page));
    return url.toString();
  }
  if (tag) {
    return new URL(`/tag:${encodeURIComponent(tag)}/${page > 1 ? `${page}/` : ''}`, MOTIONBGS_BASE).toString();
  }
  return new URL(page > 1 ? `/${page}/` : '/', MOTIONBGS_BASE).toString();
}

function mediaIdFromPath(pathname) {
  return Buffer.from(pathname).toString('base64url');
}

function pathFromMediaId(id) {
  try {
    return Buffer.from(id, 'base64url').toString('utf8');
  } catch {
    return `/${id}`;
  }
}

function parseMotionItems(html) {
  const links = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  const seen = new Set();
  const items = [];

  for (const block of links) {
    const href = attr(block, 'href');
    const pageURL = absoluteUrl(href, MOTIONBGS_BASE);
    if (!pageURL) continue;
    const pathname = new URL(pageURL).pathname;
    if (!pathname || pathname === '/' || pathname.startsWith('/tag:') || pathname.startsWith('/page/') || pathname.startsWith('/cdn-cgi/')) continue;
    if (seen.has(pathname)) continue;

    const imageTag = block.match(/<img\b[^>]*>/i)?.[0] || '';
    const signal = `${attr(block, 'title')} ${attr(imageTag, 'alt')} ${stripTags(block)}`;
    if (!/live wallpaper/i.test(signal)) continue;

    seen.add(pathname);
    const thumbnail = motionImageFromBlock(block);
    const title = stripTags(firstTagWithClass(block, 'span', 'ttl'))
      || stripTags(attr(block, 'title')).replace(/\s*live wallpaper\s*/i, '')
      || decodeURIComponent(path.basename(pathname).replace(/-/g, ' '));
    const resolution = stripTags(firstTagWithClass(block, 'span', 'frm')) || (/4k/i.test(block) ? '4K' : 'HD');
    const item = {
      id: mediaIdFromPath(pathname),
      slug: pathname.replace(/^\/|\/$/g, ''),
      source: 'motionbgs',
      kind: 'media',
      title,
      pageURL,
      thumbnail,
      poster: thumbnail,
      resolution,
      tags: [],
      summary: '',
      downloadOptions: [],
    };
    memoryItems.set(`media:${item.id}`, item);
    items.push(item);
  }

  return items;
}

function hasClass(tag, className) {
  return attr(tag, 'class').split(/\s+/).includes(className);
}

function firstTagWithClass(html, tagName, className) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
  const matches = html.match(pattern) || [];
  return matches.find((block) => hasClass(block.match(new RegExp(`<${tagName}\\b[^>]*>`, 'i'))?.[0] || '', className)) || '';
}

function firstSrcsetUrl(value) {
  return String(value || '').split(',')[0].trim().split(/\s+/)[0];
}

function motionImageFromBlock(block) {
  const imageTag = block.match(/<img\b[^>]*>/i)?.[0] || '';
  const sourceTags = block.match(/<source\b[^>]*>/gi) || [];
  const candidates = [
    attr(imageTag, 'data-src'),
    attr(imageTag, 'src'),
    ...sourceTags.map((tag) => firstSrcsetUrl(attr(tag, 'srcset'))),
  ].filter(Boolean);
  return absoluteUrl(candidates[0], MOTIONBGS_BASE);
}

async function mediaFeed(searchParams) {
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
  const tag = (searchParams.get('tag') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const url = motionListUrl(query, tag, page);
  const html = await fetchText(url, {
    headers: { referer: MOTIONBGS_BASE },
  });
  return {
    data: parseMotionItems(html),
    meta: { page, source: 'MotionBGs', title: query ? `搜索：${query}` : tag ? `标签：${tag}` : '动态壁纸' },
  };
}

function parseMotionDetail(html, item) {
  const title = stripTags(html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0]) || item.title;
  const description = stripTags(html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i)?.[0] ? attr(html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i)?.[0], 'content') : '');
  const sourceTags = html.match(/<source\b[^>]*>/gi) || [];
  const sourceVideo = sourceTags.map((tag) => attr(tag, 'src')).find((src) => /\.(mp4|webm)(?:[?#]|$)/i.test(src));
  const contentVideo = html.match(/content\s*=\s*(?:"([^"]+\.(?:mp4|webm)[^"]*)"|'([^']+\.(?:mp4|webm)[^']*)|([^\s>]+\.(?:mp4|webm)[^\s>]*))/i);
  const videoURL = absoluteUrl(sourceVideo || contentVideo?.[1] || contentVideo?.[2] || contentVideo?.[3], MOTIONBGS_BASE);
  const videoTag = html.match(/<video\b[^>]*>/i)?.[0] || '';
  const posterMatch = html.match(/poster\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  const poster = absoluteUrl(attr(videoTag, 'poster') || posterMatch?.[1] || posterMatch?.[2] || posterMatch?.[3], MOTIONBGS_BASE) || item.poster || item.thumbnail;
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  const tags = anchors
    .filter((block) => /^\/tag:/i.test(attr(block, 'href')))
    .map((block) => stripTags(block) || decodeURIComponent(attr(block, 'href').replace(/^\/tag:|\/$/gi, '')))
    .filter(Boolean);

  const options = [];
  const downloadBlocks = anchors.filter((block) => /^\/dl\//i.test(attr(block, 'href')) || /download/i.test(stripTags(block)));
  for (const block of downloadBlocks) {
    const remoteURL = absoluteUrl(attr(block, 'href'), MOTIONBGS_BASE);
    if (!remoteURL) continue;
    const text = stripTags(block);
    const label = text.match(/\b(8K|4K|2K|HD|Mobile|1080p|720p)\b/i)?.[1]
      || attr(block, 'href').match(/\/dl\/([^/]+)/i)?.[1]?.toUpperCase()
      || '下载';
    const size = text.match(/\(([^)]+(?:MB|GB|KB)[^)]*)\)/i)?.[1] || '';
    options.push({
      id: Buffer.from(`${label}|${remoteURL}`).toString('base64url'),
      label,
      fileSizeLabel: size,
      detailText: text,
      remoteURL,
    });
  }
  if (!options.length && videoURL) {
    options.push({
      id: Buffer.from(`预览视频|${videoURL}`).toString('base64url'),
      label: '预览视频',
      fileSizeLabel: '',
      detailText: 'MotionBGs 预览视频',
      remoteURL: videoURL,
    });
  }

  const enriched = {
    ...item,
    title,
    summary: description,
    poster,
    previewVideoURL: videoURL,
    tags: tags.length ? tags : item.tags,
    downloadOptions: options,
  };
  memoryItems.set(`media:${enriched.id}`, enriched);
  return enriched;
}

async function mediaDetail(id) {
  const cached = memoryItems.get(`media:${id}`) || {
    id,
    slug: pathFromMediaId(id).replace(/^\/|\/$/g, ''),
    source: 'motionbgs',
    title: pathFromMediaId(id).replace(/^\/|\/$/g, '').replace(/-/g, ' '),
    pageURL: absoluteUrl(pathFromMediaId(id), MOTIONBGS_BASE),
  };
  const html = await fetchText(cached.pageURL || absoluteUrl(pathFromMediaId(id), MOTIONBGS_BASE));
  return parseMotionDetail(html, cached);
}

async function downloadMedia(input) {
  const item = input.item?.downloadOptions ? input.item : input.item?.id ? await mediaDetail(input.item.id) : input.id ? await mediaDetail(input.id) : input.item;
  if (!item) throw new Error('缺少媒体信息。');
  const option = input.option || item.downloadOptions?.[0];
  const remoteURL = option?.remoteURL || item.previewVideoURL;
  if (!remoteURL) throw new Error('没有可用的媒体下载地址。');
  const targetPath = await downloadToFile(remoteURL, `motionbgs-${item.slug || item.id}-${option?.label || 'video'}`, MEDIA_DIR, 'video/mp4,video/webm,video/*,*/*;q=0.8', '.mp4');
  return { path: targetPath, item, option };
}

function normalizeBangumiSubject(subject) {
  const image = subject.images?.large || subject.images?.common || subject.images?.medium || subject.images?.grid || subject.images?.small || '';
  const item = {
    id: String(subject.id),
    source: 'bangumi',
    kind: 'anime',
    title: subject.name_cn || subject.name || `Bangumi ${subject.id}`,
    originalTitle: subject.name,
    summary: subject.summary || '',
    thumbnail: image ? image.replace(/^http:/, 'https:') : '',
    rating: subject.rating?.score || null,
    rank: subject.rank || null,
    tags: (subject.tags || []).slice(0, 8).map((tag) => tag.name || tag).filter(Boolean),
    date: subject.date || '',
    url: `https://bgm.tv/subject/${subject.id}`,
    raw: subject,
  };
  memoryItems.set(`anime:${item.id}`, item);
  return item;
}

async function animeTrending(searchParams) {
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || 24)));
  const offset = (page - 1) * limit;
  const url = new URL('/v0/search/subjects', BANGUMI_API);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sort: 'heat',
      filter: { type: [2] },
    }),
  });
  return { data: (data.data || []).map(normalizeBangumiSubject), meta: { page, total: data.total || null } };
}

async function animeSearch(searchParams) {
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
  if (!query) return animeTrending(searchParams);
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || 24)));
  const offset = (page - 1) * limit;
  const url = new URL('/v0/search/subjects', BANGUMI_API);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      keyword: query,
      sort: 'match',
      filter: { type: [2] },
    }),
  });
  return { data: (data.data || []).map(normalizeBangumiSubject), meta: { page, total: data.total || null } };
}

async function animeDetail(id) {
  const subjectId = Number(String(id || '').trim());
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    throw new Error(`Bangumi 条目 ID 无效：${id || '空'}。请刷新列表后再打开详情。`);
  }

  const subject = await fetchJson(`${BANGUMI_API}/v0/subjects/${subjectId}`);
  let episodes = [];
  try {
    const ep = await fetchJson(`${BANGUMI_API}/v0/episodes?subject_id=${subjectId}&limit=100&offset=0`);
    episodes = (ep.data || []).map((item) => ({
      id: String(item.id),
      name: item.name_cn || item.name || `第 ${item.sort || item.ep || item.id} 集`,
      sort: item.sort || item.ep || 0,
      duration: item.duration || '',
      airdate: item.airdate || '',
      type: item.type,
    }));
  } catch {
    episodes = [];
  }
  const item = normalizeBangumiSubject(subject);
  item.episodes = episodes;
  return item;
}

async function extractAnimeVideo(body) {
  const targetUrl = body.url || body.episodeUrl;
  if (!targetUrl) throw new Error('缺少剧集页面地址。');
  const html = await fetchText(targetUrl, { headers: { referer: targetUrl } });
  const candidates = new Set();
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\\\s]+?\.(?:m3u8|mp4|webm)(?:\?[^"'<>\\\s]*)?/gi)) {
    candidates.add(match[0].replace(/\\\//g, '/'));
  }
  for (const match of html.matchAll(/(?:src|data-src|url)\s*=\s*["']([^"']+\.(?:m3u8|mp4|webm)(?:\?[^"']*)?)["']/gi)) {
    const resolved = absoluteUrl(match[1], targetUrl);
    if (resolved) candidates.add(resolved);
  }
  const iframes = [...html.matchAll(/<iframe\b[^>]*src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => absoluteUrl(match[1], targetUrl))
    .filter(Boolean);

  return {
    data: [...candidates].map((url, index) => ({
      id: String(index + 1),
      url,
      type: url.includes('.m3u8') ? 'hls' : 'file',
      label: url.includes('.m3u8') ? 'HLS' : '视频',
    })),
    iframes,
    message: candidates.size ? null : '未直接发现视频地址。该页面可能需要 Kazumi 规则、验证码验证或浏览器运行脚本解析。',
  };
}

function workshopSearchUrl(searchParams) {
  const url = new URL('/workshop/browse/', STEAM_WORKSHOP_BASE);
  url.searchParams.set('appid', WALLPAPER_ENGINE_APP_ID);
  url.searchParams.set('searchtext', searchParams.get('q') || searchParams.get('query') || '');
  url.searchParams.set('child_publishedfileid', '0');
  url.searchParams.set('browsesort', searchParams.get('sort') || 'trend');
  url.searchParams.set('section', 'readytouseitems');
  url.searchParams.set('created_filetype', '0');
  url.searchParams.set('updated_filters', '1');
  url.searchParams.set('p', String(Math.max(1, Number(searchParams.get('page') || 1))));
  url.searchParams.set('num_per_page', '24');
  const type = searchParams.get('type');
  if (type && type !== 'all') url.searchParams.append('requiredtags[]', type[0].toUpperCase() + type.slice(1));
  url.searchParams.append('requiredtags[]', 'Everyone');
  return url.toString();
}

function parseWorkshopItems(html) {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']*sharedfiles\/filedetails\/\?id=(\d+)[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi)];
  const seen = new Set();
  const items = [];
  for (const match of links) {
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    const block = match[0];
    const img = block.match(/<img\b[^>]*>/i)?.[0] || '';
    const preview = absoluteUrl(attr(img, 'src') || attr(img, 'data-src'), STEAM_WORKSHOP_BASE);
    const title = stripTags(attr(img, 'alt')) || stripTags(block) || `Workshop ${id}`;
    const item = {
      id,
      source: 'steam-workshop',
      kind: 'workshop',
      title,
      pageURL: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
      thumbnail: preview,
      poster: preview,
      type: 'unknown',
      tags: ['Wallpaper Engine'],
      author: '',
    };
    memoryItems.set(`workshop:${id}`, item);
    items.push(item);
  }
  return items;
}

async function workshopSearch(searchParams) {
  const url = workshopSearchUrl(searchParams);
  const html = await fetchText(url);
  return { data: parseWorkshopItems(html), meta: { page: Number(searchParams.get('page') || 1), source: 'Steam Workshop' } };
}

async function workshopDetail(id) {
  const cached = memoryItems.get(`workshop:${id}`) || {
    id,
    source: 'steam-workshop',
    kind: 'workshop',
    title: `Workshop ${id}`,
    pageURL: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
  };
  const html = await fetchText(cached.pageURL);
  const title = stripTags(html.match(/<div\b[^>]*class=["'][^"']*workshopItemTitle[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0]) || cached.title;
  const description = stripTags(html.match(/<div\b[^>]*class=["'][^"']*workshopItemDescription[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0]);
  const preview = absoluteUrl(html.match(/<img\b[^>]*id=["']previewImage["'][^>]*src=["']([^"']+)["']/i)?.[1], STEAM_WORKSHOP_BASE) || cached.thumbnail;
  const tags = [...html.matchAll(/<a\b[^>]*class=["'][^"']*workshopTagsTitle[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => stripTags(m[1])).filter(Boolean);
  const type = tags.find((tag) => /^(video|scene|web|application)$/i.test(tag))?.toLowerCase() || cached.type || 'unknown';
  const item = { ...cached, title, summary: description, thumbnail: preview, poster: preview, tags: tags.length ? tags : cached.tags, type };
  memoryItems.set(`workshop:${id}`, item);
  return item;
}

async function locateSteamcmd() {
  const state = await readState();
  if (state.steamcmdPath && (await commandExists(state.steamcmdPath))) return state.steamcmdPath;
  return resolveCommand('steamcmd');
}

async function downloadWorkshop(id) {
  const steamcmd = await locateSteamcmd();
  if (!steamcmd) {
    throw new Error('未找到 SteamCMD。请在设置中填写 Linux SteamCMD 可执行文件路径；本应用不会内置或绕过 Steam/Wallpaper Engine 授权。');
  }

  const item = await workshopDetail(id);
  const installRoot = path.dirname(steamcmd);
  await execFileAsync(steamcmd, ['+login', 'anonymous', '+workshop_download_item', WALLPAPER_ENGINE_APP_ID, String(id), '+quit'], {
    cwd: installRoot,
    timeout: 10 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
  });

  const candidates = [
    path.join(installRoot, 'steamapps', 'workshop', 'content', WALLPAPER_ENGINE_APP_ID, String(id)),
    path.join(os.homedir(), '.steam', 'steam', 'steamapps', 'workshop', 'content', WALLPAPER_ENGINE_APP_ID, String(id)),
    path.join(os.homedir(), '.local', 'share', 'Steam', 'steamapps', 'workshop', 'content', WALLPAPER_ENGINE_APP_ID, String(id)),
  ];
  const sourceDir = candidates.find((candidate) => fssync.existsSync(candidate));
  if (!sourceDir) {
    throw new Error('SteamCMD 已执行，但没有找到下载后的 Workshop 内容目录。请检查 SteamCMD 输出和登录授权。');
  }

  const targetDir = path.join(WORKSHOP_DIR, String(id));
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });
  await patchState({ lastWorkshopDownload: { id: String(id), path: targetDir, downloadedAt: new Date().toISOString() } });
  return { path: targetDir, item };
}

async function findFirstFile(dir, predicate) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstFile(full, predicate);
      if (nested) return nested;
    } else if (predicate(full)) {
      return full;
    }
  }
  return null;
}

async function applyWorkshop(input) {
  const id = input.id || input.item?.id;
  const localPath = input.path || path.join(WORKSHOP_DIR, String(id));
  if (!localPath || !fssync.existsSync(localPath)) {
    throw new Error('请先下载或导入该 Workshop 内容。');
  }
  const video = await findFirstFile(localPath, (file) => /\.(mp4|webm|mkv|mov)$/i.test(file));
  if (video) {
    const result = await applyVideoWallpaper(video);
    await patchState({ lastLiveWallpaper: { type: 'workshop-video', path: video, appliedAt: new Date().toISOString() } });
    return { ...result, path: video };
  }
  const project = await findFirstFile(localPath, (file) => /project\.json$/i.test(file));
  if (project) {
    const result = await applyWallpaperEngineProject(project);
    await patchState({ lastLiveWallpaper: { type: 'workshop-project', path: project, appliedAt: new Date().toISOString() } });
    return { ...result, path: project };
  }
  throw new Error('未在 Workshop 内容中找到可应用的视频文件或 project.json。');
}

async function dependencyStatus() {
  const state = await readState();
  const names = [
    'node',
    'npm',
    'busctl',
    'dde-dconfig',
    'gsettings',
    'xdg-open',
    'plasma-apply-wallpaperimage',
    'xfconf-query',
    'swaymsg',
    'swww',
    'ffmpeg',
    'mpv',
    'xwinwrap',
    'mpvpaper',
    'xprop',
    'xwininfo',
    'xdotool',
    'wmctrl',
    'feh',
    'steamcmd',
    'linux-wallpaperengine',
  ];
  const commands = {};
  for (const name of names) {
    commands[name] = {
      ok: await commandExists(name),
      path: await resolveCommand(name),
    };
  }

  const customSteamcmd = state.steamcmdPath ? { ok: await commandExists(state.steamcmdPath), path: state.steamcmdPath } : { ok: false, path: '' };
  const customRenderer = state.wallpaperEngineRendererPath ? { ok: await commandExists(state.wallpaperEngineRendererPath), path: state.wallpaperEngineRendererPath } : { ok: false, path: '' };
  const desktop = {
    current: process.env.XDG_CURRENT_DESKTOP || '',
    session: process.env.DESKTOP_SESSION || '',
    display: process.env.DISPLAY || '',
    wayland: process.env.WAYLAND_DISPLAY || '',
    sessionType: process.env.XDG_SESSION_TYPE || '',
  };
  const system = await detectLinuxSystem();
  const deepinDdeX11 = isDeepinDdeX11();
  const liveWallpaperMode = state.liveWallpaperMode || 'auto';
  const useDeepinOverlay = liveWallpaperMode === 'xwinwrap-icon-overlay';
  const useDeepinEmbeddedMpv = liveWallpaperMode === 'deepin-embedded-mpv';
  const useDeepinNativePlugin = liveWallpaperMode === 'auto' || liveWallpaperMode === 'deepin-native-plugin';
  const deepinNativeVideo = await deepinNativeVideoWallpaperStatus();
  const staticWallpaper = commands.gsettings.ok || commands['plasma-apply-wallpaperimage']?.ok || commands.feh.ok || commands.busctl.ok;
  const deepinEmbeddedMpv = deepinDdeX11 && useDeepinEmbeddedMpv && commands.mpv.ok && commands.wmctrl.ok;
  const deepinOverlayWallpaper = deepinDdeX11 && useDeepinOverlay && Boolean(process.env.DISPLAY) && commands.mpv.ok && commands.xwinwrap.ok;

  return {
    desktop,
    system,
    liveWallpaperMode,
    commands,
    custom: { steamcmd: customSteamcmd, wallpaperEngineRenderer: customRenderer },
    deepinNativeVideo,
    capabilities: {
      staticWallpaper,
      videoWallpaper: commands.mpvpaper.ok || deepinOverlayWallpaper || deepinEmbeddedMpv || (deepinDdeX11 && useDeepinNativePlugin && deepinNativeVideo.ok) || (Boolean(process.env.DISPLAY) && commands.mpv.ok && commands.xwinwrap.ok && !deepinDdeX11),
      deepinVideoWallpaperLimited: deepinDdeX11,
      deepinEmbeddedMpv,
      deepinOverlayWallpaper,
      workshopDownload: customSteamcmd.ok || commands.steamcmd.ok,
      wallpaperEngineScene: customRenderer.ok || commands['linux-wallpaperengine'].ok,
    },
    hints: buildDependencyHints(commands, customSteamcmd, customRenderer, { deepinDdeX11, useDeepinOverlay, useDeepinEmbeddedMpv, useDeepinNativePlugin, deepinNativeVideo, deepinEmbeddedMpv, deepinOverlayWallpaper, staticWallpaper }),
  };
}

function buildDependencyHints(commands, customSteamcmd, customRenderer, context = {}) {
  const hints = [];
  if (!commands.gsettings.ok && !commands.feh.ok) {
    hints.push('静态壁纸需要 gsettings、KDE/XFCE 工具、swww/swaymsg 或 feh 中至少一个。');
  }
  if (context.deepinDdeX11) {
    if (context.useDeepinNativePlugin) {
      if (context.deepinNativeVideo?.ok) {
        hints.push('deepin/DDE 自动模式使用原生视频壁纸插件，视频应位于桌面图标后方。');
      } else if (context.deepinNativeVideo?.pluginPath && context.deepinNativeVideo?.configReadable && !context.deepinNativeVideo?.libMpv?.ok) {
        hints.push('deepin 原生视频壁纸插件已安装，但缺少 libmpv.so 兼容链接；请点击自动安装动态壁纸依赖安装 libmpv-dev。');
      } else if (context.deepinNativeVideo?.pluginPath && !context.deepinNativeVideo?.lifecyclePatchOk) {
        hints.push(`deepin 原生视频壁纸插件需要 WaifuX ${DDE_VIDEO_PLUGIN_MIN_VERSION}+ 补丁包，修复单独出现“桌面”窗口、视频黑屏和尺寸不适配的问题。`);
      } else {
        hints.push('deepin/DDE 自动模式需要原生视频壁纸插件。当前系统仓库包为空，WaifuX 会从 deepin 官方源码编译安装插件。');
      }
    } else if (context.useDeepinOverlay) {
      if (!commands.mpv.ok) {
        hints.push('deepin/DDE xwinwrap 覆盖模式需要 mpv 播放真视频。');
      } else if (!commands.xwinwrap.ok) {
        hints.push('deepin/DDE xwinwrap 覆盖模式需要 xwinwrap。');
      } else {
        hints.push('deepin/DDE xwinwrap 覆盖模式会遮挡桌面图标，仅适合不显示桌面图标时使用。');
      }
    } else if (context.useDeepinEmbeddedMpv) {
      if (!commands.mpv.ok) {
        hints.push('deepin/DDE 嵌入桌面模式需要 mpv。');
      } else if (!commands.wmctrl.ok) {
        hints.push('deepin/DDE 嵌入桌面模式需要 wmctrl 定位桌面窗口。');
      } else {
        hints.push('deepin/DDE 嵌入桌面模式会保留桌面图标，图标可能遮挡视频。');
      }
    }
  } else if (!commands.mpvpaper.ok && !(process.env.DISPLAY && commands.mpv.ok && commands.xwinwrap.ok)) {
    hints.push('动态视频壁纸需要 mpvpaper，或在 X11 下安装 mpv + xwinwrap。');
  }
  if (!customSteamcmd.ok && !commands.steamcmd.ok) {
    hints.push('Steam Workshop 下载需要在设置中配置 Linux SteamCMD 路径，或把 steamcmd 加入 PATH。');
  }
  if (!customRenderer.ok && !commands['linux-wallpaperengine'].ok) {
    hints.push('Wallpaper Engine Scene/Web 需要配置 linux-wallpaperengine 或兼容 renderer。');
  }
  return hints;
}

async function detectLinuxSystem() {
  const osRelease = await readOsRelease();
  return {
    id: osRelease.ID || '',
    name: osRelease.PRETTY_NAME || osRelease.NAME || os.type(),
    version: osRelease.VERSION_ID || '',
    family: osRelease.ID_LIKE || '',
    packageManager: await detectPackageManager(),
    terminals: await availableTerminals(),
    auth: {
      pkexec: await resolveCommand('pkexec'),
      sudo: await resolveCommand('sudo'),
    },
  };
}

async function readOsRelease() {
  try {
    const raw = await fs.readFile('/etc/os-release', 'utf8');
    const data = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match) continue;
      data[match[1]] = match[2].replace(/^"|"$/g, '').replace(/\\"/g, '"');
    }
    return data;
  } catch {
    return {};
  }
}

async function detectPackageManager() {
  const candidates = [
    ['apt', 'apt-get'],
    ['dnf', 'dnf'],
    ['pacman', 'pacman'],
    ['zypper', 'zypper'],
  ];
  for (const [id, command] of candidates) {
    const resolved = await resolveCommand(command);
    if (resolved) return { id, command: resolved };
  }
  return { id: '', command: '' };
}

async function availableTerminals() {
  const candidates = ['x-terminal-emulator', 'deepin-terminal', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'mate-terminal', 'xterm'];
  const terminals = [];
  for (const name of candidates) {
    const resolved = await resolveCommand(name);
    if (resolved) terminals.push({ name, path: resolved });
  }
  return terminals;
}

function buildDependencyInstallPlan(status, target = 'live-wallpaper') {
  const display = status.desktop || {};
  const commands = status.commands || {};
  const manager = status.system?.packageManager?.id || '';
  const isWayland = Boolean(display.wayland) || String(display.sessionType || '').toLowerCase() === 'wayland';
  const isX11 = Boolean(display.display) && !isWayland;
  const isDeepin = String(display.current || '').toLowerCase().includes('dde') || String(display.session || '').toLowerCase().includes('deepin');
  const packages = [];
  const build = [];
  const warnings = [];
  let restartDdeShell = false;

  if (target === 'live-wallpaper') {
    if (isDeepin && isX11 && (status.liveWallpaperMode === 'auto' || status.liveWallpaperMode === 'deepin-native-plugin')) {
      if (!commands.xprop?.ok || !commands.xwininfo?.ok) packages.push('x11-utils');
      if (!commands.xdotool?.ok) packages.push('xdotool');
      if (!commands.wmctrl?.ok) packages.push('wmctrl');

      if (!status.deepinNativeVideo?.ok) {
        const nativeVideo = status.deepinNativeVideo || {};
        const needsPluginBuild = !nativeVideo.pluginPath || !nativeVideo.configReadable || !nativeVideo.lifecyclePatchOk;
        const needsLibMpvDev = !nativeVideo.libMpv?.ok;

        if (needsPluginBuild) {
          build.push('dde-videowallpaper-plugin');
          packages.push(
            'git',
            'python3',
            'cmake',
            'make',
            'g++',
            'build-essential',
            'pkg-config',
            'libx11-dev',
            'qt6-base-dev',
            'qt6-base-dev-tools',
            'qt6-tools-dev',
            'qt6-tools-dev-tools',
            'qt6-l10n-tools',
            'dde-dconfig-daemon',
            'libdtkcommon-dev',
            'libdtkcore-dev',
            'libdtk6core-dev',
            'libdtk6gui-dev',
            'libdtk6widget-dev',
            'dde-file-manager-dev',
            'libdmr-dev',
            'libmpv-dev',
            'libdfm-io-dev',
            'libdfm-mount-dev',
            'libdfm6-io-dev',
            'libdfm6-mount-dev',
            'libdeepin-service-framework-dev',
          );
          warnings.push('deepin/DDE 自动模式使用原生视频壁纸插件；xwinwrap 会遮挡桌面图标，仅作为手动兼容模式。');
        } else if (needsLibMpvDev) {
          packages.push('libmpv-dev');
          restartDdeShell = true;
          warnings.push('deepin 原生视频壁纸插件已安装，但缺少 libmpv.so 兼容链接；安装 libmpv-dev 后会重启 DDE 桌面插件。');
        }
      } else {
        warnings.push('deepin/DDE 自动模式使用原生视频壁纸插件，视频应位于桌面图标后方。');
      }
    } else if (isDeepin && isX11 && status.liveWallpaperMode === 'xwinwrap-icon-overlay') {
      if (!commands.mpv?.ok) packages.push('mpv');
      if (!commands.xwinwrap?.ok) {
        build.push('xwinwrap');
        if (manager === 'apt') {
          packages.push('git', 'make', 'gcc', 'build-essential', 'pkg-config', 'libx11-dev', 'libxext-dev', 'libxrender-dev', 'x11proto-xext-dev');
        }
      }
      warnings.push('deepin/DDE xwinwrap 覆盖模式会遮挡桌面图标，仅适合不显示桌面图标时使用。');
    } else if (isDeepin && isX11 && status.liveWallpaperMode === 'deepin-embedded-mpv') {
      if (!commands.mpv?.ok) packages.push('mpv');
      if (!commands.wmctrl?.ok) packages.push('wmctrl');
      if (!commands.xprop?.ok || !commands.xwininfo?.ok) packages.push('x11-utils');
      if (!commands.xdotool?.ok) packages.push('xdotool');
      warnings.push('deepin/DDE 嵌入桌面模式会保留桌面图标，图标可能遮挡视频。');
    } else if (isWayland) {
      if (!commands.ffmpeg?.ok) packages.push('ffmpeg');
      if (!commands.mpvpaper?.ok) {
        packages.push('mpvpaper');
        warnings.push('如果当前发行版仓库没有 mpvpaper，需要手动配置或改用 X11 会话。');
      }
    } else {
      if (!commands.mpv?.ok) packages.push('mpv');
      if (!commands.ffmpeg?.ok) packages.push('ffmpeg');
      if (!commands.xprop?.ok || !commands.xwininfo?.ok) packages.push('x11-utils');
      if (!commands.xdotool?.ok) packages.push('xdotool');
      if (!commands.wmctrl?.ok) packages.push('wmctrl');
      if (!commands.feh?.ok) packages.push('feh');
      if (!commands.xwinwrap?.ok) {
        build.push('xwinwrap');
        if (manager === 'apt') {
          packages.push('git', 'make', 'gcc', 'build-essential', 'pkg-config', 'libx11-dev', 'libxext-dev', 'libxrender-dev', 'x11proto-xext-dev');
        } else {
          warnings.push('当前发行版未使用 apt，xwinwrap 可能需要按发行版安装 X11 开发包后源码构建。');
        }
      }
    }
  }

  return {
    target,
    desktop: isWayland ? 'wayland' : isX11 ? 'x11' : 'unknown',
    packageManager: manager || 'unknown',
    packages: [...new Set(packages)],
    build: [...new Set(build)],
    restartDdeShell,
    warnings,
    alreadyReady: target === 'live-wallpaper'
      && Boolean(status.capabilities?.videoWallpaper)
      && packages.length === 0
      && build.length === 0,
  };
}

async function createDependencyInstallScript(plan) {
  await fs.mkdir(INSTALLER_DIR, { recursive: true });
  const scriptPath = path.join(INSTALLER_DIR, `install-${plan.target}.sh`);
  const aptPackages = plan.packages.map(shellQuote).join(' ');
  const shouldBuildXwinwrap = plan.build.includes('xwinwrap');
  const shouldBuildDdeVideoWallpaper = plan.build.includes('dde-videowallpaper-plugin');
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `LOG=${shellQuote(DEP_INSTALL_LOG)}`,
    'mkdir -p "$(dirname "$LOG")"',
    'exec > >(tee -a "$LOG") 2>&1',
    'echo "========================================"',
    'echo "WaifuX Linux 依赖自动安装"',
    'date',
    'echo "========================================"',
    'echo',
    'if ! command -v sudo >/dev/null 2>&1; then',
    '  echo "当前系统缺少 sudo，无法自动安装系统依赖。"',
    '  exit 1',
    'fi',
    'sudo -v',
  ];

  if (plan.packageManager === 'apt') {
    lines.push(
      'echo "检测到 apt/deepin/Debian 系包管理器。"',
      'sudo apt-get update',
    );
    if (aptPackages) {
      lines.push(`sudo apt-get install -y ${aptPackages}`);
    }
  } else if (plan.packageManager === 'dnf') {
    const dnfPackages = plan.packages.map(shellQuote).join(' ');
    lines.push('echo "检测到 dnf 包管理器。"', dnfPackages ? `sudo dnf install -y ${dnfPackages}` : 'true');
  } else if (plan.packageManager === 'pacman') {
    const pacmanPackages = plan.packages.map(shellQuote).join(' ');
    lines.push('echo "检测到 pacman 包管理器。"', pacmanPackages ? `sudo pacman -Sy --needed --noconfirm ${pacmanPackages}` : 'true');
  } else if (plan.packageManager === 'zypper') {
    const zypperPackages = plan.packages.map(shellQuote).join(' ');
    lines.push('echo "检测到 zypper 包管理器。"', zypperPackages ? `sudo zypper --non-interactive install ${zypperPackages}` : 'true');
  } else {
    lines.push('echo "未识别可用包管理器，请手动安装依赖。"', 'exit 1');
  }

  if (shouldBuildXwinwrap) {
    lines.push(
      '',
      'if ! command -v xwinwrap >/dev/null 2>&1; then',
      '  echo "apt 仓库中通常没有 xwinwrap，开始从源码构建。"',
      `  BUILD_DIR=${shellQuote(path.join(CACHE_DIR, 'build', 'xwinwrap'))}`,
      '  rm -rf "$BUILD_DIR"',
      '  mkdir -p "$(dirname "$BUILD_DIR")"',
      `  git clone --depth 1 ${shellQuote(XWINWRAP_REPO)} "$BUILD_DIR"`,
      '  make -C "$BUILD_DIR"',
      '  sudo make -C "$BUILD_DIR" install',
      'else',
      '  echo "xwinwrap 已存在，跳过源码构建。"',
      'fi',
    );
  }

  if (shouldBuildDdeVideoWallpaper) {
    lines.push(
      '',
      'echo "开始编译 deepin 原生视频壁纸插件。"',
      `DDE_SRC=${shellQuote(path.join(CACHE_DIR, 'build', 'dde-file-manager-extensions'))}`,
      'if [ -d "$DDE_SRC/.git" ]; then',
      '  echo "发现已有 deepin 源码缓存，尝试快进更新。"',
      '  git -C "$DDE_SRC" pull --ff-only || echo "源码缓存存在本地补丁，继续使用当前缓存并重新写入 WaifuX 编译补丁。"',
      'elif [ -e "$DDE_SRC" ]; then',
      '  echo "源码缓存路径已经存在但不是 git 仓库：$DDE_SRC"',
      '  echo "请移走该目录后重新安装。"',
      '  exit 1',
      'else',
      `  git clone --depth 1 ${shellQuote(DDE_FILE_MANAGER_EXTENSIONS_REPO)} "$DDE_SRC"`,
      'fi',
      'mkdir -p "$DDE_SRC/assets/configs"',
      'cat > "$DDE_SRC/assets/configs/org.deepin.dde.file-manager.desktop.videowallpaper.json" <<\'JSON\'',
      '{',
      '  "magic": "dsg.config.meta",',
      '  "version": "1.0",',
      '  "contents": {',
      '    "enable": {',
      '      "value": false,',
      '      "serial": 0,',
      '      "flags": [],',
      '      "name": "Enable video wallpaper",',
      '      "name[zh_CN]": "启用视频壁纸",',
      '      "description": "Enable DDE desktop video wallpaper plugin.",',
      '      "description[zh_CN]": "启用 DDE 桌面视频壁纸插件。",',
      '      "permissions": "readwrite",',
      '      "visibility": "public"',
      '    }',
      '  }',
      '}',
      'JSON',
      'if ! grep -q "QT_NO_CREATE_VERSIONLESS_TARGETS" "$DDE_SRC/CMakeLists.txt"; then',
      '  sed -i "/set(CMAKE_CXX_STANDARD 17)/a set(QT_NO_CREATE_VERSIONLESS_TARGETS ON)" "$DDE_SRC/CMakeLists.txt"',
      'fi',
      'ENGINE_CPP="$DDE_SRC/src/dde-desktop/ddplugin-videowallpaper/wallpaperengine.cpp"',
      'if grep -q "CanvasCoreUnsubscribe(signal_DesktopFrame_WindowAboutToBeBuilded, &WallpaperEngine::onDetachWindows);" "$ENGINE_CPP"; then',
      '  sed -i "s|CanvasCoreUnsubscribe(signal_DesktopFrame_WindowAboutToBeBuilded, \\&WallpaperEngine::onDetachWindows);|CanvasCoreSubscribe(signal_DesktopFrame_WindowAboutToBeBuilded, \\&WallpaperEngine::onDetachWindows);|" "$ENGINE_CPP"',
      'fi',
      'if grep -q "CanvasCoreUnsubscribe(signal_DesktopFrame_WindowBuilded, &WallpaperEngine::onDetachWindows);" "$ENGINE_CPP"; then',
      '  sed -i "s|CanvasCoreUnsubscribe(signal_DesktopFrame_WindowBuilded, \\&WallpaperEngine::onDetachWindows);|CanvasCoreUnsubscribe(signal_DesktopFrame_WindowAboutToBeBuilded, \\&WallpaperEngine::onDetachWindows);|" "$ENGINE_CPP"',
      'fi',
      `python3 - "$ENGINE_CPP" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

if "forceDesktopWindowHints" not in text:
    text = text.replace(
        "#include <QDBusPendingReply>\\n#include <QDebug>",
        "#include <QDBusPendingReply>\\n#include <QGuiApplication>\\n#include <QScreen>\\n#include <QWindow>\\n#include <QDebug>\\n\\n#include <X11/Xatom.h>\\n#include <X11/Xlib.h>",
        1,
    )

    helper = r'''

static QRect x11RootGeometry()
{
    Display *display = XOpenDisplay(nullptr);
    if (display == nullptr)
        return QRect();

    const int screen = DefaultScreen(display);
    const QRect geometry(0, 0, DisplayWidth(display, screen), DisplayHeight(display, screen));
    XCloseDisplay(display);
    return geometry;
}

static QRect screenGeometry(QWidget *win)
{
    const QRect rootGeometry = x11RootGeometry();
    if (rootGeometry.isValid())
        return rootGeometry;

    if (win == nullptr)
        return QRect();

    QRect geometry = win->property(DesktopFrameProperty::kPropScreenGeometry).toRect();
    if (geometry.isValid())
        return geometry;

    if (QWindow *handle = win->windowHandle()) {
        if (QScreen *screen = handle->screen())
            return screen->geometry();
    }

    if (QScreen *screen = QGuiApplication::primaryScreen())
        return screen->geometry();

    return win->geometry();
}

static QRect fillGeometry(QWidget *win)
{
    const QRect full = screenGeometry(win);
    if (full.isValid())
        return QRect(QPoint(0, 0), full.size());

    return QRect(QPoint(0, 0), win->geometry().size());
}

static Atom x11Atom(Display *display, const char *name)
{
    return XInternAtom(display, name, False);
}

static void requestNetWmState(Display *display, Window window, Atom first, Atom second = None)
{
    XEvent event {};
    event.xclient.type = ClientMessage;
    event.xclient.display = display;
    event.xclient.window = window;
    event.xclient.message_type = x11Atom(display, "_NET_WM_STATE");
    event.xclient.format = 32;
    event.xclient.data.l[0] = 1;
    event.xclient.data.l[1] = static_cast<long>(first);
    event.xclient.data.l[2] = static_cast<long>(second);
    event.xclient.data.l[3] = 1;
    event.xclient.data.l[4] = 0;

    XSendEvent(display,
               DefaultRootWindow(display),
               False,
               SubstructureRedirectMask | SubstructureNotifyMask,
               &event);
}

static void forceDesktopWindowHints(QWidget *win)
{
    if (win == nullptr)
        return;

    Display *display = XOpenDisplay(nullptr);
    if (display == nullptr)
        return;

    const Window window = static_cast<Window>(win->winId());
    const Atom desktopType = x11Atom(display, "_NET_WM_WINDOW_TYPE_DESKTOP");
    XChangeProperty(display, window, x11Atom(display, "_NET_WM_WINDOW_TYPE"), XA_ATOM, 32, PropModeReplace, reinterpret_cast<const unsigned char *>(&desktopType), 1);

    const unsigned long allDesktops = 0xffffffffUL;
    XChangeProperty(display, window, x11Atom(display, "_NET_WM_DESKTOP"), XA_CARDINAL, 32, PropModeReplace, reinterpret_cast<const unsigned char *>(&allDesktops), 1);

    const unsigned long motifNoDecorations[] = { 1UL << 1, 0, 0, 0, 0 };
    const Atom motifHints = x11Atom(display, "_MOTIF_WM_HINTS");
    XChangeProperty(display, window, motifHints, motifHints, 32, PropModeReplace, reinterpret_cast<const unsigned char *>(motifNoDecorations), 5);

    const unsigned long deepinNoTitlebar = 1;
    XChangeProperty(display, window, x11Atom(display, "_DEEPIN_NO_TITLEBAR"), XA_CARDINAL, 32, PropModeReplace, reinterpret_cast<const unsigned char *>(&deepinNoTitlebar), 1);

    const unsigned long deepinForceDecorate = 0;
    XChangeProperty(display, window, x11Atom(display, "_DEEPIN_FORCE_DECORATE"), XA_CARDINAL, 32, PropModeReplace, reinterpret_cast<const unsigned char *>(&deepinForceDecorate), 1);

    const Atom fullscreen = x11Atom(display, "_NET_WM_STATE_FULLSCREEN");
    const Atom below = x11Atom(display, "_NET_WM_STATE_BELOW");
    const Atom sticky = x11Atom(display, "_NET_WM_STATE_STICKY");
    const Atom skipTaskbar = x11Atom(display, "_NET_WM_STATE_SKIP_TASKBAR");
    const Atom skipPager = x11Atom(display, "_NET_WM_STATE_SKIP_PAGER");
    const Atom skipSwitcher = x11Atom(display, "_NET_WM_STATE_SKIP_SWITCHER");
    const Atom kdeSkipSwitcher = x11Atom(display, "_KDE_NET_WM_STATE_SKIP_SWITCHER");
    const Atom states[] = { fullscreen, below, sticky, skipTaskbar, skipPager, skipSwitcher, kdeSkipSwitcher };
    XChangeProperty(display, window, x11Atom(display, "_NET_WM_STATE"), XA_ATOM, 32, PropModeReplace, reinterpret_cast<const unsigned char *>(states), sizeof(states) / sizeof(states[0]));

    requestNetWmState(display, window, fullscreen, below);
    requestNetWmState(display, window, sticky, skipTaskbar);
    requestNetWmState(display, window, skipPager, skipSwitcher);
    XLowerWindow(display, window);
    XFlush(display);
    XCloseDisplay(display);
}

static void forceDesktopRootGeometry(QWidget *win)
{
    if (win == nullptr)
        return;

    forceDesktopWindowHints(win);

    const QRect full = screenGeometry(win);
    if (!full.isValid())
        return;

    const QRect target(full.topLeft(), full.size());
    win->setMinimumSize(full.size());
    win->setMaximumSize(QWIDGETSIZE_MAX, QWIDGETSIZE_MAX);
    win->setGeometry(target);
    win->move(target.topLeft());
    win->resize(target.size());

    if (QWindow *handle = win->windowHandle())
        handle->setGeometry(target);

    forceDesktopWindowHints(win);
}
'''

    marker = '''static QString getScreenName(QWidget *win)
{
    return win->property(DesktopFrameProperty::kPropScreenName).toString();
}
'''
    text = text.replace(marker, marker + helper, 1)

    text = text.replace(
        '''    bwp->setParent(root);
    QRect geometry = relativeGeometry(root->geometry());   // scaled area
    bwp->setGeometry(geometry);''',
        '''    forceDesktopRootGeometry(root);
    bwp->setParent(root);
    QRect geometry = fillGeometry(root);   // scaled area
    bwp->move(0, 0);
    bwp->setGeometry(geometry);
    bwp->setMinimumSize(geometry.size());
    bwp->resize(geometry.size());''',
        1,
    )
    text = text.replace(
        "        VideoProxyPointer bwp = d->widgets.value(screeName);",
        "        forceDesktopRootGeometry(primary);\\n        VideoProxyPointer bwp = d->widgets.value(screeName);",
        1,
    )
    text = text.replace(
        '''            QRect geometry = d->relativeGeometry(primary->geometry());   // scaled area
            bwp->setGeometry(geometry);''',
        '''            QRect geometry = fillGeometry(primary);   // scaled area
            bwp->move(0, 0);
            bwp->setGeometry(geometry);
            bwp->setMinimumSize(geometry.size());
            bwp->resize(geometry.size());''',
        1,
    )
    text = text.replace(
        '''        for (QWidget *win : root) {

            const QString screenName = getScreenName(win);''',
        '''        for (QWidget *win : root) {

            forceDesktopRootGeometry(win);
            const QString screenName = getScreenName(win);''',
        1,
    )
    text = text.replace(
        '''                QRect geometry = d->relativeGeometry(win->geometry());   // scaled area
                bwp->setGeometry(geometry);''',
        '''                QRect geometry = fillGeometry(win);   // scaled area
                bwp->move(0, 0);
                bwp->setGeometry(geometry);
                bwp->setMinimumSize(geometry.size());
                bwp->resize(geometry.size());''',
        1,
    )
    text = text.replace(
        '''        if (bw.get() != nullptr) {
            QRect geometry = d->relativeGeometry(win->geometry());   // scaled area
            bw->setGeometry(geometry);
        }''',
        '''        forceDesktopRootGeometry(win);
        if (bw.get() != nullptr) {
            QRect geometry = fillGeometry(win);   // scaled area
            bw->move(0, 0);
            bw->setGeometry(geometry);
            bw->setMinimumSize(geometry.size());
            bw->resize(geometry.size());
        }''',
        1,
    )

path.write_text(text)
PY`,
      'VIDEO_PROXY_CPP="$DDE_SRC/src/dde-desktop/ddplugin-videowallpaper/videoproxy.cpp"',
      'VIDEO_PROXY_H="$DDE_SRC/src/dde-desktop/ddplugin-videowallpaper/videoproxy.h"',
      'if ! grep -q "syncVideoFill" "$VIDEO_PROXY_H"; then',
      '  perl -0pi -e \'s/(void stop\\(\\);\\n)protected slots:/${1}protected:\\n    void resizeEvent(QResizeEvent *event) override;\\nprotected slots:/\' "$VIDEO_PROXY_H"',
      '  perl -0pi -e \'s/(private:\\n)(    QList<QUrl> playList;)/${1}    void syncVideoFill();\\n${2}/\' "$VIDEO_PROXY_H"',
      'fi',
      'if ! grep -q "keepaspect" "$VIDEO_PROXY_CPP"; then',
      '  perl -0pi -e \'s/(eng\\.setMute\\(true\\);\\n)/${1}    Q_UNUSED(eng)\\n/\' "$VIDEO_PROXY_CPP"',
      '  perl -0pi -e \'s/(setPalette\\(pal\\);\\n)/${1}    setAutoFillBackground(true);\\n    setContentsMargins(0, 0, 0, 0);\\n    setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);\\n/\' "$VIDEO_PROXY_CPP"',
      '  perl -0pi -e \'s/(_engine->setBackendProperty\\("keep-open", "yes"\\);\\n)/${1}    _engine->setBackendProperty("keepaspect", false);\\n    _engine->setBackendProperty("panscan", 1.0);\\n/\' "$VIDEO_PROXY_CPP"',
      '  perl -0pi -e \'s/(PlayerWidget::play\\([^\\n]+\\);\\n)/${1}    syncVideoFill();\\n/g\' "$VIDEO_PROXY_CPP"',
      '  perl -0pi -e \'s/(void VideoProxy::playNext\\(\\)\\n\\{)/void VideoProxy::resizeEvent(QResizeEvent *event)\\n{\\n    dmr::PlayerWidget::resizeEvent(event);\\n    syncVideoFill();\\n}\\n\\nvoid VideoProxy::syncVideoFill()\\n{\\n    if (!_engine || width() <= 0 || height() <= 0)\\n        return;\\n\\n    _engine->setBackendProperty("keepaspect", false);\\n    _engine->setBackendProperty("panscan", 1.0);\\n    _engine->setVideoAspect(static_cast<double>(width()) \\/ static_cast<double>(height()));\\n}\\n\\n${1}/\' "$VIDEO_PROXY_CPP"',
      'fi',
      'sed -i "s|--vo=gpu,x11|--vo=x11|g" "$VIDEO_PROXY_CPP"',
      'cat > "$DDE_SRC/src/dde-desktop/ddplugin-videowallpaper/CMakeLists.txt" <<\'CMAKE\'',
      'cmake_minimum_required(VERSION 3.10)',
      '',
      'project(ddplugin-videowallpaper)',
      '',
      'set(CMAKE_INCLUDE_CURRENT_DIR ON)',
      '',
      'FILE(GLOB_RECURSE SRC_FILES',
      '    "${CMAKE_CURRENT_SOURCE_DIR}/*.h"',
      '    "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp"',
      '    "${CMAKE_CURRENT_SOURCE_DIR}/*.json"',
      ')',
      '',
      'find_package(PkgConfig REQUIRED)',
      'find_package(dfm6-base REQUIRED)',
      'find_package(dfm6-framework REQUIRED)',
      'find_package(Qt6 REQUIRED COMPONENTS Core Widgets Concurrent DBus)',
      'find_package(Dtk6 COMPONENTS Core REQUIRED)',
      'pkg_search_module(libdmr REQUIRED libdmr)',
      'pkg_search_module(x11 REQUIRED x11)',
      '',
      'add_definitions(-DUSE_LIBDMR)',
      'set(Media_INCLUDE_DIRS ${libdmr_INCLUDE_DIRS} ${x11_INCLUDE_DIRS})',
      'set(Media_LIBRARIES ${libdmr_LIBRARIES} ${x11_LIBRARIES})',
      '',
      'file(GLOB TS_FILES "${CMAKE_CURRENT_SOURCE_DIR}/translations/ddplugin-videowallpaper*.ts")',
      'find_program(QT_LRELEASE_EXECUTABLE NAMES lrelease lrelease-qt6 PATHS /usr/lib/qt6/bin /usr/bin)',
      'if(QT_LRELEASE_EXECUTABLE)',
      '    foreach(TS_FILE ${TS_FILES})',
      '        execute_process(',
      '            COMMAND ${QT_LRELEASE_EXECUTABLE} ${TS_FILE}',
      '            WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}',
      '        )',
      '    endforeach()',
      'endif()',
      '',
      'qt_add_resources(QRC_RESOURCES ts.qrc)',
      '',
      'add_library(${PROJECT_NAME}',
      '    SHARED',
      '    ${SRC_FILES}',
      '    ${QRC_RESOURCES}',
      ')',
      '',
      'set_target_properties(${PROJECT_NAME} PROPERTIES LIBRARY_OUTPUT_DIRECTORY ../../)',
      '',
      'target_include_directories(${PROJECT_NAME} PUBLIC',
      '    ${Dtk6Core_INCLUDE_DIRS}',
      '    ${dfm6-framework_INCLUDE_DIR}',
      '    ${dfm6-base_INCLUDE_DIR}',
      '    ${Media_INCLUDE_DIRS}',
      ')',
      '',
      'target_link_libraries(${PROJECT_NAME}',
      '    Qt6::Core',
      '    Qt6::Widgets',
      '    Qt6::Concurrent',
      '    Qt6::DBus',
      '    ${Dtk6Core_LIBRARIES}',
      '    ${dfm6-framework_LIBRARIES}',
      '    ${dfm6-base_LIBRARIES}',
      '    ${Media_LIBRARIES}',
      ')',
      '',
      'install(TARGETS',
      '    ${PROJECT_NAME}',
      '    LIBRARY',
      '    DESTINATION',
      '    ${DFM_PLUGIN_DESKTOP_EDGE_DIR}',
      ')',
      '',
      'dconfig_meta_files(APPID "org.deepin.dde.file-manager"',
      '    BASE "${CMAKE_SOURCE_DIR}/assets/configs"',
      '    FILES "${CMAKE_SOURCE_DIR}/assets/configs/org.deepin.dde.file-manager.desktop.videowallpaper.json"',
      ')',
      '',
      'SET(DEBIAN_PATH ${CMAKE_SOURCE_DIR}/debian)',
      'FILE(COPY debian/dde-desktop-videowallpaper-plugin.install DESTINATION ${DEBIAN_PATH})',
      'CMAKE',
      'rm -rf "$DDE_SRC/build"',
      'cmake -S "$DDE_SRC" -B "$DDE_SRC/build" -DCMAKE_BUILD_TYPE=Release -DOPT_ENABLE_VIDEOWALLPAPER=ON',
      'cmake --build "$DDE_SRC/build" --target ddplugin-videowallpaper -j"$(nproc)"',
      'PLUGIN_SO="$DDE_SRC/build/src/libddplugin-videowallpaper.so"',
      'if [ ! -f "$PLUGIN_SO" ]; then',
      '  PLUGIN_SO="$(find "$DDE_SRC/build" -name "libddplugin-videowallpaper.so" -print -quit)"',
      'fi',
      'if [ ! -f "$PLUGIN_SO" ]; then',
      '  echo "未找到编译产物，构建失败。"',
      '  find "$DDE_SRC/build" -name "*videowallpaper*.so" -print',
      '  exit 1',
      'fi',
      'CONFIG_SRC="$DDE_SRC/assets/configs/org.deepin.dde.file-manager.desktop.videowallpaper.json"',
      'DDE_PLUGIN_TARGET=/usr/lib/x86_64-linux-gnu/dde-file-manager/plugins/desktop-edge/libddplugin-videowallpaper.so',
      'DDE_CONFIG_TARGET=/usr/share/dsg/configs/org.deepin.dde.file-manager/org.deepin.dde.file-manager.desktop.videowallpaper.json',
      'PKG_DIR="$DDE_SRC/build/waifux-dde-video-wallpaper-plugin-pkg"',
      'DEB_PATH="$DDE_SRC/build/waifux-dde-video-wallpaper-plugin_1.0.11_amd64.deb"',
      'rm -rf "$PKG_DIR" "$DEB_PATH"',
      'install -d "$PKG_DIR/DEBIAN" "$PKG_DIR$(dirname "$DDE_PLUGIN_TARGET")" "$PKG_DIR$(dirname "$DDE_CONFIG_TARGET")"',
      'install -m 0644 "$PLUGIN_SO" "$PKG_DIR$DDE_PLUGIN_TARGET"',
      'install -m 0644 "$CONFIG_SRC" "$PKG_DIR$DDE_CONFIG_TARGET"',
      'cat > "$PKG_DIR/DEBIAN/control" <<\'CONTROL\'',
      'Package: waifux-dde-video-wallpaper-plugin',
      'Version: 1.0.11',
      'Section: graphics',
      'Priority: optional',
      'Architecture: amd64',
      'Maintainer: WaifuX Linux <waifux@example.invalid>',
      'Depends: dde-file-manager, dde-dconfig-daemon, libmpv-dev, libdmr, libx11-6',
      'Description: DDE native video wallpaper plugin for WaifuX',
      ' Installs the deepin desktop video wallpaper plugin built from official',
      ' dde-file-manager-extensions sources so WaifuX can play live wallpapers',
      ' under desktop icons on deepin/DDE.',
      'CONTROL',
      'dpkg-deb --root-owner-group --build "$PKG_DIR" "$DEB_PATH"',
      'echo "通过 deb 安装 DDE 视频壁纸插件：$DEB_PATH"',
      'if command -v apt-get >/dev/null 2>&1; then',
      '  sudo apt-get install -y "$DEB_PATH"',
      'else',
      '  sudo dpkg -i "$DEB_PATH"',
      'fi',
      'echo "插件安装位置：$DDE_PLUGIN_TARGET"',
      'systemctl --user restart dde-shell-plugin@org.deepin.ds.desktop.service || true',
      'sleep 3',
    );
  }

  if (plan.restartDdeShell && !shouldBuildDdeVideoWallpaper) {
    lines.push(
      '',
      'echo "刷新 DDE 桌面插件，让新安装的 libmpv.so 生效。"',
      'systemctl --user restart dde-shell-plugin@org.deepin.ds.desktop.service || true',
      'sleep 3',
    );
  }

  lines.push(
    '',
    'echo',
    'echo "安装完成，当前依赖状态："',
    'for c in dde-dconfig mpv ffmpeg xwinwrap mpvpaper xprop xwininfo xdotool wmctrl feh; do',
    '  if command -v "$c" >/dev/null 2>&1; then',
    '    printf "%-10s %s\\n" "$c" "$(command -v "$c")"',
    '  else',
    '    printf "%-10s 缺失\\n" "$c"',
    '  fi',
    'done',
    'if test -f /usr/lib/x86_64-linux-gnu/dde-file-manager/plugins/desktop-core/libddplugin-videowallpaper.so || test -f /usr/lib/x86_64-linux-gnu/dde-file-manager/plugins/desktop-edge/libddplugin-videowallpaper.so; then echo "DDE 原生视频壁纸插件已安装"; fi',
    'if ldconfig -p 2>/dev/null | grep -qE "^[[:space:]]*libmpv\\.so[[:space:]]"; then echo "libmpv.so 兼容链接可用"; else echo "libmpv.so 兼容链接缺失（deepin 原生插件可能仍无法播放）"; fi',
    'echo',
    'echo "可以回到 WaifuX 设置页点击重新检查。"',
  );

  await fs.writeFile(scriptPath, `${lines.join('\n')}\n`, { mode: 0o755 });
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

async function launchInstallerTerminal(scriptPath) {
  const command = `${shellQuote(scriptPath)}; status=$?; echo; if [ "$status" -eq 0 ]; then echo "WaifuX 依赖安装流程结束。"; else echo "WaifuX 依赖安装失败，退出码：$status"; fi; echo "日志：${DEP_INSTALL_LOG.replace(/"/g, '\\"')}"; echo; read -r -p "按回车关闭窗口..." _; exit "$status"`;
  const terminals = await availableTerminals();
  const attempts = [];
  for (const terminal of terminals) {
    const name = terminal.name;
    let args = null;
    if (name === 'gnome-terminal') args = ['--', 'bash', '-lc', command];
    else if (name === 'konsole') args = ['-e', 'bash', '-lc', command];
    else if (name === 'xfce4-terminal' || name === 'mate-terminal') args = ['--command', `bash -lc ${shellQuote(command)}`];
    else args = ['-e', 'bash', '-lc', command];

    attempts.push(`${name} ${args.join(' ')}`);
    try {
      const child = spawn(terminal.path, args, { detached: true, stdio: 'ignore' });
      child.unref();
      return { launched: true, terminal: name, attempts };
    } catch {
      // Try the next terminal.
    }
  }

  return { launched: false, terminal: '', attempts };
}

async function installDependencies(input = {}) {
  const status = await dependencyStatus();
  const plan = buildDependencyInstallPlan(status, input.target || 'live-wallpaper');
  if (plan.alreadyReady) {
    return {
      ok: true,
      installed: false,
      plan,
      status,
      message: '动态壁纸依赖已经可用，不需要安装。',
    };
  }
  if (input.dryRun) {
    return {
      ok: true,
      installed: false,
      dryRun: true,
      plan,
      status,
      message: '已生成自动安装计划，尚未执行。',
    };
  }

  const scriptPath = await createDependencyInstallScript(plan);
  const launched = await launchInstallerTerminal(scriptPath);
  if (!launched.launched) {
    throw new Error(`没有找到可用终端，无法打开自动安装流程。安装脚本已生成：${scriptPath}`);
  }

  return {
    ok: true,
    installed: false,
    plan,
    scriptPath,
    logPath: DEP_INSTALL_LOG,
    ...launched,
    message: `已打开 ${launched.terminal} 执行自动安装。请输入系统密码并等待完成。`,
  };
}

async function listFilesRecursive(root, allowedExts, baseUrlPrefix) {
  const items = [];
  if (!fssync.existsSync(root)) return items;
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (allowedExts.includes(path.extname(entry.name).toLowerCase())) {
        const stat = await fs.stat(full);
        const rel = path.relative(root, full).split(path.sep).map(encodeURIComponent).join('/');
        items.push({
          id: Buffer.from(full).toString('base64url'),
          name: entry.name,
          path: full,
          url: `${baseUrlPrefix}/${rel}`,
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }
    }
  };
  await walk(root);
  return items.sort((a, b) => b.mtime - a.mtime);
}

async function normalizeDownloadedMediaExtensions() {
  if (!fssync.existsSync(MEDIA_DIR)) return;
  const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.bin') continue;
    const source = path.join(MEDIA_DIR, entry.name);
    const handle = await fs.open(source, 'r');
    try {
      const sample = Buffer.alloc(32);
      const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
      const ext = extensionFromBuffer(sample.subarray(0, bytesRead));
      if (!['.mp4', '.webm'].includes(ext)) continue;
      const target = path.join(MEDIA_DIR, `${path.basename(entry.name, '.bin')}${ext}`);
      if (fssync.existsSync(target)) continue;
      await fs.rename(source, target);
    } finally {
      await handle.close();
    }
  }
}

async function listLibrary() {
  await ensureDirs();
  await normalizeDownloadedMediaExtensions();
  const legacyImages = await listFilesRecursive(DOWNLOAD_ROOT, ['.jpg', '.jpeg', '.png', '.webp', '.gif'], '/library/root');
  const wallpapers = await listFilesRecursive(WALLPAPER_DIR, ['.jpg', '.jpeg', '.png', '.webp', '.gif'], '/library/wallpapers');
  const wallpaperPaths = new Set(wallpapers.map((item) => item.path));
  const mergedWallpapers = wallpapers.concat(legacyImages.filter((item) => !wallpaperPaths.has(item.path) && path.dirname(item.path) === DOWNLOAD_ROOT));
  const media = await listFilesRecursive(MEDIA_DIR, ['.mp4', '.webm', '.mkv', '.mov'], '/library/media');
  const workshop = fssync.existsSync(WORKSHOP_DIR)
    ? (await fs.readdir(WORKSHOP_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ id: entry.name, name: entry.name, path: path.join(WORKSHOP_DIR, entry.name) }))
    : [];
  const state = await readState();
  return { wallpapers: mergedWallpapers, media, workshop, favorites: state.favorites, progress: state.progress };
}

async function serveLibraryFile(reqUrl, res) {
  const roots = {
    '/library/root/': DOWNLOAD_ROOT,
    '/library/wallpapers/': WALLPAPER_DIR,
    '/library/media/': MEDIA_DIR,
  };
  const prefix = Object.keys(roots).find((key) => reqUrl.pathname.startsWith(key));
  if (!prefix) {
    textResponse(res, 404, '未找到。');
    return;
  }
  const rel = decodeURIComponent(reqUrl.pathname.slice(prefix.length));
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
    textResponse(res, 400, '路径无效。');
    return;
  }
  const root = roots[prefix];
  const target = path.resolve(root, rel);
  if (!target.startsWith(path.resolve(root) + path.sep)) {
    textResponse(res, 403, '禁止访问。');
    return;
  }
  await serveFile(target, res);
}

async function importLibraryPath(input) {
  const sourcePath = path.resolve(input.path || '');
  if (!sourcePath || !fssync.existsSync(sourcePath)) throw new Error('导入路径不存在。');
  const stat = await fs.stat(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const videoExts = ['.mp4', '.webm', '.mkv', '.mov'];
  let targetRoot = IMPORT_DIR;
  if (stat.isFile() && imageExts.includes(ext)) targetRoot = WALLPAPER_DIR;
  if (stat.isFile() && videoExts.includes(ext)) targetRoot = MEDIA_DIR;
  if (input.type === 'workshop') targetRoot = WORKSHOP_DIR;
  const target = path.join(targetRoot, path.basename(sourcePath));
  if (stat.isDirectory()) {
    await fs.rm(target, { recursive: true, force: true });
    await fs.cp(sourcePath, target, { recursive: true });
  } else {
    await fs.copyFile(sourcePath, target);
  }
  return { path: target };
}

async function openWithXdg(target) {
  if (await commandExists('xdg-open')) {
    const child = spawn('xdg-open', [target], { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  }
  return false;
}

async function serveFile(filePath, res) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    }[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'cache-control': type.startsWith('text/html') ? 'no-store' : 'private, max-age=3600',
      'content-length': data.length,
    });
    res.end(data);
  } catch {
    textResponse(res, 404, '未找到。');
  }
}

async function serveStatic(reqUrl, res) {
  let pathname = decodeURIComponent(reqUrl.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname.includes('..')) {
    textResponse(res, 400, '路径无效。');
    return;
  }
  const target = path.resolve(STATIC_DIR, pathname.replace(/^\/+/, ''));
  if (!target.startsWith(path.resolve(STATIC_DIR) + path.sep) && target !== path.resolve(STATIC_DIR)) {
    textResponse(res, 403, '禁止访问。');
    return;
  }
  await serveFile(target, res);
}

async function handleSettings(req, res) {
  if (req.method === 'GET') {
    const state = await readState();
    jsonResponse(res, 200, { data: publicSettings(state) });
    return;
  }
  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const allowed = {};
    for (const key of ['language', 'grainTexture', 'wallpaperSource', 'steamcmdPath', 'wallpaperEngineRendererPath', 'liveWallpaperMode']) {
      if (Object.prototype.hasOwnProperty.call(body, key)) allowed[key] = body[key];
    }
    if (Object.prototype.hasOwnProperty.call(body, 'wallpaperApiKey')) {
      const value = String(body.wallpaperApiKey || '').trim();
      if (value && value !== '********') allowed.wallpaperApiKey = value;
      if (!value) allowed.wallpaperApiKey = '';
    }
    const next = await patchState(allowed);
    jsonResponse(res, 200, { ok: true, data: publicSettings(next) });
    return;
  }
  jsonResponse(res, 405, { error: '方法不支持。' });
}

async function handleApi(req, res, reqUrl) {
  if (req.method === 'GET' && reqUrl.pathname === '/api/bootstrap') {
    const state = await readState();
    jsonResponse(res, 200, {
      version: packageVersion(),
      language: state.language,
      paths: {
        pictures: PICTURES_DIR,
        downloads: DOWNLOAD_ROOT,
        wallpapers: WALLPAPER_DIR,
        media: MEDIA_DIR,
        workshop: WORKSHOP_DIR,
        videos: VIDEOS_DIR,
        ddeVideoWallpaper: DDE_VIDEO_WALLPAPER_DIR,
        appData: APP_DIR,
        cache: CACHE_DIR,
      },
      settings: publicSettings(state),
      deps: await dependencyStatus(),
    });
    return;
  }

  if (reqUrl.pathname === '/api/settings') {
    await handleSettings(req, res);
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/deps/check') {
    jsonResponse(res, 200, { data: await dependencyStatus() });
    return;
  }
  if (req.method === 'POST' && reqUrl.pathname === '/api/deps/check') {
    jsonResponse(res, 200, { data: await dependencyStatus() });
    return;
  }
  if (req.method === 'POST' && reqUrl.pathname === '/api/deps/install') {
    jsonResponse(res, 200, { data: await installDependencies(await readJsonBody(req)) });
    return;
  }

  if (req.method === 'GET' && (reqUrl.pathname === '/api/wallpapers/search' || reqUrl.pathname === '/api/search')) {
    jsonResponse(res, 200, await searchWallpapers(reqUrl.searchParams));
    return;
  }

  const wallpaperDetailMatch = reqUrl.pathname.match(/^\/api\/wallpapers\/([^/]+)$/);
  if (req.method === 'GET' && wallpaperDetailMatch) {
    jsonResponse(res, 200, { data: await getWallpaperDetail(decodeURIComponent(wallpaperDetailMatch[1])) });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/wallpapers/download') {
    const result = await downloadWallpaperFromItem(await readJsonBody(req));
    jsonResponse(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === 'POST' && (reqUrl.pathname === '/api/wallpapers/apply' || reqUrl.pathname === '/api/set-wallpaper')) {
    const body = await readJsonBody(req);
    const download = body.path ? { path: body.path, item: body.item || body.wallpaper || null } : await downloadWallpaperFromItem(body);
    const result = await setLinuxWallpaper(download.path);
    await patchState({ lastWallpaper: { path: download.path, appliedAt: new Date().toISOString() } });
    jsonResponse(res, 200, { ok: true, path: download.path, ...result });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/set-local') {
    const body = await readJsonBody(req);
    if (!body.path) throw new Error('缺少本地文件路径。');
    const result = await setLinuxWallpaper(body.path);
    await patchState({ lastWallpaper: { path: body.path, appliedAt: new Date().toISOString() } });
    jsonResponse(res, 200, { ok: true, path: body.path, ...result });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/media/feed') {
    jsonResponse(res, 200, await mediaFeed(reqUrl.searchParams));
    return;
  }

  const mediaDetailMatch = reqUrl.pathname.match(/^\/api\/media\/([^/]+)$/);
  if (req.method === 'GET' && mediaDetailMatch) {
    jsonResponse(res, 200, { data: await mediaDetail(decodeURIComponent(mediaDetailMatch[1])) });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/media/download') {
    const result = await downloadMedia(await readJsonBody(req));
    jsonResponse(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/media/apply-live') {
    const body = await readJsonBody(req);
    const download = body.path ? { path: body.path } : await downloadMedia(body);
    const result = await applyVideoWallpaper(download.path);
    await patchState({ lastLiveWallpaper: { type: 'video', path: download.path, appliedAt: new Date().toISOString() } });
    jsonResponse(res, 200, { ok: true, path: download.path, ...result });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/media/stop-live') {
    await stopLiveWallpaper();
    jsonResponse(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/anime/trending') {
    jsonResponse(res, 200, await animeTrending(reqUrl.searchParams));
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/anime/search') {
    jsonResponse(res, 200, await animeSearch(reqUrl.searchParams));
    return;
  }

  const animeDetailMatch = reqUrl.pathname.match(/^\/api\/anime\/([^/]+)$/);
  if (req.method === 'GET' && animeDetailMatch) {
    jsonResponse(res, 200, { data: await animeDetail(decodeURIComponent(animeDetailMatch[1])) });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/anime/extract-video') {
    jsonResponse(res, 200, await extractAnimeVideo(await readJsonBody(req)));
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/anime/progress') {
    const body = await readJsonBody(req);
    if (!body.animeId) throw new Error('缺少 animeId。');
    const state = await readState();
    state.progress[String(body.animeId)] = {
      episodeId: body.episodeId || '',
      episodeName: body.episodeName || '',
      position: Number(body.position || 0),
      duration: Number(body.duration || 0),
      updatedAt: new Date().toISOString(),
    };
    await writeState(state);
    jsonResponse(res, 200, { ok: true, data: state.progress[String(body.animeId)] });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/workshop/search') {
    jsonResponse(res, 200, await workshopSearch(reqUrl.searchParams));
    return;
  }

  const workshopDetailMatch = reqUrl.pathname.match(/^\/api\/workshop\/([^/]+)$/);
  if (req.method === 'GET' && workshopDetailMatch) {
    jsonResponse(res, 200, { data: await workshopDetail(decodeURIComponent(workshopDetailMatch[1])) });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/workshop/download') {
    const body = await readJsonBody(req);
    const result = await downloadWorkshop(body.id || body.item?.id);
    jsonResponse(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/workshop/apply') {
    const result = await applyWorkshop(await readJsonBody(req));
    jsonResponse(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/library') {
    jsonResponse(res, 200, { data: await listLibrary() });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/library/import') {
    jsonResponse(res, 200, { ok: true, ...(await importLibraryPath(await readJsonBody(req))) });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/open-library') {
    const opened = await openWithXdg(DOWNLOAD_ROOT);
    jsonResponse(res, opened ? 200 : 500, {
      ok: opened,
      path: DOWNLOAD_ROOT,
      error: opened ? undefined : '当前系统未找到 xdg-open，无法打开文件夹。',
    });
    return;
  }

  jsonResponse(res, 404, { error: '未知 API 接口。' });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${DEFAULT_PORT}`}`);
    try {
      if (reqUrl.pathname.startsWith('/api/')) {
        await handleApi(req, res, reqUrl);
        return;
      }
      if (reqUrl.pathname.startsWith('/library/')) {
        await serveLibraryFile(reqUrl, res);
        return;
      }
      await serveStatic(reqUrl, res);
    } catch (error) {
      const status = reqUrl.pathname.startsWith('/api/') ? 500 : 500;
      if (reqUrl.pathname.startsWith('/api/')) {
        jsonResponse(res, status, { error: error.message || String(error) });
      } else {
        textResponse(res, status, error.stack || error.message || String(error));
      }
    }
  });
}

function listen(server, preferredPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port, attemptsLeft) => {
      const onError = (error) => {
        server.off('listening', onListening);
        if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
          tryPort(port + 1, attemptsLeft - 1);
        } else {
          reject(error);
        }
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, HOST);
    };
    tryPort(preferredPort, 20);
  });
}

async function startServer(options = {}) {
  await ensureDirs();
  const port = Number(options.port) || DEFAULT_PORT;
  const server = createServer();
  const actualPort = await listen(server, port);
  const url = `http://${HOST}:${actualPort}/`;
  if (options.open) await openWithXdg(url);
  return { server, url, port: actualPort };
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }
  const handle = await startServer(options);
  console.log(`WaifuX Linux API 已启动: ${handle.url}`);
  console.log(`下载目录: ${DOWNLOAD_ROOT}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_PORT,
  createServer,
  startServer,
  paths: {
    APP_DIR,
    CACHE_DIR,
    DOWNLOAD_ROOT,
    WALLPAPER_DIR,
    MEDIA_DIR,
    WORKSHOP_DIR,
    VIDEOS_DIR,
    DDE_VIDEO_WALLPAPER_DIR,
  },
};
