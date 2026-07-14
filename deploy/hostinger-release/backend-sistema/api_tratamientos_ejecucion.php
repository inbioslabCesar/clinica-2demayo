<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
$tphPath = __DIR__ . '/tratamientos_programacion_helper.php';
if (!is_file($tphPath)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Falta archivo requerido: tratamientos_programacion_helper.php',
        'detail' => 'Despliegue incompleto en servidor. Subir tratamientos_programacion_helper.php al directorio /sistema/.',
    ]);
    exit;
}
require_once $tphPath;

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

function tec_tabla_existe($conn, $table) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return !empty($row);
}

function tec_ensure_multidia_tables($conn) {
    tph_ensure_multidia_tables($conn);
}

function tec_recalcular_estado_dia($conn, $ejecucionId) {
    $ejecucionId = (int)$ejecucionId;
    if ($ejecucionId <= 0) return;

    $stmt = $conn->prepare('SELECT dosis_planificadas, dosis_administradas, estado_dia FROM tratamientos_ejecucion_diaria WHERE id = ? LIMIT 1');
    if (!$stmt) return;
    $stmt->bind_param('i', $ejecucionId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return;

    $plan = max(0, (int)($row['dosis_planificadas'] ?? 0));
    $admin = max(0, (int)($row['dosis_administradas'] ?? 0));
    $estadoActual = trim((string)($row['estado_dia'] ?? 'pendiente'));

    if ($estadoActual === 'omitido') {
        return;
    }

    $nuevo = 'pendiente';
    if ($plan > 0 && $admin >= $plan) {
        $nuevo = 'completo';
    } elseif ($admin > 0) {
        $nuevo = 'parcial';
    }

    $stmtUpd = $conn->prepare('UPDATE tratamientos_ejecucion_diaria SET estado_dia = ? WHERE id = ? LIMIT 1');
    if (!$stmtUpd) return;
    $stmtUpd->bind_param('si', $nuevo, $ejecucionId);
    $stmtUpd->execute();
    $stmtUpd->close();
}

function tec_parse_duracion_dias($duracionTexto) {
    return tph_parse_duracion_dias($duracionTexto);
}

function tec_parse_dosis_por_dia($frecuenciaTexto) {
    $norm = tph_normalize_prescripcion_item(['frecuencia' => $frecuenciaTexto], 0);
    return (int)($norm['dosis_dia'] ?? 1);
}

function tec_seed_plan_from_snapshot($conn, $tratamientoId) {
    tph_seed_plan_from_snapshot($conn, $tratamientoId);
}

function tec_recalcular_estado_item($conn, $tratamientoItemId) {
    $tratamientoItemId = (int)$tratamientoItemId;
    if ($tratamientoItemId <= 0) return;

    $stmt = $conn->prepare(
        'SELECT i.iniciado_en, i.completado_en,
                COUNT(d.id) AS total_dias,
                SUM(CASE WHEN d.estado_dia IN ("completo", "omitido") THEN 1 ELSE 0 END) AS dias_cerrados
         FROM tratamientos_enfermeria_items i
         LEFT JOIN tratamientos_ejecucion_diaria d ON d.tratamiento_item_id = i.id
         WHERE i.id = ?
         GROUP BY i.id'
    );
    if (!$stmt) return;
    $stmt->bind_param('i', $tratamientoItemId);
    $stmt->execute();
    $agg = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$agg) return;

    $iniciadoEn = trim((string)($agg['iniciado_en'] ?? ''));
    if ($iniciadoEn === '') {
        return;
    }

    $totalDias = (int)($agg['total_dias'] ?? 0);
    $diasCerrados = (int)($agg['dias_cerrados'] ?? 0);
    $nuevoCompletadoEn = ($totalDias > 0 && $diasCerrados >= $totalDias) ? date('Y-m-d H:i:s') : null;

    $stmtUpd = $conn->prepare('UPDATE tratamientos_enfermeria_items SET completado_en = ? WHERE id = ? LIMIT 1');
    if (!$stmtUpd) return;
    $stmtUpd->bind_param('si', $nuevoCompletadoEn, $tratamientoItemId);
    $stmtUpd->execute();
    $stmtUpd->close();
}

