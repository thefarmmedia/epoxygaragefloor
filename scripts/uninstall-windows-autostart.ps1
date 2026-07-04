# Removes the auto-start scheduled task created by install-windows-autostart.ps1.
# Doesn't stop a currently-running dashboard — close its process (or restart your
# PC) if one is already running.

$taskName = "EpoxyGrowthDashboard"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed the '$taskName' scheduled task. The dashboard will no longer start automatically at login."
