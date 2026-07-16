[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('click', 'key')]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [long]$Hwnd,

    [int]$ScreenX,
    [int]$ScreenY,

    [ValidateSet('ENTER', 'ESCAPE', 'SPACE', 'TAB', 'UP', 'DOWN', 'LEFT', 'RIGHT')]
    [string]$Key
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
$blockedTitle = '(?i)(password|passcode|sign[ -]?in|log[ -]?in|captcha|payment|credential|验证码|密码|登录|支付|付款|权限|permission|security|安全)'
$creatorLoginState = $processName -eq 'CocosCreator' -and $window.Title -match '^Untitled\s+-\s+.*Cocos Creator'
if (($processName -match $blockedProcess) -or ($window.Title -match $blockedTitle) -or $creatorLoginState) {
    throw 'WinSight refuses input on authentication, payment, permission, password-manager, or Windows security surfaces.'
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

[pscustomobject]@{
    target = [pscustomobject]@{
        hwnd = $Hwnd
        process = $processName
        title = $window.Title
    }
    result = $result
} | ConvertTo-Json -Depth 6 -Compress
