<?php
// Caracterización del cobro: ejecuta el endpoint REAL api_cobros.php contra una BD clon y compara el resultado
// (normalizado: sin ids, fechas ni marcas de tiempo) con una foto guardada en tests/php/golden/cobro.json.
//
//   POLI_TEST_DB=poli2demayo_test php tests/php/cobro_caracterizacion.php --record   -> graba la foto
//   POLI_TEST_DB=poli2demayo_test php tests/php/cobro_caracterizacion.php            -> compara contra la foto
//
// La BD clon se crea con: npm run test:db:clone  (nunca se ejecuta contra la BD real).

$root = dirname(__DIR__, 2);
$bdPrueba = (string)(getenv('POLI_TEST_DB') ?: 'poli2demayo_test');
if (substr($bdPrueba, -5) !== '_test') {
    fwrite(STDERR, "POLI_TEST_DB debe terminar en _test (crea el clon con: npm run test:db:clone).\n");
    exit(2);
}
define('DB_NAME', $bdPrueba);
define('SKIP_PDO_INIT', true);
ob_start();
require $root . '/config.php';
ob_end_clean();
if (!isset($mysqli) || !$mysqli) {
    fwrite(STDERR, "Sin conexión a la BD clon.\n");
    exit(2);
}
$grabar = in_array('--record', $argv, true);
$archivoFoto = __DIR__ . '/golden/cobro.json';

function api(string $endpoint, string $metodo, $datos): array {
    global $root, $bdPrueba;
    $tmp = tempnam(sys_get_temp_dir(), 'cob');
    file_put_contents($tmp, $metodo === 'GET' ? (string)$datos : json_encode($datos));
    $proc = proc_open(
        [PHP_BINARY, $root . '/tests/php/support/http_harness.php', $endpoint, $metodo, $tmp],
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        $root,
        array_merge(getenv(), ['POLI_TEST_DB' => $bdPrueba])
    );
    $salida = stream_get_contents($pipes[1]);
    stream_get_contents($pipes[2]);
    proc_close($proc);
    @unlink($tmp);
    $json = json_decode(trim($salida), true);
    return is_array($json) ? $json : ['_raw' => substr($salida, 0, 400)];
}

// Fechas únicas por ejecución para no chocar con la agenda de corridas anteriores en el clon.
$base = strtotime('+' . random_int(200, 3000) . ' days');
$fechaCita = date('Y-m-d', $base);
$fechasDinamicas = [$fechaCita => '<fecha_cita>', date('Y-m-d') => '<hoy>'];
$pacienteId = 570;

// La caja abierta debe ser del usuario que simula el arnés (id 18).
$cajaAbierta = $mysqli->query("SELECT id FROM cajas WHERE usuario_id = 18 AND estado = 'abierta' AND fecha = CURDATE() LIMIT 1")->fetch_assoc();
if (!$cajaAbierta) {
    $mysqli->query("INSERT INTO cajas (fecha, usuario_id, turno, estado, monto_apertura, hora_apertura) VALUES (CURDATE(), 18, 'tarde', 'abierta', 0, '08:00:00')");
}

function crearCotizacion(array $detalles, int $pacienteId, string $fechaRef): array {
    $total = array_sum(array_map(fn($d) => $d['subtotal'], $detalles));
    return api('api_cotizaciones.php', 'POST', [
        'client_request_id' => 'carac:' . bin2hex(random_bytes(6)),
        'paciente_id' => $pacienteId, 'total' => $total, 'fecha_ref' => $fechaRef,
        'observaciones' => 'CARACTERIZACION', 'detalles' => $detalles,
    ]);
}

