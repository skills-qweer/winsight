[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'WinSight.Wgc.cs'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$systemRuntime = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.dll'
$netStandard = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\netstandard.dll'
$windowsRuntimeInterop = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.InteropServices.WindowsRuntime.dll'
$runtime = Get-ChildItem -LiteralPath 'C:\Windows\Microsoft.NET\assembly\GAC_MSIL\System.Runtime.WindowsRuntime' -Recurse -Filter 'System.Runtime.WindowsRuntime.dll' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

if (-not (Test-Path -LiteralPath $compiler)) { throw 'The .NET Framework C# compiler is unavailable.' }
if (-not (Test-Path -LiteralPath $systemRuntime)) { throw 'The .NET Framework System.Runtime facade is unavailable.' }
if (-not (Test-Path -LiteralPath $netStandard)) { throw 'The .NET Framework netstandard facade is unavailable.' }
if (-not (Test-Path -LiteralPath $windowsRuntimeInterop)) { throw 'The .NET Framework WinRT interop facade is unavailable.' }
if (-not $runtime) { throw 'System.Runtime.WindowsRuntime.dll is unavailable.' }

$contractsVersion = '10.0.19041.2'
$contractsSha256 = '379B663EA3EBAA7DF78B2B2666190BBBABE5E11B221428C503C49C09310C7F78'
$contractsRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "WinSight\sdk-contracts\$contractsVersion"
$contractsReference = Join-Path $contractsRoot 'ref\netstandard2.0'
$contractFiles = @(
    (Join-Path $contractsReference 'Windows.WinMD'),
    (Join-Path $contractsReference 'Windows.Foundation.FoundationContract.winmd'),
    (Join-Path $contractsReference 'Windows.Foundation.UniversalApiContract.winmd')
)
if (@($contractFiles | Where-Object { -not (Test-Path -LiteralPath $_) }).Count -gt 0) {
    [System.IO.Directory]::CreateDirectory($contractsReference) | Out-Null
    $package = Join-Path $contractsRoot "microsoft.windows.sdk.contracts.$contractsVersion.nupkg"
    $packageUrl = "https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.contracts/$contractsVersion/microsoft.windows.sdk.contracts.$contractsVersion.nupkg"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $packageUrl -OutFile $package -UseBasicParsing
    $actualHash = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash
    if ($actualHash -ne $contractsSha256) {
        throw "The downloaded SDK Contracts package failed SHA-256 verification. Expected $contractsSha256, got $actualHash."
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($package)
    try {
        foreach ($contractFile in $contractFiles) {
            $entryName = 'ref/netstandard2.0/' + [System.IO.Path]::GetFileName($contractFile)
            $entry = $archive.GetEntry($entryName)
            if (-not $entry) { throw "The SDK Contracts package does not contain $entryName" }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $contractFile, $true)
        }
    } finally {
        $archive.Dispose()
    }
}

$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.Substring(0, 16).ToLowerInvariant()
$outputDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WinSight\wgc'
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$output = Join-Path $outputDirectory "WinSight.Wgc.$hash.exe"

if (-not (Test-Path -LiteralPath $output)) {
    $arguments = @(
        '/nologo', '/target:exe', '/platform:x64', '/optimize+',
        "/out:$output",
        "/reference:$runtime",
        "/reference:$systemRuntime",
        "/reference:$netStandard"
        "/reference:$windowsRuntimeInterop"
    )
    foreach ($contractFile in $contractFiles) { $arguments += "/reference:$contractFile" }
    $arguments += $source
    $compilerOutput = @(& $compiler @arguments 2>&1 | ForEach-Object { $_.ToString() })
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) {
        throw "WGC helper compilation failed:`n$($compilerOutput -join "`n")"
    }
}

$output
