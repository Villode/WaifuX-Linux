'use strict';

const viewHost = document.getElementById('viewHost');
const detailLayer = document.getElementById('detailLayer');
const toastHost = document.getElementById('toastHost');
const settingsBtn = document.getElementById('settingsBtn');

const initialTab = new URLSearchParams(window.location.search).get('tab') || 'home';

const state = {
  tab: initialTab,
  settingsTab: 'general',
  bootstrap: null,
  wallpaperQuery: '',
  wallpaperSource: 'auto',
  wallpaperSorting: 'date_added',
  wallpaperPurity: '100',
  wallpaperCategories: '111',
  wallpaperRatios: '',
  wallpaperResolution: '',
  wallpaperColor: '',
  wallpaperResultSource: 'wallhaven',
  mediaQuery: '',
  mediaMode: 'motion',
  animeQuery: '',
  workshopQuery: '',
  wallpapers: [],
  media: [],
  anime: [],
  workshop: [],
  library: null,
  loading: false,
  depInstallResult: null,
};

const cn = {
  tabs: {
    home: '首页',
    wallpaper: '壁纸',
    media: '媒体',
    anime: '动漫',
    library: '我的',
  },
};

const wallpaperQuickFilters = [
  { label: '4K', key: 'wallpaperResolution', value: '3840x2160' },
  { label: '超宽屏', key: 'wallpaperRatios', value: '21x9,32x9' },
  { label: '21:9', key: 'wallpaperRatios', value: '21x9' },
  { label: '32:9', key: 'wallpaperRatios', value: '32x9' },
  { label: '16:9', key: 'wallpaperRatios', value: '16x9' },
  { label: '竖图', key: 'wallpaperRatios', value: '9x16' },
];

const wallpaperCategories = [
  { label: '全部', icon: icon('spark'), value: '111', tone: 'all' },
  { label: '一般', icon: icon('image'), value: '100', tone: 'general' },
  { label: '动漫', icon: icon('smile'), value: '010', tone: 'anime' },
  { label: '人物', icon: icon('user'), value: '001', tone: 'people' },
];

const wallpaperPurities = [
  { title: 'SFW', copy: '安全内容', value: '100', tone: 'sfw' },
  { title: 'Sketchy', copy: '轻度敏感', value: '110', tone: 'sketchy' },
  { title: 'NSFW', copy: '成人内容', value: '111', tone: 'nsfw' },
];

const wallpaperColors = ['990000', 'ea4c88', '993399', '0066cc', '0099cc', '66cccc', '669900', '999900', 'ffff00', 'ff9900', 'ff6600', '424153'];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attr(value) {
  return escapeHtml(value).replace(/\n/g, ' ');
}

function formatBytes(size) {
  const value = Number(size || 0);
  if (!value) return '未知';
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function shortPath(value) {
  const text = String(value || '');
  if (text.length <= 54) return text;
  return `…${text.slice(-53)}`;
}

function imageHtml(src, alt) {
  if (!src) {
    return '<div class="status-box"><div><strong>暂无预览</strong><span>等待数据源返回图片</span></div></div>';
  }
  return `<img src="${attr(src)}" alt="${attr(alt)}" loading="lazy">`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text };
  }
  if (!response.ok) {
    throw new Error(payload.error || `请求失败：HTTP ${response.status}`);
  }
  return payload;
}

function post(path, body) {
  return api(path, { method: 'POST', body: JSON.stringify(body || {}) });
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 220);
  }, type === 'error' ? 7200 : 3800);
}

function setLoading(loading) {
  state.loading = loading;
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  render();
}

function statusBox(title, copy = '') {
  return `<div class="status-box"><div><strong>${escapeHtml(title)}</strong>${copy ? `<span>${escapeHtml(copy)}</span>` : ''}</div></div>`;
}

async function loadBootstrap() {
  state.bootstrap = await api('/api/bootstrap');
  state.wallpaperSource = state.bootstrap.settings?.wallpaperSource || 'auto';
}

async function loadHome() {
  setLoading(true);
  renderHome();
  const [wallpapers, media, anime] = await Promise.allSettled([
    api('/api/wallpapers/search?source=auto&page=1&sorting=favorites&purity=100&categories=111'),
    api('/api/media/feed?page=1'),
    api('/api/anime/trending?limit=12&page=1'),
  ]);
  if (wallpapers.status === 'fulfilled') state.wallpapers = wallpapers.value.data || [];
  if (media.status === 'fulfilled') state.media = media.value.data || [];
  if (anime.status === 'fulfilled') state.anime = anime.value.data || [];
  setLoading(false);
  renderHome();
  for (const result of [wallpapers, media, anime]) {
    if (result.status === 'rejected') toast(result.reason.message, 'error');
  }
}

async function loadWallpapers() {
  setLoading(true);
  renderWallpaper();
  const params = new URLSearchParams({
    source: state.wallpaperSource,
    page: '1',
    sorting: state.wallpaperSorting,
    purity: state.wallpaperPurity,
    categories: state.wallpaperCategories,
  });
  if (state.wallpaperRatios) params.set('ratios', state.wallpaperRatios);
  if (state.wallpaperResolution) params.set('resolutions', state.wallpaperResolution);
  if (state.wallpaperColor) params.set('colors', state.wallpaperColor);
  if (state.wallpaperQuery.trim()) params.set('q', state.wallpaperQuery.trim());
  try {
    const payload = await api(`/api/wallpapers/search?${params.toString()}`);
    state.wallpapers = payload.data || [];
    state.wallpaperResultSource = payload.source || state.wallpaperSource || 'wallhaven';
    if (payload.warning) toast(payload.warning);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
    renderWallpaper();
  }
}