function detallesDeCotizacion(int $cotizacionId): array {
    $r = api('api_cotizaciones.php', 'GET', 'cotizacion_id=' . $cotizacionId);
    $detalles = $r['cotizacion']['detalles'] ?? [];
    return array_values(array_map(function ($d) use ($cotizacionId) {
        $d['cotizacion_id'] = $cotizacionId;
        $d['cotizacion_detalle_id'] = (int)$d['id'];
        $d['detalle_id'] = (int)$d['id'];
        $d['subtotal'] = (float)$d['subtotal'];
        $d['precio_unitario'] = (float)$d['precio_unitario'];
        $d['cantidad'] = (int)$d['cantidad'];
        return $d;
    }, array_filter($detalles, fn($d) => ($d['estado_item'] ?? 'activo') !== 'eliminado')));
}

function payloadCobro(array $cotizacionIds, array $detalles, float $total, array $extra = []): array {
    $montoOriginal = array_sum(array_map(fn($d) => $d['subtotal'], $detalles));
    return array_merge([
        'paciente_id' => $GLOBALS['pacienteId'], 'usuario_id' => 18, 'usuario_nombre' => 'PHP Test',
        'paciente_nombre' => 'PACIENTE PRUEBA', 'paciente_dni' => '00000000', 'referencia_origen' => '',
        'total' => $total, 'monto_original' => $montoOriginal, 'monto_descuento' => max(0, $montoOriginal - $total),
        'tipo_descuento' => 'monto', 'valor_descuento' => 0, 'atencion_solidaria' => false, 'tipo_pago' => 'efectivo',
        'observaciones' => '', 'detalles' => $detalles, 'servicio' => 'mixto',
        'servicio_info' => ['key' => 'mixto', 'label' => 'Cobro', 'cotizacion_ids' => $cotizacionIds],
        'cotizacion_id' => $cotizacionIds[0], 'cotizacion_ids' => $cotizacionIds,
        'modo_cobro' => 'cobro_completo', 'reparto_manual_aplicado' => 0, 'motivo' => '',
        'client_request_id' => 'carac:' . bin2hex(random_bytes(6)),
    ], $extra);
}

// Los ids se sustituyen por marcadores estables (orden de aparición por columna dentro del escenario):
// se conservan las relaciones (qué orden cuelga de qué consulta) sin depender de los números reales.
$registroIds = [];
function marcadorId(string $col, $valor): string {
    global $registroIds;
    $clave = (string)$valor;
    if (!isset($registroIds[$col])) $registroIds[$col] = [];
    if (!isset($registroIds[$col][$clave])) $registroIds[$col][$clave] = count($registroIds[$col]) + 1;
    return "<{$col}#{$registroIds[$col][$clave]}>";
}

// Normaliza una fila: quita marcas de tiempo, sustituye ids y fechas dinámicas por marcadores estables.
function normalizarFila(array $fila, string $tabla = ''): array {
    global $fechasDinamicas;
    $salida = [];
    foreach ($fila as $col => $valor) {
        if (preg_match('/(^id$|^creado|created|updated|_at$|^hora_(apertura|cierre)|ticket|^numero|correlativo|token|^uid$|origen_uid|hash|firma|version_actual|_en$)/i', $col)) continue;
        // La hora del reloj varía en cada corrida; solo la de la consulta es parte del escenario.
        if ($col === 'hora' && $tabla !== 'consultas') continue;
        if (preg_match('/(_id$|_id_|_ids$)/i', $col) && is_numeric($valor) && (int)$valor > 0) {
            $salida[$col] = marcadorId($col, $valor);
            continue;
        }
        // La edad depende de la fecha (aleatoria) de la cita: se conserva solo que se haya guardado.
        if ($col === 'edad_snapshot_valor') $valor = $valor === null ? null : '<edad>';
        // La farmacia sin hora propia toma la del reloj: no es parte del escenario.
        if ($col === 'hora_programada' && strtolower((string)($fila['servicio_tipo'] ?? '')) === 'farmacia') $valor = '<hora_reloj>';
        if (is_string($valor)) {
            $valor = preg_replace('/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/', '<ts>', $valor);
            $valor = preg_replace('/(servicio_tipo[\\\\"]*\s*:\s*[\\\\"]*farmacia.*?hora_programada[\\\\"]*\s*:\s*[\\\\"]*)\d{2}:\d{2}:\d{2}/', '${1}<hora_reloj>', $valor);
            foreach ($fechasDinamicas as $f => $marca) $valor = str_replace($f, $marca, $valor);
            $valor = preg_replace('/(id[\\\\"\']*\s*[:=]\s*)\d+/i', '${1}N', $valor);
            $valor = preg_replace('/#\d+/', '#N', $valor);
            $valor = preg_replace('/Q\d{6}/', 'QNNNNNN', $valor);
        }
        $salida[$col] = $valor;
    }
    ksort($salida);
    return $salida;
}

