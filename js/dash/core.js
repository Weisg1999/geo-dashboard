/* =====================================================================
 * GeoDash v2 · core.js
 * 职责：命名空间、配置合并、常量（three-globe 半径体系）、通用工具
 *       （地理/颜色/GeoJSON 绕向矫正）、项目数据模型与省级聚合。
 * 依赖：three（颜色）、js/config.js、js/projects.data.js（经典脚本先载）
 * 对外：GeoDash.CFG / STATUS / const / util / data
 * 与 v1 差异：半径体系改为 three-globe 的 GLOBE_R=100；新增绕向矫正
 *       （three-globe 沿用 D3 球面约定：外环 CW，与 RFC7946 相反）；
 *       移除平板投影工具（v2 不再做 ShapeGeometry 球面重建）。
 * ===================================================================== */
import * as THREE from 'three';

const GD = (window.GeoDash = window.GeoDash || {});

/* ---------------------------------------------------------------------
 * 配置合并：js/config.js 提供初值，此处补齐兜底默认值
 * ------------------------------------------------------------------- */
GD.CFG = Object.assign({
  company: '伊莱诺瓦', title: '项目分布数字大屏', subtitle: 'PROJECT GEO · DIGITAL DASHBOARD',
  hq: { name: '北京总部', lon: 116.4074, lat: 39.9042 },
  showArcs: true, idleSeconds: 10, sensitivity: 1, markerColor: '#ffc964',
  statusMeta: {
    operating: { label: '在营', color: '#2dd4bf' },
    building:  { label: '在建', color: '#fbbf24' },
    planning:  { label: '规划', color: '#a78bfa' },
  },
  typeColors: {},
  geoUrls: {
    province: './vendor/geo/100000_full.json',            // 省级底图已本地化（DataV areas_v3）
    cityBase: 'https://geo.datav.aliyun.com/areas_v3/bound/', // 市级按需下钻仍走远端（localStorage 缓存）
  },
  /* three-globe 球面贴图（已本地化到 vendor/img，全离线可用） */
  globeUrls: {
    globeImage: './vendor/img/earth-night.jpg',
    bumpImage: './vendor/img/earth-topology.png',
  },
}, window.DASH_CONFIG || {});

GD.STATUS = GD.CFG.statusMeta;
const TYPE_FALLBACK = ['#22d3ee', '#60a5fa', '#a78bfa', '#34d399', '#f59e0b', '#f472b6', '#94a8b8', '#fbbf24'];

/* ---------------------------------------------------------------------
 * 常量：three-globe 球半径固定 100，所有高度/尺寸以其为单位
 * ------------------------------------------------------------------- */
const GLOBE_R = 100;
GD.const = {
  GLOBE_R,
  /* 板块悬浮高度（球半径百分比 → 单位）：省 1.8%、市 2.6%（v2.1 加厚提升立体感） */
  PROV_ALT: GLOBE_R * 0.018,
  CITY_ALT: GLOBE_R * 0.026,
  LAT0: 30 * Math.PI / 180,
};

/* ---------------------------------------------------------------------
 * 工具函数
 * ------------------------------------------------------------------- */
