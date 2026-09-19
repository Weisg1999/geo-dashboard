/* =====================================================================
 * GeoDash v2 · markers.js
 * 职责：项目标记层 —— 光晕/亮芯/脉冲环精灵（v2.1 起去掉光柱）、
 *       总部飞线（three-globe arcs 原生虚线流光）、选中光环。
 * 与 v1 差异：半径体系 ×20（R 5→100）；飞线改用 three-globe arcsData
 *       （自带彗星虚线动画，免去自维护 ribbon 着色器）；标记挂到 globe 节点下。
 * 依赖：three、core.js、state.js、globe.js
 * 对外：GeoDash.markers = { buildMarkers, buildArcs, ensureSelRing, refreshArcs, update }
 * ===================================================================== */
import * as THREE from 'three';

const GD = window.GeoDash;
const { util, const: C } = GD;
const { GLOBE_R } = C;

const markersMod = (GD.markers = {});

const MARKER_COLOR = new THREE.Color(GD.CFG.markerColor || '#ffc964');
const rgbOf = c => [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];

/* ---------- 共享纹理（40 标记 × 3 精灵复用，同 v1） ---------- */
function makeRingTexture(rgb) {
  const size = 256;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.9)`;
  ctx.lineWidth = 10; ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.9)`;
  ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.344, 0, Math.PI * 2); ctx.stroke();
  return new THREE.CanvasTexture(c);
}
const markerTex = {
  glow: GD.globeTextures.makeGlowTexture(rgbOf(MARKER_COLOR)),
  ring: makeRingTexture(rgbOf(MARKER_COLOR)),
};

/* ---------- 项目标记构建（v2.1：去掉光柱，保留光晕/亮芯/脉冲环） ---------- */
markersMod.buildMarkers = function () {
  const S = GD.state.S;
  const host = GD.scene.globe;
  for (const p of GD.data.projects) {
    const dir = util.lonLatToVec3(p.lon, p.lat, 1).normalize();
    const surf = dir.clone().multiplyScalar(GLOBE_R * 1.026);
    const glowSize = 2.8 + Math.min(1.6, p.amount * 0.12);
    const dotSize = 1.35;
    const glowMat = new THREE.SpriteMaterial({ map: markerTex.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.position.copy(surf); glowSprite.scale.setScalar(glowSize);
    const dotMat = new THREE.SpriteMaterial({ map: markerTex.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95 });
    const dotSprite = new THREE.Sprite(dotMat);
    dotSprite.position.copy(surf).addScaledVector(dir, 0.1); dotSprite.scale.setScalar(dotSize);
    const ringMat = new THREE.SpriteMaterial({ map: markerTex.ring, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 });
    const ringSprite = new THREE.Sprite(ringMat);
    ringSprite.position.copy(surf).addScaledVector(dir, 0.24);
    const phase = Math.random() * Math.PI * 2;
    glowSprite.userData.project = p;   /* 供 markerPick 命中回溯 */
    host.add(glowSprite, dotSprite, ringSprite);
    S.markers.push({
      p, dir, surf, phase,
      glowSize, dotSize, glowSprite, dotSprite, ringSprite,
      glowMat, dotMat, ringMat,
      dimK: 0, dimTarget: 0, selK: 0, selTarget: 0,
    });
  }
};

/* ---------- 总部飞线：three-globe 原生 arcs（彗星虚线流光） ---------- */
markersMod.buildArcs = function () {
  if (!GD.CFG.showArcs) return;
  const S = GD.state.S;
  const globe = GD.scene.globe;
  for (const mk of S.markers) {
    S.arcs.push({
      startLat: GD.CFG.hq.lat, startLng: GD.CFG.hq.lon,
      endLat: mk.p.lat, endLng: mk.p.lon,
      p: mk.p, dimK: 0, dimTarget: 0, _lastA: -1,
    });
  }
  globe
    .arcsData(S.arcs)
    .arcStartLat('startLat').arcStartLng('startLng')
    .arcEndLat('endLat').arcEndLng('endLng')
    .arcColor(a => {
      const alpha = 0.85 * (1 - 0.92 * (a.dimK || 0));
      return [`rgba(255,201,100,${alpha.toFixed(3)})`, 'rgba(255,201,100,0)'];
    })
    .arcAltitude(0.28)
    .arcStroke(0.7)
    .arcDashLength(0.38).arcDashGap(0.22).arcDashAnimateTime(2600)
    .arcsTransitionDuration(300);
};
markersMod.refreshArcs = function () {
  const globe = GD.scene.globe;
  if (!GD.state.S.arcs.length) return;
  globe.arcColor(a => {
    const alpha = 0.85 * (1 - 0.92 * (a.dimK || 0));
    return [`rgba(255,201,100,${alpha.toFixed(3)})`, 'rgba(255,201,100,0)'];
  });
};

/* ---------- 选中项目光环（白色，与金色标记区分） ---------- */
markersMod.ensureSelRing = function (p) {
  const S = GD.state.S;
  if (!S.selRing) {
    S.selRing = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRingTexture([224, 242, 254]), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, opacity: 0.9,
    }));
    S.selRing.visible = false;
    GD.scene.globe.add(S.selRing);
  }
  if (!p) { S.selRing.visible = false; return; }
  const mk = S.markers.find(m => m.p === p);
  if (!mk) { S.selRing.visible = false; return; }
  S.selRing.visible = true;
  S.selRing.position.copy(mk.surf).addScaledVector(mk.dir, 0.4);
};

/* ---------- 每帧更新 ---------- */
markersMod.update = function (t) {
  const S = GD.state.S;
  const fadeK = GD.interaction && GD.interaction.fadeK;

  for (const mk of S.markers) {
    mk.dimK += (mk.dimTarget - mk.dimK) * 0.12;
    mk.selK += (mk.selTarget - mk.selK) * 0.12;
    const vis = (fadeK ? fadeK(mk.surf) : 1) * (1 - 0.93 * mk.dimK);
    const breathe = 1 + 0.07 * Math.sin(t * 1.6 + mk.phase);
    mk.glowSprite.scale.setScalar(mk.glowSize * breathe * (1 + mk.selK * 0.3));
    mk.glowMat.opacity = 0.85 * vis;
    mk.dotSprite.scale.setScalar(mk.dotSize * (1 + 0.18 * Math.sin(t * 2.1 + mk.phase) + mk.selK * 0.5));
    mk.dotMat.opacity = 0.95 * vis;
    const ph = (t * 0.42 + mk.phase * 0.13) % 1;
    mk.ringSprite.scale.setScalar((1.4 + ph * 6.4) * (1 + mk.selK * 0.35));
    mk.ringMat.opacity = (1 - ph) * 0.55 * vis * (1 + mk.selK * 0.5);
  }

  /* 飞线压暗：插值后仅在量化值变化时重置访问器（离散事件 + 内置过渡） */
  let arcDirty = false;
  for (const a of S.arcs) {
    a.dimK += (a.dimTarget - a.dimK) * 0.1;
    const q = Math.round(a.dimK * 20) / 20;
    if (q !== a._lastA) { a._lastA = q; arcDirty = true; }
  }
  if (arcDirty) markersMod.refreshArcs();

  if (S.selRing && S.selRing.visible) {
    const k = fadeK ? fadeK(S.selRing.position) : 1;
    S.selRing.scale.setScalar(3.2 + 0.8 * Math.sin(t * 2.4));
    S.selRing.material.opacity = 0.85 * k;
  }
};
