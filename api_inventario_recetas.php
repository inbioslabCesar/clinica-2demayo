<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

function recetas_json_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function recetas_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    switch ($method) {
        case 'GET':
            $filtroExamenId = isset($_GET['examen_id']) ? intval($_GET['examen_id']) : 0;
            $filtroItemId = isset($_GET['item_id']) ? intval($_GET['item_id']) : 0;
            $filtroActivo = isset($_GET['activo']) ? intval($_GET['activo']) : null;
            $incluirCatalogo = isset($_GET['catalogo']) && intval($_GET['catalogo']) === 1;

            $sql = "SELECT r.id, r.id_examen, r.item_id, r.cantidad_por_prueba, r.activo, r.observacion, r.created_at, r.updated_at,
                           e.nombre AS examen_nombre,
                           i.codigo AS item_codigo,
                           i.nombre AS item_nombre,
                           i.unidad_medida,
                           i.marca,
                           i.presentacion
                    FROM inventario_examen_recetas r
                    LEFT JOIN examenes_laboratorio e ON e.id = r.id_examen
                    JOIN inventario_items i ON i.id = r.item_id
                    WHERE 1=1";
            $params = [];
            $types = '';

            if ($filtroExamenId > 0) {
                $sql .= ' AND r.id_examen = ?';
                $params[] = $filtroExamenId;
                $types .= 'i';
            }

            if ($filtroItemId > 0) {
                $sql .= ' AND r.item_id = ?';
                $params[] = $filtroItemId;
                $types .= 'i';
            }

            if ($filtroActivo !== null && ($filtroActivo === 0 || $filtroActivo === 1)) {
                $sql .= ' AND r.activo = ?';
                $params[] = $filtroActivo;
                $types .= 'i';
            }

            $sql .= ' ORDER BY e.nombre ASC, i.nombre ASC';

            $stmt = $conn->prepare($sql);
            if (!empty($params)) {
                $stmt->bind_param($types, ...$params);
            }
            $stmt->execute();
            $res = $stmt->get_result();

            $recetas = [];
            while ($row = $res->fetch_assoc()) {
                $recetas[] = $row;
            }
            $stmt->close();

            $payload = [
                'success' => true,
                'recetas' => $recetas,
            ];

            if ($incluirCatalogo) {
                $examenes = [];
                $stmtEx = $conn->prepare('SELECT id, nombre FROM examenes_laboratorio WHERE COALESCE(activo, 1) = 1 ORDER BY nombre ASC');
                $stmtEx->execute();
                $resEx = $stmtEx->get_result();
                while ($rowEx = $resEx->fetch_assoc()) {
                    $examenes[] = $rowEx;
                }
                $stmtEx->close();

                $items = [];
                $stmtItems = $conn->prepare("SELECT i.id, i.codigo, i.nombre, i.unidad_medida, i.marca, i.presentacion,
                                                    IFNULL(SUM(l.cantidad_actual), 0) AS stock_almacen
                                             FROM inventario_items i
                                             LEFT JOIN inventario_lotes l ON l.item_id = i.id
                                             WHERE i.activo = 1
                                             GROUP BY i.id, i.codigo, i.nombre, i.unidad_medida, i.marca, i.presentacion
                                             ORDER BY i.nombre ASC");
                $stmtItems->execute();
                $resItems = $stmtItems->get_result();
                while ($rowItem = $resItems->fetch_assoc()) {
                    $items[] = $rowItem;
                }
                $stmtItems->close();

                $payload['catalogo'] = [
                    'examenes' => $examenes,
                    'items' => $items,
                ];
            }

            recetas_json_response($payload);
            break;

        case 'POST':
            $data = recetas_read_json_body();

            $idExamen = intval($data['id_examen'] ?? 0);
            $itemId = intval($data['item_id'] ?? 0);
            $cantidadPorPrueba = round((float)($data['cantidad_por_prueba'] ?? 0), 4);
            $activo = isset($data['activo']) ? intval($data['activo']) : 1;
            $observacion = trim((string)($data['observacion'] ?? ''));

            if ($idExamen <= 0 || $itemId <= 0 || $cantidadPorPrueba <= 0) {
                recetas_json_response(['success' => false, 'error' => 'Datos inválidos para la receta.'], 422);
            }

            $stmtEx = $conn->prepare('SELECT id FROM examenes_laboratorio WHERE id = ? LIMIT 1');
            $stmtEx->bind_param('i', $idExamen);
            $stmtEx->execute();
            $examenValido = $stmtEx->get_result()->fetch_assoc();
            $stmtEx->close();
            if (!$examenValido) {
                recetas_json_response(['success' => false, 'error' => 'Examen no válido.'], 404);
            }

            $stmtItem = $conn->prepare('SELECT id FROM inventario_items WHERE id = ? LIMIT 1');
            $stmtItem->bind_param('i', $itemId);
            $stmtItem->execute();
            $itemValido = $stmtItem->get_result()->fetch_assoc();
            $stmtItem->close();
            if (!$itemValido) {
                recetas_json_response(['success' => false, 'error' => 'Ítem de inventario no válido.'], 404);
            }

            $stmtUpsert = $conn->prepare("INSERT INTO inventario_examen_recetas (id_examen, item_id, cantidad_por_prueba, activo, observacion, created_at)
                                          VALUES (?, ?, ?, ?, ?, NOW())
                                          ON DUPLICATE KEY UPDATE
                                              cantidad_por_prueba = VALUES(cantidad_por_prueba),
                                              activo = VALUES(activo),
                                              observacion = VALUES(observacion),
                                              updated_at = NOW()");
            $obsValue = $observacion !== '' ? $observacion : null;
            $activo = $activo === 0 ? 0 : 1;
            $stmtUpsert->bind_param('iidis', $idExamen, $itemId, $cantidadPorPrueba, $activo, $obsValue);
            $ok = $stmtUpsert->execute();
            $stmtUpsert->close();

            if (!$ok) {
                recetas_json_response(['success' => false, 'error' => 'No se pudo guardar la receta.'], 500);
            }

            $stmtId = $conn->prepare('SELECT id FROM inventario_examen_recetas WHERE id_examen = ? AND item_id = ? LIMIT 1');
            $stmtId->bind_param('ii', $idExamen, $itemId);
            $stmtId->execute();
            $rowId = $stmtId->get_result()->fetch_assoc();
            $stmtId->close();

            recetas_json_response([
                'success' => true,
                'id' => intval($rowId['id'] ?? 0),
                'message' => 'Receta guardada correctamente.',
            ]);
            break;

        case 'PUT':
            $data = recetas_read_json_body();
            $id = intval($data['id'] ?? 0);
            if ($id <= 0) {
                recetas_json_response(['success' => false, 'error' => 'ID requerido.'], 422);
            }

            $cantidadPorPrueba = round((float)($data['cantidad_por_prueba'] ?? 0), 4);
            $activo = isset($data['activo']) ? intval($data['activo']) : 1;
            $observacion = trim((string)($data['observacion'] ?? ''));

            if ($cantidadPorPrueba <= 0) {
                recetas_json_response(['success' => false, 'error' => 'Cantidad por prueba inválida.'], 422);
            }

            $activo = $activo === 0 ? 0 : 1;
            $obsValue = $observacion !== '' ? $observacion : null;

            $stmtUpd = $conn->prepare('UPDATE inventario_examen_recetas SET cantidad_por_prueba = ?, activo = ?, observacion = ?, updated_at = NOW() WHERE id = ?');
            $stmtUpd->bind_param('disi', $cantidadPorPrueba, $activo, $obsValue, $id);
            $ok = $stmtUpd->execute();
            $affected = $stmtUpd->affected_rows;
            $stmtUpd->close();

            if (!$ok) {
                recetas_json_response(['success' => false, 'error' => 'No se pudo actualizar la receta.'], 500);
            }

            recetas_json_response([
                'success' => true,
                'updated' => $affected >= 0,
            ]);
            break;

        case 'DELETE':
            $data = recetas_read_json_body();
            $id = intval($data['id'] ?? 0);
            if ($id <= 0) {
                recetas_json_response(['success' => false, 'error' => 'ID requerido.'], 422);
            }

            $stmtDel = $conn->prepare('DELETE FROM inventario_examen_recetas WHERE id = ? LIMIT 1');
            $stmtDel->bind_param('i', $id);
            $ok = $stmtDel->execute();
            $affected = $stmtDel->affected_rows;
            $stmtDel->close();

            recetas_json_response([
                'success' => $ok,
                'deleted' => $affected > 0,
            ]);
            break;

        default:
            recetas_json_response(['success' => false, 'error' => 'Método no permitido'], 405);
            break;
    }
} catch (Throwable $e) {
    recetas_json_response(['success' => false, 'error' => 'Error interno: ' . $e->getMessage()], 500);
}
