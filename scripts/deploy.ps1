# Rowan HVAC - Windows deploy script.
# Run in an elevated PowerShell from the repo folder:  .\scripts\deploy.ps1
# Assumes: Node 20, Git, and PM2 installed; a .env file in the repo root; the
# app already started once with:  pm2 start server.js --name rowanhvac
$ErrorActionPreference = "Stop"

# Move to repo root (parent of this script's folder).
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> Pulling latest code"
git pull

Write-Host "==> Installing dependencies"
npm ci

Write-Host "==> Applying database migrations"
npx prisma migrate deploy

Write-Host "==> Building"
npm run build

Write-Host "==> Reloading the app under PM2"
try {
  pm2 reload rowanhvac --update-env
} catch {
  pm2 start server.js --name rowanhvac
}
pm2 save

Write-Host "==> Done. App reloaded on http://127.0.0.1:3000 (IIS proxies it publicly)."