function tec_recalcular_estado_cabecera($conn, $tratamientoId) {
    $tratamientoId = (int)$tratamientoId;
    if ($tratamientoId <= 0) return;

    $stmtAgg = $conn->prepare(
        'SELECT
            COUNT(*) AS total_items,
            SUM(CASE WHEN iniciado_en IS NOT NULL THEN 1 ELSE 0 END) AS iniciados,
            SUM(CASE WHEN completado_en IS NOT NULL THEN 1 ELSE 0 END) AS completados,
            MIN(iniciado_en) AS primer_inicio
         FROM tratamientos_enfermeria_items
         WHERE tratamiento_id = ?'
    );
    if (!$stmtAgg) return;
    $stmtAgg->bind_param('i', $tratamientoId);
    $stmtAgg->execute();
    $agg = $stmtAgg->get_result()->fetch_assoc();
    $stmtAgg->close();

    $totalItems = (int)($agg['total_items'] ?? 0);
    $iniciados = (int)($agg['iniciados'] ?? 0);
    $completados = (int)($agg['completados'] ?? 0);
    $primerInicio = !empty($agg['primer_inicio']) ? (string)$agg['primer_inicio'] : null;

    if ($totalItems > 0 && $completados >= $totalItems) {
        $estado = 'completado';
        $stmt = $conn->prepare('UPDATE tratamientos_enfermeria SET estado = ?, completado_en = COALESCE(completado_en, NOW()) WHERE id = ? AND estado <> "suspendido" LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('si', $estado, $tratamientoId);
            $stmt->execute();
            $stmt->close();
        }
        return;
    }

    if ($iniciados > 0) {
        $estado = 'en_ejecucion';
        $stmt = $conn->prepare('UPDATE tratamientos_enfermeria SET estado = ?, iniciado_en = COALESCE(iniciado_en, ?), completado_en = NULL WHERE id = ? AND estado <> "suspendido" LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('ssi', $estado, $primerInicio, $tratamientoId);
            $stmt->execute();
            $stmt->close();
        }
        return;
    }

    $estado = 'pendiente';
    $stmt = $conn->prepare('UPDATE tratamientos_enfermeria SET estado = ?, iniciado_en = NULL, completado_en = NULL WHERE id = ? AND estado <> "suspendido" LIMIT 1');
    if ($stmt) {
        $stmt->bind_param('si', $estado, $tratamientoId);
        $stmt->execute();
        $stmt->close();
    }
}

