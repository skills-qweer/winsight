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

    [ValidateSet('auto', 'wgc', 'printwindow', 'dxgi', 'gdi-screen')]
    [string]$Backend = 'auto',

    [string]$Output,

    [switch]$IncludeHidden
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
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
            minimized = $window.Minimized
            monitor = [pscustomobject]@{
                x = $window.MonitorX
                y = $window.MonitorY
                width = $window.MonitorWidth
                height = $window.MonitorHeight
                device = $window.MonitorDevice
                outputIndex = if ($window.MonitorDevice -match 'DISPLAY(\d+)$') { [int]$Matches[1] - 1 } else { $null }
            }
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

function New-CaptureFailure {
    param(
        [string]$Backend,
        [string]$OutputPath,
        [string]$Error,
        [string]$ErrorCode,
        [bool]$Recoverable = $true
    )

    [pscustomobject]@{
        Success = $false
        Backend = $Backend
        OutputPath = $OutputPath
        Error = $Error
        ErrorCode = $ErrorCode
        Recoverable = $Recoverable
        Width = 0
        Height = 0
        MeanRgb = 0
        RangeRgb = 0
        SampleCount = 0
        LikelyBlackFrame = $true
    }
}

function Invoke-DxgiCapture {
    param(
        [pscustomobject]$Target,
        [string]$OutputPath
    )

    $ffmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
    if (-not $ffmpeg) {
        return New-CaptureFailure -Backend 'dxgi' -OutputPath $OutputPath -Error 'FFmpeg with the ddagrab filter is not available on PATH.' -ErrorCode 'dependency_missing'
    }
    if ($Target.minimized) {
        return New-CaptureFailure -Backend 'dxgi' -OutputPath $OutputPath -Error 'DXGI Desktop Duplication captures the rendered desktop; minimized windows have no visible desktop rectangle.' -ErrorCode 'window_minimized'
    }
    if (-not $Target.monitor -or $null -eq $Target.monitor.outputIndex) {
        return New-CaptureFailure -Backend 'dxgi' -OutputPath $OutputPath -Error 'Could not map the target monitor to a DXGI output index.' -ErrorCode 'monitor_mapping_failed'
    }

    $windowRight = $Target.bounds.x + $Target.bounds.width
    $windowBottom = $Target.bounds.y + $Target.bounds.height
    $monitorRight = $Target.monitor.x + $Target.monitor.width
    $monitorBottom = $Target.monitor.y + $Target.monitor.height
    if ($Target.bounds.x -lt $Target.monitor.x -or $Target.bounds.y -lt $Target.monitor.y -or
        $windowRight -gt $monitorRight -or $windowBottom -gt $monitorBottom) {
        return New-CaptureFailure -Backend 'dxgi' -OutputPath $OutputPath -Error 'The target spans or extends outside its owning monitor; a single-output crop would not preserve window coordinates.' -ErrorCode 'window_spans_outputs'
    }

    $offsetX = $Target.bounds.x - $Target.monitor.x
    $offsetY = $Target.bounds.y - $Target.monitor.y
    $filter = 'ddagrab=output_idx={0}:draw_mouse=0:framerate=30,hwdownload,format=bgra,crop={1}:{2}:{3}:{4}' -f
        $Target.monitor.outputIndex, $Target.bounds.width, $Target.bounds.height, $offsetX, $offsetY
    $arguments = @(
        '-y', '-hide_banner', '-loglevel', 'error',
        '-filter_complex', $filter,
        '-frames:v', '1', '-update', '1', $OutputPath
    )
    $diagnostic = @(& $ffmpeg.Source @arguments 2>&1 | ForEach-Object { $_.ToString() })
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) {
        $message = ($diagnostic -join "`n").Trim()
        if (-not $message) { $message = "FFmpeg ddagrab exited with code $LASTEXITCODE." }
        $errorCode = if ($message -match 'access denied') { 'access_denied' }
            elseif ($message -match 'not currently available|Too many open') { 'session_limit' }
            elseif ($message -match 'device|DXGI_ERROR') { 'device_lost_or_unsupported' }
            else { 'capture_failed' }
        return New-CaptureFailure -Backend 'dxgi' -OutputPath $OutputPath -Error $message -ErrorCode $errorCode
    }

    return [WinSightNative]::AnalyzeImageFile($OutputPath, 'dxgi')
}

