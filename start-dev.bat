@echo off
echo Starting Concept.io Development Environment...
start "Node.js" cmd /k "cd /d %~dp0 && npm run dev"
timeout /t 3 /nobreak > nul
start "Diffusion" cmd /k "cd /d %~dp0server\diffusion-service && uvicorn server:app --host 0.0.0.0 --port 8000 --reload"
echo Services: Client (5173), Server (5000), Diffusion (8000)
