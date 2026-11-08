# Keep shell integration outside the generated wails_tools.nsh.
# SystemFileAssociations exposes the verb even when another app is the default.
LangString MSG_OPEN_WITH_MARKGO ${LANG_ENGLISH} "Open with ${INFO_PRODUCTNAME}"
LangString MSG_OPEN_WITH_MARKGO ${LANG_SIMPCHINESE} "用 ${INFO_PRODUCTNAME} 打开"

!macro markgo.registerContextMenu EXT
    WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\MarkGo.Open" "" "$(MSG_OPEN_WITH_MARKGO)"
    WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\MarkGo.Open" "Icon" '$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\",0'
    # The editor accepts one document per launch.
    WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\MarkGo.Open" "MultiSelectModel" "Single"
    WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\MarkGo.Open\command" "" '$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\"'
!macroend

!macro markgo.unregisterContextMenu EXT
    # Remove only our own verb; preserve other applications' shell entries.
    DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\MarkGo.Open"
!macroend

!macro markgo.installContextMenu
    # SHCTX follows wails.setShellContext for user and machine installations.
    SetRegView 64
    # Explorer's Open with menu uses FriendlyAppName, falling back to the EXE's
    # FileDescription. Keep both as the product name, not the marketing copy.
    WriteRegStr SHCTX "Software\Classes\Applications\${PRODUCT_EXECUTABLE}" "FriendlyAppName" "${INFO_PRODUCTNAME}"
    WriteRegStr SHCTX "Software\Classes\Applications\${PRODUCT_EXECUTABLE}\SupportedTypes" ".md" ""
    WriteRegStr SHCTX "Software\Classes\Applications\${PRODUCT_EXECUTABLE}\SupportedTypes" ".markdown" ""
    WriteRegStr SHCTX "Software\Classes\Applications\${PRODUCT_EXECUTABLE}\shell\open\command" "" '$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\"'
    !insertmacro markgo.registerContextMenu "md"
    !insertmacro markgo.registerContextMenu "markdown"
    !insertmacro markgo.notifyShell
!macroend

!macro markgo.uninstallContextMenu
    SetRegView 64
    DeleteRegKey SHCTX "Software\Classes\Applications\${PRODUCT_EXECUTABLE}"
    !insertmacro markgo.unregisterContextMenu "md"
    !insertmacro markgo.unregisterContextMenu "markdown"
    !insertmacro markgo.notifyShell
!macroend

!macro markgo.notifyShell
    # SHCNE_ASSOCCHANGED / SHCNF_IDLIST: refresh Explorer's association cache.
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
