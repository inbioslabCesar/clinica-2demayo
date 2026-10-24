<?php
// Runner mínimo de pruebas PHP (sin dependencias).
//   php tests/php/run.php          -> pruebas unitarias (sin BD)
//   php tests/php/run.php --db     -> además, pruebas contra la BD de desarrollo (crean y borran sus propios datos)
$root = dirname(__DIR__, 2);
$conBd = in_array('--db', $argv, true) || getenv('RUN_DB_TESTS') === '1';
$marcador = 'PHPTEST_DELETE_ME';

$pruebas = [];
function prueba(string $nombre, callable $fn, bool $requiereBd = false): void {
    global $pruebas;
    $pruebas[] = [$nombre, $fn, $requiereBd];
}
function iguales($esperado, $actual, string $msg = ''): void {
    if ($esperado !== $actual) {
        throw new RuntimeException(($msg !== '' ? $msg . ' - ' : '') . 'esperado ' . var_export($esperado, true) . ', obtenido ' . var_export($actual, true));
    }
}
function verdadero($cond, string $msg = 'se esperaba true'): void {
    if (!$cond) throw new RuntimeException($msg);
}

require_once $root . '/modules/AgendaMedicoRegla.php';
require_once $root . '/modules/EpisodioAtencionModule.php';

/* ───────── Unitarias: regla "qué servicios ocupan al médico" ───────── */

prueba('los servicios que realiza el médico ocupan su horario', function () {
    $tipos = agenda_tipos_servicio_ocupan_medico();
    foreach (['consulta', 'ecografia', 'rayosx', 'rx', 'procedimiento', 'operacion', 'cirugia'] as $t) {
        verdadero(in_array($t, $tipos, true), "$t debería ocupar al médico");
    }
});

prueba('laboratorio, farmacia y líneas de paquete no ocupan al médico', function () {
    $tipos = agenda_tipos_servicio_ocupan_medico();
    foreach (['laboratorio', 'farmacia', 'paquete', 'perfil', 'otros'] as $t) {
        verdadero(!in_array($t, $tipos, true), "$t no debería ocupar al médico");
    }
});

prueba('el fragmento SQL respeta el alias de tabla', function () {
    verdadero(strpos(agenda_sql_servicio_ocupa_medico('a'), 'a.servicio_tipo') !== false);
    $sinAlias = agenda_sql_servicio_ocupa_medico('');
    verdadero(strpos($sinAlias, 'servicio_tipo') !== false && strpos($sinAlias, '.servicio_tipo') === false);
    verdadero(strpos(agenda_sql_evento_ocupa_medico('a'), 'a.estado_evento') !== false);
    verdadero(strpos(agenda_sql_consulta_ocupa_medico('c'), 'c.estado') !== false);
});

prueba('estados que liberan el turno: cancelado/anulado/completado/atendido no ocupan', function () {
    foreach (['cancelada', 'anulada', 'completada'] as $e) {
        verdadero(in_array($e, agenda_estados_consulta_liberan(), true), "consulta $e libera");
    }
    foreach (['cancelado', 'no_asistio', 'anulada', 'completado', 'atendido'] as $e) {
        verdadero(in_array($e, agenda_estados_evento_liberan(), true), "evento $e libera");
    }
    foreach (['pendiente', 'confirmado'] as $e) {
        verdadero(!in_array($e, agenda_estados_evento_liberan(), true), "evento $e ocupa");
    }
    foreach (['pendiente', 'falta_cancelar'] as $e) {
        verdadero(!in_array($e, agenda_estados_consulta_liberan(), true), "consulta $e ocupa");
    }
});

/* ───────── Con BD: ejecuta el SQL real y los endpoints ───────── */

function ejecutarApi(string $endpoint, string $metodo, string $payload): array {
    global $root;
    $tmp = tempnam(sys_get_temp_dir(), 'pt');
    file_put_contents($tmp, $payload);
    $cmd = [PHP_BINARY, $root . '/tests/php/support/http_harness.php', $endpoint, $metodo, $tmp];
    $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $salida = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);
    @unlink($tmp);
    return json_decode(trim($salida), true) ?: ['_raw' => $salida];
}

