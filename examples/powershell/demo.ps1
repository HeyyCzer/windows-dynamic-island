# Tour of what the island can do. Run with the island open:
#   powershell -ExecutionPolicy Bypass -File .\examples\powershell\demo.ps1

Import-Module (Join-Path $PSScriptRoot 'DynamicIsland.psm1') -Force

Send-IslandNotification -Title 'New message' -Subtitle 'Ana: shall we try the island tonight?' -Icon chat -Color '#30D158'
Start-Sleep 6

# A live activity with progress, like a download.
foreach ($i in 0..20) {
    Set-IslandActivity -Id demo-download -Title 'Downloading project.zip' -Icon download -Color '#0A84FF' -Progress ($i / 20) | Out-Null
    Start-Sleep -Milliseconds 250
}
Set-IslandActivity -Id demo-download -Title 'Download complete' -Subtitle 'project.zip (24 MB)' -Icon check -Color '#30D158' -Duration 4 | Out-Null
Start-Sleep 5

# A countdown timer.
$end = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $end) {
    $left = [math]::Ceiling(($end - (Get-Date)).TotalSeconds)
    Set-IslandActivity -Id demo-timer -Title "Timer: 00:$('{0:D2}' -f [int]$left)" -Icon timer -Color '#FF9F0A' -Progress (1 - $left / 10) | Out-Null
    Start-Sleep -Milliseconds 500
}
Remove-IslandActivity -Id demo-timer | Out-Null
Send-IslandNotification -Title 'Time is up!' -Icon timer -Color '#FF9F0A' -Duration 4 | Out-Null
