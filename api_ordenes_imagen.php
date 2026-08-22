<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/CorrelativoOperativoModule.php';

$usuario   = $_SESSION['usuario'] ?? $_SESSION['medico'] ?? null;
$rol       = strtolower(trim((string)($usuario['rol'] ?? '')));
$usuarioId = intval($usuario['id'] ?? 0);

$rolesPermitidos = ['administrador', 'recepcionista', 'laboratorista', 'medico'];
if (!$usuario || !in_array($rol, $rolesPermitidos)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;

}

header('Content-Type: application/json; charset=utf-8');

// ─── Auto-crear tablas ────────────────────────────────────────────────────────
$conn->query("
    CREATE TABLE IF NOT EXISTS ordenes_imagen (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        consulta_id    INT NULL,
        paciente_id    INT NOT NULL,
        medico_id      INT DEFAULT NULL,
        tipo           VARCHAR(30) NOT NULL DEFAULT 'rx',
        indicaciones   TEXT,
        estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        fecha          DATETIME DEFAULT CURRENT_TIMESTAMP,
        solicitado_por INT DEFAULT NULL,
        cotizacion_id  INT DEFAULT NULL,
        carga_anticipada TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_oi_consulta (consulta_id),
        INDEX idx_oi_paciente (paciente_id),
        INDEX idx_oi_medico (medico_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// Migraciones para tablas ya existentes
$migrImagen = [
    'medico_id'       => 'ALTER TABLE ordenes_imagen ADD COLUMN medico_id INT DEFAULT NULL',
    'cotizacion_id'   => 'ALTER TABLE ordenes_imagen ADD COLUMN cotizacion_id INT DEFAULT NULL',
    'carga_anticipada'=> 'ALTER TABLE ordenes_imagen ADD COLUMN carga_anticipada TINYINT(1) NOT NULL DEFAULT 0',
];
foreach ($migrImagen as $col => $sql) {
    $chk = $conn->query("SHOW COLUMNS FROM ordenes_imagen LIKE '$col'");
    if ($chk && $chk->num_rows === 0) $conn->query($sql);
}

// Una orden de imagen puede originarse en una consulta o venderse directamente.
$consultaColumn = $conn->query("SHOW COLUMNS FROM ordenes_imagen LIKE 'consulta_id'");
if ($consultaColumn && ($consultaMeta = $consultaColumn->fetch_assoc()) && strtoupper((string)($consultaMeta['Null'] ?? 'NO')) !== 'YES') {
    $conn->query('ALTER TABLE ordenes_imagen MODIFY consulta_id INT NULL');
}

$conn->query("
    CREATE TABLE IF NOT EXISTS ordenes_imagen_archivos (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        orden_id         INT NOT NULL,
        nombre_original  VARCHAR(255) NOT NULL DEFAULT '',
        archivo_path     VARCHAR(500) NOT NULL DEFAULT '',
        tamano           INT DEFAULT 0,
        mime_type        VARCHAR(100) DEFAULT NULL,
        fecha            DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_oia_orden (orden_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// ─── Helper: construir ruta pública del endpoint actual ──────────────────────
function getApiEndpointPath(string $fileName = 'api_ordenes_imagen.php'): string {
    $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    $dir = trim((string)dirname($scriptName));

    if ($dir === '' || $dir === '.' || $dir === '\\' || $dir === '/') {
        return '/' . ltrim($fileName, '/');
    }

    return rtrim($dir, '/') . '/' . ltrim($fileName, '/');
}

if (!function_exists('oi_column_exists')) {
    function oi_column_exists(mysqli $conn, string $table, string $column): bool {
        static $cache = [];
        $key = $table . '.' . $column;
        if (array_key_exists($key, $cache)) {
            return $cache[$key];
        }

        $stmt = $conn->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1');
        if (!$stmt) {
            $cache[$key] = false;
            return false;
        }
        $stmt->bind_param('ss', $table, $column);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res && $res->num_rows > 0;
        $stmt->close();
        $cache[$key] = $exists;
        return $exists;
    }
}

if (!function_exists('oi_table_exists')) {
    function oi_table_exists(mysqli $conn, string $table): bool {
        static $cache = [];
        if (array_key_exists($table, $cache)) {
            return $cache[$table];
        }

        $stmt = $conn->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1');
        if (!$stmt) {
            $cache[$table] = false;
            return false;
        }
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res && $res->num_rows > 0;
        $stmt->close();
        $cache[$table] = $exists;
        return $exists;
    }
}

if (!function_exists('oi_normalizar_fecha_programada_agenda')) {
    function oi_normalizar_fecha_programada_agenda($value): ?string {
        $raw = trim((string)$value);
        if ($raw === '') return null;
        $ts = strtotime($raw);
        if ($ts === false) return null;
        return date('Y-m-d', $ts);
    }
}

if (!function_exists('oi_normalizar_hora_programada_agenda')) {
    function oi_normalizar_hora_programada_agenda($value): ?string {
        $raw = trim((string)$value);
        if ($raw === '') return null;
        if (preg_match('/^(\d{2}):(\d{2})(:\d{2})?$/', $raw)) {
            $parts = explode(':', $raw);
            return sprintf('%02d:%02d:00', (int)$parts[0], (int)$parts[1]);
        }
        $ts = strtotime($raw);
        if ($ts === false) return null;
        return date('H:i:s', $ts);
    }
}

if (!function_exists('oi_hora_a_minutos')) {
    function oi_hora_a_minutos(?string $hora): ?int {
        $h = oi_normalizar_hora_programada_agenda($hora);
        if ($h === null) return null;
        if (!preg_match('/^(\d{2}):(\d{2})(:\d{2})?$/', $h, $m)) {
            return null;
        }
        $hh = (int)$m[1];
        $mm = (int)$m[2];
        if ($hh < 0 || $hh > 23 || $mm < 0 || $mm > 59) return null;
        return ($hh * 60) + $mm;
    }
}

if (!function_exists('oi_minutos_a_hora')) {
    function oi_minutos_a_hora(int $minutes): string {
        $m = max(0, min(1439, $minutes));
        $hh = (int)floor($m / 60);
        $mm = $m % 60;
        return sprintf('%02d:%02d:00', $hh, $mm);
    }
}

if (!function_exists('oi_slots_ocupados_medico_fecha')) {
    function oi_slots_ocupados_medico_fecha(mysqli $conn, int $medicoId, string $fechaYmd): array {
        $ocupadas = [];
        if ($medicoId <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaYmd)) {
            return $ocupadas;
        }

        if (oi_table_exists($conn, 'consultas')) {
            $stmtC = $conn->prepare('SELECT hora FROM consultas WHERE medico_id = ? AND fecha = ? AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "anulada", "completada")');
            if ($stmtC) {
                $stmtC->bind_param('is', $medicoId, $fechaYmd);
                $stmtC->execute();
                $resC = $stmtC->get_result();
                while ($resC && ($row = $resC->fetch_assoc())) {
                    $min = oi_hora_a_minutos((string)($row['hora'] ?? ''));
                    if ($min !== null) $ocupadas[$min] = true;
                }
                $stmtC->close();
            }
        }

        if (oi_table_exists($conn, 'agenda_servicios_cotizacion')
            && oi_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id')
            && oi_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && oi_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
            && oi_column_exists($conn, 'agenda_servicios_cotizacion', 'estado_evento')) {
            $stmtA = $conn->prepare('SELECT hora_programada FROM agenda_servicios_cotizacion WHERE medico_id = ? AND fecha_programada = ? AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")');
            if ($stmtA) {
                $stmtA->bind_param('is', $medicoId, $fechaYmd);
                $stmtA->execute();
                $resA = $stmtA->get_result();
                while ($resA && ($row = $resA->fetch_assoc())) {
                    $min = oi_hora_a_minutos((string)($row['hora_programada'] ?? ''));
                    if ($min !== null) $ocupadas[$min] = true;
                }
                $stmtA->close();
            }
        }

        return $ocupadas;
    }
}

if (!function_exists('oi_resolver_hora_libre_secuencial')) {
    function oi_resolver_hora_libre_secuencial(mysqli $conn, int $medicoId, string $fechaYmd, ?string $horaBase, array $ocupadasLocales = []): ?string {
        $fecha = oi_normalizar_fecha_programada_agenda($fechaYmd);
        if ($medicoId <= 0 || $fecha === null) return oi_normalizar_hora_programada_agenda($horaBase);

        $baseMin = oi_hora_a_minutos($horaBase);
        if ($baseMin === null) $baseMin = (7 * 60);
        $baseMin = (int)(floor($baseMin / 30) * 30);

        $ocupadas = oi_slots_ocupados_medico_fecha($conn, $medicoId, $fecha);
        foreach ($ocupadasLocales as $loc) {
            $mLoc = oi_hora_a_minutos((string)$loc);
            if ($mLoc !== null) $ocupadas[$mLoc] = true;
        }

        for ($step = 0; $step < 48; $step++) {
            $slot = $baseMin + ($step * 30);
            if ($slot > 1439) break;
            if (!isset($ocupadas[$slot])) {
                return oi_minutos_a_hora($slot);
            }
        }

        return oi_normalizar_hora_programada_agenda($horaBase) ?: '07:00:00';
    }
}

if (!function_exists('oi_agendar_detalle_cotizacion_imagen')) {
    function oi_agendar_detalle_cotizacion_imagen(
        mysqli $conn,
        int $cotizacionId,
        int $detalleId,
        int $pacienteId,
        int $medicoId,
        string $servicioTipo,
        int $servicioId,
        string $titulo,
        ?string $fechaProgramada,
        ?string $horaProgramada,
        int $usuarioId
    ): void {
        if ($cotizacionId <= 0 || $detalleId <= 0 || $pacienteId <= 0) return;
        if ($fechaProgramada === null) return;
        if (!oi_table_exists($conn, 'agenda_servicios_cotizacion')) return;
        if (!oi_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            || !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id')
            || !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'paciente_id')
            || !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'servicio_tipo')
            || !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'titulo_evento')
            || !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')) {
            return;
        }

        $stmtExiste = $conn->prepare('SELECT id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND cotizacion_detalle_id = ? LIMIT 1');
        if (!$stmtExiste) return;
        $stmtExiste->bind_param('ii', $cotizacionId, $detalleId);
        $stmtExiste->execute();
        $exists = $stmtExiste->get_result()->fetch_assoc();
        $stmtExiste->close();
        if ($exists) return;

        $usaHora = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada');
        $usaEstado = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'estado_evento');
        $usaObs = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'observaciones');
        $usaCreatedBy = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'created_by');
        $usaUpdatedBy = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'updated_by');
        $usaMedico = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id');
        $usaServicioId = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'servicio_id');

        $cols = ['cotizacion_id', 'cotizacion_detalle_id', 'paciente_id'];
        $vals = ['?', '?', '?'];
        $types = 'iii';
        $params = [$cotizacionId, $detalleId, $pacienteId];

        if ($usaMedico) {
            $cols[] = 'medico_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $medicoId > 0 ? $medicoId : null;
        }

        $cols[] = 'servicio_tipo';
        $vals[] = '?';
        $types .= 's';
        $params[] = strtolower(trim($servicioTipo));

        if ($usaServicioId) {
            $cols[] = 'servicio_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $servicioId > 0 ? $servicioId : null;
        }

        $cols[] = 'titulo_evento';
        $vals[] = '?';
        $types .= 's';
        $params[] = ($titulo !== '' ? $titulo : 'Servicio programado');

        $cols[] = 'fecha_programada';
        $vals[] = '?';
        $types .= 's';
        $params[] = $fechaProgramada;

        if ($usaHora) {
            $cols[] = 'hora_programada';
            $vals[] = '?';
            $types .= 's';
            $params[] = $horaProgramada;
        }
        if ($usaEstado) {
            $cols[] = 'estado_evento';
            $vals[] = '"pendiente"';
        }
        if ($usaObs) {
            $cols[] = 'observaciones';
            $vals[] = '?';
            $types .= 's';
            $params[] = 'Programado desde solicitud de imagen en HC';
        }
        if ($usaCreatedBy) {
            $cols[] = 'created_by';
            $vals[] = '?';
            $types .= 'i';
            $params[] = (int)$usuarioId;
        }
        if ($usaUpdatedBy) {
            $cols[] = 'updated_by';
            $vals[] = '?';
            $types .= 'i';
            $params[] = (int)$usuarioId;
        }

        $sql = 'INSERT INTO agenda_servicios_cotizacion (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
        $stmtIns = $conn->prepare($sql);
        if (!$stmtIns) return;
        $stmtIns->bind_param($types, ...$params);
        $stmtIns->execute();
        $stmtIns->close();
    }
}

