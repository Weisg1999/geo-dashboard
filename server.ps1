# =====================================================================
# GeoDash v2 零依赖静态服务器（Windows 自带 PowerShell 即可运行）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File server.ps1 [端口]
# 说明：大屏机器无需安装 Python / Node，启动大屏.bat 会自动调用本脚本。
# =====================================================================
param([int]$Port = 8126)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
    Write-Host "启动失败：端口 $Port 可能被占用，或需以管理员身份运行。" -ForegroundColor Red
    Read-Host '按回车退出'
    exit 1
}
Write-Host '==============================================' -ForegroundColor Cyan
Write-Host ' GeoDash v2 静态服务已启动'
Write-Host " http://localhost:$Port/index.html"
Write-Host ' 关闭本窗口即停止服务'
Write-Host '==============================================' -ForegroundColor Cyan

$mime = @{
    '.html'    = 'text/html; charset=utf-8'
    '.htm'     = 'text/html; charset=utf-8'
    '.js'      = 'text/javascript; charset=utf-8'
    '.mjs'     = 'text/javascript; charset=utf-8'
    '.css'     = 'text/css; charset=utf-8'
    '.json'    = 'application/json; charset=utf-8'
    '.geojson' = 'application/json; charset=utf-8'
    '.png'     = 'image/png'
    '.jpg'     = 'image/jpeg'
    '.jpeg'    = 'image/jpeg'
    '.svg'     = 'image/svg+xml'
    '.ico'     = 'image/x-icon'
    '.csv'     = 'text/csv; charset=utf-8'
    '.woff2'   = 'font/woff2'
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $path = $ctx.Request.Url.AbsolutePath
        if ($path -eq '/') { $path = '/index.html' }
        $file = Join-Path $root ($path -replace '/', '\')
        # 防目录穿越：解析后必须仍位于站点根目录内
        $full = [System.IO.Path]::GetFullPath($file)
        if ((Test-Path $full -PathType Leaf) -and $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $ctx.Response.ContentType = $type
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
        }
    } catch {
        try { $ctx.Response.StatusCode = 500 } catch {}
    } finally {
        try { $ctx.Response.OutputStream.Close() } catch {}
    }
}
