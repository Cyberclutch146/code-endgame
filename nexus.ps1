param()

Write-Host @'

  /$$$$$$                                  /$$     
 /$$__  $$                                | $$     
| $$  \ $$ /$$   /$$  /$$$$$$  /$$$$$$$  /$$$$$$   
| $$  | $$| $$  | $$ |____  $$| $$__  $$|_  $$_/   
| $$  | $$| $$  | $$  /$$$$$$$| $$  \ $$  | $$     
| $$/$$ $$| $$  | $$ /$$__  $$| $$  | $$  | $$ /$$ 
|  $$$$$$/|  $$$$$$/|  $$$$$$$| $$  | $$  |  $$$$/ 
 \____ $$$ \______/  \_______/|__/  |__/   \___/   
      \__/                                         
                                                   
 /$$$$$$$$                               /$$                     /$$ 
|__  $$__/                              |__/                    | $$ 
   | $$  /$$$$$$   /$$$$$$  /$$$$$$/$$$$ /$$ /$$$$$$$   /$$$$$$ | $$ 
   | $$ /$$__  $$ /$$__  $$| $$_  $$_  $$| $$| $$__  $$|____  $$| $$ 
   | $$| $$$$$$$$| $$  \__/| $$ \ $$ \ $$| $$| $$  \ $$ /$$$$$$$| $$ 
   | $$| $$_____/| $$      | $$ | $$ | $$| $$| $$  | $$/$$__  $$| $$ 
   | $$|  $$$$$$$| $$      | $$ | $$ | $$| $$| $$  | $$|  $$$$$$| $$ 
   |__/ \_______/|__/      |__/ |__/ |__/|__/|__/  |__/ \_______|__/ 

'@ -ForegroundColor Cyan

Write-Host "=========================================================================" -ForegroundColor DarkGray

# 1. Backend Setup
if (-Not (Test-Path "backend\venv")) {
    Write-Host "[*] First time setup: Creating Python virtual environment..." -ForegroundColor Yellow
    Set-Location backend
    py -3.12 -m venv venv
    Set-Location ..
}

Write-Host "[*] Verifying backend dependencies..." -ForegroundColor Yellow
Set-Location backend
.\venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[!] ERROR: Backend dependencies failed to install! Please fix the errors above." -ForegroundColor Red
    exit 1
}
Set-Location ..

# 2. Frontend Setup
if (-Not (Test-Path "frontend\node_modules")) {
    Write-Host "[*] First time setup: Installing Frontend Node modules..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

Write-Host "[*] Launching Backend and Frontend in this terminal..." -ForegroundColor Green
Write-Host "[*] The dashboard will be available at http://localhost:3000" -ForegroundColor Green
Write-Host "[!] Press Ctrl+C to stop both servers." -ForegroundColor DarkGray

# 3. Run both concurrently using npx
# We call the python executable directly from the venv so we don't have to worry about Activation context
npx concurrently --kill-others --names "BACKEND,FRONTEND" --prefix-colors "blue,magenta" "cd backend && .\venv\Scripts\python.exe main.py" "cd frontend && npm run dev"
