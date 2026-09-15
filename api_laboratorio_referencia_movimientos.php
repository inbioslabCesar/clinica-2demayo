<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';
require_once "auth_check.php";

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

function column_exists_lr($conn, $table, $column) {
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
    if (!$stmt) return false;
    $stmt->bind_param("ss", $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function table_exists_lr($conn, $table) {
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    if (!$stmt) return false;
    $stmt->bind_param("s", $table);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function resolver_cotizacion_id_liquidacion_lr($conn, array $movimiento, bool $hasCotizacionId, bool $hasCotizacionMovimientos): int {
    $directo = $hasCotizacionId ? (int)($movimiento['cotizacion_id'] ?? 0) : 0;
    if ($directo > 0) {
        return $directo;
    }

    $cobroId = (int)($movimiento['cobro_id'] ?? 0);
    if ($cobroId <= 0 || !$hasCotizacionMovimientos) {
        return 0;
    }

    $stmt = $conn->prepare("SELECT cotizacion_id FROM cotizacion_movimientos WHERE cobro_id = ? AND cotizacion_id IS NOT NULL AND cotizacion_id > 0 ORDER BY id DESC LIMIT 1");
    if (!$stmt) {
        return 0;
    }
    $stmt->bind_param('i', $cobroId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    return (int)($row['cotizacion_id'] ?? 0);
}

function obtener_contexto_derivacion_lr($conn, int $cotizacionId, int $examenId, string $laboratorio = ''): ?array {
    if ($cotizacionId <= 0 || $examenId <= 0) {
        return null;
    }

    $hasEstadoItem = column_exists_lr($conn, 'cotizaciones_detalle', 'estado_item');
    $hasDerivado = column_exists_lr($conn, 'cotizaciones_detalle', 'derivado');
    $hasLaboratorioRef = column_exists_lr($conn, 'cotizaciones_detalle', 'laboratorio_referencia');
    $hasTipoDeriv = column_exists_lr($conn, 'cotizaciones_detalle', 'tipo_derivacion');
    $hasValorDeriv = column_exists_lr($conn, 'cotizaciones_detalle', 'valor_derivacion');

    $sql = "SELECT COALESCE(SUM(cd.subtotal), 0) AS subtotal";
    if ($hasTipoDeriv && $hasValorDeriv) {
        $sql .= ", MAX(CASE WHEN LOWER(COALESCE(cd.tipo_derivacion, '')) = 'porcentaje' THEN cd.valor_derivacion ELSE NULL END) AS porcentaje";
    } else {
        $sql .= ", NULL AS porcentaje";
    }
    $sql .= " FROM cotizaciones_detalle cd WHERE cd.cotizacion_id = ? AND LOWER(COALESCE(cd.servicio_tipo, '')) = 'laboratorio' AND cd.servicio_id = ?";

    $params = [$cotizacionId, $examenId];
    $types = 'ii';

    if ($hasEstadoItem) {
        $sql .= " AND LOWER(COALESCE(cd.estado_item, '')) <> 'eliminado'";
    }
    if ($hasDerivado) {
        $sql .= " AND COALESCE(cd.derivado, 0) = 1";
    }
    if ($hasLaboratorioRef && trim($laboratorio) !== '') {
        $sql .= " AND LOWER(TRIM(COALESCE(cd.laboratorio_referencia, ''))) = LOWER(TRIM(?))";
        $params[] = $laboratorio;
        $types .= 's';
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) {
        return null;
    }

    return [
        'subtotal' => (float)($row['subtotal'] ?? 0),
        'porcentaje' => isset($row['porcentaje']) ? (float)$row['porcentaje'] : null,
    ];
}

function resolver_monto_liquidacion_lr($conn, array $movimiento, bool $hasCotizacionId, bool $hasCotizacionMovimientos): array {
    $tipo = strtolower(trim((string)($movimiento['tipo'] ?? 'monto')));
    $montoActual = (float)($movimiento['monto'] ?? 0);
    $examenId = (int)($movimiento['examen_id'] ?? 0);
    $laboratorio = trim((string)($movimiento['laboratorio'] ?? ''));
    $cotizacionId = resolver_cotizacion_id_liquidacion_lr($conn, $movimiento, $hasCotizacionId, $hasCotizacionMovimientos);

    $subtotal = null;
    $porcentaje = null;
    $montoLiquidar = $montoActual;

    if ($tipo === 'porcentaje' && $cotizacionId > 0 && $examenId > 0) {
        $ctx = obtener_contexto_derivacion_lr($conn, $cotizacionId, $examenId, $laboratorio);
        if (is_array($ctx)) {
            $subtotal = (float)($ctx['subtotal'] ?? 0);
            $porcentajeValor = $ctx['porcentaje'];
            if ($porcentajeValor !== null && $porcentajeValor > 0) {
                $porcentaje = (float)$porcentajeValor;
                $montoLiquidar = round($subtotal * $porcentaje / 100, 2);
            }
        }
    }

    return [
        'cotizacion_id' => $cotizacionId,
        'subtotal' => $subtotal,
        'porcentaje' => $porcentaje,
        'monto' => round($montoLiquidar, 2),
    ];
}

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        // Si la acción es marcar como pagado
        if (isset($data['accion']) && $data['accion'] === 'marcar_pagado' && isset($data['id'])) {
            // Registrar quién liquidó y el turno/hora de liquidación
            $usuario = $_SESSION['usuario'] ?? null;
            $usuario_id = $usuario['id'] ?? null;
            $turno_liq = null;
            $caja_id = null;
            if ($usuario_id) {
                $stmtCaja = $conn->prepare("SELECT id, turno FROM cajas WHERE estado = 'abierta' AND usuario_id = ? ORDER BY created_at DESC LIMIT 1");
                $stmtCaja->bind_param("i", $usuario_id);
                $stmtCaja->execute();
                $resCaja = $stmtCaja->get_result();
                if ($resCaja && $resCaja->num_rows > 0) {
                    $cajaRow = $resCaja->fetch_assoc();
                    $turno_liq = $cajaRow['turno'];
                    $caja_id = $cajaRow['id'];
                }
            }
            // Obtener datos del movimiento de laboratorio para el egreso
            $hasCotizacionId = column_exists_lr($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
            $hasCotizacionMovimientos = table_exists_lr($conn, 'cotizacion_movimientos');

            $stmtMovimiento = $conn->prepare("SELECT * FROM laboratorio_referencia_movimientos WHERE id = ?");
            $stmtMovimiento->bind_param("i", $data['id']);
            $stmtMovimiento->execute();
            $resMovimiento = $stmtMovimiento->get_result();
            if ($resMovimiento && $resMovimiento->num_rows > 0) {
                $movimiento = $resMovimiento->fetch_assoc();
                $liquidacion = resolver_monto_liquidacion_lr($conn, $movimiento, $hasCotizacionId, $hasCotizacionMovimientos);
                
                // Actualizar estado a pagado
                $stmt = $conn->prepare("UPDATE laboratorio_referencia_movimientos SET estado = 'pagado', liquidado_por = ?, turno_liquidacion = ?, hora_liquidacion = CURTIME(), caja_id = COALESCE(caja_id, ?) WHERE id = ?");
                $stmt->bind_param("issi", $usuario_id, $turno_liq, $caja_id, $data['id']);
                $stmt->execute();
                
                // Registrar egreso en tabla egresos
                $monto = (float)($liquidacion['monto'] ?? 0);
                $laboratorio = $conn->real_escape_string($movimiento['laboratorio']);
                $fecha = date('Y-m-d');
                $descripcion = "Liquidación laboratorio referencia: $laboratorio ID {$data['id']}";
                $usuario_nombre = isset($_SESSION['usuario']['nombre']) ? $conn->real_escape_string($_SESSION['usuario']['nombre']) : '';
                
                $sqlEgreso = "INSERT INTO egresos (fecha, tipo, tipo_egreso, categoria, descripcion, concepto, monto, usuario_id, turno, estado, caja_id, responsable, liquidacion_id) VALUES (
                    '$fecha', 'laboratorio', 'laboratorio', 'Laboratorio de Referencia', '$descripcion', '$laboratorio', $monto, $usuario_id, " . ($turno_liq ? "'$turno_liq'" : "NULL") . ", 'pagado', " . ($caja_id ? $caja_id : "NULL") . ", '$usuario_nombre', {$data['id']}
                )";
                $conn->query($sqlEgreso);
                
                echo json_encode([
                    'success' => true,
                    'monto_liquidado' => round($monto, 2),
                    'cotizacion_id' => (int)($liquidacion['cotizacion_id'] ?? 0),
                    'subtotal_cotizacion' => isset($liquidacion['subtotal']) && $liquidacion['subtotal'] !== null ? round((float)$liquidacion['subtotal'], 2) : null,
                    'porcentaje_derivacion' => isset($liquidacion['porcentaje']) && $liquidacion['porcentaje'] !== null ? (float)$liquidacion['porcentaje'] : null,
                ]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Movimiento de laboratorio no encontrado']);
            }
            break;
        }
        // Registrar movimiento de laboratorio de referencia (alta directa)
        if (!isset($data['cobro_id']) || !isset($data['examen_id']) || !isset($data['laboratorio']) || !isset($data['monto']) || !isset($data['tipo']) || !isset($data['estado'])) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        $hasCotizacionId = column_exists_lr($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
        $caja_id = $data['caja_id'] ?? null;
        if ($hasCotizacionId) {
            $stmt = $conn->prepare("INSERT INTO laboratorio_referencia_movimientos (cobro_id, cotizacion_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, caja_id, fecha, hora, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?)");
        } else {
            $stmt = $conn->prepare("INSERT INTO laboratorio_referencia_movimientos (cobro_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, caja_id, fecha, hora, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?)");
        }
        $cobro_id_val = (int)$data['cobro_id'];
        $cotizacion_id_val = (int)($data['cotizacion_id'] ?? 0);
        $examen_id_val = (int)$data['examen_id'];
        $laboratorio_val = (string)$data['laboratorio'];
        $monto_val = (float)$data['monto'];
        $tipo_val = (string)$data['tipo'];
        $estado_val = (string)$data['estado'];
        $paciente_id_val = (int)($data['paciente_id'] ?? 0);
        $observaciones_val = (string)($data['observaciones'] ?? '');
        if ($hasCotizacionId) {
            $stmt->bind_param("iiisdssiis", $cobro_id_val, $cotizacion_id_val, $examen_id_val, $laboratorio_val, $monto_val, $tipo_val, $estado_val, $paciente_id_val, $caja_id, $observaciones_val);
        } else {
            $stmt->bind_param("iisdssiis", $cobro_id_val, $examen_id_val, $laboratorio_val, $monto_val, $tipo_val, $estado_val, $paciente_id_val, $caja_id, $observaciones_val);
        }
        $stmt->execute();
        echo json_encode(['success' => true, 'id' => $conn->insert_id]);
        break;
    case 'GET':
        // Listar movimientos por laboratorio, estado, fecha, etc.
        $laboratorio = $_GET['laboratorio'] ?? null;
        $estado = $_GET['estado'] ?? null;
        $pacienteId = isset($_GET['paciente_id']) ? (int)$_GET['paciente_id'] : 0;
        $examenId = isset($_GET['examen_id']) ? (int)$_GET['examen_id'] : 0;
        $cotizacionId = isset($_GET['cotizacion_id']) ? (int)$_GET['cotizacion_id'] : 0;
        $soloLiquidables = isset($_GET['solo_liquidables']) && (string)$_GET['solo_liquidables'] === '1';
        $hasCotizacionId = column_exists_lr($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
        $hasCotizacionMovimientos = table_exists_lr($conn, 'cotizacion_movimientos');

        $nombreCobradoExpr = 'u.nombre';
        if ($hasCotizacionId && $hasCotizacionMovimientos) {
            $nombreCobradoExpr = "CASE
                WHEN m.cotizacion_id IS NOT NULL AND m.cotizacion_id > 0 THEN COALESCE(
                    NULLIF((
                        SELECT GROUP_CONCAT(DISTINCT ucm.nombre ORDER BY ucm.nombre SEPARATOR ', ')
                        FROM cotizacion_movimientos cm
                        LEFT JOIN usuarios ucm ON ucm.id = cm.usuario_id
                        WHERE cm.cotizacion_id = m.cotizacion_id
                          AND cm.tipo_movimiento = 'abono'
                    ), ''),
                    u.nombre
                )
                ELSE u.nombre
            END";
        }

    $sql = "SELECT m.*, CASE WHEN m.cobro_id > 0 AND c.turno IS NOT NULL AND c.turno <> '' THEN c.turno ELSE m.turno_cobro END AS turno_cobro_resuelto, $nombreCobradoExpr AS nombre_cobrado_por, ul.nombre AS nombre_liquidado_por FROM laboratorio_referencia_movimientos m LEFT JOIN cajas c ON m.caja_id = c.id LEFT JOIN usuarios u ON m.cobrado_por = u.id LEFT JOIN usuarios ul ON m.liquidado_por = ul.id";
        if ($hasCotizacionId) {
            $sql .= " LEFT JOIN cotizaciones ct ON m.cotizacion_id = ct.id";
        }
        $sql .= " WHERE 1=1";
        $params = [];
        $types = "";
        if ($soloLiquidables) {
            if ($hasCotizacionId) {
                $sql .= " AND ((m.cotizacion_id IS NOT NULL AND m.cotizacion_id > 0 AND LOWER(COALESCE(ct.estado, '')) = 'pagado') OR ((m.cotizacion_id IS NULL OR m.cotizacion_id <= 0) AND m.cobro_id > 0))";
            } else {
                $sql .= " AND m.cobro_id > 0";
            }
        }
        if ($laboratorio) {
            $sql .= " AND m.laboratorio = ?";
            $params[] = $laboratorio;
            $types .= "s";
        }
        if ($estado) {
            $sql .= " AND m.estado = ?";
            $params[] = $estado;
            $types .= "s";
        }
        if ($pacienteId > 0) {
            $sql .= " AND m.paciente_id = ?";
            $params[] = $pacienteId;
            $types .= "i";
        }
        if ($examenId > 0) {
            $sql .= " AND m.examen_id = ?";
            $params[] = $examenId;
            $types .= "i";
        }
        if ($hasCotizacionId && $cotizacionId > 0) {
            $sql .= " AND m.cotizacion_id = ?";
            $params[] = $cotizacionId;
            $types .= "i";
        }
        $sql .= " ORDER BY m.fecha DESC, m.hora DESC";
        $stmt = $conn->prepare($sql);
        if (!empty($params)) {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $result = $stmt->get_result();
        $movimientos = [];
        while ($row = $result->fetch_assoc()) {
            $liquidacion = resolver_monto_liquidacion_lr($conn, $row, $hasCotizacionId, $hasCotizacionMovimientos);
            // Mostrar el nombre del usuario en vez del ID (para cobro y liquidación)
            if (isset($row['turno_cobro_resuelto'])) {
                $row['turno_cobro'] = $row['turno_cobro_resuelto'];
            }
            $row['laboratorio_referencia'] = trim((string)($row['laboratorio_referencia'] ?? '')) !== ''
                ? $row['laboratorio_referencia']
                : ($row['laboratorio'] ?? '');
            $row['cobrado_por'] = $row['nombre_cobrado_por'] ?? $row['cobrado_por'];
            $row['liquidado_por'] = $row['nombre_liquidado_por'] ?? $row['liquidado_por'] ?? null;
            $row['cotizacion_id_resuelta'] = (int)($liquidacion['cotizacion_id'] ?? 0);
            $row['monto_liquidacion'] = round((float)($liquidacion['monto'] ?? 0), 2);
            $row['subtotal_cotizacion'] = isset($liquidacion['subtotal']) && $liquidacion['subtotal'] !== null
                ? round((float)$liquidacion['subtotal'], 2)
                : null;
            $row['porcentaje_derivacion'] = isset($liquidacion['porcentaje']) && $liquidacion['porcentaje'] !== null
                ? (float)$liquidacion['porcentaje']
                : null;
            unset($row['turno_cobro_resuelto']);
            unset($row['nombre_cobrado_por']);
            unset($row['nombre_liquidado_por']);
            $movimientos[] = $row;
        }
        echo json_encode(['success' => true, 'movimientos' => $movimientos, 'supports_cotizacion_id' => $hasCotizacionId]);
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}
?>
