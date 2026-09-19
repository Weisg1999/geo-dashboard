# -*- coding: utf-8 -*-
"""
GeoDash v2 · 构建单文件版
================================================
把整个模块化项目压成一个可直接双击打开的 HTML（file:// 友好）：

  python tools/build-singlefile.py
  输出：GeoDash-v2-单文件版.html

流程：
  1) esbuild 把 js/dash/main.js 及其全部 ESM 依赖（three/three-globe/d3…）
     打包成单个 IIFE（.build/bundle.js）；
  2) index.html 中的经典脚本（config/data/taiwan/frame-ticker UMD）逐个内联；
  3) 删除 importmap 与 file:// 拦截引导（单文件版正是为 file:// 而生）；
  4) 注入内联数据前导：省级 GeoJSON（vendor/geo）与两张地球贴图（data URL），
     分别经 window.__EMBEDDED__ 与 window.DASH_CONFIG.globeUrls 被运行时消费；
  5) 以普通 <script> 挂载 bundle 作为入口。

注意：市级下钻 GeoJSON 体量大（34 省 × 平均 400KB），不内联；
单文件版下钻时仍需网络（或此前浏览器缓存过同源数据）。
"""
import base64
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / '.build'
OUT = ROOT / 'GeoDash-v2-单文件版.html'

def read(p): return (ROOT / p).read_text(encoding='utf-8')

def main():
    # 1) esbuild 打包
    BUILD.mkdir(exist_ok=True)
    esb = ROOT / 'node_modules' / '.bin' / ('esbuild.cmd' if os_name_win() else 'esbuild')
    if not esb.exists():
        sys.exit('缺少 esbuild：先执行 npm install')
    r = subprocess.run([str(esb), 'js/dash/main.js', '--bundle', '--format=iife',
                        '--minify', '--charset=utf8', '--outfile=.build/bundle.js'],
                       cwd=ROOT, capture_output=True, text=True, shell=False)
    if r.returncode != 0:
        sys.exit('esbuild 失败：\n' + (r.stderr or r.stdout))
    bundle = read('.build/bundle.js')

    html = read('index.html')

    # 2) 内联经典脚本
    for src in ['js/config.js', 'js/projects.data.js', 'js/geo/taiwan.geo.js',
                './vendor/npm/frame-ticker/dist/FrameTicker.js']:
        pat = re.compile(r'<script src="' + re.escape(src) + r'"></script>')
        body = read(src.replace('./', ''))
        html, n = pat.subn('<script>\n' + body + '\n</script>', html, count=1)
        if not n: sys.exit('未找到待内联脚本：' + src)

    # 3) 去 importmap
    html = re.sub(r'<!-- =+ Importmap.*?-->\s*<script type="importmap">.*?</script>\s*',
                  '<!-- importmap 已在单文件版中移除 -->\n', html, count=1, flags=re.S)

    # 3b) 去 file:// 拦截引导（保留其余 watchdog）
    html = re.sub(r"/\* file:// 直开引导.*?\n\}\n", '/* 单文件版：file:// 直开无需本地服务 */\n', html, count=1, flags=re.S)

    # 4) 内联数据前导
    prov_json = read('vendor/geo/100000_full.json')
    globe_b64 = base64.b64encode((ROOT / 'vendor/img/earth-night.jpg').read_bytes()).decode()
    bump_b64 = base64.b64encode((ROOT / 'vendor/img/earth-topology.png').read_bytes()).decode()
    prelude = (
        '<script>\n'
        'window.__EMBEDDED__ = { "./vendor/geo/100000_full.json": ' + prov_json + ' };\n'
        "window.DASH_CONFIG = window.DASH_CONFIG || {};\n"
        'window.DASH_CONFIG.globeUrls = {\n'
        "  globeImage: 'data:image/jpeg;base64," + globe_b64 + "',\n"
        "  bumpImage: 'data:image/png;base64," + bump_b64 + "'\n"
        '};\n'
        '</script>\n'
    )

    # 5) 模块入口 → bundle
    html = html.replace('<script type="module" src="js/dash/main.js"></script>',
                        prelude + '<script>\n' + bundle + '\n</script>')

    OUT.write_text(html, encoding='utf-8')
    print('OK', OUT.name, f'{OUT.stat().st_size/1048576:.1f} MB')

def os_name_win(): 
    import os
    return os.name == 'nt'

if __name__ == '__main__':
    main()
