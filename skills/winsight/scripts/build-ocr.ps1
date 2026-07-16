[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'WinSight.Ocr.cs'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$framework = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$runtime = Get-ChildItem -LiteralPath 'C:\Windows\Microsoft.NET\assembly\GAC_MSIL\System.Runtime.WindowsRuntime' -Recurse -Filter 'System.Runtime.WindowsRuntime.dll' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

# Reuse the WGC builder's pinned and hash-verified SDK Contracts bootstrap.
& (Join-Path $PSScriptRoot 'build-wgc.ps1') | Out-Null

$contractsVersion = '10.0.19041.2'
$contractsReference = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "WinSight\sdk-contracts\$contractsVersion\ref\netstandard2.0"
$contractFiles = @(
    (Join-Path $contractsReference 'Windows.WinMD'),
    (Join-Path $contractsReference 'Windows.Foundation.FoundationContract.winmd'),
    (Join-Path $contractsReference 'Windows.Foundation.UniversalApiContract.winmd')
)
$references = @(
    $runtime,
    (Join-Path $framework 'System.Runtime.dll'),
    (Join-Path $framework 'netstandard.dll'),
    (Join-Path $framework 'System.Runtime.InteropServices.WindowsRuntime.dll'),
    (Join-Path $framework 'System.Web.Extensions.dll')
) + $contractFiles
foreach ($reference in $references) {
    if (-not $reference -or -not (Test-Path -LiteralPath $reference)) { throw "Required OCR build reference is unavailable: $reference" }
}

$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.Substring(0, 16).ToLowerInvariant()
$outputDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WinSight\ocr'
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$output = Join-Path $outputDirectory "WinSight.Ocr.$hash.exe"

if (-not (Test-Path -LiteralPath $output)) {
    $arguments = @('/nologo', '/target:exe', '/platform:x64', '/optimize+', "/out:$output")
    foreach ($reference in $references) { $arguments += "/reference:$reference" }
    $arguments += $source
    $compilerOutput = @(& $compiler @arguments 2>&1 | ForEach-Object { $_.ToString() })
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) {
        throw "OCR helper compilation failed:`n$($compilerOutput -join "`n")"
    }
}

$output
