<?php
require_once __DIR__ . '/init_api.php';
require_once "config.php";
require_once "auth_check.php";

$method = $_SERVER['REQUEST_METHOD'];

function respond($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function input_json() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function get_user_id_from_session() {
    if (isset($_SESSION['usuario']) && isset($_SESSION['usuario']['id'])) {
        return (int)$_SESSION['usuario']['id'];
    }
    if (isset($_SESSION['usuario_id'])) {
        return (int)$_SESSION['usuario_id'];
    }
    return 0;
}

function table_exists($conn, $table) {
    static $cache = [];
    $key = "tbl::$table";
    if (isset($cache[$key])) return $cache[$key];
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    if (!$stmt) return false;
    $stmt->bind_param("s", $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $cache[$key] = $res && $res->num_rows > 0;
    return $cache[$key];
}

function column_exists($conn, $table, $column) {
    static $cache = [];
    $key = "col::$table::$column";
    if (isset($cache[$key])) return $cache[$key];
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
    if (!$stmt) return false;
    $stmt->bind_param("ss", $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    $cache[$key] = $res && $res->num_rows > 0;
    return $cache[$key];
}

function cargar_detalles_cotizacion($conn, $cotizacionId) {
    $sql = "SELECT * FROM cotizaciones_detalle WHERE cotizacion_id = ?";
    if (column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
        $sql .= " AND estado_item <> 'eliminado'";
    }
    $sql .= " ORDER BY id ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $cotizacionId);
    $stmt->execute();
    return $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
}

function obtener_cotizacion($conn, $cotizacionId) {
    $stmt = $conn->prepare("
        SELECT c.*, p.nombre, p.apellido, p.dni, p.historia_clinica, u.nombre as usuario_nombre
        FROM cotizaciones c
        JOIN pacientes p ON c.paciente_id = p.id
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.id = ?
    ");
    $stmt->bind_param("i", $cotizacionId);
    $stmt->execute();
    $cot = $stmt->get_result()->fetch_assoc();
    if (!$cot) return null;
    $cot['detalles'] = cargar_detalles_cotizacion($conn, $cotizacionId);
    return $cot;
}

function insertar_evento_cotizacion($conn, $cotizacionId, $eventoTipo, $usuarioId, $motivo = null, $payload = null, $version = 1) {
    if (!table_exists($conn, 'cotizacion_eventos')) {
        return;
    }
    $payloadJson = null;
    if ($payload !== null) {
        $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);
    }
    $stmt = $conn->prepare(
        "INSERT INTO cotizacion_eventos (cotizacion_id, version, evento_tipo, usuario_id, motivo, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    if ($stmt) {
        $stmt->bind_param("iisiss", $cotizacionId, $version, $eventoTipo, $usuarioId, $motivo, $payloadJson);
        $stmt->execute();
    }
}

function insertar_detalles_cotizacion($conn, $cotizacionId, $detalles, $usuarioId, $motivoEdicion = null) {
    $hasEstadoItem = column_exists($conn, 'cotizaciones_detalle', 'estado_item');
    $hasVersionItem = column_exists($conn, 'cotizaciones_detalle', 'version_item');
    $hasEditadoPor = column_exists($conn, 'cotizaciones_detalle', 'editado_por');
    $hasEditadoEn = column_exists($conn, 'cotizaciones_detalle', 'editado_en');
    $hasMotivo = column_exists($conn, 'cotizaciones_detalle', 'motivo_edicion');

    $usaDetalleV2 = $hasEstadoItem && $hasVersionItem && $hasEditadoPor && $hasEditadoEn && $hasMotivo;

    foreach ($detalles as $detalle) {
        $servicioTipo = $detalle['servicio_tipo'] ?? '';
        $servicioId = isset($detalle['servicio_id']) ? (int)$detalle['servicio_id'] : null;
        $descripcion = $detalle['descripcion'] ?? '';
        $cantidad = isset($detalle['cantidad']) ? (int)$detalle['cantidad'] : 1;
        $precio = isset($detalle['precio_unitario']) ? (float)$detalle['precio_unitario'] : 0;
        $subtotal = isset($detalle['subtotal']) ? (float)$detalle['subtotal'] : ($precio * $cantidad);

        if ($usaDetalleV2) {
            $stmt = $conn->prepare(
                "INSERT INTO cotizaciones_detalle
                 (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, estado_item, version_item, editado_por, editado_en, motivo_edicion)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', 1, ?, NOW(), ?)"
            );
            if (!$stmt) {
                throw new Exception('Error preparando detalle v2: ' . $conn->error);
            }
            $stmt->bind_param(
                "isisiddis",
                $cotizacionId,
                $servicioTipo,
                $servicioId,
                $descripcion,
                $cantidad,
                $precio,
                $subtotal,
                $usuarioId,
                $motivoEdicion
            );
        } else {
            $stmt = $conn->prepare(
                "INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?)"
            );
            if (!$stmt) {
                throw new Exception('Error preparando detalle: ' . $conn->error);
            }
            $stmt->bind_param(
                "isisidd",
                $cotizacionId,
                $servicioTipo,
                $servicioId,
                $descripcion,
                $cantidad,
                $precio,
                $subtotal
            );
        }
        if ($stmt) {
            $stmt->execute();
        }
    }
}

function total_detalles($detalles) {
    $sum = 0;
    foreach ($detalles as $d) {
        $sum += isset($d['subtotal']) ? (float)$d['subtotal'] : ((float)($d['precio_unitario'] ?? 0) * (int)($d['cantidad'] ?? 1));
    }
    return round($sum, 2);
}

function cotizacion_tiene_servicio_laboratorio($conn, $cotizacionId) {
    $stmt = $conn->prepare("SELECT servicio_tipo FROM cotizaciones_detalle WHERE cotizacion_id = ?");
    if (!$stmt) return false;
    $stmt->bind_param("i", $cotizacionId);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $tipo = strtolower(trim((string)($row['servicio_tipo'] ?? '')));
        if ($tipo === 'laboratorio') {
            return true;
        }
    }
    return false;
}

function cancelar_ordenes_laboratorio_por_cotizacion($conn, $cotizacionId) {
    if (!table_exists($conn, 'cotizacion_movimientos') || !table_exists($conn, 'ordenes_laboratorio')) {
        return;
    }

    $stmtMov = $conn->prepare("SELECT DISTINCT cobro_id FROM cotizacion_movimientos WHERE cotizacion_id = ? AND cobro_id IS NOT NULL");
    if (!$stmtMov) return;
    $stmtMov->bind_param("i", $cotizacionId);
    $stmtMov->execute();
    $resMov = $stmtMov->get_result();

    $stmtUpd = $conn->prepare("UPDATE ordenes_laboratorio SET estado = 'cancelada' WHERE cobro_id = ? AND estado <> 'completado'");
    if (!$stmtUpd) return;

    while ($mov = $resMov->fetch_assoc()) {
        $cobroId = isset($mov['cobro_id']) ? (int)$mov['cobro_id'] : 0;
        if ($cobroId > 0) {
            $stmtUpd->bind_param("i", $cobroId);
            $stmtUpd->execute();
        }
    }
}

function registrar_cotizacion($conn, $data) {
    $usuarioSesion = get_user_id_from_session();
    $usuarioId = isset($data['usuario_id']) ? (int)$data['usuario_id'] : $usuarioSesion;

    if (!isset($data['paciente_id']) || !$usuarioId || !isset($data['detalles']) || !is_array($data['detalles']) || empty($data['detalles'])) {
        respond(['success' => false, 'error' => 'Datos incompletos'], 400);
    }

    $pacienteId = (int)$data['paciente_id'];
    $observaciones = $data['observaciones'] ?? '';
    $total = isset($data['total']) ? (float)$data['total'] : total_detalles($data['detalles']);

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (?, ?, ?, 'pendiente', ?)");
        $stmt->bind_param("iids", $pacienteId, $usuarioId, $total, $observaciones);
        $stmt->execute();
        $cotizacionId = (int)$conn->insert_id;

        if (column_exists($conn, 'cotizaciones', 'numero_comprobante')) {
            $numero = sprintf("Q%06d", $cotizacionId);
            $stmtNum = $conn->prepare("UPDATE cotizaciones SET numero_comprobante = ? WHERE id = ?");
            $stmtNum->bind_param("si", $numero, $cotizacionId);
            $stmtNum->execute();
        }

        if (column_exists($conn, 'cotizaciones', 'total_pagado') && column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
            $stmtSaldo = $conn->prepare("UPDATE cotizaciones SET total_pagado = 0, saldo_pendiente = ? WHERE id = ?");
            $stmtSaldo->bind_param("di", $total, $cotizacionId);
            $stmtSaldo->execute();
        }

        insertar_detalles_cotizacion($conn, $cotizacionId, $data['detalles'], $usuarioId, null);
        insertar_evento_cotizacion($conn, $cotizacionId, 'creada', $usuarioId, 'Creación de cotización', [
            'total' => $total,
            'items' => count($data['detalles'])
        ], 1);

        $conn->commit();
        respond([
            'success' => true,
            'cotizacion_id' => $cotizacionId,
            'numero_comprobante' => sprintf("Q%06d", $cotizacionId),
            'message' => 'Cotización registrada exitosamente'
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        error_log("Error al registrar cotización: " . $e->getMessage());
        respond(['success' => false, 'error' => 'Error al registrar la cotización'], 500);
    }
}

function editar_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    $usuarioId = isset($data['usuario_id']) ? (int)$data['usuario_id'] : get_user_id_from_session();
    $motivo = trim((string)($data['motivo'] ?? 'Edición de cotización'));
    $detalles = $data['detalles'] ?? [];

    if (!$cotizacionId || !$usuarioId || !is_array($detalles) || empty($detalles)) {
        respond(['success' => false, 'error' => 'Datos incompletos para editar'], 400);
    }

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $cotizacionId);
        $stmt->execute();
        $cot = $stmt->get_result()->fetch_assoc();
        if (!$cot) {
            throw new Exception('Cotización no encontrada');
        }

        $estadoActual = strtolower((string)($cot['estado'] ?? 'pendiente'));
        if (!in_array($estadoActual, ['pendiente', 'parcial'])) {
            respond([
                'success' => false,
                'error' => 'La cotización no está en estado editable. Usa adenda para cotizaciones pagadas.'
            ], 409);
        }

        if (column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
            $stmtOff = $conn->prepare("UPDATE cotizaciones_detalle SET estado_item = 'eliminado', editado_por = ?, editado_en = NOW(), motivo_edicion = ? WHERE cotizacion_id = ? AND estado_item <> 'eliminado'");
            $stmtOff->bind_param("isi", $usuarioId, $motivo, $cotizacionId);
            $stmtOff->execute();
        } else {
            $stmtDel = $conn->prepare("DELETE FROM cotizaciones_detalle WHERE cotizacion_id = ?");
            $stmtDel->bind_param("i", $cotizacionId);
            $stmtDel->execute();
        }

        insertar_detalles_cotizacion($conn, $cotizacionId, $detalles, $usuarioId, $motivo);

        $nuevoTotal = total_detalles($detalles);
        if (column_exists($conn, 'cotizaciones', 'total_pagado') && column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
            $pagado = isset($cot['total_pagado']) ? (float)$cot['total_pagado'] : 0;
            $saldo = max(0, $nuevoTotal - $pagado);
            $nuevoEstado = $saldo <= 0 ? 'pagado' : ($pagado > 0 ? 'parcial' : 'pendiente');

            if (column_exists($conn, 'cotizaciones', 'version_actual')) {
                $stmtUp = $conn->prepare("UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ?, version_actual = version_actual + 1, updated_at = NOW() WHERE id = ?");
                $stmtUp->bind_param("ddsi", $nuevoTotal, $saldo, $nuevoEstado, $cotizacionId);
            } else {
                $stmtUp = $conn->prepare("UPDATE cotizaciones SET total = ?, estado = ? WHERE id = ?");
                $stmtUp->bind_param("dsi", $nuevoTotal, $nuevoEstado, $cotizacionId);
            }
        } else {
            $stmtUp = $conn->prepare("UPDATE cotizaciones SET total = ? WHERE id = ?");
            $stmtUp->bind_param("di", $nuevoTotal, $cotizacionId);
        }
        $stmtUp->execute();

        $version = 1;
        if (column_exists($conn, 'cotizaciones', 'version_actual')) {
            $stmtVersion = $conn->prepare("SELECT version_actual FROM cotizaciones WHERE id = ?");
            $stmtVersion->bind_param("i", $cotizacionId);
            $stmtVersion->execute();
            $rowVersion = $stmtVersion->get_result()->fetch_assoc();
            $version = (int)($rowVersion['version_actual'] ?? 1);
        }

        insertar_evento_cotizacion($conn, $cotizacionId, 'editada', $usuarioId, $motivo, [
            'nuevo_total' => $nuevoTotal,
            'items' => count($detalles)
        ], $version);

        $conn->commit();
        respond(['success' => true, 'message' => 'Cotización actualizada', 'cotizacion_id' => $cotizacionId]);
    } catch (Exception $e) {
        $conn->rollback();
        error_log("Error al editar cotización: " . $e->getMessage());
        respond(['success' => false, 'error' => $e->getMessage()], 500);
    }
}

