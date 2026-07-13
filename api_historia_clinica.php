<?php
require_once __DIR__ . '/init_api.php';
// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/HcTemplateResolver.php';
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

function hc_actor_label() {
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        return 'sistema';
    }

    $u = $_SESSION['usuario'];
    $rol = trim((string)($u['rol'] ?? 'usuario'));
    $nombre = trim((string)($u['nombre'] ?? ''));
    $apellido = trim((string)($u['apellido'] ?? ''));
    $display = trim($nombre . ' ' . $apellido);
    if ($display === '') {
        $display = trim((string)($u['usuario'] ?? ''));
    }
    if ($display === '') {
        $display = 'usuario';
    }
    return $display . ' (' . $rol . ')';
}

function hc_resolver_actor_usuario_id() {
    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
        $rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
        if ($rol === 'medico') {
            return 0;
        }
        return (int)($_SESSION['usuario']['id'] ?? 0);
    }

    if (isset($_SESSION['usuario_id'])) {
        return (int)$_SESSION['usuario_id'];
    }

    if (isset($_SESSION['medico_id'])) {
        return 0;
    }

    return 0;
}

function hc_append_proxima_historial($proximaCita, $evento) {
    if (!is_array($proximaCita)) {
        $proximaCita = [];
    }
    $historial = [];
    if (isset($proximaCita['historial']) && is_array($proximaCita['historial'])) {
        $historial = $proximaCita['historial'];
    }
    $historial[] = $evento;

    if (count($historial) > 20) {
        $historial = array_slice($historial, -20);
    }

    $proximaCita['historial'] = $historial;
    return $proximaCita;
}

function hc_normalizar_hora($horaRaw) {
    $hora = trim((string)$horaRaw);
    if ($hora === '') return '';
    if (strlen($hora) === 5 && substr_count($hora, ':') === 1) {
        $hora .= ':00';
    }
    return $hora;
}

function hc_normalizar_tipo_diagnostico($tipoRaw) {
    $tipo = mb_strtolower(trim((string)$tipoRaw), 'UTF-8');
    if ($tipo === '') {
        return 'principal';
    }

    $map = [
        'principal' => 'principal',
        'primario' => 'principal',
        'secundario' => 'secundario',
        'secundaria' => 'secundario',
        'presuntivo' => 'presuntivo',
        'presuntiva' => 'presuntivo',
        'definitivo' => 'definitivo',
        'definitiva' => 'definitivo',
    ];

    return $map[$tipo] ?? 'secundario';
}

function hc_sanitizar_diagnosticos($datos) {
    if (!is_array($datos) || !isset($datos['diagnosticos']) || !is_array($datos['diagnosticos'])) {
        return $datos;
    }

    $normalizados = [];
    foreach ($datos['diagnosticos'] as $item) {
        if (is_string($item)) {
            $texto = trim($item);
            if ($texto !== '') {
                $normalizados[] = $texto;
            }
            continue;
        }

        if (!is_array($item)) {
            continue;
        }

        $item['tipo'] = hc_normalizar_tipo_diagnostico($item['tipo'] ?? 'principal');
        $normalizados[] = $item;
    }

    $datos['diagnosticos'] = $normalizados;
    return $datos;
}

function hc_obtener_tarifa_consulta($conn, $medicoId) {
    $medicoId = intval($medicoId);
    if ($medicoId <= 0) {
        return null;
    }

    $stmt = $conn->prepare('SELECT id, precio_particular, descripcion FROM tarifas WHERE medico_id = ? AND servicio_tipo = "consulta" AND activo = 1 ORDER BY id DESC LIMIT 1');
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('i', $medicoId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();
    
    if ($row && isset($row['precio_particular'])) {
        return [
            'id' => (int)($row['id'] ?? 0),
            'precio' => round((float)$row['precio_particular'], 2),
            'descripcion' => trim((string)($row['descripcion'] ?? 'Consulta médica')),
        ];
    }

    // Fallback a tarifa general de consulta (sin médico específico).
    $stmt2 = $conn->prepare('SELECT id, precio_particular, descripcion FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND (medico_id IS NULL OR medico_id = 0) ORDER BY id DESC LIMIT 1');
    if (!$stmt2) {
        return null;
    }
    $stmt2->execute();
    $row2 = $stmt2->get_result()->fetch_assoc();
    $stmt2->close();

    if ($row2 && isset($row2['precio_particular'])) {
        return [
            'id' => (int)($row2['id'] ?? 0),
            'precio' => round((float)$row2['precio_particular'], 2),
            'descripcion' => trim((string)($row2['descripcion'] ?? 'Consulta médica')),
        ];
    }

    return null;
}

function hc_crear_cotizacion_proxima_cita($conn, $pacienteId, $medicoId, $consultaId) {
    $pacienteId = intval($pacienteId);
    $medicoId = intval($medicoId);
    $consultaId = intval($consultaId);
    
    if ($pacienteId <= 0 || $medicoId <= 0 || $consultaId <= 0) {
        return null;
    }
    
    // Obtener tarifa de la consulta
    $tarifaInfo = hc_obtener_tarifa_consulta($conn, $medicoId);
    $tarifaId = (int)($tarifaInfo['id'] ?? 0);
    $tarifa = round((float)($tarifaInfo['precio'] ?? 0), 2);
    if ($tarifaId <= 0 || $tarifa <= 0) {
        // Si no hay tarifa, no crear cotización
        return null;
    }
    
    // Crear cotización
    $usuarioId = hc_resolver_actor_usuario_id();

    $stmtCot = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones) VALUES (?, ?, ?, ?, "pendiente", ?)');
    if (!$stmtCot) {
        return null;
    }

    $obs = 'Cotización automática - Próxima cita desde Historia Clínica';
    $stmtCot->bind_param('iidds', $pacienteId, $usuarioId, $tarifa, $tarifa, $obs);
    $okCot = $stmtCot->execute();
    $cotizacionId = $okCot ? (int)$stmtCot->insert_id : 0;
    $stmtCot->close();
    
    if ($cotizacionId <= 0) {
        return null;
    }
    
    // Crear detalle de cotización
    $stmtDet = $conn->prepare('INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES (?, "consulta", ?, ?, 1, ?, ?, ?, ?)');
    if (!$stmtDet) {
        return null;
    }
    
    $servicioId = $medicoId;
    $desc = trim((string)($tarifaInfo['descripcion'] ?? 'Consulta médica'));
    $servicioId = $tarifaId;
    $stmtDet->bind_param('iisddii', $cotizacionId, $servicioId, $desc, $tarifa, $tarifa, $medicoId, $consultaId);
    $okDet = $stmtDet->execute();
    $stmtDet->close();
    
    if (!$okDet) {
        return null;
    }
    
    return [
        'cotizacion_id' => $cotizacionId,
        'total' => $tarifa,
        'estado' => 'pendiente'
    ];
}

function hc_asegurar_cotizacion_control($conn, $pacienteId, $medicoId, $consultaId) {
    $pacienteId = intval($pacienteId);
    $medicoId = intval($medicoId);
    $consultaId = intval($consultaId);

    if ($pacienteId <= 0 || $consultaId <= 0) {
        return null;
    }

    // Evitar duplicados: si ya existe cotización activa vinculada a la consulta, la reutiliza.
    $stmtExist = $conn->prepare(
        'SELECT cd.cotizacion_id FROM cotizaciones_detalle cd '
        . 'INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id '
        . 'WHERE cd.consulta_id = ? AND LOWER(TRIM(ct.estado)) NOT IN ("anulado", "anulada") '
        . 'ORDER BY cd.cotizacion_id DESC LIMIT 1'
    );
    if ($stmtExist) {
        $stmtExist->bind_param('i', $consultaId);
        $stmtExist->execute();
        $rowExist = $stmtExist->get_result()->fetch_assoc();
        $stmtExist->close();

        if ($rowExist && intval($rowExist['cotizacion_id'] ?? 0) > 0) {
            $cotizacionId = intval($rowExist['cotizacion_id']);
            $stmtFix = $conn->prepare('UPDATE cotizaciones SET total = 0, saldo_pendiente = 0, estado = "CONTROL", observaciones = ? WHERE id = ? LIMIT 1');
            if ($stmtFix) {
                $obs = 'Cotización automática CONTROL (sin costo) - Próxima cita desde Historia Clínica';
                $stmtFix->bind_param('si', $obs, $cotizacionId);
                $stmtFix->execute();
                $stmtFix->close();
            }

            return [
                'cotizacion_id' => $cotizacionId,
                'total' => 0.0,
                'estado' => 'CONTROL',
            ];
        }
    }

    $usuarioId = hc_resolver_actor_usuario_id();

    $stmtCot = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones) VALUES (?, ?, 0, 0, "CONTROL", ?)');
    if (!$stmtCot) {
        return null;
    }

    $obs = 'Cotización automática CONTROL (sin costo) - Próxima cita desde Historia Clínica';
    $stmtCot->bind_param('iis', $pacienteId, $usuarioId, $obs);
    $okCot = $stmtCot->execute();
    $cotizacionId = $okCot ? (int)$stmtCot->insert_id : 0;
    $stmtCot->close();

    if ($cotizacionId <= 0) {
        return null;
    }

    $servicioId = $medicoId > 0 ? $medicoId : 0;
    $descripcion = 'Consulta de control (sin costo)';
    $stmtDet = $conn->prepare('INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES (?, "consulta", ?, ?, 1, 0, 0, ?, ?)');
    if (!$stmtDet) {
        return null;
    }
    $stmtDet->bind_param('iisii', $cotizacionId, $servicioId, $descripcion, $medicoId, $consultaId);
    $okDet = $stmtDet->execute();
    $stmtDet->close();

    if (!$okDet) {
        return null;
    }

    return [
        'cotizacion_id' => $cotizacionId,
        'total' => 0.0,
        'estado' => 'CONTROL',
    ];
}

function hc_normalizar_item_receta_hash($item) {
    $codigo = trim((string)($item['codigo'] ?? ''));
    $nombre = trim((string)($item['nombre'] ?? ($item['medicamento'] ?? '')));
    $dosis = trim((string)($item['dosis'] ?? ''));
    $frecuencia = trim((string)($item['frecuencia'] ?? ''));
    $duracion = trim((string)($item['duracion'] ?? ''));
    $obs = trim((string)($item['observaciones'] ?? ($item['indicaciones'] ?? '')));
    $manual = !empty($item['manual']) ? 1 : 0;

    return [
        'codigo' => mb_strtolower($codigo, 'UTF-8'),
        'nombre' => mb_strtolower($nombre, 'UTF-8'),
        'dosis' => mb_strtolower($dosis, 'UTF-8'),
        'frecuencia' => mb_strtolower($frecuencia, 'UTF-8'),
        'duracion' => mb_strtolower($duracion, 'UTF-8'),
        'observaciones' => mb_strtolower($obs, 'UTF-8'),
        'manual' => $manual,
    ];
}

function hc_calcular_hash_receta($receta) {
    $normalizada = [];
    foreach ((array)$receta as $item) {
        if (!is_array($item)) continue;
        $normalizada[] = hc_normalizar_item_receta_hash($item);
    }

    usort($normalizada, function ($a, $b) {
        $ka = ($a['codigo'] ?? '') . '|' . ($a['nombre'] ?? '');
        $kb = ($b['codigo'] ?? '') . '|' . ($b['nombre'] ?? '');
        return strcmp($ka, $kb);
    });

    return sha1(json_encode($normalizada, JSON_UNESCAPED_UNICODE));
}

function hc_fingerprint_item_receta($item, $medId = 0) {
    $normalizado = hc_normalizar_item_receta_hash($item);
    $normalizado['medicamento_id'] = (int)$medId;
    return sha1(json_encode($normalizado, JSON_UNESCAPED_UNICODE));
}

function hc_cargar_mapa_estado_items_receta($conn, $consultaId) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0 || !hc_table_exists($conn, 'hc_receta_items_estado')) {
        return [];
    }

    $stmt = $conn->prepare('SELECT item_fingerprint, estado, cotizacion_id FROM hc_receta_items_estado WHERE consulta_id = ?');
    if (!$stmt) return [];
    $stmt->bind_param('i', $consultaId);
    $stmt->execute();
    $res = $stmt->get_result();
    $map = [];
    while ($row = $res->fetch_assoc()) {
        $fp = trim((string)($row['item_fingerprint'] ?? ''));
        if ($fp === '') continue;
        $map[$fp] = [
            'estado' => strtolower(trim((string)($row['estado'] ?? ''))),
            'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0),
        ];
    }
    $stmt->close();
    return $map;
}

function hc_guardar_estado_item_receta($conn, $consultaId, $hcId, $cotizacionId, $fingerprint, $codigo, $nombre, $cantidad, $estado, $motivo, $payload = null) {
    $consultaId = (int)$consultaId;
    $hcId = (int)$hcId;
    $cotizacionId = (int)$cotizacionId;
    $fingerprint = trim((string)$fingerprint);
    if ($consultaId <= 0 || $fingerprint === '' || !hc_table_exists($conn, 'hc_receta_items_estado')) {
        return;
    }

    $codigo = trim((string)$codigo);
    $nombre = trim((string)$nombre);
    $cantidad = max(1, (int)$cantidad);
    $estado = trim((string)$estado);
    $motivo = trim((string)$motivo);
    $payloadJson = null;
    if (is_array($payload)) {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $payloadJson = $json !== false ? $json : null;
    }

    $sql = 'INSERT INTO hc_receta_items_estado
            (consulta_id, hc_id, cotizacion_id, item_fingerprint, codigo, nombre, cantidad_calculada, estado, ultimo_motivo, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                hc_id = VALUES(hc_id),
                cotizacion_id = VALUES(cotizacion_id),
                codigo = VALUES(codigo),
                nombre = VALUES(nombre),
                cantidad_calculada = VALUES(cantidad_calculada),
                estado = VALUES(estado),
                ultimo_motivo = VALUES(ultimo_motivo),
                payload_json = VALUES(payload_json),
                updated_at = CURRENT_TIMESTAMP';
    $stmt = $conn->prepare($sql);
    if (!$stmt) return;
    $stmt->bind_param('iiisssisss', $consultaId, $hcId, $cotizacionId, $fingerprint, $codigo, $nombre, $cantidad, $estado, $motivo, $payloadJson);
    $stmt->execute();
    $stmt->close();
}

/**
 * Calcula la cantidad de unidades a dispensar según frecuencia y duración de la receta.
 * Fórmula: ceil((24 / horas_frecuencia) * días_duración)
 * Si no se puede parsear algún campo, devuelve 1 (valor seguro).
 */
function hc_calcular_cantidad_desde_receta($item) {
    $cantidadDisp = isset($item['cantidad_dispensacion']) ? (float)$item['cantidad_dispensacion'] : 0;
    if ($cantidadDisp <= 0 && isset($item['cantidad_dispensar'])) {
        $cantidadDisp = (float)$item['cantidad_dispensar'];
    }
    if ($cantidadDisp > 0) {
        return max(1, (int)ceil($cantidadDisp));
    }

    $frecuencia = strtolower(trim((string)($item['frecuencia'] ?? '')));
    $duracion   = strtolower(trim((string)($item['duracion']   ?? '')));

    // --- Parsear duración a días ---
    $dias = 0;
    if ($duracion !== '') {
        if (preg_match('/([\d]+(?:[.,][\d]+)?)\s*d[íi]a/u', $duracion, $m)) {
            $dias = (float)str_replace(',', '.', $m[1]);
        } elseif (preg_match('/([\d]+(?:[.,][\d]+)?)\s*sem/u', $duracion, $m)) {
            $dias = (float)str_replace(',', '.', $m[1]) * 7;
        } elseif (preg_match('/([\d]+(?:[.,][\d]+)?)\s*mes/u', $duracion, $m)) {
            $dias = (float)str_replace(',', '.', $m[1]) * 30;
        } elseif (preg_match('/^([\d]+)$/', trim($duracion), $m)) {
            $dias = (int)$m[1];
        }
    }

    // --- Parsear frecuencia a dosis por día ---
    $dosisXdia = 0;
    if ($frecuencia !== '') {
        // "cada 8 horas", "cada 8h", "cada 8 h"
        if (preg_match('/cada\s+([\d]+(?:[.,][\d]+)?)\s*h/u', $frecuencia, $m)) {
            $horas = (float)str_replace(',', '.', $m[1]);
            if ($horas > 0) $dosisXdia = 24 / $horas;
        // "cada 30 minutos" etc — no aplica para conteo de tabletas
        } elseif (preg_match('/\bqid\b/i', $frecuencia)) {
            $dosisXdia = 4;
        } elseif (preg_match('/\btid\b/i', $frecuencia)) {
            $dosisXdia = 3;
        } elseif (preg_match('/\bbid\b/i', $frecuencia)) {
            $dosisXdia = 2;
        } elseif (preg_match('/cuatro\s+veces|4\s*veces/u', $frecuencia)) {
            $dosisXdia = 4;
        } elseif (preg_match('/tres\s+veces|3\s*veces/u', $frecuencia)) {
            $dosisXdia = 3;
        } elseif (preg_match('/dos\s+veces|2\s*veces/u', $frecuencia)) {
            $dosisXdia = 2;
        } elseif (preg_match('/una\s+vez|1\s*vez|\bqd\b|una\s+vez\s+al\s+d[íi]a/u', $frecuencia)) {
            $dosisXdia = 1;
        }
    }

    if ($dias > 0 && $dosisXdia > 0) {
        return max(1, (int)ceil($dosisXdia * $dias));
    }
    return 1;
}

function hc_resolver_precio_medicamento($med) {
    $precioVenta = isset($med['precio_venta']) ? (float)$med['precio_venta'] : 0.0;
    if ($precioVenta > 0) {
        return round($precioVenta, 2);
    }

    $precioCompra = isset($med['precio_compra']) ? (float)$med['precio_compra'] : 0.0;
    $margen = isset($med['margen_ganancia']) ? (float)$med['margen_ganancia'] : 0.0;
    if ($precioCompra > 0) {
        return round($precioCompra * (1 + ($margen / 100)), 2);
    }

    return 0.0;
}

function hc_resolver_medicamento_desde_receta($conn, $item) {
    $codigo = trim((string)($item['codigo'] ?? ''));
    $nombre = trim((string)($item['nombre'] ?? ($item['medicamento'] ?? '')));
    $manual = !empty($item['manual']) || stripos($codigo, 'MANUAL-') === 0;

    if ($manual) {
        return [null, 'item_manual_sin_catalogo'];
    }

    if ($codigo !== '') {
        $stmt = $conn->prepare('SELECT * FROM medicamentos WHERE codigo = ? ORDER BY id DESC LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('s', $codigo);
            $stmt->execute();
            $med = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($med) {
                $estado = strtolower(trim((string)($med['estado'] ?? 'activo')));
                if ($estado !== '' && $estado !== 'activo') {
                    return [null, 'medicamento_inactivo'];
                }
                return [$med, null];
            }
        }
    }

    if ($nombre !== '') {
        $stmtEq = $conn->prepare('SELECT * FROM medicamentos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1');
        if ($stmtEq) {
            $stmtEq->bind_param('s', $nombre);
            $stmtEq->execute();
            $medEq = $stmtEq->get_result()->fetch_assoc();
            $stmtEq->close();
            if ($medEq) {
                $estadoEq = strtolower(trim((string)($medEq['estado'] ?? 'activo')));
                if ($estadoEq !== '' && $estadoEq !== 'activo') {
                    return [null, 'medicamento_inactivo'];
                }
                return [$medEq, null];
            }
        }

        $like = '%' . $nombre . '%';
        $stmtLike = $conn->prepare('SELECT * FROM medicamentos WHERE nombre LIKE ? ORDER BY id DESC LIMIT 1');
        if ($stmtLike) {
            $stmtLike->bind_param('s', $like);
            $stmtLike->execute();
            $medLike = $stmtLike->get_result()->fetch_assoc();
            $stmtLike->close();
            if ($medLike) {
                $estadoLike = strtolower(trim((string)($medLike['estado'] ?? 'activo')));
                if ($estadoLike !== '' && $estadoLike !== 'activo') {
                    return [null, 'medicamento_inactivo'];
                }
                return [$medLike, null];
            }
        }
    }

    return [null, 'medicamento_no_encontrado'];
}

function hc_buscar_cotizacion_editable_por_consulta($conn, $consultaId) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return 0;

    $sql = 'SELECT c.id, LOWER(TRIM(c.estado)) AS estado
            FROM cotizaciones c
            INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = c.id
            WHERE cd.consulta_id = ?
              AND LOWER(TRIM(c.estado)) NOT IN ("anulado", "anulada", "pagado")
            ORDER BY c.id DESC
            LIMIT 1';
    $stmt = $conn->prepare($sql);
    if (!$stmt) return 0;
    $stmt->bind_param('i', $consultaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $estado = strtolower(trim((string)($row['estado'] ?? '')));
    if (!in_array($estado, ['pendiente', 'control', 'informativo'], true)) {
        return 0;
    }
    return (int)($row['id'] ?? 0);
}

function hc_crear_cotizacion_receta_auto($conn, $pacienteId, $usuarioId, $consultaId) {
    $pacienteId = (int)$pacienteId;
    $usuarioId = (int)$usuarioId;
    $consultaId = (int)$consultaId;
    if ($pacienteId <= 0 || $consultaId <= 0) return 0;

    $observaciones = 'Cotizacion automatica de receta desde Historia Clinica. Consulta #' . $consultaId;
    $hasSaldoV2 = hc_column_exists($conn, 'cotizaciones', 'total_pagado') && hc_column_exists($conn, 'cotizaciones', 'saldo_pendiente');

    if ($hasSaldoV2) {
        $stmt = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, total_pagado, saldo_pendiente, estado, observaciones) VALUES (?, ?, 0, 0, 0, "pendiente", ?)');
        if (!$stmt) return 0;
        $stmt->bind_param('iis', $pacienteId, $usuarioId, $observaciones);
    } else {
        $stmt = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (?, ?, 0, "pendiente", ?)');
        if (!$stmt) return 0;
        $stmt->bind_param('iis', $pacienteId, $usuarioId, $observaciones);
    }

    $ok = $stmt->execute();
    $id = $ok ? (int)$stmt->insert_id : 0;
    $stmt->close();

    if ($id > 0 && hc_column_exists($conn, 'cotizaciones', 'numero_comprobante')) {
        $numero = sprintf('Q%06d', $id);
        $stmtNum = $conn->prepare('UPDATE cotizaciones SET numero_comprobante = ? WHERE id = ? LIMIT 1');
        if ($stmtNum) {
            $stmtNum->bind_param('si', $numero, $id);
            $stmtNum->execute();
            $stmtNum->close();
        }
    }

    return $id;
}

