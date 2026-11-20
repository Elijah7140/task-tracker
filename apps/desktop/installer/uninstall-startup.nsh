; Removes the per-user start-with-system entry when Task Tracker is uninstalled
; (PLAN.md section 7.13). Electron's login item API names the Run value after the
; AppUserModelID. An update runs the old uninstaller with --updated, so the entry
; stays in place then.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.tasktracker.desktop"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "app.tasktracker.desktop"
  ${endIf}
!macroend
