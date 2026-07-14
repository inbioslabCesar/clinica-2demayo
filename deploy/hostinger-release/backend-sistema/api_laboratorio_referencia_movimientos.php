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
            $stmtMovimiento = $conn->prepare("SELECT * FROM laboratorio_referencia_movimientos WHERE id = ?");
            $stmtMovimiento->bind_param("i", $data['id']);
            $stmtMovimiento->execute();
            $resMovimiento = $stmtMovimiento->get_result();
            if ($resMovimiento && $resMovimiento->num_rows > 0) {
                $movimiento = $resMovimiento->fetch_assoc();
                
                // Actualizar estado a pagado
                $stmt = $conn->prepare("UPDATE laboratorio_referencia_movimientos SET estado = 'pagado', liquidado_por = ?, turno_liquidacion = ?, hora_liquidacion = CURTIME(), caja_id = COALESCE(caja_id, ?) WHERE id = ?");
                $stmt->bind_param("issi", $usuario_id, $turno_liq, $caja_id, $data['id']);
                $stmt->execute();
                
                // Registrar egreso en tabla egresos
                $monto = floatval($movimiento['monto']);
                $laboratorio = $conn->real_escape_string($movimiento['laboratorio']);
                $fecha = date('Y-m-d');
                $descripcion = "Liquidación laboratorio referencia: $laboratorio ID {$data['id']}";
                $usuario_nombre = isset($_SESSION['usuario']['nombre']) ? $conn->real_escape_string($_SESSION['usuario']['nombre']) : '';
                
                $sqlEgreso = "INSERT INTO egresos (fecha, tipo, tipo_egreso, categoria, descripcion, concepto, monto, usuario_id, turno, estado, caja_id, responsable, liquidacion_id) VALUES (
                    '$fecha', 'laboratorio', 'laboratorio', 'Laboratorio de Referencia', '$descripcion', '$laboratorio', $monto, $usuario_id, " . ($turno_liq ? "'$turno_liq'" : "NULL") . ", 'pagado', " . ($caja_id ? $caja_id : "NULL") . ", '$usuario_nombre', {$data['id']}
                )";
                $conn->query($sqlEgreso);
                
                echo json_encode(['success' => true]);
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
        $caja_id = $data['caja_id'] ?? null;
        $stmt = $conn->prepare("INSERT INTO laboratorio_referencia_movimientos (cobro_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, caja_id, fecha, hora, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?)");
        $cobro_id_val = (int)$data['cobro_id'];
        $examen_id_val = (int)$data['examen_id'];
        $laboratorio_val = (string)$data['laboratorio'];
        $monto_val = (float)$data['monto'];
        $tipo_val = (string)$data['tipo'];
        $estado_val = (string)$data['estado'];
        $paciente_id_val = (int)($data['paciente_id'] ?? 0);
        $observaciones_val = (string)($data['observaciones'] ?? '');
        $stmt->bind_param("iisdssiis", $cobro_id_val, $examen_id_val, $laboratorio_val, $monto_val, $tipo_val, $estado_val, $paciente_id_val, $caja_id, $observaciones_val);
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
            // Mostrar el nombre del usuario en vez del ID (para cobro y liquidación)
            if (isset($row['turno_cobro_resuelto'])) {
                $row['turno_cobro'] = $row['turno_cobro_resuelto'];
            }
            $row['cobrado_por'] = $row['nombre_cobrado_por'] ?? $row['cobrado_por'];
            $row['liquidado_por'] = $row['nombre_liquidado_por'] ?? $row['liquidado_por'] ?? null;
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