function hc_guardar_sync_receta_estado($conn, $consultaId, $hcId, $cotizacionId, $recetaHash, $itemsTotal, $itemsSync, $itemsPend, $estado, $errorMsg = null) {
    if (!hc_table_exists($conn, 'hc_receta_cotizacion_sync')) {
        return;
    }

    $consultaId = (int)$consultaId;
    $hcId = (int)$hcId;
    $cotizacionId = ($cotizacionId > 0) ? (int)$cotizacionId : null;
    $itemsTotal = (int)$itemsTotal;
    $itemsSync = (int)$itemsSync;
    $itemsPend = (int)$itemsPend;
    $estado = trim((string)$estado);
    $recetaHash = trim((string)$recetaHash);
    $errorMsg = $errorMsg !== null ? trim((string)$errorMsg) : null;

    $sql = 'INSERT INTO hc_receta_cotizacion_sync
            (consulta_id, hc_id, cotizacion_id, receta_hash, receta_items_total, items_sincronizados, items_pendientes, estado, ultimo_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                hc_id = VALUES(hc_id),
                cotizacion_id = VALUES(cotizacion_id),
                receta_hash = VALUES(receta_hash),
                receta_items_total = VALUES(receta_items_total),
                items_sincronizados = VALUES(items_sincronizados),
                items_pendientes = VALUES(items_pendientes),
                estado = VALUES(estado),
                ultimo_error = VALUES(ultimo_error),
                updated_at = CURRENT_TIMESTAMP';
    $stmt = $conn->prepare($sql);
    if (!$stmt) return;
    $stmt->bind_param('iiisiiiss', $consultaId, $hcId, $cotizacionId, $recetaHash, $itemsTotal, $itemsSync, $itemsPend, $estado, $errorMsg);
    $stmt->execute();
    $stmt->close();
}

function hc_guardar_receta_items_pendientes($conn, $consultaId, $hcId, $syncId, $pendientes) {
    if (!hc_table_exists($conn, 'hc_receta_cotizacion_items_pendientes')) {
        return;
    }

    $consultaId = (int)$consultaId;
    $hcId = (int)$hcId;
    $syncId = (int)$syncId;

    $stmtDel = $conn->prepare('DELETE FROM hc_receta_cotizacion_items_pendientes WHERE consulta_id = ?');
    if ($stmtDel) {
        $stmtDel->bind_param('i', $consultaId);
        $stmtDel->execute();
        $stmtDel->close();
    }

    if (empty($pendientes)) return;

    $stmtIns = $conn->prepare(
        'INSERT INTO hc_receta_cotizacion_items_pendientes
         (sync_id, consulta_id, hc_id, item_idx, codigo, nombre, motivo, payload_json, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, "pendiente")'
    );
    if (!$stmtIns) return;

    foreach ((array)$pendientes as $p) {
        $itemIdx = (int)($p['item_idx'] ?? 0);
        $codigo = trim((string)($p['codigo'] ?? ''));
        $nombre = trim((string)($p['nombre'] ?? ''));
        $motivo = trim((string)($p['motivo'] ?? 'sin_motivo'));
        $payload = json_encode($p['payload'] ?? [], JSON_UNESCAPED_UNICODE);
        $stmtIns->bind_param('iiiissss', $syncId, $consultaId, $hcId, $itemIdx, $codigo, $nombre, $motivo, $payload);
        $stmtIns->execute();
    }

    $stmtIns->close();
}

function hc_obtener_sync_id_receta($conn, $consultaId) {
    if (!hc_table_exists($conn, 'hc_receta_cotizacion_sync')) {
        return 0;
    }
    $stmt = $conn->prepare('SELECT id FROM hc_receta_cotizacion_sync WHERE consulta_id = ? LIMIT 1');
    if (!$stmt) return 0;
    $stmt->bind_param('i', $consultaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return (int)($row['id'] ?? 0);
}

function hc_sincronizar_receta_a_cotizacion($conn, $consultaId, $hcId, $datos) {
    $consultaId = (int)$consultaId;
    $hcId = (int)$hcId;
    $receta = (is_array($datos) && isset($datos['receta']) && is_array($datos['receta'])) ? $datos['receta'] : [];

    if ($consultaId <= 0) {
        return ['success' => false, 'error' => 'consulta_id_invalido'];
    }

    if (!hc_table_exists($conn, 'hc_receta_cotizacion_sync') || !hc_table_exists($conn, 'hc_receta_cotizacion_items_pendientes')) {
        return [
            'success' => false,
            'error' => 'tablas_sync_no_disponibles',
            'skip' => true,
        ];
    }

    $recetaHash = hc_calcular_hash_receta($receta);
    $itemsTotal = count((array)$receta);

    $stmtCtx = $conn->prepare('SELECT paciente_id, medico_id FROM consultas WHERE id = ? LIMIT 1');
    if (!$stmtCtx) {
        return ['success' => false, 'error' => 'no_se_pudo_resolver_contexto_consulta'];
    }
    $stmtCtx->bind_param('i', $consultaId);
    $stmtCtx->execute();
    $ctx = $stmtCtx->get_result()->fetch_assoc();
    $stmtCtx->close();

    $pacienteId = (int)($ctx['paciente_id'] ?? 0);
    $medicoId = (int)($ctx['medico_id'] ?? 0);
    if ($pacienteId <= 0) {
        return ['success' => false, 'error' => 'paciente_no_valido_para_sincronizacion'];
    }

    $stmtSync = $conn->prepare('SELECT id, cotizacion_id, receta_hash, estado FROM hc_receta_cotizacion_sync WHERE consulta_id = ? LIMIT 1');
    $syncPrev = null;
    if ($stmtSync) {
        $stmtSync->bind_param('i', $consultaId);
        $stmtSync->execute();
        $syncPrev = $stmtSync->get_result()->fetch_assoc();
        $stmtSync->close();
    }

    if ($syncPrev && trim((string)($syncPrev['receta_hash'] ?? '')) === $recetaHash) {
        return [
            'success' => true,
            'cotizacion_id' => (int)($syncPrev['cotizacion_id'] ?? 0),
            'items_total' => $itemsTotal,
            'items_sincronizados' => (int)($syncPrev['items_sincronizados'] ?? 0),
            'items_pendientes' => (int)($syncPrev['items_pendientes'] ?? 0),
            'sin_cambios' => true,
        ];
    }

    // Seguridad: no crear ni resolver cotizacion cuando la receta llega vacia.
    if ($itemsTotal <= 0) {
        $cotizacionPrev = (int)($syncPrev['cotizacion_id'] ?? 0);
        hc_guardar_sync_receta_estado($conn, $consultaId, $hcId, $cotizacionPrev > 0 ? $cotizacionPrev : null, $recetaHash, 0, 0, 0, 'sin_items', null);
        $syncId = hc_obtener_sync_id_receta($conn, $consultaId);
        hc_guardar_receta_items_pendientes($conn, $consultaId, $hcId, $syncId, []);
        return [
            'success' => true,
            'cotizacion_id' => $cotizacionPrev,
            'items_total' => 0,
            'items_sincronizados' => 0,
            'items_pendientes' => 0,
            'estado' => 'sin_items',
            'sin_creacion_cotizacion' => true,
        ];
    }

    $usuarioId = hc_resolver_actor_usuario_id();

    $conn->begin_transaction();
    try {
        $cotizacionPreviaId = (int)($syncPrev['cotizacion_id'] ?? 0);
        $cotizacionId = (int)($syncPrev['cotizacion_id'] ?? 0);
        if ($cotizacionId > 0) {
            $stmtCotEstado = $conn->prepare('SELECT LOWER(TRIM(estado)) AS estado FROM cotizaciones WHERE id = ? LIMIT 1');
            if ($stmtCotEstado) {
                $stmtCotEstado->bind_param('i', $cotizacionId);
                $stmtCotEstado->execute();
                $rowEstado = $stmtCotEstado->get_result()->fetch_assoc();
                $stmtCotEstado->close();
                $estadoCot = strtolower(trim((string)($rowEstado['estado'] ?? '')));
                if (!in_array($estadoCot, ['pendiente', 'control', 'informativo'], true)) {
                    $cotizacionId = 0;
                }
            }
        }

        if ($cotizacionId <= 0) {
            $candidatoId = hc_buscar_cotizacion_editable_por_consulta($conn, $consultaId);
            // Solo reutilizar esa cotización si NO tiene ítems de otro tipo (ej. ecografía, laboratorio).
            // Si tiene ítems no-farmacia, crear una cotización nueva exclusiva para la receta.
            if ($candidatoId > 0) {
                $stmtChk = $conn->prepare(
                    "SELECT COUNT(*) AS cnt FROM cotizaciones_detalle
                     WHERE cotizacion_id = ?
                       AND LOWER(TRIM(servicio_tipo)) <> 'farmacia'"
                );
                if ($stmtChk) {
                    $stmtChk->bind_param('i', $candidatoId);
                    $stmtChk->execute();
                    $rowChk = $stmtChk->get_result()->fetch_assoc();
                    $stmtChk->close();
                    if ((int)($rowChk['cnt'] ?? 0) === 0) {
                        $cotizacionId = $candidatoId;
                    }
                    // Si tiene ítems no-farmacia, $cotizacionId sigue en 0 → se creará una nueva
                }
            }
        }
        if ($cotizacionId <= 0) {
            $cotizacionId = hc_crear_cotizacion_receta_auto($conn, $pacienteId, $usuarioId, $consultaId);
        }
        if ($cotizacionId <= 0) {
            throw new Exception('no_se_pudo_crear_o_resolver_cotizacion');
        }

        $cotizacionCambio = ($cotizacionPreviaId > 0 && $cotizacionId > 0 && $cotizacionPreviaId !== $cotizacionId);
        $mapaEstadoItems = hc_cargar_mapa_estado_items_receta($conn, $consultaId);

        $hasMotivoColForDelete = hc_column_exists($conn, 'cotizaciones_detalle', 'motivo_edicion');
        $hasEstadoItemForDelete = hc_column_exists($conn, 'cotizaciones_detalle', 'estado_item');

        // Si el Químico ya confirmó los ítems (existen farmacia activos con motivo != RECETA_HC_AUTO),
        // no sobreescribir con nuevos RECETA_HC_AUTO para evitar duplicar el total.
        $modoProtegido = false; // solo agregar nuevos, sin borrar los que editó el cotizador/químico
        if ($hasMotivoColForDelete && $hasEstadoItemForDelete) {
            $stmtChkQuimico = $conn->prepare(
                "SELECT COUNT(*) AS cnt FROM cotizaciones_detalle
                 WHERE cotizacion_id = ? AND estado_item <> 'eliminado'
                   AND LOWER(TRIM(servicio_tipo)) = 'farmacia'
                   AND motivo_edicion <> 'RECETA_HC_AUTO'"
            );
            if ($stmtChkQuimico) {
                $stmtChkQuimico->bind_param('i', $cotizacionId);
                $stmtChkQuimico->execute();
                $rowChkQ = $stmtChkQuimico->get_result()->fetch_assoc();
                $stmtChkQuimico->close();
                if ((int)($rowChkQ['cnt'] ?? 0) > 0) {
                    // Cotizador/Químico ya editó ítems: entrar en modo protegido.
                    // Solo se agregan medicamentos nuevos (que no existan ya en la cotización),
                    // sin tocar ni borrar los que ya editó el cotizador.
                    $modoProtegido = true;
                }
            }
        }

        $hasConsultaId = hc_column_exists($conn, 'cotizaciones_detalle', 'consulta_id');
        $hasMedicoId = hc_column_exists($conn, 'cotizaciones_detalle', 'medico_id');
        $hasEstadoItem = hc_column_exists($conn, 'cotizaciones_detalle', 'estado_item');
        $hasVersionItem = hc_column_exists($conn, 'cotizaciones_detalle', 'version_item');
        $hasEditadoPor = hc_column_exists($conn, 'cotizaciones_detalle', 'editado_por');
        $hasEditadoEn = hc_column_exists($conn, 'cotizaciones_detalle', 'editado_en');
        $hasMotivo = hc_column_exists($conn, 'cotizaciones_detalle', 'motivo_edicion');
        $hasEsExterno = hc_column_exists($conn, 'cotizaciones_detalle', 'es_externo');
        $hasIncluirEnCobro = hc_column_exists($conn, 'cotizaciones_detalle', 'incluir_en_cobro');
        $hasNombreExterno = hc_column_exists($conn, 'cotizaciones_detalle', 'nombre_externo');
        $hasMotivoExterno = hc_column_exists($conn, 'cotizaciones_detalle', 'motivo_externo');

        $pendientes = [];
        $itemsMapeados = [];
        $sincronizados = 0;
        $omitidos = 0;

        foreach ((array)$receta as $idx => $item) {
            if (!is_array($item)) continue;

            [$med, $motivoNoMap] = hc_resolver_medicamento_desde_receta($conn, $item);
            if (!$med) {
                $codigoItem = trim((string)($item['codigo'] ?? ''));
                $nombreItem = trim((string)($item['nombre'] ?? ($item['medicamento'] ?? '')));
                $esManualExterno = !empty($item['manual']) || stripos($codigoItem, 'MANUAL-') === 0;
                if ($esManualExterno && ($hasEsExterno || $hasIncluirEnCobro || $hasNombreExterno || $hasMotivoExterno)) {
                    $cantidadExt = hc_calcular_cantidad_desde_receta($item);
                    $descripcionExt = $nombreItem !== '' ? $nombreItem : 'Medicamento externo';
                    $itemKeyExt = strtolower('0|' . $descripcionExt . '|' . $cantidadExt . '|' . number_format(0, 4, '.', ''));
                    $fingerprintExt = hc_fingerprint_item_receta($item, 0);

                    $itemsMapeados[] = [
                        'idx' => (int)$idx,
                        'item' => $item,
                        'codigo' => $codigoItem,
                        'nombre' => $descripcionExt,
                        'med_id' => 0,
                        'precio' => 0,
                        'cantidad' => $cantidadExt,
                        'subtotal' => 0,
                        'descripcion' => $descripcionExt,
                        'item_key' => $itemKeyExt,
                        'fingerprint' => $fingerprintExt,
                        'es_externo' => 1,
                        'incluir_en_cobro' => 0,
                        'nombre_externo' => $descripcionExt,
                        'motivo_externo' => $motivoNoMap ?: 'item_manual_sin_catalogo',
                    ];

                    hc_guardar_estado_item_receta(
                        $conn,
                        $consultaId,
                        $hcId,
                        $cotizacionId,
                        $fingerprintExt,
                        $codigoItem,
                        $descripcionExt,
                        $cantidadExt,
                        'sincronizado_auto',
                        'insertado_externo',
                        $item
                    );
                    continue;
                }

                $pendientes[] = [
                    'item_idx' => (int)$idx,
                    'codigo' => $codigoItem,
                    'nombre' => $nombreItem,
                    'motivo' => $motivoNoMap ?: 'no_mapeado',
                    'payload' => $item,
                ];
                $fpPend = hc_fingerprint_item_receta($item, 0);
                hc_guardar_estado_item_receta(
                    $conn,
                    $consultaId,
                    $hcId,
                    $cotizacionId,
                    $fpPend,
                    $codigoItem,
                    $nombreItem,
                    1,
                    'pendiente_sync',
                    $motivoNoMap ?: 'no_mapeado',
                    $item
                );
                continue;
            }

            $medId = (int)($med['id'] ?? 0);
            if ($medId <= 0) {
                $pendientes[] = [
                    'item_idx' => (int)$idx,
                    'codigo' => trim((string)($item['codigo'] ?? '')),
                    'nombre' => trim((string)($item['nombre'] ?? ($item['medicamento'] ?? ''))),
                    'motivo' => 'medicamento_id_invalido',
                    'payload' => $item,
                ];
                $fpPend = hc_fingerprint_item_receta($item, 0);
                hc_guardar_estado_item_receta(
                    $conn,
                    $consultaId,
                    $hcId,
                    $cotizacionId,
                    $fpPend,
                    trim((string)($item['codigo'] ?? '')),
                    trim((string)($item['nombre'] ?? ($item['medicamento'] ?? ''))),
                    1,
                    'pendiente_sync',
                    'medicamento_id_invalido',
                    $item
                );
                continue;
            }

            $precio = hc_resolver_precio_medicamento($med);
            $cantidad = hc_calcular_cantidad_desde_receta($item);
            $subtotal = round($precio * $cantidad, 2);

            $nombreMed = trim((string)($med['nombre'] ?? ($item['nombre'] ?? 'Medicamento')));
            $codigoMed = trim((string)($med['codigo'] ?? ''));
            $descripcion = $nombreMed . ($codigoMed !== '' ? ' (' . $codigoMed . ')' : '');

            $itemKey = strtolower($medId . '|' . $descripcion . '|' . $cantidad . '|' . number_format((float)$precio, 4, '.', ''));
            $fingerprint = hc_fingerprint_item_receta($item, $medId);

            $itemsMapeados[] = [
                'idx' => (int)$idx,
                'item' => $item,
                'codigo' => $codigoMed,
                'nombre' => $nombreMed,
                'med_id' => $medId,
                'precio' => $precio,
                'cantidad' => $cantidad,
                'subtotal' => $subtotal,
                'descripcion' => $descripcion,
                'item_key' => $itemKey,
                'fingerprint' => $fingerprint,
                'es_externo' => 0,
                'incluir_en_cobro' => 1,
                'nombre_externo' => '',
                'motivo_externo' => '',
            ];
        }

        $autoExistentesByKey = [];
        $autoExistentesporMedId = []; // para modo protegido: evitar duplicados por servicio_id
        if ($hasMotivo) {
            $whereEstadoAuto = $hasEstadoItem ? " AND estado_item <> 'eliminado'" : '';
            // En modo protegido cargamos TODOS los ítems activos de farmacia (incluyendo
            // los editados por el cotizador) para evitar duplicados al insertar nuevos.
            // En modo normal solo cargamos los RECETA_HC_AUTO para poder borrar obsoletos.
            $filtroMotivoAuto = $modoProtegido ? '' : " AND motivo_edicion = 'RECETA_HC_AUTO'";
            $stmtAutoExist = $conn->prepare(
                "SELECT id, servicio_id, descripcion, cantidad, precio_unitario
                 FROM cotizaciones_detalle
                 WHERE cotizacion_id = ?
                   AND LOWER(TRIM(servicio_tipo)) = 'farmacia'{$filtroMotivoAuto}{$whereEstadoAuto}"
            );
            if ($stmtAutoExist) {
                $stmtAutoExist->bind_param('i', $cotizacionId);
                $stmtAutoExist->execute();
                $resAuto = $stmtAutoExist->get_result();
                while ($rowAuto = $resAuto->fetch_assoc()) {
                    $keyAuto = strtolower(
                        (int)($rowAuto['servicio_id'] ?? 0)
                        . '|' . trim((string)($rowAuto['descripcion'] ?? ''))
                        . '|' . (int)($rowAuto['cantidad'] ?? 0)
                        . '|' . number_format((float)($rowAuto['precio_unitario'] ?? 0), 4, '.', '')
                    );
                    $autoExistentesByKey[$keyAuto] = [
                        'id' => (int)($rowAuto['id'] ?? 0),
                    ];
                    // En modo protegido también indexamos por servicio_id para detectar
                    // el mismo medicamento aunque la descripción difiera (ej: (MED042) vs (Unidad))
                    if ($modoProtegido) {
                        $medIdExist = (int)($rowAuto['servicio_id'] ?? 0);
                        if ($medIdExist > 0) {
                            $autoExistentesporMedId[$medIdExist] = true;
                        }
                    }
                }
                $stmtAutoExist->close();
            }

            $desiredKeys = [];
            foreach ($itemsMapeados as $m) {
                $desiredKeys[$m['item_key']] = true;
            }

            $stmtDelObsoleto = $conn->prepare('DELETE FROM cotizaciones_detalle WHERE id = ? LIMIT 1');
            // En modo protegido no se borra nada: solo se agregan ítems nuevos sin tocar los existentes.
            if ($stmtDelObsoleto && !$modoProtegido) {
                foreach ($autoExistentesByKey as $keyAuto => $rowAuto) {
                    if (!isset($desiredKeys[$keyAuto])) {
                        $idAuto = (int)($rowAuto['id'] ?? 0);
                        if ($idAuto > 0) {
                            $stmtDelObsoleto->bind_param('i', $idAuto);
                            $stmtDelObsoleto->execute();
                        }
                    }
                }
                $stmtDelObsoleto->close();
            }
        } elseif ($hasMotivoColForDelete) {
            // Compatibilidad legado: sin columna motivo_edicion, mantener comportamiento de limpieza total.
            $stmtDelAuto = $conn->prepare('DELETE FROM cotizaciones_detalle WHERE cotizacion_id = ? AND motivo_edicion = "RECETA_HC_AUTO"');
            if ($stmtDelAuto) {
                $stmtDelAuto->bind_param('i', $cotizacionId);
                $stmtDelAuto->execute();
                $stmtDelAuto->close();
            }
        } else {
            $stmtDelAuto = $conn->prepare('DELETE FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = "farmacia"');
            if ($stmtDelAuto) {
                $stmtDelAuto->bind_param('i', $cotizacionId);
                $stmtDelAuto->execute();
                $stmtDelAuto->close();
            }
        }

        foreach ($itemsMapeados as $m) {
            if ($hasMotivo && (isset($autoExistentesByKey[$m['item_key']]) || ($modoProtegido && isset($autoExistentesporMedId[$m['med_id']])))) {
                $sincronizados++;
                hc_guardar_estado_item_receta(
                    $conn,
                    $consultaId,
                    $hcId,
                    $cotizacionId,
                    $m['fingerprint'],
                    $m['codigo'],
                    $m['nombre'],
                    $m['cantidad'],
                    'sincronizado_auto',
                    'ya_existente_auto',
                    $m['item']
                );
                continue;
            }

            $estadoPrevio = strtolower(trim((string)($mapaEstadoItems[$m['fingerprint']]['estado'] ?? '')));
            if (
                $cotizacionCambio
                && in_array($estadoPrevio, ['confirmado_quimico', 'dispensado'], true)
            ) {
                $omitidos++;
                hc_guardar_estado_item_receta(
                    $conn,
                    $consultaId,
                    $hcId,
                    $cotizacionId,
                    $m['fingerprint'],
                    $m['codigo'],
                    $m['nombre'],
                    $m['cantidad'],
                    $estadoPrevio,
                    'omitido_por_ya_procesado',
                    $m['item']
                );
                continue;
            }

            $cols = ['cotizacion_id', 'servicio_tipo', 'servicio_id', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal'];
            $vals = ['?', '?', '?', '?', '?', '?', '?'];
            $types = 'isisidd';
            $params = [$cotizacionId, 'farmacia', $m['med_id'], $m['descripcion'], $m['cantidad'], $m['precio'], $m['subtotal']];

            if ($hasEstadoItem) {
                $cols[] = 'estado_item';
                $vals[] = '?';
                $types .= 's';
                $params[] = 'activo';
            }
            if ($hasVersionItem) {
                $cols[] = 'version_item';
                $vals[] = '?';
                $types .= 'i';
                $params[] = 1;
            }
            if ($hasEditadoPor) {
                $cols[] = 'editado_por';
                $vals[] = '?';
                $types .= 'i';
                $params[] = $usuarioId;
            }
            if ($hasEditadoEn) {
                $cols[] = 'editado_en';
                $vals[] = 'NOW()';
            }
            if ($hasMotivo) {
                $cols[] = 'motivo_edicion';
                $vals[] = '?';
                $types .= 's';
                $params[] = 'RECETA_HC_AUTO';
            }
            if ($hasEsExterno) {
                $cols[] = 'es_externo';
                $vals[] = '?';
                $types .= 'i';
                $params[] = (int)($m['es_externo'] ?? 0);
            }
            if ($hasIncluirEnCobro) {
                $cols[] = 'incluir_en_cobro';
                $vals[] = '?';
                $types .= 'i';
                $params[] = (int)($m['incluir_en_cobro'] ?? 1);
            }
            if ($hasNombreExterno) {
                $cols[] = 'nombre_externo';
                $vals[] = '?';
                $types .= 's';
                $params[] = trim((string)($m['nombre_externo'] ?? ''));
            }
            if ($hasMotivoExterno) {
                $cols[] = 'motivo_externo';
                $vals[] = '?';
                $types .= 's';
                $params[] = trim((string)($m['motivo_externo'] ?? ''));
            }
            if ($hasConsultaId) {
                $cols[] = 'consulta_id';
                $vals[] = '?';
                $types .= 'i';
                $params[] = $consultaId;
            }
            if ($hasMedicoId && $medicoId > 0) {
                $cols[] = 'medico_id';
                $vals[] = '?';
                $types .= 'i';
                $params[] = $medicoId;
            }

            $sqlIns = 'INSERT INTO cotizaciones_detalle (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
            $stmtIns = $conn->prepare($sqlIns);
            if (!$stmtIns) {
                throw new Exception('no_se_pudo_preparar_detalle_farmacia_auto');
            }
            $stmtIns->bind_param($types, ...$params);
            if (!$stmtIns->execute()) {
                $stmtIns->close();
                throw new Exception('no_se_pudo_insertar_detalle_farmacia_auto');
            }
            $stmtIns->close();

            if ($hasMotivo) {
                $autoExistentesByKey[$m['item_key']] = ['id' => 0];
            }

            hc_guardar_estado_item_receta(
                $conn,
                $consultaId,
                $hcId,
                $cotizacionId,
                $m['fingerprint'],
                $m['codigo'],
                $m['nombre'],
                $m['cantidad'],
                'sincronizado_auto',
                'insertado_auto',
                $m['item']
            );

            $sincronizados++;
        }

        $whereEstado = hc_column_exists($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND estado_item <> 'eliminado'"
            : '';
        $whereCobro = $hasIncluirEnCobro ? " AND incluir_en_cobro = 1" : '';
        $stmtTot = $conn->prepare('SELECT COALESCE(SUM(subtotal), 0) AS total FROM cotizaciones_detalle WHERE cotizacion_id = ?' . $whereEstado . $whereCobro);
        $totalCot = 0.0;
        if ($stmtTot) {
            $stmtTot->bind_param('i', $cotizacionId);
            $stmtTot->execute();
            $rowTot = $stmtTot->get_result()->fetch_assoc();
            $totalCot = (float)($rowTot['total'] ?? 0);
            $stmtTot->close();
        }

        $externosActivos = 0;
        if ($hasEsExterno) {
            $stmtExt = $conn->prepare('SELECT COUNT(*) AS cnt FROM cotizaciones_detalle WHERE cotizacion_id = ? AND es_externo = 1' . $whereEstado);
            if ($stmtExt) {
                $stmtExt->bind_param('i', $cotizacionId);
                $stmtExt->execute();
                $rowExt = $stmtExt->get_result()->fetch_assoc();
                $externosActivos = (int)($rowExt['cnt'] ?? 0);
                $stmtExt->close();
            }
        }

        $hasSaldoV2 = hc_column_exists($conn, 'cotizaciones', 'total_pagado') && hc_column_exists($conn, 'cotizaciones', 'saldo_pendiente');
        if ($hasSaldoV2) {
            $stmtGetPagado = $conn->prepare('SELECT COALESCE(total_pagado, 0) AS total_pagado FROM cotizaciones WHERE id = ? LIMIT 1');
            $totalPagado = 0.0;
            if ($stmtGetPagado) {
                $stmtGetPagado->bind_param('i', $cotizacionId);
                $stmtGetPagado->execute();
                $rowPag = $stmtGetPagado->get_result()->fetch_assoc();
                $stmtGetPagado->close();
                $totalPagado = (float)($rowPag['total_pagado'] ?? 0);
            }
            $saldo = max(0.0, round($totalCot - $totalPagado, 2));
            if ($totalCot <= 0.00001 && $totalPagado <= 0.00001) {
                $estadoCot = 'informativo';
                $saldo = 0.0;
            } else {
                $estadoCot = ($saldo <= 0.00001)
                    ? 'pagado'
                    : (($totalPagado > 0.00001) ? 'parcial' : 'pendiente');
            }

            $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ? WHERE id = ? LIMIT 1');
            if ($stmtUpdCot) {
                $stmtUpdCot->bind_param('ddsi', $totalCot, $saldo, $estadoCot, $cotizacionId);
                $stmtUpdCot->execute();
                $stmtUpdCot->close();
            }
        } else {
            if ($totalCot <= 0.00001) {
                $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ?, estado = ? WHERE id = ? LIMIT 1');
                if ($stmtUpdCot) {
                    $estadoCot = 'informativo';
                    $stmtUpdCot->bind_param('dsi', $totalCot, $estadoCot, $cotizacionId);
                    $stmtUpdCot->execute();
                    $stmtUpdCot->close();
                }
            } else {
                $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ? WHERE id = ? LIMIT 1');
                if ($stmtUpdCot) {
                    $stmtUpdCot->bind_param('di', $totalCot, $cotizacionId);
                    $stmtUpdCot->execute();
                    $stmtUpdCot->close();
                }
            }
        }

        $estadoSync = empty($pendientes) ? 'ok' : (($sincronizados > 0) ? 'parcial' : 'pendiente_mapeo');
        hc_guardar_sync_receta_estado($conn, $consultaId, $hcId, $cotizacionId, $recetaHash, $itemsTotal, $sincronizados, count($pendientes), $estadoSync, null);
        $syncId = hc_obtener_sync_id_receta($conn, $consultaId);
        hc_guardar_receta_items_pendientes($conn, $consultaId, $hcId, $syncId, $pendientes);

        $conn->commit();

        return [
            'success' => true,
            'cotizacion_id' => $cotizacionId,
            'items_total' => $itemsTotal,
            'items_sincronizados' => $sincronizados,
            'items_pendientes' => count($pendientes),
            'items_omitidos' => $omitidos,
            'estado' => $estadoSync,
        ];
    } catch (Throwable $e) {

        $conn->rollback();
        $msg = $e->getMessage();
        try {
            hc_guardar_sync_receta_estado($conn, $consultaId, $hcId, null, $recetaHash, $itemsTotal, 0, $itemsTotal, 'error', $msg);
        } catch (Throwable $ignored) {
            // no bloquear el retorno por un fallo en el log del error
        }
        return [
            'success' => false,
            'error' => $msg,
        ];
    }
}

function hc_estado_proxima_cita($conn) {
    $valorDeseado = 'falta_cancelar';

    $stmt = $conn->prepare('SELECT data_type, column_type, character_maximum_length FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return 'pendiente';
    }

    $tabla = 'consultas';
    $columna = 'estado';
    $stmt->bind_param('ss', $tabla, $columna);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return 'pendiente';
    }

    $dataType = strtolower((string)($row['data_type'] ?? ''));
    $columnType = strtolower((string)($row['column_type'] ?? ''));
    $maxLen = isset($row['character_maximum_length']) ? (int)$row['character_maximum_length'] : 0;

    if ($dataType === 'enum' && strpos($columnType, "'" . $valorDeseado . "'") === false) {
        return 'pendiente';
    }

    if (($dataType === 'varchar' || $dataType === 'char') && $maxLen > 0 && strlen($valorDeseado) > $maxLen) {
        return 'pendiente';
    }

    if ($dataType !== 'enum' && $dataType !== 'varchar' && $dataType !== 'char') {
        return 'pendiente';
    }

    return $valorDeseado;
}

function hc_ensure_consultas_estado_falta_cancelar($conn) {
    $res = $conn->query("SHOW COLUMNS FROM consultas LIKE 'estado'");
    if (!$res || $res->num_rows === 0) {
        return;
    }

    $row = $res->fetch_assoc();
    $type = strtolower((string)($row['Type'] ?? ''));
    if (strpos($type, 'enum(') !== 0) {
        return;
    }

    if (strpos($type, "'falta_cancelar'") !== false) {
        return;
    }

    $sql = "ALTER TABLE consultas MODIFY COLUMN estado ENUM('pendiente','falta_cancelar','completada','cancelada') DEFAULT 'pendiente'";
    $conn->query($sql);
}

function hc_ensure_consultas_hc_origen_column($conn) {
    $exists = $conn->query("SHOW COLUMNS FROM consultas LIKE 'hc_origen_id'");
    if ($exists && $exists->num_rows === 0) {
        $conn->query("ALTER TABLE consultas ADD COLUMN hc_origen_id INT NULL COMMENT 'ID de la Historia Clínica origen si vino de próxima cita'");
        $conn->query('ALTER TABLE consultas ADD INDEX idx_hc_origen (hc_origen_id)');
    }
}

function hc_ensure_consultas_origen_creacion_column($conn) {
    $exists = $conn->query("SHOW COLUMNS FROM consultas LIKE 'origen_creacion'");
    if ($exists && $exists->num_rows === 0) {
        $conn->query("ALTER TABLE consultas ADD COLUMN origen_creacion VARCHAR(20) NOT NULL DEFAULT 'agendada' COMMENT 'Origen del flujo: agendada|cotizador|hc_proxima'");
        $conn->query('ALTER TABLE consultas ADD INDEX idx_origen_creacion (origen_creacion)');
    }

    $conn->query(
        "UPDATE consultas c
         SET c.origen_creacion = CASE
             WHEN c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0 THEN 'hc_proxima'
             WHEN EXISTS (
                 SELECT 1 FROM cotizaciones_detalle cd
                 INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                 WHERE cd.consulta_id = c.id AND ct.estado <> 'anulado'
                 LIMIT 1
             ) THEN 'cotizador'
             ELSE 'agendada'
         END
         WHERE c.origen_creacion IS NULL
            OR TRIM(c.origen_creacion) = ''
            OR c.origen_creacion NOT IN ('agendada', 'cotizador', 'hc_proxima')"
    );

    // Compatibilidad histórica: normalizar hc_origen_id legado cuando fue guardado como consulta_id.
    // Si hc_origen_id no existe como historia_clinica.id pero sí coincide con historia_clinica.consulta_id,
    // se reemplaza por el id real de historia_clinica.
    $conn->query(
        "UPDATE consultas c
         LEFT JOIN historia_clinica h_by_id ON h_by_id.id = c.hc_origen_id
         LEFT JOIN historia_clinica h_by_consulta ON h_by_consulta.consulta_id = c.hc_origen_id
         SET c.hc_origen_id = h_by_consulta.id
         WHERE c.hc_origen_id IS NOT NULL
           AND c.hc_origen_id > 0
           AND h_by_id.id IS NULL
           AND h_by_consulta.id IS NOT NULL"
    );
}

function hc_ensure_consultas_es_control_column($conn) {
    $exists = $conn->query("SHOW COLUMNS FROM consultas LIKE 'es_control'");
    if ($exists && $exists->num_rows === 0) {
        $conn->query("ALTER TABLE consultas ADD COLUMN es_control TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = cita de control sin costo'");
        $conn->query('ALTER TABLE consultas ADD INDEX idx_es_control (es_control)');
    }
}

function hc_consultas_has_es_control_column($conn) {
    $exists = $conn->query("SHOW COLUMNS FROM consultas LIKE 'es_control'");
    return $exists && $exists->num_rows > 0;
}

function hc_programar_proxima_cita($conn, $consultaIdActual, $proximaData, $hcOrigenIdActual = 0) {
    if (!is_array($proximaData)) {
        return null;
    }

    $programar = (bool)($proximaData['programar'] ?? false);
    if (!$programar) {
        return null;
    }

    hc_ensure_consultas_hc_origen_column($conn);
    hc_ensure_consultas_estado_falta_cancelar($conn);
    hc_ensure_consultas_origen_creacion_column($conn);
    hc_ensure_consultas_es_control_column($conn);
    $hasEsControlColumn = hc_consultas_has_es_control_column($conn);

    $fecha = trim((string)($proximaData['fecha'] ?? ''));
    $hora = hc_normalizar_hora($proximaData['hora'] ?? '');
    if ($fecha === '' || $hora === '') {
        throw new Exception('La próxima cita requiere fecha y hora');
    }

    $stmtBase = $conn->prepare('SELECT paciente_id, medico_id FROM consultas WHERE id = ? LIMIT 1');
    if (!$stmtBase) {
        throw new Exception('No se pudo preparar la validación de consulta base');
    }
    $stmtBase->bind_param('i', $consultaIdActual);
    $stmtBase->execute();
    $base = $stmtBase->get_result()->fetch_assoc();
    $stmtBase->close();

    if (!$base) {
        throw new Exception('No se encontró la consulta actual para programar la próxima cita');
    }

    $pacienteId = (int)($base['paciente_id'] ?? 0);
    $medicoIdDefault = (int)($base['medico_id'] ?? 0);
    $medicoId = (int)($proximaData['medico_id'] ?? $medicoIdDefault);
    if ($medicoId <= 0) {
        $medicoId = $medicoIdDefault;
    }

    $tipoConsulta = trim((string)($proximaData['tipo_consulta'] ?? 'programada'));
    if ($tipoConsulta === '') {
        $tipoConsulta = 'programada';
    }

    $consultaProgramadaId = (int)($proximaData['consulta_id'] ?? 0);
    $hcOrigenIdActual = (int)$hcOrigenIdActual;
    if ($hcOrigenIdActual <= 0) {
        // Fallback defensivo: si no llega explícito, intentar resolver por consulta actual.
        $stmtHc = $conn->prepare('SELECT id FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
        if ($stmtHc) {
            $stmtHc->bind_param('i', $consultaIdActual);
            $stmtHc->execute();
            $rowHc = $stmtHc->get_result()->fetch_assoc();
            $stmtHc->close();
            $hcOrigenIdActual = (int)($rowHc['id'] ?? 0);
        }
    }
    // Usar estado de cobro solo si el esquema lo soporta (evita "Data truncated for column estado").
    $estadoFaltaCancelar = hc_estado_proxima_cita($conn);
    $esControl = !empty($proximaData['es_control']) ? 1 : 0;
    $estadoProgramado = $esControl === 1 ? 'pendiente' : $estadoFaltaCancelar;
    
    if ($consultaProgramadaId > 0) {
        $stmtUpd = $hasEsControlColumn
            ? $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ?, hc_origen_id = ?, origen_creacion = ?, es_control = ? WHERE id = ? LIMIT 1')
            : $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ?, hc_origen_id = ?, origen_creacion = ? WHERE id = ? LIMIT 1');
        if (!$stmtUpd) {
            throw new Exception('No se pudo preparar la actualización de próxima cita');
        }
        $hcOrigenId = $hcOrigenIdActual;
        $origenCreacion = 'hc_proxima';
        if ($hasEsControlColumn) {
            $stmtUpd->bind_param('iissssisii', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $esControl, $consultaProgramadaId);
        } else {
            $stmtUpd->bind_param('iissssisi', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $consultaProgramadaId);
        }
        $stmtUpd->execute();
        $stmtUpd->close();
    } else {
        $stmtFind = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? AND fecha = ? AND hora = ? AND estado IN ("pendiente", "falta_cancelar") LIMIT 1');
        if (!$stmtFind) {
            throw new Exception('No se pudo preparar la búsqueda de próxima cita existente');
        }
        $stmtFind->bind_param('iiss', $pacienteId, $medicoId, $fecha, $hora);
        $stmtFind->execute();
        $found = $stmtFind->get_result()->fetch_assoc();
        $stmtFind->close();

        if ($found) {
            $consultaProgramadaId = (int)($found['id'] ?? 0);

            $stmtUpdFound = $hasEsControlColumn
                ? $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ?, hc_origen_id = ?, origen_creacion = ?, es_control = ? WHERE id = ? LIMIT 1')
                : $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ?, hc_origen_id = ?, origen_creacion = ? WHERE id = ? LIMIT 1');
            if (!$stmtUpdFound) {
                throw new Exception('No se pudo preparar la actualización de próxima cita existente');
            }
            $hcOrigenId = $hcOrigenIdActual;
            $origenCreacion = 'hc_proxima';
            if ($hasEsControlColumn) {
                $stmtUpdFound->bind_param('iissssisii', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $esControl, $consultaProgramadaId);
            } else {
                $stmtUpdFound->bind_param('iissssisi', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $consultaProgramadaId);
            }
            $stmtUpdFound->execute();
            $stmtUpdFound->close();
        } else {
            // NUEVO: Insertar con estado='falta_cancelar' y hc_origen_id
            $stmtIns = $hasEsControlColumn
                ? $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado, hc_origen_id, origen_creacion, es_control) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                : $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado, hc_origen_id, origen_creacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            if (!$stmtIns) {
                throw new Exception('No se pudo preparar la creación de próxima cita');
            }
            $hcOrigenId = $hcOrigenIdActual;
            $origenCreacion = 'hc_proxima';
            if ($hasEsControlColumn) {
                $stmtIns->bind_param('iissssisi', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $esControl);
            } else {
                $stmtIns->bind_param('iissssis', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion);
            }
            $okIns = $stmtIns->execute();
            $consultaProgramadaId = $okIns ? (int)$stmtIns->insert_id : 0;
            $stmtIns->close();
            if (!$okIns || $consultaProgramadaId <= 0) {
                throw new Exception('No se pudo registrar la próxima cita');
            }
        }
    }

    $cotizacionControl = null;
    if ($esControl === 1 && $consultaProgramadaId > 0) {
        $cotizacionControl = hc_asegurar_cotizacion_control($conn, $pacienteId, $medicoId, $consultaProgramadaId);
    }
    
    return [
        'consulta_id' => $consultaProgramadaId,
        'fecha' => $fecha,
        'hora' => $hora,
        'medico_id' => $medicoId,
        'tipo_consulta' => $tipoConsulta,
        'estado' => $estadoProgramado,
        'es_control' => $esControl,
        'cotizacion_control' => $cotizacionControl,
        'hc_origen_id' => $hcOrigenIdActual,
    ];
}

// ============================================================
// CADENA CLINICA: resolver nodo padre canonico
// ============================================================

/**
 * Dado el hc_id de la HC recien guardada (nodo actual), resuelve:
 * - hc_parent_id: ultima HC ejecutada del mismo contrato/agenda o por hc_origen_id
 * - hc_root_id:   raiz de la cadena
 * - chain_depth:  profundidad del nodo
 * - contrato_paciente_id / agenda_contrato_id: contexto contrato si aplica
 *
 * No lanza excepciones; si algo falla devuelve null para no interrumpir el guardado.
 */
function hc_resolver_parent_canonico($conn, $hcId, $consultaId) {
    $hcId      = (int)$hcId;
    $consultaId = (int)$consultaId;
    if ($hcId <= 0 || $consultaId <= 0) return null;

    // 1. Leer contexto de la consulta actual
    $stmtC = $conn->prepare(
        'SELECT paciente_id, medico_id, fecha, hc_origen_id FROM consultas WHERE id = ? LIMIT 1'
    );
    if (!$stmtC) return null;
    $stmtC->bind_param('i', $consultaId);
    $stmtC->execute();
    $consulta = $stmtC->get_result()->fetch_assoc();
    $stmtC->close();
    if (!$consulta) return null;

    $pacienteId  = (int)($consulta['paciente_id'] ?? 0);
    $hcOrigenId  = (int)($consulta['hc_origen_id'] ?? 0);
    $medicoIdActual = (int)($consulta['medico_id'] ?? 0);
    $fechaActual = (string)($consulta['fecha'] ?? '');
    $horaActual = (string)($consulta['hora'] ?? '00:00:00');
    if ($horaActual === '') {
        $horaActual = '00:00:00';
    }

    // 2. Intentar vincular con agenda_contrato (evento ejecutado en esta consulta)
    $contratoPacienteId  = 0;
    $agendaContratoId    = 0;
    $stmtAg = $conn->prepare(
        'SELECT id, contrato_paciente_id FROM agenda_contrato WHERE consulta_id = ? LIMIT 1'
    );
    if ($stmtAg) {
        $stmtAg->bind_param('i', $consultaId);
        $stmtAg->execute();
        $ag = $stmtAg->get_result()->fetch_assoc();
        $stmtAg->close();
        if ($ag) {
            $agendaContratoId   = (int)($ag['id'] ?? 0);
            $contratoPacienteId = (int)($ag['contrato_paciente_id'] ?? 0);
        }
    }

    // 3. Resolver parent
    $parentHcId = 0;

    // 3a. Si viene de proxima cita de HC anterior, hc_origen_id puede existir en dos formatos
    // históricos: historia_clinica.id (actual) o consultas.id (legacy). Resolver ambos de forma
    // determinista y filtrando por el mismo paciente para evitar enlaces cruzados incorrectos.
    if ($hcOrigenId > 0) {
        $stmtP = $conn->prepare(
            'SELECT h.id,
                    CASE WHEN h.id = ? THEN 1 ELSE 2 END AS prioridad
             FROM historia_clinica h
             INNER JOIN consultas c ON c.id = h.consulta_id
             WHERE c.paciente_id = ?
               AND (h.id = ? OR h.consulta_id = ?)
             ORDER BY prioridad ASC, h.id DESC
             LIMIT 1'
        );
        if ($stmtP) {
            $stmtP->bind_param('iiii', $hcOrigenId, $pacienteId, $hcOrigenId, $hcOrigenId);
            $stmtP->execute();
            $rP = $stmtP->get_result()->fetch_assoc();
            $stmtP->close();
            $candidato = (int)($rP['id'] ?? 0);
            if ($candidato > 0 && $candidato !== $hcId) {
                $parentHcId = $candidato;
            }
        }
    }

    // 3b. Si viene de contrato y no hay parent aun, buscar ultima HC del mismo contrato
    //     con fecha anterior a la actual (ultimo nodo ejecutado en la cadena)
    if ($parentHcId <= 0 && $contratoPacienteId > 0) {
        $stmtLast = $conn->prepare(
            'SELECT h.id
             FROM historia_clinica h
             INNER JOIN consultas c ON c.id = h.consulta_id
             INNER JOIN agenda_contrato ag ON ag.consulta_id = c.id
             WHERE ag.contrato_paciente_id = ?
               AND h.id != ?
               AND h.chain_status != ?
               AND (c.fecha < ? OR (c.fecha = ? AND h.id < ?))
             ORDER BY c.fecha DESC, h.id DESC
             LIMIT 1'
        );
        if ($stmtLast) {
            $anulada = 'anulada';
            $stmtLast->bind_param(
                'iisssi',
                $contratoPacienteId,
                $hcId,
                $anulada,
                $fechaActual, $fechaActual, $hcId
            );
            $stmtLast->execute();
            $rLast = $stmtLast->get_result()->fetch_assoc();
            $stmtLast->close();
            if ($rLast) $parentHcId = (int)($rLast['id'] ?? 0);
        }
    }

    // 3c. Fallback clinico para retornos sin "proxima cita":
    //     enlazar con la ultima HC previa del mismo paciente (priorizando mismo medico).
    if ($parentHcId <= 0 && $pacienteId > 0 && $fechaActual !== '') {
        $stmtFallback = $conn->prepare(
            'SELECT h.id
             FROM historia_clinica h
             INNER JOIN consultas c ON c.id = h.consulta_id
             WHERE c.paciente_id = ?
               AND h.id != ?
               AND h.chain_status != ?
               AND (
                    c.fecha < ?
                    OR (
                        c.fecha = ?
                        AND (
                            TIME(COALESCE(c.hora, "00:00:00")) < TIME(?)
                            OR (TIME(COALESCE(c.hora, "00:00:00")) = TIME(?) AND h.id < ?)
                        )
                    )
               )
             ORDER BY CASE WHEN c.medico_id = ? THEN 0 ELSE 1 END,
                      c.fecha DESC,
                      TIME(COALESCE(c.hora, "00:00:00")) DESC,
                      h.id DESC
             LIMIT 1'
        );
        if ($stmtFallback) {
            $anulada = 'anulada';
            $stmtFallback->bind_param(
                'iissssiii',
                $pacienteId,
                $hcId,
                $anulada,
                $fechaActual,
                $fechaActual,
                $horaActual,
                $horaActual,
                $hcId,
                $medicoIdActual
            );
            $stmtFallback->execute();
            $rFallback = $stmtFallback->get_result()->fetch_assoc();
            $stmtFallback->close();
            if ($rFallback) {
                $parentHcId = (int)($rFallback['id'] ?? 0);
            }
        }
    }

    // 4. Resolver root y depth a partir del parent
    $rootHcId   = $hcId;    // por defecto es raiz de si mismo
    $chainDepth = 0;
    if ($parentHcId > 0 && $parentHcId !== $hcId) {
        $stmtPar = $conn->prepare(
            'SELECT hc_root_id, chain_depth FROM historia_clinica WHERE id = ? LIMIT 1'
        );
        if ($stmtPar) {
            $stmtPar->bind_param('i', $parentHcId);
            $stmtPar->execute();
            $rPar = $stmtPar->get_result()->fetch_assoc();
            $stmtPar->close();
            if ($rPar) {
                $rootHcId   = (int)($rPar['hc_root_id'] ?? 0) > 0
                    ? (int)$rPar['hc_root_id']
                    : $parentHcId;
                $chainDepth = (int)($rPar['chain_depth'] ?? 0) + 1;
            }
        }
    }

    return [
        'hc_parent_id'        => $parentHcId > 0 ? $parentHcId : null,
        'hc_root_id'          => $rootHcId,
        'chain_depth'         => $chainDepth,
        'contrato_paciente_id'=> $contratoPacienteId > 0 ? $contratoPacienteId : null,
        'agenda_contrato_id'  => $agendaContratoId > 0 ? $agendaContratoId : null,
    ];
}

/**
 * Persiste los campos de cadena en historia_clinica para el nodo dado.
 * Solo actualiza si la columna hc_parent_id existe (migración 18 aplicada).
 * Silencia errores para no interrumpir el guardado principal.
 */
function hc_actualizar_cadena_hc($conn, $hcId, $consultaId) {
    $hcId = (int)$hcId;
    if ($hcId <= 0) return;

    // Verificar que la migración 18 fue aplicada
    $chk = $conn->query("SHOW COLUMNS FROM historia_clinica LIKE 'hc_parent_id'");
    if (!$chk || $chk->num_rows === 0) return;

    $cadena = hc_resolver_parent_canonico($conn, $hcId, $consultaId);
    if (!is_array($cadena)) return;

    $parentId    = $cadena['hc_parent_id'];
    $rootId      = (int)($cadena['hc_root_id'] ?? $hcId);
    $depth       = (int)($cadena['chain_depth'] ?? 0);
    $contratoId  = $cadena['contrato_paciente_id'];
    $agendaId    = $cadena['agenda_contrato_id'];

    $stmt = $conn->prepare(
        'UPDATE historia_clinica
         SET hc_parent_id        = ?,
             hc_root_id          = ?,
             chain_depth         = ?,
             contrato_paciente_id= ?,
             agenda_contrato_id  = ?,
             updated_seq         = updated_seq + 1
         WHERE id = ? LIMIT 1'
    );
    if (!$stmt) return;
    $stmt->bind_param('iiiiii', $parentId, $rootId, $depth, $contratoId, $agendaId, $hcId);
    $stmt->execute();
    $stmt->close();

    // Mantener consistencia canonica: cuando se resolvio parent en la cadena,
    // persistir hc_origen_id de la consulta actual si aun no esta seteado.
    if ((int)$consultaId > 0 && (int)$parentId > 0) {
        $stmtOrigen = $conn->prepare(
            'UPDATE consultas
             SET hc_origen_id = ?
             WHERE id = ?
               AND (hc_origen_id IS NULL OR hc_origen_id = 0)
             LIMIT 1'
        );
        if ($stmtOrigen) {
            $parentRef = (int)$parentId;
            $consultaRef = (int)$consultaId;
            $stmtOrigen->bind_param('ii', $parentRef, $consultaRef);
            $stmtOrigen->execute();
            $stmtOrigen->close();
        }
    }
}

/**
 * Reancla la cita futura mas cercana creada como hc_proxima para evitar
 * bifurcaciones cuando aparece una consulta intermedia no programada.
 *
 * Reglas de seguridad:
 * - mismo paciente y mismo medico
 * - solo consultas futuras con origen_creacion=hc_proxima
 * - solo si la consulta futura ya apuntaba a algun ancestro del nodo actual
 *   (compat: acepta ancestros por hc_id o consulta_id legacy)
 */
function hc_reanclar_proxima_cita_futura($conn, $hcIdActual, $consultaIdActual) {
    $hcIdActual = (int)$hcIdActual;
    $consultaIdActual = (int)$consultaIdActual;
    if ($hcIdActual <= 0 || $consultaIdActual <= 0) return;

    $stmtSelf = $conn->prepare(
        'SELECT id, paciente_id, medico_id, fecha, hora
         FROM consultas
         WHERE id = ?
         LIMIT 1'
    );
    if (!$stmtSelf) return;
    $stmtSelf->bind_param('i', $consultaIdActual);
    $stmtSelf->execute();
    $self = $stmtSelf->get_result()->fetch_assoc();
    $stmtSelf->close();
    if (!$self) return;

    $pacienteId = (int)($self['paciente_id'] ?? 0);
    $medicoId = (int)($self['medico_id'] ?? 0);
    $fechaSelf = (string)($self['fecha'] ?? '');
    $horaSelf = trim((string)($self['hora'] ?? '00:00:00'));
    if ($horaSelf === '') $horaSelf = '00:00:00';
    if ($pacienteId <= 0 || $medicoId <= 0 || $fechaSelf === '') return;

    // Construir set de ancestros para validar que el reanclaje es coherente.
    $allowedHcRefs = [$hcIdActual => true];
    $allowedConsultaRefs = [];

    $cursorHcId = $hcIdActual;
    $guard = 0;
    while ($cursorHcId > 0 && $guard < 40) {
        $guard++;
        $stmtAnc = $conn->prepare(
            'SELECT h.id, h.hc_parent_id, h.consulta_id, c.paciente_id
             FROM historia_clinica h
             INNER JOIN consultas c ON c.id = h.consulta_id
             WHERE h.id = ?
             LIMIT 1'
        );
        if (!$stmtAnc) break;
        $stmtAnc->bind_param('i', $cursorHcId);
        $stmtAnc->execute();
        $anc = $stmtAnc->get_result()->fetch_assoc();
        $stmtAnc->close();
        if (!$anc) break;

        if ((int)($anc['paciente_id'] ?? 0) !== $pacienteId) break;
        $ancHcId = (int)($anc['id'] ?? 0);
        $ancConsultaId = (int)($anc['consulta_id'] ?? 0);
        if ($ancHcId > 0) $allowedHcRefs[$ancHcId] = true;
        if ($ancConsultaId > 0) $allowedConsultaRefs[$ancConsultaId] = true;

        $nextParent = (int)($anc['hc_parent_id'] ?? 0);
        if ($nextParent <= 0 || isset($allowedHcRefs[$nextParent])) break;
        $cursorHcId = $nextParent;
    }

    $stmtFuture = $conn->prepare(
        'SELECT id, hc_origen_id
         FROM consultas
         WHERE paciente_id = ?
           AND medico_id = ?
           AND id <> ?
           AND LOWER(TRIM(COALESCE(origen_creacion, ""))) = "hc_proxima"
           AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "cancelado")
           AND (
                fecha > ?
                OR (fecha = ? AND TIME(COALESCE(hora, "00:00:00")) > TIME(?))
           )
         ORDER BY fecha ASC, TIME(COALESCE(hora, "00:00:00")) ASC, id ASC
         LIMIT 6'
    );
    if (!$stmtFuture) return;
    $stmtFuture->bind_param('iiisss', $pacienteId, $medicoId, $consultaIdActual, $fechaSelf, $fechaSelf, $horaSelf);
    $stmtFuture->execute();
    $resFuture = $stmtFuture->get_result();

    $consultaObjetivoId = 0;
    while ($rowF = $resFuture ? $resFuture->fetch_assoc() : null) {
        $futureId = (int)($rowF['id'] ?? 0);
        $futureRef = (int)($rowF['hc_origen_id'] ?? 0);
        if ($futureId <= 0 || $futureRef <= 0) {
            continue;
        }
        if (isset($allowedHcRefs[$futureRef]) || isset($allowedConsultaRefs[$futureRef])) {
            $consultaObjetivoId = $futureId;
            break;
        }
    }
    $stmtFuture->close();

    if ($consultaObjetivoId <= 0) return;

    $stmtUpd = $conn->prepare(
        'UPDATE consultas
         SET hc_origen_id = ?
         WHERE id = ?
           AND (hc_origen_id IS NULL OR hc_origen_id <> ?)
         LIMIT 1'
    );
    if (!$stmtUpd) return;
    $stmtUpd->bind_param('iii', $hcIdActual, $consultaObjetivoId, $hcIdActual);
    $stmtUpd->execute();
    $stmtUpd->close();
}

/**
 * Al guardar la HC de la consulta actual (consulta_id_actual), busca en agenda_contrato
 * el evento inmediatamente siguiente del mismo contrato que ya tenga una consulta asignada
 * y cuya consulta aún tenga hc_origen_id = 0 o NULL.
 * En ese caso actualiza esa consulta para que hc_origen_id = consulta_id_actual,
 * cerrando el timing gap que ocurre cuando el contrato programó el evento B antes de
 * que la HC de A existiera.
 */
function hc_retrovincular_siguiente_evento_contrato($conn, $consultaIdActual) {
    $consultaIdActual = (int)$consultaIdActual;
    if ($consultaIdActual <= 0) return;

    // Verificar que agenda_contrato existe
    $chk = $conn->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato' LIMIT 1");
    if (!$chk || $chk->num_rows === 0) return;

    // Obtener fecha y contrato_paciente_id del evento actual
    $stmtSelf = $conn->prepare(
        'SELECT ag.id AS evento_id, ag.contrato_paciente_id, ag.fecha_programada
         FROM agenda_contrato ag
         WHERE ag.consulta_id = ?
         LIMIT 1'
    );
    if (!$stmtSelf) return;
    $stmtSelf->bind_param('i', $consultaIdActual);
    $stmtSelf->execute();
    $self = $stmtSelf->get_result()->fetch_assoc();
    $stmtSelf->close();

    if (!$self) return;

    $contratoPacienteId = (int)($self['contrato_paciente_id'] ?? 0);
    $eventoActualId     = (int)($self['evento_id'] ?? 0);
    $fechaActual        = (string)($self['fecha_programada'] ?? '');
    if ($contratoPacienteId <= 0 || $eventoActualId <= 0 || $fechaActual === '') return;

    // Buscar el evento siguiente del mismo contrato con consulta asignada
    $stmtNext = $conn->prepare(
        'SELECT ag.consulta_id
         FROM agenda_contrato ag
         WHERE ag.contrato_paciente_id = ?
           AND ag.id <> ?
           AND ag.consulta_id IS NOT NULL
           AND ag.consulta_id > 0
           AND (ag.fecha_programada > ? OR (ag.fecha_programada = ? AND ag.id > ?))
         ORDER BY ag.fecha_programada ASC, ag.id ASC
         LIMIT 1'
    );
    if (!$stmtNext) return;
    $stmtNext->bind_param('iissi', $contratoPacienteId, $eventoActualId, $fechaActual, $fechaActual, $eventoActualId);
    $stmtNext->execute();
    $next = $stmtNext->get_result()->fetch_assoc();
    $stmtNext->close();

    $consultaIdSiguiente = (int)($next['consulta_id'] ?? 0);
    if ($consultaIdSiguiente <= 0 || $consultaIdSiguiente === $consultaIdActual) return;

    // Solo actualizar si hc_origen_id aún no apunta al nodo correcto
    $stmtUpd = $conn->prepare(
        'UPDATE consultas
         SET hc_origen_id = ?,
             origen_creacion = CASE WHEN origen_creacion IN ("contrato_agenda", "agendada", "") OR origen_creacion IS NULL THEN "hc_proxima" ELSE origen_creacion END
         WHERE id = ?
           AND (hc_origen_id IS NULL OR hc_origen_id = 0 OR hc_origen_id <> ?)
         LIMIT 1'
    );
    if (!$stmtUpd) return;
    $stmtUpd->bind_param('iii', $consultaIdActual, $consultaIdSiguiente, $consultaIdActual);
    $stmtUpd->execute();
    $stmtUpd->close();
}

/**
 * Para el GET de HC: resuelve si la consulta actual pertenece a un contrato y si
 * tiene un evento siguiente programado. Devuelve los datos del próximo evento
 * para que el frontend pueda pre-activar la sección "Próxima cita" sin esperar
 * el guardado manual del médico.
 */
function hc_resolver_proxima_cita_contrato($conn, $consultaId) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return null;

    $chk = $conn->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato' LIMIT 1");
    if (!$chk || $chk->num_rows === 0) return null;

    // Obtener el evento actual y su contrato
    $stmtSelf = $conn->prepare(
        'SELECT ag.id AS evento_id, ag.contrato_paciente_id, ag.fecha_programada
         FROM agenda_contrato ag
         WHERE ag.consulta_id = ?
         LIMIT 1'
    );
    if (!$stmtSelf) return null;
    $stmtSelf->bind_param('i', $consultaId);
    $stmtSelf->execute();
    $self = $stmtSelf->get_result()->fetch_assoc();
    $stmtSelf->close();
    if (!$self) return null;

    $contratoPacienteId = (int)($self['contrato_paciente_id'] ?? 0);
    $eventoActualId     = (int)($self['evento_id'] ?? 0);
    $fechaActual        = (string)($self['fecha_programada'] ?? '');
    if ($contratoPacienteId <= 0 || $eventoActualId <= 0 || $fechaActual === '') return null;

    // Buscar el siguiente evento con consulta ya asignada
    $stmtNext = $conn->prepare(
        'SELECT ag.consulta_id, ag.fecha_programada,
                c.medico_id, c.es_control
         FROM agenda_contrato ag
         INNER JOIN consultas c ON c.id = ag.consulta_id
         WHERE ag.contrato_paciente_id = ?
           AND ag.id <> ?
           AND ag.consulta_id IS NOT NULL
           AND ag.consulta_id > 0
           AND (ag.fecha_programada > ? OR (ag.fecha_programada = ? AND ag.id > ?))
         ORDER BY ag.fecha_programada ASC, ag.id ASC
         LIMIT 1'
    );
    if (!$stmtNext) return null;
    $stmtNext->bind_param('iissi', $contratoPacienteId, $eventoActualId, $fechaActual, $fechaActual, $eventoActualId);
    $stmtNext->execute();
    $next = $stmtNext->get_result()->fetch_assoc();
    $stmtNext->close();
    if (!$next) return null;

    $fechaProg    = (string)($next['fecha_programada'] ?? '');
    $fechaSolo    = strlen($fechaProg) >= 10 ? substr($fechaProg, 0, 10) : $fechaProg;
    $horaSolo     = strlen($fechaProg) >= 16 ? substr($fechaProg, 11, 5) : '00:00';

    return [
        'consulta_id'        => (int)($next['consulta_id'] ?? 0),
        'fecha'              => $fechaSolo,
        'hora'               => $horaSolo,
        'medico_id'          => (int)($next['medico_id'] ?? 0),
        'es_control'         => (int)($next['es_control'] ?? 1) === 1,
        'origen'             => 'contrato_agenda',
        'contrato_paciente_id' => $contratoPacienteId,
    ];
}

function hc_normalizar_proxima_cita_contrato($datos, $proximaContratoEvento) {
    if (!is_array($datos) || !isset($datos['proxima_cita']) || !is_array($datos['proxima_cita'])) {
        return $datos;
    }

    $proxima = $datos['proxima_cita'];
    $origen = strtolower(trim((string)($proxima['origen'] ?? '')));
    if ($origen !== 'contrato_agenda') {
        return $datos;
    }

    $nextConsultaId = is_array($proximaContratoEvento)
        ? (int)($proximaContratoEvento['consulta_id'] ?? 0)
        : 0;

    if ($nextConsultaId <= 0) {
        // Regla de negocio: si no hay siguiente evento de contrato, no debe quedar
        // proxima_cita abierta por origen contrato_agenda.
        $proxima['programar'] = false;
        $proxima['consulta_id'] = null;
        $proxima['fecha'] = '';
        $proxima['hora'] = '';
        $proxima['medico_id'] = '';
        $proxima['es_control'] = false;
        $proxima['estado_validacion'] = 'sin_siguiente_evento_contrato';
        $datos['proxima_cita'] = $proxima;
        return $datos;
    }

    // Si existe siguiente evento, forzar consistencia para evitar desalineación
    // entre JSON de HC y consulta real del contrato.
    $proxima['programar'] = true;
    $proxima['consulta_id'] = $nextConsultaId;
    $proxima['fecha'] = (string)($proximaContratoEvento['fecha'] ?? '');
    $proxima['hora'] = (string)($proximaContratoEvento['hora'] ?? '');
    $proxima['medico_id'] = (string)($proximaContratoEvento['medico_id'] ?? '');
    $proxima['es_control'] = !empty($proximaContratoEvento['es_control']);
    $proxima['origen'] = 'contrato_agenda';
    $proxima['estado_validacion'] = 'ok';
    $datos['proxima_cita'] = $proxima;

    return $datos;
}

function hc_bool_query_param($key, $default = false) {
    if (!isset($_GET[$key])) return $default;
    $raw = strtolower(trim((string)$_GET[$key]));
    return in_array($raw, ['1', 'true', 'yes', 'on'], true);
}

function hc_base_url() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';
}

