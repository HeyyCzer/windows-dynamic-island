; The notifications sparse package (src/providers/notifications/package.rs)
; lives in the app data folder. Uninstalling with "delete app data" wipes that
; folder but leaves the package registered, and from then on Windows refuses to
; start the exe ("Installation failed") because its embedded manifest links it
; to the broken package. Drop the package whenever its manifest is gone; the
; app registers it again when notifications are turned back on.
!macro DI_REMOVE_BROKEN_PACKAGE
  Push $0
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$p = Get-AppxPackage -Name DynamicIsland; if ($$p -and (-not $$p.InstallLocation -or -not (Test-Path (Join-Path $$p.InstallLocation 'AppxManifest.xml')))) { $$p | Remove-AppxPackage }"`
  Pop $0
  Pop $0
!macroend

; Repairs installations already broken by an earlier uninstall.
!macro NSIS_HOOK_PREINSTALL
  !insertmacro DI_REMOVE_BROKEN_PACKAGE
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro DI_REMOVE_BROKEN_PACKAGE
!macroend
