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
#   3. The speech + language models themselves (~4 GB)
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
$SourceSha256 = 'f5134622f51c5c9c0532eee2b535f5acedb46f4735acc065c94251327cd9350f'
$AppSha256 = @{
    'x64'   = '19df87078e9a02da5260f0e5b50cdc6e8a71e3891872a44a3ae8825c6dd74a61'
    'arm64' = 'd433b2bb1c87c3bea6f63efa8c5d01a3ef9bff91ffff7dbf6b20e781b22e3748'
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
$InstallDir  = if ($env:LECTURENOTES_INSTALL_DIR) { $env:LECTURENOTES_INSTALL_DIR } else { Join-Path ([Environment]::GetFolderPath('Desktop')) 'LectureNotes App' }
$AppExe      = Join-Path $InstallDir 'LectureNotes.exe'
$OldInstall  = Join-Path $env:LOCALAPPDATA 'Programs\LectureNotes'   # where the first beta installed
$WorkRoot    = Join-Path $env:LOCALAPPDATA 'LectureNotes'
$ToolsRoot   = Join-Path $WorkRoot 'buildtools'
$OllamaDir   = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
$OllamaExe   = Join-Path $OllamaDir 'ollama.exe'
$OllamaApp   = Join-Path $OllamaDir 'ollama app.exe'
$OllamaSetup = 'https://ollama.com/download/OllamaSetup.exe'
$OllamaModels = @('qwen3.5:4b')   # one multimodal model covers both Q&A and the camera feature
$WhisperUrl  = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'
$WhisperDir  = Join-Path $WorkRoot 'models'
$WhisperDest = Join-Path $WhisperDir 'ggml-large-v3-turbo-q5_0.bin'

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
        & $curl -fL --progress-bar -o $dest $url
        if ($LASTEXITCODE -ne 0) { throw "Could not download $url" }
    } else {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
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
        -DCMAKE_BUILD_TYPE=Release -DFETCHCONTENT_FULLY_DISCONNECTED=ON *> $log
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
    Write-Host 'Builds the app on your PC, then installs Ollama and ~4 GB of speech and language models.' -ForegroundColor DarkGray
    Write-Host 'Everything runs locally on your PC. No administrator password needed.' -ForegroundColor DarkGray
    Write-Host ''

    # Smart App Control (some new Windows 11 PCs) blocks apps that aren't
    # signed by a known publisher, with no "run anyway" option -- including
    # apps built on the PC itself. Say so up front instead of failing later.
    $sac = $null
    try { $sac = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -ErrorAction Stop).VerifiedAndReputablePolicyState } catch {}
    if ($sac -eq 1) {
        Write-Host 'Heads up: Smart App Control is on for this PC. It may block LectureNotes from opening,' -ForegroundColor Yellow
        Write-Host 'because this early version is not code-signed yet. (Windows Security > App & browser control.)' -ForegroundColor Yellow
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
        $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }
        Start-Sleep -Seconds 3
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

    Step 'Speech model (~550 MB)'
    if (Test-Path $WhisperDest) {
        Ok 'already downloaded'
    } else {
        New-Item -ItemType Directory -Path $WhisperDir -Force | Out-Null
        # Download beside the real name, then move into place, so an
        # interrupted download can't leave a truncated file that looks valid.
        Download $WhisperUrl "$WhisperDest.partial"
        Move-Item -Path "$WhisperDest.partial" -Destination $WhisperDest -Force
        Ok $WhisperDest
    }

    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue

    # --- done ---------------------------------------------------------------
    Write-Host ''
    Write-Host 'LectureNotes is installed.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Opening it now. On first launch the setup checklist checks your microphone;'
    Write-Host 'if Windows asks whether LectureNotes can use it, click Allow.'
    Write-Host "Your computer's own sound (Zoom, videos) is captured automatically."
    Write-Host 'Later, open it from the "LectureNotes App" folder on your Desktop or the Start menu.'
    Write-Host ''
    Start-Process -FilePath $AppExe -WorkingDirectory $InstallDir
} catch {
    if ($_.Exception.Message -ne 'LectureNotes install stopped.') {
        Write-Host "error: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host 'Fix the problem above, then run the installer again; anything already installed is skipped.' -ForegroundColor DarkGray
}
}
