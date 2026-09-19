/* vendor-walk.mjs — 从 three-globe 的 ESM 入口递归收集 bare imports，
   把用到的 npm 包整包（精简）拷入 vendor/npm/，并生成 importmap。 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'vendor', 'npm');

const readPkg = (name) => JSON.parse(fs.readFileSync(path.join(NM, name, 'package.json'), 'utf8'));
function entryOf(pkg) {
  const p = readPkg(pkg);
  let e = p.module;
  if (!e && p.exports) {
    const ex = p.exports;
    const dot = ex['.'] || ex;
    e = typeof dot === 'string' ? dot : (dot.import && (typeof dot.import === 'string' ? dot.import : dot.import.default)) || dot.default;
  }
  if (!e) e = p.main;
  return e ? e.replace(/^\.\//, '') : 'index.js';
}
function scanImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = new Set();
  const re = /(?:from|import|export\s+\*?\s*from)\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2];
    if (!spec || spec.startsWith('.') || spec.startsWith('/')) continue;
    if (/^[a-z][a-z0-9+.-]*:/.test(spec)) continue;   /* 跳过 https:/node:/data: 等协议 */
    out.add(spec);
  }
  return out;
}
const pkgOf = (spec) => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

const visited = new Set();
const queue = ['three-globe'];
const entries = {};
while (queue.length) {
  const pkg = queue.shift();
  if (visited.has(pkg)) continue;
  if (!fs.existsSync(path.join(NM, pkg))) { console.warn('SKIP(missing):', pkg); continue; }
  visited.add(pkg);
  if (pkg === 'three') { entries[pkg] = 'build/three.module.js'; continue; }
  const e = entryOf(pkg);
  entries[pkg] = e;
  /* 整包扫描 bare imports：d3 系包入口仅 re-export 相对模块，
     真正的 bare imports 在包内部 src 文件里（如 d3-scale → d3-format） */
  const scanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) { if (!['node_modules', 'test', 'tests', '__tests__', 'docs', 'scripts'].includes(ent.name)) scanDir(path.join(dir, ent.name)); }
      else if (/\.(m?js)$/.test(ent.name)) {
        for (const spec of scanImports(path.join(dir, ent.name))) {
          const dep = pkgOf(spec);
          if (dep !== pkg && !visited.has(dep)) queue.push(dep);
        }
      }
    }
  };
  scanDir(path.join(NM, pkg));
}
visited.add('three');

/* 拷贝（精简：跳过 node_modules / 文档 / 测试 / map） */
function copyPkg(pkg) {
  const src = path.join(NM, pkg), dst = path.join(OUT, pkg);
  fs.mkdirSync(dst, { recursive: true });
  const skipDir = new Set(['node_modules', 'test', 'tests', '__tests__', 'docs', 'scripts']);
  const walk = (s, d, depth) => {
    for (const ent of fs.readdirSync(s, { withFileTypes: true })) {
      if (ent.name.endsWith('.map') || ent.name === '.package-lock.json') continue;
      if (ent.isDirectory()) {
        if (skipDir.has(ent.name)) continue;
        /* three 包顶层白名单；examples 只取 jsm；jsm 内部子目录全量递归 */
        if (pkg === 'three' && depth === 0 && !['build', 'examples', 'src'].includes(ent.name)) continue;
        const sd = path.join(s, ent.name), dd = path.join(d, ent.name);
        if (pkg === 'three' && ent.name === 'examples') {
          fs.mkdirSync(path.join(dd, 'jsm'), { recursive: true });
          walk(path.join(sd, 'jsm'), path.join(dd, 'jsm'), depth + 2);
          continue;
        }
        fs.mkdirSync(dd, { recursive: true });
        walk(sd, dd, depth + 1);
      } else if (/\.(mjs|js|json)$/.test(ent.name)) {
        fs.copyFileSync(path.join(s, ent.name), path.join(d, ent.name));
      }
    }
  };
  walk(src, dst, 0);
}
for (const pkg of visited) copyPkg(pkg);

/* importmap */
const map = { imports: {} };
for (const pkg of visited) {
  const e = pkg === 'three' ? 'build/three.module.js' : entries[pkg];
  map.imports[pkg] = `./vendor/npm/${pkg}/${e}`;
  map.imports[pkg + '/'] = `./vendor/npm/${pkg}/`;
}
map.imports['three/addons/'] = './vendor/npm/three/examples/jsm/';
/* frame-ticker 仅 UMD：经典 script 挂 window + shim 转发（见 vendor/npm/frame-ticker/esm-shim.js） */
map.imports['frame-ticker'] = './vendor/npm/frame-ticker/esm-shim.js';
/* three 的 exports 别名（three-globe 顶层 import 'three/webgpu' / 'three/tsl'）：
   尾斜杠映射无法表达别名，按 three 自身 exports 表显式补齐 */
try {
  const threeExports = JSON.parse(fs.readFileSync(path.join(NM, 'three', 'package.json'), 'utf8')).exports || {};
  for (const alias of ['./webgpu', './tsl']) {
    let target = threeExports[alias];
    if (typeof target === 'object') target = target.import || target.default;
    if (typeof target === 'string') map.imports['three/' + alias.slice(2)] = `./vendor/npm/three/${target.replace(/^\.\//, '')}`;
  }
} catch (e) { console.warn('three exports alias skip:', e.message); }
fs.mkdirSync(path.join(ROOT, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'vendor', 'importmap.json'), JSON.stringify(map, null, 2));
console.log('packages:', [...visited].sort().join(', '));
console.log('importmap entries:', Object.keys(map.imports).length);