if (!function_exists('oi_cotizacion_tiene_pagos')) {
    function oi_cotizacion_tiene_pagos(mysqli $conn, int $cotizacionId): bool {
        if ($cotizacionId <= 0) return false;

        if (oi_column_exists($conn, 'cotizaciones', 'total_pagado')) {
            $stmt = $conn->prepare('SELECT COALESCE(total_pagado, 0) AS total_pagado FROM cotizaciones WHERE id = ? LIMIT 1');
            if ($stmt) {
                $stmt->bind_param('i', $cotizacionId);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();
                if ((float)($row['total_pagado'] ?? 0) > 0.00001) {
                    return true;
                }
            }
        }

        if (!oi_table_exists($conn, 'cotizacion_movimientos')) {
            return false;
        }
        if (!oi_column_exists($conn, 'cotizacion_movimientos', 'cotizacion_id') || !oi_column_exists($conn, 'cotizacion_movimientos', 'monto')) {
            return false;
        }

        $stmtMov = $conn->prepare('SELECT COALESCE(SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END), 0) AS total_abonos FROM cotizacion_movimientos WHERE cotizacion_id = ?');
        if (!$stmtMov) {
            return false;
        }
        $stmtMov->bind_param('i', $cotizacionId);
        $stmtMov->execute();
        $rowMov = $stmtMov->get_result()->fetch_assoc();
        $stmtMov->close();

        return (float)($rowMov['total_abonos'] ?? 0) > 0.00001;
    }
}

if (!function_exists('oi_recalcular_total_cotizacion')) {
    function oi_recalcular_total_cotizacion(mysqli $conn, int $cotizacionId): void {
        $whereEstado = oi_column_exists($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND estado_item <> 'eliminado'"
            : '';

        $stmtTotal = $conn->prepare("SELECT COALESCE(SUM(subtotal),0) AS total FROM cotizaciones_detalle WHERE cotizacion_id = ?{$whereEstado}");
        if (!$stmtTotal) return;
        $stmtTotal->bind_param('i', $cotizacionId);
        $stmtTotal->execute();
        $row = $stmtTotal->get_result()->fetch_assoc();
        $stmtTotal->close();
        $total = round((float)($row['total'] ?? 0), 2);

        if (oi_column_exists($conn, 'cotizaciones', 'total_pagado') && oi_column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
            $stmtPag = $conn->prepare('SELECT COALESCE(total_pagado, 0) AS total_pagado FROM cotizaciones WHERE id = ? LIMIT 1');
            $pagado = 0.0;
            if ($stmtPag) {
                $stmtPag->bind_param('i', $cotizacionId);
                $stmtPag->execute();
                $rowPag = $stmtPag->get_result()->fetch_assoc();
                $stmtPag->close();
                $pagado = (float)($rowPag['total_pagado'] ?? 0);
            }
            $saldo = max(0.0, round($total - $pagado, 2));
            $estado = $saldo <= 0.00001 ? 'pagado' : ($pagado > 0.00001 ? 'parcial' : 'pendiente');
            $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ? WHERE id = ?');
            if ($stmtUp) {
                $stmtUp->bind_param('ddsi', $total, $saldo, $estado, $cotizacionId);
                $stmtUp->execute();
                $stmtUp->close();
            }
            return;
        }

        $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ? WHERE id = ?');
        if ($stmtUp) {
            $stmtUp->bind_param('di', $total, $cotizacionId);
            $stmtUp->execute();
            $stmtUp->close();
        }
    }
}

// ─── Helper: crear cotización desde orden de imagen ───────────────────────────
if (!function_exists('crearCotizacionImagen')) {
    function crearCotizacionImagen(mysqli $conn, int $pacienteId, int $consultaId, array $detalles, int $usuarioId, string $observaciones, int $medicoId = 0): array {
        $total = 0.0;
        foreach ($detalles as $d) $total += floatval($d['subtotal']);
        $stmt = $conn->prepare(
            'INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, saldo_pendiente, total_pagado, observaciones)
             VALUES (?, ?, ?, \'pendiente\', ?, 0, ?)'
        );
        $stmt->bind_param('iidds', $pacienteId, $usuarioId, $total, $total, $observaciones);
        $stmt->execute();
        $cotizacionId = $conn->insert_id;
        $stmt->close();
        $nroComp = 'Q' . str_pad((string)$cotizacionId, 6, '0', STR_PAD_LEFT);
        $conn->query("UPDATE cotizaciones SET numero_comprobante = '$nroComp' WHERE id = $cotizacionId");
        foreach ($detalles as $d) {
            $servTipo  = $conn->real_escape_string($d['servicio_tipo']);
            $servId    = intval($d['servicio_id']);
            $desc      = $conn->real_escape_string($d['descripcion']);
            $cant      = intval($d['cantidad'] ?? 1);
            $pu        = floatval($d['precio_unitario']);
            $sub       = floatval($d['subtotal']);
            $medIdRow  = ($d['medico_id'] ?? $medicoId) > 0 ? intval($d['medico_id'] ?? $medicoId) : 'NULL';
            $conn->query(
                "INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, consulta_id, medico_id)
                 VALUES ($cotizacionId, '$servTipo', $servId, '$desc', $cant, $pu, $sub, $consultaId, $medIdRow)"
            );
        }
        return ['cotizacion_id' => $cotizacionId, 'numero_comprobante' => $nroComp, 'total' => $total];
    }
}

if (!function_exists('resolverMedicoResponsableOrdenImagen')) {
    function resolverMedicoResponsableOrdenImagen(mysqli $conn, array $orden): array {
        $ordenId = (int)($orden['id'] ?? 0);
        $medicoId = (int)($orden['medico_id'] ?? 0);
        $consultaId = (int)($orden['consulta_id'] ?? 0);
        $cotizId = (int)($orden['cotizacion_id'] ?? 0);

        if ($medicoId <= 0 && $cotizId > 0) {
            $detalleTokenId = 0;
            $indicaciones = (string)($orden['indicaciones'] ?? '');
            if ($indicaciones !== '' && preg_match('/detalle\s*#\s*(\d+)/i', $indicaciones, $m)) {
                $detalleTokenId = (int)($m[1] ?? 0);
            }

            if ($detalleTokenId > 0) {
                $stmtDet = $conn->prepare('SELECT medico_id, consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND id = ? LIMIT 1');
                if ($stmtDet) {
                    $stmtDet->bind_param('ii', $cotizId, $detalleTokenId);
                    $stmtDet->execute();
                    $rowDet = $stmtDet->get_result()->fetch_assoc();
                    $stmtDet->close();
                    $medicoId = (int)($rowDet['medico_id'] ?? 0);
                    if ($consultaId <= 0) {
                        $consultaId = (int)($rowDet['consulta_id'] ?? 0);
                    }
                }
            }
        }

        $info = [
            'medico_id' => $medicoId,
            'medico_responsable_nombre' => null,
            'medico_responsable_apellido' => null,
            'medico_responsable_especialidad' => null,
        ];

        if ($medicoId > 0) {
            $stmtMed = $conn->prepare('SELECT nombre, apellido, especialidad FROM medicos WHERE id = ? LIMIT 1');
            if ($stmtMed) {
                $stmtMed->bind_param('i', $medicoId);
                $stmtMed->execute();
                $rowMed = $stmtMed->get_result()->fetch_assoc();
                $stmtMed->close();
                if ($rowMed) {
                    $info['medico_responsable_nombre'] = trim((string)($rowMed['nombre'] ?? ''));
                    $info['medico_responsable_apellido'] = trim((string)($rowMed['apellido'] ?? ''));
                    $info['medico_responsable_especialidad'] = trim((string)($rowMed['especialidad'] ?? ''));
                }
            }
        }

        if ($ordenId > 0 && $medicoId > 0 && (int)($orden['medico_id'] ?? 0) <= 0) {
            $stmtUpd = $conn->prepare('UPDATE ordenes_imagen SET medico_id = ? WHERE id = ?');
            if ($stmtUpd) {
                $stmtUpd->bind_param('ii', $medicoId, $ordenId);
                $stmtUpd->execute();
                $stmtUpd->close();
            }
        }

        return $info;
    }
}

if (!function_exists('usuarioPuedeOperarOrdenImagen')) {
    function usuarioPuedeOperarOrdenImagen(array $orden, string $rol, int $usuarioId): bool {
        if ($usuarioId <= 0) return false;

        if ($rol === 'administrador') {
            return true;
        }

        // Mantener permisos operativos existentes para personal no medico.
        if (in_array($rol, ['recepcionista', 'laboratorista'], true)) {
            return true;
        }

        if ($rol !== 'medico') {
            return false;
        }

        $medicoResponsableId = (int)($orden['medico_id'] ?? 0);

        if ($medicoResponsableId > 0 && $medicoResponsableId === $usuarioId) {
            return true;
        }

        return false;
    }
}

if (!function_exists('usuarioPuedeEditarInformeOrdenImagen')) {
    function usuarioPuedeEditarInformeOrdenImagen(array $orden, string $rol, int $usuarioId): bool {
        if ($usuarioId <= 0) {
            return false;
        }

        if ($rol === 'administrador') {
            return true;
        }

        if ($rol !== 'medico') {
            return false;
        }

        $medicoResponsableId = (int)($orden['medico_id'] ?? 0);
        return $medicoResponsableId > 0 && $medicoResponsableId === $usuarioId;
    }
}

if (!function_exists('ordenImagenConsultaPerteneceAMedicoSesion')) {
    function ordenImagenConsultaPerteneceAMedicoSesion(mysqli $conn, array $orden, string $rol, int $usuarioId): bool {
        if ($rol !== 'medico' || $usuarioId <= 0) {
            return true;
        }

        $consultaId = (int)($orden['consulta_id'] ?? 0);
        if ($consultaId <= 0) {
            return false;
        }

        $stmt = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if (!$stmt) {
            return false;
        }

        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        return (int)($row['medico_id'] ?? 0) === $usuarioId;
    }
}

if (!function_exists('consultaPerteneceAMedicoYPacienteSesion')) {
    function consultaPerteneceAMedicoYPacienteSesion(mysqli $conn, int $consultaId, int $pacienteId, int $usuarioId): bool {
        if ($consultaId <= 0 || $pacienteId <= 0 || $usuarioId <= 0) {
            return false;
        }

        $stmt = $conn->prepare('SELECT id FROM consultas WHERE id = ? AND paciente_id = ? AND medico_id = ? LIMIT 1');
        if (!$stmt) {
            return false;
        }

        $stmt->bind_param('iii', $consultaId, $pacienteId, $usuarioId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        return (bool)$row;
    }
}

if (!function_exists('usuarioPuedeVerOrdenImagen')) {
    function usuarioPuedeVerOrdenImagen(mysqli $conn, array $orden, string $rol, int $usuarioId, int $contextConsultaId = 0, int $contextPacienteId = 0): bool {
        if ($usuarioId <= 0) {
            return false;
        }

        if ($rol === 'administrador') {
            return true;
        }

        if (in_array($rol, ['recepcionista', 'laboratorista'], true)) {
            return true;
        }

        if ($rol !== 'medico') {
            return false;
        }

        if (usuarioPuedeOperarOrdenImagen($orden, $rol, $usuarioId)) {
            return true;
        }

        if (ordenImagenConsultaPerteneceAMedicoSesion($conn, $orden, $rol, $usuarioId)) {
            return true;
        }

        $ordenPacienteId = (int)($orden['paciente_id'] ?? 0);
        if (
            $contextConsultaId > 0
            && $contextPacienteId > 0
            && $ordenPacienteId > 0
            && $ordenPacienteId === $contextPacienteId
            && consultaPerteneceAMedicoYPacienteSesion($conn, $contextConsultaId, $contextPacienteId, $usuarioId)
        ) {
            return true;
        }

        return false;
    }
}

// ─── Helper: adjuntar archivos a una orden ────────────────────────────────────
function adjuntarArchivos(mysqli $conn, array &$orden): void {
    $oid     = (int)$orden['id'];
    $downloadBaseUrl = getApiEndpointPath('api_ordenes_imagen.php');
    $contextConsultaId = (int)($_GET['context_consulta_id'] ?? 0);
    $contextPacienteId = (int)($_GET['context_paciente_id'] ?? 0);
    $contextQuery = '';
    if ($contextConsultaId > 0 || $contextPacienteId > 0) {
        $ctxParts = [];
        if ($contextConsultaId > 0) {
            $ctxParts[] = 'context_consulta_id=' . $contextConsultaId;
        }
        if ($contextPacienteId > 0) {
            $ctxParts[] = 'context_paciente_id=' . $contextPacienteId;
        }
        $contextQuery = '&' . implode('&', $ctxParts);
    }
    $orden['archivos'] = [];
    $res = $conn->query("SELECT * FROM ordenes_imagen_archivos WHERE orden_id = $oid ORDER BY fecha ASC");
    while ($a = $res->fetch_assoc()) {
        $mt = !empty($a['mime_type']) ? $a['mime_type'] : 'application/octet-stream';
        $orden['archivos'][] = [
            'id'              => (int)$a['id'],
            'nombre_original' => $a['nombre_original'],
            'tamano'          => (int)$a['tamano'],
            'mime_type'       => $mt,
            'es_imagen'       => str_starts_with($mt, 'image/'),
            'es_dicom'        => $mt === 'application/dicom',
            'url'             => $downloadBaseUrl . '?action=download&archivo_id=' . $a['id'] . $contextQuery,
            'fecha'           => $a['fecha'],
        ];
    }
    completarMetadatosOrdenImagen($conn, $orden);
}

function completarMetadatosOrdenImagen(mysqli $conn, array &$orden): void {
    global $rol, $usuarioId;

    // Enriquecer con medico responsable, estado de la cotización y nombres de servicios
    $medInfo = resolverMedicoResponsableOrdenImagen($conn, $orden);
    $orden['medico_id'] = (int)($medInfo['medico_id'] ?? 0);
    $orden['medico_responsable_nombre'] = $medInfo['medico_responsable_nombre'];
    $orden['medico_responsable_apellido'] = $medInfo['medico_responsable_apellido'];
    $orden['medico_responsable_especialidad'] = $medInfo['medico_responsable_especialidad'];

    $puedeOperarOrden = usuarioPuedeOperarOrdenImagen($orden, (string)$rol, (int)$usuarioId);
    $puedeEditarInforme = usuarioPuedeEditarInformeOrdenImagen($orden, (string)$rol, (int)$usuarioId);
    $orden['can_upload_archivos'] = $puedeOperarOrden;
    $orden['can_edit_informe'] = $puedeEditarInforme;

    $cotizId = (int)($orden['cotizacion_id'] ?? 0);
    if ($cotizId > 0) {
        $cRow = $conn->query("SELECT estado, numero_comprobante, total, saldo_pendiente FROM cotizaciones WHERE id = $cotizId")->fetch_assoc();
        $orden['cotizacion'] = $cRow ?: null;

        $descs = [];
        $tipoOrden = strtolower(trim((string)($orden['tipo'] ?? '')));

        // Si la orden trae token de detalle en indicaciones, priorizar ese detalle exacto.
        $detalleTokenId = 0;
        $indicaciones = (string)($orden['indicaciones'] ?? '');
        if ($indicaciones !== '' && preg_match('/detalle\s*#\s*(\d+)/i', $indicaciones, $m)) {
            $detalleTokenId = (int)($m[1] ?? 0);
        }

        if ($detalleTokenId > 0) {
            $dRes = $conn->query("SELECT descripcion FROM cotizaciones_detalle WHERE cotizacion_id = $cotizId AND id = $detalleTokenId LIMIT 1");
            if ($dRes && ($d = $dRes->fetch_assoc())) {
                $descs[] = (string)($d['descripcion'] ?? '');
            }
        }

        if (empty($descs)) {
            $whereTipo = '';
            if ($tipoOrden === 'ecografia') {
                $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) = 'ecografia' OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND LOWER(descripcion) LIKE '%ecograf%'))";
            } elseif ($tipoOrden === 'rx') {
                $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) IN ('rayosx','rayos_x','rayos x','rx') OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND (LOWER(descripcion) LIKE '%rayos x%' OR LOWER(descripcion) REGEXP '(^|[^a-z])rx([^a-z]|$)')))";
            } elseif ($tipoOrden === 'tomografia') {
                $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) = 'tomografia' OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND (LOWER(descripcion) LIKE '%tomograf%' OR LOWER(descripcion) LIKE '% tac %' OR LOWER(descripcion) LIKE 'tac %' OR LOWER(descripcion) LIKE '% tac')))";
            }

            $dRes = $conn->query("SELECT descripcion FROM cotizaciones_detalle WHERE cotizacion_id = $cotizId{$whereTipo} ORDER BY id ASC");
            while ($dRes && ($d = $dRes->fetch_assoc())) {
                $descs[] = (string)($d['descripcion'] ?? '');
            }
        }

        $orden['servicios_nombres'] = $descs;
    } else {
        $orden['cotizacion'] = null;
        $orden['servicios_nombres'] = [];
    }
}

