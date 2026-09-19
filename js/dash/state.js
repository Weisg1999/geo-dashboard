/* =====================================================================
 * GeoDash v2 · state.js
 * 职责：集中管理全局可变状态（单一数据源）与跨层派生计算——
 *       省份三态目标值、当前作用域项目集合。
 * 与 v1 差异：省份不再是 mesh 列表，而是 polygons 图层的条目对象
 *       （S.provinces），三态字段直接挂在条目上。
 * 对外：GeoDash.state = { S, setProvinceTargets, scopeProjects }
 * ===================================================================== */

import * as THREE from 'three';

const GD = window.GeoDash;

const S = ((GD.state = {}).S = {
  /* 图层数据/对象引用 */
  provinces: [],               // [{key,name,code,count,amount,projects,dir,theta,chip,hoverT/selT/dimT,*Target}]
  provByKey: new Map(),        // normKey -> 同上条目
  cityCache: new Map(),        // adcode -> { features }
  activeCity: { features: [], labels: [], provKey: null },
  chips: [],                   // 省份角标（CSS2D）
  worldLabels: [],             // 大洲大洋标注（CSS2D）
  markers: [],                 // 项目标记（光晕/亮芯精灵）
  arcs: [],                    // 飞线条目
  selRing: null,
  scsLabel: null,
  tenDash: null,               // 十段线 LineSegments

  /* 交互状态 */
  selected: { provinceKey: null, city: null, project: null },
  hover: null, hoverKey: null,
  pointer: new THREE.Vector2(),
  raycaster: new THREE.Raycaster(),
  dragging: false,
  pickDirty: false,
  lastInteract: performance.now(),
  userRot: null,               // null=自动 / true=强制开 / false=强制关
  sens: 1,
});

/* 灵敏度初值：本地记忆 > 配置 > 默认 1 */
try {
  S.sens = Math.min(2, Math.max(0.2, parseFloat(localStorage.getItem('geodash:sens')) || GD.CFG.sensitivity || 1));
} catch (e) { S.sens = GD.CFG.sensitivity || 1; }

/**
 * 选中省份时的三态目标：sel=本省高亮 / dim=其他压暗；
 * 标记与飞线按作用域收敛可见度。
 */
GD.state.setProvinceTargets = function () {
  const sel = S.selected.provinceKey;
  for (const m of S.provinces) {
    if (!sel) { m.selTarget = 0; m.dimTarget = 0; }
    else if (m.key === sel) { m.selTarget = 1; m.dimTarget = 0; }
    else { m.selTarget = 0; m.dimTarget = 1; }
  }
  for (const mk of S.markers) {
    const k = GD.util.normRegion(mk.p.province);
    mk.dimTarget = sel && k !== sel ? 1 : 0;
  }
  if (S.selected.project) {
    for (const mk of S.markers) mk.selTarget = mk.p === S.selected.project ? 1 : 0;
  }
  for (const a of S.arcs) {
    const inScope = !sel || GD.util.normRegion(a.p.province) === sel;
    a.dimTarget = inScope ? 0 : 1;
  }
};

/**
 * 当前作用域的项目集合（面板联动数据源），规则与 v1 一致。
 */
GD.state.scopeProjects = function () {
  const sel = S.selected;
  if (sel.project) {
    const pk = GD.util.normRegion(sel.project.province);
    return (GD.data.provAgg.get(pk)?.projects || []).slice();
  }
  let list = [];
  if (sel.provinceKey) list = (GD.data.provAgg.get(sel.provinceKey)?.projects || []).slice();
  else { for (const a of GD.data.provAgg.values()) list.push(...a.projects); }
  if (sel.city) list = list.filter(p => GD.util.normRegion(p.city) === sel.city);
  return list;
};