function crear_adenda_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    $usuarioId = isset($data['usuario_id']) ? (int)$data['usuario_id'] : get_user_id_from_session();
    $detalles = $data['detalles'] ?? [];
    $motivo = trim((string)($data['motivo'] ?? 'Ampliación de servicios'));

    if (!$cotizacionId || !$usuarioId || !is_array($detalles) || empty($detalles)) {
        respond(['success' => false, 'error' => 'Datos incompletos para adenda'], 400);
    }

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $cotizacionId);
        $stmt->execute();
        $base = $stmt->get_result()->fetch_assoc();
        if (!$base) throw new Exception('Cotización base no encontrada');

        $total = total_detalles($detalles);
        $observacionesBase = $data['observaciones'] ?? '';
        $obs = trim("ADENDA de #{$cotizacionId}. {$observacionesBase}");

        $stmtNew = $conn->prepare("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (?, ?, ?, 'pendiente', ?)");
        $stmtNew->bind_param("iids", $base['paciente_id'], $usuarioId, $total, $obs);
        $stmtNew->execute();
        $nuevaId = (int)$conn->insert_id;

        if (column_exists($conn, 'cotizaciones', 'numero_comprobante')) {
            $numero = sprintf("Q%06d", $nuevaId);
            $stmtNum = $conn->prepare("UPDATE cotizaciones SET numero_comprobante = ? WHERE id = ?");
            $stmtNum->bind_param("si", $numero, $nuevaId);
            $stmtNum->execute();
        }

        if (column_exists($conn, 'cotizaciones', 'total_pagado') && column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
            if (column_exists($conn, 'cotizaciones', 'cotizacion_padre_id') && column_exists($conn, 'cotizaciones', 'es_adenda')) {
                $stmtSaldo = $conn->prepare("UPDATE cotizaciones SET total_pagado = 0, saldo_pendiente = ?, cotizacion_padre_id = ?, es_adenda = 1 WHERE id = ?");
                $stmtSaldo->bind_param("dii", $total, $cotizacionId, $nuevaId);
            } else {
                $stmtSaldo = $conn->prepare("UPDATE cotizaciones SET total_pagado = 0, saldo_pendiente = ? WHERE id = ?");
                $stmtSaldo->bind_param("di", $total, $nuevaId);
            }
            $stmtSaldo->execute();
        } elseif (column_exists($conn, 'cotizaciones', 'cotizacion_padre_id') && column_exists($conn, 'cotizaciones', 'es_adenda')) {
            $stmtPadre = $conn->prepare("UPDATE cotizaciones SET cotizacion_padre_id = ?, es_adenda = 1 WHERE id = ?");
            $stmtPadre->bind_param("ii", $cotizacionId, $nuevaId);
            $stmtPadre->execute();
        }

        insertar_detalles_cotizacion($conn, $nuevaId, $detalles, $usuarioId, $motivo);

        insertar_evento_cotizacion($conn, $nuevaId, 'adenda_creada', $usuarioId, $motivo, [
            'cotizacion_padre_id' => $cotizacionId,
            'total' => $total,
            'items' => count($detalles)
        ], 1);

        insertar_evento_cotizacion($conn, $cotizacionId, 'adenda_creada', $usuarioId, $motivo, [
            'adenda_id' => $nuevaId,
            'total_adenda' => $total
        ], 1);

        $conn->commit();
        respond([
            'success' => true,
            'message' => 'Adenda creada correctamente',
            'cotizacion_id' => $nuevaId,
            'cotizacion_padre_id' => $cotizacionId,
            'numero_comprobante' => sprintf("Q%06d", $nuevaId)
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        error_log("Error al crear adenda: " . $e->getMessage());
        respond(['success' => false, 'error' => $e->getMessage()], 500);
    }
}

