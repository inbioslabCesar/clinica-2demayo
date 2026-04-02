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
            $stmt = $conn->prepare("UPDATE laboratorio_referencia_movimientos SET estado = 'pagado', liquidado_por = ?, turno_liquidacion = ?, hora_liquidacion = CURTIME(), caja_id = COALESCE(caja_id, ?) WHERE id = ?");
            $stmt->bind_param("issi", $usuario_id, $turno_liq, $caja_id, $data['id']);
            $stmt->execute();
            echo json_encode(['success' => true]);
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
        $hasCotizacionId = column_exists_lr($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
    $sql = "SELECT m.*, CASE WHEN m.cobro_id > 0 AND c.turno IS NOT NULL AND c.turno <> '' THEN c.turno ELSE m.turno_cobro END AS turno_cobro_resuelto, u.nombre AS nombre_cobrado_por, ul.nombre AS nombre_liquidado_por FROM laboratorio_referencia_movimientos m LEFT JOIN cajas c ON m.caja_id = c.id LEFT JOIN usuarios u ON m.cobrado_por = u.id LEFT JOIN usuarios ul ON m.liquidado_por = ul.id WHERE 1=1";
        $params = [];
        $types = "";
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
