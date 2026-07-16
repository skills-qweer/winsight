[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom
$inputPath = [System.IO.Path]::GetFullPath($ImagePath)
try {
    $helperOutput = @(& (Join-Path $PSScriptRoot 'build-ocr.ps1') 2>&1 | ForEach-Object { $_.ToString() })
    $helper = $helperOutput | Select-Object -Last 1
    if (-not $helper -or -not (Test-Path -LiteralPath $helper)) { throw ($helperOutput -join "`n") }
    $result = @(& $helper $inputPath 2>&1 | ForEach-Object { $_.ToString() })
    if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }
    ($result -join "`n" | ConvertFrom-Json) | ConvertTo-Json -Depth 20 -Compress
} catch {
    [pscustomobject]@{
        success = $false
        provider = 'windows.media.ocr'
        error = $_.Exception.Message
        confidenceAvailable = $false
        lines = @()
    } | ConvertTo-Json -Depth 5 -Compress
}