function ejecutarApiEnParalelo(string $endpoint, string $payload, int $n): array {
    global $root;
    $procesos = [];
    for ($i = 0; $i < $n; $i++) {
        $tmp = tempnam(sys_get_temp_dir(), 'pt');
        file_put_contents($tmp, $payload);
        $cmd = [PHP_BINARY, $root . '/tests/php/support/http_harness.php', $endpoint, 'POST', $tmp];
        $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $procesos[] = [$proc, $pipes, $tmp];
    }
    $respuestas = [];
    foreach ($procesos as [$proc, $pipes, $tmp]) {
        $respuestas[] = json_decode(trim(stream_get_contents($pipes[1])), true) ?: [];
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        @unlink($tmp);
    }
    return $respuestas;
}

function payloadCotizacion(string $clientRequestId): string {
    global $marcador;
    return json_encode([
        'client_request_id' => $clientRequestId,
        'paciente_id' => 0,
        'paciente_nombre' => 'PHPTEST',
        'modo_cotizacion' => 'informativa',
        'solo_ticket' => 1,
        'total' => 10,
        'fecha_ref' => date('Y-m-d'),
        'observaciones' => $marcador,
        'detalles' => [['servicio_tipo' => 'procedimiento', 'servicio_id' => 999999, 'descripcion' => 'PHPTEST', 'cantidad' => 1, 'precio_unitario' => 10, 'subtotal' => 10]],
    ]);
}

function limpiarDatosDePrueba($mysqli): void {
    global $marcador;
    $like = "'%" . $mysqli->real_escape_string($marcador) . "%'";
    $ids = [];
    $r = $mysqli->query("SELECT id FROM cotizaciones WHERE observaciones LIKE $like");
    while ($row = $r->fetch_assoc()) $ids[] = (int)$row['id'];
    if (!$ids) return;
    $in = implode(',', $ids);
    $t = $mysqli->query("SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'cotizacion_id'");
    while ($row = $t->fetch_assoc()) {
        $mysqli->query("DELETE FROM `{$row['TABLE_NAME']}` WHERE cotizacion_id IN ($in)");
    }
    $mysqli->query("DELETE FROM cotizaciones WHERE id IN ($in) AND observaciones LIKE $like");
}

prueba('el fragmento SQL filtra filas reales de agenda por tipo de servicio', function () {
    global $mysqli;
    $tipos = ['consulta', 'ecografia', 'rayosx', 'procedimiento', 'operacion', 'laboratorio', 'paquete', 'farmacia'];
    $union = implode(' UNION ALL ', array_map(fn($t) => "SELECT '$t' AS servicio_tipo", $tipos));
    $r = $mysqli->query("SELECT a.servicio_tipo FROM ($union) a WHERE " . agenda_sql_servicio_ocupa_medico('a') . ' ORDER BY a.servicio_tipo');
    $obtenidos = array_column($r->fetch_all(MYSQLI_ASSOC), 'servicio_tipo');
    iguales(['consulta', 'ecografia', 'operacion', 'procedimiento', 'rayosx'], $obtenidos);
}, true);

prueba('los filtros de estado en SQL real dejan solo consultas y eventos activos', function () {
    global $mysqli;
    $uniones = fn(array $v, string $col) => implode(' UNION ALL ', array_map(fn($x) => "SELECT '$x' AS $col", $v));
    $c = $mysqli->query('SELECT estado FROM (' . $uniones(['pendiente', 'falta_cancelar', 'cancelada', 'anulada', 'completada'], 'estado') . ') c WHERE ' . agenda_sql_consulta_ocupa_medico('c') . ' ORDER BY estado');
    iguales(['falta_cancelar', 'pendiente'], array_column($c->fetch_all(MYSQLI_ASSOC), 'estado'));
    $e = $mysqli->query('SELECT estado_evento FROM (' . $uniones(['pendiente', 'confirmado', 'atendido', 'cancelado', 'no_asistio', 'anulada'], 'estado_evento') . ') a WHERE ' . agenda_sql_evento_ocupa_medico('a') . ' ORDER BY estado_evento');
    iguales(['confirmado', 'pendiente'], array_column($e->fetch_all(MYSQLI_ASSOC), 'estado_evento'));
}, true);

