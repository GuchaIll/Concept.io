# Concept.io Development Startup Script
# This script starts all services: Node.js client, Node.js server, and Python diffusion service

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Concept.io Development Environment   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$ProjectRoot = $PSScriptRoot
$DiffusionServicePath = Join-Path $ProjectRoot "server\diffusion-service"
$PythonVenvPath = Join-Path $DiffusionServicePath "venv"

# Function to check if a port is in use
function Test-PortInUse {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# Function to kill process on port
function Stop-ProcessOnPort {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connection) {
        $processId = $connection.OwningProcess
        Write-Host "Killing process $processId on port $Port" -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

# Check and clear ports if needed
Write-Host "Checking ports..." -ForegroundColor Yellow
$portsToCheck = @(5000, 5173, 8000)  # Server, Client, Python Diffusion

foreach ($port in $portsToCheck) {
    if (Test-PortInUse -Port $port) {
        Write-Host "Port $port is in use. Attempting to free it..." -ForegroundColor Yellow
        Stop-ProcessOnPort -Port $port
        Start-Sleep -Seconds 1
    }
}

Write-Host "Ports cleared!" -ForegroundColor Green
Write-Host ""

# Start services in separate windows
Write-Host "Starting services..." -ForegroundColor Cyan
Write-Host ""

# 1. Start Node.js Server
Write-Host "[1/3] Starting Node.js Server (port 5000)..." -ForegroundColor Green
$serverProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\server'; Write-Host 'Node.js Server' -ForegroundColor Cyan; npm run dev" -PassThru

Start-Sleep -Seconds 2

# 2. Start Client Dev Server
Write-Host "[2/3] Starting Vite Client (port 5173)..." -ForegroundColor Green
$clientProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\client\concept.io'; Write-Host 'Vite Client' -ForegroundColor Cyan; npm run dev" -PassThru

Start-Sleep -Seconds 2

# 3. Start Python Diffusion Service
Write-Host "[3/3] Starting Python Diffusion Service (port 8000)..." -ForegroundColor Green

# Use the project conda environment Python directly (conda activate is unreliable in spawned shells)
$ProjectPython = "C:\Users\gucha\anaconda3\envs\project\python.exe"
$diffusionArgs = "-NoExit", "-Command", @"
cd '$DiffusionServicePath'
Write-Host 'Python Diffusion Service (conda: project)' -ForegroundColor Cyan
`$env:PYTHONIOENCODING = 'utf-8'
`$env:PYTHONUTF8 = '1'
Write-Host 'Checking CUDA availability...' -ForegroundColor Yellow
& '$ProjectPython' -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
Write-Host 'Starting uvicorn server...' -ForegroundColor Yellow
& '$ProjectPython' -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
"@

$diffusionProcess = Start-Process powershell -ArgumentList $diffusionArgs -PassThru

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services started!                " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services running at:" -ForegroundColor White
Write-Host "  - Client:    http://localhost:5173" -ForegroundColor Yellow
Write-Host "  - Server:    http://localhost:5000" -ForegroundColor Yellow
Write-Host "  - Diffusion: http://localhost:8000" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C in each window to stop the services" -ForegroundColor Gray
Write-Host ""

# Keep the main script running and show status
Write-Host "Main script will stay open. Close this window to see individual service outputs." -ForegroundColor Gray
