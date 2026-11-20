; What Task Tracker leaves outside its install folder that is not user data
; (PLAN.md section 7.13). uninstall-startup.nsh runs these on a real uninstall
; only, never during an update.

; electron-builder's installer copies itself (about 130 MB) to
; %LOCALAPPDATA%\task-tracker-updater on every install. The app's own updater
; downloads into its profile and never reads this copy.
!macro removeUpdaterCache
  RMDir /r "$LOCALAPPDATA\task-tracker-updater"
!macroend

; Electron registers the toast activator for notification clicks as a per-user
; COM server. The CLSID is INSTALLED_IDENTITY in src/windows-app-identity.ts.
!macro removeToastActivator
  DeleteRegKey HKCU "Software\Classes\CLSID\{93603194-4CCF-41CE-984E-774763DBDB43}"
!macroend