function Invoke-WgcCapture {
    param(
        [pscustomobject]$Target,
        [string]$OutputPath
    )

    $buildScript = Join-Path $PSScriptRoot 'build-wgc.ps1'
    try {
        $helper = @(& $buildScript 2>&1 | ForEach-Object { $_.ToString() })
        $helperPath = $helper | Select-Object -Last 1
        if (-not $helperPath -or -not (Test-Path -LiteralPath $helperPath)) {
            throw ($helper -join "`n")
        }
    } catch {
        return New-CaptureFailure -Backend 'wgc' -OutputPath $OutputPath -Error $_.Exception.Message -ErrorCode 'helper_build_failed'
    }

    # Windows PowerShell 5 wraps redirected native stderr in ErrorRecord. Keep
    # that diagnostic as data so auto can try the next capture backend.
    $previousErrorPreference = $ErrorActionPreference
    $helperExitCode = $null
    try {
        $ErrorActionPreference = 'Continue'
        $LASTEXITCODE = $null
        $diagnostic = @(& $helperPath ([string]$Target.hwnd) $OutputPath 2>&1 | ForEach-Object { $_.ToString() })
        $helperExitCode = $LASTEXITCODE
    } catch {
        return New-CaptureFailure -Backend 'wgc' -OutputPath $OutputPath -Error $_.Exception.Message -ErrorCode 'helper_start_failed'
    } finally {
        $ErrorActionPreference = $previousErrorPreference
    }
    if ($helperExitCode -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) {
        $message = ($diagnostic -join "`n").Trim()
        if (-not $message) { $message = "The WGC helper exited with code $helperExitCode." }
        $errorCode = if ($message -match '0x80004002|E_NOINTERFACE') { 'interface_not_supported' }
            elseif ($message -match '0x80070005|access denied') { 'access_denied' }
            elseif ($message -match 'Timeout') { 'frame_timeout' }
            elseif ($message -match 'device|DXGI') { 'device_lost_or_unsupported' }
            else { 'capture_failed' }
        return New-CaptureFailure -Backend 'wgc' -OutputPath $OutputPath -Error $message -ErrorCode $errorCode
    }

    return [WinSightNative]::AnalyzeImageFile($OutputPath, 'wgc')
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
            wgcHelper = Test-Path -LiteralPath (Join-Path $PSScriptRoot 'WinSight.Wgc.cs')
            desktopDuplication = $build -ge 9200
            ffmpegDdagrab = [bool](Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)
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
if ($Backend -eq 'auto' -or $Backend -eq 'wgc') {
    $wgcResult = Invoke-WgcCapture -Target $target -OutputPath $Output
    $attempts.Add($wgcResult)
    if ($wgcResult.Success -and -not $wgcResult.LikelyBlackFrame) {
        [pscustomobject]@{ target = $target; selected = $wgcResult; attempts = $attempts } | ConvertTo-Json -Depth 7 -Compress
        return
    }
    if ($Backend -eq 'wgc') {
        [pscustomobject]@{ target = $target; selected = $wgcResult; attempts = $attempts } | ConvertTo-Json -Depth 7 -Compress
        return
    }
}

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


if ($Backend -eq 'auto' -or $Backend -eq 'dxgi') {
    $dxgiResult = Invoke-DxgiCapture -Target $target -OutputPath $Output
    $attempts.Add($dxgiResult)
    if ($dxgiResult.Success -and -not $dxgiResult.LikelyBlackFrame) {
        [pscustomobject]@{ target = $target; selected = $dxgiResult; attempts = $attempts } | ConvertTo-Json -Depth 7 -Compress
        return
    }
    if ($Backend -eq 'dxgi') {
        [pscustomobject]@{ target = $target; selected = $dxgiResult; attempts = $attempts } | ConvertTo-Json -Depth 7 -Compress
        return
    }
}

if ($Backend -eq 'auto' -or $Backend -eq 'gdi-screen') {
    $screenResult = [WinSightNative]::CaptureScreenRegion($target.hwnd, $Output)
    $attempts.Add($screenResult)
    [pscustomobject]@{ target = $target; selected = $screenResult; attempts = $attempts } | ConvertTo-Json -Depth 7 -Compress
    return
}
