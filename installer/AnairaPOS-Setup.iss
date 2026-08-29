; Anaira POS — Premium Windows Installer
; Professional guided setup with Anaira account login and optional custom Supabase.

#define MyAppName "Anaira POS"
#define MyAppVersion "1.2.0"
#define MyPublisher "Anaira Graphics"
#define MyExeName "AnairaPOS-Setup"
#define AnairaPortalUrl "https://www.anairapos.in"

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
WizardImageFile=..\installer-assets\AnairaPOS-Wizard.bmp
WizardSmallImageFile=..\installer-assets\AnairaPOS-WizardSmall.bmp
SetupIconFile=..\installer-assets\AnairaPOS.ico
UninstallDisplayIcon={app}\installer-assets\AnairaPOS.ico
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64
ChangesEnvironment=yes
DisableWelcomePage=no

[Messages]
WelcomeLabel1=Welcome to Anaira POS
WelcomeLabel2=Premium business operations with billing, kitchen, delivery and offline-first sync.%n%nSign in with your Anaira business account to configure this computer automatically, or use Advanced Setup for your own Supabase project.
SelectDirLabel3=Choose where Anaira POS should be installed.%n%nYour application data and local database remain on this computer.
InstallingLabel=Installing Anaira POS
InstallingTitle=Installing Anaira POS
FinishedHeadingLabel=Anaira POS is ready
FinishedLabel=Setup is complete. Your local runtime and automatic sync services have been configured.

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".next\*,node_modules\*,android\*,installer\output\*,*.log,*.tmp,*.bak,*.backup,supabase\.temp\*,supabase\.branches\*,phase5-backups\*"

[Dirs]
Name: "{app}\logs"

