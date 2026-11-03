$ErrorActionPreference = "Stop"

Push-Location (Join-Path $PSScriptRoot "..")
try {
	$bun = Join-Path (Get-Location) "node_modules\.bin\bun.cmd"
	& $bun run plugins:build
	if ($LASTEXITCODE -ne 0) { throw "Plugin package build failed" }

	$assets = @(
		Get-ChildItem (Join-Path (Get-Location) "plugins\dist") -Filter "*.island-plugin.json" | ForEach-Object FullName
		Join-Path (Get-Location) "plugins\catalog.json"
	)
	& gh release view plugins --json tagName *> $null
	if ($LASTEXITCODE -eq 0) {
		& gh release upload plugins @assets --clobber
	} else {
		& gh release create plugins @assets --title "Independent plugin packages" --notes "Independently downloadable plugin bundles and the SHA-256 catalog. Separate from desktop app releases." --prerelease
	}
	if ($LASTEXITCODE -ne 0) { throw "Plugin release upload failed" }
} finally {
	Pop-Location
}
