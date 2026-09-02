#define MyAppName "Anaira Restaurant POS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Anaira Graphics & Digital Solution"
#define MyAppExeName "Anaira Restaurant POS.exe"

[Setup]
AppId={{A7E7D9A2-8C7A-4B77-BF0B-A5D2F4E7C901}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Anaira Restaurant POS
DefaultGroupName={#MyAppName}
OutputDir=installer-build
OutputBaseFilename=Anaira-Restaurant-POS-Setup-{#MyAppVersion}
SetupIconFile=Anaira-Restaurant-POS.ico
UninstallDisplayIcon={app}\Anaira-Restaurant-POS.ico
WizardStyle=modern
WizardImageFile=Anaira-Installer-Wizard.bmp
WizardSmallImageFile=Anaira-Installer-Small.bmp
WizardImageStretch=no
WizardResizable=no
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
UninstallDisplayName={#MyAppName}
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
DisableWelcomePage=no

[Files]
Source: "output\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "Anaira-Installer-Wizard.bmp"; DestDir: "{tmp}"; Flags: dontcopy
Source: "Anaira-Installer-Small.bmp"; DestDir: "{tmp}"; Flags: dontcopy

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\Anaira-Restaurant-POS.ico"; WorkingDir: "{app}"
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\Anaira-Restaurant-POS.ico"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Messages]
WelcomeLabel1=Welcome to Anaira Pos
WelcomeLabel2=Premium desktop installation for your restaurant operations.
FinishedHeadingLabel=Anaira Restaurant POS is ready
FinishedLabel=Your Anaira Restaurant POS installation is complete.
