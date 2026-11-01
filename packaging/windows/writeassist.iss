#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{5D8C4A1B-3E7F-4B2C-8A9D-6E5F4A3B2C1D}
AppName=WriteAssist
AppVersion={#AppVersion}
AppPublisher=Mohamed Mahmoud
AppPublisherURL=https://github.com/mohamedjs/write-assist
DefaultDirName={autopf}\WriteAssist
DefaultGroupName=WriteAssist
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\..\dist
OutputBaseFilename=WriteAssist-Setup-{#AppVersion}
SetupIconFile=..\icons\writeassist.ico
UninstallDisplayIcon={app}\WriteAssistApp.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"

[Tasks]
Name: "autostart"; Description: "Start WriteAssist when I sign in"; GroupDescription: "Startup:"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\dist\writeassist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\WriteAssist"; Filename: "{app}\WriteAssistApp.exe"; Parameters: "run"
Name: "{group}\WriteAssist Dashboard"; Filename: "{app}\WriteAssistApp.exe"; Parameters: "dashboard"
Name: "{group}\Uninstall WriteAssist"; Filename: "{uninstallexe}"
Name: "{autodesktop}\WriteAssist"; Filename: "{app}\WriteAssistApp.exe"; Parameters: "run"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "WriteAssist"; \
  ValueData: """{app}\WriteAssistApp.exe"" run --no-window"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\WriteAssistApp.exe"; Parameters: "run"; Description: "Start WriteAssist now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM WriteAssistApp.exe /F"; Flags: runhidden; RunOnceId: "StopWriteAssist"