prueba('cotización: el mismo client_request_id devuelve la misma cotización', function () {
    global $mysqli;
    $id = 'phptest:' . bin2hex(random_bytes(8));
    $a = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion($id));
    $b = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion($id));
    verdadero(($a['success'] ?? false) === true, 'primer envío: ' . json_encode($a));
    iguales(false, $a['duplicate'], 'el primer envío no es duplicado');
    iguales($a['cotizacion_id'], $b['cotizacion_id'], 'misma cotización');
    iguales(true, $b['duplicate'], 'el segundo envío se marca duplicado');
    $n = (int)$mysqli->query("SELECT COUNT(*) c FROM cotizaciones WHERE client_request_id = '$id'")->fetch_assoc()['c'];
    iguales(1, $n, 'solo una fila en BD');
}, true);

prueba('cotización: distintos client_request_id crean cotizaciones distintas', function () {
    $a = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion('phptest:' . bin2hex(random_bytes(8))));
    $b = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion('phptest:' . bin2hex(random_bytes(8))));
    verdadero(($a['success'] ?? false) && ($b['success'] ?? false), 'ambas se registran');
    verdadero($a['cotizacion_id'] !== $b['cotizacion_id'], 'ids distintos');
}, true);

prueba('cotización: 4 envíos simultáneos con el mismo id crean una sola cotización', function () {
    global $mysqli;
    $id = 'phptest:' . bin2hex(random_bytes(8));
    $respuestas = ejecutarApiEnParalelo('api_cotizaciones.php', payloadCotizacion($id), 4);
    $ids = array_unique(array_map(fn($r) => $r['cotizacion_id'] ?? null, $respuestas));
    iguales(1, count($ids), 'todas apuntan a la misma cotización: ' . json_encode($respuestas));
    $creadas = count(array_filter($respuestas, fn($r) => ($r['duplicate'] ?? true) === false));
    iguales(1, $creadas, 'solo una la crea');
    $n = (int)$mysqli->query("SELECT COUNT(*) c FROM cotizaciones WHERE client_request_id = '$id'")->fetch_assoc()['c'];
    iguales(1, $n, 'solo una fila en BD');
}, true);

prueba('cotización: client_request_id inválido no bloquea el registro', function () {
    $a = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion('id con espacios y !!'));
    verdadero(($a['success'] ?? false) === true, json_encode($a));
}, true);

