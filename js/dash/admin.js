/* =====================================================================
 * GeoDash v2 · admin.js
 * 职责：行政区图层 —— 省级专题设色（three-globe polygons）、地市下钻叠加、
 *       省份角标（CSS2D）、十段线、台湾县市细节、南海诸岛标注、
 *       以及基于"射线-球面交点 + d3 geoContains"的数学拾取。
 * 设计要点：
 *  - 绕向：所有 Feature 入层前经 util.normalizeFeature 矫正（外环 CW）。
 *  - 悬停/选中/压暗为离散事件：改条目目标值后重置一次访问器，
 *    由 three-globe 的 polygonsTransitionDuration 做平滑过渡（不逐帧重置）。
 *  - 拾取不依赖 three-globe 内部网格结构：相机射线与球面求交得经纬度，
 *    再用 d3-geo geoContains 判定落点（d3 绕向约定与矫正后数据一致）。
 * 依赖：three、d3-geo、core.js、state.js、globe.js
 * 对外：GeoDash.admin = { loadProvinceFeatures, buildProvinces, buildChips,
 *                         checkUnmatched, ensureCities, clearActiveCity,
 *                         refreshPolygons, pickAt, update }
 * ===================================================================== */
import * as THREE from 'three';
import { geoContains } from 'd3-geo';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const GD = window.GeoDash;
const { util, const: C } = GD;
const { GLOBE_R, PROV_ALT, CITY_ALT } = C;

const CAPITAL_MAP = {
  '北京': '北京', '上海': '上海', '天津': '天津', '重庆': '重庆', '河北': '石家庄', '山西': '太原',
  '辽宁': '沈阳', '吉林': '长春', '黑龙江': '哈尔滨', '江苏': '南京', '浙江': '杭州', '安徽': '合肥',
  '福建': '福州', '江西': '南昌', '山东': '济南', '河南': '郑州', '湖北': '武汉', '湖南': '长沙',
  '广东': '广州', '海南': '海口', '四川': '成都', '贵州': '贵阳', '云南': '昆明', '陕西': '西安',
  '甘肃': '兰州', '青海': '西宁', '台湾': '台北',
  '内蒙古': '呼和浩特', '广西': '南宁', '西藏': '拉萨', '宁夏': '银川', '新疆': '乌鲁木齐',
  '香港': '香港', '澳门': '澳门',
};

/* ---------------------------------------------------------------------
 * 取数：带超时 fetch + localStorage 缓存（与 v1 同）
 * ------------------------------------------------------------------- */
async function fetchWithTimeout(url, timeout = 15000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(tid); return r; }
  catch (e) { clearTimeout(tid); throw e; }
}
async function cachedJSON(url) {
  /* 单文件版：构建脚本把离线数据内联到 window.__EMBEDDED__（键为原始 URL） */
  const emb = window.__EMBEDDED__ && window.__EMBEDDED__[url];
  if (emb) return typeof emb === 'string' ? JSON.parse(emb) : emb;
  const key = 'geodash:v2:' + url;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch (e) { /* 忽略 */ }
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { /* 配额不足跳过 */ }
  return d;
}

const admin = (GD.admin = {});
admin.loadProvinceFeatures = function () {
  return cachedJSON(GD.CFG.geoUrls.province).then(d => d.features || []);
};

/* ---------------------------------------------------------------------
 * 几何/方向工具
 * ------------------------------------------------------------------- */
function outerRing(f) {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'Polygon') return g.coordinates[0];
  if (g.type === 'MultiPolygon') {
    let best = null;
    for (const poly of g.coordinates) {
      const r = poly[0];
      if (!best || r.length > best.length) best = r;
    }
    return best;
  }
  return null;
}
function entryDirTheta(f) {
  const ring = outerRing(f);
  if (!ring) return { dir: new THREE.Vector3(0, 1, 0), theta: 0.2 };
  const acc = new THREE.Vector3();
  const step = Math.max(1, Math.floor(ring.length / 240));
  let theta = 0;
  const pts = [];
  for (let i = 0; i < ring.length; i += step) {
    const v = util.lonLatToVec3(ring[i][0], ring[i][1], 1);
    pts.push(v); acc.add(v);
  }
  const dir = acc.normalize();
  for (const v of pts) theta = Math.max(theta, dir.angleTo(v));
  return { dir, theta: Math.min(theta, 1.2) };
}

