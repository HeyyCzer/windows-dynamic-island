# Dynamic Island — PowerShell helpers
#   Import-Module .\examples\powershell\DynamicIsland.psm1
#   Send-IslandNotification -Title "Build ok" -Icon check -Color "#30D158"

$port = if ($env:DYNAMIC_ISLAND_PORT) { $env:DYNAMIC_ISLAND_PORT } else { $env:WINDOWS_ISLAND_PORT }
$script:IslandUrl = if ($port) { "http://127.0.0.1:$port" } else { "http://127.0.0.1:5199" }

function Invoke-Island([string]$Method, [string]$Path, [hashtable]$Body) {
    $params = @{ Method = $Method; Uri = "$script:IslandUrl$Path" }
    if ($Body) {
        # Send UTF-8 bytes explicitly: Windows PowerShell 5.1 would otherwise mangle accents.
        $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
        $params.ContentType = 'application/json; charset=utf-8'
    }
    Invoke-RestMethod @params
}

function Send-IslandNotification {
    param(
        [Parameter(Mandatory)][string]$Title,
        [string]$Subtitle,
        [string]$Icon = 'bell',
        [string]$Color = '#FFFFFF',
        [double]$Duration = 5,
        [string]$Action
    )
    $body = @{ title = $Title; icon = $Icon; color = $Color; duration = $Duration }
    if ($Subtitle) { $body.subtitle = $Subtitle }
    if ($Action) { $body.action = $Action }
    Invoke-Island POST /notify $body
}

function Set-IslandActivity {
    param(
        [Parameter(Mandatory)][string]$Id,
        [string]$Title,
        [string]$Subtitle,
        [string]$Icon = 'info',
        [string]$Color = '#FFFFFF',
        [Nullable[double]]$Progress,
        [Nullable[double]]$Duration,
        [int]$Priority = 50
    )
    $body = @{ id = $Id; icon = $Icon; color = $Color; priority = $Priority }
    if ($Title) { $body.title = $Title }
    if ($Subtitle) { $body.subtitle = $Subtitle }
    if ($null -ne $Progress) { $body.progress = $Progress }
    if ($null -ne $Duration) { $body.duration = $Duration }
    Invoke-Island POST /activity $body
}

function Remove-IslandActivity([Parameter(Mandatory)][string]$Id) {
    Invoke-Island DELETE "/activity/$([uri]::EscapeDataString($Id))"
}

function Get-IslandStatus { Invoke-Island GET /status }

Export-ModuleMember -Function Send-IslandNotification, Set-IslandActivity, Remove-IslandActivity, Get-IslandStatus