function filasDe($mysqli, string $tabla, string $columna, array $ids): array {
    if (!$ids) return [];
    $in = implode(',', array_map('intval', $ids));
    $r = $mysqli->query("SELECT * FROM `$tabla` WHERE `$columna` IN ($in)");
    $filas = $r ? array_map(fn($f) => normalizarFila($f, $tabla), $r->fetch_all(MYSQLI_ASSOC)) : [];
    usort($filas, fn($a, $b) => strcmp(json_encode($a), json_encode($b)));
    return $filas;
}

// Foto del estado: todas las tablas con cotizacion_id / cobro_id / consulta_id vinculadas al escenario.
function fotoEstado($mysqli, array $cotizacionIds, array $cobroIds): array {
    $foto = [];
    $cotIn = implode(',', array_map('intval', $cotizacionIds));
    $consultaIds = [];
    $r = $mysqli->query("SELECT DISTINCT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id IN ($cotIn) AND consulta_id > 0");
    while ($f = $r->fetch_assoc()) $consultaIds[] = (int)$f['consulta_id'];

    $columnas = [];
    $r = $mysqli->query("SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('cotizacion_id','cobro_id') AND TABLE_NAME NOT LIKE 'bkp%' AND TABLE_NAME NOT LIKE 'zfix%' AND TABLE_NAME NOT LIKE '%_bak'");
    while ($f = $r->fetch_assoc()) $columnas[] = [$f['t'], $f['c']];
    foreach ($columnas as [$tabla, $col]) {
        $filas = filasDe($mysqli, $tabla, $col, $col === 'cotizacion_id' ? $cotizacionIds : $cobroIds);
        if ($filas) $foto["$tabla.$col"] = $filas;
    }
    $filas = filasDe($mysqli, 'consultas', 'id', $consultaIds);
    if ($filas) $foto['consultas'] = $filas;
    ksort($foto);
    return $foto;
}

function limpiarRespuesta(array $r): array {
    $r = normalizarFila($r);
    foreach (['cotizacion_id', 'cobro_id', 'ids'] as $k) unset($r[$k]);
    return $r;
}

function idsCobro($mysqli, array $cotizacionIds): array {
    $in = implode(',', array_map('intval', $cotizacionIds));
    $r = $mysqli->query("SELECT DISTINCT cobro_id FROM cobros_cotizaciones WHERE cotizacion_id IN ($in)");
    $ids = [];
    while ($f = $r->fetch_assoc()) $ids[] = (int)$f['cobro_id'];
    return $ids;
}

$escenarios = [];
$problemas = [];

$ejecutar = function (string $nombre, callable $fn) use (&$escenarios, &$problemas) {
    $GLOBALS['registroIds'] = [];
    try {
        $escenarios[$nombre] = $fn();
    } catch (Throwable $e) {
        $problemas[] = "$nombre: " . $e->getMessage();
    }
};