/* ---------------------------------------------------------------------
 * polygons 图层访问器（读条目目标值；过渡由 three-globe 插值）
 * ------------------------------------------------------------------- */
const EDGE = new THREE.Color('#7adcf0');
const CITY_CAP = new THREE.Color('#8ec8ee');
const DIM_CAP = new THREE.Color('#081527');
const STROKE_HOT = new THREE.Color('#e6f9ff');
const tmpC = new THREE.Color();
const tmpS = new THREE.Color();

/* three-globe 访问器契约：颜色必须是 CSS 字符串（内部走 d3-color 的 color()/colorAlpha，
 * 传 THREE.Color 对象会被解析为 null 并在 .opacity 处抛错）。tmpC 仅用于计算，返回时转 hex。 */
/* 悬停/选中提亮：向浅色 lerp 会把深蓝洗成灰（低饱和省份尤其明显），
 * 改为 HSL 提亮保色相——与 v1 的 color 乘子思路一致，上限 0.62 防过曝。 */
const _hsl = { h: 0, s: 0, l: 0 };
function liftLightness(mult) {
  tmpC.getHSL(_hsl);
  tmpC.setHSL(_hsl.h, Math.min(1, _hsl.s * 0.95), Math.min(0.62, _hsl.l * mult));
}
/* 顶面微透明（rgba 0.93/0.96）：让夜景贴图的灯火从板块后透出，
 * 消除"实心塑料感"；板块彼此不重叠，透明排序无副作用 */
function capColorOf(e) {
  if (e.level === 'city') {
    tmpC.copy(CITY_CAP);
    if (e.selTarget) liftLightness(1.6);
    return `rgba(${Math.round(tmpC.r * 255)},${Math.round(tmpC.g * 255)},${Math.round(tmpC.b * 255)},0.96)`;
  }
  tmpC.copy(e.baseColor);
  if (e.selTarget) liftLightness(2.4);
  else if (e.hoverTarget) liftLightness(1.9);
  if (e.dimTarget) tmpC.lerp(DIM_CAP, 0.62);
  return `rgba(${Math.round(tmpC.r * 255)},${Math.round(tmpC.g * 255)},${Math.round(tmpC.b * 255)},0.93)`;
}
function altitudeOf(e) {
  /* three-globe 的 polygonAltitude 是「半径比例」而非绝对单位：
   * scale = 1 + alt。v1 常量是绝对单位（R=100 下 1.2 = 1.2%），须除以 GLOBE_R。 */
  const base = (e.level === 'city' ? CITY_ALT : PROV_ALT) / GLOBE_R;
  return base * (1 + 0.5 * (e.selTarget || 0) + 0.3 * (e.hoverTarget || 0)) * (1 - 0.45 * (e.dimTarget || 0));
}
function strokeColorOf(e) {
  if (e.level === 'city') {
    tmpC.copy(EDGE).lerp(STROKE_HOT, 0.4 + 0.4 * (e.selTarget || 0));
    return '#' + tmpC.getHexString();
  }
  tmpC.copy(EDGE);
  if (e.selTarget || e.hoverTarget) tmpC.lerp(STROKE_HOT, 0.45);
  if (e.dimTarget) tmpC.multiplyScalar(0.45);
  return '#' + tmpC.getHexString();
}
function sideColorOf(e) {
  capColorOf(e);                       // 副作用：tmpC 已是顶面最终色
  tmpS.copy(tmpC).multiplyScalar(0.42); // 侧面压暗一档，强化板块厚度感
  return '#' + tmpS.getHexString();
}

