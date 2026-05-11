<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

if (!function_exists('op_column_exists')) {
    function op_column_exists(mysqli $conn, $table, $column)
    {
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

if (!function_exists('op_table_exists')) {
    function op_table_exists(mysqli $conn, $table)
    {
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1');
        if (!$stmt) return false;
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res && $res->num_rows > 0;
        $stmt->close();
        return $exists;
    }
}

if (!function_exists('op_ensure_schema')) {
    function op_ensure_schema(mysqli $conn)
    {
        if (!op_table_exists($conn, 'ordenes_procedimientos')) {
            $conn->query("CREATE TABLE ordenes_procedimientos (
                id INT NOT NULL AUTO_INCREMENT,
                consulta_id INT NOT NULL,
                paciente_id INT DEFAULT NULL,
                procedimientos_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
                estado VARCHAR(20) DEFAULT 'pendiente',
                cotizacion_id INT DEFAULT NULL,
                usuario_id INT DEFAULT NULL,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_op_consulta_estado_fecha_id (consulta_id, estado, fecha, id),
                KEY idx_op_paciente_fecha_id (paciente_id, fecha, id),
                KEY idx_op_cotizacion (cotizacion_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
        }
    }
}

if (!function_exists('op_normalize_procedimientos_ids')) {
    function op_normalize_procedimientos_ids($raw)
    {
        $out = [];
        foreach ((array)$raw as $it) {
            $id = is_array($it) && isset($it['id']) ? (int)$it['id'] : (int)$it;
            if ($id > 0) $out[] = $id;
        }
        return array_values(array_unique($out));
    }
}

if (!function_exists('op_fetch_tarifas_procedimientos')) {
    function op_fetch_tarifas_procedimientos(mysqli $conn, array $ids)
    {
        $ids = op_normalize_procedimientos_ids($ids);
        if (empty($ids)) return [];

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $sql = "SELECT id, descripcion, precio_particular
                FROM tarifas
                WHERE activo = 1
                  AND LOWER(TRIM(servicio_tipo)) IN ('procedimientos', 'procedimiento')
                  AND id IN ($placeholders)";
        $stmt = $conn->prepare($sql);
        if (!$stmt) return [];
        $stmt->bind_param(str_repeat('i', count($ids)), ...$ids);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $out = [];
        foreach ($rows as $r) {
            $id = (int)($r['id'] ?? 0);
            if ($id <= 0) continue;
            $out[$id] = [
                'id' => $id,
                'descripcion' => (string)($r['descripcion'] ?? ''),
                'precio' => round((float)($r['precio_particular'] ?? 0), 2),
            ];
        }
        return $out;
    }
}

if (!function_exists('op_recalcular_total_cotizacion')) {
    function op_recalcular_total_cotizacion(mysqli $conn, int $cotizacionId)
    {
        $whereEstado = op_column_exists($conn, 'cotizaciones_detalle', 'estado_item') ? " AND estado_item <> 'eliminado'" : '';
        $stmtTotal = $conn->prepare("SELECT COALESCE(SUM(subtotal),0) AS total FROM cotizaciones_detalle WHERE cotizacion_id = ?{$whereEstado}");
        if (!$stmtTotal) return;
        $stmtTotal->bind_param('i', $cotizacionId);
        $stmtTotal->execute();
        $row = $stmtTotal->get_result()->fetch_assoc();
        $stmtTotal->close();

        $total = round((float)($row['total'] ?? 0), 2);

        if (op_column_exists($conn, 'cotizaciones', 'total_pagado') && op_column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
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
        } else {
            $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ? WHERE id = ?');
            if ($stmtUp) {
                $stmtUp->bind_param('di', $total, $cotizacionId);
                $stmtUp->execute();
                $stmtUp->close();
            }
        }
    }
}

if (!function_exists('op_insertar_detalle_procedimiento')) {
    function op_insertar_detalle_procedimiento(mysqli $conn, int $cotizacionId, int $consultaId, int $medicoId, int $usuarioId, array $tarifa)
    {
        $cols = ['cotizacion_id', 'servicio_tipo', 'servicio_id', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal'];
        $vals = ['?', '?', '?', '?', '?', '?', '?'];
        $types = 'isisidd';
        $params = [
            $cotizacionId,
            'procedimiento',
            (int)$tarifa['id'],
            (string)$tarifa['descripcion'],
            1,
            (float)$tarifa['precio'],
            (float)$tarifa['precio'],
        ];

        if (op_column_exists($conn, 'cotizaciones_detalle', 'consulta_id')) {
            $cols[] = 'consulta_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $consultaId;
        }
        if (op_column_exists($conn, 'cotizaciones_detalle', 'medico_id') && $medicoId > 0) {
            $cols[] = 'medico_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $medicoId;
        }
        if (op_column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
            $cols[] = 'estado_item';
            $vals[] = '?';
            $types .= 's';
            $params[] = 'activo';
        }
        if (op_column_exists($conn, 'cotizaciones_detalle', 'version_item')) {
            $cols[] = 'version_item';
            $vals[] = '?';
            $types .= 'i';
            $params[] = 1;
        }
        if (op_column_exists($conn, 'cotizaciones_detalle', 'editado_por') && $usuarioId > 0) {
            $cols[] = 'editado_por';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $usuarioId;
        }
        if (op_column_exists($conn, 'cotizaciones_detalle', 'editado_en')) {
            $cols[] = 'editado_en';
            $vals[] = 'NOW()';
        }
        if (op_column_exists($conn, 'cotizaciones_detalle', 'motivo_edicion')) {
            $cols[] = 'motivo_edicion';
            $vals[] = '?';
            $types .= 's';
            $params[] = 'HC_PROCEDIMIENTOS_AUTO';
        }

        $sql = 'INSERT INTO cotizaciones_detalle (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
        $stmt = $conn->prepare($sql);
        if (!$stmt) return false;
        $stmt->bind_param($types, ...$params);
        $ok = $stmt->execute();
        $stmt->close();
        return $ok;
    }
}

if (!function_exists('op_crear_cotizacion_procedimientos')) {
    function op_crear_cotizacion_procedimientos(mysqli $conn, int $pacienteId, int $consultaId, int $medicoId, int $usuarioId, array $tarifas)
    {
        $total = 0.0;
        foreach ($tarifas as $t) {
            $total += (float)($t['precio'] ?? 0);
        }

        $obs = 'Procedimientos desde consulta #' . $consultaId;
        $stmt = $conn->prepare("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, saldo_pendiente, total_pagado, observaciones) VALUES (?, ?, ?, 'pendiente', ?, 0, ?)");
        if (!$stmt) return ['cotizacion_id' => 0, 'numero_comprobante' => null, 'total' => 0];
        $stmt->bind_param('iidds', $pacienteId, $usuarioId, $total, $total, $obs);
        if (!$stmt->execute()) {
            $stmt->close();
            return ['cotizacion_id' => 0, 'numero_comprobante' => null, 'total' => 0];
        }
        $stmt->close();

        $cotizacionId = (int)$conn->insert_id;
        $numero = 'Q' . str_pad((string)$cotizacionId, 6, '0', STR_PAD_LEFT);
        $conn->query("UPDATE cotizaciones SET numero_comprobante = '" . $conn->real_escape_string($numero) . "' WHERE id = $cotizacionId");

        foreach ($tarifas as $tarifa) {
            op_insertar_detalle_procedimiento($conn, $cotizacionId, $consultaId, $medicoId, $usuarioId, $tarifa);
        }

        op_recalcular_total_cotizacion($conn, $cotizacionId);

        return ['cotizacion_id' => $cotizacionId, 'numero_comprobante' => $numero, 'total' => round($total, 2)];
    }
}

if (!function_exists('op_listar_ordenes_por_consulta')) {
    function op_listar_ordenes_por_consulta(mysqli $conn, int $consultaId)
    {
        $stmt = $conn->prepare('SELECT * FROM ordenes_procedimientos WHERE consulta_id = ? ORDER BY fecha ASC, id ASC');
        if (!$stmt) {
            echo json_encode(['success' => true, 'ordenes' => []]);
            return;
        }
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $allIds = [];
        foreach ($rows as $r) {
            $ids = op_normalize_procedimientos_ids(json_decode((string)($r['procedimientos_json'] ?? '[]'), true) ?: []);
            foreach ($ids as $id) $allIds[] = $id;
        }
        $catalog = op_fetch_tarifas_procedimientos($conn, $allIds);

        foreach ($rows as &$r) {
            $ids = op_normalize_procedimientos_ids(json_decode((string)($r['procedimientos_json'] ?? '[]'), true) ?: []);
            $items = [];
            foreach ($ids as $id) {
                if (isset($catalog[$id])) {
                    $items[] = $catalog[$id];
                }
            }
            $r['procedimientos'] = $items;
        }
        unset($r);

        echo json_encode(['success' => true, 'ordenes' => $rows]);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$sessionUsuario = $_SESSION['usuario'] ?? null;
$rolSesion = strtolower(trim((string)($sessionUsuario['rol'] ?? '')));
$medicoSesionId = (int)($_SESSION['medico_id'] ?? ($sessionUsuario['medico_id'] ?? ($sessionUsuario['id'] ?? 0)));
$esSesionMedico = ($rolSesion === 'medico' && $medicoSesionId > 0);
$usuarioIdSesion = (int)($sessionUsuario['id'] ?? 0);

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

op_ensure_schema($conn);

if ($method === 'GET') {
    $consultaId = isset($_GET['consulta_id']) ? (int)$_GET['consulta_id'] : 0;
    if ($consultaId <= 0) {
        echo json_encode(['success' => true, 'ordenes' => []]);
        exit;
    }

    if ($esSesionMedico) {
        $stmtOwner = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if ($stmtOwner) {
            $stmtOwner->bind_param('i', $consultaId);
            $stmtOwner->execute();
            $owner = $stmtOwner->get_result()->fetch_assoc();
            $stmtOwner->close();
            if (!$owner || (int)($owner['medico_id'] ?? 0) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para ver esta consulta']);
                exit;
            }
        }
    }

    op_listar_ordenes_por_consulta($conn, $consultaId);
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $consultaId = isset($data['consulta_id']) ? (int)$data['consulta_id'] : 0;
    $procIds = op_normalize_procedimientos_ids($data['procedimientos'] ?? []);

    if ($consultaId <= 0 || empty($procIds)) {
        echo json_encode(['success' => false, 'error' => 'consulta_id y procedimientos son requeridos']);
        exit;
    }

    if ($esSesionMedico) {
        $stmtOwner = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if ($stmtOwner) {
            $stmtOwner->bind_param('i', $consultaId);
            $stmtOwner->execute();
            $owner = $stmtOwner->get_result()->fetch_assoc();
            $stmtOwner->close();
            if (!$owner || (int)($owner['medico_id'] ?? 0) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para editar esta consulta']);
                exit;
            }
        }
    }

    $stmtConsulta = $conn->prepare('SELECT paciente_id, medico_id FROM consultas WHERE id = ? LIMIT 1');
    if (!$stmtConsulta) {
        echo json_encode(['success' => false, 'error' => 'No se pudo resolver la consulta']);
        exit;
    }
    $stmtConsulta->bind_param('i', $consultaId);
    $stmtConsulta->execute();
    $rowConsulta = $stmtConsulta->get_result()->fetch_assoc();
    $stmtConsulta->close();

    $pacienteId = (int)($rowConsulta['paciente_id'] ?? 0);
    $medicoId = (int)($rowConsulta['medico_id'] ?? 0);
    if ($pacienteId <= 0) {
        echo json_encode(['success' => false, 'error' => 'Consulta sin paciente asociado']);
        exit;
    }

    $catalogIncoming = op_fetch_tarifas_procedimientos($conn, $procIds);
    if (empty($catalogIncoming)) {
        echo json_encode(['success' => false, 'error' => 'No se encontraron tarifas activas para los procedimientos seleccionados']);
        exit;
    }

    $conn->begin_transaction();
    try {
        $stmtFind = $conn->prepare("SELECT id, procedimientos_json, cotizacion_id
                                    FROM ordenes_procedimientos
                                    WHERE consulta_id = ? AND LOWER(COALESCE(estado, 'pendiente')) = 'pendiente'
                                    ORDER BY id DESC LIMIT 1 FOR UPDATE");
        if (!$stmtFind) {
            throw new Exception('No se pudo preparar busqueda de orden pendiente');
        }
        $stmtFind->bind_param('i', $consultaId);
        $stmtFind->execute();
        $ordenPendiente = $stmtFind->get_result()->fetch_assoc();
        $stmtFind->close();

        $ordenId = 0;
        $cotizacionId = 0;
        $modo = 'creada';
        $finalIds = $procIds;

        if ($ordenPendiente) {
            $ordenId = (int)($ordenPendiente['id'] ?? 0);
            $cotizacionId = (int)($ordenPendiente['cotizacion_id'] ?? 0);
            $prevIds = op_normalize_procedimientos_ids(json_decode((string)($ordenPendiente['procedimientos_json'] ?? '[]'), true) ?: []);
            $finalIds = array_values(array_unique(array_merge($prevIds, $procIds)));
            $jsonFinal = json_encode($finalIds);

            $stmtUp = $conn->prepare('UPDATE ordenes_procedimientos SET procedimientos_json = ?, paciente_id = CASE WHEN paciente_id IS NULL OR paciente_id = 0 THEN ? ELSE paciente_id END, usuario_id = ? WHERE id = ?');
            if (!$stmtUp) {
                throw new Exception('No se pudo preparar actualizacion de orden');
            }
            $stmtUp->bind_param('siii', $jsonFinal, $pacienteId, $usuarioIdSesion, $ordenId);
            if (!$stmtUp->execute()) {
                throw new Exception($stmtUp->error);
            }
            $stmtUp->close();
            $modo = 'consolidada';
        } else {
            $jsonFinal = json_encode($finalIds);
            $stmtIns = $conn->prepare('INSERT INTO ordenes_procedimientos (consulta_id, paciente_id, procedimientos_json, estado, usuario_id) VALUES (?, ?, ?, "pendiente", ?)');
            if (!$stmtIns) {
                throw new Exception('No se pudo preparar insercion de orden');
            }
            $stmtIns->bind_param('iisi', $consultaId, $pacienteId, $jsonFinal, $usuarioIdSesion);
            if (!$stmtIns->execute()) {
                throw new Exception($stmtIns->error);
            }
            $stmtIns->close();
            $ordenId = (int)$conn->insert_id;
        }

        $catalogFinal = op_fetch_tarifas_procedimientos($conn, $finalIds);
        if (empty($catalogFinal)) {
            throw new Exception('No hay tarifas activas para consolidar');
        }

        $cotizData = ['cotizacion_id' => null, 'numero_comprobante' => null, 'total' => 0.0];
        $cotEditable = false;

        if ($cotizacionId > 0) {
            $stmtCot = $conn->prepare('SELECT id, estado, numero_comprobante, total FROM cotizaciones WHERE id = ? LIMIT 1 FOR UPDATE');
            if ($stmtCot) {
                $stmtCot->bind_param('i', $cotizacionId);
                $stmtCot->execute();
                $rowCot = $stmtCot->get_result()->fetch_assoc();
                $stmtCot->close();
                if ($rowCot) {
                    $estadoCot = strtolower(trim((string)($rowCot['estado'] ?? 'pendiente')));
                    $cotEditable = in_array($estadoCot, ['pendiente', 'parcial'], true);
                }
            }
        }

        if ($cotizacionId > 0 && $cotEditable) {
            $hasConsulta = op_column_exists($conn, 'cotizaciones_detalle', 'consulta_id');
            if ($hasConsulta) {
                $stmtDel = $conn->prepare("DELETE FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id = ? AND LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos')");
                $stmtDel->bind_param('ii', $cotizacionId, $consultaId);
            } else {
                $stmtDel = $conn->prepare("DELETE FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) IN ('procedimiento','procedimientos')");
                $stmtDel->bind_param('i', $cotizacionId);
            }
            if ($stmtDel) {
                $stmtDel->execute();
                $stmtDel->close();
            }

            foreach ($catalogFinal as $tarifa) {
                if (!op_insertar_detalle_procedimiento($conn, $cotizacionId, $consultaId, $medicoId, $usuarioIdSesion, $tarifa)) {
                    throw new Exception('No se pudo insertar detalle de procedimiento');
                }
            }

            op_recalcular_total_cotizacion($conn, $cotizacionId);

            $stmtOut = $conn->prepare('SELECT numero_comprobante, total FROM cotizaciones WHERE id = ? LIMIT 1');
            if ($stmtOut) {
                $stmtOut->bind_param('i', $cotizacionId);
                $stmtOut->execute();
                $rowOut = $stmtOut->get_result()->fetch_assoc();
                $stmtOut->close();
                $cotizData = [
                    'cotizacion_id' => $cotizacionId,
                    'numero_comprobante' => $rowOut['numero_comprobante'] ?? null,
                    'total' => (float)($rowOut['total'] ?? 0),
                ];
            }
        } else {
            $tarifasList = array_values($catalogFinal);
            // Siempre usuario_id = 0 para cotizaciones de procedimientos HC.
            // Esto permite que api_cotizaciones resuelva el nombre del medico
            // via cotizaciones_detalle.consulta_id -> consultas.medico_id -> medicos
            // y lo muestre en la columna "Quien cotizo" y en el dashboard de produccion.
            $cotizData = op_crear_cotizacion_procedimientos($conn, $pacienteId, $consultaId, $medicoId, 0, $tarifasList);
            $newCot = (int)($cotizData['cotizacion_id'] ?? 0);
            if ($newCot > 0) {
                $stmtLink = $conn->prepare('UPDATE ordenes_procedimientos SET cotizacion_id = ? WHERE id = ?');
                if ($stmtLink) {
                    $stmtLink->bind_param('ii', $newCot, $ordenId);
                    $stmtLink->execute();
                    $stmtLink->close();
                }
            }
        }

        $conn->commit();
        echo json_encode([
            'success' => true,
            'modo' => $modo,
            'orden_id' => $ordenId,
            'cotizacion_id' => $cotizData['cotizacion_id'],
            'numero_comprobante' => $cotizData['numero_comprobante'],
            'total' => $cotizData['total'],
        ]);
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('api_ordenes_procedimientos.php error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['success' => false, 'error' => 'Metodo no soportado']);
