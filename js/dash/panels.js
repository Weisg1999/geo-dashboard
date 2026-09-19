/* =====================================================================
 * GeoDash · panels.js
 * 职责：所有 DOM 面板的渲染与更新 —— 顶栏指标/搜索框/时钟、左侧排行/
 *       类型分布/状态/图例、右侧项目清单与面包屑、tooltip、toast。
 *       面板是「数据的纯视图」：输入作用域集合，输出 DOM。
 * 依赖：core.js、state.js
 * 对外：GeoDash.panels = { el, toast, tick, render*, updateCrumb, highlightCard,
 *                          showProvinceTooltip, showCityTooltip, showProjectTooltip,
 *                          placeTooltip, hideTooltip, buildSearchIndex, doSearch }
 * ===================================================================== */

const GD = window.GeoDash;
const util = GD.util;

/* ---------- DOM 引用（与 index.html 结构一一对应） ---------- */
const panels = (GD.panels = {});
const el = (panels.el = {
  loading: util.$('loading'), loadingTitle: util.$('loadingTitle'), progressText: util.$('progressText'),
  errorMsg: util.$('errorMsg'), retryBtn: util.$('retryBtn'),
  brandCompany: util.$('brandCompany'), brandTitle: util.$('brandTitle'), brandSub: util.$('brandSub'),
  statTotal: util.$('statTotal'), statProvinces: util.$('statProvinces'), statCities: util.$('statCities'), statAmount: util.$('statAmount'),
  rankTitle: util.$('rankTitle'), rankScope: util.$('rankScope'), rankList: util.$('rankList'),
  donutScope: util.$('donutScope'), donutSvgWrap: util.$('donutSvgWrap'), donutLegend: util.$('donutLegend'),
  statusScope: util.$('statusScope'), statusChips: util.$('statusChips'),
  legendRamp: util.$('legendRamp'), legendTicks: util.$('legendTicks'), legendStatus: util.$('legendStatus'),
  crumb: util.$('crumb'), listTitle: util.$('listTitle'), projectList: util.$('projectList'),
  searchInput: util.$('searchInput'), searchDrop: util.$('searchDrop'),
  clockDate: util.$('clockDate'), clockTime: util.$('clockTime'),
  coordLat: util.$('coordLat'), coordLon: util.$('coordLon'), zoomVal: util.$('zoomVal'),
  selInfo: util.$('selInfo'), fpsVal: util.$('fpsVal'),
  btnReset: util.$('btnReset'), btnRotate: util.$('btnRotate'),
  tooltip: util.$('tooltip'), toast: util.$('toast'),
  panelLeft: util.$('panel-left'), panelRight: util.$('panel-right'),
  stage: util.$('stage'),
  sensSlider: util.$('sensSlider'), sensVal: util.$('sensVal'),
  btnPure: util.$('btnPure'), pureExit: util.$('pureExit'),
});

/* 品牌信息填充（配置驱动） */
el.brandCompany.textContent = GD.CFG.company;
el.brandTitle.textContent = GD.CFG.title;
el.brandSub.textContent = GD.CFG.subtitle;

/* ---------- Toast ---------- */
let toastTimer = null;
panels.toast = function (msg, type = '', ms = 3200) {
  el.toast.textContent = msg;
  el.toast.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.className = ''; }, ms);
};