[Icons]
Name: "{autodesktop}\Anaira POS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\installer\launch-pos.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer-assets\AnairaPOS.ico"
Name: "{group}\Anaira POS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\launch-pos.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer-assets\AnairaPOS.ico"
Name: "{group}\Anaira POS Sync Status"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\status-automatic-sync-autostart.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\installer-assets\AnairaPOS.ico"

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\uninstall-anaira.ps1"""; RunOnceId: "AnairaPOSCleanup"

[Code]
var
  ModePage: TInputOptionWizardPage;
  LoginPage: TInputQueryWizardPage;
  CustomPage: TInputQueryWizardPage;
  SuperAdminOptionPage: TInputOptionWizardPage;
  SuperAdminPage: TInputQueryWizardPage;
  AuthConfigPath: string;
  InstallConfigPath: string;
  ModeIndex: Integer;

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
  ModePage := CreateInputOptionPage(wpSelectDir,
    'Choose your setup',
    'Select how this computer should connect to Anaira POS.',
    'Anaira will configure the selected mode automatically.',
    True, False);
  ModePage.Add('Sign in with Anaira Account');
  ModePage.Add('Advanced — Use my own Supabase');
  ModePage.SelectedValueIndex := 0;

  LoginPage := CreateInputQueryPage(ModePage.ID,
    'Secure Anaira Account Sign In',
    'Connect this installation to your restaurant account.',
    'Your Restaurant UUID is resolved automatically after successful sign-in. You do not need to enter it manually.');
  LoginPage.Add('Email:', False);
  LoginPage.Add('Password:', True);

  CustomPage := CreateInputQueryPage(ModePage.ID,
    'Advanced Supabase Setup',
    'Use your own Supabase project.',
    'Provide the project connection details. The database structure can be applied from the bundled migrations; existing application data is not copied by the installer.');
  CustomPage.Add('Supabase Project URL:', False);
  CustomPage.Add('Supabase Project Ref:', False);
  CustomPage.Add('Supabase Anon/Public Key:', False);
  CustomPage.Add('Supabase Service Role Key (needed only for Super Admin):', True);
  CustomPage.Add('Supabase Database Password:', True);
  CustomPage.Add('Existing Business / Restaurant ID (optional):', False);

  SuperAdminOptionPage := CreateInputOptionPage(CustomPage.ID,
    'Optional Super Admin Setup',
    'Create the first Super Admin in this Supabase project.',
    'Leave this unchecked when connecting to an existing installation. If selected, the installer creates a confirmed Auth user and a public.profiles row with role super_admin. A Restaurant UUID may be left blank so the Super Admin can create restaurants later from the software.',
    True, False);
  SuperAdminOptionPage.Add('Create Super Admin account now');
  SuperAdminOptionPage.SelectedValueIndex := 0;
  SuperAdminOptionPage.Values[0] := False;

  SuperAdminPage := CreateInputQueryPage(SuperAdminOptionPage.ID,
    'Create Super Admin',
    'Create the first administrator for this custom Supabase project.',
    'This account is created only in the custom Supabase project you entered.');
  SuperAdminPage.Add('Super Admin Email:', False);
  SuperAdminPage.Add('Super Admin Password (8+ characters):', True);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  ModeIndex := ModePage.SelectedValueIndex;
  if PageID = LoginPage.ID then Result := ModeIndex <> 0;
  if PageID = CustomPage.ID then Result := ModeIndex <> 1;
  if PageID = SuperAdminOptionPage.ID then Result := ModeIndex <> 1;
  if PageID = SuperAdminPage.ID then Result := (ModeIndex <> 1) or (not SuperAdminOptionPage.Values[0]);
end;

function RunPowerShell(const ScriptPath, Arguments, WorkDir: string; var ExitCode: Integer): Boolean;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath + '" ' + Arguments,
    WorkDir, SW_SHOWNORMAL, ewWaitUntilTerminated, ExitCode);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = LoginPage.ID then begin
    if Trim(LoginPage.Values[0]) = '' then begin
      MsgBox('Please enter your email address.', mbError, MB_OK);
      Result := False; exit;
    end;
    if LoginPage.Values[1] = '' then begin
      MsgBox('Please enter your password.', mbError, MB_OK);
      Result := False; exit;
    end;
  end;

  if CurPageID = CustomPage.ID then begin
    if Trim(CustomPage.Values[0]) = '' then begin MsgBox('Supabase Project URL is required.', mbError, MB_OK); Result := False; exit; end;
    if Trim(CustomPage.Values[1]) = '' then begin MsgBox('Supabase Project Ref is required.', mbError, MB_OK); Result := False; exit; end;
    if Trim(CustomPage.Values[2]) = '' then begin MsgBox('Supabase Anon/Public Key is required.', mbError, MB_OK); Result := False; exit; end;
    if Trim(CustomPage.Values[4]) = '' then begin MsgBox('Supabase Database Password is required for schema provisioning.', mbError, MB_OK); Result := False; exit; end;
    if SuperAdminOptionPage.Values[0] and (Trim(CustomPage.Values[3]) = '') then begin
      MsgBox('Supabase Service Role Key is required when creating a Super Admin.', mbError, MB_OK);
      Result := False; exit;
    end;
  end;

  if CurPageID = SuperAdminPage.ID then begin
    if Trim(SuperAdminPage.Values[0]) = '' then begin MsgBox('Super Admin email is required.', mbError, MB_OK); Result := False; exit; end;
    if Length(SuperAdminPage.Values[1]) < 8 then begin MsgBox('Super Admin password must be at least 8 characters.', mbError, MB_OK); Result := False; exit; end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  Params: string;
  Config: string;
  CustomConfigPath: string;
  CreateSuperAdminText: string;
begin
  if CurStep <> ssPostInstall then exit;

  InstallConfigPath := ExpandConstant('{tmp}\anaira-install-config.json');

  if ModePage.SelectedValueIndex = 0 then begin
    if not LoadStringFromFile(AuthConfigPath, Config) then begin
      MsgBox('Anaira account configuration could not be read.', mbError, MB_OK);
      exit;
    end;
    SaveStringToFile(InstallConfigPath, Config, False);
  end
  else begin
    CreateSuperAdminText := 'false';
    if SuperAdminOptionPage.Values[0] then CreateSuperAdminText := 'true';

    CustomConfigPath := ExpandConstant('{tmp}\anaira-custom.json');
    Config := '{' +
      '"success":true,' +
      '"restaurantId":"' + JsonEscape(CustomPage.Values[5]) + '",' +
      '"cloudUrl":"' + JsonEscape(CustomPage.Values[0]) + '",' +
      '"cloudAnonKey":"' + JsonEscape(CustomPage.Values[2]) + '",' +
      '"cloudServiceRoleKey":"' + JsonEscape(CustomPage.Values[3]) + '",' +
      '"accessToken":"",' +
      '"refreshToken":"",' +
      '"projectRef":"' + JsonEscape(CustomPage.Values[1]) + '",' +
      '"dbPassword":"' + JsonEscape(CustomPage.Values[4]) + '",' +
      '"createSuperAdmin":' + CreateSuperAdminText + ',' +
      '"superAdminEmail":"' + JsonEscape(SuperAdminPage.Values[0]) + '",' +
      '"superAdminPassword":"' + JsonEscape(SuperAdminPage.Values[1]) + '"' +
      '}';
    SaveStringToFile(CustomConfigPath, Config, False);
    Config := '';
    LoadStringFromFile(CustomConfigPath, Config);
    SaveStringToFile(InstallConfigPath, Config, False);
  end;

  Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\installer\install-runtime.ps1') + '" -ConfigFile "' + InstallConfigPath + '"';
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Params, ExpandConstant('{app}'), SW_SHOWNORMAL, ewWaitUntilTerminated, Code) then begin
    MsgBox('Anaira POS runtime installation could not be started.', mbError, MB_OK); exit;
  end;

  DeleteFile(AuthConfigPath);
  DeleteFile(InstallConfigPath);

  if Code <> 0 then
    MsgBox('Installation could not be completed. Please review {app}\logs\installer.log.', mbError, MB_OK)
  else
    MsgBox('Anaira POS is installed and ready. Your restaurant environment was configured successfully.', mbInformation, MB_OK);
end;
