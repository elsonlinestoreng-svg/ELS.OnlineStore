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
    Write-Error "Failed to start listener. This is often caused by missing URL ACL permissions or firewall blocking the port."
    $errMsg = $_.Exception.Message
    Write-Host "Error details: $errMsg"
    Write-Host "You can try one of the following options:"
    Write-Host "  1) Run this script as Administrator"
    Write-Host "  2) Run the helper to register a URL ACL and open the firewall: .\register-urlacl.ps1 -Port $port (requires elevation)"
    Write-Host "  3) Choose a different port that you have permissions for"
    # Offer to run the helper elevated if available
    $helper = Join-Path $PSScriptRoot 'register-urlacl.ps1'
    if (Test-Path $helper) {
        Write-Host "Helper script found: $helper"
        $run = Read-Host "Attempt to run helper now with elevation? (Y/N)"
        if ($run -match '^[Yy]') {
            try {
                Start-Process -FilePath pwsh -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$helper`"","-Port","$port"" -Verb RunAs -WindowStyle Normal
                Write-Host 'Launched helper to register URL ACL and firewall rule. After it finishes, re-run this script.'
            } catch {
                Write-Error 'Failed to launch helper with elevation. Please run it manually as Administrator.'
            }
        }
    }
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
