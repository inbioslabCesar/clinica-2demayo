param(
    [Parameter(Mandatory = $true)]
    [string]$InputFile,

    [string]$OutputFile
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InputFile)) {
    throw "No existe el archivo de entrada: $InputFile"
}

if (-not $OutputFile) {
    $directory = Split-Path -Parent $InputFile
    $name = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)
    $extension = [System.IO.Path]::GetExtension($InputFile)
    $OutputFile = Join-Path $directory ("${name}.hostinger${extension}")
}

$raw = Get-Content -Path $InputFile -Raw

# Elimina definers de mysqldump comentados: /*!50017 DEFINER=`root`@`localhost`*/
$raw = [System.Text.RegularExpressions.Regex]::Replace(
    $raw,
    '/\*!50017\s+DEFINER=`[^`]+`@`[^`]+`\*/',
    '',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

# Elimina definers de vistas: /*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
$raw = [System.Text.RegularExpressions.Regex]::Replace(
    $raw,
    '/\*!50013\s+DEFINER=`[^`]+`@`[^`]+`\s+SQL\s+SECURITY\s+DEFINER\s*\*/',
    '/*!50013 SQL SECURITY INVOKER */',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

# Elimina definers no comentados: CREATE ... DEFINER=`user`@`host`
$raw = [System.Text.RegularExpressions.Regex]::Replace(
    $raw,
    'DEFINER=`[^`]+`@`[^`]+`\s*',
    '',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

# Cambia SQL SECURITY DEFINER por INVOKER para evitar restricciones en hosting compartido.
$raw = [System.Text.RegularExpressions.Regex]::Replace(
    $raw,
    'SQL\s+SECURITY\s+DEFINER',
    'SQL SECURITY INVOKER',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

Set-Content -Path $OutputFile -Value $raw -Encoding utf8

Write-Output "SQL saneado generado en: $OutputFile"