function hc_table_exists($conn, $tableName) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $tableName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return !empty($row);
}

function hc_column_exists($conn, $tableName, $columnName) {
    $tableName = trim((string)$tableName);
    $columnName = trim((string)$columnName);
    if ($tableName === '' || $columnName === '') {
        return false;
    }

    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }

    $stmt->bind_param('ss', $tableName, $columnName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();

    return !empty($row);
}

function hc_get_consulta_meta($conn, $consultaId) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return null;

    $stmt = $conn->prepare(
        'SELECT c.id, c.paciente_id, c.fecha, c.hora, c.medico_id, c.hc_origen_id,
                m.nombre AS medico_nombre,
                m.apellido AS medico_apellido,
                m.especialidad AS medico_especialidad
         FROM consultas c
         LEFT JOIN medicos m ON m.id = c.medico_id
         WHERE c.id = ?
         LIMIT 1'
    );
    if (!$stmt) return null;
    $stmt->bind_param('i', $consultaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function hc_get_hc_row_resolved($conn, $hcRef) {
    $hcRef = (int)$hcRef;
    if ($hcRef <= 0) return null;

    $stmt = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE id = ? LIMIT 1');
    if (!$stmt) return null;
    $stmt->bind_param('i', $hcRef);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row) {
        $row['_resolved_by'] = 'hc_id';
        return $row;
    }

    // Compatibilidad histórica: hc_origen_id antiguo pudo guardar consulta_id.
    $stmtLegacy = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
    if (!$stmtLegacy) return null;
    $stmtLegacy->bind_param('i', $hcRef);
    $stmtLegacy->execute();
    $legacyRow = $stmtLegacy->get_result()->fetch_assoc();
    $stmtLegacy->close();

    if ($legacyRow) {
        $legacyRow['_resolved_by'] = 'consulta_id_legacy';
    }
    return $legacyRow ?: null;
}

