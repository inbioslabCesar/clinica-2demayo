Param(
  [switch]$SkipLint,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

Write-Host '==> Preparando release para Hostinger...' -ForegroundColor Cyan

if (-not $SkipLint) {
  Write-Host '==> Ejecutando lint...' -ForegroundColor Yellow
  npm run lint
}

if (-not $SkipBuild) {
  Write-Host '==> Ejecutando build (sistema + landing)...' -ForegroundColor Yellow
  npm run build
}

$distSistema = Join-Path $root 'dist'
$distPublic = Join-Path $root 'dist-public'

if (-not (Test-Path $distSistema)) {
  throw 'No existe dist/. Ejecuta npm run build.'
}
if (-not (Test-Path $distPublic)) {
  throw 'No existe dist-public/. Ejecuta npm run build.'
}

$releaseDir = Join-Path $root 'deploy\hostinger-release'
$backendDir = Join-Path $releaseDir 'backend-sistema'
$sistemaDir = Join-Path $releaseDir 'frontend-sistema'
$landingDir = Join-Path $releaseDir 'frontend-landing'

if (Test-Path $releaseDir) {
  Remove-Item -Recurse -Force $releaseDir
}

New-Item -ItemType Directory -Force -Path $backendDir | Out-Null
New-Item -ItemType Directory -Force -Path $sistemaDir | Out-Null
New-Item -ItemType Directory -Force -Path $landingDir | Out-Null

Write-Host '==> Copiando backend (sin archivos sensibles)...' -ForegroundColor Yellow
$excludeDirs = @(
  '.git','.github','.vscode','node_modules','src','public-site','dist','dist-public',
  'docs','tmp','uploads','vendor/bin','deploy','tests'
)
$excludeFiles = @(
  '.env','.env.local','.env.production','config.php','package-lock.json'
)

Get-ChildItem -Force $root | ForEach-Object {
  $name = $_.Name
  if ($excludeDirs -contains $name) { return }
  if ($excludeFiles -contains $name) { return }
  if ($name -like '*.sql' -or $name -like '*.log') { return }

  $dest = Join-Path $backendDir $name
  if ($_.PSIsContainer) {
    Copy-Item $_.FullName -Destination $dest -Recurse -Force
  } else {
    Copy-Item $_.FullName -Destination $dest -Force
  }
}

Write-Host '==> Copiando frontend de sistema (dist -> /public_html/sistema)...' -ForegroundColor Yellow
Copy-Item -Path (Join-Path $distSistema '*') -Destination $sistemaDir -Recurse -Force

Write-Host '==> Copiando landing (dist-public -> /public_html)...' -ForegroundColor Yellow
Copy-Item -Path (Join-Path $distPublic '*') -Destination $landingDir -Recurse -Force

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipPath = Join-Path $root ("deploy\hostinger-release-$stamp.zip")
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Write-Host '==> Comprimiendo release...' -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $releaseDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

$summary = @"
Release creado correctamente:
$zipPath

Contenido:
- backend-sistema/    -> subir a /public_html/sistema/
- frontend-sistema/   -> subir a /public_html/sistema/
- frontend-landing/   -> subir a /public_html/

Importante:
- config.php NO se incluye por seguridad.
- uploads/ NO se incluye por seguridad.
"@

Write-Host $summary -ForegroundColor Green