GD.util = {
  /** HTML 转义（面板渲染统一走它，防注入） */
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  /** 行政区名规范化：'新疆维吾尔自治区' → '新疆'，'杭州市' → '杭州' */
  normRegion(s) {
    if (!s) return '';
    let t = String(s).trim();
    const SUF = ['特别行政区', '维吾尔自治区', '壮族自治区', '回族自治区', '自治区', '自治州', '省', '市', '地区', '盟'];
    for (const suf of SUF) { if (t.endsWith(suf) && t.length > suf.length) { t = t.slice(0, -suf.length); break; } }
    return t;
  },

  /* 经纬度 → 直角坐标：必须与 three-globe 的 polar2Cartesian 完全一致
   * （phi=90-lat, theta=90-lng；x=r·sinφ·cosθ, y=r·cosφ, z=r·sinφ·sinθ）。
   * v1 的自定义约定（-cos·cos / sin）与 three-globe 相差绕 Y 轴 90°，
   * 直接沿用会让标记/角标/相机与板块错位。反向公式：
   *   lat = 90° - acos(y)；lon = 90° - atan2(z, x)。 */
  lonLatToVec3(lonDeg, latDeg, radius = GLOBE_R) {
    const phi = (90 - latDeg) * Math.PI / 180, theta = (90 - lonDeg) * Math.PI / 180;
    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  },
  vec3ToLonLat(v) {
    const n = v.clone().normalize();
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI;
    let lon = 90 - Math.atan2(n.z, n.x) * 180 / Math.PI;
    if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
    return { lon, lat };
  },

  /* ---------- GeoJSON 绕向矫正 ----------
   * three-globe（three-conic-polygon-geometry）沿用 D3/TopoJSON 球面约定：
   * 外环顺时针(CW)、洞逆时针(CCW)；而 DataV 等标准 GeoJSON(RFC7946) 为
   * 外环 CCW。直接喂入会被球面三角剖分解释成"补集"，整球被盖满。
   * 平面有向面积（shoelace）>0 即 CCW。 */
  ringArea(ring) {
    let a = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  },
  fixRing(ring, wantCCW) {
    if ((GD.util.ringArea(ring) > 0) !== wantCCW) ring.reverse();
    return ring;
  },
  /** 原地矫正一个 Feature 的全部环：外环 CW、洞 CCW（three-globe 约定） */
  normalizeFeature(f) {
    const g = f && f.geometry;
    if (!g) return f;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) poly.forEach((ring, i) => GD.util.fixRing(ring, i !== 0));
    return f;
  },

  /* ---------- 标注锚点：polylabel（Mapbox 极点算法，MIT 思路自实现） ----------
   * 求多边形内距边界最远的点：视觉居中且保证落在面内。
   * 外环质心对狭长省（内蒙古/甘肃）或多岛省（广东/福建）常跑到界外/海上，
   * 导致角标"跑出地图"。经纬度平面近似对标注定位精度足够。 */
  largestPolygon(f) {
    const g = f && f.geometry;
    if (!g) return null;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let best = null, bestA = -1;
    for (const poly of polys) {
      const a = Math.abs(GD.util.ringArea(poly[0]));
      if (a > bestA) { bestA = a; best = poly; }
    }
    return best;
  },
  polylabel(polygon, precision = 0.08) {
    if (!polygon || !polygon.length) return null;
    const rings = polygon;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rings) for (const p of r) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    const segDist = (x, y, ax, ay, bx, by) => {
      let dx = bx - ax, dy = by - ay;
      if (dx || dy) {
        const t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
        if (t < 0) { x -= ax; y -= ay; }
        else if (t > 1) { x -= bx; y -= by; }
        else { x -= ax + t * dx; y -= ay + t * dy; }
      } else { x -= ax; y -= ay; }
      return Math.sqrt(x * x + y * y);
    };
    const signedDist = (x, y) => {
      let inside = false, d = Infinity;
      for (const r of rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        for (let i = 0, n = r.length - 1; i < n; i++) {
          const dd = segDist(x, y, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]);
          if (dd < d) d = dd;
        }
      }
      return inside ? d : -d;
    };
    const cellSize = Math.min(maxX - minX, maxY - minY);
    if (!cellSize) return [(minX + maxX) / 2, (minY + maxY) / 2];
    let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, d: signedDist((minX + maxX) / 2, (minY + maxY) / 2) };
    const mkCell = (x, y, h) => {
      const d = signedDist(x, y);
      if (d > best.d) best = { x, y, d };
      return { x, y, h, max: d + h * Math.SQRT2 };
    };
    const cells = [];
    for (let x = minX + cellSize / 2; x < maxX; x += cellSize)
      for (let y = minY + cellSize / 2; y < maxY; y += cellSize)
        cells.push(mkCell(x, y, cellSize / 2));
    while (cells.length) {
      let hi = 0;
      for (let i = 1; i < cells.length; i++) if (cells[i].max > cells[hi].max) hi = i;
      const cell = cells[hi];
      if (cell.max - best.d < precision) break;
      cells[hi] = cells[cells.length - 1]; cells.pop();
      const h = cell.h / 2;
      cells.push(mkCell(cell.x - h, cell.y - h, h));
      cells.push(mkCell(cell.x + h, cell.y - h, h));
      cells.push(mkCell(cell.x - h, cell.y + h, h));
      cells.push(mkCell(cell.x + h, cell.y + h, h));
    }
    return [best.x, best.y];
  },

  /* ---------- 项目密度配色带（0 深蓝 → 高值亮青），与 v1 一致 ---------- */
  rampColor(t) {
    const RAMP = GD.util.RAMP;
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i][0]) {
        const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
        return c0.clone().lerp(c1, (t - t0) / (t1 - t0));
      }
    }
    return RAMP[RAMP.length - 1][1].clone();
  },
  RAMP: [
    /* v2 底球是夜景贴图（比 v1 的纯色海洋亮且有纹理），色阶低端整体抬高一档，
     * 保证 0~1 个项目的省份仍能从贴图中读出来 */
    [0.00, new THREE.Color('#10294a')], [0.28, new THREE.Color('#1a4d78')],
    [0.55, new THREE.Color('#1b6a97')], [0.80, new THREE.Color('#28a6c9')],
    [1.00, new THREE.Color('#54e0f0')],
  ],
  NO_DATA_COLOR: new THREE.Color('#0a1626'),

  easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },

  $(id) { return document.getElementById(id); },
};