async function loadMedia() {
  setLoading(true);
  renderMedia();
  try {
    if (state.mediaMode === 'workshop') {
      const params = new URLSearchParams({ page: '1' });
      if (state.workshopQuery.trim()) params.set('q', state.workshopQuery.trim());
      const payload = await api(`/api/workshop/search?${params.toString()}`);
      state.workshop = payload.data || [];
    } else {
      const params = new URLSearchParams({ page: '1' });
      if (state.mediaQuery.trim()) params.set('q', state.mediaQuery.trim());
      const payload = await api(`/api/media/feed?${params.toString()}`);
      state.media = payload.data || [];
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
    renderMedia();
  }
}

async function loadAnime() {
  setLoading(true);
  renderAnime();
  const endpoint = state.animeQuery.trim()
    ? `/api/anime/search?q=${encodeURIComponent(state.animeQuery.trim())}&limit=24&page=1`
    : '/api/anime/trending?limit=24&page=1';
  try {
    const payload = await api(endpoint);
    state.anime = payload.data || [];
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
    renderAnime();
  }
}

async function loadLibrary() {
  setLoading(true);
  renderLibrary();
  try {
    const payload = await api('/api/library');
    state.library = payload.data;
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
    renderLibrary();
  }
}

function render() {
  if (state.tab === 'home') renderHome();
  if (state.tab === 'wallpaper') renderWallpaper();
  if (state.tab === 'anime') renderAnime();
  if (state.tab === 'media') renderMedia();
  if (state.tab === 'library') renderLibrary();
}

function heroItem() {
  return state.wallpapers[0] || state.media[0] || null;
}

function renderHome() {
  const hero = heroItem();
  const heroImage = hero?.preview || hero?.image || hero?.thumbnail || hero?.poster || '';
  const title = hero?.title || 'WaifuX';
  viewHost.innerHTML = `
    <section class="home-page">
      <div class="home-hero">
        ${heroImage ? `<img class="hero-bg" src="${attr(heroImage)}" alt="${attr(title)}">` : ''}
        <div class="hero-content">
          <span class="eyebrow">ACG 一站式桌面应用 · Linux</span>
          <h1 class="hero-title">${escapeHtml(title)}</h1>
          <p class="hero-copy">按原 WaifuX 的沉浸式界面重建，整合静态壁纸、动态壁纸、动漫资料、Steam Workshop、本地图库和桌面设置能力。</p>
          <div class="hero-actions">
            <button class="primary-btn" data-nav="wallpaper">探索壁纸</button>
            <button class="secondary-btn" data-nav="media">动态壁纸</button>
            <button class="ghost-btn" data-action="open-library">打开下载目录</button>
          </div>
        </div>
      </div>

      <div class="home-rail">
        ${homeRail('精选壁纸', 'Wallhaven + 4KWallpapers 数据源', state.wallpapers, 'wallpaper')}
        ${homeRail('动态背景', 'MotionBGs 与 Wallpaper Engine 工作流', state.media, 'media')}
        ${homeRail('热门动漫', 'Bangumi 列表与后续视频解析入口', state.anime, 'anime')}
      </div>
    </section>
  `;

  if (!state.wallpapers.length && !state.media.length && !state.anime.length && !state.loading) {
    loadHome();
  }
}

function homeRail(title, copy, items, kind) {
  return `
    <section class="content-band">
      <div class="rail-header">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(copy)}</p>
        </div>
        <button class="ghost-btn" data-nav="${kind === 'anime' ? 'anime' : kind === 'media' ? 'media' : 'wallpaper'}">查看全部</button>
      </div>
      ${items.length ? `<div class="horizontal-grid">${items.slice(0, 12).map((item) => card(item, kind)).join('')}</div>` : statusBox(state.loading ? '正在加载' : '暂无内容', '请检查网络或稍后重试')}
    </section>
  `;
}

function card(item, kind) {
  if (kind === 'anime') return animeCard(item);
  if (kind === 'media') return mediaCard(item);
  return wallpaperCard(item);
}

function wallpaperCard(item) {
  return `
    <button class="wall-card" data-open="wallpaper" data-id="${attr(item.id)}">
      ${imageHtml(item.thumbnail || item.preview || item.image, item.title || item.id)}
      <span class="card-shade">
        <span class="card-title">
          <strong>${escapeHtml(item.title || item.id)}</strong>
          <span>${escapeHtml([item.source, item.resolution].filter(Boolean).join(' · '))}</span>
        </span>
        <span class="badge">${escapeHtml(item.resolution || '壁纸')}</span>
      </span>
    </button>
  `;
}

function mediaCard(item) {
  return `
    <button class="wall-card" data-open="media" data-id="${attr(item.id)}">
      ${imageHtml(item.poster || item.thumbnail, item.title)}
      <span class="card-shade">
        <span class="card-title">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.source === 'steam-workshop' ? 'Steam Workshop' : 'MotionBGs')}</span>
        </span>
        <span class="badge">${escapeHtml(item.resolution || item.type || '动态')}</span>
      </span>
    </button>
  `;
}

function workshopCard(item) {
  return `
    <button class="wall-card" data-open="workshop" data-id="${attr(item.id)}">
      ${imageHtml(item.poster || item.thumbnail, item.title)}
      <span class="card-shade">
        <span class="card-title">
          <strong>${escapeHtml(item.title)}</strong>
          <span>Steam Workshop · ${escapeHtml(item.id)}</span>
        </span>
        <span class="badge">${escapeHtml(item.type || 'WE')}</span>
      </span>
    </button>
  `;
}

function animeCard(item) {
  return `
    <button class="poster-card" data-open="anime" data-id="${attr(item.id)}">
      ${imageHtml(item.thumbnail, item.title)}
      <span class="card-shade">
        <span class="card-title">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml([item.rating ? `${item.rating} 分` : '', item.date].filter(Boolean).join(' · '))}</span>
        </span>
      </span>
    </button>
  `;
}

function renderWallpaper() {
  const heroImage = state.wallpapers[0]?.preview || state.wallpapers[0]?.thumbnail || '';
  const activeFilters = wallpaperActiveFilters();
  viewHost.innerHTML = `
    <section class="page wallpaper-page">
      ${heroImage ? `<img class="wallpaper-page-bg" src="${attr(heroImage)}" alt="">` : ''}
      <div class="wallpaper-vignette"></div>
      <div class="wallpaper-explorer">
        <div class="wallpaper-hero-copy">
          <div class="wallpaper-greeting">
            <strong>${escapeHtml(greeting())}</strong>
            <span>${escapeHtml(sourceName(state.wallpaperResultSource || state.wallpaperSource))}</span>
          </div>
          <h1>探索壁纸资源库</h1>

          <form class="wallpaper-search" data-form="wallpaper">
            <span class="search-icon">${icon('search')}</span>
            <input name="query" value="${attr(state.wallpaperQuery)}" placeholder="搜索...">
            <button class="wallpaper-refresh" type="button" data-action="refresh-wallpapers" title="刷新" aria-label="刷新">${icon('refresh')}</button>
          </form>

          <div class="wallpaper-filter-row compact">
            <span class="filter-label">热门:</span>
            ${wallpaperQuickFilters.map((filter) => wallpaperQuickChip(filter)).join('')}
            <label class="ratio-menu">
              ${icon('layout')}
              <span>比例</span>
              <select data-control="wallpaperRatios">
                ${option('', '全部比例', state.wallpaperRatios)}
                ${option('16x9', '16:9', state.wallpaperRatios)}
                ${option('21x9', '21:9', state.wallpaperRatios)}
                ${option('32x9', '32:9', state.wallpaperRatios)}
                ${option('9x16', '竖图', state.wallpaperRatios)}
              </select>
            </label>
          </div>

          <div class="wallpaper-filter-row category-row">
            ${wallpaperCategories.map((item) => wallpaperCategoryButton(item)).join('')}
          </div>

          <div class="wallpaper-section-label">内容级别</div>
          <div class="purity-row">
            ${wallpaperPurities.map((item) => wallpaperPurityButton(item)).join('')}
          </div>

          <div class="wallpaper-section-label">颜色筛选</div>
          <div class="color-row">
            ${wallpaperColors.map((color) => wallpaperColorButton(color)).join('')}
          </div>

          <div class="current-filter-row">
            <span>当前筛选</span>
            <button class="clear-filter" data-action="clear-wallpaper-filters">清除</button>
          </div>
          <div class="active-filter-row">
            ${activeFilters.map((item) => activeFilterChip(item)).join('')}
          </div>
        </div>

        <div class="wallpaper-result-head">
          <h2>${state.loading ? '正在加载壁纸' : `${state.wallpapers.length} 张壁纸`}</h2>
          <label class="wallpaper-sort">
            ${icon('sort')}
            <select data-control="wallpaperSorting">
              ${option('date_added', '最新', state.wallpaperSorting)}
              ${option('favorites', '收藏数', state.wallpaperSorting)}
              ${option('hot', '热门', state.wallpaperSorting)}
              ${option('views', '浏览量', state.wallpaperSorting)}
              ${option('random', '随机', state.wallpaperSorting)}
            </select>
          </label>
        </div>

        ${state.wallpapers.length ? `<div class="wallpaper-masonry">${state.wallpapers.map(wallpaperExploreCard).join('')}</div>` : statusBox(state.loading ? '正在加载壁纸' : '暂无壁纸', '试试切换数据源或关键词')}
      </div>
    </section>
  `;

  if (!state.wallpapers.length && !state.loading) loadWallpapers();
}

function wallpaperQuickChip(filter) {
  const active = state[filter.key] === filter.value;
  return `<button class="wallpaper-chip ${active ? 'active' : ''}" data-wall-filter="${attr(filter.key)}" data-value="${attr(active ? '' : filter.value)}">${escapeHtml(filter.label)}</button>`;
}

function wallpaperCategoryButton(item) {
  return `
    <button class="category-pill ${item.tone} ${state.wallpaperCategories === item.value ? 'active' : ''}" data-wall-filter="wallpaperCategories" data-value="${attr(item.value)}">
      <span>${item.icon}</span>
      <strong>${escapeHtml(item.label)}</strong>
    </button>
  `;
}

function wallpaperPurityButton(item) {
  return `
    <button class="purity-card ${item.tone} ${state.wallpaperPurity === item.value ? 'active' : ''}" data-wall-filter="wallpaperPurity" data-value="${attr(item.value)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.copy)}</span>
    </button>
  `;
}

function wallpaperColorButton(color) {
  const active = state.wallpaperColor === color;
  return `
    <button class="color-chip ${active ? 'active' : ''}" data-wall-filter="wallpaperColor" data-value="${attr(active ? '' : color)}" style="--chip-color: #${attr(color)}">
      <span></span>
      <strong>#${escapeHtml(color.toUpperCase())}</strong>
    </button>
  `;
}

function wallpaperActiveFilters() {
  const filters = [];
  const purity = wallpaperPurities.find((item) => item.value === state.wallpaperPurity);
  if (purity) filters.push({ label: purity.title, color: purity.tone === 'sfw' ? '#34c95a' : purity.tone === 'sketchy' ? '#f3a84b' : '#ea4c88', clear: 'wallpaperPurity', reset: '100' });
  const category = wallpaperCategories.find((item) => item.value === state.wallpaperCategories && item.value !== '111');
  if (category) filters.push({ label: category.label, color: '#6bb7ff', clear: 'wallpaperCategories', reset: '111' });
  const ratio = wallpaperQuickFilters.find((item) => item.key === 'wallpaperRatios' && item.value === state.wallpaperRatios);
  if (ratio) filters.push({ label: ratio.label, color: '#d5cf42', clear: 'wallpaperRatios', reset: '' });
  if (state.wallpaperResolution) filters.push({ label: '4K', color: '#ffffff', clear: 'wallpaperResolution', reset: '' });
  if (state.wallpaperColor) filters.push({ label: `#${state.wallpaperColor.toUpperCase()}`, color: `#${state.wallpaperColor}`, clear: 'wallpaperColor', reset: '' });
  if (state.wallpaperQuery.trim()) filters.push({ label: state.wallpaperQuery.trim(), color: '#9ac5ff', clear: 'wallpaperQuery', reset: '' });
  return filters;
}

function activeFilterChip(item) {
  return `
    <button class="active-filter" data-wall-clear="${attr(item.clear)}" data-reset="${attr(item.reset)}" style="--active-filter-color: ${attr(item.color)}">
      <span></span>
      <strong>${escapeHtml(item.label)}</strong>
      <em>×</em>
    </button>
  `;
}

function wallpaperExploreCard(item) {
  const category = categoryLabel(item.category);
  const purity = purityLabel(item.purity);
  return `
    <button class="wallpaper-tile" data-open="wallpaper" data-id="${attr(item.id)}">
      ${imageHtml(item.preview || item.thumbnail, item.title)}
      <span class="tile-tags">
        ${category ? `<span>${escapeHtml(category)}</span>` : ''}
        ${purity ? `<span>${escapeHtml(purity)}</span>` : ''}
      </span>
      <span class="tile-resolution">${escapeHtml(item.resolution || '壁纸')}</span>
    </button>
  `;
}

function categoryLabel(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'anime') return '动漫';
  if (text === 'people') return '人物';
  if (text === 'general') return '一般';
  return text ? text : '';
}

