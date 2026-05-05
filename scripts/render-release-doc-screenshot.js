#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VERSION = require(path.join(ROOT, 'linux', 'package.json')).version;
const SERVER_PATH = path.join(ROOT, 'linux', 'waifux-linux.js');
const SERVER_SOURCE = fs.readFileSync(SERVER_PATH, 'utf8');
const PLUGIN_VERSION = SERVER_SOURCE.match(/DDE_VIDEO_PLUGIN_MIN_VERSION = '([^']+)'/)?.[1] || '1.0.11';
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots');
const OUT_SVG = path.join(OUT_DIR, `waifux-linux-${VERSION}-install-guide.svg`);
const OUT_PNG = path.join(OUT_DIR, `waifux-linux-${VERSION}-install-guide.png`);

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const elements = [];

function rect(x, y, width, height, fill, stroke = '#171717', strokeWidth = 3, rx = 0) {
  elements.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
}

function line(x1, y1, x2, y2, color = '#171717', width = 4) {
  elements.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`);
}

function text(x, y, value, size = 24, weight = 400, fill = '#171717', family = 'Source Han Sans SC, Noto Sans CJK SC, Arial, sans-serif') {
  elements.push(`<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`);
}

function paragraph(x, y, width, value, size = 24, lineHeight = 38, fill = '#171717') {
  const maxUnits = Math.max(8, Math.floor(width / size));
  let current = '';
  let currentUnits = 0;
  const lines = [];

  for (const char of value) {
    const units = /[\u2e80-\u9fff]/.test(char) ? 1 : /\s/.test(char) ? 0.45 : 0.58;
    if (current && currentUnits + units > maxUnits) {
      lines.push(current.trimEnd());
      current = '';
      currentUnits = 0;
    }
    if (!current && /\s/.test(char)) {
      continue;
    }
    current += char;
    currentUnits += units;
  }

  if (current) lines.push(current.trimEnd());

  lines.forEach((item, index) => text(x, y + index * lineHeight, item, size, 400, fill));
  return y + Math.max(1, lines.length) * lineHeight;
}

function codeBlock(x, y, width, lines) {
  const fontSize = 19;
  const height = 34 + lines.length * 34;
  rect(x, y, width, height, '#101820', '#101820', 0);
  rect(x, y, 10, height, '#f2b84b', '#f2b84b', 0);
  lines.forEach((item, index) => text(x + 28, y + 40 + index * 34, item, fontSize, 400, '#edf7f6', 'DejaVu Sans Mono, monospace'));
  return y + height;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

elements.push('<defs>');
elements.push('<linearGradient id="bg" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#fffaf1" offset="0"/><stop stop-color="#f6f7f3" offset=".52"/><stop stop-color="#eef4f6" offset="1"/></linearGradient>');
elements.push('<linearGradient id="soft" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#1b5e60" stop-opacity=".12" offset="0"/><stop stop-color="#1b5e60" stop-opacity="0" offset=".42"/></linearGradient>');
elements.push('</defs>');
rect(0, 0, 1280, 1600, 'url(#bg)', 'none', 0);
rect(0, 0, 1280, 1600, 'url(#soft)', 'none', 0);

text(88, 132, 'WaifuX Linux', 72, 800);
text(88, 216, VERSION, 72, 800);
text(88, 270, '发布包安装说明 / deepin DDE 动态壁纸补丁', 27, 500, '#33585f');
rect(964, 96, 228, 142, '#dff2ee');
text(995, 154, 'Linux Only', 35, 800);
text(985, 196, 'amd64 Debian package', 16, 500, '#3d4d50');
line(88, 322, 1192, 322);

let y = 376;
rect(88, y, 1104, 238, 'rgba(255,255,255,.78)');
text(120, y + 52, '推荐安装', 32, 800);
paragraph(120, y + 92, 1000, '下载 GitHub Release 中的压缩包，解压后执行安装脚本：', 23, 36, '#243437');
codeBlock(120, y + 126, 1012, [
  `tar -xzf waifux-linux-${VERSION}-amd64.tar.gz`,
  `cd waifux-linux-${VERSION}-amd64`,
  './install.sh',
]);

y = 652;
rect(88, y, 532, 372, 'rgba(255,255,255,.78)');
text(120, y + 52, '包含文件', 32, 800);
const fileItems = [
  [`waifux-linux_${VERSION}_amd64.deb`, 'WaifuX Linux 主程序'],
  [`waifux-dde-video-wallpaper-plugin_${PLUGIN_VERSION}_amd64.deb`, 'deepin/DDE 原生视频壁纸插件'],
  ['install.sh', '自动安装主程序，并在 DDE 环境安装插件'],
  ['SHA256SUMS', '发布文件校验信息'],
];
let fileY = y + 92;
for (const [name, desc] of fileItems) {
  rect(120, fileY, 468, 58, '#f9fbf8', '#243437', 2);
  text(138, fileY + 25, name, 13, 800, '#171717', 'DejaVu Sans Mono, Source Han Sans SC, monospace');
  text(138, fileY + 48, desc, 17, 400, '#455');
  fileY += 70;
}

rect(660, y, 532, 372, '#fff2c7');
text(692, y + 52, 'deepin/DDE 动态壁纸', 32, 800);
paragraph(692, y + 100, 456, 'deepin/DDE X11 用户需要插件包，视频才能在桌面图标后方播放。安装脚本会自动检测并重启 DDE 桌面插件。', 24, 42, '#243437');

y = 1060;
rect(88, y, 1104, 252, 'rgba(255,255,255,.78)');
text(120, y + 52, '手动安装 deepin/DDE 插件', 32, 800);
codeBlock(120, y + 86, 1012, [
  `sudo apt-get install -y ./waifux-linux_${VERSION}_amd64.deb`,
  `sudo apt-get install -y ./waifux-dde-video-wallpaper-plugin_${PLUGIN_VERSION}_amd64.deb`,
  'systemctl --user restart dde-shell-plugin@org.deepin.ds.desktop.service',
]);

y = 1322;
rect(88, y, 1104, 188, 'rgba(255,255,255,.78)');
text(120, y + 52, '本版修复', 32, 800);
const fixes = [
  '移除 macOS 路径，只保留 Linux 版本。',
  'DDE 动态壁纸使用原生插件，不抽帧，不像 PPT。',
  '修复任务栏窗口、视频黑屏和顶部 40px 黑边问题。',
  '屏幕尺寸动态读取，支持非 1920x1080 显示器。',
];
fixes.forEach((item, index) => text(136, y + 84 + index * 27, `• ${item}`, 20, 400, '#243437'));

text(88, 1558, 'GitHub: Villode/WaifuX-Linux', 18, 400, '#526064');
text(780, 1558, 'Generated by scripts/render-release-doc-screenshot.js', 16, 400, '#526064');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1600" viewBox="0 0 1280 1600">
${elements.join('\n')}
</svg>
`;

fs.writeFileSync(OUT_SVG, svg);
execFileSync('rsvg-convert', ['-w', '1280', '-h', '1600', '-o', OUT_PNG, OUT_SVG], { stdio: 'inherit' });
console.log(OUT_PNG);
