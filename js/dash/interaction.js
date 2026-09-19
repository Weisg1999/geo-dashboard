/* =====================================================================
 * GeoDash v2 · interaction.js
 * 职责：相机飞行（slerp+抬升）、拾取（数学拾取+标记射线）、悬停提示、
 *       点选语义（省/市/项目/清空）、搜索联动、快捷键、灵敏度、自转与纯净模式。
 * 与 v1 差异：省份/地市拾取改为"射线∩球面 + geoContains"（admin.pickAt），
 *       不再依赖板块 mesh；飞行半径按 GLOBE_R=100 体系。
 * 依赖：core.js、state.js、globe.js、admin.js、markers.js、panels.js
 * 对外：GeoDash.interaction = { init, update, flyTo, flyToLonLat, fadeK,
 *        selectProvince, selectCity, selectProject, clearSelection,
 *        buildSearchIndex, setPure, setSensitivity }
 * ===================================================================== */
import * as THREE from 'three';

const GD = window.GeoDash;
const { util, const: C } = GD;
const { GLOBE_R } = C;
const interaction = (GD.interaction = {});
const P = () => GD.panels;
const S = () => GD.state.S;

/* ---------------------------------------------------------------------
 * 相机飞行：球面 slerp + 正弦抬升（v1 手感移植）
 * ------------------------------------------------------------------- */
let fly = null;
const flyFrom = new THREE.Vector3(), flyToV = new THREE.Vector3(), flyNow = new THREE.Vector3();

interaction.flyTo = function (dir, dist, dur = 1600, lift = 0.30) {
  const cam = GD.scene.camera;
  flyFrom.copy(cam.position);
  flyToV.copy(dir).normalize().multiplyScalar(dist);
  fly = { t0: performance.now(), dur: Math.max(200, dur), lift };
  GD.scene.controls.enabled = false;
};
interaction.flyToLonLat = function (lon, lat, dist = GLOBE_R * 1.6, dur, lift) {
  interaction.flyTo(util.lonLatToVec3(lon, lat, 1), dist, dur, lift);
};
function flyDistFor(theta) {
  return GLOBE_R * Math.min(2.6, Math.max(1.35, 1.25 + 1.9 * (theta || 0.3)));
}
const NATIONAL_DIST = GLOBE_R * 2.05;

/* ---------------------------------------------------------------------
 * 背面淡出系数（CSS2D 标注用，v1 同语义）
 * ------------------------------------------------------------------- */