/* ---------------------------------------------------------------------
 * 边界辉光线：three-globe 内置 stroke 画在底部半径处，会被抬升的板块
 * 盖住（下钻时看不到地市边界）。为每个 Feature 单独构建 LineSegments，
 * 几何建在单位球面（半径 R），每帧按板块当前高度缩放贴合板顶。
 * ------------------------------------------------------------------- */
function makeBoundaryLines(feature, color, opacity) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const pos = [];
  for (const poly of polys) for (const ring of poly) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = util.lonLatToVec3(ring[i][0], ring[i][1], GLOBE_R);
      const b = util.lonLatToVec3(ring[i + 1][0], ring[i + 1][1], GLOBE_R);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 3;
  return lines;
}
const BND_LIFT = 0.0016;   // 贴板顶的额外高度（半径比例）
function syncBoundary(e, baseOp, selOp, hoverOp, dimOp) {
  if (!e.bnd) return;
  const tgt = altitudeOf(e);
  e.altCur = (e.altCur === undefined ? tgt : e.altCur + (tgt - e.altCur) * 0.14);
  e.bnd.scale.setScalar(1 + e.altCur + BND_LIFT);
  const op = e.dimTarget ? dimOp : e.selTarget ? selOp : e.hoverTarget ? hoverOp : baseOp;
  const m = e.bnd.material;
  m.opacity += (op - m.opacity) * 0.18;
  m.visible = m.opacity > 0.02;
}
let capFn = d => capColorOf(d.__gd);
let sideFn = d => sideColorOf(d.__gd);
let altFn = d => altitudeOf(d.__gd);
let strokeFn = d => strokeColorOf(d.__gd);

admin.refreshPolygons = function () {
  const globe = GD.scene.globe;
  capFn = d => capColorOf(d.__gd);
  sideFn = d => sideColorOf(d.__gd);
  altFn = d => altitudeOf(d.__gd);
  strokeFn = d => strokeColorOf(d.__gd);
  globe.polygonCapColor(capFn).polygonSideColor(sideFn).polygonAltitude(altFn).polygonStrokeColor(strokeFn);
};

function currentPolyData() {
  const S = GD.state.S;
  return S.provinces.map(e => e.feature).concat(S.activeCity.features);
}

/* ---------------------------------------------------------------------
 * 省级图层构建
 * ------------------------------------------------------------------- */
admin.buildProvinces = function (features) {
  const S = GD.state.S;
  const globe = GD.scene.globe;
  const plateRings = [];
  let tenDashFeature = null;

  for (const f of features) {
    const p = f.properties || {};
    const code = String(p.adcode || p.ADCODE || '');
    const name = p.name || p.NAME || '';
    if (!code || code === '100000') continue;
    if (/_JD$/.test(code)) { tenDashFeature = f; continue; }   // 十段线单独绘制
    if (!name || !f.geometry) continue;
    util.normalizeFeature(f);
    const key = util.normRegion(name);
    const agg = GD.data.provAgg.get(key) || { count: 0, amount: 0, projects: [] };
    const { dir, theta } = entryDirTheta(f);
    const entry = {
      key, name, code, level: 'province', feature: f,
      count: agg.count, amount: agg.amount, projects: agg.projects || [],
      dir, theta, chip: null,
      hoverTarget: 0, selTarget: 0, dimTarget: 0,
      baseColor: util.colorForCount(agg.count, GD.data.maxProvCount),
    };
    f.__gd = entry;
    S.provinces.push(entry);
    S.provByKey.set(key, entry);
    plateRings.push(f);
    /* 角标锚点：多边形内极点（保证落在板块内、离边界最远），失败退回外环质心 */
    entry.labelLL = util.polylabel(util.largestPolygon(f)) || null;
    /* 板顶辉光边界 */
    entry.bnd = makeBoundaryLines(f, 0x9fe8ff, 0.5);
    entry.bnd.scale.setScalar(1 + altitudeOf(entry) + BND_LIFT);
    globe.add(entry.bnd);
  }

  globe
    .polygonsData(S.provinces.map(e => e.feature))
    .polygonCapColor(capFn)
    .polygonSideColor(sideFn)
    .polygonAltitude(altFn)
    .polygonStrokeColor(strokeFn)
    .polygonsTransitionDuration(280);

  if (tenDashFeature) admin.buildTenDashLine(tenDashFeature);
  admin.buildTaiwanDetail();
  return S.provinces;
};

