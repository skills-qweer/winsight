[CmdletBinding(DefaultParameterSetName = 'ByTitle')]
param(
    [ValidateSet('list', 'capture', 'diagnose')]
    [string]$Action = 'list',

    [Parameter(ParameterSetName = 'ByTitle')]
    [string]$Title,

    [Parameter(ParameterSetName = 'ByProcess')]
    [string]$Process,

    [Parameter(ParameterSetName = 'ByHwnd')]
    [long]$Hwnd,

    [ValidateSet('auto', 'printwindow', 'gdi-screen')]
    [string]$Backend = 'auto',

    [string]$Output,

    [switch]$IncludeHidden
)

$ErrorActionPreference = 'Stop'
$selectionMode = $PSCmdlet.ParameterSetName
$nativeSource = Join-Path $PSScriptRoot 'WinSight.Native.cs'
if (-not ('WinSightNative' -as [type])) {
    Add-Type -Path $nativeSource -ReferencedAssemblies System.Drawing
}

function Get-WinSightWindows {
    $nativeWindows = [WinSightNative]::ListWindows($IncludeHidden.IsPresent)
    foreach ($window in $nativeWindows) {
        $processName = $null
        try {
            $processName = (Get-Process -Id $window.ProcessId -ErrorAction Stop).ProcessName
        } catch {
            $processName = $null
        }
        [pscustomobject]@{
            hwnd = $window.Hwnd
            processId = $window.ProcessId
            process = $processName
            title = $window.Title
            className = $window.ClassName
            visible = $window.Visible
            bounds = [pscustomobject]@{
                x = $window.X
                y = $window.Y
                width = $window.Width
                height = $window.Height
            }
            clientBounds = [pscustomobject]@{
                x = $window.ClientX
                y = $window.ClientY
                width = $window.ClientWidth
                height = $window.ClientHeight
            }
            dpi = $window.Dpi
            dpiScale = [math]::Round($window.Dpi / 96.0, 4)
        }
    }
}

function Resolve-WinSightWindow {
    param([object[]]$Windows)

    $matches = @($Windows)
    if ($selectionMode -eq 'ByHwnd') {
        $matches = @($matches | Where-Object { $_.hwnd -eq $Hwnd })
    } elseif ($selectionMode -eq 'ByProcess') {
        $matches = @($matches | Where-Object { $_.process -like "*$Process*" })
    } elseif ($Title) {
        $matches = @($matches | Where-Object { $_.title -like "*$Title*" })
    }

    if ($matches.Count -eq 0) {
        throw 'No matching window was found.'
    }
    if ($matches.Count -gt 1) {
        $summary = $matches | Select-Object hwnd, processId, process, title
        throw "More than one window matched. Select one by HWND.`n$($summary | ConvertTo-Json -Depth 3)"
    }
    return $matches[0]
}

function Get-DefaultOutputPath {
    $directory = Join-Path ([System.IO.Path]::GetTempPath()) 'winsight'
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    return Join-Path $directory ("capture-{0:yyyyMMdd-HHmmss-fff}.png" -f (Get-Date))
}

$windows = @(Get-WinSightWindows)

if ($Action -eq 'list') {
    ConvertTo-Json -InputObject @($windows | Sort-Object process, title) -Depth 5 -Compress
    return
}

if ($Action -eq 'diagnose') {
    $os = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $build = [int]$os.CurrentBuild
    $diagnostic = [ordered]@{
        productName = $os.ProductName
        displayVersion = $os.DisplayVersion
        build = $build
        ubr = $os.UBR
        capabilities = [ordered]@{
            createForWindow = $build -ge 18362
            isBorderRequired = $build -ge 20348
            desktopDuplication = $build -ge 9200
            printWindow = $true
        }
        diagnosis = if ($build -lt 20348) {
            'WGC window capture is available, but GraphicsCaptureSession.IsBorderRequired is not. A caller must skip that property or use a fallback backend.'
        } else {
            'The operating system build supports GraphicsCaptureSession.IsBorderRequired.'
        }
    }
    $diagnostic | ConvertTo-Json -Depth 5 -Compress
    return
}

$target = Resolve-WinSightWindow -Windows $windows
if (-not $Output) {
    $Output = Get-DefaultOutputPath
}
$Output = [System.IO.Path]::GetFullPath($Output)
$parent = Split-Path -Parent $Output
[System.IO.Directory]::CreateDirectory($parent) | Out-Null

$attempts = New-Object System.Collections.Generic.List[object]
if ($Backend -eq 'auto' -or $Backend -eq 'printwindow') {
    $printResult = [WinSightNative]::CapturePrintWindow($target.hwnd, $Output)
    $attempts.Add($printResult)
    if ($printResult.Success -and -not $printResult.LikelyBlackFrame) {
        [pscustomobject]@{ target = $target; selected = $printResult; attempts = $attempts } | ConvertTo-Json -Depth 7 -Compress
        return
    }
    if ($Backend -eq 'printwindow') {
        [pscustomobject]@{ target = $target; selected = $printResult; attempts = $attempts } | ConvertTo-Json -Depth 7 -Compress
        return
    }
}

if ($Backend -eq 'auto' -or $Backend -eq 'gdi-screen') {
    $screenResult = [WinSightNative]::CaptureScreenRegion($target.hwnd, $Output)
    $attempts.Add($screenResult)
    [pscustomobject]@{ target = $target; selected = $screenResult; attempts = $attempts } | ConvertTo-Json -Depth 7 -Compress
    return
}
