#define MyAppName "Anaira POS"
#define MyAppVersion "1.0.1"
#define MyPublisher "Anaira Graphics & Digital Solution"

[Setup]
AppId={{8A1A5B6B-9C54-4E6C-9B1C-ANAIRAPOS2026}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyPublisher}

DefaultDirName={autopf}\Anaira POS
DefaultGroupName=Anaira POS

OutputDir=..\dist
OutputBaseFilename=Anaira-POS-Setup

Compression=lzma2
SolidCompression=yes
WizardStyle=modern

PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

DisableProgramGroupPage=yes
DisableDirPage=no

[Files]

; Complete Anaira POS project
Source: "..\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion; Excludes: ".env.local,node_modules,.next,dist,logs,phase5-backups,*.zip,installer\*"

[Dirs]
Name: "{app}\logs"

[Run]

; Configure Anaira POS, Docker, Local Supabase,
; background sync and automatic startup
Filename: "powershell.exe"; \
Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\anaira-customer-install.ps1"" -RestaurantId ""{code:GetRestaurantId}"" -CloudUrl ""{code:GetCloudUrl}"" -CloudServiceRoleKey ""{code:GetCloudServiceKey}"" -CloudAnonKey ""{code:GetCloudAnonKey}"""; \
Flags: runhidden waituntilterminated; \
StatusMsg: "Installing Anaira POS, required Windows dependencies, Local Supabase and automatic sync..."

[Code]

var
  ConfigPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  ConfigPage := CreateInputQueryPage(
    wpSelectDir,
    'Anaira POS Configuration',
    'Connect this restaurant to Anaira Cloud',
    'Enter the restaurant connection details. The installer will configure Docker, Local Supabase, Sync and POS auto-start.'
  );

  ConfigPage.Add('Restaurant ID (UUID):', False);
  ConfigPage.Add('Cloud Supabase URL:', False);
  ConfigPage.Add('Cloud Service Role Key:', True);
  ConfigPage.Add('Cloud Anon Key (optional):', True);
end;

function GetRestaurantId(Param: String): String;
begin
  Result := ConfigPage.Values[0];
end;

function GetCloudUrl(Param: String): String;
begin
  Result := ConfigPage.Values[1];
end;

function GetCloudServiceKey(Param: String): String;
begin
  Result := ConfigPage.Values[2];
end;

function GetCloudAnonKey(Param: String): String;
begin
  Result := ConfigPage.Values[3];
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = ConfigPage.ID then
  begin

    if Trim(ConfigPage.Values[0]) = '' then
    begin
      MsgBox(
        'Restaurant ID is required.',
        mbError,
        MB_OK
      );
      Result := False;
    end

    else if Trim(ConfigPage.Values[1]) = '' then
    begin
      MsgBox(
        'Cloud Supabase URL is required.',
        mbError,
        MB_OK
      );
      Result := False;
    end

    else if Trim(ConfigPage.Values[2]) = '' then
    begin
      MsgBox(
        'Cloud Service Role Key is required.',
        mbError,
        MB_OK
      );
      Result := False;
    end;

  end;
end;