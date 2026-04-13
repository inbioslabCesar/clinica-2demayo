<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

function consultas_column_exists($conn, $table, $column) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function consultas_require_schema($conn) {
    $required = [
        'medicos' => ['tipo_profesional', 'abreviatura_profesional', 'colegio_sigla', 'nro_colegiatura'],
        'consultas' => ['es_reprogramada', 'reprogramada_en', 'hc_origen_id', 'origen_creacion'],
    ];

    $missing = [];
    foreach ($required as $table => $columns) {
        foreach ($columns as $column) {
            if (!consultas_column_exists($conn, $table, $column)) {
                $missing[] = $table . '.' . $column;
            }
        }
    }

    if (!empty($missing)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Esquema incompleto para api_consultas.php. Ejecuta la migracion de despliegue: sql/2026-04-05_consultas_recordatorios_schema_idempotente.sql',
            'missing_columns' => $missing,
        ]);
        exit;
    }
}

function consultas_actor_label($usuarioSesion) {
    if (!is_array($usuarioSesion)) {
        return 'sistema';
    }
    $rol = trim((string)($usuarioSesion['rol'] ?? 'usuario'));
    $nombre = trim((string)($usuarioSesion['nombre'] ?? ''));
    $apellido = trim((string)($usuarioSesion['apellido'] ?? ''));
    $display = trim($nombre . ' ' . $apellido);
    if ($display === '') {
        $display = trim((string)($usuarioSesion['usuario'] ?? ''));
    }
    if ($display === '') {
        $display = 'usuario';
    }
    return $display . ' (' . $rol . ')';
}

$method = $_SERVER['REQUEST_METHOD'];
$sessionUsuario = $_SESSION['usuario'] ?? null;
$rolSesion = $sessionUsuario['rol'] ?? null;
$medicoSesionId = intval($_SESSION['medico_id'] ?? ($sessionUsuario['medico_id'] ?? ($sessionUsuario['id'] ?? 0)));
$esSesionMedico = ($rolSesion === 'medico' && $medicoSesionId > 0);

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

consultas_require_schema($conn);

function columna_existe_local($conn, $tabla, $columna) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $tabla, $columna);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function resolver_consulta_id_por_cotizacion($conn, $cotizacionId) {
    $cotizacionId = intval($cotizacionId);
    if ($cotizacionId <= 0) {
        return 0;
    }

    if (columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        $sqlDetalle = 'SELECT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id IS NOT NULL AND consulta_id > 0 ORDER BY id ASC LIMIT 1';
        $stmtDetalle = $conn->prepare($sqlDetalle);
        if ($stmtDetalle) {
            $stmtDetalle->bind_param('i', $cotizacionId);
            $stmtDetalle->execute();
            $rowDetalle = $stmtDetalle->get_result()->fetch_assoc();
            $stmtDetalle->close();
            $consultaId = intval($rowDetalle['consulta_id'] ?? 0);
            if ($consultaId > 0) {
                return $consultaId;
            }
        }
    }

    $stmtCot = $conn->prepare('SELECT observaciones FROM cotizaciones WHERE id = ? LIMIT 1');
    $observaciones = '';
    if ($stmtCot) {
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $rowCot = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();
        $observaciones = trim((string)($rowCot['observaciones'] ?? ''));
        if ($observaciones !== '' && preg_match('/consulta\s*#\s*(\d+)/i', $observaciones, $m)) {
            $consultaId = intval($m[1] ?? 0);
            if ($consultaId > 0) {
                return $consultaId;
            }
        }
    }

    // Fallback para cotizaciones antiguas: intentar deducir por paciente + médico + fecha.
    $pacienteId = 0;
    $fechaCot = '';
    $stmtCotMeta = $conn->prepare('SELECT paciente_id, fecha FROM cotizaciones WHERE id = ? LIMIT 1');
    if ($stmtCotMeta) {
        $stmtCotMeta->bind_param('i', $cotizacionId);
        $stmtCotMeta->execute();
        $rowMeta = $stmtCotMeta->get_result()->fetch_assoc();
        $stmtCotMeta->close();
        $pacienteId = intval($rowMeta['paciente_id'] ?? 0);
        $fechaCot = trim((string)($rowMeta['fecha'] ?? ''));
    }

    if ($pacienteId > 0) {
        $medicoId = 0;
        if (columna_existe_local($conn, 'cotizaciones_detalle', 'medico_id')) {
            $stmtMed = $conn->prepare('SELECT medico_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND medico_id IS NOT NULL AND medico_id > 0 ORDER BY id ASC LIMIT 1');
            if ($stmtMed) {
                $stmtMed->bind_param('i', $cotizacionId);
                $stmtMed->execute();
                $rowMed = $stmtMed->get_result()->fetch_assoc();
                $stmtMed->close();
                $medicoId = intval($rowMed['medico_id'] ?? 0);
            }
        }

        $fechaSolo = '';
        if ($fechaCot !== '') {
            $fechaSolo = date('Y-m-d', strtotime($fechaCot));
        }

        if ($medicoId > 0 && $fechaSolo !== '') {
            $stmtGuess = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1');
            if ($stmtGuess) {
                $stmtGuess->bind_param('iis', $pacienteId, $medicoId, $fechaSolo);
                $stmtGuess->execute();
                $rowGuess = $stmtGuess->get_result()->fetch_assoc();
                $stmtGuess->close();
                $consultaId = intval($rowGuess['id'] ?? 0);
                if ($consultaId > 0) {
                    return $consultaId;
                }
            }
        }

        if ($medicoId > 0) {
            $stmtGuess = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? ORDER BY id DESC LIMIT 1');
            if ($stmtGuess) {
                $stmtGuess->bind_param('ii', $pacienteId, $medicoId);
                $stmtGuess->execute();
                $rowGuess = $stmtGuess->get_result()->fetch_assoc();
                $stmtGuess->close();
                $consultaId = intval($rowGuess['id'] ?? 0);
                if ($consultaId > 0) {
                    return $consultaId;
                }
            }
        }

        if ($fechaSolo !== '') {
            $stmtGuess = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1');
            if ($stmtGuess) {
                $stmtGuess->bind_param('is', $pacienteId, $fechaSolo);
                $stmtGuess->execute();
                $rowGuess = $stmtGuess->get_result()->fetch_assoc();
                $stmtGuess->close();
                $consultaId = intval($rowGuess['id'] ?? 0);
                if ($consultaId > 0) {
                    return $consultaId;
                }
            }
        }
    }

    return 0;
}

