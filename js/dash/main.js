/* =====================================================================
 * GeoDash v2 · main.js
 * 职责：应用入口 —— 启动编排（取数 → 建层 → 面板 → 开场动画）、
 *       渲染主循环、FPS 统计与自适应画质、对外调试 API。
 * 依赖：全部 dash 模块（顺序即初始化顺序）
 * 对外：window.__DASH
 * ===================================================================== */
import * as THREE from 'three';

import './core.js';
import './three-global.js';   // 必须先于 globe.js：给 three-globe 提供全局 core THREE（见该文件注释）
import './globe.js';
import './state.js';
import './admin.js';
import './markers.js';
import './panels.js';
import './interaction.js';

const GD = window.GeoDash;
const P = () => GD.panels;

/* ---------------------------------------------------------------------
 * 渲染主循环
 * ------------------------------------------------------------------- */
const clock = new THREE.Clock();
let fpsFrames = 0, fpsLast = performance.now(), lowStreak = 0, qualityDropped = false;

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const now = performance.now();

  GD.interaction.update(now);      // 相机飞行/自转/拾取/读数
  GD.admin.update();               // CSS2D 标注淡出/压暗
  GD.markers.update(t);            // 光晕/亮芯/脉冲环/飞线/选中环
  GD.scene.starsUpdate(t);         // 星空漂移

  GD.scene.renderer.render(GD.scene.scene, GD.scene.camera);
  GD.scene.labelRenderer.render(GD.scene.scene, GD.scene.camera);

  /* FPS 统计 + 自适应画质（无 bloom 链，降级仅锁像素比） */
  fpsFrames++;
  if (now - fpsLast >= 800) {
    const fps = Math.round(fpsFrames * 1000 / (now - fpsLast));
    P().el.fpsVal.textContent = fps;
    P().el.fpsVal.classList.toggle('warn', fps < 28);
    fpsFrames = 0; fpsLast = now;
    if (!qualityDropped && fps < 26) {
      if (++lowStreak >= 3) {
        qualityDropped = true;
        GD.scene.downgrade();
        P().toast('检测到帧率偏低，已自动调整渲染分辨率', '', 2600);
      }
    } else if (fps >= 40) lowStreak = 0;
  }
}

/* ---------------------------------------------------------------------
 * 开场动画：远景 → 中国大视角
 * ------------------------------------------------------------------- */
function introFly() {
  GD.interaction.flyTo(GD.util.lonLatToVec3(103.5, 35.5, 1), GD.const.GLOBE_R * 2.05, 2800, 0.25);
}

/* ---------------------------------------------------------------------
 * 启动编排
 * ------------------------------------------------------------------- */
function failBoot(msg) {
  window.__setProgress(100, 'FAILED');
  P().el.loadingTitle && (P().el.loadingTitle.textContent = 'Load Failed');
  const err = document.getElementById('errorMsg');
  if (err) { err.style.display = 'block'; err.textContent = '⚠ ' + msg; }
  const retry = document.getElementById('retryBtn');
  if (retry) retry.style.display = 'block';
}

async function init() {
  try {
    GD.scene.fitStage();
    animate();
    window.__setProgress(38, 'FETCHING GEO DATA...');
    const features = await GD.admin.loadProvinceFeatures();
    window.__setProgress(64, 'BUILDING GEOMETRY...');
    await new Promise(r => setTimeout(r, 30));
    GD.admin.buildProvinces(features);
    GD.admin.checkUnmatched();
    GD.markers.buildMarkers();
    GD.markers.buildArcs();
    GD.admin.buildChips();
    GD.admin.buildWorldLabels();
    P().renderGlobalStats();
    P().renderLegend();
    GD.interaction.buildSearchIndex();
    P().updateCrumb();
    P().renderScopedPanels();
    window.__setProgress(100, 'READY');
    setTimeout(() => {
      const loading = document.getElementById('loading');
      if (loading) loading.classList.add('hidden');
      P().el.panelLeft.classList.add('in');
      P().el.panelRight.classList.add('in');
      introFly();
    }, 450);
  } catch (err) {
    console.error(err);
    failBoot(`地图数据加载失败（${err.message}）。请检查网络后重试；离线部署方式见 README.md。`);
  }
}

window.addEventListener('error', ev => {
  if (!window.__dashBooted) return;
  console.error('[GeoDash v2]', ev.message);
});

/* ---------------------------------------------------------------------
 * 启动
 * ------------------------------------------------------------------- */
window.__dashBooted = true;
window.__setProgress(22, 'BUILDING SCENE...');
GD.interaction.init();
addEventListener('resize', () => GD.scene.onResize());
init();

/* ---------------------------------------------------------------------
 * 对外调试 / 集成 API（与 v1 兼容）
 * ------------------------------------------------------------------- */
window.__DASH = {
  selectProvince: GD.interaction.selectProvince,
  selectProject: GD.interaction.selectProject,
  selectCity: GD.interaction.selectCity,
  clearSelection: GD.interaction.clearSelection,
  flyToLonLat: (lon, lat, dist = GLOBE_DIST(), dur, lift) => GD.interaction.flyToLonLat(lon, lat, dist, dur, lift),
  setSensitivity: v => GD.interaction.setSensitivity(v),
  setPure: on => GD.interaction.setPure(on),
  camera: GD.scene.camera,
  controls: GD.scene.controls,
  globe: GD.scene.globe,
};
function GLOBE_DIST() { return GD.const.GLOBE_R * 1.6; }
