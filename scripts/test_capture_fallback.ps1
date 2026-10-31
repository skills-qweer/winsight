$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$repoRoot = Split-Path -Parent $PSScriptRoot
$captureScript = Join-Path $repoRoot 'skills/winsight/scripts/winsight.ps1'
$inputScript = Join-Path $repoRoot 'skills/winsight/scripts/input.ps1'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('winsight-native-failure-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot) | Out-Null
try {
    $mockHelper = Join-Path $testRoot 'failure.exe'
    Add-Type -TypeDefinition 'public class CaptureFailure { public static int Main(string[] args) { System.Console.Error.WriteLine("WGC content size did not converge"); return 7; } }' -OutputAssembly $mockHelper -OutputType ConsoleApplication
    $escapedHelper = $mockHelper.Replace("'", "''")
    [IO.File]::WriteAllText((Join-Path $testRoot 'build-wgc.ps1'), "'$escapedHelper'", [Text.UTF8Encoding]::new($false))
    $tokens = $null; $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($captureScript, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw 'Capture script parse failed' }
    $functions = $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('New-CaptureFailure','Invoke-WgcCapture')}, $false)
    if ($functions.Count -ne 2) { throw 'Capture functions missing' }
    $harness = @'
$ErrorActionPreference = 'Stop'
'@
    $harness += "`n" + (($functions | ForEach-Object {$_.Extent.Text}) -join "`n")
    $harness += @'

$result = Invoke-WgcCapture -Target ([pscustomobject]@{hwnd=1}) -OutputPath (Join-Path $PSScriptRoot 'unused.png')
if ($result.Success -or $result.Error -notmatch 'did not converge') { throw 'Native failure was not preserved as a failed capture' }
if ($ErrorActionPreference -ne 'Stop') { throw 'Caller error preference was changed' }
$result | ConvertTo-Json -Compress
'@
    $harnessPath = Join-Path $testRoot 'harness.ps1'
    [IO.File]::WriteAllText($harnessPath, $harness, [Text.UTF8Encoding]::new($false))
    $result = & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $harnessPath
    if ($LASTEXITCODE -ne 0) { throw 'Windows PowerShell native stderr regression failed' }
    $result | Out-Null
    $source = [IO.File]::ReadAllText($inputScript, [Text.Encoding]::UTF8)
    $match = [regex]::Match($source, '(?m)^\$blockedTitle = ''([^'']+)''')
    if (-not $match.Success) { throw 'Sensitive title pattern missing' }
    $pattern = $match.Groups[1].Value
    if ($pattern -match '[^\x00-\x7f]') { throw 'Guard must survive PowerShell 5 ANSI source decoding' }
    foreach ($encoded in @('\u767b\u5f55','\u5bc6\u7801','\u9a8c\u8bc1\u7801','\u652f\u4ed8','\u4ed8\u6b3e','\u6743\u9650','\u5b89\u5168')) {
        if ([regex]::Unescape($encoded) -notmatch $pattern) { throw 'Chinese sensitive-title guard failed' }
    }
    'Native stderr fallback and PowerShell 5 sensitive-title guards passed.'
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\winsight-native-failure-'
    if (-not $resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected test directory' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