function obtenerArchivosOrdenesMap(mysqli $conn, array $ordenIds): array {
    $ids = [];
    foreach ($ordenIds as $id) {
        $idInt = (int)$id;
        if ($idInt > 0) {
            $ids[] = $idInt;
        }
    }
    $ids = array_values(array_unique($ids));
    if (empty($ids)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sql = "SELECT * FROM ordenes_imagen_archivos WHERE orden_id IN ($placeholders) ORDER BY orden_id ASC, fecha ASC";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return [];
    }

    $stmt->bind_param(str_repeat('i', count($ids)), ...$ids);
    $stmt->execute();
    $res = $stmt->get_result();

    $map = [];
    while ($row = $res->fetch_assoc()) {
        $oid = (int)($row['orden_id'] ?? 0);
        if ($oid <= 0) {
            continue;
        }
        if (!isset($map[$oid])) {
            $map[$oid] = [];
        }
        $map[$oid][] = $row;
    }
    $stmt->close();

    return $map;
}

if (!function_exists('oi_extraer_detalle_token_id')) {
    function oi_extraer_detalle_token_id(string $indicaciones): int {
        if ($indicaciones !== '' && preg_match('/detalle\s*#\s*(\d+)/i', $indicaciones, $m)) {
            return (int)($m[1] ?? 0);
        }
        return 0;
    }
}

if (!function_exists('oi_tipo_orden_equivale_agenda')) {
    function oi_tipo_orden_equivale_agenda(string $tipoOrden, string $tipoAgenda): bool {
        $orden = strtolower(trim($tipoOrden));
        $agenda = strtolower(trim($tipoAgenda));
        if ($orden === '' || $agenda === '') {
            return false;
        }
        if ($orden === $agenda) {
            return true;
        }
        if ($orden === 'rx' && in_array($agenda, ['rayosx', 'rayos_x', 'rayos x', 'rx'], true)) {
            return true;
        }
        return false;
    }
}