function hc_guess_file_kind($mime, $filename = '') {
    $mime = strtolower(trim((string)$mime));
    $filename = strtolower(trim((string)$filename));

    if (strpos($mime, 'image/') === 0) return 'imagen';
    if ($mime === 'application/pdf') return 'pdf';
    if (preg_match('/\.(png|jpg|jpeg|gif|webp|bmp)$/', $filename)) return 'imagen';
    if (preg_match('/\.pdf$/', $filename)) return 'pdf';
    return 'archivo';
}

function hc_get_adjuntos_por_consulta($conn, $consultaId, $baseUrl) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return [];

    $hasOrdenesLab = hc_table_exists($conn, 'ordenes_laboratorio');
    $hasDocsPac = hc_table_exists($conn, 'documentos_externos_paciente');
    $hasDocsArc = hc_table_exists($conn, 'documentos_externos_archivos');
    if (!$hasOrdenesLab || !$hasDocsPac || !$hasDocsArc) {
        return [];
    }

    // Esta fuente corresponde a resultados/adjuntos externos ligados a la consulta.
    $sql = 'SELECT
                dep.id AS documento_id,
                dep.tipo,
                dep.titulo,
                dep.descripcion,
                dep.fecha AS documento_fecha,
                dep.orden_id,
                dea.id AS archivo_id,
                dea.nombre_original,
                dea.mime_type,
                dea.tamano
            FROM documentos_externos_paciente dep
            INNER JOIN documentos_externos_archivos dea ON dea.documento_id = dep.id
            WHERE (
                dep.orden_id IN (SELECT id FROM ordenes_laboratorio WHERE consulta_id = ?)
                OR dep.cotizacion_id IN (
                    SELECT cotizacion_id FROM ordenes_laboratorio WHERE consulta_id = ? AND cotizacion_id IS NOT NULL
                )
            )
            ORDER BY dep.fecha DESC, dep.id DESC, dea.id ASC';

    $stmt = $conn->prepare($sql);
    if (!$stmt) return [];
    $stmt->bind_param('ii', $consultaId, $consultaId);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    if (empty($rows)) return [];

    $bucket = [];
    foreach ($rows as $row) {
        $docId = (int)($row['documento_id'] ?? 0);
        if ($docId <= 0) continue;

        if (!isset($bucket[$docId])) {
            $bucket[$docId] = [
                'documento_id' => $docId,
                'tipo' => (string)($row['tipo'] ?? ''),
                'titulo' => (string)($row['titulo'] ?? ''),
                'descripcion' => (string)($row['descripcion'] ?? ''),
                'fecha' => (string)($row['documento_fecha'] ?? ''),
                'orden_id' => (int)($row['orden_id'] ?? 0),
                'archivos' => [],
            ];
        }

        $archivoId = (int)($row['archivo_id'] ?? 0);
        if ($archivoId <= 0) continue;

        $mime = (string)($row['mime_type'] ?? 'application/octet-stream');
        $nombre = (string)($row['nombre_original'] ?? 'archivo');
        $bucket[$docId]['archivos'][] = [
            'archivo_id' => $archivoId,
            'nombre_original' => $nombre,
            'mime_type' => $mime,
            'tamano' => (int)($row['tamano'] ?? 0),
            'kind' => hc_guess_file_kind($mime, $nombre),
            'url' => $baseUrl . 'api_resultados_laboratorio.php?action=view_archivo&consulta_id=' . $consultaId . '&archivo_id=' . $archivoId,
        ];
    }

    return array_values($bucket);
}

