[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('click', 'key', 'inspect-invoke', 'invoke')]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [long]$Hwnd,

    [int]$ScreenX,
    [int]$ScreenY,

    [ValidateSet('ENTER', 'ESCAPE', 'SPACE', 'TAB', 'UP', 'DOWN', 'LEFT', 'RIGHT')]
    [string]$Key,

    [string]$ExpectedControl
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$nativeSource = Join-Path $PSScriptRoot 'WinSight.Native.cs'
if (-not ('WinSightNative' -as [type])) {
    Add-Type -Path $nativeSource -ReferencedAssemblies System.Drawing
}

$target = @([WinSightNative]::ListWindows($true) | Where-Object { $_.Hwnd -eq $Hwnd })
if ($target.Count -ne 1) {
    throw 'The target HWND does not resolve to exactly one window.'
}

$window = $target[0]
$processName = $null
try { $processName = (Get-Process -Id $window.ProcessId -ErrorAction Stop).ProcessName } catch {}
$blockedProcess = '^(LockApp|LogonUI|CredentialUIBroker|consent|SecurityHealthUI|KeePass|Bitwarden|1Password|Enpass|LastPass)$'
$blockedTitle = '(?i)(password|passcode|sign[ -]?in|log[ -]?in|captcha|payment|credential|\u9a8c\u8bc1\u7801|\u5bc6\u7801|\u767b\u5f55|\u652f\u4ed8|\u4ed8\u6b3e|\u6743\u9650|permission|security|\u5b89\u5168)'
$creatorLoginState = $processName -eq 'CocosCreator' -and $window.Title -match '^Untitled\s+-\s+.*Cocos Creator'
if (($processName -match $blockedProcess) -or ($window.Title -match $blockedTitle) -or $creatorLoginState) {
    throw 'WinSight refuses input on authentication, payment, permission, password-manager, or Windows security surfaces.'
}

if ($Action -eq 'inspect-invoke' -or $Action -eq 'invoke') {
    Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
    $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$Hwnd)
    if (-not $root.Current.IsEnabled) { throw 'The target window is disabled or blocked.' }
    $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button)
    $buttons = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    $matches = @(foreach ($button in $buttons) {
        $current = $button.Current
        $rect = $current.BoundingRectangle
        if ($ScreenX -ge $rect.Left -and $ScreenX -lt $rect.Right -and
            $ScreenY -ge $rect.Top -and $ScreenY -lt $rect.Bottom) { $button }
    })
    if ($matches.Count -ne 1) { throw 'Background invocation requires exactly one button at the prepared point.' }
    $button = $matches[0]
    $current = $button.Current
    if (-not $current.IsEnabled -or $current.IsOffscreen -or $current.IsPassword -or $current.Name -match $blockedTitle) {
        throw 'Background invocation refuses disabled, hidden, or sensitive controls.'
    }
    $pattern = $null
    if (-not $button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
        throw 'This button does not support background invocation. No foreground fallback was attempted.'
    }
    $rect = $current.BoundingRectangle
    $control = [ordered]@{
        runtimeId = ($button.GetRuntimeId() -join ',')
        name = $current.Name
        automationId = $current.AutomationId
        processId = $current.ProcessId
        x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height
    }
    if ($Action -eq 'inspect-invoke') {
        [pscustomobject]@{ control = $control } | ConvertTo-Json -Depth 6 -Compress
        return
    }
    if ([string]::IsNullOrWhiteSpace($ExpectedControl)) { throw 'A prepared control identity is required.' }
    $expected = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ExpectedControl)) | ConvertFrom-Json
    foreach ($property in $control.Keys) {
        if ($null -eq $expected.PSObject.Properties[$property] -or $control[$property] -cne $expected.$property) {
            throw 'The button identity, name, or bounds changed. Prepare a new action.'
        }
    }
    $foregroundBefore = [WinSightNative]::ForegroundWindowHandle()
    $cursorBefore = [WinSightNative]::CursorPosition()
    ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
    [pscustomobject]@{
        target = @{ hwnd = $Hwnd; process = $processName; title = $window.Title }
        result = @{
            Success = $true; Action = 'invoke'; Control = $control
            foregroundBefore = $foregroundBefore
            foregroundAfter = [WinSightNative]::ForegroundWindowHandle()
            cursorBefore = $cursorBefore
            cursorAfter = [WinSightNative]::CursorPosition()
        }
    } | ConvertTo-Json -Depth 6 -Compress
    return
}

if ($Action -eq 'click') {
    $result = [WinSightNative]::ClickWindow($Hwnd, $ScreenX, $ScreenY)
} else {
    $virtualKeys = @{
        ENTER = 0x0D
        ESCAPE = 0x1B
        SPACE = 0x20
        TAB = 0x09
        UP = 0x26
        DOWN = 0x28
        LEFT = 0x25
        RIGHT = 0x27
    }
    $result = [WinSightNative]::KeyPressWindow($Hwnd, $virtualKeys[$Key])
}

if (-not $result.Success) { throw $result.Error }

[pscustomobject]@{
    target = [pscustomobject]@{
        hwnd = $Hwnd
        process = $processName
        title = $window.Title
    }
    result = $result
} | ConvertTo-Json -Depth 6 -Compress