function anular_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    $usuarioId = isset($data['usuario_id']) ? (int)$data['usuario_id'] : get_user_id_from_session();
    $motivo = trim((string)($data['motivo'] ?? ''));

    if (!$cotizacionId || !$usuarioId || $motivo === '') {
        respond(['success' => false, 'error' => 'Cotización, usuario y motivo son obligatorios'], 400);
    }

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $cotizacionId);
        $stmt->execute();
        $cot = $stmt->get_result()->fetch_assoc();
        if (!$cot) throw new Exception('Cotización no encontrada');

        $detallesAuditoria = cargar_detalles_cotizacion($conn, $cotizacionId);

        $cobroIdAuditoria = null;
        if (table_exists($conn, 'cotizacion_movimientos')) {
            $stmtCobro = $conn->prepare("SELECT cobro_id FROM cotizacion_movimientos WHERE cotizacion_id = ? AND cobro_id IS NOT NULL ORDER BY id DESC LIMIT 1");
            if ($stmtCobro) {
                $stmtCobro->bind_param("i", $cotizacionId);
                $stmtCobro->execute();
                $mov = $stmtCobro->get_result()->fetch_assoc();
                if ($mov && isset($mov['cobro_id'])) {
                    $cobroIdAuditoria = (int)$mov['cobro_id'];
                }
            }
        }

        $cajaIdAuditoria = null;
        if (table_exists($conn, 'cajas')) {
            $stmtCaja = $conn->prepare("SELECT id FROM cajas WHERE usuario_id = ? ORDER BY created_at DESC LIMIT 1");
            if ($stmtCaja) {
                $stmtCaja->bind_param("i", $usuarioId);
                $stmtCaja->execute();
                $caja = $stmtCaja->get_result()->fetch_assoc();
                if ($caja && isset($caja['id'])) {
                    $cajaIdAuditoria = (int)$caja['id'];
                }
            }
        }

        $estadoActual = strtolower((string)($cot['estado'] ?? 'pendiente'));
        if ($estadoActual === 'anulada') {
            respond(['success' => true, 'message' => 'La cotización ya estaba anulada']);
        }

        if (column_exists($conn, 'cotizaciones', 'anulado_por') && column_exists($conn, 'cotizaciones', 'anulado_en') && column_exists($conn, 'cotizaciones', 'motivo_anulacion')) {
            $stmtUp = $conn->prepare("UPDATE cotizaciones SET estado = 'anulada', anulado_por = ?, anulado_en = NOW(), motivo_anulacion = ? WHERE id = ?");
            $stmtUp->bind_param("isi", $usuarioId, $motivo, $cotizacionId);
        } else {
            $obsPrev = isset($cot['observaciones']) ? trim((string)$cot['observaciones']) : '';
            $obsNew = trim($obsPrev . " | ANULADA: " . $motivo);
            $stmtUp = $conn->prepare("UPDATE cotizaciones SET estado = 'anulada', observaciones = ? WHERE id = ?");
            $stmtUp->bind_param("si", $obsNew, $cotizacionId);
        }
        $stmtUp->execute();

        if (column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
            $stmtDet = $conn->prepare("UPDATE cotizaciones_detalle SET estado_item = 'eliminado', editado_por = ?, editado_en = NOW(), motivo_edicion = ? WHERE cotizacion_id = ? AND estado_item <> 'eliminado'");
            $stmtDet->bind_param("isi", $usuarioId, $motivo, $cotizacionId);
            $stmtDet->execute();
        }

        if (cotizacion_tiene_servicio_laboratorio($conn, $cotizacionId)) {
            cancelar_ordenes_laboratorio_por_cotizacion($conn, $cotizacionId);
        }

        if (table_exists($conn, 'log_eliminaciones')) {
            $stmtLog = $conn->prepare('INSERT INTO log_eliminaciones (cobro_id, cobros_detalle_id, servicio_tipo, item_json, monto, usuario_id, paciente_id, caja_id, motivo, fecha_hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
            if ($stmtLog) {
                $pacienteIdLog = isset($cot['paciente_id']) ? (int)$cot['paciente_id'] : null;
                $motivoLog = "Anulación cotización #{$cotizacionId}: {$motivo}";
                if (!empty($detallesAuditoria)) {
                    foreach ($detallesAuditoria as $det) {
                        $detalleIdLog = isset($det['id']) ? (int)$det['id'] : null;
                        $servicioTipoLog = (string)($det['servicio_tipo'] ?? 'cotizacion');
                        $montoLog = isset($det['subtotal']) ? (float)$det['subtotal'] : 0;
                        $itemJsonLog = json_encode([
                            'cotizacion_id' => $cotizacionId,
                            'cotizacion_detalle_id' => $detalleIdLog,
                            'servicio_tipo' => $servicioTipoLog,
                            'descripcion' => $det['descripcion'] ?? null,
                            'cantidad' => isset($det['cantidad']) ? (float)$det['cantidad'] : null,
                            'precio_unitario' => isset($det['precio_unitario']) ? (float)$det['precio_unitario'] : null,
                            'subtotal' => $montoLog,
                            'estado_anterior' => $estadoActual,
                            'estado_nuevo' => 'anulada'
                        ], JSON_UNESCAPED_UNICODE);
                        $stmtLog->bind_param("iissdiiis", $cobroIdAuditoria, $detalleIdLog, $servicioTipoLog, $itemJsonLog, $montoLog, $usuarioId, $pacienteIdLog, $cajaIdAuditoria, $motivoLog);
                        $stmtLog->execute();
                    }
                } else {
                    $detalleIdLog = null;
                    $servicioTipoLog = 'cotizacion';
                    $montoLog = isset($cot['total']) ? (float)$cot['total'] : 0;
                    $itemJsonLog = json_encode([
                        'cotizacion_id' => $cotizacionId,
                        'estado_anterior' => $estadoActual,
                        'estado_nuevo' => 'anulada',
                        'total' => $montoLog
                    ], JSON_UNESCAPED_UNICODE);
                    $stmtLog->bind_param("iissdiiis", $cobroIdAuditoria, $detalleIdLog, $servicioTipoLog, $itemJsonLog, $montoLog, $usuarioId, $pacienteIdLog, $cajaIdAuditoria, $motivoLog);
                    $stmtLog->execute();
                }
            }
        }

        insertar_evento_cotizacion($conn, $cotizacionId, 'anulada', $usuarioId, $motivo, [
            'estado_anterior' => $estadoActual
        ], 1);

        $conn->commit();
        respond(['success' => true, 'message' => 'Cotización anulada correctamente']);
    } catch (Exception $e) {
        $conn->rollback();
        error_log("Error al anular cotización: " . $e->getMessage());
        respond(['success' => false, 'error' => $e->getMessage()], 500);
    }
}

