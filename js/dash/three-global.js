/* =====================================================================
 * GeoDash v2 · three-global.js
 * 职责：把 core three 实例挂到 window.THREE。
 * 原因：three-globe 2.45 的每个内置图层在模块求值时都执行
 *   `var THREE$x = window.THREE ? window.THREE : { ...私有导入... }`
 * 若未设置全局，图层会退回 three/webgpu 包里的同名类，与 core 渲染器
 * 形成双 THREE 实例（"Multiple instances of Three.js"），
 * 其 ShaderMaterial/MeshBasicMaterial 在 WebGLRenderer 下静默不渲染。
 * 本模块必须在 globe.js 之前被导入（ESM 依赖按 import 声明顺序求值）。
 * ===================================================================== */
import * as THREE from 'three';

if (!window.THREE) window.THREE = THREE;
