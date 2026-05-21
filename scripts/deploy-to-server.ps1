# FrameForge Studio 部署到云服务器 163.7.4.158
# 依据 server/nginx-frameforge-ip.conf 与 server/frameforge-compose.service

param(
  [string]$ServerHost = "163.7.4.158",
  [string]$ServerUser = "root",
  [string]$SshKey = "$env:USERPROFILE\.ssh\frameforge_deploy",
  [string]$ReleaseName = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

if (-not $ReleaseName) {
  $ReleaseName = "studio-multi-record-$(Get-Date -Format 'yyyyMMddHHmmss')"
}

$RemoteBase = "/var/www/frameforge"
$RemoteRelease = "$RemoteBase/releases/$ReleaseName"
$SshTarget = "${ServerUser}@${ServerHost}"
$SshArgs = @("-i", $SshKey, "-o", "StrictHostKeyChecking=accept-new")

Write-Host ">> Building static site..."
Push-Location $ProjectRoot
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
Pop-Location

if (-not (Test-Path "$ProjectRoot\out")) {
  throw "out/ not found after build"
}

Write-Host ">> Creating release $ReleaseName on server..."
ssh @SshArgs $SshTarget "mkdir -p $RemoteRelease $RemoteBase/api"

Write-Host ">> Uploading static files..."
scp @SshArgs -r "$ProjectRoot\out\*" "${SshTarget}:${RemoteRelease}/"

Write-Host ">> Uploading compose API..."
scp @SshArgs "$ProjectRoot\server\local-compose-api.mjs" "${SshTarget}:${RemoteBase}/api/local-compose-api.mjs"
scp @SshArgs "$ProjectRoot\server\frameforge-compose.service" "${SshTarget}:/tmp/frameforge-compose.service"
scp @SshArgs "$ProjectRoot\server\nginx-frameforge-ip.conf" "${SshTarget}:/tmp/frameforge-ip.conf"

Write-Host ">> Activating release and services..."
$ActivateCmd = "set -e; find $RemoteRelease -type d -exec chmod 755 {} \;; find $RemoteRelease -type f -exec chmod 644 {} \;; ln -sfn $RemoteRelease $RemoteBase/current; cp /tmp/frameforge-ip.conf /etc/nginx/conf.d/frameforge-ip.conf; chmod 755 $RemoteBase/api/local-compose-api.mjs; if [ ! -f /etc/systemd/system/frameforge-compose.service ]; then cp /tmp/frameforge-compose.service /etc/systemd/system/frameforge-compose.service && systemctl daemon-reload && systemctl enable frameforge-compose; fi; systemctl restart frameforge-compose; nginx -t && systemctl reload nginx; echo DEPLOY_OK; readlink -f $RemoteBase/current; systemctl is-active frameforge-compose || true"
ssh @SshArgs $SshTarget $ActivateCmd

Write-Host ""
Write-Host "Deploy complete."
Write-Host "  Site:    http://${ServerHost}/"
Write-Host "  Studio:  http://${ServerHost}/studio"
Write-Host "  API:     http://${ServerHost}/api/ (compose service on :4174)"
