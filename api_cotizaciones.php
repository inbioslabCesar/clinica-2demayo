<?php
require_once __DIR__ . '/init_api.php';
require_once "config.php";
require_once "auth_check.php";
require_once __DIR__ . '/modules/CotizacionSyncService.php';

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

function obtener_medico_desde_consulta($conn, $consultaId) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return null;

    $stmt = $conn->prepare("SELECT m.nombre, m.apellido FROM consultas c LEFT JOIN medicos m ON m.id = c.medico_id WHERE c.id = ? LIMIT 1");
    if (!$stmt) return null;
    $stmt->bind_param("i", $consultaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return null;

    $nombre = trim((string)($row['nombre'] ?? ''));
    $apellido = trim((string)($row['apellido'] ?? ''));
    if ($nombre === '' && $apellido === '') return null;

    return [
        'nombre' => $nombre,
        'apellido' => $apellido,
        'completo' => trim($nombre . ' ' . $apellido),
    ];
}

function obtener_medico_desde_tarifa($conn, $tarifaId) {
    $tarifaId = (int)$tarifaId;
    if ($tarifaId <= 0) return null;

    $stmt = $conn->prepare("SELECT m.nombre, m.apellido FROM tarifas t LEFT JOIN medicos m ON m.id = t.medico_id WHERE t.id = ? LIMIT 1");
    if (!$stmt) return null;
    $stmt->bind_param("i", $tarifaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return null;

    $nombre = trim((string)($row['nombre'] ?? ''));
    $apellido = trim((string)($row['apellido'] ?? ''));
    if ($nombre === '' && $apellido === '') return null;

    return [
        'nombre' => $nombre,
        'apellido' => $apellido,
        'completo' => trim($nombre . ' ' . $apellido),
    ];
}

function extraer_medico_desde_descripcion_consulta($descripcion) {
    $texto = trim((string)$descripcion);
    if ($texto === '') return '';

    // Patrón esperado: "... - NOMBRE MEDICO (YYYY-MM-DD HH:MM)"
    if (preg_match('/-\s*(.+?)\s*\(/u', $texto, $m)) {
        return trim((string)($m[1] ?? ''));
    }

    // Fallback: tomar lo que sigue al último " - " si existe.
    $pos = strrpos($texto, ' - ');
    if ($pos !== false) {
        return trim(substr($texto, $pos + 3));
    }

    return '';
}

function resolver_consulta_referente_por_cotizacion($conn, $cotizacionId) {
    $cotizacionId = (int)$cotizacionId;
    if ($cotizacionId <= 0) return 0;

    $stmtCot = $conn->prepare("SELECT paciente_id, fecha, observaciones FROM cotizaciones WHERE id = ? LIMIT 1");
    if (!$stmtCot) return 0;
    $stmtCot->bind_param("i", $cotizacionId);
    $stmtCot->execute();
    $cot = $stmtCot->get_result()->fetch_assoc();
    $stmtCot->close();
    if (!$cot) return 0;

    $obs = trim((string)($cot['observaciones'] ?? ''));
    if ($obs !== '' && preg_match('/consulta\s*#\s*(\d+)/i', $obs, $m)) {
        $idObs = (int)($m[1] ?? 0);
        if ($idObs > 0) return $idObs;
    }

    return 0;
}

function cargar_detalles_cotizacion($conn, $cotizacionId) {
    $hasMedicoId = column_exists($conn, 'cotizaciones_detalle', 'medico_id');
    $hasConsultaId = column_exists($conn, 'cotizaciones_detalle', 'consulta_id');
    $select = 'cd.*';
    $join = '';

    if ($hasMedicoId) {
        $join .= ' LEFT JOIN medicos m ON m.id = cd.medico_id';
    }

    if ($hasConsultaId) {
        $join .= ' LEFT JOIN consultas con ON con.id = cd.consulta_id';
        $join .= ' LEFT JOIN medicos mc ON mc.id = con.medico_id';
    }

    if ($hasMedicoId && $hasConsultaId) {
        $select .= ", COALESCE(m.nombre, mc.nombre, '') AS medico_nombre, COALESCE(m.apellido, mc.apellido, '') AS medico_apellido";
        $select .= ", TRIM(CONCAT(COALESCE(m.nombre, mc.nombre, ''), ' ', COALESCE(m.apellido, mc.apellido, ''))) AS medico_nombre_completo";
    } elseif ($hasMedicoId) {
        $select .= ", COALESCE(m.nombre, '') AS medico_nombre, COALESCE(m.apellido, '') AS medico_apellido";
        $select .= ", TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))) AS medico_nombre_completo";
    } elseif ($hasConsultaId) {
        $select .= ", COALESCE(mc.nombre, '') AS medico_nombre, COALESCE(mc.apellido, '') AS medico_apellido";
        $select .= ", TRIM(CONCAT(COALESCE(mc.nombre, ''), ' ', COALESCE(mc.apellido, ''))) AS medico_nombre_completo";
    }

    $sql = "SELECT {$select} FROM cotizaciones_detalle cd{$join} WHERE cd.cotizacion_id = ?";
    if (column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
        $sql .= " AND cd.estado_item <> 'eliminado'";
    }
    $sql .= " ORDER BY cd.id ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $cotizacionId);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    if (empty($rows)) return $rows;

    $consultaFallbackId = 0;
    $medicoCachePorConsulta = [];
    $medicoCachePorTarifa = [];

    foreach ($rows as &$row) {
        $tipo = strtolower(trim((string)($row['servicio_tipo'] ?? '')));
        if ($tipo === 'rayos x' || $tipo === 'rayos_x') {
            $tipo = 'rayosx';
        }

        $medicoCompleto = trim((string)($row['medico_nombre_completo'] ?? ''));
        if ($medicoCompleto !== '') continue;

        $medico = null;

        if ($tipo === 'consulta') {
            // Priorizar médico explícito del texto descriptivo para evitar cruces
            // cuando no existen columnas de vínculo (consulta_id/medico_id) en detalles.
            $desdeDescripcion = extraer_medico_desde_descripcion_consulta($row['descripcion'] ?? '');
            if ($desdeDescripcion !== '') {
                $row['medico_nombre_completo'] = $desdeDescripcion;
                $row['medico_nombre'] = $desdeDescripcion;
                $row['medico_apellido'] = '';
                continue;
            }

            $consultaId = (int)($row['consulta_id'] ?? 0);
            if ($consultaId <= 0) {
                if ($consultaFallbackId <= 0) {
                    $consultaFallbackId = resolver_consulta_referente_por_cotizacion($conn, $cotizacionId);
                }
                $consultaId = $consultaFallbackId;
            }
            if ($consultaId > 0) {
                if (!isset($medicoCachePorConsulta[$consultaId])) {
                    $medicoCachePorConsulta[$consultaId] = obtener_medico_desde_consulta($conn, $consultaId);
                }
                $medico = $medicoCachePorConsulta[$consultaId];
            }
        } elseif ($tipo === 'ecografia' || $tipo === 'rayosx') {
            $tarifaId = (int)($row['servicio_id'] ?? 0);
            if ($tarifaId > 0) {
                if (!isset($medicoCachePorTarifa[$tarifaId])) {
                    $medicoCachePorTarifa[$tarifaId] = obtener_medico_desde_tarifa($conn, $tarifaId);
                }
                $medico = $medicoCachePorTarifa[$tarifaId];
            }
        }

        if (!$medico) continue;

        $row['medico_nombre'] = $medico['nombre'];
        $row['medico_apellido'] = $medico['apellido'];
        $row['medico_nombre_completo'] = $medico['completo'];
    }
    unset($row);

    return $rows;
}

function obtener_cotizacion($conn, $cotizacionId) {
    $stmt = $conn->prepare("
        SELECT c.*, p.nombre, p.apellido, p.dni, p.historia_clinica,
               COALESCE(u.nombre, 'Sistema') as usuario_nombre
        FROM cotizaciones c
        JOIN pacientes p ON c.paciente_id = p.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
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
    $hasDerivado = column_exists($conn, 'cotizaciones_detalle', 'derivado');
    $hasTipoDeriv = column_exists($conn, 'cotizaciones_detalle', 'tipo_derivacion');
    $hasValorDeriv = column_exists($conn, 'cotizaciones_detalle', 'valor_derivacion');
    $hasLabRef = column_exists($conn, 'cotizaciones_detalle', 'laboratorio_referencia');
    $usaCamposDerivacion = $hasDerivado && $hasTipoDeriv && $hasValorDeriv && $hasLabRef;
    $hasConsultaId = column_exists($conn, 'cotizaciones_detalle', 'consulta_id');
    $hasMedicoId = column_exists($conn, 'cotizaciones_detalle', 'medico_id');

    foreach ($detalles as $detalle) {
        $servicioTipo = $detalle['servicio_tipo'] ?? '';
        $servicioId = isset($detalle['servicio_id']) ? (int)$detalle['servicio_id'] : null;
        $descripcion = $detalle['descripcion'] ?? '';
        $cantidad = isset($detalle['cantidad']) ? (int)$detalle['cantidad'] : 1;
        $precio = isset($detalle['precio_unitario']) ? (float)$detalle['precio_unitario'] : 0;
        $subtotal = isset($detalle['subtotal']) ? (float)$detalle['subtotal'] : ($precio * $cantidad);
        $derivado = !empty($detalle['derivado']) ? 1 : 0;
        $tipoDeriv = isset($detalle['tipo_derivacion']) ? (string)$detalle['tipo_derivacion'] : '';
        $valorDeriv = isset($detalle['valor_derivacion']) ? (float)$detalle['valor_derivacion'] : 0;
        $labRef = isset($detalle['laboratorio_referencia']) ? (string)$detalle['laboratorio_referencia'] : '';

        if ($usaDetalleV2) {
            if ($usaCamposDerivacion) {
                $stmt = $conn->prepare(
                    "INSERT INTO cotizaciones_detalle
                     (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, derivado, tipo_derivacion, valor_derivacion, laboratorio_referencia, estado_item, version_item, editado_por, editado_en, motivo_edicion)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', 1, ?, NOW(), ?)"
                );
            } else {
                $stmt = $conn->prepare(
                    "INSERT INTO cotizaciones_detalle
                     (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, estado_item, version_item, editado_por, editado_en, motivo_edicion)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', 1, ?, NOW(), ?)"
                );
            }
            if (!$stmt) {
                throw new Exception('Error preparando detalle v2: ' . $conn->error);
            }
            if ($usaCamposDerivacion) {
                $stmt->bind_param(
                    "isisiddisdsis",
                    $cotizacionId,
                    $servicioTipo,
                    $servicioId,
                    $descripcion,
                    $cantidad,
                    $precio,
                    $subtotal,
                    $derivado,
                    $tipoDeriv,
                    $valorDeriv,
                    $labRef,
                    $usuarioId,
                    $motivoEdicion
                );
            } else {
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
            }
        } else {
            if ($usaCamposDerivacion) {
                $stmt = $conn->prepare(
                    "INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, derivado, tipo_derivacion, valor_derivacion, laboratorio_referencia)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
            } else {
                $stmt = $conn->prepare(
                    "INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?, ?)"
                );
            }
            if (!$stmt) {
                throw new Exception('Error preparando detalle: ' . $conn->error);
            }
            if ($usaCamposDerivacion) {
                $stmt->bind_param(
                    "isisiddisds",
                    $cotizacionId,
                    $servicioTipo,
                    $servicioId,
                    $descripcion,
                    $cantidad,
                    $precio,
                    $subtotal,
                    $derivado,
                    $tipoDeriv,
                    $valorDeriv,
                    $labRef
                );
            } else {
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
        }
        if ($stmt) {
            $stmt->execute();

            // Mantener trazabilidad clínica de consulta cuando el esquema lo soporte.
            $detalleId = (int)$conn->insert_id;
            if ($detalleId > 0 && ($hasConsultaId || $hasMedicoId)) {
                $consultaId = isset($detalle['consulta_id']) ? (int)$detalle['consulta_id'] : 0;
                $medicoId = isset($detalle['medico_id']) ? (int)$detalle['medico_id'] : 0;

                $sets = [];
                $types = '';
                $params = [];

                if ($hasConsultaId && $consultaId > 0) {
                    $sets[] = 'consulta_id = ?';
                    $types .= 'i';
                    $params[] = $consultaId;
                }

                if ($hasMedicoId && $medicoId > 0) {
                    $sets[] = 'medico_id = ?';
                    $types .= 'i';
                    $params[] = $medicoId;
                }

                if (!empty($sets)) {
                    $sqlMeta = 'UPDATE cotizaciones_detalle SET ' . implode(', ', $sets) . ' WHERE id = ?';
                    $types .= 'i';
                    $params[] = $detalleId;
                    $stmtMeta = $conn->prepare($sqlMeta);
                    if ($stmtMeta) {
                        $stmtMeta->bind_param($types, ...$params);
                        $stmtMeta->execute();
                    }
                }
            }
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

function registrar_movimientos_lab_ref_desde_cotizacion($conn, $pacienteId, $detalles, $usuarioId = null, $cotizacionId = null) {
    if (!table_exists($conn, 'laboratorio_referencia_movimientos')) {
        return;
    }
    $hasCotizacionId = column_exists($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');

    $turnoCobroDefault = '';
    if ($usuarioId && table_exists($conn, 'cajas')) {
        $stmtCaja = $conn->prepare("SELECT turno FROM cajas WHERE estado = 'abierta' AND usuario_id = ? ORDER BY created_at DESC LIMIT 1");
        if ($stmtCaja) {
            $stmtCaja->bind_param('i', $usuarioId);
            $stmtCaja->execute();
            $rowCaja = $stmtCaja->get_result()->fetch_assoc();
            if ($rowCaja && !empty($rowCaja['turno'])) {
                $turnoCobroDefault = strtolower(trim((string)$rowCaja['turno']));
            }
        }
    }

    foreach ((array)$detalles as $det) {
        $tipoServicio = strtolower(trim((string)($det['servicio_tipo'] ?? '')));
        if ($tipoServicio !== 'laboratorio') continue;
        if (empty($det['derivado'])) continue;

        $tipoDeriv = strtolower(trim((string)($det['tipo_derivacion'] ?? '')));
        $valorDeriv = isset($det['valor_derivacion']) ? (float)$det['valor_derivacion'] : 0;
        $subtotal = isset($det['subtotal']) ? (float)$det['subtotal'] : 0;
        $montoLiquidar = 0;
        if ($tipoDeriv === 'monto') {
            $montoLiquidar = $valorDeriv;
        } elseif ($tipoDeriv === 'porcentaje') {
            $montoLiquidar = round($subtotal * $valorDeriv / 100, 2);
        }

        $examenId = isset($det['servicio_id']) ? (int)$det['servicio_id'] : 0;
        if ($examenId <= 0 || $montoLiquidar < 0) continue;

        $laboratorio = trim((string)($det['laboratorio_referencia'] ?? ''));
        $observaciones = (string)($det['descripcion'] ?? '');
        $estado = 'pendiente';
        $cobroIdPendiente = 0;
        $turnoCobro = $turnoCobroDefault;

        if ($hasCotizacionId) {
            $stmt = $conn->prepare(
                "INSERT INTO laboratorio_referencia_movimientos (cobro_id, cotizacion_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, fecha, hora, observaciones, cobrado_por, turno_cobro, hora_cobro)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, CURTIME())"
            );
        } else {
            $stmt = $conn->prepare(
                "INSERT INTO laboratorio_referencia_movimientos (cobro_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, fecha, hora, observaciones, cobrado_por, turno_cobro, hora_cobro)
                   VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, CURTIME())"
            );
        }
        if (!$stmt) continue;
        $usuarioCobro = (int)($usuarioId ?? 0);
        if ($hasCotizacionId) {
            $cotizId = (int)($cotizacionId ?? 0);
            $stmt->bind_param(
                "iiisdssisis",
                $cobroIdPendiente,
                $cotizId,
                $examenId,
                $laboratorio,
                $montoLiquidar,
                $tipoDeriv,
                $estado,
                $pacienteId,
                $observaciones,
                $usuarioCobro,
                $turnoCobro
            );
        } else {
            $stmt->bind_param(
                "iisdssisis",
                $cobroIdPendiente,
                $examenId,
                $laboratorio,
                $montoLiquidar,
                $tipoDeriv,
                $estado,
                $pacienteId,
                $observaciones,
                $usuarioCobro,
                $turnoCobro
            );
        }
        $stmt->execute();
    }
}

function es_valor_verdadero($value) {
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return (float)$value === 1.0;
    $normalized = strtolower(trim((string)$value));
    return in_array($normalized, ['1', 'true', 'si', 'sí', 'yes'], true);
}

function monto_derivacion_desde_detalle($det) {
    $tipoDeriv = strtolower(trim((string)($det['tipo_derivacion'] ?? '')));
    $valorDeriv = isset($det['valor_derivacion']) ? (float)$det['valor_derivacion'] : 0;
    $subtotal = isset($det['subtotal']) ? (float)$det['subtotal'] : 0;
    if ($tipoDeriv === 'monto') return $valorDeriv;
    if ($tipoDeriv === 'porcentaje') return round($subtotal * $valorDeriv / 100, 2);
    return 0;
}

function normalizar_detalles_lab_derivados($detalles) {
    $norm = [];
    foreach ((array)$detalles as $det) {
        $tipoServicio = strtolower(trim((string)($det['servicio_tipo'] ?? '')));
        if ($tipoServicio !== 'laboratorio') continue;
        if (!es_valor_verdadero($det['derivado'] ?? null)) continue;

        $examenId = isset($det['servicio_id']) ? (int)$det['servicio_id'] : 0;
        $laboratorio = trim((string)($det['laboratorio_referencia'] ?? ''));
        $tipo = strtolower(trim((string)($det['tipo_derivacion'] ?? '')));
        $monto = monto_derivacion_desde_detalle($det);
        $observaciones = (string)($det['descripcion'] ?? '');

        if ($examenId <= 0 || $laboratorio === '' || $tipo === '' || $monto < 0) continue;

        $norm[] = [
            'examen_id' => $examenId,
            'laboratorio' => $laboratorio,
            'tipo' => $tipo,
            'monto' => round((float)$monto, 2),
            'observaciones' => $observaciones,
        ];
    }
    return $norm;
}

function key_mov_lab_ref($item) {
    $monto = isset($item['monto']) ? round((float)$item['monto'], 2) : 0;
    return implode('|', [
        (int)($item['examen_id'] ?? 0),
        trim((string)($item['laboratorio'] ?? '')),
        strtolower(trim((string)($item['tipo'] ?? ''))),
        number_format($monto, 2, '.', ''),
        trim((string)($item['observaciones'] ?? '')),
    ]);
}

function contar_por_firma($items) {
    $count = [];
    foreach ((array)$items as $it) {
        $k = key_mov_lab_ref($it);
        if (!isset($count[$k])) {
            $count[$k] = ['n' => 0, 'item' => $it];
        }
        $count[$k]['n'] += 1;
    }
    return $count;
}

function obtener_mov_lab_ref_pendientes_por_cotizacion($conn, $cotizacionId) {
    $hasCotizacionId = column_exists($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
    if (!$hasCotizacionId || (int)$cotizacionId <= 0) return [];

    $stmt = $conn->prepare(
        "SELECT examen_id, laboratorio, tipo, monto, observaciones
           FROM laboratorio_referencia_movimientos
          WHERE cobro_id = 0
            AND estado = 'pendiente'
            AND cotizacion_id = ?"
    );
    if (!$stmt) return [];
    $stmt->bind_param('i', $cotizacionId);
    $stmt->execute();
    $res = $stmt->get_result();
    $items = [];
    while ($row = $res->fetch_assoc()) {
        $items[] = [
            'examen_id' => (int)($row['examen_id'] ?? 0),
            'laboratorio' => (string)($row['laboratorio'] ?? ''),
            'tipo' => strtolower(trim((string)($row['tipo'] ?? ''))),
            'monto' => round((float)($row['monto'] ?? 0), 2),
            'observaciones' => (string)($row['observaciones'] ?? ''),
        ];
    }
    return $items;
}

function obtener_turno_abierto_usuario($conn, $usuarioId) {
    $turno = '';
    if (!$usuarioId || !table_exists($conn, 'cajas')) return $turno;
    $stmtCaja = $conn->prepare("SELECT turno FROM cajas WHERE estado = 'abierta' AND usuario_id = ? ORDER BY created_at DESC LIMIT 1");
    if (!$stmtCaja) return $turno;
    $stmtCaja->bind_param('i', $usuarioId);
    $stmtCaja->execute();
    $rowCaja = $stmtCaja->get_result()->fetch_assoc();
    if ($rowCaja && !empty($rowCaja['turno'])) {
        $turno = strtolower(trim((string)$rowCaja['turno']));
    }
    return $turno;
}

function insertar_mov_lab_ref_pendiente($conn, $pacienteId, $item, $usuarioId = null, $turnoCobro = '', $cotizacionId = null) {
    $hasCotizacionId = column_exists($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
    if ($hasCotizacionId) {
        $stmt = $conn->prepare(
            "INSERT INTO laboratorio_referencia_movimientos (cobro_id, cotizacion_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, fecha, hora, observaciones, cobrado_por, turno_cobro, hora_cobro)
               VALUES (0, ?, ?, ?, ?, ?, 'pendiente', ?, CURDATE(), CURTIME(), ?, ?, ?, CURTIME())"
        );
    } else {
        $stmt = $conn->prepare(
            "INSERT INTO laboratorio_referencia_movimientos (cobro_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, fecha, hora, observaciones, cobrado_por, turno_cobro, hora_cobro)
               VALUES (0, ?, ?, ?, ?, 'pendiente', ?, CURDATE(), CURTIME(), ?, ?, ?, CURTIME())"
        );
    }
    if (!$stmt) return;
    $examenId = (int)$item['examen_id'];
    $laboratorio = (string)$item['laboratorio'];
    $monto = (float)$item['monto'];
    $tipo = (string)$item['tipo'];
    $observaciones = (string)$item['observaciones'];
    $usuarioCobro = (int)($usuarioId ?? 0);
    if ($hasCotizacionId) {
        $cotizId = (int)($cotizacionId ?? 0);
        $stmt->bind_param(
            "iisdsisis",
            $cotizId,
            $examenId,
            $laboratorio,
            $monto,
            $tipo,
            $pacienteId,
            $observaciones,
            $usuarioCobro,
            $turnoCobro
        );
    } else {
        $stmt->bind_param(
            "isdsisis",
            $examenId,
            $laboratorio,
            $monto,
            $tipo,
            $pacienteId,
            $observaciones,
            $usuarioCobro,
            $turnoCobro
        );
    }
    $stmt->execute();
}

function eliminar_mov_lab_ref_pendiente_uno($conn, $pacienteId, $item, $cotizacionId = null) {
    $hasCotizacionId = column_exists($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
    $findBySignature = function($withCotizacion) use ($conn, $hasCotizacionId, $cotizacionId, $pacienteId, $item) {
        if ($withCotizacion && $hasCotizacionId && (int)$cotizacionId > 0) {
            $stmtFind = $conn->prepare(
                "SELECT id
                   FROM laboratorio_referencia_movimientos
                  WHERE cobro_id = 0
                    AND estado = 'pendiente'
                    AND cotizacion_id = ?
                    AND paciente_id = ?
                    AND examen_id = ?
                    AND laboratorio = ?
                    AND tipo = ?
                    AND ABS(monto - ?) < 0.01
                    AND observaciones = ?
                  ORDER BY id DESC
                  LIMIT 1"
            );
            if (!$stmtFind) return null;

            $examenId = (int)$item['examen_id'];
            $laboratorio = (string)$item['laboratorio'];
            $tipo = (string)$item['tipo'];
            $monto = (float)$item['monto'];
            $observaciones = (string)$item['observaciones'];
            $cotizId = (int)$cotizacionId;
            $stmtFind->bind_param("iiissds", $cotizId, $pacienteId, $examenId, $laboratorio, $tipo, $monto, $observaciones);
            $stmtFind->execute();
            $row = $stmtFind->get_result()->fetch_assoc();
            return ($row && !empty($row['id'])) ? (int)$row['id'] : null;
        }

        $stmtFind = $conn->prepare(
            "SELECT id
               FROM laboratorio_referencia_movimientos
              WHERE cobro_id = 0
                AND estado = 'pendiente'
                AND paciente_id = ?
                AND examen_id = ?
                AND laboratorio = ?
                AND tipo = ?
                AND ABS(monto - ?) < 0.01
                AND observaciones = ?
              ORDER BY id DESC
              LIMIT 1"
        );
        if (!$stmtFind) return null;

        $examenId = (int)$item['examen_id'];
        $laboratorio = (string)$item['laboratorio'];
        $tipo = (string)$item['tipo'];
        $monto = (float)$item['monto'];
        $observaciones = (string)$item['observaciones'];
        $stmtFind->bind_param("iissds", $pacienteId, $examenId, $laboratorio, $tipo, $monto, $observaciones);
        $stmtFind->execute();
        $row = $stmtFind->get_result()->fetch_assoc();
        return ($row && !empty($row['id'])) ? (int)$row['id'] : null;
    };

    $id = $findBySignature(true);
    if (!$id) {
        $id = $findBySignature(false);
    }
    if (!$id) return false;
    $stmtDel = $conn->prepare("DELETE FROM laboratorio_referencia_movimientos WHERE id = ?");
    if (!$stmtDel) return false;
    $stmtDel->bind_param("i", $id);
    return (bool)$stmtDel->execute();
}

function sincronizar_movimientos_lab_ref_en_edicion_cotizacion($conn, $pacienteId, $detallesAntes, $detallesDespues, $usuarioId = null, $cotizacionId = null) {
    if (!table_exists($conn, 'laboratorio_referencia_movimientos')) return;

    $antes = obtener_mov_lab_ref_pendientes_por_cotizacion($conn, $cotizacionId);
    if (empty($antes)) {
        // Fallback para esquemas/filas antiguas sin vínculo de cotización.
        $antes = normalizar_detalles_lab_derivados($detallesAntes);
    }
    $despues = normalizar_detalles_lab_derivados($detallesDespues);

    $countAntes = contar_por_firma($antes);
    $countDespues = contar_por_firma($despues);
    $turnoCobro = obtener_turno_abierto_usuario($conn, $usuarioId);

    foreach ($countAntes as $key => $metaAntes) {
        $nAntes = (int)$metaAntes['n'];
        $nDesp = isset($countDespues[$key]) ? (int)$countDespues[$key]['n'] : 0;
        $delta = $nAntes - $nDesp;
        if ($delta <= 0) continue;

        for ($i = 0; $i < $delta; $i++) {
            eliminar_mov_lab_ref_pendiente_uno($conn, $pacienteId, $metaAntes['item'], $cotizacionId);
        }
    }

    foreach ($countDespues as $key => $metaDesp) {
        $nDesp = (int)$metaDesp['n'];
        $nAntes = isset($countAntes[$key]) ? (int)$countAntes[$key]['n'] : 0;
        $delta = $nDesp - $nAntes;
        if ($delta <= 0) continue;

        for ($i = 0; $i < $delta; $i++) {
            insertar_mov_lab_ref_pendiente($conn, $pacienteId, $metaDesp['item'], $usuarioId, $turnoCobro, $cotizacionId);
        }
    }
}

function cancelar_ordenes_laboratorio_por_cotizacion($conn, $cotizacionId) {
    if (!table_exists($conn, 'ordenes_laboratorio')) {
        return;
    }

    // Cancelar por cotizacion_id directo (órdenes creadas al guardar la cotización)
    $chkCol = $conn->query("SHOW COLUMNS FROM ordenes_laboratorio LIKE 'cotizacion_id'");
    if ($chkCol && $chkCol->num_rows > 0) {
        $stmtCot = $conn->prepare("UPDATE ordenes_laboratorio SET estado = 'cancelada' WHERE cotizacion_id = ? AND estado <> 'completado'");
        if ($stmtCot) {
            $stmtCot->bind_param("i", $cotizacionId);
            $stmtCot->execute();
            $stmtCot->close();
        }
    }

    // Cancelar también por cobro_id (órdenes creadas en el momento del cobro)
    if (!table_exists($conn, 'cotizacion_movimientos')) return;

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

function crear_ordenes_lab_cotizacion(mysqli $conn, int $cotizacionId, int $pacienteId, array $detalles) {
    if (!table_exists($conn, 'ordenes_laboratorio')) return;

    // Recolectar exámenes NO derivados (los derivados van a laboratorio_referencia_movimientos)
    $examIds = [];
    foreach ($detalles as $det) {
        if (strtolower(trim((string)($det['servicio_tipo'] ?? ''))) !== 'laboratorio') continue;
        if (!empty($det['derivado'])) continue;
        $sId = intval($det['servicio_id'] ?? 0);
        if ($sId > 0) $examIds[] = $sId;
    }
    if (empty($examIds)) return;

    // Si ya existe una orden para esta cotización, no duplicar
    $chkCol = $conn->query("SHOW COLUMNS FROM ordenes_laboratorio LIKE 'cotizacion_id'");
    if ($chkCol && $chkCol->num_rows > 0) {
        $stmtChk = $conn->prepare("SELECT id FROM ordenes_laboratorio WHERE cotizacion_id = ? LIMIT 1");
        if ($stmtChk) {
            $stmtChk->bind_param("i", $cotizacionId);
            $stmtChk->execute();
            $exists = $stmtChk->get_result()->fetch_assoc();
            $stmtChk->close();
            if ($exists) return;
        }
        $json = json_encode(array_values($examIds));
        $stmt = $conn->prepare("INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id) VALUES (?, ?, ?)");
        if ($stmt) {
            $stmt->bind_param("isi", $cotizacionId, $json, $pacienteId);
            $stmt->execute();
            $stmt->close();
        }
    } else {
        $json = json_encode(array_values($examIds));
        $stmt = $conn->prepare("INSERT INTO ordenes_laboratorio (examenes, paciente_id) VALUES (?, ?)");
        if ($stmt) {
            $stmt->bind_param("si", $json, $pacienteId);
            $stmt->execute();
            $stmt->close();
        }
    }
}

function resolver_tipo_orden_imagen($servicioTipo, $descripcion = '') {
    $tipo = strtolower(trim((string)$servicioTipo));
    $desc = strtolower(trim((string)$descripcion));

    if ($tipo === 'rayosx' || $tipo === 'rayos_x' || $tipo === 'rayos x' || $tipo === 'rx') {
        return 'rx';
    }
    if ($tipo === 'ecografia') {
        return 'ecografia';
    }
    if ($tipo === 'tomografia') {
        return 'tomografia';
    }
    if ($tipo === 'procedimiento' || $tipo === 'procedimientos') {
        if (preg_match('/tomograf|\btac\b/u', $desc)) {
            return 'tomografia';
        }
        if (preg_match('/rayos\s*x|\brx\b/u', $desc)) {
            return 'rx';
        }
        if (preg_match('/ecograf/i', $desc)) {
            return 'ecografia';
        }
    }

    return null;
}

function crear_ordenes_imagen_cotizacion(mysqli $conn, int $cotizacionId, int $pacienteId, array $detalles) {
    if (!table_exists($conn, 'ordenes_imagen')) return;
    if ($cotizacionId <= 0 || $pacienteId <= 0 || empty($detalles)) return;

    $tipos = [];
    foreach ($detalles as $det) {
        $tipo = resolver_tipo_orden_imagen($det['servicio_tipo'] ?? '', $det['descripcion'] ?? '');
        if ($tipo) {
            $tipos[$tipo] = true;
        }
    }
    if (empty($tipos)) return;

    $hasCotizacionId = column_exists($conn, 'ordenes_imagen', 'cotizacion_id');
    $hasSolicitadoPor = column_exists($conn, 'ordenes_imagen', 'solicitado_por');
    $hasCargaAnticipada = column_exists($conn, 'ordenes_imagen', 'carga_anticipada');
    $usuarioId = get_user_id_from_session();

    foreach (array_keys($tipos) as $tipoOrden) {
        if ($hasCotizacionId) {
            $stmtChk = $conn->prepare('SELECT id FROM ordenes_imagen WHERE cotizacion_id = ? AND tipo = ? LIMIT 1');
            if ($stmtChk) {
                $stmtChk->bind_param('is', $cotizacionId, $tipoOrden);
                $stmtChk->execute();
                $exists = $stmtChk->get_result()->fetch_assoc();
                $stmtChk->close();
                if ($exists) {
                    continue;
                }
            }
        }

        $cols = ['consulta_id', 'paciente_id', 'tipo', 'indicaciones', 'estado'];
        $vals = ['?', '?', '?', '?', "'pendiente'"];
        $types = 'iiss';
        $params = [0, $pacienteId, $tipoOrden, 'Orden creada desde cotización #' . $cotizacionId];

        if ($hasSolicitadoPor) {
            $cols[] = 'solicitado_por';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $usuarioId;
        }
        if ($hasCotizacionId) {
            $cols[] = 'cotizacion_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $cotizacionId;
        }
        if ($hasCargaAnticipada) {
            $cols[] = 'carga_anticipada';
            $vals[] = '?';
            $types .= 'i';
            $params[] = 0;
        }

        $sql = 'INSERT INTO ordenes_imagen (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
        $stmtIns = $conn->prepare($sql);
        if ($stmtIns) {
            $stmtIns->bind_param($types, ...$params);
            $stmtIns->execute();
            $stmtIns->close();
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
        registrar_movimientos_lab_ref_desde_cotizacion($conn, $pacienteId, $data['detalles'], $usuarioId, $cotizacionId);
        crear_ordenes_lab_cotizacion($conn, $cotizacionId, $pacienteId, $data['detalles']);
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

        $detallesAntes = cargar_detalles_cotizacion($conn, $cotizacionId);

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
        sincronizar_movimientos_lab_ref_en_edicion_cotizacion($conn, (int)$cot['paciente_id'], $detallesAntes, $detalles, $usuarioId, $cotizacionId);

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
                $cobroIdLog = ($cobroIdAuditoria !== null) ? (int)$cobroIdAuditoria : 0;
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
                        $stmtLog->bind_param("iissdiiis", $cobroIdLog, $detalleIdLog, $servicioTipoLog, $itemJsonLog, $montoLog, $usuarioId, $pacienteIdLog, $cajaIdAuditoria, $motivoLog);
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
                    $stmtLog->bind_param("iissdiiis", $cobroIdLog, $detalleIdLog, $servicioTipoLog, $itemJsonLog, $montoLog, $usuarioId, $pacienteIdLog, $cajaIdAuditoria, $motivoLog);
                    $stmtLog->execute();
                }
            }
        }

        $sync = CotizacionSyncService::reversarCobroCompletoPorCotizacion($conn, $cotizacionId, $usuarioId, $motivo);

        insertar_evento_cotizacion($conn, $cotizacionId, 'anulada', $usuarioId, $motivo, [
            'estado_anterior' => $estadoActual,
            'sync' => $sync
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
    $montoDescuentoSolicitado = isset($data['monto_descuento']) ? (float)$data['monto_descuento'] : 0;
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
        $stmt = $conn->prepare("SELECT id, paciente_id, total, total_pagado, saldo_pendiente FROM cotizaciones WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $cotizacionId);
        $stmt->execute();
        $cot = $stmt->get_result()->fetch_assoc();
        if (!$cot) throw new Exception('Cotización no encontrada');

        $total = (float)$cot['total'];
        $pagadoActual = (float)$cot['total_pagado'];
        $saldoAnterior = (float)$cot['saldo_pendiente'];
        $montoAplicado = min($monto, $saldoAnterior);
        if ($montoAplicado <= 0) {
            throw new Exception('La cotización no tiene saldo pendiente para aplicar abono');
        }

        $montoDescuentoAplicado = 0;
        if ($montoDescuentoSolicitado > 0) {
            $maxDescuentoPosible = max(0, $saldoAnterior - $montoAplicado);
            $montoDescuentoAplicado = min($montoDescuentoSolicitado, $maxDescuentoPosible);
        }

        $totalAjustado = max(0, $total - $montoDescuentoAplicado);
        $pagadoNuevo = min($totalAjustado, $pagadoActual + $montoAplicado);
        $saldoNuevo = max(0, $totalAjustado - $pagadoNuevo);
        $nuevoEstado = $saldoNuevo <= 0 ? 'pagado' : 'parcial';

        $stmtUp = $conn->prepare("UPDATE cotizaciones SET total = ?, total_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?");
        $stmtUp->bind_param("dddsi", $totalAjustado, $pagadoNuevo, $saldoNuevo, $nuevoEstado, $cotizacionId);
        $stmtUp->execute();

        if (table_exists($conn, 'cotizacion_movimientos')) {
            $tipoMov = 'abono';
            $stmtMov = $conn->prepare("INSERT INTO cotizacion_movimientos (cotizacion_id, cobro_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmtMov->bind_param("iisdddsi", $cotizacionId, $cobroId, $tipoMov, $montoAplicado, $saldoAnterior, $saldoNuevo, $descripcion, $usuarioId);
            $stmtMov->execute();

            if ($montoDescuentoAplicado > 0) {
                // Usar tipo existente en el esquema para evitar truncation en ENUM.
                $tipoMovDescuento = 'devolucion';
                $descripcionDescuento = trim($descripcion . ' (descuento aplicado)');
                $stmtMovDesc = $conn->prepare("INSERT INTO cotizacion_movimientos (cotizacion_id, cobro_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stmtMovDesc->bind_param("iisdddsi", $cotizacionId, $cobroId, $tipoMovDescuento, $montoDescuentoAplicado, $saldoAnterior, $saldoNuevo, $descripcionDescuento, $usuarioId);
                $stmtMovDesc->execute();
            }
        }

        insertar_evento_cotizacion($conn, $cotizacionId, 'cobro_registrado', $usuarioId, $descripcion, [
            'monto' => $montoAplicado,
            'monto_solicitado' => $monto,
            'descuento_solicitado' => $montoDescuentoSolicitado,
            'descuento_aplicado' => $montoDescuentoAplicado,
            'total_anterior' => $total,
            'total_nuevo' => $totalAjustado,
            'saldo_anterior' => $saldoAnterior,
            'saldo_nuevo' => $saldoNuevo,
            'estado' => $nuevoEstado,
            'cobro_id' => $cobroId
        ], 1);

        if ($nuevoEstado === 'pagado') {
            $detallesCotizacion = cargar_detalles_cotizacion($conn, $cotizacionId);
            $pacienteIdCot = (int)($cot['paciente_id'] ?? 0);
            crear_ordenes_imagen_cotizacion($conn, $cotizacionId, $pacienteIdCot, $detallesCotizacion);
        }

        $conn->commit();
        respond([
            'success' => true,
            'message' => 'Abono registrado correctamente',
            'monto_aplicado' => $montoAplicado,
            'descuento_aplicado' => $montoDescuentoAplicado,
            'total_cotizacion' => $totalAjustado,
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

function eliminar_detalle_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    $detalleId    = isset($data['detalle_id'])    ? (int)$data['detalle_id']    : 0;
    $usuarioId    = isset($data['usuario_id'])    ? (int)$data['usuario_id']    : get_user_id_from_session();
    $motivo       = trim((string)($data['motivo'] ?? 'Eliminación de detalle de consulta'));

    if ($cotizacionId <= 0 || $detalleId <= 0) {
        echo json_encode(['success' => false, 'error' => 'Faltan cotizacion_id o detalle_id']);
        exit;
    }

    $conn->begin_transaction();
    try {
        $stmtCot = $conn->prepare('SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE');
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $cot = $stmtCot->get_result()->fetch_assoc();
        if (!$cot) throw new Exception('Cotización no encontrada');

        $estadoActual = strtolower((string)($cot['estado'] ?? 'pendiente'));
        if (!in_array($estadoActual, ['pendiente', 'parcial'])) {
            throw new Exception('Solo se puede eliminar ítems en cotizaciones pendientes o parciales');
        }

        // Marcar el detalle como eliminado
        if (column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
            $hasEditadoPor = column_exists($conn, 'cotizaciones_detalle', 'editado_por');
            $hasEditadoEn  = column_exists($conn, 'cotizaciones_detalle', 'editado_en');
            $hasMotivoDet  = column_exists($conn, 'cotizaciones_detalle', 'motivo_edicion');
            $setParts = ["estado_item = 'eliminado'"];
            $bindTypes = '';
            $bindParams = [];
            if ($hasEditadoPor)  { $setParts[] = 'editado_por = ?';  $bindTypes .= 'i'; $bindParams[] = $usuarioId; }
            if ($hasEditadoEn)   { $setParts[] = 'editado_en = NOW()'; }
            if ($hasMotivoDet)   { $setParts[] = 'motivo_edicion = ?'; $bindTypes .= 's'; $bindParams[] = $motivo; }
            $bindTypes .= 'ii';
            $bindParams[] = $detalleId;
            $bindParams[] = $cotizacionId;
            $sql = 'UPDATE cotizaciones_detalle SET ' . implode(', ', $setParts) . ' WHERE id = ? AND cotizacion_id = ?';
            $stmtDel = $conn->prepare($sql);
            $stmtDel->bind_param($bindTypes, ...$bindParams);
        } else {
            $stmtDel = $conn->prepare('DELETE FROM cotizaciones_detalle WHERE id = ? AND cotizacion_id = ?');
            $stmtDel->bind_param('ii', $detalleId, $cotizacionId);
        }
        $stmtDel->execute();

        // Recalcular total
        $whereEstado = column_exists($conn, 'cotizaciones_detalle', 'estado_item') ? " AND estado_item <> 'eliminado'" : '';
        $stmtTotal = $conn->prepare("SELECT COALESCE(SUM(subtotal),0) AS total FROM cotizaciones_detalle WHERE cotizacion_id = ?{$whereEstado}");
        $stmtTotal->bind_param('i', $cotizacionId);
        $stmtTotal->execute();
        $nuevoTotal = (float)($stmtTotal->get_result()->fetch_assoc()['total'] ?? 0);

        if (column_exists($conn, 'cotizaciones', 'total_pagado') && column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
            $pagado = (float)($cot['total_pagado'] ?? 0);
            $saldo  = max(0, $nuevoTotal - $pagado);
            $nuevoEstado = $saldo <= 0 ? 'pagado' : ($pagado > 0 ? 'parcial' : 'pendiente');
            $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ? WHERE id = ?');
            $stmtUp->bind_param('ddsi', $nuevoTotal, $saldo, $nuevoEstado, $cotizacionId);
        } else {
            $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ? WHERE id = ?');
            $stmtUp->bind_param('di', $nuevoTotal, $cotizacionId);
        }
        $stmtUp->execute();

        $conn->commit();
        echo json_encode(['success' => true, 'nuevo_total' => $nuevoTotal]);
        exit;
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

function agregar_detalle_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    $usuarioId    = isset($data['usuario_id'])    ? (int)$data['usuario_id']    : get_user_id_from_session();
    $motivo       = trim((string)($data['motivo'] ?? 'Agregar consulta a cotización'));
    $detalle      = $data['detalle'] ?? null;

    if ($cotizacionId <= 0 || !is_array($detalle) || empty($detalle)) {
        echo json_encode(['success' => false, 'error' => 'Faltan cotizacion_id o datos del detalle']);
        exit;
    }

    $conn->begin_transaction();
    try {
        $stmtCot = $conn->prepare('SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE');
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $cot = $stmtCot->get_result()->fetch_assoc();
        if (!$cot) throw new Exception('Cotización no encontrada');

        $estadoActual = strtolower((string)($cot['estado'] ?? 'pendiente'));
        if (!in_array($estadoActual, ['pendiente', 'parcial'])) {
            throw new Exception('Solo se puede agregar ítems a cotizaciones pendientes o parciales');
        }

        insertar_detalles_cotizacion($conn, $cotizacionId, [$detalle], $usuarioId, $motivo);

        $whereEstado = column_exists($conn, 'cotizaciones_detalle', 'estado_item') ? " AND estado_item <> 'eliminado'" : '';
        $stmtTotal = $conn->prepare("SELECT COALESCE(SUM(subtotal),0) AS total FROM cotizaciones_detalle WHERE cotizacion_id = ?{$whereEstado}");
        $stmtTotal->bind_param('i', $cotizacionId);
        $stmtTotal->execute();
        $nuevoTotal = (float)($stmtTotal->get_result()->fetch_assoc()['total'] ?? 0);

        if (column_exists($conn, 'cotizaciones', 'total_pagado') && column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
            $pagado = (float)($cot['total_pagado'] ?? 0);
            $saldo  = max(0, $nuevoTotal - $pagado);
            $nuevoEstado = $saldo <= 0 ? 'pagado' : ($pagado > 0 ? 'parcial' : 'pendiente');
            $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ? WHERE id = ?');
            $stmtUp->bind_param('ddsi', $nuevoTotal, $saldo, $nuevoEstado, $cotizacionId);
        } else {
            $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ? WHERE id = ?');
            $stmtUp->bind_param('di', $nuevoTotal, $cotizacionId);
        }
        $stmtUp->execute();

        $conn->commit();
        echo json_encode(['success' => true, 'nuevo_total' => $nuevoTotal]);
        exit;
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

function crear_consulta_desde_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    if ($cotizacionId <= 0) {
        echo json_encode(['success' => false, 'error' => 'cotizacion_id requerido']);
        exit;
    }

    // Obtener datos de la cotización
    $stmtCot = $conn->prepare('SELECT paciente_id, fecha FROM cotizaciones WHERE id = ? LIMIT 1');
    if (!$stmtCot) {
        echo json_encode(['success' => false, 'error' => 'Error preparando consulta']);
        exit;
    }
    $stmtCot->bind_param('i', $cotizacionId);
    $stmtCot->execute();
    $cot = $stmtCot->get_result()->fetch_assoc();
    $stmtCot->close();
    if (!$cot) {
        echo json_encode(['success' => false, 'error' => 'Cotización no encontrada']);
        exit;
    }
    $pacienteId = (int)$cot['paciente_id'];
    $fechaCot = $cot['fecha'] ? date('Y-m-d', strtotime($cot['fecha'])) : date('Y-m-d');

    // Obtener detalle de tipo consulta con medico_id
    $hasConsultaId = column_exists($conn, 'cotizaciones_detalle', 'consulta_id');
    $hasMedicoId = column_exists($conn, 'cotizaciones_detalle', 'medico_id');

    $medicoId = 0;
    $detalleId = 0;
    $existingConsultaId = 0;

    if ($hasConsultaId && $hasMedicoId) {
        $stmtDet = $conn->prepare("SELECT id, medico_id, consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta' ORDER BY id ASC LIMIT 1");
    } elseif ($hasMedicoId) {
        $stmtDet = $conn->prepare("SELECT id, medico_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta' ORDER BY id ASC LIMIT 1");
    } else {
        $stmtDet = $conn->prepare("SELECT id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta' ORDER BY id ASC LIMIT 1");
    }

    if (!$stmtDet) {
        echo json_encode(['success' => false, 'error' => 'Error preparando detalle']);
        exit;
    }
    $stmtDet->bind_param('i', $cotizacionId);
    $stmtDet->execute();
    $rowDet = $stmtDet->get_result()->fetch_assoc();
    $stmtDet->close();

    if (!$rowDet) {
        echo json_encode(['success' => false, 'error' => 'No se encontró detalle de consulta en la cotización']);
        exit;
    }
    $detalleId = (int)$rowDet['id'];
    $medicoId = (int)($rowDet['medico_id'] ?? 0);
    $existingConsultaId = (int)($rowDet['consulta_id'] ?? 0);

    if ($medicoId <= 0) {
        echo json_encode(['success' => false, 'error' => 'No hay médico asignado al detalle de consulta']);
        exit;
    }

    // Si ya tiene consulta vinculada, devolver la existente (idempotente)
    if ($existingConsultaId > 0) {
        echo json_encode(['success' => true, 'consulta_id' => $existingConsultaId, 'ya_existia' => true]);
        exit;
    }

    // Crear la consulta en la tabla consultas
    $hora = date('H:i:s');
    $tipoConsulta = 'programada';
    $stmtIns = $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta) VALUES (?, ?, ?, ?, ?)');
    if (!$stmtIns) {
        echo json_encode(['success' => false, 'error' => 'Error preparando inserción de consulta']);
        exit;
    }
    $stmtIns->bind_param('iisss', $pacienteId, $medicoId, $fechaCot, $hora, $tipoConsulta);
    $ok = $stmtIns->execute();
    $nuevaConsultaId = $ok ? (int)$stmtIns->insert_id : 0;
    $stmtIns->close();

    if (!$ok || $nuevaConsultaId <= 0) {
        echo json_encode(['success' => false, 'error' => 'No se pudo crear la consulta']);
        exit;
    }

    // Vincular la nueva consulta al detalle de la cotización
    if ($hasConsultaId && $detalleId > 0) {
        $stmtVinc = $conn->prepare('UPDATE cotizaciones_detalle SET consulta_id = ? WHERE id = ?');
        if ($stmtVinc) {
            $stmtVinc->bind_param('ii', $nuevaConsultaId, $detalleId);
            $stmtVinc->execute();
            $stmtVinc->close();
        }
    }

    echo json_encode(['success' => true, 'consulta_id' => $nuevaConsultaId, 'ya_existia' => false]);
    exit;
}

function vincular_consulta_a_cotizacion($conn, $data) {
    $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
    $consultaId = isset($data['consulta_id']) ? (int)$data['consulta_id'] : 0;
    $medicoId = isset($data['medico_id']) ? (int)$data['medico_id'] : 0;

    if ($cotizacionId <= 0 || $consultaId <= 0) {
        echo json_encode(['success' => false, 'error' => 'Faltan datos para vincular la consulta']);
        exit;
    }

    $hasConsultaId = column_exists($conn, 'cotizaciones_detalle', 'consulta_id');
    $hasMedicoId = column_exists($conn, 'cotizaciones_detalle', 'medico_id');

    if (!$hasConsultaId && !$hasMedicoId) {
        echo json_encode(['success' => false, 'error' => 'El esquema no soporta vinculación de consultas']);
        exit;
    }

    // Buscar el detalle de tipo consulta en la cotización
    $stmt = $conn->prepare("SELECT id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta' ORDER BY id ASC LIMIT 1");
    $stmt->bind_param('i', $cotizacionId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $detalleId = (int)($row['id'] ?? 0);

    if ($detalleId <= 0) {
        echo json_encode(['success' => false, 'error' => 'No se encontró detalle de consulta en la cotización']);
        exit;
    }

    $sets = [];
    $types = '';
    $params = [];
    if ($hasConsultaId) {
        $sets[] = 'consulta_id = ?';
        $types .= 'i';
        $params[] = $consultaId;
    }
    if ($hasMedicoId && $medicoId > 0) {
        $sets[] = 'medico_id = ?';
        $types .= 'i';
        $params[] = $medicoId;
    }

    $sql = 'UPDATE cotizaciones_detalle SET ' . implode(', ', $sets) . ' WHERE id = ?';
    $types .= 'i';
    $params[] = $detalleId;

    $stmtUpd = $conn->prepare($sql);
    $stmtUpd->bind_param($types, ...$params);
    $ok = $stmtUpd->execute();
    $stmtUpd->close();

    echo json_encode(['success' => $ok, 'detalle_id' => $detalleId]);
    exit;
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

        $syncParcial = CotizacionSyncService::reversarMontoParcialPorCotizacion(
            $conn,
            $cotizacionId,
            (string)($det['servicio_tipo'] ?? ''),
            $montoDevuelto,
            $usuarioId,
            $motivo
        );

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
                $cobroIdLog = ($cobroIdAuditoria !== null) ? (int)$cobroIdAuditoria : 0;
                $stmtLog->bind_param("iissdiiis", $cobroIdLog, $detalleId, $servicioTipoLog, $itemJsonLog, $montoDevuelto, $usuarioId, $pacienteIdLog, $cajaIdAuditoria, $motivoLog);
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
            'estado_nuevo' => $nuevoEstado,
            'sync' => $syncParcial
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

function listar_pagos_cotizacion($conn, $cotizacionId) {
    $cotizacionId = (int)$cotizacionId;
    if ($cotizacionId <= 0) {
        respond(['success' => false, 'error' => 'cotizacion_id inválido'], 400);
    }

    if (!table_exists($conn, 'cotizacion_movimientos')) {
        respond(['success' => true, 'pagos' => []]);
    }

    $hasUsuarios = table_exists($conn, 'usuarios');
    $hasCobros = table_exists($conn, 'cobros');
    $hasTipoPagoCobro = $hasCobros && column_exists($conn, 'cobros', 'tipo_pago');

    $selectMetodoPago = $hasTipoPagoCobro ? ', c.tipo_pago AS metodo_pago' : ", NULL AS metodo_pago";
    $joinCobros = $hasTipoPagoCobro ? ' LEFT JOIN cobros c ON c.id = cm.cobro_id ' : ' ';

    if ($hasUsuarios) {
        $sql = "SELECT cm.id, cm.cotizacion_id, cm.cobro_id, cm.tipo_movimiento, cm.monto, cm.saldo_anterior, cm.saldo_nuevo, cm.descripcion, cm.usuario_id, cm.created_at, COALESCE(u.nombre, 'Sistema') AS usuario_nombre{$selectMetodoPago}
                FROM cotizacion_movimientos cm
                LEFT JOIN usuarios u ON u.id = cm.usuario_id
                {$joinCobros}
                WHERE cm.cotizacion_id = ? AND cm.tipo_movimiento IN ('abono','devolucion')
                ORDER BY cm.created_at DESC, cm.id DESC";
    } else {
        $sql = "SELECT cm.id, cm.cotizacion_id, cm.cobro_id, cm.tipo_movimiento, cm.monto, cm.saldo_anterior, cm.saldo_nuevo, cm.descripcion, cm.usuario_id, cm.created_at{$selectMetodoPago}
                FROM cotizacion_movimientos cm
                {$joinCobros}
                WHERE cm.cotizacion_id = ? AND cm.tipo_movimiento IN ('abono','devolucion')
                ORDER BY cm.created_at DESC, cm.id DESC";
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        respond(['success' => false, 'error' => 'No se pudo preparar consulta de pagos'], 500);
    }
    $stmt->bind_param("i", $cotizacionId);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

    respond(['success' => true, 'pagos' => $rows]);
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
        if ($accion === 'vincular_consulta') {
            vincular_consulta_a_cotizacion($conn, $data);
        }
        if ($accion === 'crear_consulta_desde_cotizacion') {
            crear_consulta_desde_cotizacion($conn, $data);
        }
        if ($accion === 'eliminar_detalle') {
            eliminar_detalle_cotizacion($conn, $data);
        }
        if ($accion === 'agregar_detalle') {
            agregar_detalle_cotizacion($conn, $data);
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

        if (isset($_GET['accion']) && strtolower($_GET['accion']) === 'pagos' && isset($_GET['cotizacion_id'])) {
            listar_pagos_cotizacion($conn, (int)$_GET['cotizacion_id']);
        }

        if (isset($_GET['paciente_id'])) {
            $pacienteId = (int)$_GET['paciente_id'];
            $stmt = $conn->prepare("
                SELECT c.*, p.nombre, p.apellido, COALESCE(u.nombre, 'Sistema') as usuario_nombre
                FROM cotizaciones c
                JOIN pacientes p ON c.paciente_id = p.id
                LEFT JOIN usuarios u ON c.usuario_id = u.id
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
        $limit = min($limit, 50);
        $offset = ($page - 1) * $limit;
        $fechaInicio = $_GET['fecha_inicio'] ?? null;
        $fechaFin = $_GET['fecha_fin'] ?? null;
        $estado = $_GET['estado'] ?? null;
        $usuarioId = isset($_GET['usuario_id']) ? (int)$_GET['usuario_id'] : null;
        $q = trim((string)($_GET['q'] ?? ''));
        $includeDetalles = isset($_GET['include_detalles']) && (string)$_GET['include_detalles'] === '1';
        $hasEstadoItem = column_exists($conn, 'cotizaciones_detalle', 'estado_item');
        $hasDerivado = column_exists($conn, 'cotizaciones_detalle', 'derivado');
        $hasLabCotizacion = column_exists($conn, 'ordenes_laboratorio', 'cotizacion_id');

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

        $sql = "
            SELECT
                c.id,
                c.paciente_id,
                c.usuario_id,
                c.fecha,
                c.total,
                c.total_pagado,
                c.saldo_pendiente,
                c.estado,
                c.observaciones,
                p.nombre,
                p.apellido,
                p.dni,
                p.historia_clinica,
                COALESCE(u.nombre, 'Sistema') as usuario_nombre
            FROM cotizaciones c
            JOIN pacientes p ON c.paciente_id = p.id
            LEFT JOIN usuarios u ON c.usuario_id = u.id
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

        // Completar campos derivados usando SOLO IDs de la página actual.
        $idsPagina = array_values(array_filter(array_map(fn($r) => (int)($r['id'] ?? 0), $cotizaciones), fn($id) => $id > 0));
        $serviciosPorCotizacion = [];
        $labCompletadoPorCotizacion = [];
        $labReferenciaPorCotizacion = [];
        $ordenLaboratorioPorCotizacion = [];
        $ordenesLaboratorioCountPorCotizacion = [];
        $medicoSolicitantePorCotizacion = [];
        $consultaRefPorCotizacion = [];

        if (!empty($idsPagina)) {
            $placeholders = implode(',', array_fill(0, count($idsPagina), '?'));
            $typesIds = str_repeat('i', count($idsPagina));

            $sqlServicios = $hasEstadoItem
                ? "SELECT cd.cotizacion_id, GROUP_CONCAT(DISTINCT LOWER(cd.servicio_tipo) ORDER BY cd.servicio_tipo SEPARATOR ',') AS servicios_tipos
                   FROM cotizaciones_detalle cd
                   INNER JOIN cotizaciones c ON c.id = cd.cotizacion_id
                   WHERE cd.cotizacion_id IN ($placeholders)
                     AND (c.estado = 'anulada' OR cd.estado_item <> 'eliminado')
                   GROUP BY cd.cotizacion_id"
                : "SELECT cd.cotizacion_id, GROUP_CONCAT(DISTINCT LOWER(cd.servicio_tipo) ORDER BY cd.servicio_tipo SEPARATOR ',') AS servicios_tipos
                   FROM cotizaciones_detalle cd
                   WHERE cd.cotizacion_id IN ($placeholders)
                   GROUP BY cd.cotizacion_id";

            $stmtSrv = $conn->prepare($sqlServicios);
            if ($stmtSrv) {
                $stmtSrv->bind_param($typesIds, ...$idsPagina);
                $stmtSrv->execute();
                $rowsSrv = $stmtSrv->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtSrv->close();
                foreach ($rowsSrv as $rowSrv) {
                    $cid = (int)($rowSrv['cotizacion_id'] ?? 0);
                    if ($cid > 0) {
                        $serviciosPorCotizacion[$cid] = (string)($rowSrv['servicios_tipos'] ?? '');
                    }
                }
            }

            if ($hasDerivado) {
                $sqlLabRef = $hasEstadoItem
                    ? "SELECT cd.cotizacion_id,
                              MAX(CASE
                                    WHEN LOWER(cd.servicio_tipo) = 'laboratorio' AND COALESCE(cd.derivado, 0) = 1
                                    THEN 1 ELSE 0
                                  END) AS tiene_laboratorio_referencia
                       FROM cotizaciones_detalle cd
                       INNER JOIN cotizaciones c ON c.id = cd.cotizacion_id
                       WHERE cd.cotizacion_id IN ($placeholders)
                         AND (c.estado = 'anulada' OR cd.estado_item <> 'eliminado')
                       GROUP BY cd.cotizacion_id"
                    : "SELECT cd.cotizacion_id,
                              MAX(CASE
                                    WHEN LOWER(cd.servicio_tipo) = 'laboratorio' AND COALESCE(cd.derivado, 0) = 1
                                    THEN 1 ELSE 0
                                  END) AS tiene_laboratorio_referencia
                       FROM cotizaciones_detalle cd
                       WHERE cd.cotizacion_id IN ($placeholders)
                       GROUP BY cd.cotizacion_id";

                $stmtLabRef = $conn->prepare($sqlLabRef);
                if ($stmtLabRef) {
                    $stmtLabRef->bind_param($typesIds, ...$idsPagina);
                    $stmtLabRef->execute();
                    $rowsLabRef = $stmtLabRef->get_result()->fetch_all(MYSQLI_ASSOC);
                    $stmtLabRef->close();
                    foreach ($rowsLabRef as $rowLabRef) {
                        $cid = (int)($rowLabRef['cotizacion_id'] ?? 0);
                        if ($cid > 0) {
                            $labReferenciaPorCotizacion[$cid] = (int)($rowLabRef['tiene_laboratorio_referencia'] ?? 0);
                        }
                    }
                }
            }

            if ($hasLabCotizacion) {
                $sqlLab = "SELECT o.cotizacion_id,
                                  IF(COUNT(DISTINCT o.id) > 0 AND COUNT(DISTINCT rl.orden_id) = COUNT(DISTINCT o.id), 1, 0) AS lab_completado
                           FROM ordenes_laboratorio o
                           LEFT JOIN resultados_laboratorio rl ON rl.orden_id = o.id
                           WHERE o.cotizacion_id IN ($placeholders) AND o.estado != 'cancelada'
                           GROUP BY o.cotizacion_id";
                $stmtLab = $conn->prepare($sqlLab);
                if ($stmtLab) {
                    $stmtLab->bind_param($typesIds, ...$idsPagina);
                    $stmtLab->execute();
                    $rowsLab = $stmtLab->get_result()->fetch_all(MYSQLI_ASSOC);
                    $stmtLab->close();
                    foreach ($rowsLab as $rowLab) {
                        $cid = (int)($rowLab['cotizacion_id'] ?? 0);
                        if ($cid > 0) {
                            $labCompletadoPorCotizacion[$cid] = (int)($rowLab['lab_completado'] ?? 0);
                        }
                    }
                }

                $sqlOrdenLab = "SELECT o.cotizacion_id,
                                       MIN(o.id) AS orden_laboratorio_id,
                                       COUNT(*) AS total_ordenes_laboratorio
                                FROM ordenes_laboratorio o
                                WHERE o.cotizacion_id IN ($placeholders)
                                  AND o.estado != 'cancelada'
                                GROUP BY o.cotizacion_id";
                $stmtOrdenLab = $conn->prepare($sqlOrdenLab);
                if ($stmtOrdenLab) {
                    $stmtOrdenLab->bind_param($typesIds, ...$idsPagina);
                    $stmtOrdenLab->execute();
                    $rowsOrdenLab = $stmtOrdenLab->get_result()->fetch_all(MYSQLI_ASSOC);
                    $stmtOrdenLab->close();
                    foreach ($rowsOrdenLab as $rowOrdenLab) {
                        $cid = (int)($rowOrdenLab['cotizacion_id'] ?? 0);
                        if ($cid > 0) {
                            $ordenLaboratorioPorCotizacion[$cid] = (int)($rowOrdenLab['orden_laboratorio_id'] ?? 0);
                            $ordenesLaboratorioCountPorCotizacion[$cid] = (int)($rowOrdenLab['total_ordenes_laboratorio'] ?? 0);
                        }
                    }
                }
            }

            // Detectar médico solicitante (cotizaciones originadas desde HC).
            if (column_exists($conn, 'cotizaciones_detalle', 'consulta_id')) {
                $sqlMed = "SELECT cd.cotizacion_id, cd.consulta_id, m.nombre, m.apellido
                           FROM cotizaciones_detalle cd
                           INNER JOIN consultas con ON con.id = cd.consulta_id
                           INNER JOIN medicos m ON m.id = con.medico_id
                           WHERE cd.cotizacion_id IN ($placeholders)
                             AND cd.consulta_id IS NOT NULL
                             AND cd.consulta_id > 0
                           ORDER BY cd.id ASC";
                $stmtMed = $conn->prepare($sqlMed);
                if ($stmtMed) {
                    $stmtMed->bind_param($typesIds, ...$idsPagina);
                    $stmtMed->execute();
                    $rowsMed = $stmtMed->get_result()->fetch_all(MYSQLI_ASSOC);
                    $stmtMed->close();

                    foreach ($rowsMed as $rowMed) {
                        $cid = (int)($rowMed['cotizacion_id'] ?? 0);
                        if ($cid <= 0 || isset($medicoSolicitantePorCotizacion[$cid])) continue;
                        $consultaDet = (int)($rowMed['consulta_id'] ?? 0);
                        if ($consultaDet > 0 && !isset($consultaRefPorCotizacion[$cid])) {
                            $consultaRefPorCotizacion[$cid] = $consultaDet;
                        }
                        $nombreComp = trim((string)($rowMed['nombre'] ?? '') . ' ' . (string)($rowMed['apellido'] ?? ''));
                        if ($nombreComp !== '') {
                            $medicoSolicitantePorCotizacion[$cid] = $nombreComp;
                        }
                    }
                }
            }

            // Fallback estricto: solo resolver por referencia explícita en observaciones (consulta #ID).
            foreach ($cotizaciones as $rowCot) {
                $cid = (int)($rowCot['id'] ?? 0);
                if ($cid <= 0) continue;
                if (isset($consultaRefPorCotizacion[$cid])) continue;

                $obs = trim((string)($rowCot['observaciones'] ?? ''));
                if ($obs === '' || !preg_match('/consulta\s*#\s*(\d+)/i', $obs)) {
                    continue;
                }

                $consultaRef = resolver_consulta_referente_por_cotizacion($conn, $cid);
                if ($consultaRef > 0) {
                    $consultaRefPorCotizacion[$cid] = $consultaRef;
                    $med = obtener_medico_desde_consulta($conn, $consultaRef);
                    if ($med && !empty($med['completo']) && !isset($medicoSolicitantePorCotizacion[$cid])) {
                        $medicoSolicitantePorCotizacion[$cid] = $med['completo'];
                    }
                }
            }

            foreach ($cotizaciones as &$cotRow) {
                $cid = (int)($cotRow['id'] ?? 0);
                $cotRow['servicios_tipos'] = $serviciosPorCotizacion[$cid] ?? '';
                $cotRow['lab_completado'] = $hasLabCotizacion ? ($labCompletadoPorCotizacion[$cid] ?? 0) : 0;
                $cotRow['tiene_laboratorio_referencia'] = $labReferenciaPorCotizacion[$cid] ?? 0;
                $cotRow['orden_laboratorio_id'] = $hasLabCotizacion ? ($ordenLaboratorioPorCotizacion[$cid] ?? 0) : 0;
                $cotRow['ordenes_laboratorio_count'] = $hasLabCotizacion ? ($ordenesLaboratorioCountPorCotizacion[$cid] ?? 0) : 0;
                $cotRow['medico_solicitante'] = $medicoSolicitantePorCotizacion[$cid] ?? '';
                $cotRow['consulta_ref_id'] = (int)($consultaRefPorCotizacion[$cid] ?? 0);

                // Si fue una cotización originada desde HC, mostrar médico en "Quién cotizó".
                $usuarioNombre = trim((string)($cotRow['usuario_nombre'] ?? ''));
                if (($usuarioNombre === '' || strtolower($usuarioNombre) === 'sistema') && $cotRow['medico_solicitante'] !== '') {
                    $cotRow['usuario_nombre'] = $cotRow['medico_solicitante'];
                }
            }
            unset($cotRow);
        }

        if ($includeDetalles) {
            foreach ($cotizaciones as &$cotizacion) {
                $cotizacion['detalles'] = cargar_detalles_cotizacion($conn, (int)$cotizacion['id']);
            }
        }

        $sqlCount = "
            SELECT COUNT(*) as total
            FROM cotizaciones c
            JOIN pacientes p ON c.paciente_id = p.id
            LEFT JOIN usuarios u ON c.usuario_id = u.id
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
