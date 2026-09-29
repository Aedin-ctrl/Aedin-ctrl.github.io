# LectureNotes installer for Windows - https://www.aedinlai.com
#
#   irm https://www.aedinlai.com/install-lecturenotes.ps1 | iex
#
# Installs LectureNotes and everything it needs to actually work:
#   1. LectureNotes, compiled on this PC from its source code into a
#      "LectureNotes App" folder on your Desktop (+ Start menu shortcut).
#      The free build tools (~240 MB) are downloaded once and kept for next
#      time. If the build fails for any reason, the ready-made app is used.
#   2. Ollama                (runs the language model locally)
#   3. The speech + language models themselves (~4.5 GB)
# No administrator rights needed. Windows records your computer's sound
# natively, so unlike the Mac version there's no audio driver to install.
#
# Safe to re-run: anything already installed is detected and skipped.
#
# Read before running - you should never pipe a script into your shell
# without looking at it first:
#   irm https://www.aedinlai.com/install-lecturenotes.ps1

& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Windows PowerShell's progress bar makes downloads crawl
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# Where to fetch LectureNotes from. Overridable so the installer can be
# tested against a local copy of the site before anything goes live.
$BaseUrl = if ($env:LECTURENOTES_BASE_URL) { $env:LECTURENOTES_BASE_URL } else { 'https://www.aedinlai.com' }

# Filled in by LectureNotes' scripts/release-windows.sh each time a new
# build is published, so they always match the files next to this script.
$SourceSha256 = 'fdace09f029d3527189f1608c33aeb21ae7beceb497e0d9f4c17abe08a4fd192'
$AppSha256 = @{
    'x64'   = '67a2a57f37604f11a249dc8beea7648ac40e6232945a94f04ff41aded6c04457'
    'arm64' = '5199c294a52576982a45619140f4f4f9726c850838adf0cdd6dee51189b1fc94'
}

# The free, open-source build tools, pinned by checksum. LLVM/Clang via
# llvm-mingw (https://github.com/mstorsjo/llvm-mingw), CMake, and Ninja.
$Tools = @{
    'x64' = @(
        @{ Name = 'llvm-mingw'; Url = 'https://github.com/mstorsjo/llvm-mingw/releases/download/20260922/llvm-mingw-20260922-ucrt-x86_64.zip'; Sha = 'e3ad77d117a4bea19a7a3b333341824d79a5a371004a10e25b8504e7b3047666'; Dir = 'llvm-mingw-20260922-ucrt-x86_64' },
        @{ Name = 'cmake'; Url = 'https://github.com/Kitware/CMake/releases/download/v4.4.3/cmake-4.4.3-windows-x86_64.zip'; Sha = '4d52ebab7193a698651639ed80d8d04fd903358843572cf44c7fd234cb7c26ab'; Dir = 'cmake-4.4.3-windows-x86_64' },
        @{ Name = 'ninja'; Url = 'https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip'; Sha = '07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65'; Dir = '' }
    )
    'arm64' = @(
        @{ Name = 'llvm-mingw'; Url = 'https://github.com/mstorsjo/llvm-mingw/releases/download/20260922/llvm-mingw-20260922-ucrt-aarch64.zip'; Sha = 'a317514a7a63badd692032c0c2b8e165f630bbaebbe7a3254348051f43a64949'; Dir = 'llvm-mingw-20260922-ucrt-aarch64' },
        @{ Name = 'cmake'; Url = 'https://github.com/Kitware/CMake/releases/download/v4.4.3/cmake-4.4.3-windows-arm64.zip'; Sha = '7b410ddd00e24c7250eec7452da2348a4a70437aa87e9cda0a20d6a85662fcff'; Dir = 'cmake-4.4.3-windows-arm64' },
        @{ Name = 'ninja'; Url = 'https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-winarm64.zip'; Sha = 'e52f0bdef9dfb1003229dbd6508a508c4073fd017247002adc66e5e806cb0391'; Dir = '' }
    )
}
# PDFium (reads uploaded PDFs), prebuilt by pdfium-binaries.
$Pdfium = @{
    'x64'   = @{ Url = 'https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/8066/pdfium-win-x64.tgz'; Sha = '739a57d597d864297909cc40a2411eba728490c76a0fa25e3ea299c7f6b07020' }
    'arm64' = @{ Url = 'https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/8066/pdfium-win-arm64.tgz'; Sha = '5d04b6d0281e78613ef836dea2e0fefe6831f3ae92b3573e8fdf55330de67d3d' }
}

