param([string]$ExpectedInstalledDirectory)
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$source = Join-Path $repo 'scripts/windows/run_update.ps1'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
# Load only discovery functions: no updater UI or installation is executed.
foreach ($name in @('Resolve-BlendUpInstallDirectory', 'Installed-Directory')) {
    $function = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if (!$function) { throw "Missing function: $name" }
    . ([scriptblock]::Create($function.Extent.Text))
}
$fixture = Join-Path $repo ('.dev-tools/discovery-' + [guid]::NewGuid().ToString('N') + '/Application avec espaces')
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fixture 'blendup.exe') -Value 'Test fixture' -Encoding UTF8
foreach ($candidate in @($fixture, ('"' + $fixture + '"'), ('  "' + $fixture + '"  '), ('"' + $fixture + '\"'))) {
    $resolved = Resolve-BlendUpInstallDirectory $candidate
    if (!$resolved -or $resolved.TrimEnd('\') -ne $fixture) { throw "Wrong directory for quoted candidate: $candidate => $resolved" }
}
foreach ($candidate in @($null, '', '  ', 'relative/path', 'invalid:drive/path', (Join-Path $fixture 'missing'))) {
    if (Resolve-BlendUpInstallDirectory $candidate) { throw "Invalid candidate accepted: $candidate" }
}
function Check-ConfirmationClosure([string]$Location) {
    $handler = { Resolve-BlendUpInstallDirectory $Location }.GetNewClosure()
    return & $handler
}
if ((Check-ConfirmationClosure ('"' + $fixture + '"')) -ne $fixture) { throw 'Discovery failed in the confirmation event closure' }
if ($ExpectedInstalledDirectory) {
    $actual = Installed-Directory
    if ($actual -ne $ExpectedInstalledDirectory) { throw "Registry discovery mismatch: $actual" }
    Write-Output "REAL_INSTALLATION_DISCOVERY_OK $actual"
}
Write-Output 'BLENDUP_UPDATE_DISCOVERY_SMOKE_OK quoted paths, whitespace, missing and malformed entries'