/* ---------------------------------------------------------------------
 * 十段线（南海诸岛归属界线）：逐段 LineSegments，合规要素
 * ------------------------------------------------------------------- */
admin.buildTenDashLine = function (f) {
  const g = f.geometry;
  if (!g) return;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const pos = [];
  for (const poly of polys) for (const ring of poly) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = util.lonLatToVec3(ring[i][0], ring[i][1], GLOBE_R * 1.021);
      const b = util.lonLatToVec3(ring[i + 1][0], ring[i + 1][1], GLOBE_R * 1.021);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xa8d4ff, transparent: true, opacity: 0.6, depthWrite: false,
  }));
  GD.scene.globe.add(lines);
  GD.state.S.tenDash = lines;
};

/* ---------------------------------------------------------------------
 * 台湾县市细节：全国视图叠加县市界线（合规：内部细节可见），
 * 下钻时由 ensureCities 提供县市级板块
 * ------------------------------------------------------------------- */
admin.buildTaiwanDetail = function () {
  const TG = window.TAIWAN_GEO;
  if (!TG) return;
  const pos = [];
  for (const f of TG.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) for (const ring of poly) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = util.lonLatToVec3(ring[i][0], ring[i][1], GLOBE_R * 1.032);
        const b = util.lonLatToVec3(ring[i + 1][0], ring[i + 1][1], GLOBE_R * 1.032);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0x9fd8ee, transparent: true, opacity: 0.35, depthWrite: false,
  }));
  GD.scene.globe.add(lines);
};

/* ---------------------------------------------------------------------
 * 省份角标（名称 + 项目数胶囊，CSS2D）
 * ------------------------------------------------------------------- */
/* 角标防挤：角距过近的一对沿大圆互相推开（球面切向），
 * 推开后落点若离开本省多边形则回退——保证"居中"优先、"不挤"尽力而为 */
function spreadChips(list) {
  const MIN = 0.085;                       // 允许的最小角距（弧度，≈5°）
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i].dir, B = list[j].dir;
      const ang = A.angleTo(B);
      if (ang >= MIN || ang < 1e-6) continue;
      const push = (MIN - ang) * 0.45;
      for (const [self, other] of [[list[i], B], [list[j], A]]) {
        const away = self.dir.clone().sub(other);
        const t = away.addScaledVector(self.dir, -away.dot(self.dir));
        if (t.lengthSq() < 1e-12) continue;
        t.normalize();
        const cand = self.dir.clone().addScaledVector(t, push).normalize();
        const { lon, lat } = util.vec3ToLonLat(cand);
        if (geoContains(self.e.feature, [lon, lat])) { self.dir = cand; moved = true; }
      }
    }
    if (!moved) break;
  }
}

