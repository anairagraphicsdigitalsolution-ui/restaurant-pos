; Anaira POS — Premium Windows Installer
; FINAL FIXED VERSION
; Normal mode:
;   Anaira Account Email + Password
;   Restaurant UUID is resolved automatically by Anaira.
;
; Advanced mode:
;   Custom Supabase Project URL / Ref / Keys / DB password
;   Optional existing Restaurant UUID
;   Optional first Super Admin creation.

#define MyAppName "Anaira POS"
#define MyAppVersion "2.0.3"
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
WelcomeLabel2=Premium restaurant operations for billing, kitchen, delivery and offline-first sync.%n%nSign in with your Anaira account to configure this computer automatically, or use Advanced Setup for your own Supabase project.
SelectDirLabel3=Choose where Anaira POS should be installed.%n%nYour application data and local database remain on this computer.
InstallingLabel=Installing Anaira POS
InstallingTitle=Installing Anaira POS
FinishedHeadingLabel=Anaira POS is ready
FinishedLabel=Setup is complete. Your local runtime and automatic sync services have been configured.

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Clean explicit file list: no recursive project copy, no node_modules/.gradle/build/output/backups.
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-lock.json"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\next.config.js"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\next.config.mjs"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\tsconfig.json"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\jsconfig.json"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\postcss.config.js"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\postcss.config.mjs"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\tailwind.config.js"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\eslint.config.mjs"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\.env.example"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

Source: "..\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\components\*"; DestDir: "{app}\components"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\lib\*"; DestDir: "{app}\lib"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\android-native\*"; DestDir: "{app}\android-native"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\supabase\migrations\*"; DestDir: "{app}\supabase\migrations"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\supabase\config.toml"; DestDir: "{app}\supabase"; Flags: ignoreversion skipifsourcedoesntexist

Source: ".\anaira-installer-auth.ps1"; DestDir: "{tmp}"; Flags: dontcopy skipifsourcedoesntexist
Source: ".\install-runtime.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: ".\launch-pos.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: ".\launch-pos-background.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion skipifsourcedoesntexist
Source: ".\uninstall-anaira.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: ".\anaira-installer-auth.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion skipifsourcedoesntexist
Source: ".\README-INNO-SETUP.md"; DestDir: "{app}\installer"; Flags: ignoreversion skipifsourcedoesntexist
Source: ".\README-INSTALLER-HI.md"; DestDir: "{app}\installer"; Flags: ignoreversion skipifsourcedoesntexist

