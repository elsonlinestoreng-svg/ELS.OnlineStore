param(
    [int]$Port = 8000
)

function Is-Administrator {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Is-Administrator)) {
    Write-Error "This script must be run as Administrator. Right-click and select 'Run as Administrator' or run from an elevated PowerShell.";
    exit 1
}

$Url = "http://+:$Port/"
Write-Host "Registering URL ACL: $Url"

try {
    & netsh http add urlacl url=$Url user=Everyone | Out-Null
    Write-Host "URL ACL added for $Url"
} catch {
    Write-Error "Failed to add URL ACL: $_"
}

Write-Host "Adding firewall rule to allow TCP port $Port"
try {
    New-NetFirewallRule -DisplayName "ELS serve $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any -Enabled True -ErrorAction Stop
    Write-Host "Firewall rule added via New-NetFirewallRule"
} catch {
    Write-Host "New-NetFirewallRule failed, attempting netsh advfirewall fallback..."
    try {
        & netsh advfirewall firewall add rule name="ELS serve $Port" dir=in action=allow protocol=TCP localport=$Port | Out-Null
        Write-Host "Firewall rule added via netsh advfirewall"
    } catch {
        Write-Error "Failed to add firewall rule: $_"
        exit 1
    }
}

Write-Host "Done. You can now run .\serve.ps1 (non-admin user may still need to restart the script)."