admin.buildChips = function () {
  const S = GD.state.S;
  const list = [];
  for (const e of S.provinces) {
    if (!e.count) continue;
    const div = document.createElement('div');
    div.className = 'c2d';
    div.innerHTML = `<div class="prov-chip"><span>${util.esc(e.name.replace(/(省|市|自治区|特别行政区|维吾尔|壮族|回族)/g, ''))}</span><span class="n" style="background:${util.countColorCss(e.count, GD.data.maxProvCount)}">${e.count}</span></div>`;
    /* 用极点锚点居中；高度从 1.09R 降到 1.05R，减少球缘视差把角标"甩"出板块 */
    const base = (e.labelLL
      ? util.lonLatToVec3(e.labelLL[0], e.labelLL[1], 1)
      : e.dir.clone()).normalize();
    const pos = base.clone().multiplyScalar(GLOBE_R * 1.05);
    const obj = new CSS2DObject(div);
    obj.position.copy(pos);
    GD.scene.globe.add(obj);
    e.chip = { el: div, obj, pos: pos.clone(), key: e.key };
    S.chips.push(e.chip);
    list.push({ e, dir: base.clone(), chip: e.chip });
  }
  spreadChips(list);
  for (const it of list) {
    const pos = it.dir.clone().multiplyScalar(GLOBE_R * 1.05);
    it.chip.obj.position.copy(pos);
    it.chip.pos.copy(pos);
  }
};

/* 数据省份 → 地图省份 匹配检查（写错的省份红色告警，同 v1） */
admin.checkUnmatched = function () {
  const miss = [];
  for (const k of GD.data.provAgg.keys()) {
    if (k !== '未匹配' && !GD.state.S.provByKey.has(k)) miss.push(k);
  }
  if (GD.data.provAgg.has('未匹配')) miss.unshift('未填写省份');
  if (miss.length) GD.panels.toast(`警告：${miss.join('、')} 未匹配到地图行政区，相关项目不会落点`, 'err', 5200);
};

/* ---------------------------------------------------------------------
 * 地市下钻：懒加载 + 缓存；板块以叠加层形式并入 polygons 数据
 * ------------------------------------------------------------------- */
function buildCityEntries(feats, provEntry) {
  const entries = [];
  for (const f of feats) {
    const p = f.properties || {};
    const name = p.name || p.NAME || '';
    const code = String(p.adcode || p.ADCODE || '');
    if (!name || /_JD$/.test(code) || !f.geometry) continue;
    util.normalizeFeature(f);
    const e = {
      key: util.normRegion(name), name, code, level: 'city', feature: f,
      provKey: provEntry.key, dir: entryDirTheta(f).dir, theta: 0.2,
      hoverTarget: 0, selTarget: 0, dimTarget: 0, appear: 0,
      baseColor: CITY_CAP.clone(),
      labelLL: util.polylabel(util.largestPolygon(f)) || null,
    };
    f.__gd = e;
    entries.push(e);
  }
  return entries;
}

admin.clearActiveCity = function () {
  const S = GD.state.S;
  for (const l of S.activeCity.labels) { GD.scene.globe.remove(l.obj); l.div.remove(); }
  for (const b of S.activeCity.bnds || []) {
    GD.scene.globe.remove(b); b.geometry.dispose(); b.material.dispose();
  }
  S.activeCity = { features: [], labels: [], entries: [], bnds: [], provKey: null };
  GD.scene.globe.polygonsData(currentPolyData());
  admin.refreshPolygons();
};