function purityLabel(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'sfw') return 'SFW';
  if (text === 'sketchy') return 'Sketchy';
  if (text === 'nsfw') return 'NSFW';
  return text ? text.toUpperCase() : '';
}

function sourceName(value) {
  const source = String(value || '').toLowerCase();
  if (source === '4kwallpapers') return '4KWallpapers';
  return 'Wallhaven';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function icon(name) {
  const icons = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.7 5.2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0-2a7.5 7.5 0 0 1 5.94 12.07l3.55 3.55-1.42 1.42-3.55-3.55A7.5 7.5 0 1 1 10.7 3.2Z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 7.1A7.8 7.8 0 0 0 5.1 9.5L3.3 8.6A9.8 9.8 0 0 1 19 5.7V3h2v6.7h-6.7v-2h3.4ZM6.3 16.9a7.8 7.8 0 0 0 12.6-2.4l1.8.9A9.8 9.8 0 0 1 5 18.3V21H3v-6.7h6.7v2H6.3Z"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 13.9 9l6.3 2-6.3 2L12 19.2 10.1 13l-6.3-2 6.3-2L12 2.8Zm6.2 13.4.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8.8-2.5ZM5.8 1.8l.8 2.5 2.5.8-2.5.8-.8 2.5L5 5.9l-2.5-.8L5 4.3l.8-2.5Z"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5Zm2 2v10h12V7H6Zm1.4 8 3.1-3.7 2.2 2.6 1.5-1.8 2.4 2.9H7.4Zm8.4-3.8a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z"/></svg>',
    smile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm-3.6 7.6h2V8.7h-2v1.9Zm5.2 0h2V8.7h-2v1.9Zm-5.2 3.1A4.2 4.2 0 0 0 12 16a4.2 4.2 0 0 0 3.6-2.3l-1.7-.9A2.3 2.3 0 0 1 12 14a2.3 2.3 0 0 1-1.9-1.2l-1.7.9Z"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 11c4.2 0 7.5 2.4 7.5 5.4v.6h-15v-.6c0-3 3.3-5.4 7.5-5.4Z"/></svg>',
    layout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5Zm2 2v10h4V7H6Zm6 0v10h6V7h-6Z"/></svg>',
    sort: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h2v12l2.3-2.3 1.4 1.4L8 19.8l-4.7-4.7 1.4-1.4L7 16V4Zm10 16h-2V8l-2.3 2.3-1.4-1.4L16 4.2l4.7 4.7-1.4 1.4L17 8v12Z"/></svg>',
  };
  return icons[name] || '';
}