function hc_get_apoyo_resumen_por_consultas($conn, $consultaIds) {
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)$consultaIds), function ($id) {
        return $id > 0;
    })));

    if (empty($ids)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));

    $hasOrdenesLab = hc_table_exists($conn, 'ordenes_laboratorio');
    $hasResultadosLab = hc_table_exists($conn, 'resultados_laboratorio');
    $hasDocsPac = hc_table_exists($conn, 'documentos_externos_paciente');
    $hasDocsArc = hc_table_exists($conn, 'documentos_externos_archivos');
    $hasOrdenesImg = hc_table_exists($conn, 'ordenes_imagen');
    $hasOrdenesImgArch = hc_table_exists($conn, 'ordenes_imagen_archivos');
    $hasInformesImg = hc_table_exists($conn, 'imagenologia_informes');

    $resumen = [];
    foreach ($ids as $cid) {
        $resumen[$cid] = [
            'laboratorio' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'resultados' => 0,
                'documentos' => 0,
                'consulta_id' => $cid,
                'target' => '/resultados-laboratorio/' . $cid,
            ],
            'ecografia' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'archivos' => 0,
                'ultima_orden_id' => null,
                'ultima_orden_any' => null,
                'target' => null,
                'informe_id' => null,
                'informe_estado' => null,
            ],
            'rx' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'archivos' => 0,
                'ultima_orden_id' => null,
                'ultima_orden_any' => null,
                'target' => null,
                'informe_id' => null,
                'informe_estado' => null,
            ],
            'tomografia' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'archivos' => 0,
                'ultima_orden_id' => null,
                'ultima_orden_any' => null,
                'target' => null,
                'informe_id' => null,
                'informe_estado' => null,
            ],
        ];
    }

    if ($hasOrdenesLab) {
        $stmtOrdenesLab = $conn->prepare(
            "SELECT consulta_id, COUNT(*) AS total_ordenes
             FROM ordenes_laboratorio
             WHERE consulta_id IN ($placeholders)
             GROUP BY consulta_id"
        );
        if ($stmtOrdenesLab) {
            $stmtOrdenesLab->bind_param($types, ...$ids);
            $stmtOrdenesLab->execute();
            $rows = $stmtOrdenesLab->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtOrdenesLab->close();
            foreach ($rows as $row) {
                $cid = (int)($row['consulta_id'] ?? 0);
                if ($cid > 0 && isset($resumen[$cid])) {
                    $resumen[$cid]['laboratorio']['ordenes'] = (int)($row['total_ordenes'] ?? 0);
                }
            }
        }
    }

    if ($hasResultadosLab) {
        $stmtResultadosLab = $conn->prepare(
            "SELECT consulta_id, COUNT(*) AS total_resultados
             FROM resultados_laboratorio
             WHERE consulta_id IN ($placeholders)
             GROUP BY consulta_id"
        );
        if ($stmtResultadosLab) {
            $stmtResultadosLab->bind_param($types, ...$ids);
            $stmtResultadosLab->execute();
            $rows = $stmtResultadosLab->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtResultadosLab->close();
            foreach ($rows as $row) {
                $cid = (int)($row['consulta_id'] ?? 0);
                if ($cid > 0 && isset($resumen[$cid])) {
                    $resumen[$cid]['laboratorio']['resultados'] += (int)($row['total_resultados'] ?? 0);
                }
            }
        }

        if ($hasOrdenesLab) {
            $stmtResultadosPorOrden = $conn->prepare(
                "SELECT ol.consulta_id, COUNT(rl.id) AS total_resultados
                 FROM ordenes_laboratorio ol
                 INNER JOIN resultados_laboratorio rl ON rl.orden_id = ol.id
                 WHERE ol.consulta_id IN ($placeholders)
                   AND (rl.consulta_id IS NULL OR rl.consulta_id = 0)
                 GROUP BY ol.consulta_id"
            );
            if ($stmtResultadosPorOrden) {
                $stmtResultadosPorOrden->bind_param($types, ...$ids);
                $stmtResultadosPorOrden->execute();
                $rows = $stmtResultadosPorOrden->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtResultadosPorOrden->close();
                foreach ($rows as $row) {
                    $cid = (int)($row['consulta_id'] ?? 0);
                    if ($cid > 0 && isset($resumen[$cid])) {
                        $resumen[$cid]['laboratorio']['resultados'] += (int)($row['total_resultados'] ?? 0);
                    }
                }
            }
        }
    }

    if ($hasOrdenesLab && $hasDocsPac && $hasDocsArc) {
        $stmtDocs = $conn->prepare(
            "SELECT ol.consulta_id, COUNT(dea.id) AS total_documentos
             FROM ordenes_laboratorio ol
             INNER JOIN documentos_externos_paciente dep ON dep.orden_id = ol.id
             INNER JOIN documentos_externos_archivos dea ON dea.documento_id = dep.id
             WHERE ol.consulta_id IN ($placeholders)
             GROUP BY ol.consulta_id"
        );
        if ($stmtDocs) {
            $stmtDocs->bind_param($types, ...$ids);
            $stmtDocs->execute();
            $rows = $stmtDocs->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtDocs->close();
            foreach ($rows as $row) {
                $cid = (int)($row['consulta_id'] ?? 0);
                if ($cid > 0 && isset($resumen[$cid])) {
                    $resumen[$cid]['laboratorio']['documentos'] = (int)($row['total_documentos'] ?? 0);
                }
            }
        }
    }

    if ($hasOrdenesImg) {
        $joinArch = $hasOrdenesImgArch
            ? ' LEFT JOIN ordenes_imagen_archivos oia ON oia.orden_id = oi.id '
            : '';
        $archCountExpr = $hasOrdenesImgArch ? 'COUNT(oia.id)' : '0';
        $ultimaConArchivoExpr = $hasOrdenesImgArch
            ? 'MAX(CASE WHEN oia.id IS NOT NULL THEN oi.id ELSE NULL END)'
            : 'NULL';

        $stmtImg = $conn->prepare(
            "SELECT oi.consulta_id,
                    CASE
                      WHEN LOWER(TRIM(COALESCE(oi.tipo, ''))) IN ('rx','rayosx','rayos_x','rayos x') THEN 'rx'
                      WHEN LOWER(TRIM(COALESCE(oi.tipo, ''))) = 'tomografia' THEN 'tomografia'
                      ELSE 'ecografia'
                    END AS tipo_norm,
                    COUNT(DISTINCT oi.id) AS total_ordenes,
                    $archCountExpr AS total_archivos,
                    $ultimaConArchivoExpr AS ultima_orden_con_archivo,
                    MAX(oi.id) AS ultima_orden_any
             FROM ordenes_imagen oi
             $joinArch
             WHERE oi.consulta_id IN ($placeholders)
               AND LOWER(TRIM(COALESCE(oi.tipo, ''))) IN ('ecografia','tomografia','rx','rayosx','rayos_x','rayos x')
             GROUP BY oi.consulta_id, tipo_norm"
        );

        if ($stmtImg) {
            $stmtImg->bind_param($types, ...$ids);
            $stmtImg->execute();
            $rows = $stmtImg->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtImg->close();

            foreach ($rows as $row) {
                $cid = (int)($row['consulta_id'] ?? 0);
                $tipoNorm = trim((string)($row['tipo_norm'] ?? ''));
                if ($cid <= 0 || !isset($resumen[$cid]) || !isset($resumen[$cid][$tipoNorm])) {
                    continue;
                }

                $archivos = (int)($row['total_archivos'] ?? 0);
                $ultimaConArchivo = (int)($row['ultima_orden_con_archivo'] ?? 0);
                $ultimaAny = (int)($row['ultima_orden_any'] ?? 0);

                $resumen[$cid][$tipoNorm]['ordenes'] = (int)($row['total_ordenes'] ?? 0);
                $resumen[$cid][$tipoNorm]['archivos'] = $archivos;
                $resumen[$cid][$tipoNorm]['ultima_orden_any'] = $ultimaAny > 0 ? $ultimaAny : null;
                $resumen[$cid][$tipoNorm]['ultima_orden_id'] = $ultimaConArchivo > 0 ? $ultimaConArchivo : null;
                $resumen[$cid][$tipoNorm]['target'] = $ultimaConArchivo > 0 ? ('/visor-imagen/' . $ultimaConArchivo) : null;
            }
        }

        if ($hasInformesImg) {
            $stmtInf = $conn->prepare(
                "SELECT oi.consulta_id,
                        CASE
                          WHEN LOWER(TRIM(COALESCE(oi.tipo, ''))) IN ('rx','rayosx','rayos_x','rayos x') THEN 'rx'
                          WHEN LOWER(TRIM(COALESCE(oi.tipo, ''))) = 'tomografia' THEN 'tomografia'
                          ELSE 'ecografia'
                        END AS tipo_norm,
                        MAX(ii.id) AS informe_id,
                        MAX(oi.id) AS ultima_orden_informe,
                        SUBSTRING_INDEX(GROUP_CONCAT(ii.estado ORDER BY ii.id DESC SEPARATOR ','), ',', 1) AS informe_estado
                 FROM ordenes_imagen oi
                 INNER JOIN imagenologia_informes ii ON ii.orden_imagen_id = oi.id
                 WHERE oi.consulta_id IN ($placeholders)
                   AND LOWER(TRIM(COALESCE(oi.tipo, ''))) IN ('ecografia','tomografia','rx','rayosx','rayos_x','rayos x')
                 GROUP BY oi.consulta_id, tipo_norm"
            );

            if ($stmtInf) {
                $stmtInf->bind_param($types, ...$ids);
                $stmtInf->execute();
                $rowsInf = $stmtInf->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtInf->close();

                foreach ($rowsInf as $row) {
                    $cid = (int)($row['consulta_id'] ?? 0);
                    $tipoNorm = trim((string)($row['tipo_norm'] ?? ''));
                    if ($cid <= 0 || !isset($resumen[$cid]) || !isset($resumen[$cid][$tipoNorm])) {
                        continue;
                    }

                    $informeId = (int)($row['informe_id'] ?? 0);
                    $ordenInforme = (int)($row['ultima_orden_informe'] ?? 0);

                    $resumen[$cid][$tipoNorm]['informe_id'] = $informeId > 0 ? $informeId : null;
                    $resumen[$cid][$tipoNorm]['informe_estado'] = trim((string)($row['informe_estado'] ?? '')) ?: null;

                    if ((int)($resumen[$cid][$tipoNorm]['ultima_orden_id'] ?? 0) <= 0 && $ordenInforme > 0) {
                        $resumen[$cid][$tipoNorm]['ultima_orden_id'] = $ordenInforme;
                        $resumen[$cid][$tipoNorm]['target'] = '/visor-imagen/' . $ordenInforme;
                    }
                }
            }
        }
    }

    foreach ($resumen as &$item) {
        $lab = $item['laboratorio'];
        $eco = $item['ecografia'];
        $rx = $item['rx'];
        $tomo = $item['tomografia'];

        $item['laboratorio']['has_resultados'] = (
            (int)($lab['resultados'] ?? 0) > 0
            || (int)($lab['documentos'] ?? 0) > 0
        );
        $item['ecografia']['has_resultados'] = (
            (int)($eco['archivos'] ?? 0) > 0
            || (int)($eco['informe_id'] ?? 0) > 0
        );
        $item['rx']['has_resultados'] = (
            (int)($rx['archivos'] ?? 0) > 0
            || (int)($rx['informe_id'] ?? 0) > 0
        );
        $item['tomografia']['has_resultados'] = (
            (int)($tomo['archivos'] ?? 0) > 0
            || (int)($tomo['informe_id'] ?? 0) > 0
        );
    }
    unset($item);

    return $resumen;
}