# Named "LectureNotes App" so it never merges with an existing "lecturenotes"
# folder (e.g. a Mac Desktop shared into a virtual machine).
$Desktop     = [Environment]::GetFolderPath('Desktop')
# In a Parallels VM the Desktop is usually the Mac's Desktop shared into
# Windows (C:\Mac\Home\Desktop), and writing the app there through the share
# can stall the VM (worse if the Mac syncs its Desktop with iCloud). Keep the
# app on the PC's own disk in that case; the Start menu entry still finds it.
$OnMacShare  = $Desktop -like 'C:\Mac\*' -or $Desktop -like '\\Mac\*'
$InstallDir  = if ($env:LECTURENOTES_INSTALL_DIR) { $env:LECTURENOTES_INSTALL_DIR }
               elseif ($OnMacShare) { Join-Path $env:LOCALAPPDATA 'LectureNotes App' }
               else { Join-Path $Desktop 'LectureNotes App' }
$AppExe      = Join-Path $InstallDir 'LectureNotes.exe'
$OldInstall  = Join-Path $env:LOCALAPPDATA 'Programs\LectureNotes'   # where the first beta installed
$WorkRoot    = Join-Path $env:LOCALAPPDATA 'LectureNotes'
$ToolsRoot   = Join-Path $WorkRoot 'buildtools'
$OllamaDir   = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
$OllamaExe   = Join-Path $OllamaDir 'ollama.exe'
$OllamaApp   = Join-Path $OllamaDir 'ollama app.exe'
$OllamaSetup = 'https://ollama.com/download/OllamaSetup.exe'
$OllamaModels = @('qwen3.5:4b')   # one multimodal model covers both Q&A and the camera feature
# q8_0 (not the Mac's q5_0): about 3x faster on ARM CPUs thanks to ggml's
# int8 kernels, at least as fast on x64, and more accurate.
$WhisperUrl  = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin'
$WhisperDir  = Join-Path $WorkRoot 'models'
$WhisperDest = Join-Path $WhisperDir 'ggml-large-v3-turbo-q8_0.bin'
$WhisperOld  = Join-Path $WhisperDir 'ggml-large-v3-turbo-q5_0.bin'   # earlier betas
# Much faster English model the app switches to on PCs too slow for the main
# one to keep up in real time (about 5x faster on a 4-core laptop CPU).
$FastUrl     = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin'
$FastDest    = Join-Path $WhisperDir 'ggml-small.en-q5_1.bin'

function Step($t)  { Write-Host "==> $t" -ForegroundColor Cyan }
function Info($t)  { Write-Host "    $t" -ForegroundColor DarkGray }
function Ok($t)    { Write-Host "    done " -ForegroundColor Green -NoNewline; Write-Host $t -ForegroundColor DarkGray }
function Fail($t)  { Write-Host "error: $t" -ForegroundColor Red; throw 'LectureNotes install stopped.' }

# Big downloads: curl.exe (built into Windows 10 1803+) shows real progress;
# Invoke-WebRequest is the fallback. Neither adds the "downloaded from the
# internet" mark that makes SmartScreen interrupt.
function Download($url, $dest) {
    # Native tools write progress to stderr; if output is ever redirected,
    # Windows PowerShell would turn that into terminating errors under
    # 'Stop'. Exit codes are checked explicitly instead.
    $ErrorActionPreference = 'Continue'
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (Test-Path $curl) {
        # --ssl-revoke-best-effort: school and office networks often block
        # certificate revocation lookups, which otherwise fails every download.
        & $curl -fL --ssl-revoke-best-effort --progress-bar -o $dest $url
        if ($LASTEXITCODE -eq 0) { return }
        Remove-Item $dest -Force -ErrorAction SilentlyContinue
        Write-Host '    (retrying the download another way)' -ForegroundColor DarkGray
    }
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    } catch {
        throw "Could not download $url ($($_.Exception.Message))"
    }
}