$requiredTables = [
    'tratamientos_enfermeria',
    'tratamientos_enfermeria_items',
    'tratamientos_ejecucion_diaria',
    'tratamientos_ejecucion_dosis',
    'tratamientos_ejecucion_eventos',
];
tec_ensure_multidia_tables($conn);
foreach ($requiredTables as $tbl) {
    if (!tec_tabla_existe($conn, $tbl)) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'Estructura multidía no inicializada: falta tabla ' . $tbl]);
        exit;
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $tratamientoId = isset($_GET['tratamiento_id']) ? (int)$_GET['tratamiento_id'] : 0;
    if ($tratamientoId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Falta tratamiento_id']);
        exit;
    }

    $stmtCab = $conn->prepare('SELECT id, consulta_id, paciente_id, estado, version_num, creado_en, iniciado_en, completado_en FROM tratamientos_enfermeria WHERE id = ? LIMIT 1');
    if (!$stmtCab) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Error al leer cabecera']);
        exit;
    }
    $stmtCab->bind_param('i', $tratamientoId);
    $stmtCab->execute();
    $cabecera = $stmtCab->get_result()->fetch_assoc();
    $stmtCab->close();

    if (!$cabecera) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Tratamiento no encontrado']);
        exit;
    }

    tec_seed_plan_from_snapshot($conn, $tratamientoId);
    tph_backfill_item_inicio_desde_cabecera($conn, $tratamientoId);
    tph_regenerar_items_iniciados_sin_dosis($conn, $tratamientoId);

    $stmtItems = $conn->prepare('SELECT * FROM tratamientos_enfermeria_items WHERE tratamiento_id = ? ORDER BY orden ASC, id ASC');
    $stmtItems->bind_param('i', $tratamientoId);
    $stmtItems->execute();
    $items = $stmtItems->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtItems->close();

    $stmtDias = $conn->prepare('SELECT * FROM tratamientos_ejecucion_diaria WHERE tratamiento_id = ? ORDER BY dia_nro ASC, tratamiento_item_id ASC');
    $stmtDias->bind_param('i', $tratamientoId);
    $stmtDias->execute();
    $dias = $stmtDias->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtDias->close();

    $stmtDosis = $conn->prepare('SELECT * FROM tratamientos_ejecucion_dosis WHERE tratamiento_id = ? ORDER BY fecha_hora_programada ASC, id ASC');
    $stmtDosis->bind_param('i', $tratamientoId);
    $stmtDosis->execute();
    $dosisProgramadas = $stmtDosis->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtDosis->close();

    $stmtEvt = $conn->prepare('SELECT * FROM tratamientos_ejecucion_eventos WHERE tratamiento_id = ? ORDER BY fecha_hora_evento DESC, id DESC LIMIT 300');
    $stmtEvt->bind_param('i', $tratamientoId);
    $stmtEvt->execute();
    $eventos = $stmtEvt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtEvt->close();

    $itemsIniciados = [];
    foreach ($items as $item) {
        if (!empty($item['iniciado_en'])) {
            $itemsIniciados[(int)$item['id']] = true;
        }
    }

    $totalDias = 0;
    $diasCerrados = 0;
    $totalDosisPlanificadas = 0;
    $totalDosisResueltas = 0;
    foreach ($dias as $d) {
        $itemId = (int)($d['tratamiento_item_id'] ?? 0);
        if (!isset($itemsIniciados[$itemId])) {
            continue;
        }
        $totalDias++;
        $estadoDia = (string)($d['estado_dia'] ?? 'pendiente');
        $planDia = max(0, (int)($d['dosis_planificadas'] ?? 0));
        $adminDia = max(0, (int)($d['dosis_administradas'] ?? 0));
        $totalDosisPlanificadas += $planDia;
        if ($estadoDia === 'completo' || $estadoDia === 'omitido') {
            $diasCerrados++;
            $totalDosisResueltas += $planDia;
        } else {
            $totalDosisResueltas += min($adminDia, $planDia);
        }
    }
    $progreso = $totalDosisPlanificadas > 0
        ? round(($totalDosisResueltas * 100.0) / $totalDosisPlanificadas, 2)
        : ($totalDias > 0 ? round(($diasCerrados * 100.0) / $totalDias, 2) : 0.0);

    echo json_encode([
        'success' => true,
        'cabecera' => $cabecera,
        'items' => $items,
        'dias' => $dias,
        'dosis_programadas' => $dosisProgramadas,
        'eventos' => $eventos,
        'resumen' => [
            'total_dias' => $totalDias,
            'dias_cerrados' => $diasCerrados,
            'total_dosis_planificadas' => $totalDosisPlanificadas,
            'total_dosis_resueltas' => $totalDosisResueltas,
            'progreso_pct' => $progreso,
        ],
    ]);
    exit;
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $action = trim((string)($body['action'] ?? 'registrar_evento'));

    if ($action === 'iniciar_item') {
        $tratamientoId = isset($body['tratamiento_id']) ? (int)$body['tratamiento_id'] : 0;
        $tratamientoItemId = isset($body['tratamiento_item_id']) ? (int)$body['tratamiento_item_id'] : 0;

        if ($tratamientoId <= 0 || $tratamientoItemId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Faltan tratamiento_id o tratamiento_item_id']);
            exit;
        }

        $stmtItem = $conn->prepare('SELECT id, tratamiento_id, iniciado_en FROM tratamientos_enfermeria_items WHERE id = ? AND tratamiento_id = ? LIMIT 1');
        if (!$stmtItem) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo leer el medicamento']);
            exit;
        }
        $stmtItem->bind_param('ii', $tratamientoItemId, $tratamientoId);
        $stmtItem->execute();
        $item = $stmtItem->get_result()->fetch_assoc();
        $stmtItem->close();

        if (!$item) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Medicamento no encontrado']);
            exit;
        }

        if (!empty($item['iniciado_en'])) {
            echo json_encode(['success' => true, 'tratamiento_id' => $tratamientoId, 'tratamiento_item_id' => $tratamientoItemId]);
            exit;
        }

        $ahora = date('Y-m-d H:i:s');
        $stmtUpd = $conn->prepare('UPDATE tratamientos_enfermeria_items SET iniciado_en = ?, completado_en = NULL WHERE id = ? LIMIT 1');
        if (!$stmtUpd) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo iniciar el medicamento']);
            exit;
        }
        $stmtUpd->bind_param('si', $ahora, $tratamientoItemId);
        $stmtUpd->execute();
        $stmtUpd->close();

        tph_regenerar_dosis_programadas_item($conn, $tratamientoId, $tratamientoItemId, $ahora);
        tec_recalcular_estado_item($conn, $tratamientoItemId);
        tec_recalcular_estado_cabecera($conn, $tratamientoId);

        echo json_encode(['success' => true, 'tratamiento_id' => $tratamientoId, 'tratamiento_item_id' => $tratamientoItemId]);
        exit;
    }

    if ($action !== 'registrar_evento') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no soportada']);
        exit;
    }

    $ejecucionId = isset($body['ejecucion_diaria_id']) ? (int)$body['ejecucion_diaria_id'] : 0;
    $dosisProgramadaId = isset($body['dosis_programada_id']) ? (int)$body['dosis_programada_id'] : 0;
    $tipoEvento = trim((string)($body['tipo_evento'] ?? 'administrada'));
    $cantidad = isset($body['cantidad']) ? (float)$body['cantidad'] : 1.0;
    $obs = trim((string)($body['observacion'] ?? ''));

    if ($ejecucionId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Falta ejecucion_diaria_id']);
        exit;
    }

    $tiposValidos = ['administrada', 'omitida', 'reprogramada', 'observacion'];
    if (!in_array($tipoEvento, $tiposValidos, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'tipo_evento inválido']);
        exit;
    }

    $stmtDia = $conn->prepare('SELECT id, tratamiento_id, tratamiento_item_id, dosis_planificadas, dosis_administradas FROM tratamientos_ejecucion_diaria WHERE id = ? LIMIT 1');
    if (!$stmtDia) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo leer la fila diaria']);
        exit;
    }
    $stmtDia->bind_param('i', $ejecucionId);
    $stmtDia->execute();
    $dia = $stmtDia->get_result()->fetch_assoc();
    $stmtDia->close();

    if (!$dia) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Fila diaria no encontrada']);
        exit;
    }

    $tratamientoId = (int)($dia['tratamiento_id'] ?? 0);
    $tratamientoItemId = (int)($dia['tratamiento_item_id'] ?? 0);
    $usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;
    $fechaEvento = date('Y-m-d H:i:s');

    if ($dosisProgramadaId > 0) {
        $stmtDose = $conn->prepare('SELECT id, ejecucion_diaria_id, tratamiento_id FROM tratamientos_ejecucion_dosis WHERE id = ? LIMIT 1');
        if (!$stmtDose) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo leer la dosis programada']);
            exit;
        }
        $stmtDose->bind_param('i', $dosisProgramadaId);
        $stmtDose->execute();
        $dose = $stmtDose->get_result()->fetch_assoc();
        $stmtDose->close();

        if (!$dose) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Dosis programada no encontrada']);
            exit;
        }

        if ((int)$dose['ejecucion_diaria_id'] !== $ejecucionId || (int)$dose['tratamiento_id'] !== $tratamientoId) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'La dosis no corresponde al día indicado']);
            exit;
        }
    }

    $stmtEvt = $conn->prepare('INSERT INTO tratamientos_ejecucion_eventos (ejecucion_diaria_id, tratamiento_id, dosis_programada_id, tipo_evento, cantidad, fecha_hora_evento, usuario_id, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    if (!$stmtEvt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo registrar el evento']);
        exit;
    }
    $stmtEvt->bind_param('iiisdsis', $ejecucionId, $tratamientoId, $dosisProgramadaId, $tipoEvento, $cantidad, $fechaEvento, $usuarioId, $obs);
    $okEvt = $stmtEvt->execute();
    $stmtEvt->close();

    if (!$okEvt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo guardar el evento']);
        exit;
    }

    if ($dosisProgramadaId > 0) {
        if ($tipoEvento === 'administrada') {
            $estadoDosis = 'administrada';
            $stmtUpdDosis = $conn->prepare('UPDATE tratamientos_ejecucion_dosis SET estado_dosis = ?, fecha_hora_ejecucion = ?, observacion = ? WHERE id = ? LIMIT 1');
            if ($stmtUpdDosis) {
                $stmtUpdDosis->bind_param('sssi', $estadoDosis, $fechaEvento, $obs, $dosisProgramadaId);
                $stmtUpdDosis->execute();
                $stmtUpdDosis->close();
            }
        } elseif ($tipoEvento === 'omitida') {
            $estadoDosis = 'omitida';
            $stmtUpdDosis = $conn->prepare('UPDATE tratamientos_ejecucion_dosis SET estado_dosis = ?, fecha_hora_ejecucion = ?, observacion = ? WHERE id = ? LIMIT 1');
            if ($stmtUpdDosis) {
                $stmtUpdDosis->bind_param('sssi', $estadoDosis, $fechaEvento, $obs, $dosisProgramadaId);
                $stmtUpdDosis->execute();
                $stmtUpdDosis->close();
            }
        }
        tph_recalcular_resumen_dias_desde_dosis($conn, $tratamientoId);
    } else {
        if ($tipoEvento === 'administrada') {
            $inc = max(0, (int)round($cantidad));
            $stmtUpdDia = $conn->prepare('UPDATE tratamientos_ejecucion_diaria SET dosis_administradas = dosis_administradas + ? WHERE id = ? LIMIT 1');
            if ($stmtUpdDia) {
                $stmtUpdDia->bind_param('ii', $inc, $ejecucionId);
                $stmtUpdDia->execute();
                $stmtUpdDia->close();
            }
        } elseif ($tipoEvento === 'omitida') {
            $estadoOmitido = 'omitido';
            $stmtOmit = $conn->prepare('UPDATE tratamientos_ejecucion_diaria SET estado_dia = ? WHERE id = ? LIMIT 1');
            if ($stmtOmit) {
                $stmtOmit->bind_param('si', $estadoOmitido, $ejecucionId);
                $stmtOmit->execute();
                $stmtOmit->close();
            }
        }
    }

    if ($dosisProgramadaId <= 0) {
        tec_recalcular_estado_dia($conn, $ejecucionId);
    }
    tec_recalcular_estado_item($conn, $tratamientoItemId);
    tec_recalcular_estado_cabecera($conn, $tratamientoId);

    echo json_encode([
        'success' => true,
        'ejecucion_diaria_id' => $ejecucionId,
        'tratamiento_id' => $tratamientoId,
    ]);
    exit;
}