if (!function_exists('oi_programacion_ordenes_map')) {
    function oi_programacion_ordenes_map(mysqli $conn, array $rowsBase): array {
        if (!oi_table_exists($conn, 'agenda_servicios_cotizacion')) {
            return [];
        }
        if (
            !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            || !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            || !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
            || !oi_column_exists($conn, 'agenda_servicios_cotizacion', 'estado_evento')
        ) {
            return [];
        }

        $ordenesMeta = [];
        $cotizacionIds = [];
        foreach ($rowsBase as $row) {
            $ordenId = (int)($row['id'] ?? 0);
            $cotizacionId = (int)($row['cotizacion_id'] ?? 0);
            if ($ordenId <= 0 || $cotizacionId <= 0) {
                continue;
            }
            $ordenesMeta[$ordenId] = [
                'cotizacion_id' => $cotizacionId,
                'medico_id' => (int)($row['medico_id'] ?? 0),
                'tipo' => (string)($row['tipo'] ?? ''),
                'detalle_token_id' => oi_extraer_detalle_token_id((string)($row['indicaciones'] ?? '')),
            ];
            $cotizacionIds[] = $cotizacionId;
        }

        $cotizacionIds = array_values(array_unique($cotizacionIds));
        if (empty($cotizacionIds)) {
            return [];
        }

        $cotEstadoMap = [];
        $hasCotizacionesEstado = oi_table_exists($conn, 'cotizaciones') && oi_column_exists($conn, 'cotizaciones', 'estado');
        if ($hasCotizacionesEstado) {
            $placeholdersCot = implode(',', array_fill(0, count($cotizacionIds), '?'));
            $sqlCotEstado = "SELECT id, LOWER(TRIM(COALESCE(estado, ''))) AS estado FROM cotizaciones WHERE id IN ($placeholdersCot)";
            $stmtCotEstado = $conn->prepare($sqlCotEstado);
            if ($stmtCotEstado) {
                $stmtCotEstado->bind_param(str_repeat('i', count($cotizacionIds)), ...$cotizacionIds);
                $stmtCotEstado->execute();
                $resCotEstado = $stmtCotEstado->get_result();
                while ($resCotEstado && ($rowCot = $resCotEstado->fetch_assoc())) {
                    $cotEstadoMap[(int)($rowCot['id'] ?? 0)] = (string)($rowCot['estado'] ?? '');
                }
                $stmtCotEstado->close();
            }

                        // Backfill incremental: si la cotizacion ya equivale a cobro confirmado,
                        // el evento pendiente pasa a confirmado para estabilizar el consecutivo operativo.
            $sqlBackfill = "UPDATE agenda_servicios_cotizacion a
                            INNER JOIN cotizaciones c ON c.id = a.cotizacion_id
                            SET a.estado_evento = 'confirmado'
                            WHERE a.cotizacion_id IN ($placeholdersCot)
                              AND LOWER(TRIM(COALESCE(a.estado_evento, ''))) = 'pendiente'
                                                            AND LOWER(TRIM(COALESCE(c.estado, ''))) IN ('parcial', 'pagado', 'pagada', 'completado', 'completada', 'control', 'contrato')";
            $stmtBackfill = $conn->prepare($sqlBackfill);
            if ($stmtBackfill) {
                $stmtBackfill->bind_param(str_repeat('i', count($cotizacionIds)), ...$cotizacionIds);
                $stmtBackfill->execute();
                $stmtBackfill->close();
            }
        }

        $placeholders = implode(',', array_fill(0, count($cotizacionIds), '?'));
        $hasDetalle = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id');
        $hasTipo = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'servicio_tipo');
        $hasMedico = oi_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id');
        $selectDetalle = $hasDetalle ? 'a.cotizacion_detalle_id' : 'NULL';
        $selectTipo = $hasTipo ? 'a.servicio_tipo' : 'NULL';
        $selectMedico = $hasMedico ? 'a.medico_id' : '0';

                $sql = "SELECT a.id, a.cotizacion_id, {$selectDetalle} AS cotizacion_detalle_id, {$selectTipo} AS servicio_tipo, {$selectMedico} AS medico_id, a.fecha_programada, a.hora_programada, LOWER(TRIM(COALESCE(a.estado_evento, ''))) AS estado_evento
                FROM agenda_servicios_cotizacion a
                WHERE a.cotizacion_id IN ($placeholders)
                                    AND LOWER(COALESCE(a.estado_evento, '')) NOT IN ('cancelado', 'no_asistio')
                ORDER BY a.fecha_programada ASC, a.hora_programada ASC, a.id ASC";
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return [];
        }

        $stmt->bind_param(str_repeat('i', count($cotizacionIds)), ...$cotizacionIds);
        $stmt->execute();
        $res = $stmt->get_result();

        $agendaByCotizacion = [];
        while ($res && ($row = $res->fetch_assoc())) {
            $cid = (int)($row['cotizacion_id'] ?? 0);
            if ($cid <= 0) {
                continue;
            }
            if (!isset($agendaByCotizacion[$cid])) {
                $agendaByCotizacion[$cid] = [];
            }
            $agendaByCotizacion[$cid][] = [
                'id' => (int)($row['id'] ?? 0),
                'cotizacion_detalle_id' => (int)($row['cotizacion_detalle_id'] ?? 0),
                'servicio_tipo' => (string)($row['servicio_tipo'] ?? ''),
                'medico_id' => (int)($row['medico_id'] ?? 0),
                'fecha_programada' => (string)($row['fecha_programada'] ?? ''),
                'hora_programada' => (string)($row['hora_programada'] ?? ''),
                'estado_evento' => (string)($row['estado_evento'] ?? ''),
            ];
        }
        $stmt->close();

        $pairsForRanks = [];
        foreach ($agendaByCotizacion as $agendaItems) {
            foreach ((array)$agendaItems as $agendaItem) {
                $medicoTmp = (int)($agendaItem['medico_id'] ?? 0);
                $fechaTmp = trim((string)($agendaItem['fecha_programada'] ?? ''));
                if ($medicoTmp > 0 && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaTmp)) {
                    $pairsForRanks[$medicoTmp . '|' . $fechaTmp] = [
                        'medico_id' => $medicoTmp,
                        'fecha' => $fechaTmp,
                    ];
                }
            }
        }
        $rankMaps = correlativo_operativo_rank_maps($conn, array_values($pairsForRanks));
        $rankByAgendaId = is_array($rankMaps['agenda'] ?? null) ? $rankMaps['agenda'] : [];

        $out = [];

        foreach ($ordenesMeta as $ordenId => $meta) {
            $cid = (int)($meta['cotizacion_id'] ?? 0);
            $agendaItems = $agendaByCotizacion[$cid] ?? [];
            if (empty($agendaItems)) {
                continue;
            }

            $match = null;
            $tokenId = (int)($meta['detalle_token_id'] ?? 0);
            if ($tokenId > 0) {
                foreach ($agendaItems as $item) {
                    if ((int)($item['cotizacion_detalle_id'] ?? 0) === $tokenId) {
                        $match = $item;
                        break;
                    }
                }
            }

            if ($match === null) {
                $medicoId = (int)($meta['medico_id'] ?? 0);
                $tipo = (string)($meta['tipo'] ?? '');
                foreach ($agendaItems as $item) {
                    $medicoOk = $medicoId <= 0 || (int)($item['medico_id'] ?? 0) === $medicoId;
                    $tipoOk = oi_tipo_orden_equivale_agenda($tipo, (string)($item['servicio_tipo'] ?? ''));
                    if ($medicoOk && $tipoOk) {
                        $match = $item;
                        break;
                    }
                }
            }

            if ($match === null) {
                $match = $agendaItems[0];
            }

            $correlativo = 0;
            $medicoAgenda = (int)($match['medico_id'] ?? 0);
            $fechaAgenda = (string)($match['fecha_programada'] ?? '');
            $horaAgenda = (string)($match['hora_programada'] ?? '');
            $estadoAgenda = strtolower(trim((string)($match['estado_evento'] ?? '')));
            $estadoCotizacion = strtolower(trim((string)($cotEstadoMap[(int)$cid] ?? '')));
            if ($estadoAgenda === 'pendiente' && in_array($estadoCotizacion, ['parcial', 'pagado', 'pagada', 'completado', 'completada', 'control', 'contrato'], true)) {
                $estadoAgenda = 'confirmado';
            }
            $agendaId = (int)($match['id'] ?? 0);
            $estadoCuenta = in_array($estadoAgenda, ['confirmado', 'atendido', 'espontaneo', 'completado', 'pagado'], true);
            if ($estadoCuenta && $agendaId > 0) {
                $correlativo = (int)($rankByAgendaId[$agendaId] ?? 0);
            }

            $out[$ordenId] = [
                'agenda_id' => $agendaId,
                'fecha_programada' => $fechaAgenda,
                'hora_programada' => $horaAgenda,
                'estado_evento_agenda' => $estadoAgenda,
                'correlativo_operativo' => $correlativo,
            ];
        }

        return $out;
    }
}

