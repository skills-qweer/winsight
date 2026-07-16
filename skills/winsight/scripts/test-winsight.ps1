[CmdletBinding()]
param(
    [string]$Title = 'FogHarborEchoes',
    [string]$Output = (Join-Path $PSScriptRoot 'winsight-test.png')
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'winsight.ps1'
$diagnose = & $runner -Action diagnose | ConvertFrom-Json
if (-not $diagnose.capabilities.printWindow) {
    throw 'PrintWindow capability was not reported.'
}

$resultText = & $runner -Action capture -Title $Title -Backend auto -Output $Output
$result = $resultText | ConvertFrom-Json
if (-not $result.selected.success) {
    throw "Capture failed: $($result.selected.error)"
}
if ($result.selected.likelyBlackFrame) {
    throw 'Capture completed but was detected as a black frame.'
}
if (-not (Test-Path -LiteralPath $result.selected.outputPath)) {
    throw 'Capture output file was not created.'
}

[pscustomobject]@{
    passed = $true
    backend = $result.selected.backend
    outputPath = $result.selected.outputPath
    width = $result.selected.width
    height = $result.selected.height
    meanRgb = $result.selected.meanRgb
} | ConvertTo-Json -Depth 4