/* ---------- 时钟 ---------- */
function tickClock() {
  const d = new Date();
  const wd = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
  const pad = n => String(n).padStart(2, '0');
  el.clockDate.textContent = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${wd}`;
  el.clockTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
panels.tick = tickClock;
tickClock();
setInterval(tickClock, 1000);

/* ---------- 顶栏全局指标 ---------- */
panels.renderGlobalStats = function () {
  const { projects, provAgg, cityAggAll } = GD.data;
  el.statTotal.textContent = projects.length;
  el.statProvinces.textContent = provAgg.size;
  el.statCities.textContent = cityAggAll.size;
  const total = projects.reduce((s, p) => s + p.amount, 0);
  el.statAmount.innerHTML = (total % 1 === 0 ? total.toFixed(0) : total.toFixed(1)) + '<small>亿</small>';
};

/* ---------- 排行榜 ---------- */
panels.renderRanking = function (list, scopeLevel) {
  const wrap = el.rankList;
  if (scopeLevel === 'city') {
    el.rankTitle.textContent = '城市项目 TOP';
    wrap.innerHTML = '<div class="list-empty">已定位到城市层级</div>';
    return;
  }
  let entities;
  if (scopeLevel === 'province') {
    el.rankTitle.textContent = '地市项目 TOP';
    const counts = new Map();
    for (const p of list) { const k = util.normRegion(p.city) || '—'; counts.set(k, (counts.get(k) || 0) + 1); }
    entities = [...counts.entries()].map(([k, v]) => ({ key: k, label: k, count: v }));
  } else {
    el.rankTitle.textContent = '省级项目 TOP';
    entities = [...GD.state.S.provByKey.values()].filter(m => m.count > 0)
      .map(m => ({ key: m.key, label: m.name.replace(/(省|市|自治区|特别行政区|维吾尔|壮族|回族)/g, ''), count: m.count }));
  }
  entities.sort((a, b) => b.count - a.count);
  const top = entities.slice(0, 9);
  if (!top.length) { wrap.innerHTML = '<div class="list-empty">暂无数据</div>'; return; }
  const max = top[0].count;
  wrap.innerHTML = top.map((e, i) => `
    <div class="rank-row" data-key="${util.esc(e.key)}" data-level="${scopeLevel}">
      <span class="rank-idx ${i < 3 ? 'top' : ''}">${i + 1}</span>
      <span class="rank-name" title="${util.esc(e.label)}">${util.esc(e.label)}</span>
      <div class="rank-bar"><i style="background:linear-gradient(90deg,#123a5e,${util.countColorCss(e.count, GD.data.maxProvCount)})"></i></div>
      <span class="rank-num">${e.count}</span>
    </div>`).join('');
  requestAnimationFrame(() => {
    wrap.querySelectorAll('.rank-bar i').forEach((bar, i) => { bar.style.width = (top[i].count / max * 100) + '%'; });
  });
  wrap.querySelectorAll('.rank-row').forEach(row => {
    row.addEventListener('click', () => {
      if (row.dataset.level === 'province') GD.interaction.selectCity(row.dataset.key);
      else GD.interaction.selectProvince(row.dataset.key);
    });
  });
};

/* ---------- 类型分布环形图 ---------- */
panels.renderDonut = function (list) {
  const counts = new Map();
  for (const p of list) counts.set(p.type, (counts.get(p.type) || 0) + 1);
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  el.donutScope.textContent = el.rankScope.textContent;
  el.statusScope.textContent = el.donutScope.textContent;
  if (!entries.length) {
    el.donutSvgWrap.innerHTML = '<div class="list-empty">暂无数据</div>';
    el.donutLegend.innerHTML = '';
    return;
  }
  const total = list.length, C = 2 * Math.PI * 46;
  let off = 0, segs = '';
  for (const [t, v] of entries) {
    const frac = v / total, len = Math.max(0.01, frac * C - 2);
    segs += `<circle cx="60" cy="60" r="46" fill="none" stroke="${GD.data.typeColor(t)}" stroke-width="13"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"><title>${util.esc(t)} ${v} 个</title></circle>`;
    off += frac * C;
  }
  el.donutSvgWrap.innerHTML = `
    <svg viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(125,211,252,.07)" stroke-width="13"/>
      <g transform="rotate(-90 60 60)">${segs}</g>
      <text x="60" y="58" text-anchor="middle" class="donut-center">${total}</text>
      <text x="60" y="72" text-anchor="middle" class="donut-center-label">项目总数</text>
    </svg>`;
  el.donutLegend.innerHTML = entries.map(([t, v]) => `
    <div class="dl-row"><i style="background:${GD.data.typeColor(t)}"></i>
      <span>${util.esc(t)}</span><span class="dl-n">${v}</span><span class="dl-p">${(v / total * 100).toFixed(0)}%</span></div>`).join('');
};

/* ---------- 状态统计 ---------- */
panels.renderStatus = function (list) {
  const counts = { operating: 0, building: 0, planning: 0 };
  for (const p of list) counts[p.status]++;
  el.statusChips.innerHTML = Object.entries(GD.STATUS).map(([k, m]) => `
    <div class="schip"><b class="mono" style="color:${m.color}">${counts[k] || 0}</b><span>${m.label}</span></div>`).join('');
};

/* ---------- 右侧项目清单 ---------- */
function cardHTML(p) {
  const st = GD.STATUS[p.status];
  return `
  <div class="pcard" data-id="${util.esc(p.id)}">
    <div class="pc-top"><span class="pc-dot" style="background:${st.color};color:${st.color}"></span>
      <span class="pc-name">${util.esc(p.name)}</span>
      ${p.amount ? `<span class="pc-amt">${p.amount.toFixed(1)} 亿</span>` : '<span class="pc-amt na">—</span>'}</div>
    <div class="pc-mid"><span class="pc-city">${util.esc(p.city)}</span>
      <span class="pc-type" style="color:${GD.data.typeColor(p.type)};border-color:${GD.data.typeColor(p.type)}55">${util.esc(p.type)}</span>
      <span class="pc-date">${util.esc(p.date)}</span></div>
    ${p.address ? `<div class="pc-addr">${util.esc(p.address)}</div>` : ''}
    <div class="pc-geo mono">LON ${p.lon.toFixed(4)} · LAT ${p.lat.toFixed(4)} · ${st.label}</div>
  </div>`;
}

