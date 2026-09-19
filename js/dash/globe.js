/* =====================================================================
 * GeoDash v2 · globe.js
 * 职责：渲染器 / 场景 / 相机 / OrbitControls / CSS2D 标注层 /
 *       three-globe 实例（夜景贴图 + 大气）/ 星空与背景光晕 / 尺寸自适应。
 * 设计要点：
 *  - 不使用 bloom 后处理链（v1 块状闪电教训）：无光照板块 + 贴图地球，
 *    亮度天然远离任何高通阈值，视觉靠大气层与贴图自身辉光。
 *  - 板块沿用 three-globe 默认的每板块独立无光照 MeshBasicMaterial（勿覆盖，见下）。
 *  - three-globe 低层不含 controls，自配 OrbitControls（v1 手感参数）。
 * 依赖：three、three-globe、core.js
 * 对外：GeoDash.scene = { scene, camera, renderer, controls, labelRenderer,
 *                          globe, onResize, fitStage, downgrade }
 * ===================================================================== */
import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

const GD = window.GeoDash;
const { GLOBE_R } = GD.const;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03060f);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 3000);
camera.position.set(0, 60, 240);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
/* 无色调映射：专题设色与贴图按原色输出，避免 ACES 拐点再次制造亮度敏感区 */
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

/* ---------- 像素比管理（4K 原生渲染，降级后锁定，同 v1） ---------- */
const MAX_PIXEL_RATIO = 2;
let pixelRatioLocked = false;
function applyPixelRatio() {
  const pr = pixelRatioLocked ? 1 : Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pr);
}
applyPixelRatio();

/* ---------- CSS2D 标注层（省份角标 / 城市标签 / 大洲大洋 / 南海诸岛） ---------- */
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, {
  position: 'fixed', top: '0', left: '0', pointerEvents: 'none', zIndex: '6',
});
document.body.appendChild(labelRenderer.domElement);

/* ---------- 轨道控制（v1 手感：阻尼 + 缩放联动减速由 interaction 处理） ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = GLOBE_R * 1.25;
controls.maxDistance = GLOBE_R * 4.2;
controls.zoomSpeed = 0.8;
controls.enablePan = false;
controls.autoRotateSpeed = 0.32;
controls.minPolarAngle = Math.PI * 0.08;
controls.maxPolarAngle = Math.PI * 0.92;

/* ---------- three-globe 实例 ---------- */
const globe = new ThreeGlobe()
  .globeImageUrl(GD.CFG.globeUrls.globeImage)
  .bumpImageUrl(GD.CFG.globeUrls.bumpImage)
  .showAtmosphere(true)
  .atmosphereColor('#4aa8ff')
  .atmosphereAltitude(0.16);
scene.add(globe);

/* 球体贴图自发光化：three-globe 的地球材质是 MeshPhongMaterial（受光），
 * 而 v2 无光照设计下受光材质会渲染成纯黑（贴图不可见）。
 * 把贴图转成 emissiveMap 输出原色，既保留夜景纹理又维持"无灯"稳定性。 */
const globeMat = globe.globeMaterial();
globeMat.emissive = new THREE.Color(0xffffff);
globeMat.emissiveIntensity = 1;
const syncEmissiveMap = () => {
  if (globeMat.map && globeMat.emissiveMap !== globeMat.map) {
    globeMat.emissiveMap = globeMat.map;
    globeMat.needsUpdate = true;
  }
};

/* 板块材质说明：three-globe 2.45 的 polygons 图层默认就是「每板块独立
 * MeshBasicMaterial（无光照）+ 由 capColor/sideColor 字符串写入 material.color」。
 * 切勿用 polygonCapMaterial 传自定义材质覆盖——一旦提供自定义材质，图层会跳过
 * 颜色写入（源码 !capMaterial && capColor 守卫），整片板块会变成无顶点色的黑块。
 * v1 的「无光照防闪电」结论由此天然满足。 */

/* ---------- 星空三层 + 银河带（移植 v1） ---------- */
function makeStars(count, minR, maxR, size, opacity) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = minR + Math.random() * (maxR - minR);
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph);
    const t = Math.random(); let cr, cg, cb;
    if (t < 0.12) { cr = 1; cg = .82; cb = .62; } else if (t < 0.32) { cr = .72; cg = .85; cb = 1; } else { cr = cg = cb = 1; }
    const b = 0.35 + Math.random() * 0.65;
    col[i * 3] = cr * b; col[i * 3 + 1] = cg * b; col[i * 3 + 2] = cb * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size, vertexColors: true, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
}
const stars = {
  far: makeStars(3000, 1800, 3400, 2.6, 0.6),
  mid: makeStars(1000, 1100, 1800, 3.8, 0.5),
  near: makeStars(200, 760, 1200, 5.6, 0.7),
};
scene.add(stars.far, stars.mid, stars.near);

/* ---------- 深空背景光晕（移植 v1，尺度按 R=100 体系放大 20 倍） ---------- */
function makeGlowTexture(rgb) {
  const size = 128;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,.8)');
  g.addColorStop(0.12, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.55)`);
  g.addColorStop(0.34, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.16)`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
function backdropGlow(rgb, scale, x, y, z, opacity) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(rgb), blending: THREE.AdditiveBlending, transparent: true,
    opacity, depthWrite: false,
  }));
  sp.position.set(x, y, z); sp.scale.set(scale, scale, 1);
  scene.add(sp);
}
backdropGlow([40, 110, 190], 1400, -280, 120, -800, 0.16);
backdropGlow([110, 70, 190], 1100, 600, -160, -700, 0.12);
GD.globeTextures = { makeGlowTexture };

/* ---------- 每帧更新：星空缓慢漂移 ---------- */
globe.update = undefined; /* 占位防止 main 误调；星空漂移在下方 starsUpdate */
function starsUpdate(t) {
  syncEmissiveMap();
  stars.far.rotation.y = t * 0.003;
  stars.mid.rotation.y = -t * 0.004;
  stars.near.rotation.y = t * 0.005;
}

GD.scene = {
  scene, camera, renderer, controls, labelRenderer, globe,
  starsUpdate,
  GLOBE_R,

  /** 尺寸自适应：3D 画布全屏 + 1920×1080 设计稿等比缩放 */
  onResize() {
    applyPixelRatio();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    labelRenderer.setSize(innerWidth, innerHeight);
    GD.scene.fitStage();
  },
  fitStage() {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  },

  /** 自适应画质降级（main.js 检测持续低帧时调用，一次性） */
  downgrade() {
    pixelRatioLocked = true;
    renderer.setPixelRatio(1);
  },
};