// ─── Download ────────────────────────────────────────────────────────────────
if (isset($_GET['action']) && $_GET['action'] === 'download') {
    $archivo_id = (int)($_GET['archivo_id'] ?? 0);
    $contextConsultaId = (int)($_GET['context_consulta_id'] ?? 0);
    $contextPacienteId = (int)($_GET['context_paciente_id'] ?? 0);
    if ($archivo_id <= 0) { http_response_code(400); exit; }

    $row = $conn->query("SELECT a.*, o.consulta_id, o.paciente_id, o.medico_id, o.solicitado_por, o.cotizacion_id, o.indicaciones FROM ordenes_imagen_archivos a INNER JOIN ordenes_imagen o ON o.id = a.orden_id WHERE a.id = $archivo_id LIMIT 1")->fetch_assoc();
    if (!$row || !file_exists($row['archivo_path'])) { http_response_code(404); exit; }

    $ordenDescarga = [
        'consulta_id' => (int)($row['consulta_id'] ?? 0),
        'paciente_id' => (int)($row['paciente_id'] ?? 0),
        'medico_id' => (int)($row['medico_id'] ?? 0),
        'solicitado_por' => (int)($row['solicitado_por'] ?? 0),
        'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0),
        'indicaciones' => (string)($row['indicaciones'] ?? ''),
    ];

    if (!usuarioPuedeVerOrdenImagen($conn, $ordenDescarga, (string)$rol, (int)$usuarioId, $contextConsultaId, $contextPacienteId)) {
        http_response_code(403);
        exit;
    }

    $safeName = preg_replace('/[^a-zA-Z0-9._\- ]/', '_', basename($row['nombre_original']));
    $mimeType = !empty($row['mime_type']) ? $row['mime_type'] : 'application/octet-stream';
    header('Content-Type: ' . $mimeType);
    header('Content-Disposition: inline; filename="' . $safeName . '"');
    header('Content-Length: ' . filesize($row['archivo_path']));
    header('Cache-Control: private, max-age=3600');
    readfile($row['archivo_path']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// ─── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $consulta_id = (int)($_GET['consulta_id'] ?? 0);
    $cotizacion_id = (int)($_GET['cotizacion_id'] ?? 0);
    $vista = strtolower(trim((string)($_GET['vista'] ?? '')));
    $isHcFast = ($vista === 'hc_fast');
    $isInformeFast = ($vista === 'informe_fast');
    $paciente_id = (int)($_GET['paciente_id'] ?? 0);
    $medico_id   = (int)($_GET['medico_id'] ?? 0);
    $orden_id    = (int)($_GET['orden_id'] ?? 0);
    $tipo        = trim($_GET['tipo'] ?? '');
    $pagina      = max(1, (int)($_GET['page'] ?? 1));
    $limite      = min(50, max(5, (int)($_GET['limit'] ?? 10)));
    $contextConsultaId = (int)($_GET['context_consulta_id'] ?? 0);
    $contextPacienteId = (int)($_GET['context_paciente_id'] ?? 0);

    if ($orden_id > 0) {
        // Un solo orden con detalles completos
        $row = $conn->query("SELECT * FROM ordenes_imagen WHERE id = $orden_id")->fetch_assoc();
        if (!$row) { echo json_encode(['success' => false, 'error' => 'Orden no encontrada']); exit; }

        if ($isInformeFast) {
            $row['archivos'] = [];
            $medInfo = resolverMedicoResponsableOrdenImagen($conn, $row);
            $row['medico_id'] = (int)($medInfo['medico_id'] ?? 0);
            $row['medico_responsable_nombre'] = $medInfo['medico_responsable_nombre'];
            $row['medico_responsable_apellido'] = $medInfo['medico_responsable_apellido'];
            $row['medico_responsable_especialidad'] = $medInfo['medico_responsable_especialidad'];
            $row['can_upload_archivos'] = usuarioPuedeOperarOrdenImagen($row, (string)$rol, (int)$usuarioId);
            $row['can_edit_informe'] = usuarioPuedeEditarInformeOrdenImagen($row, (string)$rol, (int)$usuarioId);
        } else {
            adjuntarArchivos($conn, $row);
        }

        if (!usuarioPuedeVerOrdenImagen($conn, $row, (string)$rol, (int)$usuarioId, $contextConsultaId, $contextPacienteId)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado para ver esta orden']);
            exit;
        }

        if ($isInformeFast) {
            $ordenLite = [
                'id' => (int)($row['id'] ?? 0),
                'consulta_id' => (int)($row['consulta_id'] ?? 0),
                'paciente_id' => (int)($row['paciente_id'] ?? 0),
                'medico_id' => (int)($row['medico_id'] ?? 0),
                'tipo' => (string)($row['tipo'] ?? ''),
                'indicaciones' => (string)($row['indicaciones'] ?? ''),
                'estado' => (string)($row['estado'] ?? ''),
                'fecha' => (string)($row['fecha'] ?? ''),
                'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0),
                'medico_responsable_nombre' => (string)($row['medico_responsable_nombre'] ?? ''),
                'medico_responsable_apellido' => (string)($row['medico_responsable_apellido'] ?? ''),
                'can_edit_informe' => !empty($row['can_edit_informe']),
            ];
            echo json_encode(['success' => true, 'orden' => $ordenLite]);
            exit;
        }

        // Info paciente
        $pac = $conn->query("SELECT id, nombre, apellido, dni, historia_clinica FROM pacientes WHERE id = " . (int)$row['paciente_id'])->fetch_assoc();
        $row['paciente'] = $pac;

        // Info consulta + médico
        $con = $conn->query("
            SELECT c.id, c.fecha,
                   m.nombre AS med_nombre, m.especialidad
            FROM consultas c
            LEFT JOIN medicos m ON m.id = c.medico_id
            WHERE c.id = " . (int)$row['consulta_id']
        )->fetch_assoc();
        $row['consulta'] = $con;

        echo json_encode(['success' => true, 'orden' => $row]);

    } elseif ($consulta_id > 0) {
        // Todas las órdenes de una consulta
        $res = $conn->query("SELECT * FROM ordenes_imagen WHERE consulta_id = $consulta_id ORDER BY fecha DESC");
        $rowsBase = [];
        $orderIds = [];
        while ($r = $res->fetch_assoc()) {
            $rowsBase[] = $r;
            $orderIds[] = (int)($r['id'] ?? 0);
        }

        $archivosMap = [];
        $downloadBaseUrl = getApiEndpointPath('api_ordenes_imagen.php');
        $contextQuery = '';
        if ($contextConsultaId > 0 || $contextPacienteId > 0) {
            $ctxParts = [];
            if ($contextConsultaId > 0) {
                $ctxParts[] = 'context_consulta_id=' . $contextConsultaId;
            }
            if ($contextPacienteId > 0) {
                $ctxParts[] = 'context_paciente_id=' . $contextPacienteId;
            }
            $contextQuery = '&' . implode('&', $ctxParts);
        }

        if (!$isHcFast) {
            $archivosRawMap = obtenerArchivosOrdenesMap($conn, $orderIds);
            foreach ($archivosRawMap as $oid => $rawItems) {
                $archivosMap[$oid] = [];
                foreach ($rawItems as $a) {
                    $mt = !empty($a['mime_type']) ? $a['mime_type'] : 'application/octet-stream';
                    $archivosMap[$oid][] = [
                        'id' => (int)($a['id'] ?? 0),
                        'nombre_original' => (string)($a['nombre_original'] ?? ''),
                        'tamano' => (int)($a['tamano'] ?? 0),
                        'mime_type' => $mt,
                        'es_imagen' => strpos($mt, 'image/') === 0,
                        'es_dicom' => $mt === 'application/dicom',
                        'url' => $downloadBaseUrl . '?action=download&archivo_id=' . (int)($a['id'] ?? 0) . $contextQuery,
                        'fecha' => (string)($a['fecha'] ?? ''),
                    ];
                }
            }
        }

        $rows = [];
        foreach ($rowsBase as $r) {
            if (!$isHcFast) {
                $oid = (int)($r['id'] ?? 0);
                $r['archivos'] = $archivosMap[$oid] ?? [];
                // Mantener metadatos de orden (médico, permisos, servicios, cotización)
                // sin disparar un SELECT por archivos por cada fila.
                $medInfo = resolverMedicoResponsableOrdenImagen($conn, $r);
                $r['medico_id'] = (int)($medInfo['medico_id'] ?? 0);
                $r['medico_responsable_nombre'] = $medInfo['medico_responsable_nombre'];
                $r['medico_responsable_apellido'] = $medInfo['medico_responsable_apellido'];
                $r['medico_responsable_especialidad'] = $medInfo['medico_responsable_especialidad'];
                $r['can_upload_archivos'] = usuarioPuedeOperarOrdenImagen($r, (string)$rol, (int)$usuarioId);
                $r['can_edit_informe'] = usuarioPuedeEditarInformeOrdenImagen($r, (string)$rol, (int)$usuarioId);
            } else {
                $r['archivos'] = [];
            }

            if (!usuarioPuedeVerOrdenImagen($conn, $r, (string)$rol, (int)$usuarioId, $contextConsultaId, $contextPacienteId)) {
                continue;
            }

            if (!$isHcFast) {
                $cotizId = (int)($r['cotizacion_id'] ?? 0);
                if ($cotizId > 0) {
                    $cRow = $conn->query("SELECT estado, numero_comprobante, total, saldo_pendiente FROM cotizaciones WHERE id = $cotizId")->fetch_assoc();
                    $r['cotizacion'] = $cRow ?: null;

                    $descs = [];
                    $tipoOrden = strtolower(trim((string)($r['tipo'] ?? '')));
                    $detalleTokenId = 0;
                    $indicaciones = (string)($r['indicaciones'] ?? '');
                    if ($indicaciones !== '' && preg_match('/detalle\s*#\s*(\d+)/i', $indicaciones, $m)) {
                        $detalleTokenId = (int)($m[1] ?? 0);
                    }

                    if ($detalleTokenId > 0) {
                        $dRes = $conn->query("SELECT descripcion FROM cotizaciones_detalle WHERE cotizacion_id = $cotizId AND id = $detalleTokenId LIMIT 1");
                        if ($dRes && ($d = $dRes->fetch_assoc())) {
                            $descs[] = (string)($d['descripcion'] ?? '');
                        }
                    }

                    if (empty($descs)) {
                        $whereTipo = '';
                        if ($tipoOrden === 'ecografia') {
                            $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) = 'ecografia' OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND LOWER(descripcion) LIKE '%ecograf%'))";
                        } elseif ($tipoOrden === 'rx') {
                            $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) IN ('rayosx','rayos_x','rayos x','rx') OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND (LOWER(descripcion) LIKE '%rayos x%' OR LOWER(descripcion) REGEXP '(^|[^a-z])rx([^a-z]|$)')))";
                        } elseif ($tipoOrden === 'tomografia') {
                            $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) = 'tomografia' OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND (LOWER(descripcion) LIKE '%tomograf%' OR LOWER(descripcion) LIKE '% tac %' OR LOWER(descripcion) LIKE 'tac %' OR LOWER(descripcion) LIKE '% tac')))";
                        }

                        $dRes = $conn->query("SELECT descripcion FROM cotizaciones_detalle WHERE cotizacion_id = $cotizId{$whereTipo} ORDER BY id ASC");
                        while ($dRes && ($d = $dRes->fetch_assoc())) {
                            $descs[] = (string)($d['descripcion'] ?? '');
                        }
                    }

                    $r['servicios_nombres'] = $descs;
                } else {
                    $r['cotizacion'] = null;
                    $r['servicios_nombres'] = [];
                }
            }

            $rows[] = $r;
        }
        echo json_encode(['success' => true, 'ordenes' => $rows]);

    } elseif ($cotizacion_id > 0) {
        // Todas las ordenes de una cotizacion (para correlativo operativo en Atenciones)
        if (!in_array($rol, ['administrador', 'recepcionista', 'laboratorista', 'medico'], true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado']);
            exit;
        }

        $res = $conn->query("SELECT * FROM ordenes_imagen WHERE cotizacion_id = $cotizacion_id ORDER BY fecha ASC, id ASC");
        $rowsBase = [];
        while ($res && ($r = $res->fetch_assoc())) {
            if (!usuarioPuedeVerOrdenImagen($conn, $r, (string)$rol, (int)$usuarioId, $contextConsultaId, $contextPacienteId)) {
                continue;
            }
            $rowsBase[] = $r;
        }

        $programacionMap = oi_programacion_ordenes_map($conn, $rowsBase);
        $rows = [];
        foreach ($rowsBase as $r) {
            $oid = (int)($r['id'] ?? 0);
            $programacion = $programacionMap[$oid] ?? null;
            $r['agenda_id'] = (int)($programacion['agenda_id'] ?? 0);
            $r['fecha_programada'] = (string)($programacion['fecha_programada'] ?? '');
            $r['hora_programada'] = (string)($programacion['hora_programada'] ?? '');
            $r['estado_evento_agenda'] = (string)($programacion['estado_evento_agenda'] ?? '');
            $r['correlativo_operativo'] = (int)($programacion['correlativo_operativo'] ?? 0);
            $rows[] = $r;
        }

        echo json_encode(['success' => true, 'ordenes' => $rows]);

    } elseif ($medico_id > 0) {
        if ($rol === 'medico' && $medico_id !== $usuarioId) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado para consultar órdenes de otro médico']);
            exit;
        }
        if (!in_array($rol, ['administrador', 'recepcionista', 'laboratorista', 'medico'], true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado']);
            exit;
        }

        $wheresTipo = '';
        if ($tipo && in_array($tipo, ['rx', 'ecografia', 'tomografia', 'todos'], true) && $tipo !== 'todos') {
            $tipoSeguro = $conn->real_escape_string($tipo);
            $wheresTipo = " AND oi.tipo = '$tipoSeguro'";
        }
        $whereMedico = "oi.medico_id = $medico_id $wheresTipo";
        $totalRes = $conn->query("SELECT COUNT(*) AS total FROM ordenes_imagen oi WHERE $whereMedico");
        $total = (int)(($totalRes ? $totalRes->fetch_assoc() : [])['total'] ?? 0);
        $totalPaginas = max(1, (int)ceil($total / $limite));
        $pagina = min($pagina, $totalPaginas);
        $offset = ($pagina - 1) * $limite;
        $res = $conn->query("SELECT oi.* FROM ordenes_imagen oi WHERE $whereMedico ORDER BY oi.fecha DESC LIMIT $limite OFFSET $offset");
        $rowsBase = [];
        $orderIds = [];
        $pacienteIds = [];
        while ($r = $res->fetch_assoc()) {
            $rowsBase[] = $r;
            $orderIds[] = (int)($r['id'] ?? 0);
            $pid = (int)($r['paciente_id'] ?? 0);
            if ($pid > 0) {
                $pacienteIds[] = $pid;
            }
        }

        $downloadBaseUrl = getApiEndpointPath('api_ordenes_imagen.php');
        $contextQuery = '';
        if ($contextConsultaId > 0 || $contextPacienteId > 0) {
            $ctxParts = [];
            if ($contextConsultaId > 0) {
                $ctxParts[] = 'context_consulta_id=' . $contextConsultaId;
            }
            if ($contextPacienteId > 0) {
                $ctxParts[] = 'context_paciente_id=' . $contextPacienteId;
            }
            $contextQuery = '&' . implode('&', $ctxParts);
        }

        $archivosMap = [];
        $archivosRawMap = obtenerArchivosOrdenesMap($conn, $orderIds);
        foreach ($archivosRawMap as $oid => $rawItems) {
            $archivosMap[$oid] = [];
            foreach ($rawItems as $a) {
                $mt = !empty($a['mime_type']) ? $a['mime_type'] : 'application/octet-stream';
                $archivosMap[$oid][] = [
                    'id' => (int)($a['id'] ?? 0),
                    'nombre_original' => (string)($a['nombre_original'] ?? ''),
                    'tamano' => (int)($a['tamano'] ?? 0),
                    'mime_type' => $mt,
                    'es_imagen' => strpos($mt, 'image/') === 0,
                    'es_dicom' => $mt === 'application/dicom',
                    'url' => $downloadBaseUrl . '?action=download&archivo_id=' . (int)($a['id'] ?? 0) . $contextQuery,
                    'fecha' => (string)($a['fecha'] ?? ''),
                ];
            }
        }

        $pacienteMap = [];
        $pacienteIds = array_values(array_unique(array_filter($pacienteIds, static function ($id) {
            return (int)$id > 0;
        })));
        if (!empty($pacienteIds)) {
            $inPac = implode(',', $pacienteIds);
            $resPac = $conn->query("SELECT id, nombre, apellido, dni, historia_clinica FROM pacientes WHERE id IN ($inPac)");
            while ($resPac && ($p = $resPac->fetch_assoc())) {
                $pacienteMap[(int)($p['id'] ?? 0)] = $p;
            }
        }

        $programacionMap = oi_programacion_ordenes_map($conn, $rowsBase);

        $rows = [];
        foreach ($rowsBase as $r) {
            $oid = (int)($r['id'] ?? 0);
            $programacion = $programacionMap[$oid] ?? null;
            $r['agenda_id'] = (int)($programacion['agenda_id'] ?? 0);
            $r['fecha_programada'] = (string)($programacion['fecha_programada'] ?? '');
            $r['hora_programada'] = (string)($programacion['hora_programada'] ?? '');
            $r['estado_evento_agenda'] = (string)($programacion['estado_evento_agenda'] ?? '');
            $r['correlativo_operativo'] = (int)($programacion['correlativo_operativo'] ?? 0);
            $r['archivos'] = $archivosMap[$oid] ?? [];
            completarMetadatosOrdenImagen($conn, $r);

            if (!usuarioPuedeVerOrdenImagen($conn, $r, (string)$rol, (int)$usuarioId, $contextConsultaId, $contextPacienteId)) {
                continue;
            }

            $pid = (int)($r['paciente_id'] ?? 0);
            $r['paciente'] = $pacienteMap[$pid] ?? null;
            $rows[] = $r;
        }
        echo json_encode([
            'success' => true,
            'ordenes' => $rows,
            'pagination' => [
                'page' => $pagina,
                'limit' => $limite,
                'total' => $total,
                'total_pages' => $totalPaginas,
            ],
        ]);

    } elseif ($paciente_id > 0) {
        // Todas las órdenes de un paciente (para ConsumoPaciente)
        $wheresTipo = '';
        if ($tipo && in_array($tipo, ['rx', 'ecografia', 'tomografia', 'todos'])) {
            if ($tipo !== 'todos') {
                $t = $conn->real_escape_string($tipo);
                $wheresTipo = "AND tipo = '$t'";
            }
        }
        $res  = $conn->query("SELECT * FROM ordenes_imagen WHERE paciente_id = $paciente_id $wheresTipo ORDER BY fecha DESC");
        $rows = [];
        while ($r = $res->fetch_assoc()) {
            adjuntarArchivos($conn, $r);
            $rows[] = $r;
        }
        echo json_encode(['success' => true, 'ordenes' => $rows]);

    } else {
        echo json_encode(['success' => false, 'error' => 'Parámetro requerido: orden_id, consulta_id, cotizacion_id, medico_id o paciente_id']);
    }
    exit;
}