Source: "..\installer-assets\AnairaPOS.ico"; DestDir: "{app}\installer-assets"; Flags: ignoreversion
Source: "..\installer-assets\AnairaPOS-Wizard.bmp"; DestDir: "{app}\installer-assets"; Flags: ignoreversion
Source: "..\installer-assets\AnairaPOS-WizardSmall.bmp"; DestDir: "{app}\installer-assets"; Flags: ignoreversion

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
  StringChangeEx(T, '\', '\\', True);
  StringChangeEx(T, '"', '\"', True);
  StringChangeEx(T, #13, '\r', True);
  StringChangeEx(T, #10, '\n', True);
  Result := T;
end;

function RunPowerShell(const ScriptPath, Arguments, WorkDir: string; var ExitCode: Integer): Boolean;
begin
  Result := Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath + '" ' + Arguments,
    WorkDir,
    SW_SHOWNORMAL,
    ewWaitUntilTerminated,
    ExitCode
  );
end;

procedure InitializeWizard;
begin
  ModePage := CreateInputOptionPage(
    wpWelcome,
    'Welcome to Anaira POS',
    'Choose how this installation should be configured.',
    'Select the normal Anaira sign-in for a managed restaurant installation, or Advanced Setup when you are connecting your own Supabase project.',
    True,
    False
  );

  ModePage.Add('Sign in with Anaira Account');
  ModePage.Add('Advanced — Use my own Supabase');
  ModePage.SelectedValueIndex := 0;

  LoginPage := CreateInputQueryPage(
    ModePage.ID,
    'Secure Anaira Account Sign In',
    'Connect this computer to your Anaira restaurant account.',
    'No Restaurant UUID is required. Anaira resolves the restaurant automatically after successful sign-in.'
  );

  LoginPage.Add('Email:', False);
  LoginPage.Add('Password:', True);

  CustomPage := CreateInputQueryPage(
    ModePage.ID,
    'Advanced Supabase Setup',
    'Connect Anaira POS to your own Supabase project.',
    'Use this only when you control the destination Supabase project. Existing application rows are not copied by the installer.'
  );

  CustomPage.Add('Supabase Project URL:', False);
  CustomPage.Add('Supabase Project Ref:', False);
  CustomPage.Add('Supabase Anon/Public Key:', False);
  CustomPage.Add('Supabase Service Role Key (only for Super Admin):', True);
  CustomPage.Add('Supabase Database Password:', True);
  CustomPage.Add('Existing Restaurant UUID (optional):', False);

  SuperAdminOptionPage := CreateInputOptionPage(
    CustomPage.ID,
    'Optional Super Admin Setup',
    'Create the first Super Admin for this Supabase project.',
    'Leave this disabled when the project already has an administrator. Enable it for a new project where the first Super Admin should be created during setup.',
    True,
    False
  );

  SuperAdminOptionPage.Add('Create Super Admin account now');
  SuperAdminOptionPage.SelectedValueIndex := 0;
  SuperAdminOptionPage.Values[0] := False;

  SuperAdminPage := CreateInputQueryPage(
    SuperAdminOptionPage.ID,
    'Create Super Admin',
    'Create the first administrator account.',
    'The account will be created in the Supabase project selected on the previous page.'
  );

  SuperAdminPage.Add('Super Admin Email:', False);
  SuperAdminPage.Add('Super Admin Password (8+ characters):', True);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  ModeIndex := ModePage.SelectedValueIndex;

  if PageID = LoginPage.ID then
    Result := ModeIndex <> 0;

  if PageID = CustomPage.ID then
    Result := ModeIndex <> 1;

  if PageID = SuperAdminOptionPage.ID then
    Result := ModeIndex <> 1;

  if PageID = SuperAdminPage.ID then
    Result := (ModeIndex <> 1) or (not SuperAdminOptionPage.Values[0]);
end;

function AuthenticateAnairaAccount: Boolean;
var
  ExitCode: Integer;
  ScriptPath: string;
  Args: string;
begin
  Result := False;

  AuthConfigPath := ExpandConstant('{tmp}\anaira-account-auth.json');
  ScriptPath := ExpandConstant('{tmp}\anaira-installer-auth.ps1');
  ExtractTemporaryFile('anaira-installer-auth.ps1');

  if not FileExists(ScriptPath) then
  begin
    MsgBox(
      'Anaira account authentication component is missing from the installer.',
      mbError,
      MB_OK
    );
    exit;
  end;

  Args :=
    '-Email "' + LoginPage.Values[0] + '" ' +
    '-Password "' + LoginPage.Values[1] + '" ' +
    '-OutputFile "' + AuthConfigPath + '" ' +
    '-PortalUrl "' + '{#AnairaPortalUrl}' + '"';

  if not RunPowerShell(ScriptPath, Args, ExpandConstant('{tmp}'), ExitCode) then
  begin
    MsgBox(
      'Anaira account authentication could not be started.',
      mbError,
      MB_OK
    );
    exit;
  end;

  if ExitCode <> 0 then
  begin
    MsgBox(
      'Anaira account sign-in failed. Please verify your email/password and internet connection.',
      mbError,
      MB_OK
    );
    exit;
  end;

  if not FileExists(AuthConfigPath) then
  begin
    MsgBox(
      'Anaira account authentication completed but returned no configuration.',
      mbError,
      MB_OK
    );
    exit;
  end;

  Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = LoginPage.ID then
  begin
    if Trim(LoginPage.Values[0]) = '' then
    begin
      MsgBox('Please enter your email address.', mbError, MB_OK);
      Result := False;
      exit;
    end;

    if LoginPage.Values[1] = '' then
    begin
      MsgBox('Please enter your password.', mbError, MB_OK);
      Result := False;
      exit;
    end;

    Result := AuthenticateAnairaAccount;
    exit;
  end;

  if CurPageID = CustomPage.ID then
  begin
    if Trim(CustomPage.Values[0]) = '' then
    begin
      MsgBox('Supabase Project URL is required.', mbError, MB_OK);
      Result := False;
      exit;
    end;

    if Trim(CustomPage.Values[1]) = '' then
    begin
      MsgBox('Supabase Project Ref is required.', mbError, MB_OK);
      Result := False;
      exit;
    end;

    if Trim(CustomPage.Values[2]) = '' then
    begin
      MsgBox('Supabase Anon/Public Key is required.', mbError, MB_OK);
      Result := False;
      exit;
    end;

    if Trim(CustomPage.Values[4]) = '' then
    begin
      MsgBox(
        'Supabase Database Password is required for schema provisioning.',
        mbError,
        MB_OK
      );
      Result := False;
      exit;
    end;

    if SuperAdminOptionPage.Values[0] and (Trim(CustomPage.Values[3]) = '') then
    begin
      MsgBox(
        'Supabase Service Role Key is required when creating a Super Admin.',
        mbError,
        MB_OK
      );
      Result := False;
      exit;
    end;

    exit;
  end;

  if CurPageID = SuperAdminPage.ID then
  begin
    if Trim(SuperAdminPage.Values[0]) = '' then
    begin
      MsgBox('Super Admin email is required.', mbError, MB_OK);
      Result := False;
      exit;
    end;

    if Length(SuperAdminPage.Values[1]) < 8 then
    begin
      MsgBox(
        'Super Admin password must be at least 8 characters.',
        mbError,
        MB_OK
      );
      Result := False;
      exit;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  Params: string;
  Config: string;
  CreateSuperAdminText: string;
begin
  if CurStep <> ssPostInstall then
    exit;

  InstallConfigPath := ExpandConstant('{tmp}\anaira-install-config.json');

  if ModePage.SelectedValueIndex = 0 then
  begin
    if (AuthConfigPath = '') or (not FileExists(AuthConfigPath)) then
    begin
      MsgBox(
        'Anaira account configuration is missing. Please restart setup and sign in again.',
        mbError,
        MB_OK
      );
      exit;
    end;

    // Pass the authenticated config directly to the runtime installer.
    // No LoadStringFromFile/JSON parsing is required inside Inno Setup.
    InstallConfigPath := AuthConfigPath;
  end
  else
  begin
    CreateSuperAdminText := 'false';

    if SuperAdminOptionPage.Values[0] then
      CreateSuperAdminText := 'true';

    Config :=
      '{' +
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

    SaveStringToFile(InstallConfigPath, Config, False);
  end;

  Params :=
    '-NoProfile -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{app}\installer\install-runtime.ps1') +
    '" -ConfigFile "' + InstallConfigPath + '"';

  if not Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Params,
    ExpandConstant('{app}'),
    SW_SHOWNORMAL,
    ewWaitUntilTerminated,
    Code
  ) then
  begin
    MsgBox(
      'Anaira POS runtime installation could not be started.',
      mbError,
      MB_OK
    );
    exit;
  end;

  DeleteFile(AuthConfigPath);
  if InstallConfigPath <> AuthConfigPath then
    DeleteFile(InstallConfigPath);

  if Code <> 0 then
  begin
    MsgBox(
      'Installation could not be completed. Please review {app}\logs\installer.log.',
      mbError,
      MB_OK
    );
  end
  else
  begin
    MsgBox(
      'Anaira POS is installed and ready.',
      mbInformation,
      MB_OK
    );
  end;
end;
