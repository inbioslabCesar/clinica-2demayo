$prodPath = 'sql\u330560936_bd2DeMayo.sql'
$devPath = 'sql\poli2demayo (1).sql'
$outPath = 'sql\2026-04-15_sync_produccion_to_dev_full.sql'

$prodText = Get-Content -LiteralPath $prodPath -Raw -Encoding UTF8
$devText = Get-Content -LiteralPath $devPath -Raw -Encoding UTF8

function Get-CreateTableStatements([string]$text){
  $map = @{}
  $regex = [regex]'(?is)CREATE TABLE `(?<name>[^`]+)`\s*\(.*?;'
  foreach($m in $regex.Matches($text)){
    $stmt = $m.Value.Trim()
    $name = $m.Groups['name'].Value
    if(-not $map.ContainsKey($name)){
      $map[$name] = $stmt
    }
  }
  return $map
}

function Get-ColumnMapFromCreate([string]$createStmt){
  $cols = @{}
  $m = [regex]::Match($createStmt, '(?is)^CREATE TABLE `[^`]+`\s*\((?<body>.*)\)\s*(ENGINE=.*)?;$')
  if(-not $m.Success){ return $cols }
  $body = $m.Groups['body'].Value
  $lines = $body -split "`r?`n"
  foreach($line in $lines){
    $trim = $line.Trim()
    if($trim -match '^`([^`]+)`\s+(.*?)(,)?\s*$'){
      $cols[$matches[1]] = $matches[2].Trim()
    }
  }
  return $cols
}

function NormalizeDef([string]$s){
  if($null -eq $s){ return '' }
  return (($s -replace '\s+', ' ').Trim().ToLower())
}

function EscapeSingle([string]$s){
  return $s -replace "'", "''"
}

function QuoteId([string]$name){
  $bt = [char]96
  return "$bt$name$bt"
}

$prodCreates = Get-CreateTableStatements $prodText
$devCreates = Get-CreateTableStatements $devText

$prodTables = @($prodCreates.Keys | Sort-Object)
$devTables = @($devCreates.Keys | Sort-Object)
$missingTables = @($devTables | Where-Object { $_ -notin $prodTables })
$commonTables = @($devTables | Where-Object { $_ -in $prodTables })

$out = New-Object System.Collections.Generic.List[string]
$out.Add('-- Sync de esquema PRODUCCION -> DESARROLLO')
$out.Add('-- Generado automaticamente el 2026-04-15')
$out.Add('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";')
$out.Add('SET time_zone = "+00:00";')
$out.Add('SET FOREIGN_KEY_CHECKS = 0;')
$out.Add('')

$out.Add('-- 1) Crear tablas faltantes')
foreach($t in $missingTables){
  $stmt = $devCreates[$t] -replace '^CREATE TABLE\s+`', 'CREATE TABLE IF NOT EXISTS `'
  $out.Add($stmt)
  $out.Add('')
}

$out.Add('-- 2) Sincronizar columnas en tablas existentes')
foreach($t in $commonTables){
  $qt = QuoteId $t
  $prodCols = Get-ColumnMapFromCreate $prodCreates[$t]
  $devCols = Get-ColumnMapFromCreate $devCreates[$t]

  foreach($c in $devCols.Keys){
    $qc = QuoteId $c
    $devDef = $devCols[$c]
    if(-not $prodCols.ContainsKey($c)){
      $out.Add("ALTER TABLE $qt ADD COLUMN IF NOT EXISTS $qc $devDef;")
    } else {
      $p = NormalizeDef $prodCols[$c]
      $d = NormalizeDef $devDef
      if($p -ne $d){
        $out.Add("ALTER TABLE $qt MODIFY COLUMN $qc $devDef;")
      }
    }
  }
}
$out.Add('')