function resolver_cotizacion_id_por_consulta($conn, $consultaId) {
    $consultaId = intval($consultaId);
    if ($consultaId <= 0) {
        return 0;
    }

    if (columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        $sql = "SELECT cd.cotizacion_id
                FROM cotizaciones_detalle cd
                INNER JOIN cotizaciones c ON c.id = cd.cotizacion_id
            WHERE cd.consulta_id = ? AND LOWER(TRIM(cd.servicio_tipo)) = 'consulta' AND LOWER(TRIM(c.estado)) <> 'anulada'
            ORDER BY cd.id DESC LIMIT 1";
        $stmt = $conn->prepare($sql);
        if ($stmt) {
            $stmt->bind_param('i', $consultaId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $cotizacionId = intval($row['cotizacion_id'] ?? 0);
            if ($cotizacionId > 0) {
                return $cotizacionId;
            }
        }
    }

    $likeConsulta = '%consulta #' . $consultaId . '%';
    $stmt = $conn->prepare("SELECT id FROM cotizaciones WHERE LOWER(TRIM(estado)) <> 'anulada' AND LOWER(observaciones) LIKE ? ORDER BY id DESC LIMIT 1");
    if ($stmt) {
        $stmt->bind_param('s', $likeConsulta);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return intval($row['id'] ?? 0);
    }

    return 0;
}

function obtener_estado_cotizacion_por_id($conn, $cotizacionId) {
    $cotizacionId = intval($cotizacionId);
    if ($cotizacionId <= 0) {
        return '';
    }

    $stmt = $conn->prepare('SELECT estado FROM cotizaciones WHERE id = ? LIMIT 1');
    if (!$stmt) {
        return '';
    }

    $stmt->bind_param('i', $cotizacionId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return trim((string)($row['estado'] ?? ''));
}

function obtener_tarifa_consulta_para_medico($conn, $medicoId) {
    $medicoId = intval($medicoId);
    if ($medicoId <= 0) {
        return null;
    }

    $stmt = $conn->prepare('SELECT id, descripcion, precio_particular FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND medico_id = ? ORDER BY id DESC LIMIT 1');
    if ($stmt) {
        $stmt->bind_param('i', $medicoId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            return $row;
        }
    }

    $stmtFallback = $conn->prepare('SELECT id, descripcion, precio_particular FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND (medico_id IS NULL OR medico_id = 0) ORDER BY id DESC LIMIT 1');
    if ($stmtFallback) {
        $stmtFallback->execute();
        $rowFallback = $stmtFallback->get_result()->fetch_assoc();
        $stmtFallback->close();
        if ($rowFallback) {
            return $rowFallback;
        }
    }

    return null;
}

function sincronizar_cotizacion_por_consulta($conn, $consultaId, $medicoId, $cotizacionIdPreferida = 0) {
    $consultaId = intval($consultaId);
    $medicoId = intval($medicoId);
    $cotizacionId = intval($cotizacionIdPreferida);

    if ($consultaId <= 0 || $medicoId <= 0) {
        return ['ok' => false, 'reason' => 'datos_invalidos'];
    }

    if ($cotizacionId <= 0) {
        $cotizacionId = resolver_cotizacion_id_por_consulta($conn, $consultaId);
    }
    if ($cotizacionId <= 0) {
        return ['ok' => false, 'reason' => 'cotizacion_no_encontrada'];
    }

    $tarifa = obtener_tarifa_consulta_para_medico($conn, $medicoId);
    if (!$tarifa) {
        return ['ok' => false, 'reason' => 'tarifa_no_encontrada'];
    }

    $precio = round((float)($tarifa['precio_particular'] ?? 0), 2);
    if ($precio <= 0) {
        return ['ok' => false, 'reason' => 'tarifa_precio_invalido'];
    }

    $detalleId = 0;
    if (columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        $stmtDet = $conn->prepare("SELECT id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta' ORDER BY id DESC LIMIT 1");
        if ($stmtDet) {
            $stmtDet->bind_param('ii', $cotizacionId, $consultaId);
            $stmtDet->execute();
            $rowDet = $stmtDet->get_result()->fetch_assoc();
            $stmtDet->close();
            $detalleId = intval($rowDet['id'] ?? 0);
        }
    }

    if ($detalleId <= 0) {
        $stmtDet = $conn->prepare("SELECT id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta' ORDER BY id DESC LIMIT 1");
        if ($stmtDet) {
            $stmtDet->bind_param('i', $cotizacionId);
            $stmtDet->execute();
            $rowDet = $stmtDet->get_result()->fetch_assoc();
            $stmtDet->close();
            $detalleId = intval($rowDet['id'] ?? 0);
        }
    }

    if ($detalleId <= 0) {
        return ['ok' => false, 'reason' => 'detalle_consulta_no_encontrado'];
    }

    $descripcion = trim((string)($tarifa['descripcion'] ?? 'Consulta médica'));
    if ($descripcion === '') {
        $descripcion = 'Consulta médica';
    }

    $tarifaId = intval($tarifa['id'] ?? 0);
    $sets = [
        'servicio_id = ?',
        'descripcion = ?',
        'precio_unitario = ?',
        'subtotal = ?',
    ];
    $types = 'isdd';
    $params = [$tarifaId, $descripcion, $precio, $precio];

    if (columna_existe_local($conn, 'cotizaciones_detalle', 'medico_id')) {
        $sets[] = 'medico_id = ?';
        $types .= 'i';
        $params[] = $medicoId;
    }

    if (columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        $sets[] = 'consulta_id = ?';
        $types .= 'i';
        $params[] = $consultaId;
    }

    $sqlUpdDet = 'UPDATE cotizaciones_detalle SET ' . implode(', ', $sets) . ' WHERE id = ?';
    $types .= 'i';
    $params[] = $detalleId;

    $stmtUpdDet = $conn->prepare($sqlUpdDet);
    if (!$stmtUpdDet) {
        return ['ok' => false, 'reason' => 'no_prepara_update_detalle'];
    }
    $stmtUpdDet->bind_param($types, ...$params);
    $okDet = $stmtUpdDet->execute();
    $stmtUpdDet->close();
    if (!$okDet) {
        return ['ok' => false, 'reason' => 'error_update_detalle'];
    }

    $whereItemsActivos = '';
    if (columna_existe_local($conn, 'cotizaciones_detalle', 'estado_item')) {
        $whereItemsActivos = " AND estado_item <> 'eliminado'";
    }
    $sqlTotal = 'SELECT COALESCE(SUM(subtotal), 0) AS total FROM cotizaciones_detalle WHERE cotizacion_id = ?' . $whereItemsActivos;
    $stmtTotal = $conn->prepare($sqlTotal);
    if (!$stmtTotal) {
        return ['ok' => false, 'reason' => 'no_prepara_total'];
    }
    $stmtTotal->bind_param('i', $cotizacionId);
    $stmtTotal->execute();
    $rowTotal = $stmtTotal->get_result()->fetch_assoc();
    $stmtTotal->close();
    $nuevoTotal = round((float)($rowTotal['total'] ?? 0), 2);

    $okCot = false;
    $nuevoSaldo = null;
    $nuevoEstado = null;

    $hasTotalPagado = columna_existe_local($conn, 'cotizaciones', 'total_pagado');
    $hasSaldo = columna_existe_local($conn, 'cotizaciones', 'saldo_pendiente');
    $hasEstado = columna_existe_local($conn, 'cotizaciones', 'estado');

    if ($hasTotalPagado && $hasSaldo) {
        $stmtPag = $conn->prepare('SELECT COALESCE(total_pagado, 0) AS total_pagado, COALESCE(estado, "pendiente") AS estado FROM cotizaciones WHERE id = ? LIMIT 1');
        if (!$stmtPag) {
            return ['ok' => false, 'reason' => 'no_prepara_select_pagado'];
        }
        $stmtPag->bind_param('i', $cotizacionId);
        $stmtPag->execute();
        $rowPag = $stmtPag->get_result()->fetch_assoc();
        $stmtPag->close();

        $pagado = round((float)($rowPag['total_pagado'] ?? 0), 2);
        $nuevoSaldo = max(0, round($nuevoTotal - $pagado, 2));
        $nuevoEstado = $nuevoSaldo <= 0 ? 'pagado' : ($pagado > 0 ? 'parcial' : 'pendiente');

        if ($hasEstado) {
            $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ? WHERE id = ?');
            if (!$stmtUpdCot) {
                return ['ok' => false, 'reason' => 'no_prepara_update_cotizacion'];
            }
            $stmtUpdCot->bind_param('ddsi', $nuevoTotal, $nuevoSaldo, $nuevoEstado, $cotizacionId);
        } else {
            $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ? WHERE id = ?');
            if (!$stmtUpdCot) {
                return ['ok' => false, 'reason' => 'no_prepara_update_cotizacion'];
            }
            $stmtUpdCot->bind_param('ddi', $nuevoTotal, $nuevoSaldo, $cotizacionId);
        }
        $okCot = $stmtUpdCot->execute();
        $stmtUpdCot->close();
    } else {
        $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ? WHERE id = ?');
        if (!$stmtUpdCot) {
            return ['ok' => false, 'reason' => 'no_prepara_update_cotizacion'];
        }
        $stmtUpdCot->bind_param('di', $nuevoTotal, $cotizacionId);
        $okCot = $stmtUpdCot->execute();
        $stmtUpdCot->close();
    }

    if (!$okCot) {
        return ['ok' => false, 'reason' => 'error_update_cotizacion'];
    }

    return [
        'ok' => true,
        'cotizacion_id' => $cotizacionId,
        'detalle_id' => $detalleId,
        'precio_consulta' => $precio,
        'total_cotizacion' => $nuevoTotal,
        'saldo_pendiente' => $nuevoSaldo,
        'estado_cotizacion' => $nuevoEstado,
    ];
}

function sincronizar_hc_proxima_cita_por_consulta($conn, $consultaId, $medicoId, $fecha, $hora, $tipoConsulta = null, $actor = 'sistema') {
    $consultaId = intval($consultaId);
    $medicoId = intval($medicoId);
    $fecha = trim((string)$fecha);
    $hora = trim((string)$hora);
    $tipoConsulta = trim((string)($tipoConsulta ?? 'programada'));

    if ($consultaId <= 0 || $medicoId <= 0 || $fecha === '' || $hora === '') {
        return ['ok' => false, 'reason' => 'datos_invalidos'];
    }

    $patronConsultaId = '%"consulta_id":' . $consultaId . '%';
    $stmt = $conn->prepare('SELECT id, datos FROM historia_clinica WHERE datos LIKE ?');
    if (!$stmt) {
        return ['ok' => false, 'reason' => 'prepare_error'];
    }
    $stmt->bind_param('s', $patronConsultaId);
    $stmt->execute();
    $res = $stmt->get_result();

    $updated = 0;
    while ($row = $res->fetch_assoc()) {
        $hcId = intval($row['id'] ?? 0);
        $datos = json_decode((string)($row['datos'] ?? ''), true);
        if (!is_array($datos) || !isset($datos['proxima_cita']) || !is_array($datos['proxima_cita'])) {
            continue;
        }

        $proxima = $datos['proxima_cita'];
        if (intval($proxima['consulta_id'] ?? 0) !== $consultaId) {
            continue;
        }

        $fechaAnterior = trim((string)($proxima['fecha'] ?? ''));
        $horaAnterior = trim((string)($proxima['hora'] ?? ''));
        $historial = [];
        if (isset($proxima['historial']) && is_array($proxima['historial'])) {
            $historial = $proxima['historial'];
        }
        $historial[] = [
            'accion' => 'reprogramada_desde_agenda',
            'fecha_evento' => date('Y-m-d H:i:s'),
            'actor' => $actor,
            'consulta_id' => $consultaId,
            'antes' => [
                'fecha' => $fechaAnterior,
                'hora' => $horaAnterior,
            ],
            'despues' => [
                'fecha' => $fecha,
                'hora' => $hora,
            ],
        ];
        if (count($historial) > 20) {
            $historial = array_slice($historial, -20);
        }

        $proxima['medico_id'] = $medicoId;
        $proxima['fecha'] = $fecha;
        $proxima['hora'] = $hora;
        $proxima['tipo_consulta'] = $tipoConsulta !== '' ? $tipoConsulta : 'programada';
        $proxima['actualizada_desde_agenda_en'] = date('Y-m-d H:i:s');
        $proxima['programar'] = true;
        $proxima['historial'] = $historial;

        $datos['proxima_cita'] = $proxima;
        $jsonActualizado = json_encode($datos, JSON_UNESCAPED_UNICODE);
        if (!is_string($jsonActualizado) || $jsonActualizado === '') {
            continue;
        }

        $stmtUpd = $conn->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE id = ? LIMIT 1');
        if (!$stmtUpd) {
            continue;
        }
        $stmtUpd->bind_param('si', $jsonActualizado, $hcId);
        $okUpd = $stmtUpd->execute();
        $stmtUpd->close();
        if ($okUpd) {
            $updated++;
        }
    }
    $stmt->close();

    return [
        'ok' => true,
        'updated_hc' => $updated,
    ];
}

switch ($method) {
    case 'GET':
        // Listar consultas (por médico, paciente o todas)
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;
        $cotizacion_id = isset($_GET['cotizacion_id']) ? intval($_GET['cotizacion_id']) : null;
        if ((!$consulta_id || $consulta_id <= 0) && $cotizacion_id > 0) {
            $consulta_id = resolver_consulta_id_por_cotizacion($conn, $cotizacion_id);
        }
        $medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
        $paciente_id = isset($_GET['paciente_id']) ? intval($_GET['paciente_id']) : null;
        $page = isset($_GET['page']) ? intval($_GET['page']) : 0;
        $per_page = isset($_GET['per_page']) ? intval($_GET['per_page']) : 0;
        $search = isset($_GET['search']) ? trim($_GET['search']) : '';
        $fecha_desde = isset($_GET['fecha_desde']) ? trim($_GET['fecha_desde']) : '';
        $fecha_hasta = isset($_GET['fecha_hasta']) ? trim($_GET['fecha_hasta']) : '';
        $usar_paginacion = ($page > 0 && $per_page > 0);
        if ($usar_paginacion && $per_page > 100) {
            $per_page = 100;
        }

        if ($esSesionMedico) {
            if ($medico_id && $medico_id !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para ver consultas de otro médico']);
                exit;
            }
            $medico_id = $medicoSesionId;
            $paciente_id = null;
        }

        $from = ' FROM consultas LEFT JOIN pacientes ON consultas.paciente_id = pacientes.id LEFT JOIN medicos ON consultas.medico_id = medicos.id';
        $where = [];
        $params = [];
        $types = '';

        if ($consulta_id) {
            $where[] = 'consultas.id = ?';
            $params[] = $consulta_id;
            $types .= 'i';
        }

        if ($medico_id) {
            $where[] = 'consultas.medico_id = ?';
            $params[] = $medico_id;
            $types .= 'i';
        } elseif ($paciente_id) {
            $where[] = 'consultas.paciente_id = ?';
            $params[] = $paciente_id;
            $types .= 'i';
        }

        if ($search !== '') {
            $where[] = '(pacientes.nombre LIKE ? OR pacientes.apellido LIKE ? OR pacientes.historia_clinica LIKE ? OR pacientes.dni LIKE ?)';
            $searchLike = '%' . $search . '%';
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $types .= 'ssss';
        }

        if ($fecha_desde !== '') {
            $where[] = 'consultas.fecha >= ?';
            $params[] = $fecha_desde;
            $types .= 's';
        }

        if ($fecha_hasta !== '') {
            $where[] = 'consultas.fecha <= ?';
            $params[] = $fecha_hasta;
            $types .= 's';
        }

        $whereSql = count($where) ? (' WHERE ' . implode(' AND ', $where)) : '';

        $statsSql = 'SELECT COUNT(*) AS total, '
            . 'SUM(CASE WHEN LOWER(TRIM(consultas.estado)) = "pendiente" THEN 1 ELSE 0 END) AS pendientes, '
            . 'SUM(CASE WHEN LOWER(TRIM(consultas.clasificacion)) = "emergencia" THEN 1 ELSE 0 END) AS emergencias'
            . $from
            . $whereSql;

        $statsStmt = $conn->prepare($statsSql);
        if ($types) {
            $statsStmt->bind_param($types, ...$params);
        }
        $statsStmt->execute();
        $statsRes = $statsStmt->get_result();
        $statsRow = $statsRes->fetch_assoc() ?: [];
        $statsStmt->close();

        $sql = 'SELECT consultas.*, pacientes.nombre AS paciente_nombre, pacientes.apellido AS paciente_apellido, pacientes.historia_clinica, pacientes.dni, medicos.nombre AS medico_nombre, medicos.apellido AS medico_apellido, medicos.especialidad AS medico_especialidad, medicos.cmp AS medico_cmp, medicos.rne AS medico_rne, medicos.firma AS medico_firma, medicos.tipo_profesional AS medico_tipo_profesional, medicos.abreviatura_profesional AS medico_abreviatura_profesional, medicos.colegio_sigla AS medico_colegio_sigla, medicos.nro_colegiatura AS medico_nro_colegiatura,'
            . ' (SELECT cd.cotizacion_id FROM cotizaciones_detalle cd INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id WHERE cd.consulta_id = consultas.id AND LOWER(TRIM(ct.estado)) NOT IN ("anulado", "anulada") ORDER BY cd.cotizacion_id DESC LIMIT 1) AS cotizacion_id,'
            . ' (SELECT ct.estado FROM cotizaciones_detalle cd INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id WHERE cd.consulta_id = consultas.id AND LOWER(TRIM(ct.estado)) NOT IN ("anulado", "anulada") ORDER BY cd.cotizacion_id DESC LIMIT 1) AS cotizacion_estado'
            . $from
            . $whereSql
            . ' ORDER BY consultas.fecha DESC, consultas.hora DESC';

        if ($usar_paginacion) {
            $offset = ($page - 1) * $per_page;
            $sql .= ' LIMIT ? OFFSET ?';
            $paramsQuery = $params;
            $paramsQuery[] = $per_page;
            $paramsQuery[] = $offset;
            $typesQuery = $types . 'ii';
        } else {
            $paramsQuery = $params;
            $typesQuery = $types;
        }

        $stmt = $conn->prepare($sql);
        if ($typesQuery) $stmt->bind_param($typesQuery, ...$paramsQuery);
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }

        foreach ($rows as &$row) {
            $consultaIdRow = intval($row['id'] ?? 0);
            $cotId = intval($row['cotizacion_id'] ?? 0);
            $cotEstado = trim((string)($row['cotizacion_estado'] ?? ''));

            if ($consultaIdRow > 0 && $cotId <= 0) {
                $cotId = resolver_cotizacion_id_por_consulta($conn, $consultaIdRow);
            }

            if ($cotId > 0 && $cotEstado === '') {
                $cotEstado = obtener_estado_cotizacion_por_id($conn, $cotId);
            }

            $row['cotizacion_id'] = $cotId > 0 ? $cotId : null;
            $row['cotizacion_estado'] = $cotEstado !== '' ? $cotEstado : null;
        }
        unset($row);

        $totalFiltrado = intval($statsRow['total'] ?? count($rows));
        $respuesta = [
            'success' => true,
            'consultas' => $rows,
            'stats' => [
                'total' => $totalFiltrado,
                'pendientes' => intval($statsRow['pendientes'] ?? 0),
                'emergencias' => intval($statsRow['emergencias'] ?? 0),
            ],
        ];

        if ($usar_paginacion) {
            $respuesta['pagination'] = [
                'page' => $page,
                'per_page' => $per_page,
                'total' => $totalFiltrado,
                'total_pages' => max(1, (int)ceil($totalFiltrado / $per_page)),
            ];
        }

        echo json_encode($respuesta);
        $stmt->close();
        break;
    case 'POST':
        // Agendar nueva consulta
        $data = json_decode(file_get_contents('php://input'), true);
        $paciente_id = $data['paciente_id'] ?? null;
        $medico_id = $data['medico_id'] ?? null;
        $fecha = $data['fecha'] ?? null;
        $hora = $data['hora'] ?? null;
        if (!$paciente_id || !$medico_id || !$fecha || !$hora) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }
        
        // Normalizar formato de hora (agregar segundos si no los tiene)
        if (strlen($hora) == 5 && substr_count($hora, ':') == 1) {
            $hora = $hora . ':00';
        }
        // Solo validar caja abierta para consultas espontáneas
        $tipo_consulta = $data['tipo_consulta'] ?? 'programada';
        if ($tipo_consulta === 'espontanea') {
            $usuario_id = $_SESSION['usuario']['id'] ?? null;
            // Normalizar fecha a Y-m-d
            $fecha_consulta = date('Y-m-d', strtotime($fecha));
            $stmtCaja = $conn->prepare('SELECT id FROM cajas WHERE usuario_id = ? AND DATE(fecha) = ? AND TRIM(LOWER(estado)) = "abierta" LIMIT 1');
            $stmtCaja->bind_param('is', $usuario_id, $fecha_consulta);
            $stmtCaja->execute();
            $resCaja = $stmtCaja->get_result();
            $cajaAbierta = $resCaja->fetch_assoc();
            $stmtCaja->close();
            if (!$cajaAbierta) {
                echo json_encode([
                    'success' => false,
                    'error' => 'No hay caja abierta para el usuario en la fecha seleccionada. Abra una caja antes de agendar la consulta espontánea.',
                    'debug' => [
                        'usuario_id' => $usuario_id,
                        'fecha_consulta' => $fecha_consulta
                    ]
                ]);
                exit;
            }
        }
        $tipo_consulta = $data['tipo_consulta'] ?? 'programada';
        $origen_creacion = trim((string)($data['origen_creacion'] ?? 'agendada'));
        if (!in_array($origen_creacion, ['agendada', 'cotizador', 'hc_proxima'], true)) {
            $origen_creacion = 'agendada';
        }

        // === VALIDACIÓN ATÓMICA DE CUPOS / CONFLICTOS ===
        // Para programada: valida bloque y cupos.
        // Para espontánea: permite cualquier hora, pero mantiene validación de conflicto exacto.
        $es_espontanea = ($tipo_consulta === 'espontanea');
        $conn->begin_transaction();
        try {
            $totalSlots = null;
            $agendadas = null;

            if (!$es_espontanea) {
                // 1. Bloquear el bloque de disponibilidad para este médico/fecha/hora
                //    FOR UPDATE previene lecturas concurrentes del mismo bloque.
                $stmtBloque = $conn->prepare(
                    'SELECT id, hora_inicio, hora_fin FROM disponibilidad_medicos
                     WHERE medico_id = ? AND fecha = ?
                     AND hora_inicio <= ? AND hora_fin > ?
                     LIMIT 1 FOR UPDATE'
                );
                $stmtBloque->bind_param('isss', $medico_id, $fecha, $hora, $hora);
                $stmtBloque->execute();
                $bloque = $stmtBloque->get_result()->fetch_assoc();
                $stmtBloque->close();

                if (!$bloque) {
                    $conn->rollback();
                    echo json_encode([
                        'success' => false,
                        'error' => 'No hay disponibilidad registrada para este médico en el horario seleccionado',
                    ]);
                    exit;
                }

                // 2. Calcular capacidad total del bloque (intervalos de 30 min)
                [$hIni, $mIni] = array_map('intval', explode(':', $bloque['hora_inicio']));
                [$hFin, $mFin] = array_map('intval', explode(':', $bloque['hora_fin']));
                $totalSlots = 0;
                $h = $hIni; $m = $mIni;
                while ($h < $hFin || ($h === $hFin && $m < $mFin)) {
                    $totalSlots++;
                    $m += 30;
                    if ($m >= 60) { $h++; $m = 0; }
                }

                // 3. Contar consultas activas en el bloque (dentro del rango hora_inicio..hora_fin)
                $stmtCount = $conn->prepare(
                    'SELECT COUNT(*) AS cnt FROM consultas
                     WHERE medico_id = ? AND fecha = ?
                     AND hora >= ? AND hora < ?
                     AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "completada")'
                );
                $stmtCount->bind_param('isss', $medico_id, $fecha, $bloque['hora_inicio'], $bloque['hora_fin']);
                $stmtCount->execute();
                $cntRow = $stmtCount->get_result()->fetch_assoc();
                $stmtCount->close();
                $agendadas = (int)($cntRow['cnt'] ?? 0);

                if ($agendadas >= $totalSlots) {
                    $conn->rollback();
                    echo json_encode([
                        'success' => false,
                        'error' => 'Cupos agotados para este horario. No hay cupos disponibles.',
                        'cupos_disponibles' => 0,
                    ]);
                    exit;
                }
            }

            // 4. Verificar conflicto exacto de hora (mismo médico, misma fecha, misma hora)
            $stmtConf = $conn->prepare(
                'SELECT id, estado FROM consultas
                 WHERE medico_id = ? AND fecha = ? AND hora = ?
                 AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "completada")'
            );
            $stmtConf->bind_param('iss', $medico_id, $fecha, $hora);
            $stmtConf->execute();
            $conflicto = $stmtConf->get_result()->fetch_assoc();
            $stmtConf->close();

            if ($conflicto) {
                $conn->rollback();
                echo json_encode([
                    'success' => false,
                    'error' => 'El médico ya tiene una consulta pendiente en ese horario',
                    'detalle' => "Consulta ID {$conflicto['id']} con estado '{$conflicto['estado']}'",
                ]);
                exit;
            }

            // 5. Insertar la consulta dentro de la transacción
            $stmtIns = $conn->prepare(
                'INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, origen_creacion)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $stmtIns->bind_param('iissss', $paciente_id, $medico_id, $fecha, $hora, $tipo_consulta, $origen_creacion);
            $ok = $stmtIns->execute();
            $nuevaId = $ok ? $stmtIns->insert_id : null;
            $stmtIns->close();

            if (!$ok) {
                $conn->rollback();
                echo json_encode(['success' => false, 'error' => 'No se pudo registrar la consulta']);
                exit;
            }

            $conn->commit();
            $responseOk = [
                'success'          => true,
                'id'               => $nuevaId,
            ];
            if (!$es_espontanea && $totalSlots !== null && $agendadas !== null) {
                $responseOk['cupos_restantes'] = $totalSlots - $agendadas - 1;
            }
            echo json_encode($responseOk);

        } catch (Exception $e) {
            $conn->rollback();
            echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
        }
        break;
    case 'PUT':
        // Actualizar estado o reprogramar consulta existente
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $cotizacion_id = isset($data['cotizacion_id']) ? intval($data['cotizacion_id']) : 0;
        if ((!$id || intval($id) <= 0) && $cotizacion_id > 0) {
            $id = resolver_consulta_id_por_cotizacion($conn, $cotizacion_id);
        }
        $estado = array_key_exists('estado', $data) ? trim((string)$data['estado']) : null;
        $medico_id = isset($data['medico_id']) ? intval($data['medico_id']) : null;
        $fecha = isset($data['fecha']) ? trim((string)$data['fecha']) : null;
        $hora = isset($data['hora']) ? trim((string)$data['hora']) : null;
        $tipo_consulta = isset($data['tipo_consulta']) ? trim((string)$data['tipo_consulta']) : null;

        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        $actualizarEstado = ($estado !== null && $estado !== '');
        $camposReprogramacion = [
            'medico_id' => $medico_id,
            'fecha' => $fecha,
            'hora' => $hora,
        ];
        $camposReprogramacionPresentes = 0;
        foreach ($camposReprogramacion as $valor) {
            if ($valor !== null && $valor !== '') {
                $camposReprogramacionPresentes++;
            }
        }
        $actualizarAgenda = ($camposReprogramacionPresentes > 0);

        if (!$actualizarEstado && !$actualizarAgenda) {
            echo json_encode(['success' => false, 'error' => 'Debe enviar estado o datos de reprogramación']);
            exit;
        }

        if ($actualizarAgenda && $camposReprogramacionPresentes < 3) {
            echo json_encode(['success' => false, 'error' => 'Para reprogramar, envíe medico_id, fecha y hora']);
            exit;
        }

        if ($actualizarAgenda && $medico_id <= 0) {
            echo json_encode(['success' => false, 'error' => 'Médico inválido']);
            exit;
        }

        if ($actualizarAgenda && strlen($hora) == 5 && substr_count($hora, ':') == 1) {
            $hora = $hora . ':00';
        }

        $stmtOwner = $conn->prepare('SELECT medico_id, fecha, hora FROM consultas WHERE id = ? LIMIT 1');
        $stmtOwner->bind_param('i', $id);
        $stmtOwner->execute();
        $ownerRow = $stmtOwner->get_result()->fetch_assoc();
        $stmtOwner->close();
        if (!$ownerRow) {
            echo json_encode(['success' => false, 'error' => 'Consulta no encontrada']);
            exit;
        }

        if ($esSesionMedico) {
            if (!$ownerRow || intval($ownerRow['medico_id']) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para actualizar esta consulta']);
                exit;
            }
        }

        $esReprogramacion = false;
        if ($actualizarAgenda) {
            $fechaActual = trim((string)($ownerRow['fecha'] ?? ''));
            $horaActual = trim((string)($ownerRow['hora'] ?? ''));
            $horaActualNorm = $horaActual !== '' ? substr($horaActual, 0, 5) : '';
            $horaNuevaNorm = $hora !== null ? substr((string)$hora, 0, 5) : '';
            $esReprogramacion = ($fechaActual !== (string)$fecha) || ($horaActualNorm !== $horaNuevaNorm) || (intval($ownerRow['medico_id'] ?? 0) !== intval($medico_id));

            $stmtConflicto = $conn->prepare('SELECT id, estado FROM consultas WHERE medico_id=? AND fecha=? AND hora=? AND id<>? AND estado NOT IN ("cancelada", "completada") LIMIT 1');
            $stmtConflicto->bind_param('issi', $medico_id, $fecha, $hora, $id);
            $stmtConflicto->execute();
            $conflicto = $stmtConflicto->get_result()->fetch_assoc();
            $stmtConflicto->close();

            if ($conflicto) {
                echo json_encode([
                    'success' => false,
                    'error' => 'El médico ya tiene una consulta pendiente en ese horario',
                    'detalle' => "Consulta ID {$conflicto['id']} con estado '{$conflicto['estado']}'",
                ]);
                exit;
            }
        }

        if ($actualizarAgenda && $actualizarEstado) {
            $stmt = $conn->prepare('UPDATE consultas SET medico_id=?, fecha=?, hora=?, tipo_consulta=COALESCE(?, tipo_consulta), estado=? WHERE id=?');
            $stmt->bind_param('issssi', $medico_id, $fecha, $hora, $tipo_consulta, $estado, $id);
        } elseif ($actualizarAgenda) {
            $stmt = $conn->prepare('UPDATE consultas SET medico_id=?, fecha=?, hora=?, tipo_consulta=COALESCE(?, tipo_consulta) WHERE id=?');
            $stmt->bind_param('isssi', $medico_id, $fecha, $hora, $tipo_consulta, $id);
        } else {
            $stmt = $conn->prepare('UPDATE consultas SET estado=? WHERE id=?');
            $stmt->bind_param('si', $estado, $id);
        }

        $ok = $stmt->execute();

        if ($ok && $actualizarAgenda && $esReprogramacion && columna_existe_local($conn, 'consultas', 'es_reprogramada')) {
            if (columna_existe_local($conn, 'consultas', 'reprogramada_en')) {
                $stmtMarca = $conn->prepare('UPDATE consultas SET es_reprogramada = 1, reprogramada_en = NOW() WHERE id = ? LIMIT 1');
            } else {
                $stmtMarca = $conn->prepare('UPDATE consultas SET es_reprogramada = 1 WHERE id = ? LIMIT 1');
            }
            if ($stmtMarca) {
                $stmtMarca->bind_param('i', $id);
                $stmtMarca->execute();
                $stmtMarca->close();
            }
        }

        $syncCotizacion = null;
        $syncHistoriaClinicaProxima = null;
        $actorAgenda = consultas_actor_label($sessionUsuario);
        if ($ok && $actualizarAgenda) {
            try {
                $syncCotizacion = sincronizar_cotizacion_por_consulta($conn, intval($id), intval($medico_id), intval($cotizacion_id));
            } catch (Throwable $e) {
                $syncCotizacion = [
                    'ok' => false,
                    'reason' => 'exception',
                    'message' => $e->getMessage(),
                ];
            }

            try {
                $syncHistoriaClinicaProxima = sincronizar_hc_proxima_cita_por_consulta(
                    $conn,
                    intval($id),
                    intval($medico_id),
                    (string)$fecha,
                    (string)$hora,
                    $tipo_consulta,
                    $actorAgenda
                );
            } catch (Throwable $e) {
                $syncHistoriaClinicaProxima = [
                    'ok' => false,
                    'reason' => 'exception',
                    'message' => $e->getMessage(),
                ];
            }
        }

        echo json_encode([
            'success' => $ok,
            'cotizacion_sync' => $syncCotizacion,
            'historia_clinica_proxima_sync' => $syncHistoriaClinicaProxima,
        ]);
        $stmt->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