$detConsultaEco = function (string $hora) use ($fechaCita) {
    return [
        ['servicio_tipo' => 'consulta', 'servicio_id' => 134, 'descripcion' => "CONSULTA CIRUGIA GENERAL - L. HILDEMARO TECCO DAVILA ($fechaCita $hora)", 'cantidad' => 1, 'precio_unitario' => 70, 'subtotal' => 70, 'medico_id' => 1, 'fecha_programada' => $fechaCita, 'hora_programada' => $hora],
        ['servicio_tipo' => 'ecografia', 'servicio_id' => 3, 'descripcion' => 'ECOGRAFIA MUSCULO ESQUELETICO', 'cantidad' => 1, 'precio_unitario' => 120, 'subtotal' => 120, 'medico_id' => 1, 'fecha_programada' => $fechaCita, 'hora_programada' => $hora],
        ['servicio_tipo' => 'laboratorio', 'servicio_id' => 1, 'descripcion' => 'LIPASA', 'cantidad' => 1, 'precio_unitario' => 70, 'subtotal' => 70, 'fecha_programada' => $fechaCita, 'hora_programada' => $hora],
    ];
};

$ejecutar('01_cobro_completo_consulta_eco_lab', function () use ($mysqli, $pacienteId, $fechaCita, $detConsultaEco) {
    $cot = crearCotizacion($detConsultaEco('08:00'), $pacienteId, $fechaCita);
    if (empty($cot['cotizacion_id'])) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $cid = (int)$cot['cotizacion_id'];
    $detalles = detallesDeCotizacion($cid);
    $resp = api('api_cobros.php', 'POST', payloadCobro([$cid], $detalles, 260));
    $cobros = idsCobro($GLOBALS['mysqli'], [$cid]);
    return ['respuesta' => limpiarRespuesta($resp), 'estado' => fotoEstado($mysqli, [$cid], $cobros)];
});

$ejecutar('02_abono_parcial_luego_saldo', function () use ($mysqli, $pacienteId, $fechaCita, $detConsultaEco) {
    $cot = crearCotizacion($detConsultaEco('09:00'), $pacienteId, $fechaCita);
    if (empty($cot['cotizacion_id'])) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $cid = (int)$cot['cotizacion_id'];
    $detalles = detallesDeCotizacion($cid);
    $abono = api('api_cobros.php', 'POST', payloadCobro([$cid], $detalles, 100, ['modo_cobro' => 'adelanto_manual']));
    $parcial = fotoEstado($mysqli, [$cid], idsCobro($mysqli, [$cid]));
    $detalles2 = detallesDeCotizacion($cid);
    $resto = api('api_cobros.php', 'POST', payloadCobro([$cid], $detalles2, 160));
    return [
        'abono' => limpiarRespuesta($abono), 'estado_tras_abono' => $parcial,
        'saldo' => limpiarRespuesta($resto), 'estado_final' => fotoEstado($mysqli, [$cid], idsCobro($mysqli, [$cid])),
    ];
});

$ejecutar('03_cobro_con_descuento', function () use ($mysqli, $pacienteId, $fechaCita, $detConsultaEco) {
    $cot = crearCotizacion($detConsultaEco('10:00'), $pacienteId, $fechaCita);
    if (empty($cot['cotizacion_id'])) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $cid = (int)$cot['cotizacion_id'];
    $detalles = detallesDeCotizacion($cid);
    $resp = api('api_cobros.php', 'POST', payloadCobro([$cid], $detalles, 234, ['tipo_descuento' => 'porcentaje', 'valor_descuento' => 10, 'motivo' => 'Descuento de prueba']));
    return ['respuesta' => limpiarRespuesta($resp), 'estado' => fotoEstado($mysqli, [$cid], idsCobro($mysqli, [$cid]))];
});

