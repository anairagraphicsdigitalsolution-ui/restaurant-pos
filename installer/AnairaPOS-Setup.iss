; Anaira POS - Inno Setup Installer
; Installs the Windows POS source/runtime and provisions Node.js LTS,
; Docker Desktop, local Supabase, dependencies and automatic tasks.

#define MyAppName "Anaira POS"
#define MyAppVersion "1.0.4"
#define MyPublisher "Anaira Graphics"
#define MyExeName "AnairaPOS-Setup"

[Setup]
AppId={{7C4A2DF6-4E89-4B8A-A8EE-ANAI-RAPOS-2026}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyPublisher}
DefaultDirName={autopf}\Anaira POS
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.\output
OutputBaseFilename={#MyExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\installer-assets\AnairaPOS.ico
SetupIconFile=..\installer-assets\AnairaPOS.ico
ChangesEnvironment=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; IMPORTANT: Excludes is comma-separated. Keep development/build artifacts out of the installer.
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".next\*,node_modules\*,android\*,installer\output\*,*.log"

[Dirs]
Name: "{app}\logs"

[Icons]
Name: "{autodesktop}\Anaira POS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\installer\launch-pos.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer-assets\AnairaPOS.ico"
Name: "{group}\Anaira POS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\launch-pos.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer-assets\AnairaPOS.ico"
Name: "{group}\Anaira POS Sync Status"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\status-automatic-sync-autostart.ps1"""; WorkingDir: "{app}"

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\uninstall-anaira.ps1"""; RunOnceId: "AnairaPOSCleanup"

[Code]
var
  ConfigPage: TInputQueryWizardPage;
  InstallConfigPath: string;

function JsonEscape(const S: string): string;
var
  T: string;
begin
  T := S;
  StringChangeEx(T, '\\', '\\\\', True);
  StringChangeEx(T, '"', '\"', True);
  StringChangeEx(T, #13, '\r', True);
  StringChangeEx(T, #10, '\n', True);
  Result := T;
end;

procedure InitializeWizard;
begin
  ConfigPage := CreateInputQueryPage(
    wpSelectDir,
    'Anaira POS Cloud Setup',
    'Enter the restaurant/cloud details used by the local-first runtime.',
    'These values are written to the installed server-side environment. The service-role key is never exposed as a NEXT_PUBLIC_* variable.'
  );

  ConfigPage.Add('Restaurant UUID:', False);
  ConfigPage.Add('Supabase URL:', False);
  ConfigPage.Add('Supabase Service Role Key:', True);
  ConfigPage.Add('Supabase Anon/Public Key (optional):', True);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = ConfigPage.ID then
  begin
    if Trim(ConfigPage.Values[0]) = '' then
    begin
      MsgBox('Restaurant UUID is required.', mbError, MB_OK);
      Result := False;
      exit;
    end;

    if Trim(ConfigPage.Values[1]) = '' then
    begin
      MsgBox('Supabase URL is required.', mbError, MB_OK);
      Result := False;
      exit;
    end;

    if Trim(ConfigPage.Values[2]) = '' then
    begin
      MsgBox('Supabase Service Role Key is required for the current automatic sync worker.', mbError, MB_OK);
      Result := False;
      exit;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Json: string;
  ResultCode: Integer;
  Params: string;
begin
  if CurStep = ssPostInstall then
  begin
    InstallConfigPath := ExpandConstant('{tmp}\anaira-install-config.json');
    Json :=
      '{' +
      '"restaurantId":"' + JsonEscape(ConfigPage.Values[0]) + '",' +
      '"cloudUrl":"' + JsonEscape(ConfigPage.Values[1]) + '",' +
      '"cloudServiceRoleKey":"' + JsonEscape(ConfigPage.Values[2]) + '",' +
      '"cloudAnonKey":"' + JsonEscape(ConfigPage.Values[3]) + '"' +
      '}';

    SaveStringToFile(InstallConfigPath, Json, False);

    Params := '-NoProfile -ExecutionPolicy Bypass -File "' +
      ExpandConstant('{app}\installer\install-runtime.ps1') +
      '" -ConfigFile "' + InstallConfigPath + '"';

    if not Exec(
      ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      Params,
      ExpandConstant('{app}'),
      SW_SHOWNORMAL,
      ewWaitUntilTerminated,
      ResultCode
    ) then
    begin
      MsgBox('Anaira POS runtime installation could not be started.', mbError, MB_OK);
      exit;
    end;

    DeleteFile(InstallConfigPath);

    if ResultCode <> 0 then
      MsgBox('Anaira POS dependency/application setup failed. Check {app}\logs\installer.log for details.', mbError, MB_OK)
    else
      MsgBox('Anaira POS installation completed. The app and automatic background services are ready.', mbInformation, MB_OK);
  end;
end;
