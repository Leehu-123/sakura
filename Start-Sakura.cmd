@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo Sakura - khoi dong tai may
echo Thu muc: %ROOT%

set "DB_ACTION=START"
for /f "delims=" %%R in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $root=(Get-Location).Path; $envPath=Join-Path $root '.env'; $line=Get-Content -LiteralPath $envPath -ErrorAction SilentlyContinue | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1; $dbUrl=if($line){$line.Substring(14)}else{''}; try {$uri=[Uri]$dbUrl} catch {$uri=$null}; if($uri -and $uri.Host -and $uri.Host -notin @('127.0.0.1','localhost','::1')){'REMOTE'} else {$lock=Join-Path $root '.local\postgres\postmaster.pid'; if(Test-Path -LiteralPath $lock){$lines=Get-Content -LiteralPath $lock; $pid=[int]$lines[0]; if(Get-Process -Id $pid -ErrorAction SilentlyContinue){'RUNNING'} else {Remove-Item -LiteralPath $lock -Force; 'START'}} else {'START'}}"') do set "DB_ACTION=%%R"

if /I "%DB_ACTION%"=="REMOTE" (
  echo Su dung PostgreSQL tu xa theo DATABASE_URL, bo qua PostgreSQL cuc bo.
  goto :db_ready
)

if /I "%DB_ACTION%"=="RUNNING" (
  echo PostgreSQL dang chay, bo qua khoi dong lai.
) else (
  echo Khoi dong PostgreSQL...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Get-Location).Path; Start-Process -FilePath (Get-Command node).Source -ArgumentList @('scripts/local-db.mjs') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root '.local\runtime-db.stdout.log') -RedirectStandardError (Join-Path $root '.local\runtime-db.stderr.log') | Out-Null"
)

echo Cho PostgreSQL san sang...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(35); do { Start-Sleep -Milliseconds 500; $ok=Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue } while(-not $ok -and (Get-Date) -lt $deadline); if(-not $ok){Write-Host 'PostgreSQL chua san sang. Xem .local\runtime-db.stderr.log'; exit 1}"
if errorlevel 1 goto :failed

:db_ready

echo Khoi dong API...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Get-Location).Path; Start-Process -FilePath (Get-Command node).Source -ArgumentList @('--env-file=.env','apps/platform-api/dist/main.js') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root '.local\runtime-api.stdout.log') -RedirectStandardError (Join-Path $root '.local\runtime-api.stderr.log') | Out-Null"

echo Cho API san sang...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(35); do { Start-Sleep -Milliseconds 500; try {$r=Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/v1/health' -TimeoutSec 2 -UseBasicParsing; $ok=$r.StatusCode -eq 200} catch {$ok=$false} } while(-not $ok -and (Get-Date) -lt $deadline); if(-not $ok){Write-Host 'API chua san sang. Xem .local\runtime-api.stderr.log va .local\runtime-api.stdout.log'; exit 1}"
if errorlevel 1 goto :api_failed

echo Khoi dong giao dien web...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Get-Location).Path; Start-Process -FilePath (Get-Command node).Source -ArgumentList @('scripts/local-web.cjs') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root '.local\runtime-web.stdout.log') -RedirectStandardError (Join-Path $root '.local\runtime-web.stderr.log') | Out-Null"

echo.
echo Sakura da duoc yeu cau khoi dong.
echo Mo: http://localhost:5173
echo API da san sang; neu trang chua hien, nhan Ctrl+R de tai lai.
start "" "http://localhost:5173"
exit /b 0

:failed
echo.
echo Khong khoi dong duoc PostgreSQL. Xem:
echo %ROOT%.local\runtime-db.stderr.log
pause
exit /b 1

:api_failed
echo.
echo API chua khoi dong duoc. Xem:
echo %ROOT%.local\runtime-api.stderr.log
echo %ROOT%.local\runtime-api.stdout.log
pause
exit /b 1
