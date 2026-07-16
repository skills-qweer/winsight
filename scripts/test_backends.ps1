[CmdletBinding()]
param(
    [string]$Title = 'FogHarborEchoes'
)

$ErrorActionPreference = 'Stop'
$captureScript = Join-Path $PSScriptRoot '..\skills\winsight\scripts\winsight.ps1'
$parsedWindows = powershell -NoProfile -ExecutionPolicy Bypass -File $captureScript -Action list | ConvertFrom-Json
$windows = @()
foreach ($window in $parsedWindows) { $windows += $window }
$matches = @($windows | Where-Object { $_.title -like "*$Title*" })
if ($matches.Count -ne 1) { throw "Expected one window matching '$Title'; found $($matches.Count)." }
$target = $matches[0]
$results = [ordered]@{}

foreach ($backend in @('wgc', 'dxgi', 'auto')) {
    $output = Join-Path ([System.IO.Path]::GetTempPath()) ("winsight-$backend-{0:yyyyMMdd-HHmmss-fff}.png" -f (Get-Date))
    $capture = powershell -NoProfile -ExecutionPolicy Bypass -File $captureScript -Action capture -Hwnd $target.hwnd -Backend $backend -Output $output |
        ConvertFrom-Json
    if (-not $capture.selected.Success) { throw "$backend failed: $($capture.selected.Error)" }
    if ($capture.selected.LikelyBlackFrame) { throw "$backend returned a likely black frame." }
    if ($capture.selected.Width -ne $target.bounds.width -or $capture.selected.Height -ne $target.bounds.height) {
        throw "$backend dimensions $($capture.selected.Width)x$($capture.selected.Height) do not match target $($target.bounds.width)x$($target.bounds.height)."
    }
    if (-not (Test-Path -LiteralPath $output)) { throw "$backend did not create its output PNG." }
    $results[$backend] = [ordered]@{
        selected = $capture.selected.Backend
        width = $capture.selected.Width
        height = $capture.selected.Height
        meanRgb = $capture.selected.MeanRgb
        attemptCount = @($capture.attempts).Count
        output = $output
    }
}

if ($results.wgc.selected -ne 'wgc') { throw 'Explicit WGC did not select WGC.' }
if ($results.dxgi.selected -ne 'dxgi') { throw 'Explicit DXGI did not select DXGI.' }
if ($results.auto.selected -ne 'wgc') { throw 'Auto did not prefer the first valid WGC frame.' }

[pscustomobject]@{
    passed = $true
    hwnd = $target.hwnd
    title = $target.title
    bounds = $target.bounds
    dpi = $target.dpi
    monitor = $target.monitor
    results = $results
} | ConvertTo-Json -Depth 8
