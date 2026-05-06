# Simple static file server for PowerShell
# Usage: Open PowerShell in this folder and run: .\serve.ps1
# If execution is blocked, run: powershell -ExecutionPolicy Bypass -File .\serve.ps1

$port = 8000
$prefix = "http://+:$port/"
$root = Get-Location

Add-Type -AssemblyName System.Net.HttpListener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
} catch {
    Write-Error "Failed to start listener. Try running PowerShell as Administrator or choose another port."
    exit 1
}
Write-Host "Serving $root on http://localhost:$port/"
try {
    Start-Process "http://localhost:$port/" -ErrorAction SilentlyContinue
} catch {}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    $path = $req.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }

    # Prevent directory traversal
    $safePath = $path -replace '\\.\\.\\', ''
    $filePath = Join-Path $root $safePath

    if (Test-Path $filePath) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        switch ($ext) {
            '.html' { $res.ContentType = 'text/html' }
            '.css'  { $res.ContentType = 'text/css' }
            '.js'   { $res.ContentType = 'application/javascript' }
            '.json' { $res.ContentType = 'application/json' }
            '.png'  { $res.ContentType = 'image/png' }
            '.jpg'  { $res.ContentType = 'image/jpeg' }
            '.jpeg' { $res.ContentType = 'image/jpeg' }
            '.webp' { $res.ContentType = 'image/webp' }
            '.svg'  { $res.ContentType = 'image/svg+xml' }
            '.ico'  { $res.ContentType = 'image/x-icon' }
            default { $res.ContentType = 'application/octet-stream' }
        }
        try {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $res.StatusCode = 200
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $res.StatusCode = 500
            $err = [System.Text.Encoding]::UTF8.GetBytes("Internal Server Error")
            $res.OutputStream.Write($err,0,$err.Length)
        }
    } else {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - Not Found")
        $res.OutputStream.Write($msg,0,$msg.Length)
    }
    $res.Close()
}

$listener.Stop()
$listener.Close()