$ejecutar('04_cobro_unificado_base_y_adenda', function () use ($mysqli, $pacienteId, $fechaCita, $detConsultaEco) {
    $cot = crearCotizacion($detConsultaEco('11:00'), $pacienteId, $fechaCita);
    if (empty($cot['cotizacion_id'])) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $base = (int)$cot['cotizacion_id'];
    $adenda = api('api_cotizaciones.php', 'POST', [
        'accion' => 'adenda', 'cotizacion_id' => $base, 'fecha_ref' => $fechaCita, 'motivo' => 'CARACTERIZACION',
        'detalles' => [['servicio_tipo' => 'laboratorio', 'servicio_id' => 2, 'descripcion' => 'PAPANICOLAO(PAP)', 'cantidad' => 1, 'precio_unitario' => 110, 'subtotal' => 110, 'fecha_programada' => $fechaCita, 'hora_programada' => '11:00']],
    ]);
    if (empty($adenda['cotizacion_id'])) throw new Exception('no se creó la adenda: ' . json_encode($adenda));
    $ad = (int)$adenda['cotizacion_id'];
    $detalles = array_merge(detallesDeCotizacion($base), detallesDeCotizacion($ad));
    $resp = api('api_cobros.php', 'POST', payloadCobro([$base, $ad], $detalles, 370));
    return ['respuesta' => limpiarRespuesta($resp), 'estado' => fotoEstado($mysqli, [$base, $ad], idsCobro($mysqli, [$base, $ad]))];
});

$ejecutar('05_reintento_mismo_client_request_id', function () use ($mysqli, $pacienteId, $fechaCita, $detConsultaEco) {
    $cot = crearCotizacion($detConsultaEco('12:00'), $pacienteId, $fechaCita);
    if (empty($cot['cotizacion_id'])) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $cid = (int)$cot['cotizacion_id'];
    $detalles = detallesDeCotizacion($cid);
    $payload = payloadCobro([$cid], $detalles, 260);
    $a = api('api_cobros.php', 'POST', $payload);
    $b = api('api_cobros.php', 'POST', $payload);
    return [
        'primero' => limpiarRespuesta($a), 'reintento' => limpiarRespuesta($b),
        'cobros_creados' => count(idsCobro($mysqli, [$cid])),
    ];
});

$ejecutar('06_cotizacion_ya_pagada_no_admite_cobro', function () use ($mysqli, $pacienteId, $fechaCita, $detConsultaEco) {
    $cot = crearCotizacion($detConsultaEco('13:00'), $pacienteId, $fechaCita);
    if (empty($cot['cotizacion_id'])) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $cid = (int)$cot['cotizacion_id'];
    $detalles = detallesDeCotizacion($cid);
    api('api_cobros.php', 'POST', payloadCobro([$cid], $detalles, 260));
    $otra = api('api_cobros.php', 'POST', payloadCobro([$cid], $detalles, 260));
    return ['segundo_cobro' => limpiarRespuesta($otra), 'cobros_creados' => count(idsCobro($mysqli, [$cid]))];
});

