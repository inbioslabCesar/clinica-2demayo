<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

function inventario_items_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function inventario_items_body(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function inventario_items_user_role(): string
{
    return strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
}

function inventario_items_require_write_role(): void
{
    $role = inventario_items_user_role();
    $allowed = ['administrador', 'quimico', 'químico'];
    if (!in_array($role, $allowed, true)) {
        inventario_items_response(['success' => false, 'error' => 'No autorizado para modificar inventario general'], 403);
    }
}

function inventario_items_estado_stock(float $stockActual, float $stockMinimo, float $stockCritico, int $controlaStock): string
{
    if ($controlaStock !== 1) {
        return 'ok';
    }
    if ($stockActual <= 0) {
        return 'sin_stock';
    }
    if ($stockCritico > 0 && $stockActual <= $stockCritico) {
        return 'critico';
    }
    if ($stockMinimo > 0 && $stockActual <= $stockMinimo) {
        return 'bajo';
    }
    return 'ok';
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    switch ($method) {
        case 'GET':
            $q = trim((string)($_GET['q'] ?? ''));
            $categoria = trim((string)($_GET['categoria'] ?? 'todos'));
            $estadoStock = trim((string)($_GET['estado_stock'] ?? 'todos'));
            $soloActivos = isset($_GET['solo_activos']) && intval($_GET['solo_activos']) === 1;

            $sql = "SELECT
                        i.id,
                        i.codigo,
                        i.nombre,
                        i.categoria,
                        i.marca,
                        i.presentacion,
                        i.factor_presentacion,
                        i.unidad_medida,
                        i.controla_stock,
                        i.stock_minimo,
                        i.stock_critico,
                        i.activo,
                        i.created_at,
                        i.updated_at,
                        IFNULL(SUM(l.cantidad_actual), 0) AS stock_actual
                    FROM inventario_items i
                    LEFT JOIN inventario_lotes l ON l.item_id = i.id
                    WHERE 1=1";
            $params = [];
            $types = '';

            if ($q !== '') {
                $sql .= " AND (i.codigo LIKE ? OR i.nombre LIKE ? OR i.marca LIKE ? OR i.presentacion LIKE ? OR i.unidad_medida LIKE ? )";
                $like = '%' . $q . '%';
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
                $types .= 'sssss';
            }

            $categoriasValidas = ['reactivo', 'insumo', 'material', 'activo_fijo'];
            if (in_array($categoria, $categoriasValidas, true)) {
                $sql .= ' AND i.categoria = ?';
                $params[] = $categoria;
                $types .= 's';
            }

            if ($soloActivos) {
                $sql .= ' AND i.activo = 1';
            }

            $sql .= " GROUP BY i.id, i.codigo, i.nombre, i.categoria, i.marca, i.presentacion, i.factor_presentacion, i.unidad_medida,
                              i.controla_stock, i.stock_minimo, i.stock_critico, i.activo, i.created_at, i.updated_at
                      ORDER BY i.created_at DESC, i.id DESC";

            $stmt = $conn->prepare($sql);
            if (!$stmt) {
                throw new RuntimeException('No se pudo preparar consulta de inventario_items.');
            }
            if (!empty($params)) {
                $stmt->bind_param($types, ...$params);
            }
            $stmt->execute();
            $res = $stmt->get_result();

            $items = [];
            $resumen = [
                'items_activos' => 0,
                'stock_critico' => 0,
                'sin_stock' => 0,
            ];

            while ($row = $res->fetch_assoc()) {
                $stockActual = round((float)($row['stock_actual'] ?? 0), 2);
                $stockMinimo = round((float)($row['stock_minimo'] ?? 0), 2);
                $stockCritico = round((float)($row['stock_critico'] ?? 0), 2);
                $controlaStock = intval($row['controla_stock'] ?? 1) === 1 ? 1 : 0;

                $estado = inventario_items_estado_stock($stockActual, $stockMinimo, $stockCritico, $controlaStock);
                if ($estadoStock !== 'todos' && $estado !== $estadoStock) {
                    continue;
                }

                $row['stock_actual'] = $stockActual;
                $row['estado_stock'] = $estado;
                $items[] = $row;

                if (intval($row['activo'] ?? 0) === 1) {
                    $resumen['items_activos']++;
                }
                if ($estado === 'critico') {
                    $resumen['stock_critico']++;
                }
                if ($estado === 'sin_stock') {
                    $resumen['sin_stock']++;
                }
            }
            $stmt->close();

            inventario_items_response([
                'success' => true,
                'items' => array_values($items),
                'resumen' => $resumen,
            ]);
            break;

        case 'POST':
            inventario_items_require_write_role();
            $data = inventario_items_body();

            $nombre = trim((string)($data['nombre'] ?? ''));
            $categoria = trim((string)($data['categoria'] ?? ''));
            $codigo = trim((string)($data['codigo'] ?? ''));
            $marca = trim((string)($data['marca'] ?? ''));
            $presentacion = trim((string)($data['presentacion'] ?? ''));
            $factorPresentacion = round((float)($data['factor_presentacion'] ?? 1), 4);
            $unidad = trim((string)($data['unidad_medida'] ?? ''));
            $controlaStock = isset($data['controla_stock']) ? (intval($data['controla_stock']) === 1 ? 1 : 0) : 1;
            $stockMinimo = round((float)($data['stock_minimo'] ?? 0), 2);
            $stockCritico = round((float)($data['stock_critico'] ?? 0), 2);

            $categoriasValidas = ['reactivo', 'insumo', 'material', 'activo_fijo'];
            if ($nombre === '' || $unidad === '' || !in_array($categoria, $categoriasValidas, true)) {
                inventario_items_response(['success' => false, 'error' => 'Completa los campos obligatorios del ítem.'], 422);
            }
            if ($factorPresentacion <= 0) {
                inventario_items_response(['success' => false, 'error' => 'El factor de presentación debe ser mayor a cero.'], 422);
            }
            if ($stockMinimo < 0 || $stockCritico < 0) {
                inventario_items_response(['success' => false, 'error' => 'Stocks de referencia inválidos.'], 422);
            }

            if ($categoria === 'activo_fijo') {
                $controlaStock = 0;
            }
            if ($controlaStock === 0) {
                $stockMinimo = 0;
                $stockCritico = 0;
            }

            if ($codigo === '') {
                $stmtLast = $conn->prepare('SELECT IFNULL(MAX(id),0) + 1 AS next_id FROM inventario_items');
                $stmtLast->execute();
                $nextId = intval($stmtLast->get_result()->fetch_assoc()['next_id'] ?? 1);
                $stmtLast->close();
                $codigo = 'INV-' . str_pad((string)$nextId, 5, '0', STR_PAD_LEFT);
            }

            $stmtDup = $conn->prepare('SELECT id FROM inventario_items WHERE codigo = ? LIMIT 1');
            $stmtDup->bind_param('s', $codigo);
            $stmtDup->execute();
            $dup = $stmtDup->get_result()->fetch_assoc();
            $stmtDup->close();
            if ($dup) {
                inventario_items_response(['success' => false, 'error' => 'Ya existe un ítem con ese código.'], 409);
            }

            $stmt = $conn->prepare('INSERT INTO inventario_items (codigo, nombre, categoria, marca, presentacion, factor_presentacion, unidad_medida, controla_stock, stock_minimo, stock_critico, activo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())');
            $marcaVal = $marca !== '' ? $marca : null;
            $presentVal = $presentacion !== '' ? $presentacion : null;
            $stmt->bind_param('sssssdsidd', $codigo, $nombre, $categoria, $marcaVal, $presentVal, $factorPresentacion, $unidad, $controlaStock, $stockMinimo, $stockCritico);
            $ok = $stmt->execute();
            $newId = intval($conn->insert_id);
            $stmt->close();

            if (!$ok) {
                inventario_items_response(['success' => false, 'error' => 'No se pudo registrar el ítem.'], 500);
            }

            inventario_items_response([
                'success' => true,
                'id' => $newId,
                'message' => 'Ítem registrado correctamente.',
            ]);
            break;

        case 'PUT':
            inventario_items_require_write_role();
            $data = inventario_items_body();

            $id = intval($data['id'] ?? 0);
            $codigo = trim((string)($data['codigo'] ?? ''));
            $nombre = trim((string)($data['nombre'] ?? ''));
            $categoria = trim((string)($data['categoria'] ?? ''));
            $marca = trim((string)($data['marca'] ?? ''));
            $presentacion = trim((string)($data['presentacion'] ?? ''));
            $factorPresentacion = round((float)($data['factor_presentacion'] ?? 1), 4);
            $unidad = trim((string)($data['unidad_medida'] ?? ''));
            $controlaStock = isset($data['controla_stock']) ? (intval($data['controla_stock']) === 1 ? 1 : 0) : 1;
            $stockMinimo = round((float)($data['stock_minimo'] ?? 0), 2);
            $stockCritico = round((float)($data['stock_critico'] ?? 0), 2);
            $activo = isset($data['activo']) ? (intval($data['activo']) === 1 ? 1 : 0) : 1;

            $categoriasValidas = ['reactivo', 'insumo', 'material', 'activo_fijo'];
            if ($id <= 0 || $codigo === '' || $nombre === '' || $unidad === '' || !in_array($categoria, $categoriasValidas, true)) {
                inventario_items_response(['success' => false, 'error' => 'Datos incompletos para actualizar.'], 422);
            }
            if ($factorPresentacion <= 0) {
                inventario_items_response(['success' => false, 'error' => 'El factor de presentación debe ser mayor a cero.'], 422);
            }

            if ($categoria === 'activo_fijo') {
                $controlaStock = 0;
            }
            if ($controlaStock === 0) {
                $stockMinimo = 0;
                $stockCritico = 0;
            }

            $stmtDup = $conn->prepare('SELECT id FROM inventario_items WHERE codigo = ? AND id <> ? LIMIT 1');
            $stmtDup->bind_param('si', $codigo, $id);
            $stmtDup->execute();
            $dup = $stmtDup->get_result()->fetch_assoc();
            $stmtDup->close();
            if ($dup) {
                inventario_items_response(['success' => false, 'error' => 'Ya existe otro ítem con ese código.'], 409);
            }

            $stmt = $conn->prepare('UPDATE inventario_items SET codigo = ?, nombre = ?, categoria = ?, marca = ?, presentacion = ?, factor_presentacion = ?, unidad_medida = ?, controla_stock = ?, stock_minimo = ?, stock_critico = ?, activo = ?, updated_at = NOW() WHERE id = ?');
            $marcaVal = $marca !== '' ? $marca : null;
            $presentVal = $presentacion !== '' ? $presentacion : null;
            $stmt->bind_param('sssssdsiddii', $codigo, $nombre, $categoria, $marcaVal, $presentVal, $factorPresentacion, $unidad, $controlaStock, $stockMinimo, $stockCritico, $activo, $id);
            $ok = $stmt->execute();
            $stmt->close();

            inventario_items_response([
                'success' => $ok,
                'message' => $ok ? 'Ítem actualizado correctamente.' : 'No se pudo actualizar el ítem.',
            ], $ok ? 200 : 500);
            break;

        default:
            inventario_items_response(['success' => false, 'error' => 'Método no permitido'], 405);
            break;
    }
} catch (Throwable $e) {
    inventario_items_response(['success' => false, 'error' => 'Error interno: ' . $e->getMessage()], 500);
}