prueba('episodio: la consulta de una adenda adopta los servicios huérfanos de la cotización base', function () {
    global $mysqli, $marcador;
    $consultaId = (int)($mysqli->query('SELECT id FROM consultas ORDER BY id DESC LIMIT 1')->fetch_assoc()['id'] ?? 0);
    verdadero($consultaId > 0, 'se necesita una consulta existente como referencia');
    $obs = $mysqli->real_escape_string($marcador);

    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (0, 18, 100, 'pagado', '$obs')");
    $baseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES (0, 18, 50, 'pagado', '$obs', $baseId, 1)");
    $adendaId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES ($baseId, 'ecografia', 'PHPTEST eco', 1, 90, 90), ($baseId, 'laboratorio', 'PHPTEST lab', 1, 10, 10), ($baseId, 'farmacia', 'PHPTEST farm', 1, 5, 5)");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, consulta_id) VALUES ($adendaId, 'consulta', 'PHPTEST consulta', 1, 50, 50, $consultaId)");
    $mysqli->query("INSERT INTO bloques_atencion (paciente_id, consulta_origen_id, fecha_base) VALUES (0, NULL, CURDATE())");
    $bloqueId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO bloques_atencion_cotizaciones (bloque_id, cotizacion_id) VALUES ($bloqueId, $baseId), ($bloqueId, $adendaId)");

    try {
        $r = episodio_adoptar_servicios_en_consulta($mysqli, $adendaId, $consultaId);
        iguales(2, $r['detalles'], 'eco y laboratorio quedan asociados (la farmacia no)');
        iguales(1, $r['bloques'], 'el bloque toma la consulta como origen');
        $farm = $mysqli->query("SELECT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = $baseId AND servicio_tipo = 'farmacia'")->fetch_assoc();
        verdadero($farm['consulta_id'] === null, 'la farmacia no se asocia');
        $eco = $mysqli->query("SELECT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = $baseId AND servicio_tipo = 'ecografia'")->fetch_assoc();
        iguales($consultaId, (int)$eco['consulta_id']);
        $b = $mysqli->query("SELECT consulta_origen_id FROM bloques_atencion WHERE id = $bloqueId")->fetch_assoc();
        iguales($consultaId, (int)$b['consulta_origen_id']);

        $otraConsulta = $consultaId + 1000000;
        $r2 = episodio_adoptar_servicios_en_consulta($mysqli, $adendaId, $otraConsulta);
        iguales(0, $r2['detalles'] + $r2['ordenes'] + $r2['bloques'], 'no reasigna lo que ya tiene consulta');
        $cadena = episodio_cotizaciones_cadena_ids($mysqli, $adendaId);
        sort($cadena);
        iguales([$baseId, $adendaId], $cadena, 'la cadena incluye base y adenda');
    } finally {
        $mysqli->query("DELETE FROM bloques_atencion WHERE id = $bloqueId");
    }
}, true);

prueba('episodio: sin adendas no hay nada que adoptar', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (0, 18, 10, 'pagado', '$obs')");
    $id = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES ($id, 'ecografia', 'PHPTEST eco', 1, 10, 10)");
    $r = episodio_adoptar_servicios_en_consulta($mysqli, $id, 1);
    iguales(0, $r['detalles'] + $r['ordenes'] + $r['bloques']);
}, true);

prueba('episodio: adenda con detalle de consulta se une al bloque de la cotización base', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 90, 'pagado', '$obs')");
    $baseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, medico_id) VALUES ($baseId, 'ecografia', 'PHPTEST eco', 1, 90, 90, 1)");
    $detalleBaseId = (int)$mysqli->insert_id;
    $manana = date('Y-m-d', strtotime('+1 day'));
    $mysqli->query("INSERT INTO agenda_servicios_cotizacion (cotizacion_id, cotizacion_detalle_id, paciente_id, servicio_tipo, titulo_evento, medico_id, fecha_programada, hora_programada, estado_evento) VALUES ($baseId, $detalleBaseId, $paciente, 'ecografia', 'PHPTEST', 1, '$manana', '08:30:00', 'confirmado')");
    $mysqli->query("INSERT INTO bloques_atencion (paciente_id, consulta_origen_id, fecha_base) VALUES ($paciente, NULL, CURDATE())");
    $bloqueBase = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO bloques_atencion_cotizaciones (bloque_id, cotizacion_id) VALUES ($bloqueBase, $baseId)");

    try {
        $r = ejecutarApi('api_cotizaciones.php', 'POST', json_encode([
            'accion' => 'adenda',
            'cotizacion_id' => $baseId,
            'fecha_ref' => $manana,
            'observaciones' => $marcador,
            'motivo' => 'PHPTEST',
            'detalles' => [[
                'servicio_tipo' => 'consulta', 'servicio_id' => 999999, 'descripcion' => 'PHPTEST consulta',
                'cantidad' => 1, 'precio_unitario' => 70, 'subtotal' => 70, 'medico_id' => 1,
                'fecha_programada' => $manana, 'hora_programada' => '08:30',
            ]],
        ]));
        verdadero(($r['success'] ?? false) === true, 'adenda: ' . json_encode($r));
        $adendaId = (int)$r['cotizacion_id'];
        $padre = (int)$mysqli->query("SELECT cotizacion_padre_id p FROM cotizaciones WHERE id = $adendaId")->fetch_assoc()['p'];
        iguales($baseId, $padre, 'la adenda cuelga de la base');
        $bloqueAdenda = (int)$mysqli->query("SELECT bloque_id b FROM bloques_atencion_cotizaciones WHERE cotizacion_id = $adendaId")->fetch_assoc()['b'];
        iguales($bloqueBase, $bloqueAdenda, 'misma atención/bloque que la cotización base');
    } finally {
        $mysqli->query("DELETE FROM bloques_atencion WHERE paciente_id = $paciente");
    }
}, true);

