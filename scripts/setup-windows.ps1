# Rowan HVAC - one-time Windows prerequisites bootstrap.
# Run in an elevated PowerShell. Installs Node 20, Git, and PM2 (as a service so
# the app survives reboots). MySQL and IIS are installed separately (see README).
$ErrorActionPreference = "Stop"

Write-Host "==> Installing Node.js 20 LTS and Git via winget"
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements

Write-Host ""
Write-Host "IMPORTANT: close and reopen PowerShell so PATH picks up node/npm/git,"
Write-Host "then run the rest:"
Write-Host ""
Write-Host "  npm install -g pm2 pm2-windows-startup"
Write-Host "  pm2-startup install"
Write-Host ""
Write-Host "Next: install MySQL Community Server and IIS (URL Rewrite + ARR) -"
Write-Host "see the 'Deploy on Windows Server' section of the README."