panels.renderList = function (list) {
  const wrap = el.projectList;
  const sel = GD.state.S.selected;
  if (!list.length) { wrap.innerHTML = '<div class="list-empty">该范围内暂无项目</div>'; return; }
  let html = '';
  if (!sel.provinceKey) {
    const byProv = new Map();
    for (const p of list) {
      const k = util.normRegion(p.province) || '未匹配';
      if (!byProv.has(k)) byProv.set(k, []);
      byProv.get(k).push(p);
    }
    const sorted = [...byProv.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [k, arr] of sorted) {
      const meta = GD.state.S.provByKey.get(k);
      const label = meta ? meta.name : k;
      html += `<div class="lgroup-head" data-prov="${util.esc(k)}"><b>${arr.length}</b><span>${util.esc(label)}</span></div>`;
      html += arr.map(cardHTML).join('');
    }
  } else {
    html = list.map(cardHTML).join('');
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.pcard').forEach(card => {
    card.addEventListener('click', () => {
      const p = GD.data.projects.find(x => x.id === card.dataset.id);
      if (p) GD.interaction.selectProject(p, { fly: true });
    });
  });
  wrap.querySelectorAll('.lgroup-head').forEach(h => {
    h.addEventListener('click', () => GD.interaction.selectProvince(h.dataset.prov));
  });
};

