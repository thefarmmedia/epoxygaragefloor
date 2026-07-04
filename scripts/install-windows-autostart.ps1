# Makes the growth dashboard start automatically whenever you log into Windows,
# running hidden in the background (no console window, no need to remember to
# run "node server.js" yourself).
#
# Run this ONCE:
#   Right-click this file -> "Run with PowerShell"
#   (or from a PowerShell prompt: powershell -ExecutionPolicy Bypass -File scripts\install-windows-autostart.ps1)
#
# To undo: run scripts\uninstall-windows-autostart.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $PSScriptRoot "run-hidden.vbs"
$taskName = "EpoxyGrowthDashboard"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js wasn't found on PATH. Install Node 18+ from nodejs.org, then run this script again."
  exit 1
}

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Installed. The dashboard now starts automatically when you log in," -ForegroundColor Green
Write-Host "and has just been started now — open http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "To stop it right now: Task Scheduler -> find '$taskName' -> End, or just restart your PC."
Write-Host "To remove auto-start entirely: scripts\uninstall-windows-autostart.ps1"