// Comportamiento actual (documentado, no necesariamente deseable): reprogramar a una hora ocupada por otro paciente NO bloquea,
// porque la agenda propia se mueve primero y el validador exime a quien ya tiene su agenda en ese horario.
$ejecutar('07_reprogramar_a_hora_ocupada_hoy_no_bloquea', function () use ($mysqli, $pacienteId, $fechaCita) {
    $eco = fn(string $hora) => [[
        'servicio_tipo' => 'ecografia', 'servicio_id' => 3, 'descripcion' => 'ECOGRAFIA MUSCULO ESQUELETICO', 'cantidad' => 1,
        'precio_unitario' => 120, 'subtotal' => 120, 'medico_id' => 1, 'fecha_programada' => $fechaCita, 'hora_programada' => $hora,
    ]];
    // La validación de choques solo aplica a servicios ligados a una consulta: la segunda cotización la incluye.
    $conConsulta = fn(string $hora) => array_merge([[
        'servicio_tipo' => 'consulta', 'servicio_id' => 134, 'descripcion' => "CONSULTA CIRUGIA GENERAL - L. HILDEMARO TECCO DAVILA ($fechaCita $hora)", 'cantidad' => 1,
        'precio_unitario' => 70, 'subtotal' => 70, 'medico_id' => 1, 'fecha_programada' => $fechaCita, 'hora_programada' => $hora,
    ]], $eco($hora));
    $otroPaciente = (int)$mysqli->query("SELECT id FROM pacientes WHERE id <> $pacienteId ORDER BY id LIMIT 1")->fetch_assoc()['id'];
    $a = crearCotizacion($eco('15:00'), $pacienteId, $fechaCita);
    $b = crearCotizacion($conConsulta('16:00'), $otroPaciente, $fechaCita);
    $ida = (int)($a['cotizacion_id'] ?? 0);
    $idb = (int)($b['cotizacion_id'] ?? 0);
    if ($ida <= 0 || $idb <= 0 || $ida === $idb) throw new Exception('no se crearon dos cotizaciones distintas: ' . json_encode([$a, $b]));
    $primero = api('api_cobros.php', 'POST', payloadCobro([$ida], detallesDeCotizacion($ida), 120));
    $detallesB = detallesDeCotizacion($idb);
    $idEco = 0;
    foreach ($detallesB as $d) { if ($d['servicio_tipo'] === 'ecografia') $idEco = (int)$d['id']; }
    $reprogramar = ['reprogramacion_horaria' => [(string)$idEco => ['fecha_programada' => $fechaCita, 'hora_programada' => '15:00:00']], 'paciente_id' => $otroPaciente];
    $segundo = api('api_cobros.php', 'POST', payloadCobro([$idb], $detallesB, 190, $reprogramar));
    $r = limpiarRespuesta($segundo);
    if (isset($segundo['conflictos'])) {
        $r['conflictos'] = array_map(function ($c) { unset($c['horarios_sugeridos']); return normalizarFila((array)$c); }, (array)$segundo['conflictos']);
    }
    return ['primero' => limpiarRespuesta($primero), 'segundo' => $r, 'estado_b' => fotoEstado($mysqli, [$idb], [])];
});

$ejecutar('08_reprogramar_a_hora_libre_cobra_y_mueve_agenda', function () use ($mysqli, $pacienteId, $fechaCita) {
    $conConsulta = [
        ['servicio_tipo' => 'consulta', 'servicio_id' => 134, 'descripcion' => "CONSULTA CIRUGIA GENERAL - L. HILDEMARO TECCO DAVILA ($fechaCita 18:00)", 'cantidad' => 1, 'precio_unitario' => 70, 'subtotal' => 70, 'medico_id' => 1, 'fecha_programada' => $fechaCita, 'hora_programada' => '18:00'],
        ['servicio_tipo' => 'ecografia', 'servicio_id' => 3, 'descripcion' => 'ECOGRAFIA MUSCULO ESQUELETICO', 'cantidad' => 1, 'precio_unitario' => 120, 'subtotal' => 120, 'medico_id' => 1, 'fecha_programada' => $fechaCita, 'hora_programada' => '18:00'],
    ];
    $cot = crearCotizacion($conConsulta, $pacienteId, $fechaCita);
    $cid = (int)($cot['cotizacion_id'] ?? 0);
    if ($cid <= 0) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $detalles = detallesDeCotizacion($cid);
    $reprogramacion = [];
    foreach ($detalles as $d) { if ($d['servicio_tipo'] === 'ecografia') $reprogramacion[(string)$d['id']] = ['fecha_programada' => $fechaCita, 'hora_programada' => '19:00:00']; }
    $resp = api('api_cobros.php', 'POST', payloadCobro([$cid], $detalles, 190, ['reprogramacion_horaria' => $reprogramacion]));
    return ['respuesta' => limpiarRespuesta($resp), 'estado' => fotoEstado($mysqli, [$cid], idsCobro($mysqli, [$cid]))];
});