const fadeA = new THREE.Vector3(), fadeB = new THREE.Vector3();
interaction.fadeK = function (pos) {
  fadeA.copy(pos).normalize();
  fadeB.copy(GD.scene.camera.position).normalize();
  const d = fadeA.dot(fadeB);
  const t = Math.min(1, Math.max(0, (d + 0.05) / 0.35));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------------
 * 拾取：标记（射线）优先，其次省份/地市（数学拾取）
 * ------------------------------------------------------------------- */
const ndc = new THREE.Vector2();
function markerPick() {
  const s = S();
  s.raycaster.setFromCamera(ndc, GD.scene.camera);
  const objs = [];
  for (const mk of s.markers) objs.push(mk.glowSprite, mk.dotSprite);
  const hits = s.raycaster.intersectObjects(objs, false);
  for (const h of hits) {
    const o = h.object;
    if (o.userData && o.userData.project) return { kind: 'project', p: o.userData.project };
    const mk = s.markers.find(m => m.glowSprite === o || m.dotSprite === o);
    if (mk) return { kind: 'project', p: mk.p };
  }
  return null;
}
function pick() {
  return markerPick() || GD.admin.pickAt(ndc.x, ndc.y);
}

/* ---------------------------------------------------------------------
 * 悬停
 * ------------------------------------------------------------------- */
let lastPickAt = 0;
function updateHover(now) {
  const s = S();
  if (s.dragging || fly || now - lastPickAt < 60) return;
  lastPickAt = now;
  const hit = pick();
  const prevKey = s.hoverKey;
  const prev = s.hover;
  let key = null, entry = null;
  if (hit && hit.kind !== 'project') { key = hit.entry.key + '|' + hit.kind; entry = hit.entry; }
  if (key !== prevKey) {
    if (prev && prev.level) prev.hoverTarget = 0;
    if (entry) entry.hoverTarget = 1;
    s.hover = entry; s.hoverKey = key;
    GD.admin.refreshPolygons();
    document.body.style.cursor = entry || hit ? 'pointer' : '';
  }
  /* 提示框 */
  if (hit && hit.kind === 'project') P().showProjectTooltip(hit.p);
  else if (hit && hit.kind === 'city') P().showCityTooltip(hit.entry.name, (hit.entry.provKey && GD.data.provAgg.get(hit.entry.provKey)?.projects || []).filter(p => util.normRegion(p.city) === hit.entry.key));
  else if (hit && hit.kind === 'province') P().showProvinceTooltip(hit.entry);
  else if (!s.dragging) P().hideTooltip();
}

/* ---------------------------------------------------------------------
 * 点选语义
 * ------------------------------------------------------------------- */
interaction.selectProvince = function (key, opts = {}) {
  const s = S();
  const meta = s.provByKey.get(util.normRegion(key));
  if (!meta) { P().toast('未找到该省份数据', 'err'); return; }
  if (s.selected.provinceKey !== meta.key) s.selected.city = null;
  s.selected.provinceKey = meta.key;
  s.selected.project = null;
  GD.markers.ensureSelRing(null);
  GD.state.setProvinceTargets();
  GD.admin.refreshPolygons();
  GD.markers.refreshArcs();
  GD.admin.ensureCities(meta);
  if (opts.fly !== false) interaction.flyTo(meta.dir, flyDistFor(meta.theta), 1600);
  P().renderScopedPanels(); P().updateCrumb();
};

interaction.selectCity = function (key) {
  const s = S();
  const entry = (s.activeCity.entries || []).find(e => e.key === util.normRegion(key));
  if (!entry) return;
  s.selected.city = entry.key;
  s.selected.project = null;
  GD.markers.ensureSelRing(null);
  for (const e of s.activeCity.entries) e.selTarget = e.key === entry.key ? 1 : 0;
  GD.state.setProvinceTargets();
  GD.admin.refreshPolygons();
  interaction.flyTo(entry.dir, GLOBE_R * 1.4, 1400);
  P().renderScopedPanels(); P().updateCrumb();
};

interaction.selectProject = function (p, opts = {}) {
  const s = S();
  s.selected.project = p;
  const pk = util.normRegion(p.province);
  if (pk && s.provByKey.has(pk) && s.selected.provinceKey !== pk) {
    s.selected.provinceKey = pk;
    GD.admin.ensureCities(s.provByKey.get(pk));
  }
  GD.state.setProvinceTargets();
  GD.admin.refreshPolygons();
  GD.markers.refreshArcs();
  GD.markers.ensureSelRing(p);
  if (opts.fly !== false) {
    const mk = s.markers.find(m => m.p === p);
    if (mk) interaction.flyTo(mk.dir, GLOBE_R * 1.32, 1500);
  }
  P().renderScopedPanels(); P().updateCrumb(); P().highlightCard(p);
};

interaction.clearSelection = function () {
  const s = S();
  if (s.selected.project) {
    s.selected.project = null;
    GD.markers.ensureSelRing(null);
    GD.state.setProvinceTargets();
    GD.markers.refreshArcs();
    P().renderScopedPanels(); P().updateCrumb();
    return;
  }
  if (s.selected.city) {
    s.selected.city = null;
    for (const e of s.activeCity.entries || []) e.selTarget = 0;
    GD.admin.refreshPolygons();
    P().renderScopedPanels(); P().updateCrumb();
    return;
  }
  if (s.selected.provinceKey) {
    s.selected.provinceKey = null;
    GD.admin.clearActiveCity();
    GD.state.setProvinceTargets();
    GD.admin.refreshPolygons();
    GD.markers.refreshArcs();
    interaction.flyTo(util.lonLatToVec3(103.5, 35.5, 1), NATIONAL_DIST, 1600);
    P().renderScopedPanels(); P().updateCrumb();
  }
};

/* ---------------------------------------------------------------------
 * 搜索（省/市/项目/地址模糊匹配，回车飞入）
 * ------------------------------------------------------------------- */
let searchIndex = [];
interaction.buildSearchIndex = function () {
  searchIndex = [];
  for (const e of S().provinces) {
    searchIndex.push({ label: e.name, sub: `${e.count} 个项目`, kind: 'province', key: e.key });
  }
  const citySeen = new Map();
  for (const p of GD.data.projects) {
    const ck = util.normRegion(p.city);
    if (!citySeen.has(ck)) citySeen.set(ck, { label: p.city, sub: util.normRegion(p.province), kind: 'city', key: ck, lon: p.lon, lat: p.lat, prov: util.normRegion(p.province) });
  }
  for (const c of citySeen.values()) searchIndex.push(c);
  for (const p of GD.data.projects) {
    searchIndex.push({ label: p.name, sub: `${p.city} · ${p.address || p.type}`, kind: 'project', p });
  }
};
function bindSearch() {
  const input = P().el.searchInput, drop = P().el.searchDrop;
  const render = (q) => {
    const kw = q.trim().toLowerCase();
    if (!kw) { drop.classList.remove('open'); drop.innerHTML = ''; return; }
    const hits = searchIndex.filter(it => (it.label + ' ' + (it.sub || '')).toLowerCase().includes(kw)).slice(0, 8);
    if (!hits.length) { drop.classList.remove('open'); return; }
    drop.innerHTML = hits.map((h, i) => `<div class="drop-item" data-i="${i}"><b>${util.esc(h.label)}</b><span>${util.esc(h.sub || '')}</span></div>`).join('');
    drop.classList.add('open');
    drop.onclick = (ev) => {
      const item = ev.target.closest('.drop-item');
      if (!item) return;
      act(hits[+item.dataset.i]);
      drop.classList.remove('open'); input.value = '';
    };
  };
  const act = (h) => {
    if (h.kind === 'province') interaction.selectProvince(h.key);
    else if (h.kind === 'city') {
      const prov = S().provByKey.get(h.prov);
      if (prov && S().selected.provinceKey !== prov.key) interaction.selectProvince(prov.key, { fly: false });
      const entry = (S().activeCity.entries || []).find(e => e.key === h.key);
      if (entry) interaction.selectCity(entry.key);
      else interaction.flyToLonLat(h.lon, h.lat, GLOBE_R * 1.5);
    } else interaction.selectProject(h.p, { fly: true });
  };
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const kw = input.value.trim().toLowerCase();
      const hit = searchIndex.find(it => (it.label + ' ' + (it.sub || '')).toLowerCase().includes(kw));
      if (hit) { act(hit); P().el.searchDrop.classList.remove('open'); input.value = ''; }
    }
    if (ev.key === 'Escape') { P().el.searchDrop.classList.remove('open'); input.blur(); }
  });
}