// ─── POST ─────────────────────────────────────────────────────────────────────
if ($method === 'POST') {
    // Determinar si es upload de archivos o JSON
    $hayArchivos = isset($_FILES['archivos']) && !empty($_FILES['archivos']['name'][0]);

    if ($hayArchivos) {
        // ── Subir archivos ──────────────────────────────────────────────────
        $orden_id = (int)($_POST['orden_id'] ?? 0);
        if ($orden_id <= 0) { echo json_encode(['success' => false, 'error' => 'orden_id requerido']); exit; }

        $orden = $conn->query("SELECT * FROM ordenes_imagen WHERE id = $orden_id")->fetch_assoc();
        if (!$orden) { echo json_encode(['success' => false, 'error' => 'Orden no encontrada']); exit; }

        $medInfoOrden = resolverMedicoResponsableOrdenImagen($conn, $orden);
        if ((int)($orden['medico_id'] ?? 0) <= 0 && (int)($medInfoOrden['medico_id'] ?? 0) > 0) {
            $orden['medico_id'] = (int)$medInfoOrden['medico_id'];
        }

        if (!usuarioPuedeOperarOrdenImagen($orden, $rol, $usuarioId)) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'No autorizado. Solo el medico responsable/solicitante o un administrador puede subir archivos.',
            ]);
            exit;
        }

        // ── Verificar permiso de subida: cotización pagada o carga anticipada ───
        $puedeSubir = (intval($orden['carga_anticipada']) === 1);
        if (!$puedeSubir && !empty($orden['cotizacion_id'])) {
            $cotizRow = $conn->query("SELECT estado FROM cotizaciones WHERE id = " . intval($orden['cotizacion_id']))->fetch_assoc();
            $estadoCot = strtolower(trim((string)($cotizRow['estado'] ?? '')));
            if (in_array($estadoCot, ['completado', 'pagado', 'control', 'contrato'], true)) $puedeSubir = true;
        } elseif (!$puedeSubir && empty($orden['cotizacion_id'])) {
            // Sin cotización → permitir subida sin restricción (orden sin pago asignado)
            $puedeSubir = true;
        }
        if (!$puedeSubir) {
            echo json_encode(['success' => false, 'error' => 'El pago de la cotización es requerido antes de subir archivos. Use "Carga anticipada" para urgencias.', 'requiere_pago' => true]);
            exit;
        }

        $uploadDir = __DIR__ . '/uploads/imagenes_diagnostico/' . $orden['paciente_id'] . '/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $files = $_FILES['archivos'];
        $count = is_array($files['name']) ? count($files['name']) : 0;
        if ($count === 0) { echo json_encode(['success' => false, 'error' => 'Sin archivos']); exit; }

        $extMap = [
            'application/pdf'   => 'pdf',
            'image/jpeg'        => 'jpg',
            'image/png'         => 'png',
            'image/webp'        => 'webp',
            'image/gif'         => 'gif',
            'image/bmp'         => 'bmp',
            'image/tiff'        => 'tif',
            'application/dicom' => 'dcm',
        ];
        $mimesPermitidos = array_keys($extMap);

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if (!$finfo) {
            echo json_encode(['success' => false, 'error' => 'No se pudo inicializar validación de archivos']);
            exit;
        }

        $stmtInsertArchivo = $conn->prepare(
            'INSERT INTO ordenes_imagen_archivos (orden_id, nombre_original, archivo_path, tamano, mime_type) VALUES (?, ?, ?, ?, ?)'
        );
        if (!$stmtInsertArchivo) {
            finfo_close($finfo);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar registro de archivos']);
            exit;
        }

        $subidos = 0;
        for ($i = 0; $i < $count; $i++) {
            if ($files['error'][$i] !== UPLOAD_ERR_OK) continue;
            if ($files['size'][$i] > 100 * 1024 * 1024) continue; // 100 MB max

            $mimeType = finfo_file($finfo, $files['tmp_name'][$i]);
            if ($mimeType === false) continue;

            $extArchivo = strtolower(pathinfo($files['name'][$i], PATHINFO_EXTENSION));
            if ($mimeType === 'application/octet-stream' && $extArchivo === 'dcm') {
                $mimeType = 'application/dicom';
            }
            if (!in_array($mimeType, $mimesPermitidos)) continue;

            $fileExt        = $extMap[$mimeType] ?? 'bin';
            $nombreOriginal = basename($files['name'][$i]);
            $tamano         = $files['size'][$i];
            $safeName       = date('Ymd_His') . '_oi' . $orden_id . '_' . $i . '.' . $fileExt;
            $destPath       = $uploadDir . $safeName;

            if (!move_uploaded_file($files['tmp_name'][$i], $destPath)) continue;

            $stmtInsertArchivo->bind_param('issis', $orden_id, $nombreOriginal, $destPath, $tamano, $mimeType);
            if (!$stmtInsertArchivo->execute()) {
                continue;
            }
            $subidos++;
        }

        $stmtInsertArchivo->close();
        finfo_close($finfo);

        if ($subidos > 0) {
            $conn->query("UPDATE ordenes_imagen SET estado = 'completado' WHERE id = $orden_id");
        }

        echo json_encode(['success' => true, 'subidos' => $subidos]);

    } else {
        // ── JSON actions ────────────────────────────────────────────────────
        $input  = json_decode(file_get_contents('php://input'), true) ?? [];
        $action = $input['action'] ?? ($_POST['action'] ?? '');

        if ($action === 'crear') {
            $consulta_id         = (int)($input['consulta_id'] ?? 0);
            $paciente_id         = (int)($input['paciente_id'] ?? 0);
            $tipo                = trim($input['tipo'] ?? 'rx');
            $indicacionesUsuario = trim($input['indicaciones'] ?? '');
            $cargaAnticipada     = !empty($input['carga_anticipada']) ? 1 : 0;
            $fechaProgramadaInput = oi_normalizar_fecha_programada_agenda($input['fecha_programada'] ?? null);
            $horaProgramadaInput = oi_normalizar_hora_programada_agenda($input['hora_programada'] ?? null);
            // servicios: array of {tarifa_id, descripcion, precio, medico_id} sent from SolicitudImagenPage
            $servicios = is_array($input['servicios'] ?? null) ? $input['servicios'] : [];

            if ($consulta_id <= 0 || $paciente_id <= 0) {
                echo json_encode(['success' => false, 'error' => 'consulta_id y paciente_id son requeridos']); exit;
            }
            if (!in_array($tipo, ['rx', 'ecografia', 'tomografia'])) {
                echo json_encode(['success' => false, 'error' => 'Tipo no válido']); exit;
            }

            $conn->begin_transaction();

            try {

            $consultaFecha = null;
            $consultaHora = null;
            $stmtConsulta = $conn->prepare('SELECT fecha, hora FROM consultas WHERE id = ? LIMIT 1');
            if ($stmtConsulta) {
                $stmtConsulta->bind_param('i', $consulta_id);
                $stmtConsulta->execute();
                $rowConsulta = $stmtConsulta->get_result()->fetch_assoc();
                $stmtConsulta->close();
                $consultaFecha = oi_normalizar_fecha_programada_agenda($rowConsulta['fecha'] ?? null);
                $consultaHora = oi_normalizar_hora_programada_agenda($rowConsulta['hora'] ?? null);
            }

            if ($fechaProgramadaInput === null) {
                $fechaProgramadaInput = $consultaFecha ?: date('Y-m-d');
            }
            if ($horaProgramadaInput === null) {
                $horaProgramadaInput = $consultaHora ?: date('H:i:s');
            }

            $tipoServMap     = ['rx' => 'rayosx', 'ecografia' => 'ecografia', 'tomografia' => 'procedimientos'];
            $detalleServTipo = $tipoServMap[$tipo] ?? $tipo;
            $tipoLabel       = ['rx' => 'Rayos X', 'ecografia' => 'Ecografía', 'tomografia' => 'Tomografía'][$tipo] ?? strtoupper($tipo);

            // Validar médico responsable antes de crear cotización para evitar huérfanas por reintentos.
            if (!empty($servicios)) {
                $serviciosSinMedicoPre = [];
                foreach ($servicios as $srv) {
                    $precio = floatval($srv['precio'] ?? 0);
                    if ($precio <= 0) continue;
                    $medicoServicioId = (int)($srv['medico_id'] ?? 0);
                    if ($medicoServicioId <= 0) {
                        $descSrv = trim((string)($srv['descripcion'] ?? ''));
                        $serviciosSinMedicoPre[] = ($descSrv !== '' ? $descSrv : ('Tarifa #' . (int)($srv['tarifa_id'] ?? 0)));
                    }
                }

                if (!empty($serviciosSinMedicoPre)) {
                    throw new Exception('Hay servicios de imagen sin médico responsable configurado: ' . implode(', ', $serviciosSinMedicoPre));
                }
            }

            // ── Paso 1: crear cotización primero para obtener cotizaciones_detalle.id ──
            // Esto permite asignar un token "Detalle #X" por orden, que hace que:
            //   - adjuntarArchivos() muestre solo la descripción del servicio propio
            //   - la idempotencia con sincronizar_servicios_clinicos_post_pago_cotizacion funcione
            $cotizData             = ['cotizacion_id' => null, 'numero_comprobante' => null, 'total' => 0];
            $detalleIdMapByService = []; // servicio_id (tarifa) → [id, medico_id]
            $detalleIdMapByDesc    = []; // strtolower(descripcion) → [id, medico_id]

            $detallesCotiz = [];
            foreach ($servicios as $srv) {
                $precio = floatval($srv['precio'] ?? 0);
                if ($precio <= 0) continue;
                $medicoServicioId = (int)($srv['medico_id'] ?? 0);
                $detallesCotiz[] = [
                    'servicio_tipo'   => $detalleServTipo,
                    'servicio_id'     => intval($srv['tarifa_id'] ?? 0),
                    'descripcion'     => trim((string)($srv['descripcion'] ?? 'Servicio')),
                    'cantidad'        => 1,
                    'precio_unitario' => $precio,
                    'subtotal'        => $precio,
                    'medico_id'       => $medicoServicioId,
                ];
            }

            if (!empty($detallesCotiz)) {
                $obsPartes      = ["Orden de $tipoLabel desde consulta #$consulta_id"];
                if ($indicacionesUsuario !== '') $obsPartes[] = $indicacionesUsuario;
                $obsText        = implode(' | ', $obsPartes);
                // Usar usuario_id = 0 si es médico (su ID viene de tabla medicos, no usuarios)
                $usuarioIdCotiz = ($rol === 'medico') ? 0 : $usuarioId;
                $medicoIdCotiz  = 0;
                $cotizData      = crearCotizacionImagen($conn, $paciente_id, $consulta_id, $detallesCotiz, $usuarioIdCotiz, $obsText, $medicoIdCotiz);
                $cotizIdNew     = intval($cotizData['cotizacion_id']);
                if ($cotizIdNew > 0) {
                    // Mapear detalle por servicio_id y descripcion para resolver tokens y medico responsable.
                    $dRes = $conn->query("SELECT id, servicio_id, descripcion, medico_id FROM cotizaciones_detalle WHERE cotizacion_id = $cotizIdNew ORDER BY id ASC");
                    while ($dRes && ($dRow = $dRes->fetch_assoc())) {
                        $detalleMeta = [
                            'id' => (int)($dRow['id'] ?? 0),
                            'medico_id' => (int)($dRow['medico_id'] ?? 0),
                        ];
                        $servicioId = (int)($dRow['servicio_id'] ?? 0);
                        if ($servicioId > 0 && !isset($detalleIdMapByService[$servicioId])) {
                            $detalleIdMapByService[$servicioId] = $detalleMeta;
                        }
                        $descKey = strtolower(trim((string)($dRow['descripcion'] ?? '')));
                        if ($descKey !== '' && !isset($detalleIdMapByDesc[$descKey])) {
                            $detalleIdMapByDesc[$descKey] = $detalleMeta;
                        }
                    }
                }
            }

            // ── Paso 2: crear UNA orden por cada servicio (o una genérica si no hay servicios) ──
            $cotizId  = intval($cotizData['cotizacion_id'] ?? 0);
            $ordenIds = [];

            if (empty($servicios)) {
                // Sin servicios → orden genérica con indicaciones del usuario
                $indFinal = $indicacionesUsuario !== '' ? $indicacionesUsuario : strtoupper($tipo);
                $medicoFallback = 0;
                $stmtMedicoConsulta = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
                if ($stmtMedicoConsulta) {
                    $stmtMedicoConsulta->bind_param('i', $consulta_id);
                    $stmtMedicoConsulta->execute();
                    $rowMedicoConsulta = $stmtMedicoConsulta->get_result()->fetch_assoc();
                    $stmtMedicoConsulta->close();
                    $medicoFallback = (int)($rowMedicoConsulta['medico_id'] ?? 0);
                }
                if ($medicoFallback <= 0) {
                    throw new Exception('No se pudo resolver médico responsable para esta solicitud de imagen.');
                }
                $stmt = $conn->prepare('INSERT INTO ordenes_imagen (consulta_id, paciente_id, tipo, indicaciones, estado, solicitado_por, carga_anticipada) VALUES (?, ?, ?, ?, \'pendiente\', ?, ?)');
                $stmt->bind_param('iissii', $consulta_id, $paciente_id, $tipo, $indFinal, $usuarioId, $cargaAnticipada);
                $stmt->execute();
                $stmt->close();
                $oid        = (int)$conn->insert_id;
                $ordenIds[] = $oid;
                $conn->query("UPDATE ordenes_imagen SET medico_id = $medicoFallback WHERE id = $oid");
                if ($cotizId > 0) {
                    $conn->query("UPDATE ordenes_imagen SET cotizacion_id = $cotizId WHERE id = $oid");
                }
            } else {
                $serviciosSinMedico = [];
                $serviciosNormalizados = [];
                $slotsAsignadosPorGrupo = [];
                foreach ($servicios as $srv) {
                    $desc = trim((string)($srv['descripcion'] ?? 'Servicio'));
                    $tarifaIdSrv = (int)($srv['tarifa_id'] ?? 0);
                    $descKeySrv = strtolower($desc);
                    $detalleMeta = ['id' => 0, 'medico_id' => 0];
                    if ($tarifaIdSrv > 0 && isset($detalleIdMapByService[$tarifaIdSrv])) {
                        $detalleMeta = $detalleIdMapByService[$tarifaIdSrv];
                    } elseif ($descKeySrv !== '' && isset($detalleIdMapByDesc[$descKeySrv])) {
                        $detalleMeta = $detalleIdMapByDesc[$descKeySrv];
                    }
                    $detalleId = (int)($detalleMeta['id'] ?? 0);
                    $medicoResponsableId = (int)($detalleMeta['medico_id'] ?? 0);
                    if ($medicoResponsableId <= 0) {
                        $medicoResponsableId = (int)($srv['medico_id'] ?? 0);
                    }
                    if ($medicoResponsableId <= 0) {
                        $serviciosSinMedico[] = ($desc !== '' ? $desc : ('Tarifa #' . $tarifaIdSrv));
                        continue;
                    }

                    $serviciosNormalizados[] = [
                        'detalle_id' => $detalleId,
                        'servicio_id' => $tarifaIdSrv,
                        'descripcion' => $desc,
                        'medico_id' => $medicoResponsableId,
                    ];
                }

                if (!empty($serviciosSinMedico)) {
                    throw new Exception('Hay servicios de imagen sin médico responsable configurado: ' . implode(', ', $serviciosSinMedico));
                }

                foreach ($serviciosNormalizados as $srvNorm) {
                    $detalleId = (int)$srvNorm['detalle_id'];
                    $desc = (string)$srvNorm['descripcion'];
                    $medicoResponsableId = (int)$srvNorm['medico_id'];
                    $fechaAgenda = $fechaProgramadaInput;
                    $horaAgenda = $horaProgramadaInput;

                    if ($fechaAgenda !== null && $medicoResponsableId > 0) {
                        $grupoKey = $medicoResponsableId . '|' . $fechaAgenda;
                        if (!isset($slotsAsignadosPorGrupo[$grupoKey])) {
                            $slotsAsignadosPorGrupo[$grupoKey] = [];
                        }
                        $horaAgenda = oi_resolver_hora_libre_secuencial(
                            $conn,
                            $medicoResponsableId,
                            $fechaAgenda,
                            $horaAgenda,
                            $slotsAsignadosPorGrupo[$grupoKey]
                        );
                        if ($horaAgenda !== null) {
                            $slotsAsignadosPorGrupo[$grupoKey][] = $horaAgenda;
                        }
                    }

                    // Formato estricto: compatible con idempotencia de crear_ordenes_imagen_cotizacion
                    // (payment-sync usa este mismo formato para deduplicar)
                    if ($detalleId > 0 && $cotizId > 0) {
                        $indFinal = "Detalle #$detalleId - $desc | Orden creada desde cotización #$cotizId";
                    } elseif ($cotizId > 0) {
                        $indFinal = "$desc | Orden creada desde cotización #$cotizId";
                    } else {
                        $indFinal = $indicacionesUsuario !== '' ? $indicacionesUsuario : $desc;
                    }

                    if ($cotizId > 0) {
                        $stmt = $conn->prepare('INSERT INTO ordenes_imagen (consulta_id, paciente_id, medico_id, tipo, indicaciones, estado, solicitado_por, carga_anticipada, cotizacion_id) VALUES (?, ?, ?, ?, ?, \'pendiente\', ?, ?, ?)');
                        $stmt->bind_param('iiissiii', $consulta_id, $paciente_id, $medicoResponsableId, $tipo, $indFinal, $usuarioId, $cargaAnticipada, $cotizId);
                    } else {
                        $stmt = $conn->prepare('INSERT INTO ordenes_imagen (consulta_id, paciente_id, medico_id, tipo, indicaciones, estado, solicitado_por, carga_anticipada) VALUES (?, ?, ?, ?, ?, \'pendiente\', ?, ?)');
                        $stmt->bind_param('iiissii', $consulta_id, $paciente_id, $medicoResponsableId, $tipo, $indFinal, $usuarioId, $cargaAnticipada);
                    }
                    $stmt->execute();
                    $stmt->close();
                    $ordenIds[] = (int)$conn->insert_id;

                    if ($cotizId > 0 && $detalleId > 0) {
                        oi_agendar_detalle_cotizacion_imagen(
                            $conn,
                            $cotizId,
                            $detalleId,
                            $paciente_id,
                            $medicoResponsableId,
                            $detalleServTipo,
                            (int)($srvNorm['servicio_id'] ?? 0),
                            $desc,
                            $fechaAgenda,
                            $horaAgenda,
                            (int)$usuarioId
                        );
                    }
                }
            }

            // ── Paso 3: vincular cada orden al nodo HC activo de la consulta ──────────
            foreach ($ordenIds as $oid) {
                $conn->query("UPDATE ordenes_imagen oi INNER JOIN historia_clinica h ON h.consulta_id = oi.consulta_id SET oi.historia_clinica_id = h.id WHERE oi.id = $oid AND oi.historia_clinica_id IS NULL");
            }

            $conn->commit();

            echo json_encode([
                'success'            => true,
                'orden_id'           => $ordenIds[0] ?? 0,   // compatibilidad retroactiva
                'orden_ids'          => $ordenIds,
                'cotizacion_id'      => $cotizData['cotizacion_id'],
                'numero_comprobante' => $cotizData['numero_comprobante'],
                'total'              => $cotizData['total'],
            ]);
            } catch (Throwable $e) {
                $conn->rollback();
                echo json_encode([
                    'success' => false,
                    'error' => $e->getMessage() ?: 'No se pudo crear la orden de imagen.',
                ]);
            }

        } elseif ($action === 'crear_desde_cotizacion') {
            $cotizacion_id = (int)($input['cotizacion_id'] ?? 0);
            $paciente_id_input = (int)($input['paciente_id'] ?? 0);
            if ($cotizacion_id <= 0) {
                echo json_encode(['success' => false, 'error' => 'cotizacion_id requerido']);
                exit;
            }

            $cot = $conn->query("SELECT id, paciente_id FROM cotizaciones WHERE id = $cotizacion_id LIMIT 1")->fetch_assoc();
            if (!$cot) {
                echo json_encode(['success' => false, 'error' => 'Cotización no encontrada']);
                exit;
            }

            $paciente_id = (int)($cot['paciente_id'] ?? 0);
            if ($paciente_id <= 0) {
                $paciente_id = $paciente_id_input;
            }
            if ($paciente_id <= 0) {
                echo json_encode(['success' => false, 'error' => 'No se pudo resolver paciente_id']);
                exit;
            }

            $hasEstadoItem = $conn->query("SHOW COLUMNS FROM cotizaciones_detalle LIKE 'estado_item'");
            $whereEstado = ($hasEstadoItem && $hasEstadoItem->num_rows > 0)
                ? " AND estado_item <> 'eliminado'"
                : '';

            $detRes = $conn->query("SELECT id, servicio_tipo, descripcion, medico_id, consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = $cotizacion_id" . $whereEstado . " ORDER BY id ASC");
            $detallesImagen = [];
            while ($det = $detRes->fetch_assoc()) {
                $detalleId = (int)($det['id'] ?? 0);
                $tipoSrv = strtolower(trim((string)($det['servicio_tipo'] ?? '')));
                $desc = strtolower(trim((string)($det['descripcion'] ?? '')));
                $tipoOrden = null;

                if (in_array($tipoSrv, ['rayosx', 'rayos_x', 'rayos x', 'rx'], true)) {
                    $tipoOrden = 'rx';
                } elseif ($tipoSrv === 'ecografia') {
                    $tipoOrden = 'ecografia';
                } elseif ($tipoSrv === 'tomografia') {
                    $tipoOrden = 'tomografia';
                } elseif (in_array($tipoSrv, ['procedimiento', 'procedimientos'], true)) {
                    if (preg_match('/tomograf|\btac\b/u', $desc)) {
                        $tipoOrden = 'tomografia';
                    } elseif (preg_match('/rayos\s*x|\brx\b/u', $desc)) {
                        $tipoOrden = 'rx';
                    } elseif (preg_match('/ecograf/i', $desc)) {
                        $tipoOrden = 'ecografia';
                    }
                }

                if ($tipoOrden) {
                    $detallesImagen[] = [
                        'detalle_id' => $detalleId,
                        'tipo' => $tipoOrden,
                        'descripcion' => trim((string)($det['descripcion'] ?? '')),
                        'medico_id' => (int)($det['medico_id'] ?? 0),
                        'consulta_id' => (int)($det['consulta_id'] ?? 0),
                    ];
                }
            }

            if (empty($detallesImagen)) {
                echo json_encode(['success' => true, 'creadas' => 0, 'tipos' => []]);
                exit;
            }

            $creadas = 0;
            $tiposCreados = [];
            $omitidasSinMedico = [];
            foreach ($detallesImagen as $detImg) {
                $detalleId = (int)$detImg['detalle_id'];
                $tipoOrden = (string)$detImg['tipo'];
                $descOrden = trim((string)$detImg['descripcion']);
                $medicoResponsableId = (int)($detImg['medico_id'] ?? 0);
                if ($medicoResponsableId <= 0) {
                    $omitidasSinMedico[] = $descOrden !== '' ? $descOrden : ('Detalle #' . $detalleId);
                    continue;
                }
                $consultaRelacionadaId = (int)($detImg['consulta_id'] ?? 0);
                if ($descOrden === '') {
                    $descOrden = strtoupper($tipoOrden);
                }
                $tokenDetalle = $detalleId > 0 ? ('Detalle #' . $detalleId . ' - ') : '';
                $indicaciones = $tokenDetalle . $descOrden . ' | Orden creada desde cotización #' . $cotizacion_id;

                $stmtChk = $conn->prepare('SELECT id FROM ordenes_imagen WHERE cotizacion_id = ? AND tipo = ? AND indicaciones = ? LIMIT 1');
                if ($stmtChk) {
                    $stmtChk->bind_param('iss', $cotizacion_id, $tipoOrden, $indicaciones);
                    $stmtChk->execute();
                    $exists = $stmtChk->get_result()->fetch_assoc();
                    $stmtChk->close();
                    if ($exists) {
                        continue;
                    }
                }

                $consultaRelacionada = $consultaRelacionadaId > 0 ? $consultaRelacionadaId : null;
                $stmtIns = $conn->prepare("INSERT INTO ordenes_imagen (consulta_id, paciente_id, medico_id, tipo, indicaciones, estado, solicitado_por, cotizacion_id, carga_anticipada) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?, 0)");
                if ($stmtIns) {
                    $stmtIns->bind_param('iiissii', $consultaRelacionada, $paciente_id, $medicoResponsableId, $tipoOrden, $indicaciones, $usuarioId, $cotizacion_id);
                    $stmtIns->execute();
                    $stmtIns->close();
                    $creadas++;
                    $tiposCreados[] = $tipoOrden;
                }
            }

            echo json_encode([
                'success' => true,
                'creadas' => $creadas,
                'tipos' => $tiposCreados,
                'omitidas_sin_medico' => $omitidasSinMedico,
            ]);

        } elseif ($action === 'toggle_anticipada') {
            $orden_id = (int)($input['orden_id'] ?? 0);
            $valor    = !empty($input['valor']) ? 1 : 0;
            if ($orden_id > 0) {
                $conn->query("UPDATE ordenes_imagen SET carga_anticipada = $valor WHERE id = $orden_id");
            }
            echo json_encode(['success' => true, 'carga_anticipada' => $valor]);

        } elseif ($action === 'cancelar') {
            $orden_id = (int)($input['orden_id'] ?? 0);
            if ($orden_id <= 0) {
                echo json_encode(['success' => false, 'error' => 'orden_id requerido']);
                exit;
            }

            $rowOrden = $conn->query("SELECT id, estado, cotizacion_id FROM ordenes_imagen WHERE id = $orden_id LIMIT 1")->fetch_assoc();
            if (!$rowOrden) {
                echo json_encode(['success' => false, 'error' => 'Orden no encontrada']);
                exit;
            }

            $estadoOrden = strtolower(trim((string)($rowOrden['estado'] ?? 'pendiente')));
            if ($estadoOrden !== 'pendiente') {
                echo json_encode(['success' => false, 'error' => 'Solo se pueden cancelar solicitudes pendientes.']);
                exit;
            }

            $tieneArchivos = false;
            $tblArch = $conn->query("SHOW TABLES LIKE 'ordenes_imagen_archivos'");
            if ($tblArch && $tblArch->num_rows > 0) {
                $chkArch = $conn->query("SELECT COUNT(*) c FROM ordenes_imagen_archivos WHERE orden_id = $orden_id");
                $tieneArchivos = ((int)($chkArch->fetch_assoc()['c'] ?? 0)) > 0;
            }
            if ($tieneArchivos) {
                echo json_encode(['success' => false, 'error' => 'No se puede cancelar: la solicitud ya fue procesada (tiene archivos).']);
                exit;
            }

            $cotizacionId = (int)($rowOrden['cotizacion_id'] ?? 0);
            if ($cotizacionId > 0) {
                $cotizRow = $conn->query("SELECT estado FROM cotizaciones WHERE id = $cotizacionId LIMIT 1")->fetch_assoc();
                $estadoCot = strtolower(trim((string)($cotizRow['estado'] ?? 'pendiente')));
                $editable = in_array($estadoCot, ['pendiente', 'parcial'], true);
                if (!$editable) {
                    echo json_encode(['success' => false, 'error' => 'No se puede cancelar: la cotización ya fue cobrada o cerrada.']);
                    exit;
                }
                if (oi_cotizacion_tiene_pagos($conn, $cotizacionId)) {
                    echo json_encode(['success' => false, 'error' => 'No se puede cancelar: la cotización ya tiene pagos registrados.']);
                    exit;
                }
            }

            $conn->begin_transaction();
            try {
                $conn->query("UPDATE ordenes_imagen SET estado = 'cancelado' WHERE id = $orden_id");

                if ($cotizacionId > 0) {
                    $indicaciones = (string)($rowOrden['indicaciones'] ?? '');
                    $consultaIdRef = (int)($rowOrden['consulta_id'] ?? 0);
                    $detalleTokenId = 0;
                    if ($indicaciones !== '' && preg_match('/detalle\s*#\s*(\d+)/i', $indicaciones, $m)) {
                        $detalleTokenId = (int)($m[1] ?? 0);
                    }

                    $tipoOrden = strtolower(trim((string)($rowOrden['tipo'] ?? '')));
                    $whereTipo = '';
                    if ($tipoOrden === 'ecografia') {
                        $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) = 'ecografia' OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND LOWER(descripcion) LIKE '%ecograf%'))";
                    } elseif ($tipoOrden === 'rx') {
                        $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) IN ('rayosx','rayos_x','rayos x','rx') OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND (LOWER(descripcion) LIKE '%rayos x%' OR LOWER(descripcion) REGEXP '(^|[^a-z])rx([^a-z]|$)')))";
                    } elseif ($tipoOrden === 'tomografia') {
                        $whereTipo = " AND (LOWER(TRIM(servicio_tipo)) = 'tomografia' OR (LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos') AND (LOWER(descripcion) LIKE '%tomograf%' OR LOWER(descripcion) LIKE '% tac %' OR LOWER(descripcion) LIKE 'tac %' OR LOWER(descripcion) LIKE '% tac')))";
                    }

                    $hasEstadoItem = oi_column_exists($conn, 'cotizaciones_detalle', 'estado_item');
                    if ($detalleTokenId > 0) {
                        if ($hasEstadoItem) {
                            $stmtDet = $conn->prepare("UPDATE cotizaciones_detalle SET estado_item = 'eliminado' WHERE cotizacion_id = ? AND id = ?");
                        } else {
                            $stmtDet = $conn->prepare('DELETE FROM cotizaciones_detalle WHERE cotizacion_id = ? AND id = ?');
                        }
                        if ($stmtDet) {
                            $stmtDet->bind_param('ii', $cotizacionId, $detalleTokenId);
                            $stmtDet->execute();
                            $stmtDet->close();
                        }
                    } else {
                        if ($hasEstadoItem) {
                            $sql = "UPDATE cotizaciones_detalle SET estado_item = 'eliminado' WHERE cotizacion_id = $cotizacionId{$whereTipo}";
                        } else {
                            $sql = "DELETE FROM cotizaciones_detalle WHERE cotizacion_id = $cotizacionId{$whereTipo}";
                        }
                        $conn->query($sql);
                    }

                    oi_recalcular_total_cotizacion($conn, $cotizacionId);

                    $stmtCotOut = $conn->prepare('SELECT COALESCE(total, 0) AS total, COALESCE(total_pagado, 0) AS total_pagado FROM cotizaciones WHERE id = ? LIMIT 1');
                    $totalCot = 0.0;
                    $pagadoCot = 0.0;
                    if ($stmtCotOut) {
                        $stmtCotOut->bind_param('i', $cotizacionId);
                        $stmtCotOut->execute();
                        $rowCotOut = $stmtCotOut->get_result()->fetch_assoc();
                        $stmtCotOut->close();
                        $totalCot = (float)($rowCotOut['total'] ?? 0);
                        $pagadoCot = (float)($rowCotOut['total_pagado'] ?? 0);
                    }

                    if ($totalCot <= 0.00001 && $pagadoCot <= 0.00001) {
                        if (oi_column_exists($conn, 'cotizaciones', 'referencia_origen')) {
                            $ref = 'HC consulta #' . $consultaIdRef . ' · Solicitud de imagen cancelada';
                            $stmtRef = $conn->prepare("UPDATE cotizaciones SET referencia_origen = CASE WHEN referencia_origen IS NULL OR TRIM(referencia_origen) = '' THEN ? ELSE referencia_origen END WHERE id = ?");
                            if ($stmtRef) {
                                $stmtRef->bind_param('si', $ref, $cotizacionId);
                                $stmtRef->execute();
                                $stmtRef->close();
                            }
                        }

                        if (oi_column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
                            $stmtAn = $conn->prepare("UPDATE cotizaciones SET estado = 'anulada', total = 0, saldo_pendiente = 0 WHERE id = ?");
                        } else {
                            $stmtAn = $conn->prepare("UPDATE cotizaciones SET estado = 'anulada', total = 0 WHERE id = ?");
                        }
                        if ($stmtAn) {
                            $stmtAn->bind_param('i', $cotizacionId);
                            $stmtAn->execute();
                            $stmtAn->close();
                        }
                    }
                }

                $conn->commit();
                echo json_encode(['success' => true]);
            } catch (Throwable $e) {
                $conn->rollback();
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }

        } elseif ($action === 'eliminar_archivo') {
            $archivo_id = (int)($input['archivo_id'] ?? 0);
            $row = $conn->query("SELECT a.*, o.consulta_id, o.paciente_id, o.medico_id, o.solicitado_por, o.cotizacion_id, o.indicaciones FROM ordenes_imagen_archivos a INNER JOIN ordenes_imagen o ON o.id = a.orden_id WHERE a.id = $archivo_id LIMIT 1")->fetch_assoc();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Archivo no encontrado']);
                exit;
            }
            if (!usuarioPuedeOperarOrdenImagen($row, $rol, $usuarioId)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para eliminar archivos de esta orden']);
                exit;
            }

            if (file_exists($row['archivo_path'])) @unlink($row['archivo_path']);
            $conn->query("DELETE FROM ordenes_imagen_archivos WHERE id = $archivo_id");
            $oid = (int)$row['orden_id'];
            $cnt = (int)$conn->query("SELECT COUNT(*) c FROM ordenes_imagen_archivos WHERE orden_id = $oid")->fetch_assoc()['c'];
            if ($cnt === 0) $conn->query("UPDATE ordenes_imagen SET estado = 'pendiente' WHERE id = $oid");
            echo json_encode(['success' => true]);

        } else {
            echo json_encode(['success' => false, 'error' => 'Acción no reconocida: ' . htmlspecialchars($action)]);
        }
    }
    exit;
}

echo json_encode(['success' => false, 'error' => 'Método no soportado']);