GD.util.colorForCount = function (n, max) {
  if (!n) return GD.util.NO_DATA_COLOR.clone();
  return GD.util.rampColor(0.18 + 0.82 * Math.sqrt(n / Math.max(1, max)));
};
GD.util.countColorCss = function (n, max) { return '#' + GD.util.colorForCount(n, max).getHexString(); };

/* ---------------------------------------------------------------------
 * 数据模型：项目归一化 + 省/市聚合（与 v1 完全一致，面板直接复用）
 * ------------------------------------------------------------------- */
GD.data = (() => {
  const projects = (Array.isArray(window.PROJECTS) ? window.PROJECTS : []).map((p, i) => {
    const lon = +p.lon, lat = +p.lat;
    if (!isFinite(lon) || !isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      console.warn('[数据] 无效经纬度，已跳过：', p);
      return null;
    }
    return {
      id: p.id || 'P' + String(i + 1).padStart(3, '0'),
      name: p.name || '未命名项目',
      type: p.type || '其他',
      status: GD.STATUS[p.status] ? p.status : 'operating',
      province: p.province || '', city: p.city || '', address: p.address || '',
      lon, lat, amount: +p.amount || 0, date: p.date || '',
    };
  }).filter(Boolean);

  const provAgg = new Map();
  const cityAggAll = new Map();
  for (const p of projects) {
    const k = GD.util.normRegion(p.province) || '未匹配';
    if (!provAgg.has(k)) provAgg.set(k, { count: 0, amount: 0, projects: [] });
    const a = provAgg.get(k);
    a.count++; a.amount += p.amount; a.projects.push(p);
    const ck = GD.util.normRegion(p.city) || k;
    cityAggAll.set(ck, (cityAggAll.get(ck) || 0) + 1);
  }
  const maxProvCount = Math.max(1, ...[...provAgg.values()].map(v => v.count));

  function typeColor(t) {
    return GD.CFG.typeColors[t] || TYPE_FALLBACK[[...t].reduce((s, c) => s + c.charCodeAt(0), 0) % TYPE_FALLBACK.length];
  }

  return { projects, provAgg, cityAggAll, maxProvCount, typeColor };
})();
