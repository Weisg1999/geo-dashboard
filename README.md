# GeoDash v2 · 项目分布 3D 数字大屏

融合两个项目的长处重做的新版：**[vasturiano/three-globe](https://github.com/vasturiano/three-globe) 的地球视觉**（夜景贴图、大气辉光、球面板块过渡动画、星空）+ **v1（geo-dashboard）完整的大屏功能**（省→市→项目三级下钻、悬停/选中/压暗三态、搜索、飞入相机动画、面板联动、十段线与南海诸岛合规要素、自适应画质）。

零构建、零运行时依赖：three 与 three-globe 等 31 个包已全部本地化到 `vendor/`，内网离线可用。

## 快速开始

| 方式 | 操作 | 说明 |
|---|---|---|
| 双击 `启动大屏.bat` | 自动起本地服务并打开浏览器 | 依次尝试 Python → py → npx → PowerShell 内置服务器（`server.ps1`，零依赖兜底） |
| 手动服务 | `python -m http.server 8126` 后访问 `http://localhost:8126/index.html` | ES Module 受 CORS 限制，**不能**直接双击 `index.html` |
| 单文件版 | 双击 `GeoDash-v2-单文件版.html` | 由 `构建单文件版.bat` 生成，file:// 直开，数据/贴图/代码全部内联 |

## 日常改数据

只改两个文件，刷新即生效：

- `js/config.js` — 公司名、标题、总部坐标、状态/类型配色、数据源 URL、`showArcs`（飞线开关，默认关）
- `js/projects.data.js` — 项目数组（`id/name/province/city/lon/lat/type/status/amount/date/address`）

省级底图 GeoJSON 已缓存在 `vendor/geo/100000_full.json`（DataV areas_v3）；市级下钻按需从 DataV 拉取并写入 localStorage。

## 架构（js/dash/）

```
main.js         入口：启动编排 + 渲染主循环 + FPS 自适应降级
 ├ core.js      全局常量（GLOBE_R=100）、配置合并、工具（色阶/绕向矫正/经纬度互转）
 ├ three-global.js  把 core THREE 挂到 window.THREE（必须先于 globe.js，见下文坑 4）
 ├ globe.js     渲染器/相机/OrbitControls/CSS2D 层/ThreeGlobe 实例/星空
 ├ state.js     全局可变状态单一数据源 + 三态目标值 + 作用域集合
 ├ admin.js     数据加载与缓存、省级/市级板块图层、十段线、角标、大洲标注、数学拾取
 ├ markers.js   项目光柱/光晕（billboard shader）、飞线、选中光环
 ├ panels.js    左右面板/排行/环图/列表/面包屑/tooltip（与 v1 完全一致）
 └ interaction.js  悬停/点选/搜索/飞行/自转/灵敏度/纯净模式
```

## 踩坑记录（v2 开发实测，改动前必读）

1. **访问器必须返回 CSS 颜色字符串**。three-globe 内部用 d3-color 解析 `polygonCapColor` 等返回值（`color(str).opacity`），返回 `THREE.Color` 对象会抛 `Cannot read properties of null`。
2. **不要用 `polygonCapMaterial` 传自定义材质**。源码里 `!capMaterial && capColor` 守卫：一旦提供自定义材质，图层跳过逐板块颜色写入，整片板块变成黑块。three-globe 2.45 的默认材质本来就是每板块独立的无光照 `MeshBasicMaterial`，正好满足 v1「无光照防块状闪电」的结论。
3. **`polygonAltitude` 是半径比例，不是绝对单位**。v1 的 1.2（R=100 下 1.2%）直接搬过来会让板块浮到 2.2 倍半径处、把相机包在里面。
4. **双 THREE 实例静默不渲染**。three-globe 各图层求值时执行 `window.THREE ? window.THREE : {私有导入}`；不设置 `window.THREE` 时部分类来自 `three/webgpu` 包，在 core 的 `WebGLRenderer` 下不报错但画不出来。`three-global.js` 必须在 `globe.js` 之前导入。
5. **经纬度↔向量约定必须跟 three-globe 一致**（`polar2Cartesian`：`phi=90-lat, theta=90-lng`）。v1 的自定义约定与它相差绕 Y 轴 90°，混用会让标记/角标/相机与板块错位（表现为「板块全部看不见」）。统一走 `util.lonLatToVec3` / `util.vec3ToLonLat`。
6. **GeoJSON 绕向**：three-globe 沿用 D3 球面约定（外环 CW），DataV 标准 GeoJSON 是外环 CCW，直接喂会被三角化成「补集」盖满整球；`util.normalizeFeature` 按有向面积矫正。
7. **地球球体默认是受光的 MeshPhongMaterial**：无灯场景渲染成纯黑。`globe.js` 把贴图转成 `emissiveMap` 输出原色，维持全场景无灯。
8. **无 bloom**：v1 的「块状闪电」根因是实时光照亮度越过 bloom 高通阈值（见 v1 仓库 POSTMORTEM.md），v2 从设计上不引入后处理链，悬停提亮用 HSL 亮度乘子并封顶 0.62，不再向白色 lerp（会把深蓝洗成灰）。
9. **内置 polygonStroke 画在底部半径处**，会被抬升的板块盖住——下钻时看不到地市边界。v2.1 起为每个 Feature 单独构建「板顶辉光边界线」（LineSegments 建在单位球面，每帧按板块当前高度缩放贴合板顶、加色混合），省级/地市级通用；顶面同时改为 rgba 微透明，让夜景灯火从板块后透出提升质感。
10. **项目标记为光点（光晕+亮芯+脉冲环）**：v2.1 起移除 v1 的光柱公告牌着色器，markerPick 仅对 glow/dot 两个精灵做射线检测。

## 单文件构建

`tools/build-singlefile.py`：esbuild 把 `main.js` 及全部 ESM 依赖打成 IIFE → 内联经典脚本（config/data/taiwan/frame-ticker）→ 注入 `window.__EMBEDDED__`（省级 GeoJSON）与 data URL 贴图 → 移除 importmap 与 file:// 拦截。产物约 4MB。市级数据体量大不内联，单文件版下钻需联网。

## 与 v1 的差异

| | v1 geo-dashboard | v2（本项目） |
|---|---|---|
| 地球渲染 | 手写 Three.js 球 + 烘焙顶点光 | three-globe 图层（内置无光照材质 + 过渡动画） |
| 视觉 | 纯色海洋 + 哑光板块 | 夜景贴图地球 + 大气辉光 + 星空 |
| 后处理 | UnrealBloom（曾致块状闪电） | 无 |
| 依赖加载 | 手写 vendor + importmap | npm 镜像 + vendor-walk 自动本地化（`vendor-walk.mjs`） |
| 功能 | 完整 | 完整移植（含十段线/钓鱼岛标注/纯净模式/灵敏度记忆） |