panels.highlightCard = function (p) {
  el.projectList.querySelectorAll('.pcard').forEach(c => {
    const on = p && c.dataset.id === p.id;
    c.classList.toggle('active', on);
    if (on) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
};

/* ---------- 面板总编排：按当前作用域刷新左侧 + 右侧 + 底栏 ---------- */
panels.renderScopedPanels = function () {
  const S = GD.state.S;
  const list = GD.state.scopeProjects();
  const level = S.selected.city ? 'city' : S.selected.provinceKey ? 'province' : 'nation';
  const scopeName = S.selected.city ? S.selected.city
    : S.selected.provinceKey ? (S.provByKey.get(S.selected.provinceKey)?.name || '')
    : '全国';
  el.rankScope.textContent = scopeName;
  panels.renderRanking(list, level);
  panels.renderDonut(list);
  panels.renderStatus(list);
  el.listTitle.innerHTML = `${util.esc(scopeName)} <b>${list.length}</b> 个项目 · 点击卡片定位${S.selected.project ? ` · 已定位 <b style="color:#fcd34d">${util.esc(S.selected.project.name)}</b>` : ''}`;
  panels.renderList(list);
  el.selInfo.innerHTML = S.selected.project
    ? `当前：<b>${util.esc(S.selected.project.name)}</b> · ${GD.STATUS[S.selected.project.status].label}`
    : S.selected.provinceKey
      ? `当前：<b>${util.esc(scopeName)}</b> · ${list.length} 个项目`
      : '当前：全国视图';
};

/* ---------- 图例 ---------- */
panels.renderLegend = function () {
  const mc = GD.CFG.markerColor || '#ffc964';
  const stops = GD.util.RAMP.map(([t, c]) => `${'#' + c.getHexString()} ${(12 + t * 88).toFixed(0)}%`).join(',');
  el.legendRamp.style.background = `linear-gradient(90deg, ${GD.util.NO_DATA_COLOR.getHexString()} 0%, ${stops})`;
  const max = GD.data.maxProvCount;
  const ticks = [...new Set([0, 1, Math.round(max / 2), max].map(v => Math.min(v, max)))].sort((a, b) => a - b);
  el.legendTicks.innerHTML = ticks.map(v => `<span>${v}</span>`).join('');
  el.legendStatus.innerHTML =
    `<div class="leg-item"><i style="background:${mc};box-shadow:0 0 5px ${mc}"></i>项目光点（大小=投资规模）</div>`
    + `<div class="leg-item"><i style="background:#7adcf0;border-radius:2px"></i>项目数量（省级设色）</div>`;
};

/* ---------- 面包屑 ---------- */
panels.updateCrumb = function () {
  const sel = GD.state.S.selected;
  const parts = [];
  parts.push(`<button class="crumb-seg ${!sel.provinceKey && !sel.project ? 'cur' : ''}" data-nav="nation">全国</button>`);
  if (sel.provinceKey) {
    const meta = GD.state.S.provByKey.get(sel.provinceKey);
    if (meta) parts.push(`<span class="crumb-sep">›</span><button class="crumb-seg ${!sel.city && !sel.project ? 'cur' : ''}" data-nav="province">${util.esc(meta.name)} · ${meta.count}</button>`);
  }
  if (sel.city) {
    const n = (GD.data.provAgg.get(sel.provinceKey)?.projects || []).filter(p => util.normRegion(p.city) === sel.city).length;
    parts.push(`<span class="crumb-sep">›</span><button class="crumb-seg ${!sel.project ? 'cur' : ''}" data-nav="city">${util.esc(sel.city)} · ${n}</button>`);
  }
  if (sel.project) parts.push(`<span class="crumb-sep">›</span><span class="crumb-seg cur">${util.esc(sel.project.name)}</span>`);
  el.crumb.innerHTML = parts.join('');
};

/* ---------- Tooltip ---------- */
panels.placeTooltip = function (x, y) {
  const pad = 18, tw = el.tooltip.offsetWidth || 240, th = el.tooltip.offsetHeight || 100;
  let left = x + pad, top = y - 12;
  if (left + tw > innerWidth - pad) left = x - tw - pad;
  if (top + th > innerHeight - pad) top = innerHeight - th - pad;
  el.tooltip.style.left = Math.max(pad, left) + 'px';
  el.tooltip.style.top = Math.max(pad, top) + 'px';
};
panels.showProvinceTooltip = function (meta) {
  const topCities = [...new Set(meta.projects.map(p => p.city))].slice(0, 4);
  el.tooltip.innerHTML = `
    <div class="tt-head"><span class="tt-dot" style="background:#67e8f9"></span>
      <span class="tt-name">${util.esc(meta.name)}</span>
      <span class="tt-tag mono" style="color:#7dd3fc;border-color:rgba(125,211,252,.3)">${meta.code}</span></div>
    <div class="tt-row">项目 <b>${meta.count}</b> 个 · 投资额 <span class="amber">${meta.amount ? meta.amount.toFixed(1) : '0'} 亿</span></div>
    ${topCities.length ? `<div class="tt-row">覆盖城市：${util.esc(topCities.join(' / '))}${topCities.length < new Set(meta.projects.map(p => p.city)).size ? ' …' : ''}</div>` : '<div class="tt-row" style="color:var(--text-faint)">暂无项目落点 · 点击查看地市边界</div>'}
    <div class="tt-row" style="color:var(--text-faint);font-size:10px">点击省份下钻查看</div>`;
  el.tooltip.classList.add('visible');
};
panels.showCityTooltip = function (name, list) {
  el.tooltip.innerHTML = `
    <div class="tt-head"><span class="tt-dot" style="background:#fcd34d"></span>
      <span class="tt-name">${util.esc(name)}</span></div>
    ${list.length
      ? `<div class="tt-row">项目 <b>${list.length}</b> 个${list.length ? ' · ' + util.esc(list.slice(0, 3).map(x => x.name).join('、')) : ''}</div><div class="tt-row" style="color:var(--text-faint);font-size:10px">点击城市筛选项目</div>`
      : '<div class="tt-row" style="color:var(--text-faint)">该城市暂无项目</div>'}`;
  el.tooltip.classList.add('visible');
};
panels.showProjectTooltip = function (p) {
  const st = GD.STATUS[p.status];
  el.tooltip.innerHTML = `
    <div class="tt-head"><span class="tt-dot" style="background:${st.color};box-shadow:0 0 6px ${st.color}"></span>
      <span class="tt-name">${util.esc(p.name)}</span>
      <span class="tt-tag" style="color:${st.color};border-color:${st.color}55">${st.label}</span></div>
    <div class="tt-row">${util.esc(p.province)} · ${util.esc(p.city)} · ${util.esc(p.type)}</div>
    ${p.address ? `<div class="tt-addr">${util.esc(p.address)}</div>` : ''}
    <div class="tt-row mono" style="color:rgba(125,211,252,.6)">${p.lon.toFixed(4)}, ${p.lat.toFixed(4)}</div>`;
  el.tooltip.classList.add('visible');
};
panels.showCountryTooltip = function (c) {
  const zh = c.zh || c.en;
  el.tooltip.innerHTML = `
    <div class="tt-head"><span class="tt-dot" style="background:#5e8cb4"></span>
      <span class="tt-name">${util.esc(zh)}</span></div>
    ${c.zh && c.en && c.en !== zh ? `<div class="tt-row mono" style="color:rgba(125,211,252,.6)">${util.esc(c.en)}</div>` : ''}
    <div class="tt-row" style="color:var(--text-faint);font-size:10px">国家 / 地区</div>`;
  el.tooltip.classList.add('visible');
};
panels.hideTooltip = function () { el.tooltip.classList.remove('visible'); };
