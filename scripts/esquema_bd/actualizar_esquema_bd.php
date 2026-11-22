<?php
/**
 * Actualizador de esquema de BD: crea lo que falte respecto a la referencia (solo CLI).
 *
 *   php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=sistema_clinica2demayo_com        # simulacro
 *   php scripts/esquema_bd/actualizar_esquema_bd.php --todas                                      # simulacro de todas
 *   php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=X --aplicar --confirmo-respaldo
 *
 * Códigos de salida: 0 al día | 1 error o quedaron acciones sin aplicar | 2 cambios pendientes u omitidas a revisar.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo línea de comandos.');
}

require_once __DIR__ . '/EsquemaBd.php';

$conValor = ['empresa', 'solo', 'sql', 'ref', 'host', 'puerto', 'bd', 'usuario', 'clave'];
$banderas = ['todas', 'aplicar', 'confirmo-respaldo', 'nombres-exactos', 'incluir-fks', 'incluir-pruebas', 'listar', 'ayuda'];

$opt = [];
foreach (array_slice($argv, 1) as $arg) {
    if (!preg_match('/^--([a-z\-]+)(?:=(.*))?$/s', $arg, $m)) {
        fwrite(STDERR, "Argumento inválido: {$arg}\n");
        exit(1);
    }
    [$k, $v] = [$m[1], $m[2] ?? null];
    if (in_array($k, $conValor, true) && $v !== null) {
        $opt[$k] = $v;
    } elseif (in_array($k, $banderas, true) && $v === null) {
        $opt[$k] = true;
    } else {
        fwrite(STDERR, "Opción desconocida o mal usada: {$arg}\n");
        exit(1);
    }
}

if (isset($opt['ayuda'])) {
    echo <<<AYUDA
Uso: php scripts/esquema_bd/actualizar_esquema_bd.php (--empresa=slug | --todas | --listar) [opciones]

  --aplicar --confirmo-respaldo   Ejecuta los cambios (sin --aplicar es simulacro)
  --solo=tablas,columnas,indices,fks,semillas   Limita fases (por defecto NO incluye fks)
  --incluir-fks                   Agrega la fase fks a las fases por defecto
  --nombres-exactos               Crea índices/FKs por nombre aunque exista uno equivalente
  --incluir-pruebas               Con --todas, incluye BD marcadas como de prueba
  --sql=archivo.sql               Guarda el SQL pendiente por empresa
  --ref=archivo.json              Referencia alternativa
  --host --puerto --bd --usuario --clave   Sobrescriben la conexión (solo con --empresa)

AYUDA;
    exit(0);
}

function fallar(string $msg): void
{
    fwrite(STDERR, "[ERROR] {$msg}\n");
    exit(1);
}

if (isset($opt['listar'])) {
    foreach (EsquemaBd::listarEmpresas() as $e) {
        echo $e['slug'] . '  ->  ' . $e['bd'] . ($e['excluida'] ? '  (omitida en --todas)' : '') . '  [alias: ' . count($e['alias']) . "]\n";
    }
    exit(0);
}

if (isset($opt['empresa']) && isset($opt['todas'])) {
    fallar('--empresa y --todas no se pueden usar juntas.');
}
if (!isset($opt['empresa']) && !isset($opt['todas'])) {
    fallar('Indica --empresa=slug o --todas (usa --ayuda).');
}
if (isset($opt['aplicar']) && !isset($opt['confirmo-respaldo'])) {
    fallar('--aplicar exige --confirmo-respaldo (haz el respaldo con mysqldump antes).');
}
if (isset($opt['todas']) && array_intersect(array_keys($opt), ['host', 'puerto', 'bd', 'usuario', 'clave'])) {
    fallar('Las opciones de conexión solo se pueden usar con --empresa.');
}

$fases = EsquemaBd::FASES_POR_DEFECTO;
if (isset($opt['solo'])) {
    $fases = array_values(array_filter(array_map('trim', explode(',', $opt['solo']))));
    $invalidas = array_diff($fases, EsquemaBd::FASES);
    if ($invalidas || !$fases) {
        fallar('Fases inválidas: ' . implode(', ', $invalidas) . '. Válidas: ' . implode(', ', EsquemaBd::FASES));
    }
} elseif (isset($opt['incluir-fks'])) {
    $fases[] = 'fks';
}

$aplicar = isset($opt['aplicar']);
$logBuffer = '';
function salida(string $txt): void
{
    global $logBuffer;
    echo $txt;
    $logBuffer .= $txt;
}

try {
    $ref = EsquemaBd::cargarReferencia($opt['ref'] ?? EsquemaBd::rutaReferencia());
} catch (Throwable $e) {
    fallar($e->getMessage());
}

$empresas = [];
if (isset($opt['todas'])) {
    foreach (EsquemaBd::listarEmpresas() as $slug => $e) {
        if ($e['excluida'] && !isset($opt['incluir-pruebas'])) {
            continue;
        }
        $empresas[] = $slug;
    }
} else {
    $empresas[] = $opt['empresa'];
}

$sqlSalida = '';
$codigo = 0;
$marcas = ['pendiente' => 'PENDIENTE', 'ok' => 'OK', 'error' => 'ERROR', 'omitida' => 'OMITIDA', 'info' => 'INFO'];

function imprimirAcciones(array $acciones, bool $simulacro): void
{
    global $marcas;
    foreach ($acciones as $a) {
        $m = $marcas[$a['estado']] ?? strtoupper($a['estado']);
        salida("  [{$m}] {$a['fase']} {$a['objeto']}" . ($a['nota'] !== '' ? " - {$a['nota']}" : '') . "\n");
        if ($a['sql'] !== null && in_array($a['estado'], ['pendiente', 'error'], true)) {
            salida('      ' . str_replace("\n", "\n      ", $a['sql']) . ";\n");
        } elseif ($a['sql'] !== null && $a['estado'] === 'info') {
            salida('      -- sugerido, NO se aplica: ' . $a['sql'] . ";\n");
        }
    }
}

function lineaResumen(array $acciones): string
{
    $res = EsquemaBd::resumen($acciones);
    if (!$res) {
        return "sin diferencias\n";
    }
    $partes = [];
    foreach ($res as $fase => $estados) {
        $e = [];
        foreach ($estados as $estado => $n) {
            $e[] = "{$n} {$estado}";
        }
        $partes[] = "{$fase}: " . implode(', ', $e);
    }
    return implode(' | ', $partes) . "\n";
}

function contar(array $acciones, string $estado): int
{
    return count(array_filter($acciones, static function ($a) use ($estado) {
        return $a['estado'] === $estado;
    }));
}

foreach ($empresas as $slug) {
    try {
        $cfg = EsquemaBd::cargarConfigEmpresa($slug);
        foreach (['host' => 'host', 'puerto' => 'port', 'bd' => 'name', 'usuario' => 'user', 'clave' => 'pass'] as $o => $k) {
            if (isset($opt[$o])) {
                $cfg[$k] = $o === 'puerto' ? (int)$opt[$o] : $opt[$o];
            }
        }
        salida("\n=== {$slug} ({$cfg['name']}) " . ($aplicar ? 'APLICAR' : 'SIMULACRO') . " ===\n");
        $pdo = EsquemaBd::conectar($cfg);
        $esquema = new EsquemaBd($pdo);
        salida('Motor: ' . $esquema->versionMotor() . ' | Fases: ' . implode(',', $fases) . "\n");

        $planOpt = ['fases' => $fases, 'nombres_exactos' => isset($opt['nombres-exactos'])];
        $destino = EsquemaBd::filtrarExcluidas($esquema->leerEstructura());
        $acciones = $esquema->planificar($ref, $destino, $planOpt);

        if ($sqlSalida !== '' || isset($opt['sql'])) {
            $sqlSalida .= "-- === {$slug} ({$cfg['name']}) ===\n";
            foreach ($acciones as $a) {
                if ($a['estado'] === 'pendiente' && $a['sql'] !== null) {
                    $sqlSalida .= $a['sql'] . ";\n";
                }
            }
            $sqlSalida .= "\n";
        }

        if ($aplicar && contar($acciones, 'pendiente') > 0) {
            $acciones = $esquema->aplicar($acciones);
        }
        imprimirAcciones($acciones, !$aplicar);
        salida('Resumen: ' . lineaResumen($acciones));

        if ($aplicar) {
            // Verificación final: se vuelve a leer la estructura y a planificar.
            $restante = $esquema->planificar($ref, EsquemaBd::filtrarExcluidas($esquema->leerEstructura()), $planOpt);
            $pend = contar($restante, 'pendiente');
            salida($pend === 0 ? "Verificación: sin acciones pendientes.\n" : "Verificación: quedan {$pend} acciones pendientes.\n");
            if (contar($acciones, 'error') > 0 || $pend > 0) {
                $codigo = 1;
            } elseif (contar($restante, 'omitida') > 0) {
                $codigo = max($codigo, 2);
            }
        } else {
            if (contar($acciones, 'pendiente') > 0 || contar($acciones, 'omitida') > 0) {
                $codigo = max($codigo, 2);
            }
        }
    } catch (Throwable $e) {
        salida("[ERROR] {$slug}: " . $e->getMessage() . "\n");
        $codigo = 1;
    }
}

if (isset($opt['sql'])) {
    file_put_contents($opt['sql'], $sqlSalida);
    echo "\nSQL pendiente guardado en {$opt['sql']}\n";
}

if ($aplicar) {
    $dir = EsquemaBd::raiz() . DIRECTORY_SEPARATOR . 'tmp' . DIRECTORY_SEPARATOR . 'esquema_bd';
    if (is_dir($dir) || @mkdir($dir, 0775, true)) {
        $log = $dir . DIRECTORY_SEPARATOR . 'esquema_bd_' . date('Ymd_His') . '.log';
        file_put_contents($log, $logBuffer);
        echo "\nRegistro: {$log}\n";
    }
}

exit($codigo);