prueba('episodio: el cobro sugiere la adenda pendiente y la consulta se crea con la fecha de su descripción', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 90, 'pagado', '$obs')");
    $baseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES ($paciente, 18, 70, 'pendiente', '$obs', $baseId, 1)");
    $adendaId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES ($baseId, 'ecografia', 'PHPTEST eco', 1, 90, 90)");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, medico_id) VALUES ($adendaId, 'consulta', 'PHPTEST consulta (2099-01-02 08:30)', 1, 70, 70, 1)");
    $consultaId = 0;
    try {
        foreach ([$baseId, $adendaId] as $desde) {
            $g = ejecutarApi('api_cotizaciones.php', 'GET', "accion=sugerir_grupo_cobro&cotizacion_id=$desde");
            iguales([$adendaId], $g['ids'] ?? null, "grupo sugerido desde #$desde");
        }

        $c = ejecutarApi('api_cotizaciones.php', 'POST', json_encode(['accion' => 'crear_consulta_desde_cotizacion', 'cotizacion_id' => $adendaId]));
        verdadero(($c['success'] ?? false) === true, json_encode($c));
        $consultaId = (int)$mysqli->query("SELECT consulta_id c FROM cotizaciones_detalle WHERE cotizacion_id = $adendaId")->fetch_assoc()['c'];
        verdadero($consultaId > 0, 'la consulta quedó vinculada al detalle');
        $fila = $mysqli->query("SELECT fecha, hora FROM consultas WHERE id = $consultaId")->fetch_assoc();
        iguales('2099-01-02', $fila['fecha']);
        iguales('08:30:00', $fila['hora']);
    } finally {
        $mysqli->query("DELETE FROM bloques_atencion WHERE paciente_id = $paciente");
        if ($consultaId > 0) {
            $mysqli->query("DELETE FROM consultas WHERE id = $consultaId AND paciente_id = $paciente");
        }
    }
}, true);

/* ───────── Ejecución ───────── */

$bd = null;
if ($conBd) {
    ob_start();
    define('SKIP_PDO_INIT', true);
    require $root . '/config.php';
    ob_end_clean();
    $bd = $mysqli ?? null;
    if (!$bd) {
        fwrite(STDERR, "No hay conexión a la BD: se omiten las pruebas con --db\n");
        $conBd = false;
    } else {
        $GLOBALS['mysqli'] = $bd;
        $tieneColumna = (int)$bd->query("SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'client_request_id'")->fetch_assoc()['c'] === 1;
        if (!$tieneColumna) {
            fwrite(STDERR, "Falta cotizaciones.client_request_id: aplica sql/2026-10-24/001_schema.sql antes de las pruebas con --db\n");
            exit(2);
        }
        limpiarDatosDePrueba($bd);
    }
}

$ok = 0; $fallo = 0; $omitidas = 0;
foreach ($pruebas as [$nombre, $fn, $requiereBd]) {
    if ($requiereBd && !$conBd) {
        $omitidas++;
        echo "  - omitida (requiere --db): $nombre\n";
        continue;
    }
    try {
        $fn();
        $ok++;
        echo "  ✔ $nombre\n";
    } catch (Throwable $e) {
        $fallo++;
        echo "  ✖ $nombre\n      " . $e->getMessage() . "\n";
    }
}
if ($conBd && $bd) {
    limpiarDatosDePrueba($bd);
}
echo "\n$ok pasaron, $fallo fallaron, $omitidas omitidas\n";
exit($fallo > 0 ? 1 : 0);