function CheckSha($file, $expected, $what) {
    $actual = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower()
    if ($actual -ne $expected) { throw "$what didn't match its expected checksum; not using it." }
}

# tar.exe (built into Windows 10 1803+) unpacks zips far faster than
# Expand-Archive, which matters for the 180 MB compiler.
function Unpack($archive, $dest) {
    $ErrorActionPreference = 'Continue'   # see Download
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path $tar) {
        & $tar -xf $archive -C $dest
        if ($LASTEXITCODE -ne 0) { throw "Could not unpack $archive" }
    } else {
        Expand-Archive -Path $archive -DestinationPath $dest -Force
    }
}

function OllamaUp {
    try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

# Downloads + unpacks one build tool into $ToolsRoot (skipped if already
# there from an earlier run) and returns its folder.
function EnsureTool($tool, $temp) {
    $root = Join-Path $ToolsRoot $tool.Name
    $marker = Join-Path $root ('.ok-' + $tool.Sha.Substring(0, 12))
    if (-not (Test-Path $marker)) {
        Info "Downloading $($tool.Name)"
        $zip = Join-Path $temp ($tool.Name + '.zip')
        Download $tool.Url $zip
        CheckSha $zip $tool.Sha $tool.Name
        if (Test-Path $root) { Remove-Item -Recurse -Force $root }
        Unpack $zip $root
        Remove-Item $zip -ErrorAction SilentlyContinue
        New-Item -ItemType File -Path $marker -Force | Out-Null
    }
    if ($tool.Dir) { return (Join-Path $root $tool.Dir) }
    return $root   # ninja's zip has no top-level folder
}

# Compiles LectureNotes from source into $outDir. Throws on any failure.
function BuildFromSource($arch, $temp, $outDir) {
    Info 'Getting the build tools (about 240 MB, downloaded once and kept)'
    $paths = @{}
    foreach ($tool in $Tools[$arch]) { $paths[$tool.Name] = EnsureTool $tool $temp }
    $llvm = $paths['llvm-mingw']
    $cmake = Join-Path $paths['cmake'] 'bin\cmake.exe'
    $ninja = Join-Path $paths['ninja'] 'ninja.exe'

    Info 'Downloading the LectureNotes source code'
    $srcZip = Join-Path $temp 'LectureNotes-src.zip'
    Download "$BaseUrl/downloads/LectureNotes-windows-src.zip" $srcZip
    CheckSha $srcZip $SourceSha256 'The LectureNotes source code'
    $srcRoot = Join-Path $WorkRoot 'source'
    if (Test-Path $srcRoot) { Remove-Item -Recurse -Force $srcRoot }
    Unpack $srcZip $srcRoot
    $src = Join-Path $srcRoot 'LectureNotes-src'

    Info 'Compiling LectureNotes (a few minutes)'
    $build = Join-Path $WorkRoot 'build'
    if (Test-Path $build) { Remove-Item -Recurse -Force $build }
    $env:PATH = (Join-Path $llvm 'bin') + ';' + $env:PATH
    $log = Join-Path $WorkRoot 'build.log'
    # Windows PowerShell turns a redirected native command's stderr (compiler
    # warnings) into errors; with 'Stop' the first warning would abort the
    # build. Exit codes are checked explicitly instead.
    $ErrorActionPreference = 'Continue'
    # CMake reads backslashes in -D values as escapes ("\U" in C:\Users), so
    # every path it gets uses forward slashes.
    function Fwd($p) { $p -replace '\\', '/' }
    & $cmake -S (Fwd $src) -B (Fwd $build) -G Ninja "-DCMAKE_MAKE_PROGRAM=$(Fwd $ninja)" `
        "-DCMAKE_C_COMPILER=$(Fwd (Join-Path $llvm 'bin\clang.exe'))" `
        "-DCMAKE_CXX_COMPILER=$(Fwd (Join-Path $llvm 'bin\clang++.exe'))" `
        "-DCMAKE_RC_COMPILER=$(Fwd (Join-Path $llvm 'bin\windres.exe'))" `
        -DCMAKE_BUILD_TYPE=Release -DFETCHCONTENT_FULLY_DISCONNECTED=ON -DLN_NATIVE_CPU=ON *> $log
    if ($LASTEXITCODE -ne 0) { throw "Configuring the build failed (details in $log)" }
    & $cmake --build $build --parallel $env:NUMBER_OF_PROCESSORS *>> $log
    if ($LASTEXITCODE -ne 0) { throw "Compiling failed (details in $log)" }
    $exe = Join-Path $build 'LectureNotes.exe'
    if (-not (Test-Path $exe)) { throw "The build finished but LectureNotes.exe is missing (details in $log)" }

    $pdfTgz = Join-Path $temp 'pdfium.tgz'
    Download $Pdfium[$arch].Url $pdfTgz
    CheckSha $pdfTgz $Pdfium[$arch].Sha 'PDFium'
    Unpack $pdfTgz (Join-Path $temp 'pdfium')

    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    Copy-Item $exe $outDir -Force
    Copy-Item (Join-Path $temp 'pdfium\bin\pdfium.dll') $outDir -Force
    Copy-Item (Join-Path $src 'resources\windows\THIRD_PARTY_NOTICES.txt') $outDir -Force
}

# An uninstaller in the app folder, also listed in Settings > Apps (per user,
# no admin). It removes what this script put on the PC, keeps the user's
# notes (Documents\LectureNotes), and leaves Ollama, which has its own entry.
function InstallUninstaller {
    $appLiteral = $InstallDir -replace "'", "''"
    $script = @'
# Removes LectureNotes from this PC. Notes in Documents\LectureNotes are kept.
$ErrorActionPreference = 'Continue'
$app = '__APP__'
Write-Host 'Uninstalling LectureNotes...'
Get-Process -Name 'LectureNotes' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
$programs = [Environment]::GetFolderPath('Programs')
if ($programs) { Remove-Item (Join-Path $programs 'LectureNotes.lnk') -Force -ErrorAction SilentlyContinue }
# Build tools, speech models, logs and settings (only this app's own folder).
if ($env:LOCALAPPDATA) {
    $data = Join-Path $env:LOCALAPPDATA 'LectureNotes'
    if (Test-Path $data) { Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue }
}
Remove-Item 'HKCU:\Software\LectureNotes' -Recurse -Force -ErrorAction SilentlyContinue
cmdkey.exe /delete:LectureNotes/AnthropicAPIKey 2>&1 | Out-Null
$ollama = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' } else { '' }
if ($ollama -and (Test-Path $ollama)) {
    $answer = Read-Host 'Also delete the AI model LectureNotes downloaded into Ollama (qwen3.5, about 3.4 GB)? [y/N]'
    if ($answer -match '^(y|yes)$') {
        & $ollama rm qwen3.5:4b 2>&1 | Out-Null
        & $ollama rm qwen3.5:9b 2>&1 | Out-Null
    }
}
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LectureNotes' -Recurse -Force -ErrorAction SilentlyContinue
# The app's own files last (this script is one of them), then the folder if
# nothing else is in it.
Set-Location $env:TEMP
if ($app -and (Test-Path -LiteralPath (Join-Path $app 'LectureNotes.exe'))) {
    foreach ($f in 'LectureNotes.exe', 'pdfium.dll', 'THIRD_PARTY_NOTICES.txt', 'Uninstall LectureNotes.cmd', 'uninstall.ps1') {
        Remove-Item -LiteralPath (Join-Path $app $f) -Force -ErrorAction SilentlyContinue
    }
    if (-not (Get-ChildItem -LiteralPath $app -Force -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $app -Force -ErrorAction SilentlyContinue }
}
Write-Host ''
Write-Host 'LectureNotes is uninstalled. Your notes in Documents\LectureNotes were kept.' -ForegroundColor Green
Write-Host 'Ollama is still installed; remove it from Settings > Apps if you no longer need it.'
Read-Host 'Press Enter to close'
'@
    $script = $script.Replace('__APP__', $appLiteral)
    $ps1 = Join-Path $InstallDir 'uninstall.ps1'
    [IO.File]::WriteAllText($ps1, $script, (New-Object Text.UTF8Encoding $true))
    $command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
    # Relative to itself, so it works whatever characters the path contains.
    Set-Content -Path (Join-Path $InstallDir 'Uninstall LectureNotes.cmd') -Encoding ASCII `
        -Value '@powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"'
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LectureNotes'
    New-Item -Path $key -Force | Out-Null
    $values = @{
        DisplayName = 'LectureNotes'; DisplayIcon = $AppExe; Publisher = 'aedinlai.com'
        DisplayVersion = (Get-Date -Format 'yyyy.M.d'); InstallLocation = $InstallDir
        UninstallString = $command; URLInfoAbout = 'https://www.aedinlai.com'
    }
    foreach ($name in $values.Keys) { Set-ItemProperty -Path $key -Name $name -Value $values[$name] }
    Set-ItemProperty -Path $key -Name NoModify -Value 1 -Type DWord
    Set-ItemProperty -Path $key -Name NoRepair -Value 1 -Type DWord
}

# The ready-made app, if building isn't possible on this PC.
function InstallPrebuilt($arch, $temp, $outDir) {
    $zip = Join-Path $temp 'LectureNotes.zip'
    Download "$BaseUrl/downloads/LectureNotes-windows-$arch.zip" $zip
    CheckSha $zip $AppSha256[$arch] 'The LectureNotes download'
    $unpacked = Join-Path $temp 'app'
    Unpack $zip $unpacked
    if (-not (Test-Path (Join-Path $unpacked 'LectureNotes.exe'))) { throw 'No LectureNotes.exe inside the downloaded archive.' }
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    Copy-Item -Path (Join-Path $unpacked '*') -Destination $outDir -Recurse -Force
}

try {
    # --- preflight ----------------------------------------------------------
    $build = [Environment]::OSVersion.Version.Build
    if ($build -lt 19045) {
        Fail "LectureNotes needs Windows 10 22H2 or Windows 11 (this PC is build $build). Run Windows Update, then try again."
    }
    $arch = 'x64'
    try {
        $os = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
        if ($os -eq 'Arm64') { $arch = 'arm64' }
    } catch {
        if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'arm64' }
    }

    Write-Host ''
    Write-Host 'LectureNotes installer' -ForegroundColor White
    Write-Host 'Builds the app on your PC, then installs Ollama and ~4.5 GB of speech and language models.' -ForegroundColor DarkGray
    Write-Host 'Everything runs locally on your PC. No administrator password needed.' -ForegroundColor DarkGray
    Write-Host ''

    # Smart App Control (some new Windows 11 PCs) blocks apps that aren't
    # signed by a known publisher, with no "run anyway" option -- including
    # apps built on the PC itself. Say so up front instead of failing later.
    $sac = $null
    try { $sac = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -ErrorAction Stop).VerifiedAndReputablePolicyState } catch {}
    if ($sac -eq 1) {
        Write-Host 'Heads up: Smart App Control is on for this PC. It blocks apps that are not code-signed,' -ForegroundColor Yellow
        Write-Host 'and this early version of LectureNotes is not signed yet, so Windows may refuse to open it.' -ForegroundColor Yellow
        Write-Host 'The only fix is Windows Security > App & browser control > Smart App Control settings > Off.' -ForegroundColor Yellow
        Write-Host '(Windows does not let you turn it back on later without resetting the PC, so it is your call.)' -ForegroundColor Yellow
        Write-Host ''
    }

    $temp = Join-Path ([IO.Path]::GetTempPath()) ("lectureNotes-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null

    # --- 1. the app ---------------------------------------------------------
    Step "Building LectureNotes on this PC ($arch)"
    # Replacing files under a running copy fails on Windows; ask it to close.
    $running = Get-Process -Name 'LectureNotes' -ErrorAction SilentlyContinue
    if ($running) {
        Info 'Closing the running copy of LectureNotes'
        # Ask it to close (it saves a lecture in progress), then wait for it.
        try {
            Add-Type -Namespace LectureNotesSetup -Name Win -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string cls, string title);
[DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
'@
            $hwnd = [LectureNotesSetup.Win]::FindWindowW('LectureNotesWindow', [NullString]::Value)
            if ($hwnd -ne [IntPtr]::Zero) { [LectureNotesSetup.Win]::PostMessageW($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
        } catch {}
        $running | ForEach-Object { $_.WaitForExit(15000) | Out-Null }
        Get-Process -Name 'LectureNotes' -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 1
    }
    $staging = Join-Path $temp 'out'
    $how = 'built on this PC'
    if ($env:LECTURENOTES_PREBUILT -eq '1') {
        InstallPrebuilt $arch $temp $staging
        $how = 'ready-made'
    } else {
        try {
            BuildFromSource $arch $temp $staging
        } catch {
            $why = if ($_.Exception.Message) { $_.Exception.Message } else { $_ | Out-String }
            Write-Host "    Couldn't build it here: $why" -ForegroundColor Yellow
            Info 'Using the ready-made app instead.'
            if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
            InstallPrebuilt $arch $temp $staging
            $how = 'ready-made'
        }
    }
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $staging '*') -Destination $InstallDir -Recurse -Force
    # The first beta installed under Programs; one copy is enough.
    if (Test-Path $OldInstall) { Remove-Item -Recurse -Force $OldInstall -ErrorAction SilentlyContinue }

    # Start menu shortcut, so it can be found again later.
    $programs = [Environment]::GetFolderPath('Programs')
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path $programs 'LectureNotes.lnk'))
    $link.TargetPath = $AppExe
    $link.WorkingDirectory = $InstallDir
    $link.Description = 'LectureNotes: live lecture transcription and answers'
    $link.Save()
    InstallUninstaller
    Ok "$InstallDir ($how)"

    # --- 2. Ollama ----------------------------------------------------------
    Step 'Ollama'
    if (Test-Path $OllamaExe) {
        Ok 'already installed'
    } else {
        Info 'Downloading and installing Ollama (this is a large download)'
        $setup = Join-Path $temp 'OllamaSetup.exe'
        Download $OllamaSetup $setup
        # Only run it if it's genuinely Ollama's signed installer.
        $sig = Get-AuthenticodeSignature -FilePath $setup
        if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch '(^|, )O=Ollama Inc\.(,|$)') {
            Fail "The Ollama installer's signature didn't check out. Not running it."
        }
        # This marker (what Ollama's own install script uses) makes Ollama
        # start hidden after installing instead of opening its window.
        $marker = Join-Path $env:LOCALAPPDATA 'Ollama'
        New-Item -ItemType Directory -Path $marker -Force | Out-Null
        New-Item -ItemType File -Path (Join-Path $marker 'upgraded') -Force | Out-Null
        # Wait for the installer only, not for the Ollama it launches.
        $proc = Start-Process -FilePath $setup -ArgumentList '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES' -PassThru
        $proc.WaitForExit()
        if ($proc.ExitCode -ne 0) { Fail "Ollama installation failed (exit code $($proc.ExitCode))." }
        if (-not (Test-Path $OllamaExe)) { Fail "Ollama installed but ollama.exe wasn't found in $OllamaDir." }
        Ok 'installed'
    }

    # The app talks to Ollama at localhost:11434, so the server has to be up,
    # both now (to download the model) and later when the app runs.
    if (-not (OllamaUp)) {
        Info 'Starting Ollama'
        if (Test-Path $OllamaApp) {
            $marker = Join-Path $env:LOCALAPPDATA 'Ollama'
            New-Item -ItemType Directory -Path $marker -Force | Out-Null
            New-Item -ItemType File -Path (Join-Path $marker 'upgraded') -Force | Out-Null
            Start-Process -FilePath $OllamaApp
        } else {
            Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden
        }
        for ($i = 0; $i -lt 30 -and -not (OllamaUp); $i++) { Start-Sleep -Seconds 1 }
        if (-not (OllamaUp)) { Fail 'Ollama was installed but did not start. Open Ollama from the Start menu, then run this installer again.' }
    }

    # --- 3. models ----------------------------------------------------------
    Step 'Language model (~3.4 GB - this is the slow part)'
    $ErrorActionPreference = 'Continue'   # see BuildFromSource: native stderr isn't an error
    $have = (& $OllamaExe list 2>$null) -join "`n"
    $ErrorActionPreference = 'Stop'
    foreach ($model in $OllamaModels) {
        if ($have -match ('(?m)^' + [regex]::Escape($model) + '\s')) {
            Ok "$model already downloaded"
        } else {
            Info "Pulling $model"
            $ErrorActionPreference = 'Continue'   # progress goes to stderr; see Download
            & $OllamaExe pull $model
            $pulled = $LASTEXITCODE
            $ErrorActionPreference = 'Stop'
            if ($pulled -ne 0) { Fail "Could not download $model." }
        }
    }

    Step 'Speech models (~1.1 GB)'
    New-Item -ItemType Directory -Path $WhisperDir -Force | Out-Null
    foreach ($m in @(@($WhisperUrl, $WhisperDest), @($FastUrl, $FastDest))) {
        if (Test-Path $m[1]) {
            Ok "$(Split-Path -Leaf $m[1]) already downloaded"
        } else {
            # Download beside the real name, then move into place, so an
            # interrupted download can't leave a truncated file that looks valid.
            Download $m[0] "$($m[1]).partial"
            Move-Item -Path "$($m[1]).partial" -Destination $m[1] -Force
            Ok $m[1]
        }
    }
    if ((Test-Path $WhisperDest) -and (Test-Path $WhisperOld)) { Remove-Item $WhisperOld -Force -ErrorAction SilentlyContinue }

    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue

    # --- done ---------------------------------------------------------------
    Write-Host ''
    Write-Host 'LectureNotes is installed.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Opening it now. On first launch the setup checklist checks your microphone;'
    Write-Host 'if Windows asks whether LectureNotes can use it, click Allow.'
    Write-Host "Your computer's own sound (Zoom, videos) is captured automatically."
    if ($OnMacShare) {
        Write-Host 'Later, open it from the Start menu: LectureNotes. (It lives in your AppData folder,'
        Write-Host 'not on the Desktop, because this Desktop is a folder shared from a Mac.)'
    } else {
        Write-Host 'Later, open it from the "LectureNotes App" folder on your Desktop or the Start menu.'
    }
    Write-Host ''
    try {
        Start-Process -FilePath $AppExe -WorkingDirectory $InstallDir
    } catch {
        # Installed fine; Windows refused to start it (Smart App Control or
        # another app-control policy blocking unsigned apps).
        Write-Host "Windows would not open LectureNotes: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host 'This is usually Smart App Control, which blocks apps that are not code-signed yet.' -ForegroundColor Yellow
        Write-Host 'See Windows Security > App & browser control > Smart App Control settings.' -ForegroundColor Yellow
    }
} catch {
    if ($_.Exception.Message -ne 'LectureNotes install stopped.') {
        Write-Host "error: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host 'Fix the problem above, then run the installer again; anything already installed is skipped.' -ForegroundColor DarkGray
}
}