function hc_resolve_template_for_hc($conn, $consultaId, $datos) {
    $templateMeta = null;
    $templateResolution = null;
    $templateId = '';
    $templateVersion = '';

    if (is_array($datos) && isset($datos['template']) && is_array($datos['template'])) {
        $templateId = trim((string)($datos['template']['id'] ?? ''));
        $templateVersion = trim((string)($datos['template']['version'] ?? ''));
    }

    $resolved = hc_resolve_template($conn, [
        'consulta_id' => (int)$consultaId,
        'template_id' => $templateId,
        'version' => $templateVersion,
    ]);

    if (is_array($resolved) && ($resolved['success'] ?? false)) {
        $templateMeta = $resolved['template'] ?? null;
        $templateResolution = $resolved['resolution'] ?? null;
    }

    return [$templateMeta, $templateResolution];
}

function hc_prepare_template_for_save($conn, $consultaId, $datos) {
    if (!is_array($datos)) {
        return $datos;
    }

    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) {
        return $datos;
    }

    $policy = hc_get_template_policy($conn);
    $mode = (string)($policy['mode'] ?? 'auto');

    $templateId = '';
    $templateVersion = '';
    if (isset($datos['template']) && is_array($datos['template'])) {
        $templateId = trim((string)($datos['template']['id'] ?? ''));
        $templateVersion = trim((string)($datos['template']['version'] ?? ''));
    }

    $templateIdNorm = strtolower($templateId);
    $isLegacyGeneric = in_array($templateIdNorm, ['medicina_general', 'default'], true);

    // En modo auto, si no viene plantilla o viene una generica legacy,
    // fijar la plantilla resuelta por especialidad para mantener coherencia.
    $forceAutoResolve = ($mode === 'auto') && ($templateId === '' || $isLegacyGeneric);
    // En modo single, siempre fijar la plantilla resuelta por politica actual.
    $forceSingleResolve = ($mode === 'single');

    $resolveOptions = [
        'consulta_id' => $consultaId,
    ];

    if (!$forceAutoResolve && !$forceSingleResolve && $templateId !== '') {
        $resolveOptions['template_id'] = $templateId;
        if ($templateVersion !== '') {
            $resolveOptions['version'] = $templateVersion;
        }
    }

    $resolved = hc_resolve_template($conn, $resolveOptions);
    if (!is_array($resolved) || !($resolved['success'] ?? false)) {
        return $datos;
    }

    $tpl = $resolved['template'] ?? null;
    if (!is_array($tpl)) {
        return $datos;
    }

    $resolvedId = trim((string)($tpl['id'] ?? ''));
    if ($resolvedId === '') {
        return $datos;
    }

    $resolvedVersion = trim((string)($tpl['version'] ?? ''));
    $datos['template'] = [
        'id' => $resolvedId,
        'version' => $resolvedVersion,
    ];

    return $datos;
}

