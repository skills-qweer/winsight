[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][long]$Hwnd,
    [Parameter(Mandatory=$true)][int]$ScreenX,
    [Parameter(Mandatory=$true)][int]$ScreenY
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$inputScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'skills/winsight/scripts/input.ps1'
$inspection = & $inputScript -Action inspect-invoke -Hwnd $Hwnd -ScreenX $ScreenX -ScreenY $ScreenY | ConvertFrom-Json
$inspection.control.name = 'deliberately-stale-control-name'
$expected = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($inspection.control | ConvertTo-Json -Compress)))
$rejected = $false
try {
    & $inputScript -Action invoke -Hwnd $Hwnd -ScreenX $ScreenX -ScreenY $ScreenY -ExpectedControl $expected | Out-Null
} catch {
    $rejected = $_.Exception.Message -match 'identity, name, or bounds changed'
}
if (-not $rejected) { throw 'Stale control identity was not rejected before invocation.' }
'Stale UI Automation control identity rejected before invocation.'