if ($method === 'PATCH') {
    $body = json_decode(file_get_contents('php://input'), true);
    $ejecucionId = isset($body['ejecucion_diaria_id']) ? (int)$body['ejecucion_diaria_id'] : 0;
    $estadoDia = trim((string)($body['estado_dia'] ?? ''));
    $notasDia = trim((string)($body['notas_dia'] ?? ''));

    if ($ejecucionId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Falta ejecucion_diaria_id']);
        exit;
    }

    $estadosValidos = ['pendiente', 'parcial', 'completo', 'omitido'];
    if (!in_array($estadoDia, $estadosValidos, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'estado_dia inválido']);
        exit;
    }

    $stmtGet = $conn->prepare('SELECT tratamiento_id, dosis_planificadas, dosis_administradas FROM tratamientos_ejecucion_diaria WHERE id = ? LIMIT 1');
    if (!$stmtGet) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo leer la fila diaria']);
        exit;
    }
    $stmtGet->bind_param('i', $ejecucionId);
    $stmtGet->execute();
    $row = $stmtGet->get_result()->fetch_assoc();
    $stmtGet->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Fila diaria no encontrada']);
        exit;
    }

    $tratamientoId = (int)($row['tratamiento_id'] ?? 0);
    $plan = max(0, (int)($row['dosis_planificadas'] ?? 0));
    $admin = max(0, (int)($row['dosis_administradas'] ?? 0));

    if ($estadoDia === 'completo' && $admin < $plan) {
        $admin = $plan;
    }
    if ($estadoDia === 'pendiente') {
        $admin = 0;
    }

    $stmtUpd = $conn->prepare('UPDATE tratamientos_ejecucion_diaria SET estado_dia = ?, notas_dia = ?, dosis_administradas = ? WHERE id = ? LIMIT 1');
    if (!$stmtUpd) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo actualizar la fila diaria']);
        exit;
    }
    $stmtUpd->bind_param('ssii', $estadoDia, $notasDia, $admin, $ejecucionId);
    $okUpd = $stmtUpd->execute();
    $stmtUpd->close();

    if (!$okUpd) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo guardar estado diario']);
        exit;
    }

    tec_recalcular_estado_dia($conn, $ejecucionId);
    tec_recalcular_estado_cabecera($conn, $tratamientoId);

    echo json_encode([
        'success' => true,
        'ejecucion_diaria_id' => $ejecucionId,
        'tratamiento_id' => $tratamientoId,
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
