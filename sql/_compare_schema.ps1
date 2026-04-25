$prodPath = 'sql\u330560936_bd2DeMayo.sql'
$devPath = 'sql\poli2demayo (1).sql'

function Get-CreateTableMap([string]$path){
  $lines = Get-Content -LiteralPath $path
  $map = @{}
  $inTable = $false
  $tableName = ''
  $buffer = New-Object System.Collections.Generic.List[string]

  foreach($line in $lines){
    if(-not $inTable){
      if($line -match '^CREATE TABLE `([^`]+)`\s*\('){
        $inTable = $true
        $tableName = $matches[1]
        $buffer.Clear()
        continue
      }
    } else {
      if($line -match '^\)\s*(ENGINE=.*)?;\s*$'){
        $map[$tableName] = @($buffer)
        $inTable = $false
        $tableName = ''
        $buffer = New-Object System.Collections.Generic.List[string]
      } else {
        $buffer.Add($line)
      }
    }
  }

  return $map
}

function Get-ColumnMap([object[]]$bodyLines){
  $cols = @{}
  foreach($line in $bodyLines){
    $trim = $line.Trim()
    if($trim -match '^`([^`]+)`\s+(.*?)(,)?\s*$'){
      $colName = $matches[1]
      $def = $matches[2].Trim()
      $cols[$colName] = $def
    }
  }
  return $cols
}

$prodTables = Get-CreateTableMap $prodPath
$devTables = Get-CreateTableMap $devPath

$missingTables = @($devTables.Keys | Where-Object { -not $prodTables.ContainsKey($_) } | Sort-Object)
$commonTables = @($devTables.Keys | Where-Object { $prodTables.ContainsKey($_) } | Sort-Object)

$report = New-Object System.Collections.Generic.List[string]
$report.Add('=== TABLAS FALTANTES EN PROD ===')
foreach($t in $missingTables){ $report.Add($t) }
$report.Add('')
$report.Add('=== DIFERENCIAS DE COLUMNAS (TABLAS COMUNES) ===')

foreach($t in $commonTables){
  $prodCols = Get-ColumnMap $prodTables[$t]
  $devCols = Get-ColumnMap $devTables[$t]
  $addCols = @($devCols.Keys | Where-Object { -not $prodCols.ContainsKey($_) } | Sort-Object)
  $modCols = New-Object System.Collections.Generic.List[string]
  foreach($c in ($devCols.Keys | Where-Object { $prodCols.ContainsKey($_) } | Sort-Object)){
    $p = ($prodCols[$c] -replace '\s+', ' ').Trim().ToLower()
    $d = ($devCols[$c] -replace '\s+', ' ').Trim().ToLower()
    if($p -ne $d){
      $modCols.Add($c)
    }
  }
  if($addCols.Count -gt 0 -or $modCols.Count -gt 0){
    $report.Add("[$t]")
    if($addCols.Count -gt 0){ $report.Add('  + columnas nuevas: ' + ($addCols -join ', ')) }
    if($modCols.Count -gt 0){ $report.Add('  * columnas distintas: ' + ($modCols -join ', ')) }
  }
}

$reportPath = 'sql\_schema_diff_prod_vs_dev.txt'
$report | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Output "Reporte generado: $reportPath"
Get-Content -LiteralPath $reportPath -TotalCount 240
