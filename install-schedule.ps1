$ErrorActionPreference = 'Stop'
$dashboardTaskName = 'UtilityMacroLocal-Daily'
$dashboardScript = Join-Path $PSScriptRoot 'start-dashboard.ps1'
$dashboardAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -File "' + $dashboardScript + '" -Refresh') -WorkingDirectory $PSScriptRoot
$dashboardTriggers = @((New-ScheduledTaskTrigger -Daily -At '08:05'), (New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)))
$dashboardPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$dashboardSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $dashboardTaskName -Action $dashboardAction -Trigger $dashboardTriggers -Principal $dashboardPrincipal -Settings $dashboardSettings -Description 'Local utility dashboard and public-source refresh; no account passwords.' -Force | Select-Object TaskName,State
