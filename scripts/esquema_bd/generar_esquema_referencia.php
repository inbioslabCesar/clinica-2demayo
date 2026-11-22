<?php
/**
 * Genera el esquema de referencia desde la BD de DESARROLLO (solo lectura).
 *
 *   php scripts/esquema_bd/generar_esquema_referencia.php
 *   php scripts/esquema_bd/generar_esquema_referencia.php --origen=desarrollo --salida=ruta.json
 *   php scripts/esquema_bd/generar_esquema_referencia.php --host=127.0.0.1 --puerto=3306 --bd=poli2demayo --usuario=root --clave=
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo línea de comandos.');
}

require_once __DIR__ . '/EsquemaBd.php';

$permitidas = ['origen', 'salida', 'host', 'puerto', 'bd', 'usuario', 'clave', 'ayuda'];
$opt = [];
foreach (array_slice($argv, 1) as $arg) {
    if (!preg_match('/^--([a-z\-]+)(?:=(.*))?$/s', $arg, $m) || !in_array($m[1], $permitidas, true)) {
        fwrite(STDERR, "Opción desconocida: {$arg}\n");
        exit(1);
    }
    $opt[$m[1]] = $m[2] ?? true;
}
if (isset($opt['ayuda'])) {
    echo "Uso: php scripts/esquema_bd/generar_esquema_referencia.php [--origen=desarrollo] [--salida=ruta.json] [--host= --puerto= --bd= --usuario= --clave=]\n";
    exit(0);
}

try {
    $origen = is_string($opt['origen'] ?? null) ? $opt['origen'] : 'desarrollo';
    $cfg = EsquemaBd::cargarConfigEmpresa($origen);
    foreach (['host' => 'host', 'puerto' => 'port', 'bd' => 'name', 'usuario' => 'user', 'clave' => 'pass'] as $o => $k) {
        if (isset($opt[$o]) && is_string($opt[$o])) {
            $cfg[$k] = $o === 'puerto' ? (int)$opt[$o] : $opt[$o];
        }
    }
    $salida = is_string($opt['salida'] ?? null) ? $opt['salida'] : EsquemaBd::rutaReferencia();

    $esquema = new EsquemaBd(EsquemaBd::conectar($cfg));
    echo "Origen : {$origen} ({$cfg['host']}:{$cfg['port']}/{$cfg['name']}) - " . $esquema->versionMotor() . "\n";

    $ref = $esquema->generarReferencia();

    $dir = dirname($salida);
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
        throw new RuntimeException("No se pudo crear {$dir}");
    }
    $json = json_encode($ref, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || file_put_contents($salida, $json . "\n") === false) {
        throw new RuntimeException('No se pudo escribir la referencia.');
    }

    $cols = $idx = $fks = 0;
    foreach ($ref['tablas'] as $t) {
        $cols += count($t['columnas']);
        $idx += count($t['indices']);
        $fks += count($t['fks']);
    }
    $sem = 0;
    foreach ($ref['semillas'] as $filas) {
        $sem += count($filas);
    }
    echo "Salida : {$salida}\n";
    echo 'Tablas: ' . count($ref['tablas']) . " | Columnas: {$cols} | Índices: {$idx} | FKs: {$fks} | Semillas: {$sem}\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, '[ERROR] ' . $e->getMessage() . "\n");
    exit(1);
}
