$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$nodePath = 'C:\laragon\bin\nodejs\node-v22\node.exe'
if (!(Test-Path -LiteralPath "$projectPath\private\gmail-token.json")) {
    throw 'Connect Gmail and WhatsApp successfully using the interactive launchers first.'
}
$taskName = 'Embassy WhatsApp Agent'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    throw 'A task with this name already exists. Inspect it before replacing it.'
}
$userName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $nodePath -Argument ('"' + $projectPath + '\agent.js"') -WorkingDirectory $projectPath
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Write-Host 'Registered automatic startup at Windows sign-in. Close the interactive agent before starting this task.'
