/* =====================================================================
 *  项目数据表 —— ★ 在这里维护你的真实项目 ★
 * =====================================================================
 *
 *  字段说明
 *  ─────────────────────────────────────────────────────────────
 *  id       可选。项目唯一编号，不填自动生成
 *  name     必填。项目名称
 *  type     必填。项目类型，用于环形图统计（建议使用 config.js 中已配色的类型）
 *  status   必填。operating=在营 / building=在建 / planning=规划
 *  province 必填。所属省级行政区，写简称即可（如 浙江 / 内蒙古 / 新疆），
 *           程序会自动与地图上的行政区匹配并聚合数量
 *  city     必填。所属城市（简称或全称均可，如 杭州 / 杭州市）
 *  address  选填。项目详细地址（显示在项目卡片中）
 *  lon/lat  必填。经度 / 纬度（WGS-84 或 GCJ-02 均可，误差在本图尺度下可忽略）
 *  amount   选填。投资额（单位：亿元），影响光柱高度与统计
 *  date     选填。投产 / 预计投产时间（YYYY-MM）
 *  ─────────────────────────────────────────────────────────────
 *
 *  以下 40 条为【示例数据】，接入真实数据时直接整体替换即可。
 * ===================================================================== */

window.PROJECTS = [
  { id: 'P001', name: '亦庄数据中心',           type: '数据中心',   status: 'operating', province: '北京',   city: '北京',       address: '北京市大兴区亦庄经济开发区宏达北路12号',   lon: 116.506, lat: 39.795, amount: 18.6, date: '2023-05' },
  { id: 'P002', name: '中关村研发中心',         type: '研发中心',   status: 'operating', province: '北京',   city: '北京',       address: '北京市海淀区中关村科学城创新大厦C座',     lon: 116.310, lat: 39.984, amount: 6.2,  date: '2022-11' },
  { id: 'P003', name: '临港数据中心',           type: '数据中心',   status: 'building',  province: '上海',   city: '上海',       address: '上海市浦东新区临港新片区南汇新城镇',       lon: 121.905, lat: 30.885, amount: 22.4, date: '2025-03' },
  { id: 'P004', name: '虹桥智慧物流园',         type: '物流园',     status: 'operating', province: '上海',   city: '上海',       address: '上海市闵行区申长路988号',                 lon: 121.336, lat: 31.194, amount: 8.5,  date: '2021-09' },
  { id: 'P005', name: '前海智能制造基地',       type: '智能制造',   status: 'operating', province: '广东',   city: '深圳',       address: '深圳市宝安区新安街道兴东大道67号',         lon: 113.845, lat: 22.554, amount: 15.3, date: '2023-10' },
  { id: 'P006', name: '南山研发中心',           type: '研发中心',   status: 'operating', province: '广东',   city: '深圳',       address: '深圳市南山区科技园南区T3栋',              lon: 113.945, lat: 22.528, amount: 5.8,  date: '2022-06' },
  { id: 'P007', name: '黄埔综合产业园',         type: '综合产业园', status: 'building',  province: '广东',   city: '广州',       address: '广州市黄埔区开泰大道36号',                lon: 113.456, lat: 23.178, amount: 12.0, date: '2024-12' },
  { id: 'P008', name: '横琴运维基地',           type: '运维基地',   status: 'planning',  province: '广东',   city: '珠海',       address: '珠海市香洲区横琴新区宝中路',              lon: 113.523, lat: 22.135, amount: 3.2,  date: '2026-06' },
  { id: 'P009', name: '未来科技城数据中心',     type: '数据中心',   status: 'operating', province: '浙江',   city: '杭州',       address: '杭州市余杭区文一西路998号',               lon: 120.022, lat: 30.282, amount: 16.8, date: '2023-01' },
  { id: 'P010', name: '梅山物流园',             type: '物流园',     status: 'operating', province: '浙江',   city: '宁波',       address: '宁波市北仑区梅山岛国际物流园区',           lon: 121.916, lat: 29.749, amount: 9.6,  date: '2022-04' },
  { id: 'P011', name: '乐清智能制造工厂',       type: '智能制造',   status: 'building',  province: '浙江',   city: '温州',       address: '温州市乐清市经济开发区纬五路',             lon: 120.983, lat: 27.994, amount: 7.4,  date: '2025-08' },
  { id: 'P012', name: '江北新区研发中心',       type: '研发中心',   status: 'operating', province: '江苏',   city: '南京',       address: '南京市浦口区团结路100号',                 lon: 118.739, lat: 32.116, amount: 6.8,  date: '2023-06' },
  { id: 'P013', name: '工业园区智能制造基地',   type: '智能制造',   status: 'operating', province: '江苏',   city: '苏州',       address: '苏州市工业园区金鸡湖大道99号',             lon: 120.712, lat: 31.295, amount: 13.5, date: '2021-12' },
  { id: 'P014', name: '锡山新能源基地',         type: '新能源',     status: 'building',  province: '江苏',   city: '无锡',       address: '无锡市锡山区安镇街道先锋路',              lon: 120.612, lat: 31.583, amount: 11.2, date: '2025-05' },
  { id: 'P015', name: '齐鲁数据中心',           type: '数据中心',   status: 'operating', province: '山东',   city: '济南',       address: '济南市历下区舜华路750号',                 lon: 117.128, lat: 36.656, amount: 10.4, date: '2022-08' },
  { id: 'P016', name: '西海岸综合产业园',       type: '综合产业园', status: 'building',  province: '山东',   city: '青岛',       address: '青岛市黄岛区滨海大道1399号',              lon: 120.197, lat: 35.905, amount: 9.8,  date: '2024-09' },
  { id: 'P017', name: '天府数据中心',           type: '数据中心',   status: 'operating', province: '四川',   city: '成都',       address: '成都市双流区天府新区湖畔路南段',           lon: 104.072, lat: 30.460, amount: 19.5, date: '2023-03' },
  { id: 'P018', name: '科技城智能制造工厂',     type: '智能制造',   status: 'operating', province: '四川',   city: '绵阳',       address: '绵阳市涪城区绵安路35号',                  lon: 104.683, lat: 31.468, amount: 6.9,  date: '2022-10' },
  { id: 'P019', name: '光谷研发中心',           type: '研发中心',   status: 'operating', province: '湖北',   city: '武汉',       address: '武汉市江夏区光谷大道77号',                lon: 114.395, lat: 30.476, amount: 7.7,  date: '2023-08' },
  { id: 'P020', name: '清江能源基地',           type: '新能源',     status: 'building',  province: '湖北',   city: '宜昌',       address: '宜昌市夷陵区小溪塔街道',                  lon: 111.326, lat: 30.770, amount: 14.6, date: '2025-02' },
  { id: 'P021', name: '麓谷智能制造基地',       type: '智能制造',   status: 'operating', province: '湖南',   city: '长沙',       address: '长沙市岳麓区麓谷高新区麓天路',             lon: 112.882, lat: 28.230, amount: 8.1,  date: '2022-12' },
  { id: 'P022', name: '航空港物流园',           type: '物流园',     status: 'building',  province: '河南',   city: '郑州',       address: '郑州市新郑市航空港区兖州路',              lon: 113.810, lat: 34.522, amount: 7.9,  date: '2025-06' },
  { id: 'P023', name: '高新数据中心',           type: '数据中心',   status: 'operating', province: '陕西',   city: '西安',       address: '西安市雁塔区锦业路1号',                   lon: 108.858, lat: 34.192, amount: 12.3, date: '2023-11' },
  { id: 'P024', name: '丝路数据中心',           type: '数据中心',   status: 'building',  province: '新疆',   city: '乌鲁木齐',   address: '乌鲁木齐市高新区长春北路',                lon: 87.568,  lat: 43.889, amount: 17.2, date: '2025-04' },
  { id: 'P025', name: '南疆运维基地',           type: '运维基地',   status: 'planning',  province: '新疆',   city: '喀什',       address: '喀什市多来特巴格乡深喀大道',              lon: 75.992,  lat: 39.470, amount: 2.8,  date: '2026-09' },
  { id: 'P026', name: '呈贡综合产业园',         type: '综合产业园', status: 'operating', province: '云南',   city: '昆明',       address: '昆明市呈贡区云南白药街3688号',            lon: 102.843, lat: 24.889, amount: 6.4,  date: '2023-04' },
  { id: 'P027', name: '贵安数据中心',           type: '数据中心',   status: 'operating', province: '贵州',   city: '贵阳',       address: '贵阳市花溪区贵安新区黔中大道',            lon: 106.608, lat: 26.438, amount: 15.7, date: '2022-07' },
  { id: 'P028', name: '五象新区物流园',         type: '物流园',     status: 'building',  province: '广西',   city: '南宁',       address: '南宁市良庆区平乐大道38号',                lon: 108.378, lat: 22.760, amount: 5.5,  date: '2025-01' },
  { id: 'P029', name: '铁西智能制造工厂',       type: '智能制造',   status: 'operating', province: '辽宁',   city: '沈阳',       address: '沈阳市铁西区开发大路22号',                lon: 123.310, lat: 41.758, amount: 7.2,  date: '2023-02' },
  { id: 'P030', name: '金普新区数据中心',       type: '数据中心',   status: 'planning',  province: '辽宁',   city: '大连',       address: '大连市金州区金石滩',                      lon: 121.868, lat: 39.088, amount: 11.8, date: '2026-12' },
  { id: 'P031', name: '高新区研发中心',         type: '研发中心',   status: 'operating', province: '安徽',   city: '合肥',       address: '合肥市蜀山区望江西路5111号',              lon: 117.182, lat: 31.842, amount: 5.9,  date: '2023-09' },
  { id: 'P032', name: '滨海新城数据中心',       type: '数据中心',   status: 'building',  province: '福建',   city: '福州',       address: '福州市长乐区文松路',                      lon: 119.641, lat: 25.963, amount: 13.9, date: '2025-07' },
  { id: 'P033', name: '软件园研发中心',         type: '研发中心',   status: 'operating', province: '福建',   city: '厦门',       address: '厦门市思明区望海路',                      lon: 118.156, lat: 24.482, amount: 4.8,  date: '2022-05' },
  { id: 'P034', name: '正定智慧物流园',         type: '物流园',     status: 'operating', province: '河北',   city: '石家庄',     address: '石家庄市正定新区崇因路',                  lon: 114.572, lat: 38.144, amount: 4.6,  date: '2022-09' },
  { id: 'P035', name: '综改区新能源基地',       type: '新能源',     status: 'building',  province: '山西',   city: '太原',       address: '太原市小店区龙盛街',                      lon: 112.595, lat: 37.795, amount: 9.3,  date: '2024-11' },
  { id: 'P036', name: '和林格尔数据中心',       type: '数据中心',   status: 'operating', province: '内蒙古', city: '呼和浩特',   address: '呼和浩特市和林格尔县盛乐园区',            lon: 111.832, lat: 40.398, amount: 14.1, date: '2023-07' },
  { id: 'P037', name: '新区综合产业园',         type: '综合产业园', status: 'building',  province: '甘肃',   city: '兰州',       address: '兰州市永登县兰州新区纬一路',              lon: 103.686, lat: 36.475, amount: 6.6,  date: '2025-03' },
  { id: 'P038', name: '两江智能制造基地',       type: '智能制造',   status: 'operating', province: '重庆',   city: '重庆',       address: '重庆市渝北区两江大道',                    lon: 106.586, lat: 29.723, amount: 12.7, date: '2023-12' },
  { id: 'P039', name: '江东新区综合产业园',     type: '综合产业园', status: 'planning',  province: '海南',   city: '海口',       address: '海口市美兰区江东新区兴洋大道',            lon: 110.427, lat: 20.012, amount: 5.1,  date: '2026-08' },
  { id: 'P040', name: '滨海新区智能制造工厂',   type: '智能制造',   status: 'operating', province: '天津',   city: '天津',       address: '天津市滨海新区第五大街',                  lon: 117.681, lat: 39.035, amount: 8.8,  date: '2022-03' },
];