function showCityLabels(entries, provKey) {
  const S = GD.state.S;
  for (const l of S.activeCity.labels) { GD.scene.globe.remove(l.obj); l.div.remove(); }
  S.activeCity.labels = [];
  const provMeta = S.provByKey.get(provKey);
  const capital = CAPITAL_MAP[provKey] || '';
  const counts = new Map();
  for (const p of provMeta ? provMeta.projects : []) {
    const ck = util.normRegion(p.city);
    counts.set(ck, (counts.get(ck) || 0) + 1);
  }
  /* 沿海城市含大量岛屿多边形：每个城市只取顶点数最多的 entry 作标签锚点 */
  const best = new Map();
  for (const e of entries) {
    const ring = outerRing(e.feature) || [];
    const prev = best.get(e.key);
    if (!prev || ring.length > prev.ringLen) best.set(e.key, { e, ringLen: ring.length });
  }
  for (const { e } of best.values()) {
    const n = counts.get(e.key) || 0;
    const isCap = e.key === util.normRegion(capital);
    const div = document.createElement('div');
    div.className = 'c2d';
    div.innerHTML = `<span class="city-label${isCap ? ' capital' : ''}">${util.esc(e.name)}${n ? `<span class="n">${n}</span>` : ''}</span>`;
    /* 极点锚点居中（如唐山/湛江多岛城市质心会漂到海上），高度贴近板顶减少视差 */
    const pos = e.labelLL
      ? util.lonLatToVec3(e.labelLL[0], e.labelLL[1], GLOBE_R * 1.055)
      : e.dir.clone().multiplyScalar(GLOBE_R * 1.055);
    const obj = new CSS2DObject(div);
    obj.position.copy(pos);
    GD.scene.globe.add(obj);
    S.activeCity.labels.push({ obj, div, pos: pos.clone() });
  }
  /* 台湾选中时按官方地图惯例标注钓鱼岛、赤尾屿 */
  if (provKey === '台湾') {
    for (const il of [{ n: '钓鱼岛', lon: 123.47, lat: 25.75 }, { n: '赤尾屿', lon: 124.56, lat: 25.9 }]) {
      const div = document.createElement('div');
      div.className = 'c2d';
      div.innerHTML = `<span class="city-label islet">${util.esc(il.n)}</span>`;
      const pos = util.lonLatToVec3(il.lon, il.lat, GLOBE_R * 1.02);
      const obj = new CSS2DObject(div);
      obj.position.copy(pos);
      GD.scene.globe.add(obj);
      S.activeCity.labels.push({ obj, div, pos: pos.clone() });
    }
  }
}

admin.ensureCities = async function (entry) {
  const S = GD.state.S;
  if (S.activeCity.provKey === entry.key) return;
  admin.clearActiveCity();
  S.activeCity.provKey = entry.key;
  const finish = (entries) => {
    S.activeCity.entries = entries;
    S.activeCity.features = entries.map(e => e.feature);
    if (S.activeCity.provKey === entry.key) {
      /* 每次下钻重建地市边界辉光线（缓存的 entry 复用时旧线已随 clearActiveCity 销毁） */
      S.activeCity.bnds = [];
      for (const e of entries) {
        e.bnd = makeBoundaryLines(e.feature, 0xc8f2ff, 0.75);
        e.bnd.scale.setScalar(1 + altitudeOf(e) + BND_LIFT);
        GD.scene.globe.add(e.bnd);
        S.activeCity.bnds.push(e.bnd);
      }
      GD.scene.globe.polygonsData(currentPolyData());
      admin.refreshPolygons();
      showCityLabels(entries, entry.key);
    }
  };
  /* 台湾：DataV 不提供 710000_full，使用本地内置县市级数据 */
  if (entry.code === '710000' && window.TAIWAN_GEO) {
    finish(buildCityEntries(window.TAIWAN_GEO.features || [], entry));
    return;
  }
  const cached = S.cityCache.get(entry.code);
  if (cached) { finish(cached.entries); return; }
  try {
    const d = await cachedJSON(GD.CFG.geoUrls.cityBase + entry.code + '_full.json');
    if (S.activeCity.provKey !== entry.key) return;
    const entries = buildCityEntries(d.features || [], entry);
    S.cityCache.set(entry.code, { entries });
    finish(entries);
  } catch (e) {
    console.warn('地市边界加载失败：', e);
    GD.panels.toast(`${entry.name} 地市边界加载失败，已跳过`, 'err');
  }
};

/* ---------------------------------------------------------------------
 * 数学拾取：相机射线 ∩ 球面 → 经纬度 → geoContains 判定落点
 * 返回 { kind:'province'|'city', entry } 或 null
 * ------------------------------------------------------------------- */
const pickSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_R * 1.03);
const pickRay = new THREE.Ray();
const pickV = new THREE.Vector3();
admin.pickAt = function (ndcX, ndcY) {
  const S = GD.state.S;
  pickRay.origin.setFromMatrixPosition(GD.scene.camera.matrixWorld);
  pickV.set(ndcX, ndcY, 0.5).unproject(GD.scene.camera).sub(pickRay.origin).normalize();
  pickRay.direction.copy(pickV);
  const hit = pickRay.intersectSphere(pickSphere, new THREE.Vector3());
  if (!hit) return null;
  const n = hit.normalize();
  /* 反解经纬度（与 three-globe polar2Cartesian 同约定，见 util.vec3ToLonLat） */
  const { lon, lat } = util.vec3ToLonLat(n);
  const pt = [lon, lat];
  for (const e of S.activeCity.entries || []) {
    if (geoContains(e.feature, pt)) return { kind: 'city', entry: e };
  }
  for (const e of S.provinces) {
    if (e.dir.angleTo(n) > e.theta + 0.35) continue;   // 包围角预筛
    if (geoContains(e.feature, pt)) return { kind: 'province', entry: e };
  }
  return null;
};

/* ---------------------------------------------------------------------
 * 每帧更新：CSS2D 标注背面淡出 / 非焦点压暗（DOM 写入去抖，同 v1）
 * ------------------------------------------------------------------- */
admin.update = function () {
  const S = GD.state.S;
  const fadeK = GD.interaction && GD.interaction.fadeK;
  if (!fadeK) return;
  /* 板顶边界辉光线：跟随板块高度升降 + 状态淡入淡出 */
  for (const e of S.provinces) syncBoundary(e, 0.5, 0.95, 0.85, 0.1);
  for (const e of S.activeCity.entries || []) syncBoundary(e, 0.75, 1, 0.95, 0.75);
  for (const c of S.chips) {
    const k = fadeK(c.pos);
    const dim = S.selected.provinceKey && c.key !== S.selected.provinceKey;
    const o = Math.round(k * (dim ? 0.10 : 1) * 100) / 100;
    if (o !== c._lastO) { c.el.style.opacity = o; c._lastO = o; }
    const show = o >= 0.03 ? 'block' : 'none';
    if (show !== c._lastShow) { c.el.style.display = show; c._lastShow = show; }
    c.el.firstChild.classList.toggle('sel', !dim && !!S.selected.provinceKey);
  }
  for (const l of S.activeCity.labels) l.div.style.opacity = fadeK(l.pos) * 0.96;
  if (S.scsLabel) S.scsLabel.div.style.opacity = fadeK(S.scsLabel.pos) * 0.85;
  for (const l of S.worldLabels) l.div.style.opacity = fadeK(l.pos) * 0.75;
};

/* ---------------------------------------------------------------------
 * 大洲大洋方位标注 + 南海诸岛常驻标注（合规/方位感，移植 v1）
 * ------------------------------------------------------------------- */
admin.buildWorldLabels = function () {
  const S = GD.state.S;
  const LABELS = [
    ['亚 洲', 95, 58], ['欧 洲', 20, 52], ['非 洲', 18, 4],
    ['北美洲', -100, 46], ['南美洲', -60, -14], ['大洋洲', 134, -24],
    ['太平洋', -152, 2], ['大西洋', -34, 30], ['印 度 洋', 76, -22],
  ];
  for (const [name, lon, lat] of LABELS) {
    const div = document.createElement('div');
    div.className = 'c2d';
    div.innerHTML = `<span class="world-label">${util.esc(name)}</span>`;
    const pos = util.lonLatToVec3(lon, lat, GLOBE_R * 0.995);
    const obj = new CSS2DObject(div);
    obj.position.copy(pos);
    GD.scene.globe.add(obj);
    S.worldLabels.push({ div, pos: pos.clone() });
  }
  const div = document.createElement('div');
  div.className = 'c2d';
  div.innerHTML = '<span class="scs-label">南海诸岛</span>';
  const pos = util.lonLatToVec3(112.5, 14.2, GLOBE_R * 1.02);
  const obj = new CSS2DObject(div);
  obj.position.copy(pos);
  GD.scene.globe.add(obj);
  S.scsLabel = { div, pos: pos.clone() };
};
