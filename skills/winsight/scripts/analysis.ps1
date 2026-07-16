[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('crop', 'compare')]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [string]$ImagePath,

    [string]$Other,
    [string]$Output,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [ValidateRange(0, 255)]
    [int]$PixelThreshold = 16
)

$ErrorActionPreference = 'Stop'
$nativeSource = Join-Path $PSScriptRoot 'WinSight.Native.cs'
if (-not ('WinSightNative' -as [type])) {
    Add-Type -Path $nativeSource -ReferencedAssemblies System.Drawing
}

if ($Action -eq 'crop') {
    if (-not $Output) { throw 'Output is required for crop.' }
    $result = [WinSightNative]::CropImageFile(
        [System.IO.Path]::GetFullPath($ImagePath),
        [System.IO.Path]::GetFullPath($Output),
        $X,
        $Y,
        $Width,
        $Height
    )
} else {
    if (-not $Other) { throw 'Other is required for compare.' }
    $result = [WinSightNative]::CompareImageFiles(
        [System.IO.Path]::GetFullPath($ImagePath),
        [System.IO.Path]::GetFullPath($Other),
        $PixelThreshold
    )
}

$result | ConvertTo-Json -Depth 6 -Compress
