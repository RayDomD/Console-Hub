; electron-builder's NSIS templates do not register `protocols` on Windows, so
; the installer writes the consolehub:// handler itself. SHELL_CONTEXT follows
; the install scope (HKCU for a per-user install). Cockpit detects an installed
; Console Hub through this key, so it must exist before the first launch.

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\consolehub" "" "URL:Console Hub launch"
  WriteRegStr SHELL_CONTEXT "Software\Classes\consolehub" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\consolehub\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\consolehub\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey SHELL_CONTEXT "Software\Classes\consolehub"
!macroend
