; Inno Setup 6 — 쉬운 음악 만들기 설치 파일 (결정 72)
; CI: iscc /DAppVersion=<버전> desktop\installer.iss   (레포 루트에서, 먼저 PyInstaller 빌드)
; - 관리자 권한 없이 사용자 폴더에 설치, 한국어 화면, 바탕화면 · 시작 메뉴 바로가기, 지우기
; - WebView2가 없으면 설치 중에 Microsoft 설치기(함께 넣음)로 받음

#define AppName "쉬운 음악 만들기"
#define AppExe "EasyMusic.exe"
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{6F3B2C1E-8A4D-4E57-9B2A-3C7D5E9F1A20}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=쉬운 음악 만들기
DefaultDirName={localappdata}\Programs\EasyMusic
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\build\installer
OutputBaseFilename=EasyMusicSetup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
; 켜져 있으면 닫고 새로 설치 (업데이트)
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Files]
Source: "..\dist\EasyMusic\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\build\redist\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedsWebView2

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "화면 구성 요소(WebView2)를 설치하고 있어요…"; Check: NeedsWebView2; Flags: waituntilterminated
Filename: "{app}\{#AppExe}"; Description: "쉬운 음악 만들기 켜기"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 노래 파일(24시간 임시) · 화면 저장소 · 갱신한 yt-dlp · 기록
Type: filesandordirs; Name: "{localappdata}\EasyMusic"

[Code]
const
  WebView2Key = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  WebView2KeyWow = 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function HasVersion(Root: Integer; Key: String): Boolean;
var
  V: String;
begin
  Result := RegQueryStringValue(Root, Key, 'pv', V) and (V <> '') and (V <> '0.0.0.0');
end;

function NeedsWebView2(): Boolean;
begin
  Result := not (HasVersion(HKLM, WebView2KeyWow) or HasVersion(HKLM, WebView2Key) or HasVersion(HKCU, WebView2Key));
end;
