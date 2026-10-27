# D:\Dev\X414\launch-pixel-sim.ps1
# Launches the visible Pixel_9_X414 Android 15 Emulator, installs x414-pixel-release.apk, and opens X414
param(
    [switch]$WipeData
)

$sdk = "C:\Users\beesl\AppData\Local\Android\Sdk"
$adb = "$sdk\platform-tools\adb.exe"
$emulator = "$sdk\emulator\emulator.exe"
$avdName = "Pixel_9_X414"
$apkPath = Join-Path $PSScriptRoot "x414-pixel-release.apk"

$env:ANDROID_SDK_ROOT = $sdk
$env:HOME = $env:USERPROFILE
$env:ADB_VENDOR_KEYS = "$env:USERPROFILE\.android\adbkey"

# 1. Start ADB server
Write-Host "[X414 Sim] Starting ADB server..." -ForegroundColor Cyan
& $adb start-server

# Clean up any leftover lock directories or files if previous emulator terminated abruptly
cmd /c "rmdir /s /q `"$env:USERPROFILE\.android\avd\$avdName.avd\hardware-qemu.ini.lock`" 2>nul & del /f /q `"$env:USERPROFILE\.android\avd\$avdName.avd\*.lock`" 2>nul"

# 2. Launch visible emulator window if not already running
$emuProc = Get-Process -Name "qemu-system-x86_64" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $emuProc) {
    $emuArgs = @("-avd", $avdName, "-gpu", "host")
    if ($WipeData) {
        $emuArgs += "-wipe-data"
    }
    Write-Host "[X414 Sim] Opening Google Pixel 9 Simulator window ($avdName)..." -ForegroundColor Cyan
    Start-Process -FilePath $emulator -ArgumentList $emuArgs -WindowStyle Normal
} else {
    Write-Host "[X414 Sim] Emulator already running (PID $($emuProc.Id))." -ForegroundColor Green
}

# 3. Wait for emulator-5554 to finish booting Android 15
Write-Host "[X414 Sim] Waiting for Android 15 OS boot completion..." -ForegroundColor Yellow
$maxWaitSeconds = 120
$elapsed = 0
while ($elapsed -lt $maxWaitSeconds) {
    $devices = (& $adb devices) -join " "
    $booted = $null
    if ($devices -match "emulator-5554\s+device") {
        $booted = (& $adb -s emulator-5554 shell getprop sys.boot_completed 2>$null)
    }
    if ($booted -and "$booted".Trim() -eq "1") {
        Write-Host "[X414 Sim] Android 15 ready!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
}

# Unlock screen
& $adb -s emulator-5554 shell input keyevent 82 2>$null

Write-Host "[X414 Sim] Installing $apkPath onto Pixel 9..." -ForegroundColor Cyan
& $adb -s emulator-5554 install -r -g $apkPath

Write-Host "[X414 Sim] Launching X414 (com.project414.x414)..." -ForegroundColor Green
& $adb -s emulator-5554 shell am start -n "com.project414.x414/.MainActivity"
Write-Host "[X414 Sim] SUCCESS: X414 is now open on your Pixel 9 Simulator!" -ForegroundColor Green