function hc_get_historial_cadena_previas($conn, $consultaIdActual, $maxDepth = 30) {
    $consultaIdActual = (int)$consultaIdActual;
    if ($consultaIdActual <= 0) return [];

    $baseUrl = hc_base_url();
    $consultaActual = hc_get_consulta_meta($conn, $consultaIdActual);
    if (!$consultaActual) return [];
    $pacienteActualId = (int)($consultaActual['paciente_id'] ?? 0);
    $medicoActualId = (int)($consultaActual['medico_id'] ?? 0);
    $fechaActual = (string)($consultaActual['fecha'] ?? '');
    $horaActual = trim((string)($consultaActual['hora'] ?? '00:00:00'));
    if ($horaActual === '') {
        $horaActual = '00:00:00';
    }

    // Obtener la HC del nodo actual para intentar usar hc_parent_id
    $stmtSelf = $conn->prepare(
        'SELECT id, hc_parent_id, hc_root_id, chain_depth, chain_status, contrato_paciente_id, agenda_contrato_id
         FROM historia_clinica WHERE consulta_id = ? LIMIT 1'
    );
    $selfHcRow = null;
    if ($stmtSelf) {
        $stmtSelf->bind_param('i', $consultaIdActual);
        $stmtSelf->execute();
        $selfHcRow = $stmtSelf->get_result()->fetch_assoc();
        $stmtSelf->close();
    }

    // Estrategia 1: usar hc_parent_id si la migracion 18 esta aplicada
    $useNewChain = $selfHcRow !== null && isset($selfHcRow['hc_parent_id']);

    $historial = [];
    $visited   = [];
    $depth     = 0;
    $legacyStartRef = (int)($consultaActual['hc_origen_id'] ?? 0);

    // Fallback pre-guardado: si la consulta actual todavia no tiene hc_origen_id,
    // buscar la ultima HC previa del mismo paciente para habilitar contexto clinico.
    if (!$useNewChain && $legacyStartRef <= 0 && $pacienteActualId > 0 && $fechaActual !== '') {
        $stmtPrev = $conn->prepare(
            'SELECT h.id
             FROM historia_clinica h
             INNER JOIN consultas c ON c.id = h.consulta_id
             WHERE c.paciente_id = ?
               AND h.chain_status != ?
               AND (
                    c.fecha < ?
                    OR (
                        c.fecha = ?
                        AND TIME(COALESCE(c.hora, "00:00:00")) < TIME(?)
                    )
               )
             ORDER BY CASE WHEN c.medico_id = ? THEN 0 ELSE 1 END,
                      c.fecha DESC,
                      TIME(COALESCE(c.hora, "00:00:00")) DESC,
                      h.id DESC
             LIMIT 1'
        );
        if ($stmtPrev) {
            $anulada = 'anulada';
            $stmtPrev->bind_param('issssi', $pacienteActualId, $anulada, $fechaActual, $fechaActual, $horaActual, $medicoActualId);
            $stmtPrev->execute();
            $rowPrev = $stmtPrev->get_result()->fetch_assoc();
            $stmtPrev->close();
            $legacyStartRef = (int)($rowPrev['id'] ?? 0);
        }
    }

    if ($useNewChain) {
        // Caminar hacia atras por hc_parent_id
        $currentParentId = (int)($selfHcRow['hc_parent_id'] ?? 0);

        while ($currentParentId > 0 && $depth < $maxDepth) {
            if (isset($visited[$currentParentId])) break;
            $visited[$currentParentId] = true;

            $stmtHcP = $conn->prepare(
                'SELECT id, consulta_id, datos, fecha_registro,
                        hc_parent_id, hc_root_id, chain_depth, chain_status,
                        contrato_paciente_id, agenda_contrato_id
                 FROM historia_clinica WHERE id = ? LIMIT 1'
            );
            if (!$stmtHcP) break;
            $stmtHcP->bind_param('i', $currentParentId);
            $stmtHcP->execute();
            $hcRow = $stmtHcP->get_result()->fetch_assoc();
            $stmtHcP->close();
            if (!$hcRow) break;

            $hcId      = (int)($hcRow['id'] ?? 0);
            $consultaId = (int)($hcRow['consulta_id'] ?? 0);
            $datos     = json_decode((string)($hcRow['datos'] ?? '{}'), true);
            if (!is_array($datos)) $datos = [];

            [$templateMeta, $templateResolution] = hc_resolve_template_for_hc($conn, $consultaId, $datos);
            $consultaMeta = hc_get_consulta_meta($conn, $consultaId);
            if (!$consultaMeta || (int)($consultaMeta['paciente_id'] ?? 0) !== $pacienteActualId) {
                // Seguridad: nunca mezclar nodos de otro paciente aunque exista referencia cruzada.
                break;
            }
            $adjuntos     = hc_get_adjuntos_por_consulta($conn, $consultaId, $baseUrl);

            $historial[] = [
                'hc_id'               => $hcId,
                'consulta_id'         => $consultaId,
                'fecha_registro'      => (string)($hcRow['fecha_registro'] ?? ''),
                'fecha_consulta'      => (string)($consultaMeta['fecha'] ?? ''),
                'hora_consulta'       => (string)($consultaMeta['hora'] ?? ''),
                'medico_id'           => (int)($consultaMeta['medico_id'] ?? 0),
                'medico_nombre'       => trim((string)($consultaMeta['medico_nombre'] ?? '')),
                'medico_apellido'     => trim((string)($consultaMeta['medico_apellido'] ?? '')),
                'medico_especialidad' => trim((string)($consultaMeta['medico_especialidad'] ?? '')),
                'datos'               => $datos,
                'template'            => $templateMeta,
                'template_resolution' => $templateResolution,
                'adjuntos'            => $adjuntos,
                'resolved_by'         => 'hc_parent_id',
                'chain_depth'         => (int)($hcRow['chain_depth'] ?? 0),
                'chain_status'        => (string)($hcRow['chain_status'] ?? 'activa'),
                'hc_root_id'          => (int)($hcRow['hc_root_id'] ?? 0),
                'contrato_paciente_id'=> (int)($hcRow['contrato_paciente_id'] ?? 0) ?: null,
                'agenda_contrato_id'  => (int)($hcRow['agenda_contrato_id'] ?? 0) ?: null,
            ];

            $currentParentId = (int)($hcRow['hc_parent_id'] ?? 0);
            $depth++;
        }
    } else {
        // Estrategia 2 (legacy): caminar por hc_origen_id
        $currentRef = $legacyStartRef;

        while ($currentRef > 0 && $depth < $maxDepth) {
            if (isset($visited[$currentRef])) break;
            $visited[$currentRef] = true;

            $hcRow = hc_get_hc_row_resolved($conn, $currentRef);
            if (!$hcRow) break;

            $hcId      = (int)($hcRow['id'] ?? 0);
            $consultaId = (int)($hcRow['consulta_id'] ?? 0);
            $datos     = json_decode((string)($hcRow['datos'] ?? '{}'), true);
            if (!is_array($datos)) $datos = [];

            [$templateMeta, $templateResolution] = hc_resolve_template_for_hc($conn, $consultaId, $datos);
            $consultaMeta = hc_get_consulta_meta($conn, $consultaId);
            if (!$consultaMeta || (int)($consultaMeta['paciente_id'] ?? 0) !== $pacienteActualId) {
                // Seguridad: cortar si el enlace legado apunta fuera del paciente actual.
                break;
            }
            $adjuntos     = hc_get_adjuntos_por_consulta($conn, $consultaId, $baseUrl);

            $historial[] = [
                'hc_id'               => $hcId,
                'consulta_id'         => $consultaId,
                'fecha_registro'      => (string)($hcRow['fecha_registro'] ?? ''),
                'fecha_consulta'      => (string)($consultaMeta['fecha'] ?? ''),
                'hora_consulta'       => (string)($consultaMeta['hora'] ?? ''),
                'medico_id'           => (int)($consultaMeta['medico_id'] ?? 0),
                'medico_nombre'       => trim((string)($consultaMeta['medico_nombre'] ?? '')),
                'medico_apellido'     => trim((string)($consultaMeta['medico_apellido'] ?? '')),
                'medico_especialidad' => trim((string)($consultaMeta['medico_especialidad'] ?? '')),
                'datos'               => $datos,
                'template'            => $templateMeta,
                'template_resolution' => $templateResolution,
                'adjuntos'            => $adjuntos,
                'resolved_by'         => (string)($hcRow['_resolved_by'] ?? 'hc_id'),
                'chain_depth'         => null,
                'chain_status'        => 'activa',
                'hc_root_id'          => null,
                'contrato_paciente_id'=> null,
                'agenda_contrato_id'  => null,
            ];

            $nextRef = (int)($consultaMeta['hc_origen_id'] ?? 0);
            if ($nextRef > 0 && $nextRef === $currentRef && $hcId > 0 && $hcId !== $currentRef) {
                $nextRef = $hcId;
            }

            // Fallback robusto legacy: si el nodo no tiene hc_origen_id, buscar la HC
            // inmediatamente anterior del MISMO paciente para no cortar la continuidad.
            if ($nextRef <= 0) {
                $fechaNodo = (string)($consultaMeta['fecha'] ?? '');
                $horaNodo = trim((string)($consultaMeta['hora'] ?? '00:00:00'));
                if ($horaNodo === '') {
                    $horaNodo = '00:00:00';
                }
                $medicoNodo = (int)($consultaMeta['medico_id'] ?? 0);

                if ($fechaNodo !== '') {
                    $stmtPrevNode = $conn->prepare(
                        'SELECT h2.id
                         FROM historia_clinica h2
                         INNER JOIN consultas c2 ON c2.id = h2.consulta_id
                         WHERE c2.paciente_id = ?
                           AND h2.chain_status != ?
                           AND h2.id <> ?
                           AND (
                                c2.fecha < ?
                                OR (
                                    c2.fecha = ?
                                    AND (
                                        TIME(COALESCE(c2.hora, "00:00:00")) < TIME(?)
                                        OR (TIME(COALESCE(c2.hora, "00:00:00")) = TIME(?) AND h2.id < ?)
                                    )
                                )
                           )
                         ORDER BY CASE WHEN c2.medico_id = ? THEN 0 ELSE 1 END,
                                  c2.fecha DESC,
                                  TIME(COALESCE(c2.hora, "00:00:00")) DESC,
                                  h2.id DESC
                         LIMIT 5'
                    );
                    if ($stmtPrevNode) {
                        $anulada = 'anulada';
                        $stmtPrevNode->bind_param('isissssii', $pacienteActualId, $anulada, $hcId, $fechaNodo, $fechaNodo, $horaNodo, $horaNodo, $hcId, $medicoNodo);
                        $stmtPrevNode->execute();
                        $resPrevNode = $stmtPrevNode->get_result();
                        while ($rowPrevNode = $resPrevNode ? $resPrevNode->fetch_assoc() : null) {
                            $candidate = (int)($rowPrevNode['id'] ?? 0);
                            if ($candidate > 0 && !isset($visited[$candidate])) {
                                $nextRef = $candidate;
                                break;
                            }
                        }
                        $stmtPrevNode->close();
                    }
                }
            }
            $currentRef = $nextRef;
            $depth++;
        }
    }

    $consultaIdsHistorial = array_values(array_unique(array_filter(array_map(function ($item) {
        return (int)($item['consulta_id'] ?? 0);
    }, $historial), function ($id) {
        return $id > 0;
    })));

    $apoyoResumen = hc_get_apoyo_resumen_por_consultas($conn, $consultaIdsHistorial);

    foreach ($historial as &$item) {
        $cid = (int)($item['consulta_id'] ?? 0);
        $item['apoyo_diagnostico'] = $apoyoResumen[$cid] ?? [
            'laboratorio' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'resultados' => 0,
                'documentos' => 0,
                'consulta_id' => $cid,
                'target' => $cid > 0 ? '/resultados-laboratorio/' . $cid : null,
            ],
            'ecografia' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'archivos' => 0,
                'ultima_orden_id' => null,
                'ultima_orden_any' => null,
                'target' => null,
                'informe_id' => null,
                'informe_estado' => null,
            ],
            'rx' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'archivos' => 0,
                'ultima_orden_id' => null,
                'ultima_orden_any' => null,
                'target' => null,
                'informe_id' => null,
                'informe_estado' => null,
            ],
            'tomografia' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'archivos' => 0,
                'ultima_orden_id' => null,
                'ultima_orden_any' => null,
                'target' => null,
                'informe_id' => null,
                'informe_estado' => null,
            ],
        ];
    }
    unset($item);

    return $historial;
}

