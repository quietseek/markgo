Unicode true

####
## Please note: Template replacements don't work in this file. They are provided with default defines like
## mentioned underneath.
## If the keyword is not defined, "wails_tools.nsh" will populate them.
## If they are defined here, "wails_tools.nsh" will not touch them. This allows you to use this project.nsi manually
## from outside of Wails for debugging and development of the installer.
## 
## For development first make a wails nsis build to populate the "wails_tools.nsh":
## > wails build --target windows/amd64 --nsis
## Then you can call makensis on this file with specifying the path to your binary:
## For a AMD64 only installer:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app.exe
## For a ARM64 only installer:
## > makensis -DARG_WAILS_ARM64_BINARY=..\..\bin\app.exe
## For a installer with both architectures:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\app-arm64.exe
####
## The following information is taken from the wails_tools.nsh file, but they can be overwritten here.
####
## !define INFO_PROJECTNAME    "my-project" # Default "MarkGo"
## !define INFO_COMPANYNAME    "My Company" # Default "quietseek"
## !define INFO_PRODUCTNAME    "My Product Name" # Default "MarkGo"
## !define INFO_PRODUCTVERSION "1.0.0"     # Default "0.1.0"
## !define INFO_COPYRIGHT      "(c) Now, My Company" # Default "© 2026 quietseek"
###
## !define PRODUCT_EXECUTABLE  "Application.exe"      # Default "${INFO_PROJECTNAME}.exe"
## !define UNINST_KEY_NAME     "UninstKeyInRegistry"  # Default "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
####
## !define REQUEST_EXECUTION_LEVEL "admin"            # Default "admin"  see also https://nsis.sourceforge.io/Docs/Chapter4.html
## !define WAILS_INSTALL_SCOPE     "user"             # Default "machine" - set to "user" for per-user install ($LOCALAPPDATA) without UAC prompt
####
## Include the wails tools
####
!include "wails_tools.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
# !define MUI_WELCOMEFINISHPAGE_BITMAP "resources\leftimage.bmp" #Include this to add a bitmap on the left side of the Welcome Page. Must be a size of 164x314
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.

!insertmacro MUI_PAGE_WELCOME # Welcome to the installer page.
# !insertmacro MUI_PAGE_LICENSE "resources\eula.txt" # Adds a EULA page to the installer
!insertmacro MUI_PAGE_DIRECTORY # In which folder install page.
!insertmacro MUI_PAGE_INSTFILES # Installing page.
!insertmacro MUI_PAGE_FINISH # Finished installation page.

!insertmacro MUI_UNPAGE_INSTFILES # Uninstalling page

# 安装界面语言跟随系统：系统为中文时显示中文，其余显示英文（第一个为默认语言）
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"

LangString MSG_APP_RUNNING ${LANG_ENGLISH} "${INFO_PRODUCTNAME} is running. Click OK to close it and continue, or Cancel to quit."
LangString MSG_APP_RUNNING ${LANG_SIMPCHINESE} "${INFO_PRODUCTNAME} 正在运行。点击「确定」关闭它并继续，点击「取消」退出。"

# 安装 / 卸载前关闭正在运行的应用，否则文件被占用无法覆盖；静默安装（应用内自动更新）时直接关闭
!macro markgo.closeRunningApp
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /c ""$SYSDIR\tasklist.exe" /FI "IMAGENAME eq ${PRODUCT_EXECUTABLE}" /NH | "$SYSDIR\find.exe" /I "${PRODUCT_EXECUTABLE}""'
    Pop $0
    Pop $1
    ${If} $0 == 0
        ${If} ${Cmd} `MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$(MSG_APP_RUNNING)" /SD IDOK IDCANCEL`
            Abort
        ${EndIf}
        nsExec::Exec '"$SYSDIR\taskkill.exe" /IM ${PRODUCT_EXECUTABLE}'
        Sleep 1500
        nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM ${PRODUCT_EXECUTABLE}'
        Sleep 500
    ${EndIf}
!macroend

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe" # Name of the installer's file.
!if "${WAILS_INSTALL_SCOPE}" == "user"
    InstallDir "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
!else
    InstallDir "$PROGRAMFILES64\${INFO_PRODUCTNAME}"
!endif
ShowInstDetails show # This will always show the installation details.

# 旧版本安装在 Program Files\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}，升级时迁移到新位置并删除旧目录
!define OLD_INSTALL_DIR "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
Var oldInstDir

Function .onInit
   !insertmacro wails.checkArchitecture
   # 升级时装到原来的位置（卸载信息中记录了程序路径）
   SetRegView 64
   !if "${WAILS_INSTALL_SCOPE}" == "user"
       ReadRegStr $0 HKCU "${UNINST_KEY}" "DisplayIcon"
   !else
       ReadRegStr $0 HKLM "${UNINST_KEY}" "DisplayIcon"
   !endif
   ${If} $0 != ""
       ${GetParent} $0 $1
       !if "${WAILS_INSTALL_SCOPE}" != "user"
           ${If} $1 == "${OLD_INSTALL_DIR}"
               StrCpy $oldInstDir $1
               StrCpy $1 ""
           ${EndIf}
       !endif
       ${If} $1 != ""
           StrCpy $INSTDIR $1
       ${EndIf}
   ${EndIf}
   !insertmacro markgo.closeRunningApp
FunctionEnd

Function un.onInit
   !insertmacro markgo.closeRunningApp
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR
    
    !insertmacro wails.files

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols
    
    !insertmacro wails.writeUninstaller

    # 删除旧位置的程序文件（安装到了其他目录时）
    ${If} $oldInstDir != ""
    ${AndIf} $oldInstDir != $INSTDIR
        RMDir /r $oldInstDir
        ${GetParent} $oldInstDir $0
        RMDir $0 # 仅在为空时删除
        # 应用内自动更新（静默安装）由旧版本负责重启，但它记录的是旧路径，这里以普通权限打开新位置的应用
        ${If} ${Silent}
            Exec '"$WINDIR\explorer.exe" "$INSTDIR\${PRODUCT_EXECUTABLE}"'
        ${EndIf}
    ${EndIf}
SectionEnd

Section "uninstall" 
    !insertmacro wails.setShellContext

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

    RMDir /r $INSTDIR

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols

    !insertmacro wails.deleteUninstaller
SectionEnd
