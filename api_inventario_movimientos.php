<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

function inventario_mov_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function inventario_mov_body(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function inventario_mov_role(): string
{
    return strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
}

function inventario_mov_require_write_role(): void
{
    $role = inventario_mov_role();
    $allowed = ['administrador', 'quimico', 'químico'];
    if (!in_array($role, $allowed, true)) {
        inventario_mov_response(['success' => false, 'error' => 'No autorizado para registrar movimientos de almacén general'], 403);
    }
}

function inventario_mov_usuario_id(): ?int
{
    if (!isset($_SESSION['usuario']['id'])) {
        return null;
    }
    $id = intval($_SESSION['usuario']['id']);
    return $id > 0 ? $id : null;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    switch ($method) {
        case 'GET':
            $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 50;
            if ($limit <= 0) {
                $limit = 50;
            }
            if ($limit > 500) {
                $limit = 500;
            }

            $stmtMov = $conn->prepare("SELECT m.id, m.tipo, m.cantidad, m.observacion, m.fecha_hora, i.id AS item_id, i.codigo, i.nombre, i.unidad_medida, l.lote_codigo,
                                              CONCAT(COALESCE(u.nombre,''), ' ', COALESCE(u.apellido,'')) AS usuario
                                       FROM inventario_movimientos m
                                       JOIN inventario_items i ON i.id = m.item_id
                                       LEFT JOIN inventario_lotes l ON l.id = m.lote_id
                                       LEFT JOIN usuarios u ON u.id = m.usuario_id
                                       WHERE COALESCE(m.origen, 'inventario') = 'inventario'
                                       ORDER BY m.fecha_hora DESC, m.id DESC
                                       LIMIT ?");
            $stmtMov->bind_param('i', $limit);
            $stmtMov->execute();
            $movimientos = $stmtMov->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtMov->close();

            $stmtLotesVencer = $conn->prepare("SELECT l.id, l.item_id, i.codigo, i.nombre, l.lote_codigo, l.fecha_vencimiento, l.cantidad_actual, i.unidad_medida
                                               FROM inventario_lotes l
                                               JOIN inventario_items i ON i.id = l.item_id
                                               WHERE l.cantidad_actual > 0
                                                 AND l.fecha_vencimiento IS NOT NULL
                                                 AND l.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
                                               ORDER BY l.fecha_vencimiento ASC, i.nombre ASC
                                               LIMIT 100");
            $stmtLotesVencer->execute();
            $lotesPorVencer = $stmtLotesVencer->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtLotesVencer->close();

            $resumen = [
                'total_movimientos' => count($movimientos),
                'lotes_por_vencer' => count($lotesPorVencer),
            ];

            inventario_mov_response([
                'success' => true,
                'resumen' => $resumen,
                'movimientos' => $movimientos,
                'lotes_por_vencer' => $lotesPorVencer,
            ]);
            break;

        case 'POST':
            inventario_mov_require_write_role();
            $data = inventario_mov_body();

            $itemId = intval($data['item_id'] ?? 0);
            $tipo = trim((string)($data['tipo'] ?? ''));
            $cantidad = round((float)($data['cantidad'] ?? 0), 4);
            $cantidadPresentacion = round((float)($data['cantidad_presentacion'] ?? 0), 4);
            $observacion = trim((string)($data['observacion'] ?? ''));
            $loteCodigo = trim((string)($data['lote_codigo'] ?? ''));
            $fechaVencimiento = trim((string)($data['fecha_vencimiento'] ?? ''));
            $usuarioId = inventario_mov_usuario_id();

            $tiposEntrada = ['entrada', 'ajuste_pos'];
            $tiposSalida = ['salida', 'ajuste_neg', 'merma', 'vencido'];
            $tiposValidos = array_merge($tiposEntrada, $tiposSalida);

            if ($itemId <= 0 || !in_array($tipo, $tiposValidos, true) || ($cantidad <= 0 && $cantidadPresentacion <= 0)) {
                inventario_mov_response(['success' => false, 'error' => 'Datos inválidos para registrar movimiento.'], 422);
            }

            if ($fechaVencimiento !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaVencimiento)) {
                inventario_mov_response(['success' => false, 'error' => 'Formato de fecha de vencimiento inválido.'], 422);
            }
            $fechaVencimientoVal = $fechaVencimiento === '' ? null : $fechaVencimiento;

            $stmtItem = $conn->prepare('SELECT id, nombre, unidad_medida, activo, controla_stock, factor_presentacion FROM inventario_items WHERE id = ? LIMIT 1');
            $stmtItem->bind_param('i', $itemId);
            $stmtItem->execute();
            $item = $stmtItem->get_result()->fetch_assoc();
            $stmtItem->close();

            if (!$item || intval($item['activo'] ?? 0) !== 1) {
                inventario_mov_response(['success' => false, 'error' => 'Ítem no disponible para movimientos.'], 404);
            }

            $controlaStock = intval($item['controla_stock'] ?? 1) === 1;
            $factorPresentacion = round((float)($item['factor_presentacion'] ?? 1), 4);
            if ($factorPresentacion <= 0) {
                $factorPresentacion = 1;
            }

            if ($cantidadPresentacion > 0) {
                $cantidad = round($cantidadPresentacion * $factorPresentacion, 4);
                $nota = 'Conversión automática: ' . rtrim(rtrim(number_format($cantidadPresentacion, 4, '.', ''), '0'), '.') .
                        ' presentación x factor ' . rtrim(rtrim(number_format($factorPresentacion, 4, '.', ''), '0'), '.') .
                        ' = ' . rtrim(rtrim(number_format($cantidad, 4, '.', ''), '0'), '.') .
                        ' ' . (string)($item['unidad_medida'] ?? 'unid');
                $observacion = $observacion !== '' ? ($observacion . ' | ' . $nota) : $nota;
            }

            if ($cantidad <= 0) {
                inventario_mov_response(['success' => false, 'error' => 'Cantidad inválida para registrar movimiento.'], 422);
            }

            $conn->begin_transaction();
            $detalleLotes = [];

            if (in_array($tipo, $tiposEntrada, true)) {
                if ($controlaStock) {
                    if ($loteCodigo === '') {
                        $loteCodigo = 'L-' . date('Ymd-His');
                    }

                    $stmtLote = $conn->prepare('SELECT id FROM inventario_lotes WHERE item_id = ? AND lote_codigo = ? AND ((fecha_vencimiento IS NULL AND ? IS NULL) OR fecha_vencimiento = ?) ORDER BY id DESC LIMIT 1');
                    $stmtLote->bind_param('isss', $itemId, $loteCodigo, $fechaVencimientoVal, $fechaVencimientoVal);
                    $stmtLote->execute();
                    $rowLote = $stmtLote->get_result()->fetch_assoc();
                    $stmtLote->close();
                    $loteId = intval($rowLote['id'] ?? 0);

                    if ($loteId > 0) {
                        $stmtUpdLote = $conn->prepare('UPDATE inventario_lotes SET cantidad_inicial = cantidad_inicial + ?, cantidad_actual = cantidad_actual + ?, updated_at = NOW() WHERE id = ?');
                        $stmtUpdLote->bind_param('ddi', $cantidad, $cantidad, $loteId);
                        $stmtUpdLote->execute();
                        $stmtUpdLote->close();
                    } else {
                        $stmtInsLote = $conn->prepare('INSERT INTO inventario_lotes (item_id, lote_codigo, fecha_vencimiento, cantidad_inicial, cantidad_actual, created_at) VALUES (?, ?, ?, ?, ?, NOW())');
                        $stmtInsLote->bind_param('issdd', $itemId, $loteCodigo, $fechaVencimientoVal, $cantidad, $cantidad);
                        $stmtInsLote->execute();
                        $loteId = intval($conn->insert_id);
                        $stmtInsLote->close();
                    }

                    $stmtMov = $conn->prepare("INSERT INTO inventario_movimientos (item_id, lote_id, tipo, cantidad, observacion, origen, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, 'inventario', ?, NOW())");
                    $stmtMov->bind_param('iisdsi', $itemId, $loteId, $tipo, $cantidad, $observacion, $usuarioId);
                    $stmtMov->execute();
                    $stmtMov->close();

                    $detalleLotes[] = [
                        'lote_id' => $loteId,
                        'lote_codigo' => $loteCodigo,
                        'cantidad' => $cantidad,
                    ];
                } else {
                    $stmtMov = $conn->prepare("INSERT INTO inventario_movimientos (item_id, lote_id, tipo, cantidad, observacion, origen, usuario_id, fecha_hora) VALUES (?, NULL, ?, ?, ?, 'inventario', ?, NOW())");
                    $stmtMov->bind_param('isdsi', $itemId, $tipo, $cantidad, $observacion, $usuarioId);
                    $stmtMov->execute();
                    $stmtMov->close();
                }
            } else {
                if ($controlaStock) {
                    $stmtSuma = $conn->prepare('SELECT IFNULL(SUM(cantidad_actual),0) AS stock_total FROM inventario_lotes WHERE item_id = ? AND cantidad_actual > 0');
                    $stmtSuma->bind_param('i', $itemId);
                    $stmtSuma->execute();
                    $stockTotal = round((float)($stmtSuma->get_result()->fetch_assoc()['stock_total'] ?? 0), 4);
                    $stmtSuma->close();

                    if ($stockTotal + 0.0001 < $cantidad) {
                        throw new RuntimeException('Stock insuficiente. Disponible: ' . number_format($stockTotal, 4) . ' ' . (string)($item['unidad_medida'] ?? ''));
                    }

                    $stmtLotes = $conn->prepare('SELECT id, lote_codigo, cantidad_actual FROM inventario_lotes WHERE item_id = ? AND cantidad_actual > 0 ORDER BY (fecha_vencimiento IS NULL) ASC, fecha_vencimiento ASC, id ASC');
                    $stmtLotes->bind_param('i', $itemId);
                    $stmtLotes->execute();
                    $lotes = $stmtLotes->get_result()->fetch_all(MYSQLI_ASSOC);
                    $stmtLotes->close();

                    $stmtUpdLote = $conn->prepare('UPDATE inventario_lotes SET cantidad_actual = cantidad_actual - ?, updated_at = NOW() WHERE id = ?');
                    $stmtMov = $conn->prepare("INSERT INTO inventario_movimientos (item_id, lote_id, tipo, cantidad, observacion, origen, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, 'inventario', ?, NOW())");

                    $restante = $cantidad;
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

                        $stmtMov->bind_param('iisdsi', $itemId, $loteId, $tipo, $consumo, $observacion, $usuarioId);
                        $stmtMov->execute();

                        $detalleLotes[] = [
                            'lote_id' => $loteId,
                            'lote_codigo' => (string)($lote['lote_codigo'] ?? ''),
                            'cantidad' => $consumo,
                        ];

                        $restante = round($restante - $consumo, 4);
                    }

                    $stmtUpdLote->close();
                    $stmtMov->close();

                    if ($restante > 0.0001) {
                        throw new RuntimeException('No se pudo descontar completamente el stock por lotes.');
                    }
                } else {
                    $stmtMov = $conn->prepare("INSERT INTO inventario_movimientos (item_id, lote_id, tipo, cantidad, observacion, origen, usuario_id, fecha_hora) VALUES (?, NULL, ?, ?, ?, 'inventario', ?, NOW())");
                    $stmtMov->bind_param('isdsi', $itemId, $tipo, $cantidad, $observacion, $usuarioId);
                    $stmtMov->execute();
                    $stmtMov->close();
                }
            }

            $conn->commit();

            inventario_mov_response([
                'success' => true,
                'message' => 'Movimiento registrado correctamente.',
                'item_id' => $itemId,
                'tipo' => $tipo,
                'cantidad' => $cantidad,
                'detalle_lotes' => $detalleLotes,
            ]);
            break;

        default:
            inventario_mov_response(['success' => false, 'error' => 'Método no permitido'], 405);
            break;
    }
} catch (Throwable $e) {
    if (isset($conn) && method_exists($conn, 'rollback')) {
        try {
            $conn->rollback();
        } catch (Throwable $rollbackException) {
        }
    }
    inventario_mov_response(['success' => false, 'error' => 'Error interno: ' . $e->getMessage()], 500);
}