$ejecutar('09_cobro_de_farmacia_descuenta_stock', function () use ($mysqli, $pacienteId, $fechaCita) {
    $stock = fn() => (int)$mysqli->query("SELECT stock FROM medicamentos WHERE id = 195")->fetch_assoc()['stock'];
    $antes = $stock();
    $cot = crearCotizacion([
        ['servicio_tipo' => 'farmacia', 'servicio_id' => 195, 'descripcion' => 'CIPROFLOXACINO (MED16356)', 'cantidad' => 4, 'precio_unitario' => 0.5, 'subtotal' => 2.0, 'fecha_programada' => $fechaCita],
    ], $pacienteId, $fechaCita);
    $cid = (int)($cot['cotizacion_id'] ?? 0);
    if ($cid <= 0) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $resp = api('api_cobros.php', 'POST', payloadCobro([$cid], detallesDeCotizacion($cid), 2, ['servicio' => 'farmacia', 'servicio_info' => ['key' => 'farmacia', 'label' => 'Farmacia', 'cotizacion_ids' => [$cid]]]));
    return ['respuesta' => limpiarRespuesta($resp), 'stock_descontado' => $antes - $stock(), 'estado' => fotoEstado($mysqli, [$cid], idsCobro($mysqli, [$cid]))];
});

$ejecutar('10_atencion_solidaria_cobro_cero_sin_honorario', function () use ($mysqli, $pacienteId, $fechaCita, $detConsultaEco) {
    $cot = crearCotizacion($detConsultaEco('14:00'), $pacienteId, $fechaCita);
    if (empty($cot['cotizacion_id'])) throw new Exception('no se creó la cotización: ' . json_encode($cot));
    $cid = (int)$cot['cotizacion_id'];
    $detalles = detallesDeCotizacion($cid);
    $resp = api('api_cobros.php', 'POST', payloadCobro([$cid], $detalles, 0, ['atencion_solidaria' => true, 'motivo' => 'Atencion solidaria de prueba', 'tipo_descuento' => 'monto', 'valor_descuento' => 260]));
    return ['respuesta' => limpiarRespuesta($resp), 'estado' => fotoEstado($mysqli, [$cid], idsCobro($mysqli, [$cid]))];
});

if ($problemas) {
    fwrite(STDERR, "Escenarios con problemas de preparación:\n - " . implode("\n - ", $problemas) . "\n");
}

$actual = json_encode($escenarios, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
if ($grabar) {
    @mkdir(dirname($archivoFoto), 0777, true);
    file_put_contents($archivoFoto, $actual . "\n");
    echo "Foto grabada: " . count($escenarios) . " escenarios en tests/php/golden/cobro.json\n";
    exit($problemas ? 1 : 0);
}
if (!is_file($archivoFoto)) {
    fwrite(STDERR, "No existe la foto; ejecuta con --record primero.\n");
    exit(2);
}
$esperado = json_decode(file_get_contents($archivoFoto), true);
$fallos = 0;
foreach ($esperado as $nombre => $foto) {
    if (!isset($escenarios[$nombre])) { echo "  ✖ $nombre (no se pudo ejecutar)\n"; $fallos++; continue; }
    if (json_encode($foto) === json_encode($escenarios[$nombre])) {
        echo "  ✔ $nombre\n";
    } else {
        $fallos++;
        echo "  ✖ $nombre\n";
        $a = json_encode($foto, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        $b = json_encode($escenarios[$nombre], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        $la = explode("\n", $a); $lb = explode("\n", $b);
        $mostrados = 0;
        for ($i = 0; $i < max(count($la), count($lb)) && $mostrados < 6; $i++) {
            if (($la[$i] ?? '') !== ($lb[$i] ?? '')) {
                echo "      esperado: " . trim($la[$i] ?? '') . "\n      actual:   " . trim($lb[$i] ?? '') . "\n";
                $mostrados++;
            }
        }
    }
}
echo "\n" . (count($esperado) - $fallos) . " iguales, $fallos distintos\n";
exit($fallos > 0 || $problemas ? 1 : 0);