function registrar_abono_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    $usuarioId = isset($data['usuario_id']) ? (int)$data['usuario_id'] : get_user_id_from_session();
    $monto = isset($data['monto']) ? (float)$data['monto'] : 0;
    $cobroId = isset($data['cobro_id']) ? (int)$data['cobro_id'] : null;
    $descripcion = trim((string)($data['descripcion'] ?? 'Registro de abono'));

    if (!$cotizacionId || !$usuarioId || $monto <= 0) {
        respond(['success' => false, 'error' => 'Datos incompletos para registrar abono'], 400);
    }

    if (!column_exists($conn, 'cotizaciones', 'total_pagado') || !column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
        respond(['success' => false, 'error' => 'La estructura de saldo no está disponible. Ejecuta la migración v2.'], 409);
    }

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("SELECT id, total, total_pagado, saldo_pendiente FROM cotizaciones WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $cotizacionId);
        $stmt->execute();
        $cot = $stmt->get_result()->fetch_assoc();
        if (!$cot) throw new Exception('Cotización no encontrada');

        $total = (float)$cot['total'];
        $pagadoActual = (float)$cot['total_pagado'];
        $saldoAnterior = (float)$cot['saldo_pendiente'];
        $pagadoNuevo = min($total, $pagadoActual + $monto);
        $saldoNuevo = max(0, $total - $pagadoNuevo);
        $nuevoEstado = $saldoNuevo <= 0 ? 'pagado' : 'parcial';

        $stmtUp = $conn->prepare("UPDATE cotizaciones SET total_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?");
        $stmtUp->bind_param("ddsi", $pagadoNuevo, $saldoNuevo, $nuevoEstado, $cotizacionId);
        $stmtUp->execute();

        if (table_exists($conn, 'cotizacion_movimientos')) {
            $tipoMov = 'abono';
            $stmtMov = $conn->prepare("INSERT INTO cotizacion_movimientos (cotizacion_id, cobro_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmtMov->bind_param("iisdddsi", $cotizacionId, $cobroId, $tipoMov, $monto, $saldoAnterior, $saldoNuevo, $descripcion, $usuarioId);
            $stmtMov->execute();
        }

        insertar_evento_cotizacion($conn, $cotizacionId, 'cobro_registrado', $usuarioId, $descripcion, [
            'monto' => $monto,
            'saldo_anterior' => $saldoAnterior,
            'saldo_nuevo' => $saldoNuevo,
            'estado' => $nuevoEstado,
            'cobro_id' => $cobroId
        ], 1);

        $conn->commit();
        respond([
            'success' => true,
            'message' => 'Abono registrado correctamente',
            'estado' => $nuevoEstado,
            'total_pagado' => $pagadoNuevo,
            'saldo_pendiente' => $saldoNuevo
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        error_log("Error al registrar abono: " . $e->getMessage());
        respond(['success' => false, 'error' => $e->getMessage()], 500);
    }
}

function devolucion_item_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    $detalleId = isset($data['cotizacion_detalle_id']) ? (int)$data['cotizacion_detalle_id'] : 0;
    $cantidadEliminar = isset($data['cantidad_eliminar']) ? (int)$data['cantidad_eliminar'] : 0;
    $usuarioId = isset($data['usuario_id']) ? (int)$data['usuario_id'] : get_user_id_from_session();
    $motivo = trim((string)($data['motivo'] ?? ''));

    if (!$cotizacionId || !$detalleId || !$usuarioId || $cantidadEliminar <= 0 || $motivo === '') {
        respond(['success' => false, 'error' => 'Datos incompletos para devolución/ajuste'], 400);
    }

    if (!column_exists($conn, 'cotizaciones', 'total_pagado') || !column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
        respond(['success' => false, 'error' => 'La estructura v2 de cotizaciones no está disponible. Ejecuta migración primero.'], 409);
    }

    $conn->begin_transaction();
    try {
        $stmtCot = $conn->prepare("SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE");
        $stmtCot->bind_param("i", $cotizacionId);
        $stmtCot->execute();
        $cot = $stmtCot->get_result()->fetch_assoc();
        if (!$cot) throw new Exception('Cotización no encontrada');

        $estadoActual = strtolower((string)($cot['estado'] ?? 'pendiente'));
        if (!in_array($estadoActual, ['pagado', 'parcial'])) {
            throw new Exception('Solo se puede ajustar/devolver ítems en cotizaciones pagadas o parciales');
        }

        $sqlDet = "SELECT * FROM cotizaciones_detalle WHERE id = ? AND cotizacion_id = ?";
        if (column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
            $sqlDet .= " AND estado_item <> 'eliminado'";
        }
        $sqlDet .= " FOR UPDATE";
        $stmtDet = $conn->prepare($sqlDet);
        $stmtDet->bind_param("ii", $detalleId, $cotizacionId);
        $stmtDet->execute();
        $det = $stmtDet->get_result()->fetch_assoc();
        if (!$det) throw new Exception('Detalle de cotización no encontrado');

        $cantidadActual = max(0, (int)($det['cantidad'] ?? 0));
        $precioUnitario = (float)($det['precio_unitario'] ?? 0);
        if ($cantidadActual <= 0) throw new Exception('Cantidad inválida en el ítem seleccionado');
        if ($cantidadEliminar > $cantidadActual) {
            throw new Exception('La cantidad a eliminar no puede ser mayor a la cantidad actual');
        }

        $cantidadNueva = $cantidadActual - $cantidadEliminar;
        $subtotalAnterior = (float)($det['subtotal'] ?? ($precioUnitario * $cantidadActual));
        $subtotalNuevo = $precioUnitario * $cantidadNueva;
        $montoDevuelto = $precioUnitario * $cantidadEliminar;

        if ($cantidadNueva <= 0) {
            if (column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
                $stmtUpdDet = $conn->prepare("UPDATE cotizaciones_detalle SET estado_item = 'eliminado', editado_por = ?, editado_en = NOW(), motivo_edicion = ? WHERE id = ?");
                $stmtUpdDet->bind_param("isi", $usuarioId, $motivo, $detalleId);
            } else {
                $stmtUpdDet = $conn->prepare("DELETE FROM cotizaciones_detalle WHERE id = ?");
                $stmtUpdDet->bind_param("i", $detalleId);
            }
        } else {
            if (column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
                $stmtUpdDet = $conn->prepare("UPDATE cotizaciones_detalle SET cantidad = ?, subtotal = ?, editado_por = ?, editado_en = NOW(), motivo_edicion = ? WHERE id = ?");
                $stmtUpdDet->bind_param("idisi", $cantidadNueva, $subtotalNuevo, $usuarioId, $motivo, $detalleId);
            } else {
                $stmtUpdDet = $conn->prepare("UPDATE cotizaciones_detalle SET cantidad = ?, subtotal = ? WHERE id = ?");
                $stmtUpdDet->bind_param("idi", $cantidadNueva, $subtotalNuevo, $detalleId);
            }
        }
        $stmtUpdDet->execute();

        $totalAnterior = (float)($cot['total'] ?? 0);
        $pagadoAnterior = (float)($cot['total_pagado'] ?? 0);
        $saldoAnterior = (float)($cot['saldo_pendiente'] ?? 0);

        $totalNuevo = max(0, $totalAnterior - $montoDevuelto);
        $pagadoNuevo = max(0, $pagadoAnterior - $montoDevuelto);
        if ($pagadoNuevo > $totalNuevo) $pagadoNuevo = $totalNuevo;
        $saldoNuevo = max(0, $totalNuevo - $pagadoNuevo);

        if ($totalNuevo <= 0) {
            $nuevoEstado = 'anulada';
        } elseif ($saldoNuevo <= 0) {
            $nuevoEstado = 'pagado';
        } elseif ($pagadoNuevo > 0) {
            $nuevoEstado = 'parcial';
        } else {
            $nuevoEstado = 'pendiente';
        }

        $stmtUpdCot = $conn->prepare("UPDATE cotizaciones SET total = ?, total_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?");
        $stmtUpdCot->bind_param("dddsi", $totalNuevo, $pagadoNuevo, $saldoNuevo, $nuevoEstado, $cotizacionId);
        $stmtUpdCot->execute();

        if ($nuevoEstado === 'anulada' && cotizacion_tiene_servicio_laboratorio($conn, $cotizacionId)) {
            cancelar_ordenes_laboratorio_por_cotizacion($conn, $cotizacionId);
        }

        if (table_exists($conn, 'cotizacion_item_ajustes')) {
            $servicioTipo = (string)($det['servicio_tipo'] ?? '');
            $servicioId = isset($det['servicio_id']) ? (int)$det['servicio_id'] : null;
            $accion = 'quitar';
            $stmtAdj = $conn->prepare("INSERT INTO cotizacion_item_ajustes (cotizacion_id, cotizacion_detalle_id, servicio_tipo, servicio_id, accion, cantidad_anterior, cantidad_nueva, precio_anterior, precio_nuevo, subtotal_anterior, subtotal_nuevo, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmtAdj->bind_param("iisisiiddddsi", $cotizacionId, $detalleId, $servicioTipo, $servicioId, $accion, $cantidadActual, $cantidadNueva, $precioUnitario, $precioUnitario, $subtotalAnterior, $subtotalNuevo, $motivo, $usuarioId);
            $stmtAdj->execute();
        }

        if (table_exists($conn, 'cotizacion_movimientos')) {
            $tipoMov = 'devolucion';
            $descripcion = "Devolución/ajuste de ítem #{$detalleId}: {$motivo}";
            $stmtMov = $conn->prepare("INSERT INTO cotizacion_movimientos (cotizacion_id, cobro_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, usuario_id) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)");
            $stmtMov->bind_param("isdddsi", $cotizacionId, $tipoMov, $montoDevuelto, $saldoAnterior, $saldoNuevo, $descripcion, $usuarioId);
            $stmtMov->execute();
        }

        if (table_exists($conn, 'log_eliminaciones')) {
            $cobroIdAuditoria = null;
            if (table_exists($conn, 'cotizacion_movimientos')) {
                $stmtCobro = $conn->prepare("SELECT cobro_id FROM cotizacion_movimientos WHERE cotizacion_id = ? AND cobro_id IS NOT NULL ORDER BY id DESC LIMIT 1");
                if ($stmtCobro) {
                    $stmtCobro->bind_param("i", $cotizacionId);
                    $stmtCobro->execute();
                    $mov = $stmtCobro->get_result()->fetch_assoc();
                    if ($mov && isset($mov['cobro_id'])) {
                        $cobroIdAuditoria = (int)$mov['cobro_id'];
                    }
                }
            }

            $cajaIdAuditoria = null;
            if (table_exists($conn, 'cajas')) {
                $stmtCaja = $conn->prepare("SELECT id FROM cajas WHERE usuario_id = ? ORDER BY created_at DESC LIMIT 1");
                if ($stmtCaja) {
                    $stmtCaja->bind_param("i", $usuarioId);
                    $stmtCaja->execute();
                    $caja = $stmtCaja->get_result()->fetch_assoc();
                    if ($caja && isset($caja['id'])) {
                        $cajaIdAuditoria = (int)$caja['id'];
                    }
                }
            }

            $pacienteIdLog = isset($cot['paciente_id']) ? (int)$cot['paciente_id'] : null;
            $servicioTipoLog = (string)($det['servicio_tipo'] ?? 'cotizacion');
            $itemJsonLog = json_encode([
                'cotizacion_id' => $cotizacionId,
                'cotizacion_detalle_id' => $detalleId,
                'servicio_tipo' => $servicioTipoLog,
                'servicio_id' => isset($det['servicio_id']) ? (int)$det['servicio_id'] : null,
                'descripcion' => $det['descripcion'] ?? null,
                'cantidad_anterior' => $cantidadActual,
                'cantidad_eliminada' => $cantidadEliminar,
                'cantidad_nueva' => $cantidadNueva,
                'precio_unitario' => $precioUnitario,
                'subtotal_anterior' => $subtotalAnterior,
                'subtotal_nuevo' => $subtotalNuevo,
                'estado_anterior' => $estadoActual,
                'estado_nuevo' => $nuevoEstado,
                'accion' => 'ajuste_cotizacion'
            ], JSON_UNESCAPED_UNICODE);
            $motivoLog = "Ajuste cotización #{$cotizacionId} ítem #{$detalleId}: {$motivo}";

            $stmtLog = $conn->prepare('INSERT INTO log_eliminaciones (cobro_id, cobros_detalle_id, servicio_tipo, item_json, monto, usuario_id, paciente_id, caja_id, motivo, fecha_hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
            if ($stmtLog) {
                $stmtLog->bind_param("iissdiiis", $cobroIdAuditoria, $detalleId, $servicioTipoLog, $itemJsonLog, $montoDevuelto, $usuarioId, $pacienteIdLog, $cajaIdAuditoria, $motivoLog);
                $stmtLog->execute();
            }
        }

        insertar_evento_cotizacion($conn, $cotizacionId, 'devolucion_parcial', $usuarioId, $motivo, [
            'cotizacion_detalle_id' => $detalleId,
            'cantidad_anterior' => $cantidadActual,
            'cantidad_eliminada' => $cantidadEliminar,
            'cantidad_nueva' => $cantidadNueva,
            'monto_devuelto' => $montoDevuelto,
            'total_anterior' => $totalAnterior,
            'total_nuevo' => $totalNuevo,
            'saldo_anterior' => $saldoAnterior,
            'saldo_nuevo' => $saldoNuevo,
            'estado_nuevo' => $nuevoEstado
        ], 1);

        $conn->commit();
        respond([
            'success' => true,
            'message' => 'Ajuste aplicado correctamente',
            'monto_devuelto' => round($montoDevuelto, 2),
            'estado' => $nuevoEstado,
            'total' => round($totalNuevo, 2),
            'total_pagado' => round($pagadoNuevo, 2),
            'saldo_pendiente' => round($saldoNuevo, 2)
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        error_log("Error en devolución de ítem: " . $e->getMessage());
        respond(['success' => false, 'error' => $e->getMessage()], 500);
    }
}

function listar_eventos($conn, $cotizacionId) {
    if (!table_exists($conn, 'cotizacion_eventos')) {
        respond(['success' => true, 'eventos' => []]);
    }
    $stmt = $conn->prepare("SELECT e.*, u.nombre AS usuario_nombre FROM cotizacion_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE e.cotizacion_id = ? ORDER BY e.created_at DESC, e.id DESC");
    $stmt->bind_param("i", $cotizacionId);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    respond(['success' => true, 'eventos' => $rows]);
}

function resumen_diario($conn) {
    $fechaInicio = $_GET['fecha_inicio'] ?? date('Y-m-d');
    $fechaFin = $_GET['fecha_fin'] ?? $fechaInicio;

    if (table_exists($conn, 'vw_cotizaciones_resumen_diario')) {
        $stmt = $conn->prepare("SELECT * FROM vw_cotizaciones_resumen_diario WHERE fecha_dia BETWEEN ? AND ? ORDER BY fecha DESC, id DESC");
        $stmt->bind_param("ss", $fechaInicio, $fechaFin);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        respond(['success' => true, 'resumen' => $rows]);
    }

    $stmt = $conn->prepare("SELECT c.*, p.nombre, p.apellido, p.dni, p.historia_clinica, u.nombre AS usuario_cotizo FROM cotizaciones c JOIN pacientes p ON p.id = c.paciente_id JOIN usuarios u ON u.id = c.usuario_id WHERE DATE(c.fecha) BETWEEN ? AND ? ORDER BY c.fecha DESC, c.id DESC");
    $stmt->bind_param("ss", $fechaInicio, $fechaFin);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    respond(['success' => true, 'resumen' => $rows]);
}

switch ($method) {
    case 'POST': {
        $data = input_json();
        $accion = strtolower(trim((string)($data['accion'] ?? 'registrar')));

        if ($accion === 'editar') {
            editar_cotizacion($conn, $data);
        }
        if ($accion === 'adenda') {
            crear_adenda_cotizacion($conn, $data);
        }
        if ($accion === 'anular') {
            anular_cotizacion($conn, $data);
        }
        if ($accion === 'registrar_abono') {
            registrar_abono_cotizacion($conn, $data);
        }
        if ($accion === 'devolucion_item') {
            devolucion_item_cotizacion($conn, $data);
        }

        registrar_cotizacion($conn, $data);
        break;
    }

    case 'GET': {
        if (isset($_GET['accion']) && strtolower($_GET['accion']) === 'resumen_diario') {
            resumen_diario($conn);
        }

        if (isset($_GET['accion']) && strtolower($_GET['accion']) === 'eventos' && isset($_GET['cotizacion_id'])) {
            listar_eventos($conn, (int)$_GET['cotizacion_id']);
        }

        if (isset($_GET['paciente_id'])) {
            $pacienteId = (int)$_GET['paciente_id'];
            $stmt = $conn->prepare("
                SELECT c.*, p.nombre, p.apellido, u.nombre as usuario_nombre
                FROM cotizaciones c
                JOIN pacientes p ON c.paciente_id = p.id
                JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.paciente_id = ?
                ORDER BY c.fecha DESC
            ");
            $stmt->bind_param("i", $pacienteId);
            $stmt->execute();
            $cotizaciones = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

            foreach ($cotizaciones as &$cotizacion) {
                $cotizacion['detalles'] = cargar_detalles_cotizacion($conn, (int)$cotizacion['id']);
            }

            respond(['success' => true, 'cotizaciones' => $cotizaciones]);
        }

        if (isset($_GET['cotizacion_id'])) {
            $cotizacion = obtener_cotizacion($conn, (int)$_GET['cotizacion_id']);
            if (!$cotizacion) {
                respond(['success' => false, 'error' => 'Cotización no encontrada'], 404);
            }
            respond(['success' => true, 'cotizacion' => $cotizacion]);
        }

        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 10;
        $offset = ($page - 1) * $limit;
        $fechaInicio = $_GET['fecha_inicio'] ?? null;
        $fechaFin = $_GET['fecha_fin'] ?? null;
        $estado = $_GET['estado'] ?? null;
        $usuarioId = isset($_GET['usuario_id']) ? (int)$_GET['usuario_id'] : null;
        $q = trim((string)($_GET['q'] ?? ''));
        $includeDetalles = isset($_GET['include_detalles']) && (string)$_GET['include_detalles'] === '1';
        $hasEstadoItem = column_exists($conn, 'cotizaciones_detalle', 'estado_item');

        $where = [];
        $types = '';
        $params = [];

        if ($fechaInicio && $fechaFin) {
            $where[] = "DATE(c.fecha) BETWEEN ? AND ?";
            $types .= 'ss';
            $params[] = $fechaInicio;
            $params[] = $fechaFin;
        }
        if ($estado) {
            $where[] = "c.estado = ?";
            $types .= 's';
            $params[] = $estado;
        }
        if ($usuarioId) {
            $where[] = "c.usuario_id = ?";
            $types .= 'i';
            $params[] = $usuarioId;
        }
        if ($q !== '') {
            $like = "%$q%";
            $where[] = "(p.nombre LIKE ? OR p.apellido LIKE ? OR p.dni LIKE ? OR p.historia_clinica LIKE ? OR CAST(c.id AS CHAR) LIKE ?)";
            $types .= 'sssss';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $whereSql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';

        $serviciosSubquery = $hasEstadoItem
            ? "(SELECT GROUP_CONCAT(DISTINCT LOWER(cd.servicio_tipo) ORDER BY cd.servicio_tipo SEPARATOR ',') FROM cotizaciones_detalle cd WHERE cd.cotizacion_id = c.id AND (c.estado = 'anulada' OR cd.estado_item <> 'eliminado'))"
            : "(SELECT GROUP_CONCAT(DISTINCT LOWER(cd.servicio_tipo) ORDER BY cd.servicio_tipo SEPARATOR ',') FROM cotizaciones_detalle cd WHERE cd.cotizacion_id = c.id)";

        $sql = "
            SELECT c.*, p.nombre, p.apellido, p.dni, p.historia_clinica, u.nombre as usuario_nombre
                   ,{$serviciosSubquery} AS servicios_tipos
            FROM cotizaciones c
            JOIN pacientes p ON c.paciente_id = p.id
            JOIN usuarios u ON c.usuario_id = u.id
            $whereSql
            ORDER BY c.fecha DESC
            LIMIT ? OFFSET ?
        ";

        $typesList = $types . 'ii';
        $paramsList = $params;
        $paramsList[] = $limit;
        $paramsList[] = $offset;

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            respond(['success' => false, 'error' => 'Error al preparar consulta'], 500);
        }
        $stmt->bind_param($typesList, ...$paramsList);
        $stmt->execute();
        $cotizaciones = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

        if ($includeDetalles) {
            foreach ($cotizaciones as &$cotizacion) {
                $cotizacion['detalles'] = cargar_detalles_cotizacion($conn, (int)$cotizacion['id']);
            }
        }

        $sqlCount = "
            SELECT COUNT(*) as total
            FROM cotizaciones c
            JOIN pacientes p ON c.paciente_id = p.id
            JOIN usuarios u ON c.usuario_id = u.id
            $whereSql
        ";
        $stmtCount = $conn->prepare($sqlCount);
        if (strlen($types) > 0) {
            $stmtCount->bind_param($types, ...$params);
        }
        $stmtCount->execute();
        $total = (int)$stmtCount->get_result()->fetch_assoc()['total'];

        respond([
            'success' => true,
            'cotizaciones' => $cotizaciones,
            'total' => $total,
            'page' => $page,
            'limit' => $limit
        ]);
        break;
    }

    default:
        respond(['success' => false, 'error' => 'Método no permitido'], 405);
}
?>
