<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

function transfer_json_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function transfer_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function transfer_get_usuario_id(): ?int
{
    if (isset($_SESSION['usuario']['id'])) {
        $usuarioId = intval($_SESSION['usuario']['id']);
        return $usuarioId > 0 ? $usuarioId : null;
    }
    return null;
}

function transfer_get_user_role(): string
{
    return strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
}

function transfer_require_write_role(): void
{
    $role = transfer_get_user_role();
    $allowed = ['administrador', 'quimico', 'químico'];
    if (!in_array($role, $allowed, true)) {
        transfer_json_response(['success' => false, 'error' => 'No autorizado para registrar transferencias internas'], 403);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    switch ($method) {
        case 'GET':
            $accion = trim((string)($_GET['accion'] ?? 'listar'));

            if ($accion === 'stock_interno') {
                $sqlStock = "SELECT
                                i.id,
                                i.codigo,
                                i.nombre,
                                i.unidad_medida,
                                IFNULL(tra.total_transferido, 0) AS transferido,
                                IFNULL(con.total_consumido, 0) AS consumido,
                                (IFNULL(tra.total_transferido, 0) - IFNULL(con.total_consumido, 0)) AS saldo
                             FROM inventario_items i
                             LEFT JOIN (
                                 SELECT td.item_id, SUM(td.cantidad) AS total_transferido
                                 FROM inventario_transferencias_detalle td
                                 JOIN inventario_transferencias t ON t.id = td.transferencia_id
                                 WHERE t.destino = 'laboratorio'
                                 GROUP BY td.item_id
                             ) tra ON tra.item_id = i.id
                             LEFT JOIN (
                                 SELECT item_id, SUM(cantidad_consumida) AS total_consumido
                                 FROM inventario_consumos_examen
                                 WHERE estado = 'aplicado'
                                 GROUP BY item_id
                             ) con ON con.item_id = i.id
                             WHERE i.activo = 1
                               AND (IFNULL(tra.total_transferido, 0) > 0 OR IFNULL(con.total_consumido, 0) > 0)
                             ORDER BY saldo ASC, i.nombre ASC";
                $resultStock = $conn->query($sqlStock);
                $stockInterno = [];
                while ($row = $resultStock->fetch_assoc()) {
                    $stockInterno[] = $row;
                }

                transfer_json_response([
                    'success' => true,
                    'stock_interno' => $stockInterno,
                ]);
            }

            $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 50;
            if ($limit <= 0) {
                $limit = 50;
            }
            if ($limit > 200) {
                $limit = 200;
            }

            $sql = "SELECT
                        t.id,
                        t.origen,
                        t.destino,
                        t.usuario_id,
                        t.observacion,
                        t.fecha_hora,
                        COUNT(td.id) AS items_count,
                        IFNULL(SUM(td.cantidad), 0) AS cantidad_total,
                        CONCAT(COALESCE(u.nombre,''), ' ', COALESCE(u.apellido,'')) AS usuario_nombre
                    FROM inventario_transferencias t
                    LEFT JOIN inventario_transferencias_detalle td ON td.transferencia_id = t.id
                    LEFT JOIN usuarios u ON u.id = t.usuario_id
                    GROUP BY t.id, t.origen, t.destino, t.usuario_id, t.observacion, t.fecha_hora, u.nombre, u.apellido
                    ORDER BY t.fecha_hora DESC, t.id DESC
                    LIMIT ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param('i', $limit);
            $stmt->execute();
            $res = $stmt->get_result();

            $transferencias = [];
            while ($row = $res->fetch_assoc()) {
                $transferencias[] = $row;
            }
            $stmt->close();

            transfer_json_response([
                'success' => true,
                'transferencias' => $transferencias,
            ]);
            break;

        case 'POST':
            transfer_require_write_role();
            $data = transfer_read_json_body();

            $origen = trim((string)($data['origen'] ?? 'almacen_principal'));
            $destino = trim((string)($data['destino'] ?? 'laboratorio'));
            $observacion = trim((string)($data['observacion'] ?? ''));
            $usuarioId = transfer_get_usuario_id();

            $items = [];
            if (isset($data['items']) && is_array($data['items']) && count($data['items']) > 0) {
                $items = $data['items'];
            } else {
                $items[] = [
                    'item_id' => $data['item_id'] ?? null,
                    'cantidad' => $data['cantidad'] ?? null,
                ];
            }

            $itemsNormalizados = [];
            foreach ($items as $it) {
                if (!is_array($it)) {
                    continue;
                }
                $itemId = intval($it['item_id'] ?? 0);
                $cantidad = round((float)($it['cantidad'] ?? 0), 4);
                if ($itemId <= 0 || $cantidad <= 0) {
                    continue;
                }
                $itemsNormalizados[] = [
                    'item_id' => $itemId,
                    'cantidad' => $cantidad,
                ];
            }

            if (empty($itemsNormalizados)) {
                transfer_json_response(['success' => false, 'error' => 'No hay items válidos para transferir.'], 422);
            }

            $conn->begin_transaction();

            $stmtTransfer = $conn->prepare('INSERT INTO inventario_transferencias (origen, destino, usuario_id, observacion, fecha_hora) VALUES (?, ?, ?, ?, NOW())');
            $stmtTransfer->bind_param('ssis', $origen, $destino, $usuarioId, $observacion);
            $okTransfer = $stmtTransfer->execute();
            $stmtTransfer->close();

            if (!$okTransfer) {
                throw new RuntimeException('No se pudo crear la cabecera de transferencia.');
            }

            $transferenciaId = intval($conn->insert_id);

            $stmtItem = $conn->prepare('SELECT id, codigo, nombre, unidad_medida, activo, controla_stock FROM inventario_items WHERE id = ? LIMIT 1');
            $stmtStock = $conn->prepare('SELECT IFNULL(SUM(cantidad_actual),0) AS stock_total FROM inventario_lotes WHERE item_id = ? AND cantidad_actual > 0');
            $stmtDetalle = $conn->prepare('INSERT INTO inventario_transferencias_detalle (transferencia_id, item_id, cantidad, created_at) VALUES (?, ?, ?, NOW())');
            $stmtLotes = $conn->prepare('SELECT id, cantidad_actual FROM inventario_lotes WHERE item_id = ? AND cantidad_actual > 0 ORDER BY (fecha_vencimiento IS NULL) ASC, fecha_vencimiento ASC, id ASC');
            $stmtUpdLote = $conn->prepare('UPDATE inventario_lotes SET cantidad_actual = cantidad_actual - ?, updated_at = NOW() WHERE id = ?');
            $stmtMov = $conn->prepare("INSERT INTO inventario_movimientos (item_id, lote_id, tipo, cantidad, observacion, origen, usuario_id, fecha_hora) VALUES (?, ?, 'salida', ?, ?, 'transferencia_interna', ?, NOW())");

            $resumenItems = [];
            $cantidadTotal = 0.0;

            foreach ($itemsNormalizados as $itemTransferencia) {
                $itemId = intval($itemTransferencia['item_id']);
                $cantidadSolicitada = round((float)$itemTransferencia['cantidad'], 4);

                $stmtItem->bind_param('i', $itemId);
                $stmtItem->execute();
                $item = $stmtItem->get_result()->fetch_assoc();

                if (!$item || intval($item['activo'] ?? 0) !== 1) {
                    throw new RuntimeException('Ítem no disponible para transferencia: #' . $itemId);
                }

                $controlaStock = intval($item['controla_stock'] ?? 1) === 1;

                if ($controlaStock) {
                    $stmtStock->bind_param('i', $itemId);
                    $stmtStock->execute();
                    $stockTotal = round((float)($stmtStock->get_result()->fetch_assoc()['stock_total'] ?? 0), 4);

                    if ($stockTotal + 0.0001 < $cantidadSolicitada) {
                        throw new RuntimeException(
                            'Stock insuficiente para ' . ($item['codigo'] ?? '') . ' ' . ($item['nombre'] ?? '') .
                            '. Disponible: ' . number_format($stockTotal, 4) . ' ' . ($item['unidad_medida'] ?? '')
                        );
                    }
                }

                $stmtDetalle->bind_param('iid', $transferenciaId, $itemId, $cantidadSolicitada);
                $okDetalle = $stmtDetalle->execute();
                if (!$okDetalle) {
                    throw new RuntimeException('No se pudo registrar detalle de transferencia para item #' . $itemId);
                }

                if ($controlaStock) {
                    $restante = $cantidadSolicitada;
                    $stmtLotes->bind_param('i', $itemId);
                    $stmtLotes->execute();
                    $lotes = $stmtLotes->get_result()->fetch_all(MYSQLI_ASSOC);

                    foreach ($lotes as $lote) {
                        if ($restante <= 0) {
                            break;
                        }

                        $actual = round((float)($lote['cantidad_actual'] ?? 0), 4);
                        if ($actual <= 0) {
                            continue;
                        }

                        $consumo = min($actual, $restante);

                        $loteId = intval($lote['id']);
                        $stmtUpdLote->bind_param('di', $consumo, $loteId);
                        $stmtUpdLote->execute();

                        $obsMov = 'Transferencia interna #' . $transferenciaId;
                        if ($observacion !== '') {
                            $obsMov .= ' | ' . $observacion;
                        }

                        $stmtMov->bind_param('iidsi', $itemId, $loteId, $consumo, $obsMov, $usuarioId);
                        $stmtMov->execute();

                        $restante = round($restante - $consumo, 4);
                    }

                    if ($restante > 0.0001) {
                        throw new RuntimeException('No se pudo descontar stock por lotes para item #' . $itemId);
                    }
                }

                $cantidadTotal += $cantidadSolicitada;
                $resumenItems[] = [
                    'item_id' => $itemId,
                    'codigo' => (string)($item['codigo'] ?? ''),
                    'nombre' => (string)($item['nombre'] ?? ''),
                    'cantidad' => $cantidadSolicitada,
                    'unidad_medida' => (string)($item['unidad_medida'] ?? ''),
                ];
            }

            $stmtItem->close();
            $stmtStock->close();
            $stmtDetalle->close();
            $stmtLotes->close();
            $stmtUpdLote->close();
            $stmtMov->close();

            $conn->commit();

            transfer_json_response([
                'success' => true,
                'transferencia_id' => $transferenciaId,
                'items_count' => count($resumenItems),
                'cantidad_total' => round($cantidadTotal, 4),
                'items' => $resumenItems,
            ]);
            break;

        default:
            transfer_json_response(['success' => false, 'error' => 'Método no permitido'], 405);
            break;
    }
} catch (Throwable $e) {
    if (isset($conn) && method_exists($conn, 'rollback')) {
        try {
            $conn->rollback();
        } catch (Throwable $rollbackException) {
        }
    }
    transfer_json_response(['success' => false, 'error' => 'Error interno: ' . $e->getMessage()], 500);
}