function option(value, label, selected) {
  return `<option value="${attr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function segment(value, label, selected) {
  return `<button type="button" data-value="${attr(value)}" class="${value === selected ? 'active' : ''}">${escapeHtml(label)}</button>`;
}

function renderMedia() {
  const items = state.mediaMode === 'workshop' ? state.workshop : state.media;
  viewHost.innerHTML = `
    <section class="page">
      <div class="explore-layout">
        <div class="explore-main">
          <div class="explore-header">
            <div class="explore-title">
              <span class="eyebrow">Motion Background</span>
              <h1>媒体与动态壁纸</h1>
              <p>MotionBGs 视频动态壁纸、Steam Workshop 浏览、下载和 Linux 动态桌面依赖检测。</p>
            </div>
            <button class="secondary-btn" data-action="refresh-media">刷新</button>
          </div>
          <form class="search-row" data-form="media">
            <input class="field" name="query" value="${attr(state.mediaMode === 'workshop' ? state.workshopQuery : state.mediaQuery)}" placeholder="${state.mediaMode === 'workshop' ? '搜索 Steam Workshop' : '搜索 MotionBGs'}">
            <button class="primary-btn" type="submit">搜索</button>
          </form>
          ${items.length ? `<div class="wall-grid">${items.map((item) => state.mediaMode === 'workshop' ? workshopCard(item) : mediaCard(item)).join('')}</div>` : statusBox(state.loading ? '正在加载媒体' : '暂无媒体内容', '动态壁纸依赖状态可在设置中查看')}
        </div>
        <aside class="explore-panel">
          <div class="filter-grid">
            <label>内容源</label>
            <div class="segmented" data-segment="mediaMode">
              ${segment('motion', 'MotionBGs', state.mediaMode)}
              ${segment('workshop', 'Workshop', state.mediaMode)}
              ${segment('local', '本地', state.mediaMode)}
            </div>
          </div>
          <div class="filter-grid">
            <label>动态桌面说明</label>
              <p class="hero-copy">deepin/DDE X11 默认使用原生视频壁纸插件，让视频留在桌面图标后方；xwinwrap 仅作为会覆盖图标的手动兼容模式。</p>
          </div>
          <button class="ghost-btn" data-nav="library">查看本地媒体</button>
          <button class="danger-btn" data-action="stop-live">停止动态壁纸</button>
        </aside>
      </div>
    </section>
  `;

  if (!items.length && !state.loading && state.mediaMode !== 'local') loadMedia();
  if (state.mediaMode === 'local') loadLibrary().then(() => {
    state.mediaMode = 'local';
    renderLocalMedia();
  });
}

function renderLocalMedia() {
  const media = state.library?.media || [];
  viewHost.innerHTML = `
    <section class="page">
      <div class="explore-header">
        <div class="explore-title">
          <span class="eyebrow">Local Media</span>
          <h1>本地动态壁纸</h1>
          <p>${escapeHtml(state.bootstrap?.paths?.media || '')}</p>
        </div>
        <button class="secondary-btn" data-action="refresh-media">刷新</button>
      </div>
      ${media.length ? `<div class="library-grid">${media.map(localMediaCard).join('')}</div>` : statusBox('还没有本地媒体', '下载 MotionBGs 或导入本地视频后会显示在这里')}
    </section>
  `;
}

function renderAnime() {
  viewHost.innerHTML = `
    <section class="page">
      <div class="explore-header">
        <div class="explore-title">
          <span class="eyebrow">Bangumi</span>
          <h1>动漫探索</h1>
          <p>列表来自 Bangumi；详情页保留 Kazumi 规则解析入口，用于后续从剧集页面提取视频源。</p>
        </div>
        <button class="secondary-btn" data-action="refresh-anime">刷新</button>
      </div>
      <form class="search-row" data-form="anime">
        <input class="field" name="query" value="${attr(state.animeQuery)}" placeholder="搜索番剧、角色、标签">
        <button class="primary-btn" type="submit">搜索</button>
      </form>
      ${state.anime.length ? `<div class="poster-grid">${state.anime.map(animeCard).join('')}</div>` : statusBox(state.loading ? '正在加载动漫' : '暂无动漫内容', 'Bangumi 网络不可用时可能需要代理或稍后重试')}
    </section>
  `;

  if (!state.anime.length && !state.loading) loadAnime();
}

function renderLibrary() {
  const library = state.library || {};
  const wallpapers = library.wallpapers || [];
  const media = library.media || [];
  const workshop = library.workshop || [];
  viewHost.innerHTML = `
    <section class="page">
      <div class="explore-header">
        <div class="explore-title">
          <span class="eyebrow">My Library</span>
          <h1>我的库</h1>
          <p>下载目录：${escapeHtml(state.bootstrap?.paths?.downloads || '')}</p>
        </div>
        <div class="hero-actions">
          <button class="secondary-btn" data-action="refresh-library">刷新</button>
          <button class="ghost-btn" data-action="open-library">打开文件夹</button>
        </div>
      </div>

      <section class="content-band">
        <div class="rail-header"><div><h2>壁纸下载</h2><p>${wallpapers.length} 个文件</p></div></div>
        ${wallpapers.length ? `<div class="library-grid">${wallpapers.map(localWallpaperCard).join('')}</div>` : statusBox(state.loading ? '正在扫描' : '还没有壁纸下载', '下载后的图片会保存到 Pictures/WaifuX/Wallpapers')}
      </section>

      <section class="content-band">
        <div class="rail-header"><div><h2>媒体下载</h2><p>${media.length} 个视频</p></div></div>
        ${media.length ? `<div class="library-grid">${media.map(localMediaCard).join('')}</div>` : statusBox('还没有媒体下载', '动态壁纸视频会保存到 Pictures/WaifuX/Media')}
      </section>

      <section class="content-band">
        <div class="rail-header"><div><h2>Workshop 内容</h2><p>${workshop.length} 个项目</p></div></div>
        ${workshop.length ? `<div class="download-list">${workshop.map((item) => `<button class="list-button" data-local-workshop="${attr(item.id)}" data-path="${attr(item.path)}"><span>${escapeHtml(item.name)}</span><small>${escapeHtml(shortPath(item.path))}</small></button>`).join('')}</div>` : statusBox('还没有 Workshop 下载', '配置 SteamCMD 后可以下载到 Pictures/WaifuX/Workshop')}
      </section>
    </section>
  `;

  if (!state.library && !state.loading) loadLibrary();
}

function localWallpaperCard(item) {
  return `
    <button class="library-card" data-local-wallpaper="${attr(item.path)}">
      ${imageHtml(item.url, item.name)}
      <span class="card-shade">
        <span class="card-title"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(formatBytes(item.size))}</span></span>
        <span class="badge">本地</span>
      </span>
    </button>
  `;
}

function localMediaCard(item) {
  return `
    <button class="library-card" data-local-media="${attr(item.path)}">
      <video src="${attr(item.url)}" muted preload="metadata"></video>
      <span class="card-shade">
        <span class="card-title"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(formatBytes(item.size))}</span></span>
        <span class="badge">视频</span>
      </span>
    </button>
  `;
}

async function openWallpaper(id) {
  try {
    const payload = await api(`/api/wallpapers/${encodeURIComponent(id)}`);
    showWallpaperDetail(payload.data);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function showWallpaperDetail(item) {
  const image = item.preview || item.image || item.originalImage || item.thumbnail;
  showDetail(`
    <article class="detail-sheet">
      <button class="icon-button detail-close" data-detail="close">×</button>
      <section class="detail-hero">
        ${image ? `<img src="${attr(image)}" alt="${attr(item.title)}">` : ''}
        <div class="detail-content">
          <span class="eyebrow">${escapeHtml(item.source || 'Wallpaper')}</span>
          <h2>${escapeHtml(item.title || item.id)}</h2>
          <p>${escapeHtml((item.tags || []).slice(0, 10).join(' · ') || '静态壁纸详情')}</p>
        </div>
      </section>
      <section class="detail-body">
        <div class="meta-panel">
          ${metaGrid([
            ['分辨率', item.resolution],
            ['来源', item.source],
            ['分类', item.category],
            ['纯度', item.purity],
            ['文件类型', item.fileType],
            ['文件大小', item.fileSize ? formatBytes(item.fileSize) : '未知'],
          ])}
        </div>
        <aside class="actions-panel">
          <button class="primary-btn" data-detail="apply-wallpaper" data-id="${attr(item.id)}">下载并设为桌面</button>
          <button class="secondary-btn" data-detail="download-wallpaper" data-id="${attr(item.id)}">仅下载</button>
          <button class="ghost-btn" data-detail="open-source" data-url="${attr(item.url || item.image)}">打开来源</button>
        </aside>
      </section>
    </article>
  `, item);
}

async function openMedia(id) {
  try {
    const payload = await api(`/api/media/${encodeURIComponent(id)}`);
    showMediaDetail(payload.data);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function showMediaDetail(item) {
  const downloads = item.downloadOptions || [];
  showDetail(`
    <article class="detail-sheet">
      <button class="icon-button detail-close" data-detail="close">×</button>
      <section class="detail-hero">
        ${item.previewVideoURL ? `<video src="${attr(item.previewVideoURL)}" poster="${attr(item.poster || item.thumbnail)}" muted loop autoplay playsinline></video>` : imageHtml(item.poster || item.thumbnail, item.title)}
        <div class="detail-content">
          <span class="eyebrow">${escapeHtml(item.source || 'MotionBGs')}</span>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.summary || (item.tags || []).join(' · ') || '动态壁纸媒体详情')}</p>
        </div>
      </section>
      <section class="detail-body">
        <div class="meta-panel">
          ${metaGrid([
            ['分辨率', item.resolution || item.exactResolution],
            ['来源', item.source || 'MotionBGs'],
            ['标签', (item.tags || []).slice(0, 6).join(' · ')],
            ['下载源', `${downloads.length} 个`],
          ])}
          <h3>下载版本</h3>
          <div class="download-list">
            ${downloads.length ? downloads.map((option, index) => `<button class="list-button" data-detail="download-media-option" data-index="${index}"><span>${escapeHtml(option.label || '下载')}</span><small>${escapeHtml(option.fileSizeLabel || option.detailText || '')}</small></button>`).join('') : '<p class="hero-copy">没有解析到下载版本，将尝试使用预览视频。</p>'}
          </div>
        </div>
        <aside class="actions-panel">
          <button class="primary-btn" data-detail="apply-media">下载并设为动态桌面</button>
          <button class="secondary-btn" data-detail="download-media">仅下载</button>
          <button class="danger-btn" data-detail="stop-live">停止动态壁纸</button>
        </aside>
      </section>
    </article>
  `, item);
}

async function openWorkshop(id) {
  try {
    const payload = await api(`/api/workshop/${encodeURIComponent(id)}`);
    showWorkshopDetail(payload.data);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function showWorkshopDetail(item) {
  showDetail(`
    <article class="detail-sheet">
      <button class="icon-button detail-close" data-detail="close">×</button>
      <section class="detail-hero">
        ${imageHtml(item.poster || item.thumbnail, item.title)}
        <div class="detail-content">
          <span class="eyebrow">Steam Workshop · ${escapeHtml(item.id)}</span>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.summary || (item.tags || []).join(' · ') || 'Wallpaper Engine Workshop 内容')}</p>
        </div>
      </section>
      <section class="detail-body">
        <div class="meta-panel">
          ${metaGrid([
            ['类型', item.type],
            ['标签', (item.tags || []).slice(0, 8).join(' · ')],
            ['来源', 'Steam Workshop'],
            ['ID', item.id],
          ])}
        </div>
        <aside class="actions-panel">
          <button class="primary-btn" data-detail="download-workshop">用 SteamCMD 下载</button>
          <button class="secondary-btn" data-detail="apply-workshop">应用到动态桌面</button>
          <button class="ghost-btn" data-detail="open-source" data-url="${attr(item.pageURL)}">打开 Steam 页面</button>
        </aside>
      </section>
    </article>
  `, item);
}

async function openAnime(id) {
  try {
    const payload = await api(`/api/anime/${encodeURIComponent(id)}`);
    showAnimeDetail(payload.data);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function showAnimeDetail(item) {
  const episodes = item.episodes || [];
  showDetail(`
    <article class="detail-sheet">
      <button class="icon-button detail-close" data-detail="close">×</button>
      <section class="detail-hero">
        ${imageHtml(item.thumbnail, item.title)}
        <div class="detail-content">
          <span class="eyebrow">Bangumi · ${escapeHtml(item.rating ? `${item.rating} 分` : '动漫资料')}</span>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.summary || (item.tags || []).join(' · ') || '动漫详情')}</p>
        </div>
      </section>
      <section class="detail-body">
        <div class="meta-panel">
          ${metaGrid([
            ['原名', item.originalTitle],
            ['放送日期', item.date],
            ['评分', item.rating],
            ['排名', item.rank],
            ['标签', (item.tags || []).slice(0, 8).join(' · ')],
          ])}
          <h3>剧集</h3>
          <div class="episode-list">
            ${episodes.length ? episodes.map((ep) => `<button class="list-button" data-detail="anime-episode" data-episode="${attr(ep.id)}"><span>${escapeHtml(ep.name)}</span><small>${escapeHtml(ep.airdate || '')}</small></button>`).join('') : '<p class="hero-copy">Bangumi 暂未返回剧集列表。</p>'}
          </div>
        </div>
        <aside class="actions-panel">
          <p class="hero-copy">视频播放需要可访问的剧集页面。输入剧集页面地址后，会尝试提取 mp4 或 m3u8 视频源。</p>
          <input class="setting-input" data-anime-url placeholder="粘贴剧集页面 URL">
          <button class="primary-btn" data-detail="extract-anime-video">解析视频源</button>
          <button class="ghost-btn" data-detail="open-source" data-url="${attr(item.url)}">打开 Bangumi 页面</button>
        </aside>
      </section>
    </article>
  `, item);
}

function metaGrid(rows) {
  return `<div class="meta-grid">${rows.map(([label, value]) => `
    <div class="meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '未知')}</strong>
    </div>
  `).join('')}</div>`;
}

function showDetail(html, item) {
  detailLayer.classList.remove('hidden');
  detailLayer.innerHTML = html;
  detailLayer.currentItem = item;
}

function closeDetail() {
  detailLayer.classList.add('hidden');
  detailLayer.innerHTML = '';
  detailLayer.currentItem = null;
}

function renderSettings() {
  const settings = state.bootstrap?.settings || {};
  const deps = state.bootstrap?.deps || {};
  const paths = state.bootstrap?.paths || {};
  detailLayer.classList.remove('hidden');
  detailLayer.currentItem = null;
  detailLayer.innerHTML = `
    <article class="detail-sheet">
      <button class="icon-button detail-close" data-detail="close">×</button>
      <div class="settings-layout">
        <aside class="settings-sidebar">
          <nav class="settings-nav">
            ${settingsNav('general', '通用')}
            ${settingsNav('download', '下载')}
            ${settingsNav('workshop', 'Workshop')}
            ${settingsNav('deps', '依赖检查')}
            ${settingsNav('about', '关于')}
          </nav>
        </aside>
        <section class="settings-body">
          <div class="settings-title">
            <h2>${escapeHtml(settingsTitle())}</h2>
            <button class="secondary-btn" data-detail="save-settings">保存设置</button>
          </div>
          ${settingsPanel(settings, deps, paths)}
        </section>
      </div>
    </article>
  `;
}

function settingsNav(id, label) {
  return `<button data-settings-tab="${id}" class="${state.settingsTab === id ? 'active' : ''}">${escapeHtml(label)}</button>`;
}

function settingsTitle() {
  return {
    general: '通用',
    download: '下载',
    workshop: 'Workshop',
    deps: '依赖检查',
    about: '关于 WaifuX Linux',
  }[state.settingsTab] || '设置';
}

function settingsPanel(settings, deps, paths) {
  if (state.settingsTab === 'download') {
    return `
      <div class="settings-section">
        <h3>下载目录</h3>
        ${settingStatic('图片目录', paths.pictures)}
        ${settingStatic('WaifuX 下载根目录', paths.downloads)}
        ${settingStatic('壁纸目录', paths.wallpapers)}
        ${settingStatic('媒体目录', paths.media)}
        ${settingStatic('Workshop 目录', paths.workshop)}
        <button class="ghost-btn" data-action="open-library">打开下载目录</button>
      </div>
    `;
  }
  if (state.settingsTab === 'workshop') {
    return `
      <div class="settings-section">
        <h3>Steam 与 Wallpaper Engine</h3>
        ${settingInput('SteamCMD 路径', 'steamcmdPath', settings.steamcmdPath || '', '例如 /usr/games/steamcmd 或你自己的 steamcmd')}
        ${settingInput('Linux renderer 路径', 'wallpaperEngineRendererPath', settings.wallpaperEngineRendererPath || '', '例如 linux-wallpaperengine 可执行文件路径')}
        <p class="hero-copy">应用不会内置或绕过 Steam/Wallpaper Engine 授权；下载 Workshop 内容使用你配置的 SteamCMD。</p>
      </div>
    `;
  }
  if (state.settingsTab === 'deps') {
    return `
      <div class="settings-section">
        <h3>当前桌面环境</h3>
        ${settingStatic('桌面', `${deps.desktop?.current || '未知'} / ${deps.desktop?.session || ''}`)}
        ${settingStatic('显示服务', deps.desktop?.wayland ? `Wayland: ${deps.desktop.wayland}` : `X11: ${deps.desktop?.display || '未检测到'}`)}
        ${settingStatic('系统', `${deps.system?.name || '未知系统'} / ${deps.system?.packageManager?.id || '未识别包管理器'}`)}
        <button class="secondary-btn" data-detail="refresh-deps">重新检查</button>
      </div>
      <div class="settings-section">
        <h3>运行依赖</h3>
        <div class="dep-list">${depRows(deps)}</div>
      </div>
      <div class="settings-section">
        <h3>自动安装</h3>
        <p class="hero-copy">${escapeHtml((deps.hints || []).join('\n') || '依赖看起来可用。')}</p>
        <div class="deps-actions">
          <button class="primary-btn" data-detail="install-live-deps">自动安装动态壁纸依赖</button>
          <button class="ghost-btn" data-detail="refresh-deps">安装后重新检查</button>
        </div>
        ${state.depInstallResult ? depInstallResultHtml(state.depInstallResult) : ''}
      </div>
    `;
  }
  if (state.settingsTab === 'about') {
    return `
      <div class="settings-section">
        <h3>WaifuX Linux</h3>
        ${settingStatic('版本', state.bootstrap?.version)}
        ${settingStatic('应用数据', paths.appData)}
        ${settingStatic('缓存目录', paths.cache)}
        <p class="hero-copy">Linux 版使用 Electron 前端和本地 Node.js API，提供壁纸、动态桌面、动漫资料、本地库和依赖检测能力。</p>
      </div>
    `;
  }
  return `
    <div class="settings-section">
      <h3>显示与数据源</h3>
      ${settingInput('显示语言', 'language', settings.language || 'zh-CN', '当前固定使用简体中文界面')}
      ${settingSelect('壁纸源', 'wallpaperSource', settings.wallpaperSource || 'auto', [
        ['auto', '自动回退'],
        ['wallhaven', 'Wallhaven'],
        ['4kwallpapers', '4KWallpapers'],
      ])}
      ${settingSelect('动态壁纸模式', 'liveWallpaperMode', settings.liveWallpaperMode || 'auto', [
        ['auto', '自动（deepin 原生，图标在前）'],
        ['deepin-native-plugin', 'deepin 原生插件（图标在前）'],
        ['deepin-embedded-mpv', '嵌入桌面（图标可能遮挡视频）'],
        ['xwinwrap-icon-overlay', 'xwinwrap 覆盖图标'],
      ])}
      <p class="hero-copy">deepin/DDE X11 自动模式不再使用覆盖层；只有手动选择 xwinwrap 时才会遮挡桌面图标。</p>
      ${settingInput('Wallhaven API Key', 'wallpaperApiKey', settings.wallpaperApiKey || '', '配置后才允许 NSFW 搜索；留空则只显示安全/轻微内容')}
    </div>
  `;
}

function settingStatic(label, value) {
  return `
    <div class="setting-row">
      <div class="setting-copy"><label>${escapeHtml(label)}</label></div>
      <div><input class="setting-input" value="${attr(value || '')}" readonly></div>
    </div>
  `;
}

function settingInput(label, key, value, copy) {
  return `
    <div class="setting-row">
      <div class="setting-copy"><label>${escapeHtml(label)}</label><p>${escapeHtml(copy || '')}</p></div>
      <div><input class="setting-input" data-setting="${attr(key)}" value="${attr(value || '')}"></div>
    </div>
  `;
}

function settingSelect(label, key, value, options) {
  return `
    <div class="setting-row">
      <div class="setting-copy"><label>${escapeHtml(label)}</label></div>
      <div><select class="setting-input" data-setting="${attr(key)}">${options.map(([id, name]) => option(id, name, value)).join('')}</select></div>
    </div>
  `;
}

function depRows(deps) {
  const commands = deps.commands || {};
  const names = ['dde-dconfig', 'gsettings', 'xdg-open', 'plasma-apply-wallpaperimage', 'xfconf-query', 'swaymsg', 'swww', 'ffmpeg', 'mpv', 'xwinwrap', 'mpvpaper', 'xprop', 'xwininfo', 'xdotool', 'wmctrl', 'steamcmd', 'linux-wallpaperengine'];
  const rows = names.map((name) => {
    const item = commands[name] || {};
    return `
      <div class="dep-row">
        <strong>${escapeHtml(name)}</strong>
        <span class="${item.ok ? 'dep-ok' : 'dep-miss'}">${item.ok ? '可用' : '缺失'}</span>
        <span>${escapeHtml(item.path || '未找到')}</span>
      </div>
    `;
  });
  if (deps.deepinNativeVideo) {
    const nativeDetail = deps.deepinNativeVideo.ok
      ? deps.deepinNativeVideo.pluginPath
      : deps.deepinNativeVideo.issue || deps.deepinNativeVideo.pluginPath || deps.deepinNativeVideo.sourceDir || '未找到插件';
    rows.unshift(`
      <div class="dep-row">
        <strong>deepin 原生视频壁纸</strong>
        <span class="${deps.deepinNativeVideo.ok ? 'dep-ok' : 'dep-miss'}">${deps.deepinNativeVideo.ok ? '可用' : '需处理'}</span>
        <span>${escapeHtml(nativeDetail)}</span>
      </div>
    `);
  }
  if (deps.deepinNativeVideo?.libMpv) {
    const libMpv = deps.deepinNativeVideo.libMpv;
    rows.unshift(`
      <div class="dep-row">
        <strong>libmpv.so 兼容链接</strong>
        <span class="${libMpv.ok ? 'dep-ok' : 'dep-miss'}">${libMpv.ok ? '可用' : '缺失'}</span>
        <span>${escapeHtml(libMpv.versionlessPath || libMpv.runtimePath || '安装 libmpv-dev 后再重新检查')}</span>
      </div>
    `);
  }
  return rows.join('');
}

function depInstallResultHtml(result) {
  const plan = result.plan || {};
  const items = [
    ['安装方式', result.terminal ? `已打开 ${result.terminal}` : '未启动'],
    ['包管理器', plan.packageManager],
    ['桌面类型', plan.desktop],
    ['系统包', (plan.packages || []).join(' ') || '无需安装'],
    ['源码构建', (plan.build || []).join(' ') || '无'],
    ['日志', result.logPath],
  ];
  return `
    <div class="install-result">
      <strong>${escapeHtml(result.message || '已启动安装流程')}</strong>
      ${items.map(([label, value]) => `<p><span>${escapeHtml(label)}</span>${escapeHtml(value || '未知')}</p>`).join('')}
    </div>
  `;
}

async function saveSettings() {
  const data = {};
  detailLayer.querySelectorAll('[data-setting]').forEach((input) => {
    data[input.dataset.setting] = input.value;
  });
  try {
    const payload = await post('/api/settings', data);
    state.bootstrap.settings = payload.data;
    const deps = await api('/api/deps/check');
    state.bootstrap.deps = deps.data;
    toast('设置已保存');
    renderSettings();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function refreshDeps() {
  try {
    const payload = await api('/api/deps/check');
    state.bootstrap.deps = payload.data;
    renderSettings();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function installLiveDeps() {
  try {
    const payload = await post('/api/deps/install', { target: 'live-wallpaper' });
    state.depInstallResult = payload.data;
    toast(payload.data?.message || '已启动自动安装');
    const deps = await api('/api/deps/check');
    state.bootstrap.deps = deps.data;
    renderSettings();
  } catch (error) {
    toast(error.message, 'error');
  }
}

viewHost.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    setTab(nav.dataset.nav);
    return;
  }

  const action = event.target.closest('[data-action]');
  if (action) {
    await handleAction(action.dataset.action);
    return;
  }

  const open = event.target.closest('[data-open]');
  if (open) {
    if (open.dataset.open === 'wallpaper') await openWallpaper(open.dataset.id);
    if (open.dataset.open === 'media') await openMedia(open.dataset.id);
    if (open.dataset.open === 'workshop') await openWorkshop(open.dataset.id);
    if (open.dataset.open === 'anime') await openAnime(open.dataset.id);
    return;
  }

  const tag = event.target.closest('[data-wall-tag]');
  if (tag) {
    state.wallpaperQuery = tag.dataset.wallTag;
    await loadWallpapers();
    return;
  }

  const wallFilter = event.target.closest('[data-wall-filter]');
  if (wallFilter) {
    state[wallFilter.dataset.wallFilter] = wallFilter.dataset.value || '';
    await loadWallpapers();
    return;
  }

  const wallClear = event.target.closest('[data-wall-clear]');
  if (wallClear) {
    state[wallClear.dataset.wallClear] = wallClear.dataset.reset || '';
    await loadWallpapers();
    return;
  }

  const localWallpaper = event.target.closest('[data-local-wallpaper]');
  if (localWallpaper) {
    try {
      await post('/api/set-local', { path: localWallpaper.dataset.localWallpaper });
      toast('已设置为桌面壁纸');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  const localMedia = event.target.closest('[data-local-media]');
  if (localMedia) {
    try {
      await post('/api/media/apply-live', { path: localMedia.dataset.localMedia });
      toast('已尝试应用动态壁纸');
    } catch (error) {
      toast(error.message, 'error');
    }
    return;
  }

  const localWorkshop = event.target.closest('[data-local-workshop]');
  if (localWorkshop) {
    try {
      await post('/api/workshop/apply', { id: localWorkshop.dataset.localWorkshop, path: localWorkshop.dataset.path });
      toast('已尝试应用 Workshop 内容');
    } catch (error) {
      toast(error.message, 'error');
    }
  }
});

viewHost.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const query = new FormData(form).get('query') || '';
  if (form.dataset.form === 'wallpaper') {
    state.wallpaperQuery = String(query);
    await loadWallpapers();
  }
  if (form.dataset.form === 'media') {
    if (state.mediaMode === 'workshop') state.workshopQuery = String(query);
    else state.mediaQuery = String(query);
    await loadMedia();
  }
  if (form.dataset.form === 'anime') {
    state.animeQuery = String(query);
    await loadAnime();
  }
});

viewHost.addEventListener('change', async (event) => {
  const control = event.target.closest('[data-control]');
  if (control) {
    state[control.dataset.control] = control.value;
    if (control.dataset.control.startsWith('wallpaper')) await loadWallpapers();
  }
});

viewHost.addEventListener('click', async (event) => {
  const segment = event.target.closest('[data-segment] button');
  if (!segment) return;
  const group = segment.closest('[data-segment]');
  state[group.dataset.segment] = segment.dataset.value;
  if (group.dataset.segment === 'wallpaperPurity') await loadWallpapers();
  if (group.dataset.segment === 'mediaMode') {
    if (state.mediaMode === 'local') {
      await loadLibrary();
      renderLocalMedia();
    } else {
      await loadMedia();
    }
  }
});

detailLayer.addEventListener('click', async (event) => {
  const settingsTab = event.target.closest('[data-settings-tab]');
  if (settingsTab) {
    state.settingsTab = settingsTab.dataset.settingsTab;
    renderSettings();
    return;
  }

  const button = event.target.closest('[data-detail]');
  if (!button) return;
  const action = button.dataset.detail;
  const item = detailLayer.currentItem;

  try {
    if (action === 'close') closeDetail();
    if (action === 'save-settings') await saveSettings();
    if (action === 'refresh-deps') await refreshDeps();
    if (action === 'install-live-deps') await installLiveDeps();
    if (action === 'open-source') window.open(button.dataset.url, '_blank');
    if (action === 'download-wallpaper') {
      const result = await post('/api/wallpapers/download', { item });
      toast(`已下载到：${result.path}`);
      await loadLibrary();
    }
    if (action === 'apply-wallpaper') {
      const result = await post('/api/wallpapers/apply', { item });
      toast(`已设置桌面壁纸：${result.appliedBy || '系统工具'}`);
      await loadLibrary();
    }
    if (action === 'download-media') {
      const result = await post('/api/media/download', { item });
      toast(`已下载到：${result.path}`);
      await loadLibrary();
    }
    if (action === 'download-media-option') {
      const option = item.downloadOptions[Number(button.dataset.index)];
      const result = await post('/api/media/download', { item, option });
      toast(`已下载到：${result.path}`);
      await loadLibrary();
    }
    if (action === 'apply-media') {
      const result = await post('/api/media/apply-live', { item });
      toast(`已尝试应用动态壁纸：${result.appliedBy || '系统工具'}`);
      await loadLibrary();
    }
    if (action === 'stop-live') {
      await post('/api/media/stop-live', {});
      toast('已停止动态壁纸进程');
    }
    if (action === 'download-workshop') {
      const result = await post('/api/workshop/download', { id: item.id });
      toast(`Workshop 已下载到：${result.path}`);
      await loadLibrary();
    }
    if (action === 'apply-workshop') {
      const result = await post('/api/workshop/apply', { id: item.id });
      toast(`已尝试应用 Workshop：${result.appliedBy || 'renderer'}`);
    }
    if (action === 'extract-anime-video') {
      const input = detailLayer.querySelector('[data-anime-url]');
      const result = await post('/api/anime/extract-video', { url: input?.value || '' });
      if (result.data?.length) {
        toast(`发现 ${result.data.length} 个视频源：\n${result.data.slice(0, 3).map((v) => v.url).join('\n')}`);
      } else {
        toast(result.message || '没有发现可直接播放的视频源', 'error');
      }
    }
  } catch (error) {
    toast(error.message, 'error');
  }
});

async function handleAction(action) {
  if (action === 'refresh-wallpapers') await loadWallpapers();
  if (action === 'clear-wallpaper-filters') {
    state.wallpaperQuery = '';
    state.wallpaperPurity = '100';
    state.wallpaperCategories = '111';
    state.wallpaperRatios = '';
    state.wallpaperResolution = '';
    state.wallpaperColor = '';
    await loadWallpapers();
  }
  if (action === 'refresh-media') {
    if (state.mediaMode === 'local') {
      await loadLibrary();
      renderLocalMedia();
    } else {
      await loadMedia();
    }
  }
  if (action === 'refresh-anime') await loadAnime();
  if (action === 'refresh-library') await loadLibrary();
  if (action === 'open-library') {
    try {
      const result = await post('/api/open-library', {});
      toast(`已打开：${result.path}`);
    } catch (error) {
      toast(error.message, 'error');
    }
  }
  if (action === 'stop-live') {
    try {
      await post('/api/media/stop-live', {});
      toast('已停止动态壁纸进程');
    } catch (error) {
      toast(error.message, 'error');
    }
  }
}

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
});

settingsBtn.addEventListener('click', () => {
  state.settingsTab = 'general';
  renderSettings();
});

document.querySelector('.dot.close')?.addEventListener('click', () => window.waifuxWindow?.close?.());
document.querySelector('.dot.min')?.addEventListener('click', () => window.waifuxWindow?.minimize?.());
document.querySelector('.dot.max')?.addEventListener('click', () => window.waifuxWindow?.maximize?.());

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !detailLayer.classList.contains('hidden')) {
    closeDetail();
  }
});

async function boot() {
  try {
    if (state.tab === 'wallpaper') document.title = 'WaifuX 测试-壁纸页';
    await loadBootstrap();
    setTab(state.tab);
    if (state.tab === 'home') {
      await loadHome();
    } else if (state.tab === 'library') {
      await loadLibrary();
    }
  } catch (error) {
    viewHost.innerHTML = `<section class="page">${statusBox('启动失败', error.message)}</section>`;
    toast(error.message, 'error');
  }
}

boot();
