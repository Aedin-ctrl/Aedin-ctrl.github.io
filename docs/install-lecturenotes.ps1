# LectureNotes installer for Windows - https://www.aedinlai.com
#
#   irm https://www.aedinlai.com/install-lecturenotes.ps1 | iex
#
# Installs LectureNotes and everything it needs to actually work:
#   1. LectureNotes          ->  %LOCALAPPDATA%\Programs\LectureNotes (+ Start menu shortcut)
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

# Where to fetch the app from. Overridable so the installer can be tested
# against a local copy of the site before anything goes live.
$BaseUrl = if ($env:LECTURENOTES_BASE_URL) { $env:LECTURENOTES_BASE_URL } else { 'https://www.aedinlai.com' }

# Filled in by LectureNotes' scripts/release-windows.sh each time a new
# build is published, so they always match the zips next to this script.
$AppSha256 = @{
    'x64'   = '6408d98f08858989e267f21ca796d2424b4237227f6e6bf899bf40be600a7abe'
    'arm64' = 'f80e137730aaa4d89e2fc1cd61cf1d0771b70e4f091077af7b4318ed617f4388'
}

$InstallDir  = Join-Path $env:LOCALAPPDATA 'Programs\LectureNotes'
$AppExe      = Join-Path $InstallDir 'LectureNotes.exe'
$OllamaDir   = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
$OllamaExe   = Join-Path $OllamaDir 'ollama.exe'
$OllamaApp   = Join-Path $OllamaDir 'ollama app.exe'
$OllamaSetup = 'https://ollama.com/download/OllamaSetup.exe'
$OllamaModels = @('qwen3.5:4b')   # one multimodal model covers both Q&A and the camera feature
$WhisperUrl  = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'
$WhisperDir  = Join-Path $env:LOCALAPPDATA 'LectureNotes\models'
$WhisperDest = Join-Path $WhisperDir 'ggml-large-v3-turbo-q5_0.bin'

function Step($t)  { Write-Host "==> $t" -ForegroundColor Cyan }
function Info($t)  { Write-Host "    $t" -ForegroundColor DarkGray }
function Ok($t)    { Write-Host "    done " -ForegroundColor Green -NoNewline; Write-Host $t -ForegroundColor DarkGray }
function Fail($t)  { Write-Host "error: $t" -ForegroundColor Red; throw 'LectureNotes install stopped.' }

# Big downloads: curl.exe (built into Windows 10 1803+) shows real progress;
# Invoke-WebRequest is the fallback. Neither adds the "downloaded from the
# internet" mark that makes SmartScreen interrupt.
function Download($url, $dest) {
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (Test-Path $curl) {
        & $curl -fL --progress-bar -o $dest $url
        if ($LASTEXITCODE -ne 0) { Fail "Could not download $url" }
    } else {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    }
}

function OllamaUp {
    try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
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
    Write-Host 'Installs the app, Ollama, and ~4 GB of speech and language models.' -ForegroundColor DarkGray
    Write-Host 'Everything runs locally on your PC. No administrator password needed.' -ForegroundColor DarkGray
    Write-Host ''

    # Smart App Control (some new Windows 11 PCs) blocks apps that aren't
    # signed by a known publisher, with no "run anyway" option. LectureNotes
    # isn't signed yet, so say so up front instead of failing mysteriously.
    $sac = $null
    try { $sac = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -ErrorAction Stop).VerifiedAndReputablePolicyState } catch {}
    if ($sac -eq 1) {
        Write-Host 'Heads up: Smart App Control is on for this PC. It may block LectureNotes from opening,' -ForegroundColor Yellow
        Write-Host 'because this early version is not code-signed yet. (Windows Security > App & browser control.)' -ForegroundColor Yellow
        Write-Host ''
    }

    # --- 1. the app ---------------------------------------------------------
    Step "Installing LectureNotes ($arch)"
    $expected = $AppSha256[$arch]
    $zipUrl = "$BaseUrl/downloads/LectureNotes-windows-$arch.zip"
    $temp = Join-Path ([IO.Path]::GetTempPath()) ("lectureNotes-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null
    $zip = Join-Path $temp 'LectureNotes.zip'
    Download $zipUrl $zip
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
    if ($actual -ne $expected) {
        Fail "The LectureNotes download didn't match its expected checksum. Not installing it. Please report this at aedinlai.com."
    }
    Expand-Archive -Path $zip -DestinationPath (Join-Path $temp 'app') -Force
    $newExe = Join-Path $temp 'app\LectureNotes.exe'
    if (-not (Test-Path $newExe)) { Fail 'No LectureNotes.exe inside the downloaded archive.' }

    # Replacing files under a running copy fails on Windows; ask it to close.
    $running = Get-Process -Name 'LectureNotes' -ErrorAction SilentlyContinue
    if ($running) {
        Info 'Closing the running copy of LectureNotes'
        $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }
        Start-Sleep -Seconds 3
        Get-Process -Name 'LectureNotes' -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 1
    }
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $temp 'app\*') -Destination $InstallDir -Recurse -Force

    # Start menu shortcut, so it can be found again later.
    $programs = [Environment]::GetFolderPath('Programs')
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path $programs 'LectureNotes.lnk'))
    $link.TargetPath = $AppExe
    $link.WorkingDirectory = $InstallDir
    $link.Description = 'LectureNotes: live lecture transcription and answers'
    $link.Save()
    Ok $InstallDir

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
    $have = (& $OllamaExe list 2>$null) -join "`n"
    foreach ($model in $OllamaModels) {
        if ($have -match ('(?m)^' + [regex]::Escape($model) + '\s')) {
            Ok "$model already downloaded"
        } else {
            Info "Pulling $model"
            & $OllamaExe pull $model
            if ($LASTEXITCODE -ne 0) { Fail "Could not download $model." }
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
    Write-Host 'Later, open it from the Start menu: LectureNotes.'
    Write-Host ''
    Start-Process -FilePath $AppExe -WorkingDirectory $InstallDir
} catch {
    if ($_.Exception.Message -ne 'LectureNotes install stopped.') {
        Write-Host "error: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host 'Fix the problem above, then run the installer again; anything already installed is skipped.' -ForegroundColor DarkGray
}
}
