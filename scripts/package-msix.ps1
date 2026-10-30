<#
  Builds the Microsoft Store edition and packs it as an MSIX.

    bun run package:store -- -IdentityName 12345HeyyCzer.IslandforWindows `
      -Publisher "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" -PublisherDisplayName HeyyCzer

  The three values are in Partner Center, under Product identity of the
  reserved app. The package is left unsigned: the Store signs it on upload.

  To try it locally without signing (needs Windows Developer Mode):
    Add-AppxPackage -Register src-tauri\target\store\msix\AppxManifest.xml
  and Remove-AppxPackage to take it out again.
#>
param(
	[Parameter(Mandatory)] [string] $IdentityName,
	[Parameter(Mandatory)] [string] $Publisher,
	[Parameter(Mandatory)] [string] $PublisherDisplayName,
	# Pack the exe from the last build instead of building again.
	[switch] $SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tauri = Join-Path $root "src-tauri"
# Its own target folder, so the GitHub build's exe isn't overwritten.
$target = Join-Path $tauri "target\store"

if (-not $SkipBuild) {
	$env:CARGO_TARGET_DIR = $target
	Push-Location $root
	try {
		bun tauri build --no-bundle --features store --config src-tauri/tauri.microsoftstore.conf.json
		if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
	} finally {
		Pop-Location
	}
}

# The Store wants the fourth part of the version to be 0.
$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$msixVersion = "$version.0"

$stage = Join-Path $target "msix"
# A copy registered from here for testing locks the exe while it runs; stop
# before deleting the rest of the folder under it.
$stagedExe = Join-Path $stage "island-for-windows.exe"
if (Test-Path $stagedExe) {
	try { [System.IO.File]::Open($stagedExe, "Open", "ReadWrite", "None").Close() }
	catch { throw "$stagedExe is in use: quit Island for Windows first" }
}
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
$assets = New-Item -ItemType Directory -Force (Join-Path $stage "Assets")

Copy-Item (Join-Path $target "release\dynamic-island.exe") (Join-Path $stage "island-for-windows.exe")
# Every scale and target size of the logos: Start, search and the taskbar each
# ask for their own, and draw the icon on a plate when theirs is missing.
Copy-Item (Join-Path $tauri "icons\msix\*.png") $assets

$escape = { param($s) [System.Security.SecurityElement]::Escape($s) }
$manifest = (Get-Content (Join-Path $tauri "msix\AppxManifest.xml") -Raw).
	Replace("{name}", (& $escape $IdentityName)).
	Replace("{publisher}", (& $escape $Publisher)).
	Replace("{publisherDisplayName}", (& $escape $PublisherDisplayName)).
	Replace("{version}", $msixVersion)
Set-Content -Path (Join-Path $stage "AppxManifest.xml") -Value $manifest -Encoding utf8NoBOM -NoNewline

# makeappx and makepri ship with the Windows SDK; take the newest installed.
function Find-SdkTool($name) {
	$tool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\$name" -ErrorAction SilentlyContinue |
		Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
		Select-Object -First 1
	if (-not $tool) { throw "$name not found: install the Windows SDK" }
	$tool.FullName
}

# Resource index: a packaged app's shell finds the `targetsize`/`unplated`
# logo variants through it. Without it, Start and the taskbar fall back to
# the 44px logo drawn small on an accent-colored plate.
$makepri = Find-SdkTool "makepri.exe"
$priConfig = Join-Path $target "priconfig.xml"
& $makepri createconfig /cf $priConfig /dq en-US /pv 10.0.0 /o
if ($LASTEXITCODE -ne 0) { throw "makepri createconfig failed" }
& $makepri new /pr $stage /cf $priConfig /mn (Join-Path $stage "AppxManifest.xml") /of (Join-Path $stage "resources.pri") /o
if ($LASTEXITCODE -ne 0) { throw "makepri new failed" }

$out = Join-Path $target "IslandForWindows_${version}_x64.msix"
& (Find-SdkTool "makeappx.exe") pack /d $stage /p $out /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed" }
Write-Host "MSIX: $out"
