Unicode true
RequestExecutionLevel user
Name "BlendUp ${APP_VERSION} — Mise à jour"
OutFile "${OUTPUT_FILE}"
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!define MUI_WELCOMEPAGE_TITLE "Mettre à jour BlendUp ${APP_VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Cet exécutable met à jour BlendUp, son addon Blender et les addons des projets Godot sélectionnés.$\r$\n$\r$\nEnregistre ton travail, puis ferme BlendUp, Blender et Godot. Les préférences et les autres addons sont conservés."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TEXT "La mise à jour est terminée. Tu peux rouvrir BlendUp, Blender et Godot."
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "French"
Var Request
Var Arguments

Section "Mise à jour"
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File "${PAYLOAD_DIR}\setup.exe"
    File "${PAYLOAD_DIR}\blendup.exe"
    File "${PAYLOAD_DIR}\blendup.zip"
    File "${PAYLOAD_DIR}\update.json"
    File "${PAYLOAD_DIR}\run_update.ps1"
    ${GetParameters} $0
    ${GetOptions} $0 "/REQUEST=" $Request
    StrCpy $Arguments ""
    IfSilent 0 +2
        StrCpy $Arguments "-NonInteractive"
    ${If} $Request != ""
        StrCpy $Arguments '-RequestFile "$Request" -NonInteractive'
    ${EndIf}
    ClearErrors
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\run_update.ps1" -Payload "$PLUGINSDIR" $Arguments' $1
    ${If} ${Errors}
        SetErrorLevel 1
        Abort "Impossible de lancer la mise à jour."
    ${EndIf}
    ${If} $1 != 0
        SetErrorLevel $1
        Abort "La mise à jour a été annulée ou interrompue. Consulte le rapport affiché."
    ${EndIf}
SectionEnd