/* ---------------------------------------------------------------------
 * 自转 / 灵敏度 / 纯净模式 / 快捷键
 * ------------------------------------------------------------------- */
function computeAutoRotate() {
  const s = S();
  if (s.userRot === true) return true;
  if (s.userRot === false) return false;
  return performance.now() - s.lastInteract > GD.CFG.idleSeconds * 1000;
}
interaction.setSensitivity = function (v) {
  const s = S();
  s.sens = Math.min(2, Math.max(0.2, +v || 1));
  try { localStorage.setItem('geodash:sens', String(s.sens)); } catch (e) { /* 忽略 */ }
  P().el.sensVal.textContent = s.sens.toFixed(1) + '×';
};
interaction.setPure = function (on) {
  document.body.classList.toggle('pure', !!on);
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.();
  if (!on && document.fullscreenElement) document.exitFullscreen?.();
};

function bindControls() {
  const s = S();
  const dom = GD.scene.renderer.domElement;
  let downX = 0, downY = 0, moved = 0;
  dom.addEventListener('pointerdown', (e) => { s.dragging = true; moved = 0; downX = e.clientX; downY = e.clientY; s.lastInteract = performance.now(); });
  addEventListener('pointerup', (e) => {
    s.dragging = false; s.lastInteract = performance.now();
    if (moved < 5) {
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      const hit = pick();
      if (!hit) return;
      if (hit.kind === 'project') interaction.selectProject(hit.p, { fly: true });
      else if (hit.kind === 'city') interaction.selectCity(hit.entry.key);
      else interaction.selectProvince(hit.entry.key);
    }
  });
  dom.addEventListener('pointermove', (e) => {
    moved += Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    downX = e.clientX; downY = e.clientY;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    s.lastInteract = performance.now();
    P().placeTooltip(e.clientX, e.clientY);
    /* 坐标读数 */
    const hit = s.dragging ? null : pick();
    if (hit && hit.kind !== 'project') {
      const ring = hit.entry && hit.entry.feature ? null : null;
      P().el.coordLat.textContent = ''; /* 由 update 统一写 */
    }
  });
  dom.addEventListener('wheel', () => { s.lastInteract = performance.now(); }, { passive: true });

  P().el.btnReset.addEventListener('click', () => {
    s.selected.project = null; s.selected.city = null; s.selected.provinceKey = null;
    GD.markers.ensureSelRing(null);
    GD.admin.clearActiveCity();
    GD.state.setProvinceTargets();
    GD.admin.refreshPolygons();
    GD.markers.refreshArcs();
    interaction.flyTo(util.lonLatToVec3(103.5, 35.5, 1), NATIONAL_DIST, 1600);
    P().renderScopedPanels(); P().updateCrumb();
  });
  P().el.btnRotate.addEventListener('click', () => {
    s.userRot = !(computeAutoRotate());
    P().el.btnRotate.classList.toggle('on', s.userRot !== false);
    P().toast(s.userRot === false ? '已停止自转' : '已开启自转', 'ok', 1600);
  });
  P().el.sensSlider.addEventListener('input', (e) => interaction.setSensitivity(e.target.value));
  P().el.btnPure.addEventListener('click', () => interaction.setPure(true));
  P().el.pureExit.addEventListener('click', () => interaction.setPure(false));
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') {
      if (document.body.classList.contains('pure')) interaction.setPure(false);
      else interaction.clearSelection();
    }
    if (e.key === 'r' || e.key === 'R') P().el.btnRotate.click();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('pure')) document.body.classList.remove('pure');
  });
}