# 3) Indices y PK/Unique de ALTER TABLE de dev
$out.Add('-- 3) Indices y llaves (idempotentes)')
$alterRegex = [regex]'(?is)ALTER TABLE `(?<table>[^`]+)`\s*(?<ops>.*?);'
foreach($m in $alterRegex.Matches($devText)){
  $table = $m.Groups['table'].Value
  $qtable = QuoteId $table
  $opsText = $m.Groups['ops'].Value
  $opsLines = $opsText -split "`r?`n"
  foreach($raw in $opsLines){
    $line = $raw.Trim().TrimEnd(',')
    if([string]::IsNullOrWhiteSpace($line)){ continue }

    if($line -match '^ADD PRIMARY KEY \((.+)\)$'){
      $cols = $matches[1]
      $sql = "SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = '$table' AND constraint_type = 'PRIMARY KEY');"
      $out.Add($sql)
      $pkStmt = EscapeSingle("ALTER TABLE $qtable ADD PRIMARY KEY ($cols)")
      $out.Add("SET @__sql := IF(@__pk_exists = 0, '$pkStmt', 'SELECT 1');")
      $out.Add('PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;')
      continue
    }

    if($line -match '^ADD UNIQUE KEY `([^`]+)` \((.+)\)$'){
      $idx = $matches[1]
      $cols = $matches[2]
      $qidx = QuoteId $idx
      $out.Add("CREATE UNIQUE INDEX IF NOT EXISTS $qidx ON $qtable ($cols);")
      continue
    }

    if($line -match '^ADD FULLTEXT KEY `([^`]+)` \((.+)\)$'){
      $idx = $matches[1]
      $cols = $matches[2]
      $qidx = QuoteId $idx
      $out.Add("CREATE FULLTEXT INDEX IF NOT EXISTS $qidx ON $qtable ($cols);")
      continue
    }

    if($line -match '^ADD KEY `([^`]+)` \((.+)\)$'){
      $idx = $matches[1]
      $cols = $matches[2]
      $qidx = QuoteId $idx
      $out.Add("CREATE INDEX IF NOT EXISTS $qidx ON $qtable ($cols);")
      continue
    }

    if($line -match '^MODIFY `([^`]+)` (.+AUTO_INCREMENT.*)$'){
      $col = $matches[1]
      $qcol = QuoteId $col
      $def = $matches[2]
      $out.Add("ALTER TABLE $qtable MODIFY $qcol $def;")
      continue
    }
  }
}
$out.Add('')

# 4) Triggers (recrear segun desarrollo)
$out.Add('-- 4) Triggers de desarrollo')
$triggers = [regex]::Matches($devText, '(?is)CREATE TRIGGER `(?<name>[^`]+)`.*?END\s*\$\$')
if($triggers.Count -gt 0){
  $out.Add('DELIMITER $$')
  foreach($tm in $triggers){
    $tgName = $tm.Groups['name'].Value
    $qtgName = QuoteId $tgName
    $body = $tm.Value.Trim()
    $out.Add("DROP TRIGGER IF EXISTS $qtgName$$")
    $out.Add($body + '$$')
  }
  $out.Add('DELIMITER ;')
}
$out.Add('')

# 5) Vista
$out.Add('-- 5) Vista de resumen diario de cotizaciones')
$viewMatch = [regex]::Match($devText, '(?is)CREATE ALGORITHM=UNDEFINED\s+DEFINER=`[^`]+`@`[^`]+`\s+SQL SECURITY DEFINER VIEW `vw_cotizaciones_resumen_diario`\s+AS\s+SELECT .*?;')
if($viewMatch.Success){
  $viewSql = $viewMatch.Value
  $viewSql = $viewSql -replace '(?is)^CREATE ALGORITHM=UNDEFINED\s+DEFINER=`[^`]+`@`[^`]+`\s+SQL SECURITY DEFINER VIEW', 'CREATE OR REPLACE VIEW'
  $out.Add('DROP VIEW IF EXISTS `vw_cotizaciones_resumen_diario`;')
  $out.Add($viewSql)
}
$out.Add('')

# 6) FKs puntuales del bloque final de dev
$out.Add('-- 6) Foreign keys faltantes (idempotentes)')
$fkAlterRegex = [regex]'(?is)ALTER TABLE `(?<table>[^`]+)`\s*(?<ops>ADD CONSTRAINT .*?);'
foreach($m in $fkAlterRegex.Matches($devText)){
  $table = $m.Groups['table'].Value
  $qtable = QuoteId $table
  $ops = $m.Groups['ops'].Value
  $fkLines = $ops -split "`r?`n"
  foreach($raw in $fkLines){
    $line = $raw.Trim().TrimEnd(',')
    if($line -match '^ADD CONSTRAINT `([^`]+)` FOREIGN KEY'){
      $fk = $matches[1]
      $escaped = EscapeSingle("ALTER TABLE $qtable $line")
      $out.Add("SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = '$table' AND constraint_name = '$fk');")
      $out.Add("SET @__sql := IF(@__fk_exists = 0, '$escaped', 'SELECT 1');")
      $out.Add('PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;')
    }
  }
}
$out.Add('')
$out.Add('SET FOREIGN_KEY_CHECKS = 1;')
$out.Add('')
$out.Add('-- FIN DEL SCRIPT')

$out | Set-Content -LiteralPath $outPath -Encoding UTF8
Write-Output "SQL generado: $outPath"
Write-Output ('Tablas faltantes creadas: ' + $missingTables.Count)
Write-Output ('Tablas comunes sincronizadas: ' + $commonTables.Count)