function hc_ensure_tratamientos_enfermeria_table($conn) {
    $conn->query(
        "CREATE TABLE IF NOT EXISTS tratamientos_enfermeria (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            consulta_id      INT          NOT NULL COMMENT 'FK a consultas.id',
            paciente_id      INT          NOT NULL COMMENT 'Copia desnormalizada para consultas rápidas',
            receta_snapshot  JSON                  COMMENT 'Copia de historia_clinica.datos.receta al momento del guardado',
            tratamiento_texto TEXT                 COMMENT 'Copia de historia_clinica.datos.tratamiento',
            estado           ENUM('pendiente','en_ejecucion','completado','suspendido') NOT NULL DEFAULT 'pendiente',
            version_num      INT          NOT NULL DEFAULT 1 COMMENT 'Versión incremental por consulta',
            origen_tratamiento_id INT     NULL COMMENT 'Registro anterior del cual deriva esta versión',
            creado_en        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            iniciado_en      DATETIME     NULL,
            completado_en    DATETIME     NULL,
            notas_enfermeria TEXT         NULL,
            INDEX idx_te_estado   (estado),
            INDEX idx_te_paciente (paciente_id),
            INDEX idx_te_consulta_version (consulta_id, version_num),
            CONSTRAINT fk_te_consulta FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Migración compatible con instalaciones previas (idempotente).
    $idxLegacy = $conn->query("SHOW INDEX FROM tratamientos_enfermeria WHERE Key_name = 'uk_te_consulta'");
    if ($idxLegacy && $idxLegacy->num_rows > 0) {
        $conn->query('ALTER TABLE tratamientos_enfermeria DROP INDEX uk_te_consulta');
    }

    $colVersion = $conn->query("SHOW COLUMNS FROM tratamientos_enfermeria LIKE 'version_num'");
    if ($colVersion && $colVersion->num_rows === 0) {
        $conn->query('ALTER TABLE tratamientos_enfermeria ADD COLUMN version_num INT NOT NULL DEFAULT 1');
    }

    $colOrigen = $conn->query("SHOW COLUMNS FROM tratamientos_enfermeria LIKE 'origen_tratamiento_id'");
    if ($colOrigen && $colOrigen->num_rows === 0) {
        $conn->query('ALTER TABLE tratamientos_enfermeria ADD COLUMN origen_tratamiento_id INT NULL');
    }

    $idxVersion = $conn->query("SHOW INDEX FROM tratamientos_enfermeria WHERE Key_name = 'idx_te_consulta_version'");
    if ($idxVersion && $idxVersion->num_rows === 0) {
        $conn->query('ALTER TABLE tratamientos_enfermeria ADD INDEX idx_te_consulta_version (consulta_id, version_num)');
    }
}

function hc_ensure_tratamientos_multidia_tables($conn) {
    tph_ensure_multidia_tables($conn);
}

function hc_parse_duracion_dias($duracionTexto) {
    return tph_parse_duracion_dias($duracionTexto);
}

function hc_parse_dosis_por_dia($frecuenciaTexto) {
    $norm = tph_normalize_prescripcion_item(['frecuencia' => $frecuenciaTexto], 0);
    return (int)($norm['dosis_dia'] ?? 1);
}

function hc_rebuild_plan_multidia($conn, $tratamientoId, $receta) {
    tph_rebuild_plan_multidia($conn, $tratamientoId, $receta);
}

function hc_upsert_tratamiento_enfermeria($conn, $consulta_id, $datos) {
    $receta = (is_array($datos) && isset($datos['receta']) && is_array($datos['receta']))
        ? $datos['receta']
        : [];
    $tratamientoTexto = is_array($datos) ? trim((string)($datos['tratamiento'] ?? '')) : '';

    // Solo crear registro si hay algo de valor para enfermería
    if (empty($receta) && $tratamientoTexto === '') {
        return;
    }

    hc_ensure_tratamientos_enfermeria_table($conn);
    hc_ensure_tratamientos_multidia_tables($conn);

    $stmtPac = $conn->prepare('SELECT paciente_id FROM consultas WHERE id = ? LIMIT 1');
    if (!$stmtPac) return;
    $stmtPac->bind_param('i', $consulta_id);
    $stmtPac->execute();
    $rowPac = $stmtPac->get_result()->fetch_assoc();
    $stmtPac->close();
    $pacienteId = (int)($rowPac['paciente_id'] ?? 0);
    if ($pacienteId <= 0) return;

    $recetaJson = json_encode($receta, JSON_UNESCAPED_UNICODE);

    // Buscar la última versión del tratamiento para esta consulta.
    $stmtLast = $conn->prepare(
        'SELECT id, estado, receta_snapshot, tratamiento_texto, version_num
         FROM tratamientos_enfermeria
         WHERE consulta_id = ?
         ORDER BY version_num DESC, id DESC
         LIMIT 1'
    );
    if (!$stmtLast) return;
    $stmtLast->bind_param('i', $consulta_id);
    $stmtLast->execute();
    $last = $stmtLast->get_result()->fetch_assoc();
    $stmtLast->close();

    if (!$last) {
        $stmtInsert = $conn->prepare(
            'INSERT INTO tratamientos_enfermeria (consulta_id, paciente_id, receta_snapshot, tratamiento_texto, estado, version_num)
             VALUES (?, ?, ?, ?, "pendiente", 1)'
        );
        if (!$stmtInsert) return;
        $stmtInsert->bind_param('iiss', $consulta_id, $pacienteId, $recetaJson, $tratamientoTexto);
        $okInsert = $stmtInsert->execute();
        $newTratamientoId = $okInsert ? (int)$stmtInsert->insert_id : 0;
        $stmtInsert->close();
        if ($newTratamientoId > 0) {
            hc_rebuild_plan_multidia($conn, $newTratamientoId, $receta);
        }
        return;
    }

    $lastId = (int)($last['id'] ?? 0);
    $lastEstado = trim((string)($last['estado'] ?? ''));
    $lastVersion = (int)($last['version_num'] ?? 1);
    $lastReceta = (string)($last['receta_snapshot'] ?? '[]');
    $lastTratamiento = trim((string)($last['tratamiento_texto'] ?? ''));
    $mismoContenido = ($lastReceta === $recetaJson) && ($lastTratamiento === $tratamientoTexto);

    // Si no hay cambios en la prescripción, evitar ruido de versiones.
    if ($mismoContenido) {
        return;
    }

    if ($lastEstado === 'pendiente') {
        // Mientras siga pendiente se actualiza en la misma versión.
        $stmtUpd = $conn->prepare(
            'UPDATE tratamientos_enfermeria
             SET receta_snapshot = ?, tratamiento_texto = ?, creado_en = CURRENT_TIMESTAMP
             WHERE id = ? LIMIT 1'
        );
        if (!$stmtUpd) return;
        $stmtUpd->bind_param('ssi', $recetaJson, $tratamientoTexto, $lastId);
        $stmtUpd->execute();
        $stmtUpd->close();
        hc_rebuild_plan_multidia($conn, $lastId, $receta);
        return;
    }

    if ($lastEstado === 'en_ejecucion') {
        // Detectar si el cambio es solo aditivo (se agregan medicamentos, no se elimina ni modifica ninguno).
        // Si es aditivo, conservar el tratamiento en ejecución y solo agregar los ítems nuevos.
        $oldReceta = json_decode($lastReceta, true);
        if (!is_array($oldReceta)) $oldReceta = [];

        // Fingerprint normalizado por medicamento: nombre|dosis|frecuencia_tipo|frecuencia_valor|duracion_dias
        $makeFp = function ($item) {
            $n = tph_normalize_prescripcion_item($item, 0);
            return mb_strtolower(trim($n['nombre']), 'UTF-8')
                . '|' . strtolower(trim($n['dosis']))
                . '|' . $n['frecuencia_tipo']
                . '|' . (string)($n['frecuencia_valor'] ?? '')
                . '|' . (string)$n['duracion_dias'];
        };

        $oldFps = [];
        foreach ($oldReceta as $it) { $oldFps[$makeFp($it)] = true; }

        $newFps    = [];
        $addedItems = [];
        foreach ($receta as $it) {
            $fp = $makeFp($it);
            $newFps[$fp] = true;
            if (!isset($oldFps[$fp])) { $addedItems[] = $it; }
        }

        // Verificar que ningún ítem antiguo fue eliminado o modificado
        $isAdditive = true;
        foreach ($oldReceta as $it) {
            if (!isset($newFps[$makeFp($it)])) { $isAdditive = false; break; }
        }

        if ($isAdditive) {
            // Actualizar snapshot con la receta completa (incluye los nuevos)
            $stmtUpSnap = $conn->prepare('UPDATE tratamientos_enfermeria SET receta_snapshot = ?, tratamiento_texto = ? WHERE id = ? LIMIT 1');
            if ($stmtUpSnap) {
                $stmtUpSnap->bind_param('ssi', $recetaJson, $tratamientoTexto, $lastId);
                $stmtUpSnap->execute();
                $stmtUpSnap->close();
            }
            if (!empty($addedItems)) {
                // Obtener el próximo item_idx disponible
                $stmtMaxIdx = $conn->prepare('SELECT COALESCE(MAX(item_idx), -1) AS max_idx FROM tratamientos_enfermeria_items WHERE tratamiento_id = ?');
                $maxIdx = -1;
                if ($stmtMaxIdx) {
                    $stmtMaxIdx->bind_param('i', $lastId);
                    $stmtMaxIdx->execute();
                    $maxIdx = (int)($stmtMaxIdx->get_result()->fetch_assoc()['max_idx'] ?? -1);
                    $stmtMaxIdx->close();
                }
                tph_append_items_to_plan($conn, $lastId, $addedItems, $maxIdx + 1);
            }
            return; // conservar en_ejecucion, no crear nueva versión
        }

        // Cambio destructivo (se eliminó o modificó un medicamento): suspender y crear nueva versión
        $stmtSusp = $conn->prepare(
            'UPDATE tratamientos_enfermeria
             SET estado = "suspendido",
                 notas_enfermeria = CONCAT(
                    IFNULL(NULLIF(notas_enfermeria, ""), ""),
                    IF(IFNULL(NULLIF(notas_enfermeria, ""), "") = "", "", "\n"),
                    "Suspendido por actualización médica de la receta: ", DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")
                 )
             WHERE id = ? AND estado = "en_ejecucion" LIMIT 1'
        );
        if ($stmtSusp) {
            $stmtSusp->bind_param('i', $lastId);
            $stmtSusp->execute();
            $stmtSusp->close();
        }
    }

    $newVersion = $lastVersion + 1;
    $stmtInsertVersion = $conn->prepare(
        'INSERT INTO tratamientos_enfermeria
            (consulta_id, paciente_id, receta_snapshot, tratamiento_texto, estado, version_num, origen_tratamiento_id)
         VALUES (?, ?, ?, ?, "pendiente", ?, ?)'
    );
    if (!$stmtInsertVersion) return;
    $stmtInsertVersion->bind_param('iissii', $consulta_id, $pacienteId, $recetaJson, $tratamientoTexto, $newVersion, $lastId);
    $okVersion = $stmtInsertVersion->execute();
    $newTratamientoId = $okVersion ? (int)$stmtInsertVersion->insert_id : 0;
    $stmtInsertVersion->close();

    if ($newTratamientoId > 0) {
        hc_rebuild_plan_multidia($conn, $newTratamientoId, $receta);
    }
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : 0;
        $hc_id = isset($_GET['hc_id']) ? intval($_GET['hc_id']) : 0;
        $includeChain = hc_bool_query_param('include_chain', false);

        if ($consulta_id <= 0 && $hc_id <= 0) {
            echo json_encode(['success' => false, 'error' => 'Falta consulta_id o hc_id']);
            exit;
        }

        $targetConsultaId = $consulta_id > 0 ? $consulta_id : null;
        $templateMeta = null;
        $templateResolution = null;

        if ($hc_id > 0) {
            $stmt = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE id = ? LIMIT 1');
            $stmt->bind_param('i', $hc_id);
        } else {
            $stmt = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
            $stmt->bind_param('i', $consulta_id);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        $stmt->close();

        // Compatibilidad histórica: algunos flujos guardaron hc_origen_id como consulta_id.
        if (!$row && $hc_id > 0) {
            $stmtLegacy = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
            if ($stmtLegacy) {
                $stmtLegacy->bind_param('i', $hc_id);
                $stmtLegacy->execute();
                $resLegacy = $stmtLegacy->get_result();
                $row = $resLegacy->fetch_assoc();
                $stmtLegacy->close();
            }
        }

        if ($row) {
            $targetConsultaId = (int)($row['consulta_id'] ?? 0);
            $datos = json_decode($row['datos'], true);
            if (!is_array($datos)) {
                $datos = [];
            }
            [$templateMeta, $templateResolution] = hc_resolve_template_for_hc($conn, $targetConsultaId, is_array($datos) ? $datos : []);
            $historialPrevias = $includeChain
                ? hc_get_historial_cadena_previas($conn, $targetConsultaId)
                : null;
            $proximaContratoEvento = hc_resolver_proxima_cita_contrato($conn, $targetConsultaId);
            $datos = hc_normalizar_proxima_cita_contrato($datos, $proximaContratoEvento);

            echo json_encode([
                'success' => true,
                'hc_id' => (int)($row['id'] ?? 0),
                'consulta_id' => $targetConsultaId,
                'fecha_registro' => (string)($row['fecha_registro'] ?? ''),
                'datos' => $datos,
                'template' => $templateMeta,
                'template_resolution' => $templateResolution,
                'historias_previas' => $historialPrevias,
                'total_historias_previas' => is_array($historialPrevias) ? count($historialPrevias) : null,
                'proxima_contrato_evento' => $proximaContratoEvento,
            ]);
        } else {
            $historialPrevias = ($includeChain && $consulta_id > 0)
                ? hc_get_historial_cadena_previas($conn, $consulta_id)
                : null;
            $resolved = hc_resolve_template($conn, [
                'consulta_id' => (int)($targetConsultaId ?? 0),
            ]);
            if (is_array($resolved) && ($resolved['success'] ?? false)) {
                $templateMeta = $resolved['template'] ?? null;
                $templateResolution = $resolved['resolution'] ?? null;
            }

            echo json_encode([
                'success' => false,
                'error' => $hc_id > 0
                    ? 'No existe historia clínica para el hc_id indicado'
                    : 'No existe historia clínica para esta consulta',
                'template' => $templateMeta,
                'template_resolution' => $templateResolution,
                'historias_previas' => $historialPrevias,
                'total_historias_previas' => is_array($historialPrevias) ? count($historialPrevias) : null,
            ]);
        }
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = $data['consulta_id'] ?? null;
        $datos = $data['datos'] ?? null;
        if (!$consulta_id || !$datos) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        if (is_array($datos)) {
            $datos = hc_sanitizar_diagnosticos($datos);
            $datos = hc_prepare_template_for_save($conn, (int)$consulta_id, $datos);
        }

        // Verificar si ya existe HC para esta consulta
        $stmt_check = $conn->prepare('SELECT id FROM historia_clinica WHERE consulta_id = ?');
        $stmt_check->bind_param('i', $consulta_id);
        $stmt_check->execute();
        $res_check = $stmt_check->get_result();
        $hcRow = $res_check->fetch_assoc();
        $hcActualId = 0;
        $ok = false;

        if ($hcRow) {
            $hcActualId = (int)($hcRow['id'] ?? 0);
            // Ya existe: actualizar
            $json = json_encode($datos);
            $stmt = $conn->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE consulta_id = ?');
            $stmt->bind_param('si', $json, $consulta_id);
            $ok = $stmt->execute();
            $stmt->close();
        } else {
            // No existe: insertar
            $json = json_encode($datos);
            $stmt = $conn->prepare('INSERT INTO historia_clinica (consulta_id, datos) VALUES (?, ?)');
            $stmt->bind_param('is', $consulta_id, $json);
            $ok = $stmt->execute();
            if ($ok) {
                $hcActualId = (int)$stmt->insert_id;
            }
            $stmt->close();
        }

        if (!$ok) {
            echo json_encode([
                'success' => false,
                'error' => 'No se pudo guardar la historia clínica',
            ]);
            $stmt_check->close();
            exit;
        }

        // Encadenar HC: resolver parent canonico y persistir campos de cadena
        hc_actualizar_cadena_hc($conn, $hcActualId, (int)$consulta_id);

        // Reanclar proxima cita futura si existe una consulta intermedia, para
        // preservar una linea clinica secuencial (A -> B -> C).
        hc_reanclar_proxima_cita_futura($conn, $hcActualId, (int)$consulta_id);

        // Retro-vincular: si esta consulta pertenece a un contrato, buscar el evento
        // inmediatamente siguiente y actualizar su hc_origen_id al consulta_id actual.
        // Esto resuelve el timing gap: cuando el contrato programó el evento B, la HC de A
        // aún no existía, así que B.hc_origen_id quedó en 0. Al guardar la HC de A ahora
        // se corrige B.hc_origen_id = A.consulta_id para que la cadena quede activa.
        hc_retrovincular_siguiente_evento_contrato($conn, (int)$consulta_id);

        // Sincronizar receta médica a cotización lo antes posible para no perder el flujo
        // si falla una etapa posterior (ej. programación de próxima cita).
        $syncReceta = null;
        try {
            $syncReceta = hc_sincronizar_receta_a_cotizacion($conn, (int)$consulta_id, (int)$hcActualId, $datos);
        } catch (Throwable $e) {
            $syncReceta = [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }

        $proximaResultado = null;
        try {
            if (is_array($datos) && isset($datos['proxima_cita']) && is_array($datos['proxima_cita'])) {
                $origenProxima = strtolower(trim((string)($datos['proxima_cita']['origen'] ?? '')));

                if ($origenProxima === 'contrato_agenda') {
                    $proximaContratoEvento = hc_resolver_proxima_cita_contrato($conn, (int)$consulta_id);
                    $datos = hc_normalizar_proxima_cita_contrato($datos, $proximaContratoEvento);

                    // Si es último evento de contrato, no programar próxima cita automática.
                    if (!empty($datos['proxima_cita']) && is_array($datos['proxima_cita']) && empty($datos['proxima_cita']['programar'])) {
                        $datos['proxima_cita'] = hc_append_proxima_historial($datos['proxima_cita'], [
                            'accion' => 'omitida_por_fin_contrato',
                            'fecha_evento' => date('Y-m-d H:i:s'),
                            'actor' => hc_actor_label(),
                            'motivo' => 'No existe un siguiente evento de contrato programado.',
                        ]);

                        $jsonConNormalizacion = json_encode($datos);
                        $stmtNormalize = $conn->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE id = ? LIMIT 1');
                        if ($stmtNormalize) {
                            $stmtNormalize->bind_param('si', $jsonConNormalizacion, $hcActualId);
                            $stmtNormalize->execute();
                            $stmtNormalize->close();
                        }
                    }
                }

                if (!empty($datos['proxima_cita']['programar'])) {
                    $proximaResultado = hc_programar_proxima_cita($conn, (int)$consulta_id, $datos['proxima_cita'], $hcActualId);
                }
                if (is_array($proximaResultado)) {
                    $datos['proxima_cita']['consulta_id'] = (int)($proximaResultado['consulta_id'] ?? 0);
                    $datos['proxima_cita']['programada_en'] = date('Y-m-d H:i:s');
                    $datos['proxima_cita']['programar'] = true;
                    $datos['proxima_cita']['origen'] = 'historia_clinica';
                    $datos['proxima_cita'] = hc_append_proxima_historial($datos['proxima_cita'], [
                        'accion' => 'programada_desde_hc',
                        'fecha_evento' => date('Y-m-d H:i:s'),
                        'actor' => hc_actor_label(),
                        'consulta_id' => (int)($proximaResultado['consulta_id'] ?? 0),
                        'fecha' => (string)($proximaResultado['fecha'] ?? ''),
                        'hora' => (string)($proximaResultado['hora'] ?? ''),
                    ]);

                    $jsonConProxima = json_encode($datos);
                    $stmtSync = $conn->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE id = ? LIMIT 1');
                    if ($stmtSync) {
                        $stmtSync->bind_param('si', $jsonConProxima, $hcActualId);
                        $stmtSync->execute();
                        $stmtSync->close();
                    }
                }
            }
        } catch (Throwable $e) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => $e->getMessage(),
            ]);
            $stmt_check->close();
            exit;
        }

        // Actualizar estado de la consulta a 'completada'
        $stmt_estado = $conn->prepare('UPDATE consultas SET estado = ? WHERE id = ?');
        $estado_completada = 'completada';
        $stmt_estado->bind_param('si', $estado_completada, $consulta_id);
        $stmt_estado->execute();
        $stmt_estado->close();

        // Sincronizar receta/tratamiento al panel de enfermeria
        hc_upsert_tratamiento_enfermeria($conn, (int)$consulta_id, $datos);

        echo json_encode([
            'success' => $ok,
            'proxima_cita' => $proximaResultado,
            'receta_cotizacion_sync' => $syncReceta,
        ]);
        $stmt_check->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
