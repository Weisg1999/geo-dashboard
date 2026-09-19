/* =====================================================================
 *  大屏全局配置 —— 品牌信息 / 总部位置 / 状态与类型配色 / 数据源
 *  （日常使用只需改这个文件和 js/projects.data.js）
 * ===================================================================== */
window.DASH_CONFIG = {

  /* ---------- 品牌与标题 ---------- */
  company:  '那可是个大项目',                        // 公司 / 集团名称（显示在左上角）
  title:    '项目分布数字大屏',                 // 主标题
  subtitle: 'PROJECT GEO · DIGITAL DASHBOARD', // 副标题（英文装饰）

  /* ---------- 集团总部（飞线起点） ---------- */
  hq: { name: '北京总部', lon: 116.4074, lat: 39.9042 },

  /* ---------- 行为开关 ---------- */
  showArcs:    false,  // 是否显示 总部→项目 飞线（默认关闭：默认视觉以实体光柱为主，不显示流向北京的光带）
  idleSeconds: 10,     // 无操作多少秒后恢复自动旋转
  sensitivity: 1,      // 拖拽旋转灵敏度 0.2~2.0（底栏滑条可实时调整，本地记忆）
  markerColor: '#ffc964', // 光柱/光点统一色（与青蓝地图形成"蓝底金柱"对比）

  /* ---------- 项目状态定义（key 不要改，label/color 可改） ---------- */
  statusMeta: {
    operating: { label: '在营', color: '#2dd4bf' },
    building:  { label: '在建', color: '#fbbf24' },
    planning:  { label: '规划', color: '#a78bfa' },
  },

  /* ---------- 项目类型配色（环形图 / 列表标签） ---------- */
  typeColors: {
    '数据中心':   '#22d3ee',
    '智能制造':   '#60a5fa',
    '研发中心':   '#a78bfa',
    '新能源':     '#34d399',
    '物流园':     '#f59e0b',
    '综合产业园': '#f472b6',
    '运维基地':   '#94a3b8',
  },

  /* ---------- 地图数据源（默认阿里 DataV；内网部署时替换为本地文件路径） ---------- */
  geoUrls: {
    province: 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
    cityBase: 'https://geo.datav.aliyun.com/areas_v3/bound/',   // + adcode + '_full.json'
  },
};