/* ---------------------------------------------------------------------
 * 每帧更新
 * ------------------------------------------------------------------- */
interaction.update = function (now) {
  const s = S();
  const controls = GD.scene.controls;
  if (fly) {
    const k = Math.min(1, (now - fly.t0) / fly.dur);
    const e = util.easeInOutCubic(k);
    flyNow.copy(flyFrom).lerp(flyToV, e);
    /* 球面弧线抬升：中途半径外扩 */
    const rFrom = flyFrom.length(), rTo = flyToV.length();
    const r = (rFrom + (rTo - rFrom) * e) * (1 + fly.lift * Math.sin(Math.PI * e));
    flyNow.normalize().multiplyScalar(r);
    GD.scene.camera.position.copy(flyNow);
    GD.scene.camera.lookAt(0, 0, 0);
    if (k >= 1) { fly = null; controls.enabled = true; }
  } else {
    controls.autoRotate = computeAutoRotate();
    /* 缩放联动减速：越近越慢（v1 手感） */
    const dist = GD.scene.camera.position.length();
    const u = Math.min(1, Math.max(0, (dist - controls.minDistance) / (controls.maxDistance - controls.minDistance)));
    controls.rotateSpeed = s.sens * (0.18 + 0.82 * u);
    controls.update();
  }
  updateHover(now);
  /* 底部坐标/高度读数 */
  if (now - (interaction._hudLast || 0) > 200) {
    interaction._hudLast = now;
    P().el.zoomVal.textContent = (GD.scene.camera.position.length() / 20).toFixed(1);
    const hit = s.dragging ? null : pick();
    if (hit && hit.kind !== 'project' && hit.entry && hit.entry.dir) {
      const { lon, lat } = util.vec3ToLonLat(hit.entry.dir);
      P().el.coordLat.textContent = lat.toFixed(1) + '°';
      P().el.coordLon.textContent = lon.toFixed(1) + '°';
    }
  }
};

interaction.init = function () {
  bindControls();
  bindSearch();
  interaction.setSensitivity(S().sens);
  P().el.btnRotate.classList.add('on');
};
