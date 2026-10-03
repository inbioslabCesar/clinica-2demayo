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

function ensure_column_lr($conn, $table, $column, $definition) {
    if (!column_exists_lr($conn, $table, $column)) {
        $conn->query("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
    }
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
        // Anular movimiento de laboratorio de referencia (sin eliminación física)
        if (isset($data['accion']) && $data['accion'] === 'anular_movimiento' && isset($data['id'])) {
            $usuario = $_SESSION['usuario'] ?? null;
            if (!$usuario || !is_array($usuario) || strtolower(trim((string)($usuario['rol'] ?? ''))) !== 'administrador') {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Solo el administrador puede anular movimientos de laboratorio']);
                break;
            }
            $motivo = trim((string)($data['motivo'] ?? ''));
            if ($motivo === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'error' => 'Debes indicar el motivo de la anulación']);
                break;
            }

            ensure_column_lr($conn, 'laboratorio_referencia_movimientos', 'anulado_por', 'INT NULL');
            ensure_column_lr($conn, 'laboratorio_referencia_movimientos', 'fecha_anulacion', 'DATETIME NULL');
            ensure_column_lr($conn, 'laboratorio_referencia_movimientos', 'motivo_anulacion', 'TEXT NULL');

            try {
                $conn->begin_transaction();

                $stmt = $conn->prepare("SELECT id, estado FROM laboratorio_referencia_movimientos WHERE id = ? LIMIT 1 FOR UPDATE");
                $stmt->bind_param("i", $data['id']);
                $stmt->execute();
                $mov = $stmt->get_result()->fetch_assoc();
                $stmt->close();

                if (!$mov) {
                    throw new RuntimeException('Movimiento de laboratorio no encontrado');
                }
                $estadoActual = strtolower(trim((string)($mov['estado'] ?? '')));
                if ($estadoActual === 'cancelado') {
                    throw new RuntimeException('Este movimiento ya fue anulado anteriormente');
                }
                if ($estadoActual === 'pagado') {
                    throw new RuntimeException('Este movimiento ya fue liquidado al laboratorio. Debes revertir primero ese pago antes de poder anularlo.');
                }

                $usuarioId = (int)($usuario['id'] ?? 0);
                $stmtUpd = $conn->prepare("UPDATE laboratorio_referencia_movimientos SET estado = 'cancelado', anulado_por = ?, fecha_anulacion = NOW(), motivo_anulacion = ? WHERE id = ? AND estado = 'pendiente'");
                $stmtUpd->bind_param('isi', $usuarioId, $motivo, $data['id']);
                $stmtUpd->execute();
                if ($stmtUpd->affected_rows !== 1) {
                    throw new RuntimeException('No se pudo anular el movimiento de laboratorio');
                }
                $stmtUpd->close();

                $conn->commit();
                echo json_encode(['success' => true]);
            } catch (Throwable $e) {
                try { $conn->rollback(); } catch (Throwable $ignored) {}
                error_log('api_laboratorio_referencia_movimientos.php: ' . $e->getMessage());
                http_response_code(422);
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
            break;
        }

        // Si la acción es marcar como pagado
        if (isset($data['accion']) && $data['accion'] === 'marcar_pagado' && isset($data['id'])) {
            $metodoPago = strtolower(trim((string)($data['metodo_pago'] ?? 'efectivo')));
            $fuenteFondos = strtolower(trim((string)($data['fuente_fondos'] ?? 'clinica')));
            $terceroNombre = trim((string)($data['tercero_nombre'] ?? ''));
            $referenciaPago = trim((string)($data['referencia_pago'] ?? ''));
            $observacionesPago = trim((string)($data['observaciones'] ?? ''));

            $metodosValidos = ['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta', 'cheque', 'deposito'];
            $fuentesValidas = ['clinica', 'tercero_directo', 'tercero_fondeo'];
            if (!in_array($metodoPago, $metodosValidos, true) || !in_array($fuenteFondos, $fuentesValidas, true)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'error' => 'Datos de liquidación inválidos']);
                break;
            }
            if ($fuenteFondos !== 'clinica' && $terceroNombre === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'error' => 'Indica quién cubrió el pago externo']);
                break;
            }

            // Registrar quién liquidó y el turno/hora de liquidación
            $usuario = $_SESSION['usuario'] ?? null;
            $usuario_id = $usuario['id'] ?? null;
            $turno_liq = null;
            $caja_id = null;
            if (!$usuario_id) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
                break;
            }

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

            if (!$caja_id) {
                http_response_code(422);
                echo json_encode(['success' => false, 'error' => 'Debes tener una caja abierta para liquidar laboratorio de referencia']);
                break;
            }

            ensure_column_lr($conn, 'egresos', 'fuente_fondos', "VARCHAR(30) NOT NULL DEFAULT 'clinica'");
            ensure_column_lr($conn, 'egresos', 'tercero_nombre', 'VARCHAR(150) NULL');
            ensure_column_lr($conn, 'egresos', 'referencia_pago', 'VARCHAR(150) NULL');
            ensure_column_lr($conn, 'laboratorio_referencia_movimientos', 'metodo_pago_liquidacion', "VARCHAR(30) NULL DEFAULT NULL");
            ensure_column_lr($conn, 'laboratorio_referencia_movimientos', 'fuente_fondos_liquidacion', "VARCHAR(30) NULL DEFAULT NULL");
            ensure_column_lr($conn, 'laboratorio_referencia_movimientos', 'tercero_nombre_liquidacion', "VARCHAR(150) NULL DEFAULT NULL");
            ensure_column_lr($conn, 'laboratorio_referencia_movimientos', 'referencia_pago_liquidacion', "VARCHAR(150) NULL DEFAULT NULL");
            ensure_column_lr($conn, 'laboratorio_referencia_movimientos', 'observacion_liquidacion', "TEXT NULL");

            $conn->query("CREATE TABLE IF NOT EXISTS cuenta_corriente_terceros (
                id INT AUTO_INCREMENT PRIMARY KEY,
                caja_id INT NULL,
                tercero_nombre VARCHAR(150) NOT NULL,
                tipo_movimiento VARCHAR(30) NOT NULL,
                monto DECIMAL(12,2) NOT NULL,
                metodo_pago VARCHAR(30) NOT NULL,
                referencia_pago VARCHAR(150) NULL,
                honorario_movimiento_id INT NULL,
                usuario_id INT NOT NULL,
                observaciones TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_cct_caja (caja_id),
                INDEX idx_cct_tercero (tercero_nombre),
                INDEX idx_cct_honorario (honorario_movimiento_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // Obtener datos del movimiento de laboratorio para el egreso
            $hasCotizacionId = column_exists_lr($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
            $hasCotizacionMovimientos = table_exists_lr($conn, 'cotizacion_movimientos');

            try {
                $conn->begin_transaction();

                $stmtMovimiento = $conn->prepare("SELECT * FROM laboratorio_referencia_movimientos WHERE id = ? FOR UPDATE");
                $stmtMovimiento->bind_param("i", $data['id']);
                $stmtMovimiento->execute();
                $resMovimiento = $stmtMovimiento->get_result();
                if (!$resMovimiento || $resMovimiento->num_rows === 0) {
                    throw new RuntimeException('Movimiento de laboratorio no encontrado');
                }

                $movimiento = $resMovimiento->fetch_assoc();
                if (strtolower(trim((string)($movimiento['estado'] ?? ''))) !== 'pendiente') {
                    throw new RuntimeException('El movimiento ya fue liquidado o no está disponible');
                }

                $liquidacion = resolver_monto_liquidacion_lr($conn, $movimiento, $hasCotizacionId, $hasCotizacionMovimientos);
                $monto = (float)($liquidacion['monto'] ?? 0);
                if ($monto <= 0) {
                    throw new RuntimeException('El monto de liquidación no es válido');
                }

                // Actualizar estado a pagado y datos de liquidación
                $stmt = $conn->prepare("UPDATE laboratorio_referencia_movimientos SET estado = 'pagado', liquidado_por = ?, turno_liquidacion = ?, hora_liquidacion = CURTIME(), caja_id = COALESCE(caja_id, ?), metodo_pago_liquidacion = ?, fuente_fondos_liquidacion = ?, tercero_nombre_liquidacion = ?, referencia_pago_liquidacion = ?, observacion_liquidacion = ? WHERE id = ? AND estado = 'pendiente'");
                $stmt->bind_param("isisssssi", $usuario_id, $turno_liq, $caja_id, $metodoPago, $fuenteFondos, $terceroNombre, $referenciaPago, $observacionesPago, $data['id']);
                $stmt->execute();
                if ($stmt->affected_rows !== 1) {
                    throw new RuntimeException('No se pudo actualizar el estado del movimiento de laboratorio');
                }

                // Registrar egreso en tabla egresos
                $descripcion = 'Liquidación laboratorio referencia: ' . (string)($movimiento['laboratorio'] ?? '') . ' ID ' . (int)$data['id'];
                $concepto = (string)($movimiento['laboratorio'] ?? 'Laboratorio');
                $usuario_nombre = isset($_SESSION['usuario']['nombre']) ? (string)$_SESSION['usuario']['nombre'] : '';
                $tercero = $fuenteFondos === 'clinica' ? null : $terceroNombre;

                $stmtEgreso = $conn->prepare("INSERT INTO egresos (fecha, tipo, tipo_egreso, categoria, descripcion, concepto, monto, metodo_pago, usuario_id, turno, estado, caja_id, responsable, fuente_fondos, tercero_nombre, referencia_pago, liquidacion_id) VALUES (CURDATE(), 'laboratorio', 'laboratorio', 'Laboratorio de Referencia', ?, ?, ?, ?, ?, ?, 'pagado', ?, ?, ?, ?, ?, ?)");
                $stmtEgreso->bind_param("ssdsisissssi", $descripcion, $concepto, $monto, $metodoPago, $usuario_id, $turno_liq, $caja_id, $usuario_nombre, $fuenteFondos, $tercero, $referenciaPago, $data['id']);
                $stmtEgreso->execute();

                if ($fuenteFondos !== 'clinica') {
                    $stmtCuentaTercero = $conn->prepare("INSERT INTO cuenta_corriente_terceros (caja_id, tercero_nombre, tipo_movimiento, monto, metodo_pago, referencia_pago, honorario_movimiento_id, usuario_id, observaciones) VALUES (?, ?, 'adelanto_laboratorio_referencia', ?, ?, ?, NULL, ?, ?)");
                    $stmtCuentaTercero->bind_param('isdssis', $caja_id, $terceroNombre, $monto, $metodoPago, $referenciaPago, $usuario_id, $observacionesPago);
                    $stmtCuentaTercero->execute();
                    $stmtCuentaTercero->close();
                }

                $stmtEgreso->close();
                $conn->commit();

                echo json_encode([
                    'success' => true,
                    'monto_liquidado' => round($monto, 2),
                    'cotizacion_id' => (int)($liquidacion['cotizacion_id'] ?? 0),
                    'subtotal_cotizacion' => isset($liquidacion['subtotal']) && $liquidacion['subtotal'] !== null ? round((float)$liquidacion['subtotal'], 2) : null,
                    'porcentaje_derivacion' => isset($liquidacion['porcentaje']) && $liquidacion['porcentaje'] !== null ? (float)$liquidacion['porcentaje'] : null,
                ]);
            } catch (Throwable $e) {
                try { $conn->rollback(); } catch (Throwable $ignored) {}
                error_log('api_laboratorio_referencia_movimientos.php: ' . $e->getMessage());
                http_response_code(422);
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
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
        $incluirCancelados = isset($_GET['incluir_cancelados']) && (string)$_GET['incluir_cancelados'] === '1';
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
        if (!$incluirCancelados) {
            $sql .= " AND LOWER(COALESCE(m.estado, '')) <> 'cancelado'";
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
