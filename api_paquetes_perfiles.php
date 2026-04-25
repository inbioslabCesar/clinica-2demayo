<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

header('Content-Type: application/json; charset=utf-8');

function pp_respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function pp_json_input(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function pp_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    $stmt->execute([$table]);
    return (bool)$stmt->fetchColumn();
}

function pp_missing_schema_tables(PDO $pdo): array {
    $required = [
        'paquetes_perfiles',
        'paquetes_perfiles_items',
        'paquetes_perfiles_ventas_snapshot',
        'paquetes_perfiles_items_honorario_reglas',
    ];
    $missing = [];
    foreach ($required as $table) {
        if (!pp_table_exists($pdo, $table)) {
            $missing[] = $table;
        }
    }
    return $missing;
}

function pp_require_schema(PDO $pdo): void {
    $missing = pp_missing_schema_tables($pdo);
    if (!empty($missing)) {
        pp_respond([
            'success' => false,
            'error' => 'Falta ejecutar esquema de flujo perfiles.',
            'missing_tables' => $missing,
            'hint' => 'Ejecuta sql/flujo-perfiles/02_schema_paquetes_perfiles.sql y 03_reglas_honorario_paquete.sql'
        ], 409);
    }
}

function pp_assert_role(): void {
    $rol = strtolower((string)($_SESSION['usuario']['rol'] ?? ''));
    if (!in_array($rol, ['administrador', 'recepcionista'], true)) {
        pp_respond(['success' => false, 'error' => 'No autorizado'], 403);
    }
}

function pp_generate_code(): string {
    return 'PAK-' . date('Ymd-His') . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
}

function pp_fetch_catalog(PDO $pdo, string $sourceType, string $q, int $limit): array {
    $qLike = '%' . $q . '%';
    $limit = max(1, min(100, $limit));

    // Compatibilidad historica: en algunas bases existe "procedimientos" en tarifas.
    $sourceTypeQuery = $sourceType;
    if ($sourceType === 'procedimiento') {
        $sourceTypeQuery = 'procedimientos';
    }

    if (in_array($sourceType, ['consulta', 'ecografia', 'rayosx', 'procedimiento', 'operacion'], true)) {
        $stmt = $pdo->prepare(
            "SELECT t.id, t.descripcion, t.precio_particular, t.medico_id, COALESCE(m.nombre, '') AS medico_nombre, COALESCE(m.apellido, '') AS medico_apellido
             FROM tarifas t
             LEFT JOIN medicos m ON m.id = t.medico_id
             WHERE t.activo = 1 AND LOWER(t.servicio_tipo) IN (?, ?) AND t.descripcion LIKE ?
             ORDER BY t.descripcion ASC
             LIMIT {$limit}"
        );
        $stmt->execute([strtolower($sourceType), strtolower($sourceTypeQuery), $qLike]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return array_map(function ($r) use ($sourceType) {
            return [
                'source_type' => $sourceType,
                'source_id' => (int)$r['id'],
                'descripcion' => (string)$r['descripcion'],
                'precio' => (float)$r['precio_particular'],
                'medico_id' => isset($r['medico_id']) ? (int)$r['medico_id'] : null,
                'medico_nombre' => trim((string)$r['medico_nombre'] . ' ' . (string)$r['medico_apellido']),
            ];
        }, $rows);
    }

    if ($sourceType === 'laboratorio') {
        $stmt = $pdo->prepare(
            "SELECT id, nombre, precio_publico
             FROM examenes_laboratorio
             WHERE activo = 1 AND nombre LIKE ?
             ORDER BY nombre ASC
             LIMIT {$limit}"
        );
        $stmt->execute([$qLike]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return array_map(function ($r) {
            return [
                'source_type' => 'laboratorio',
                'source_id' => (int)$r['id'],
                'descripcion' => (string)$r['nombre'],
                'precio' => (float)$r['precio_publico'],
                'medico_id' => null,
                'medico_nombre' => '',
            ];
        }, $rows);
    }

    if ($sourceType === 'farmacia') {
        $stmt = $pdo->prepare(
            "SELECT id, nombre, precio_compra, margen_ganancia
             FROM medicamentos
             WHERE estado = 'activo' AND nombre LIKE ?
             ORDER BY nombre ASC
             LIMIT {$limit}"
        );
        $stmt->execute([$qLike]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return array_map(function ($r) {
            $precio = round(((float)$r['precio_compra']) * (1 + ((float)$r['margen_ganancia']) / 100), 2);
            return [
                'source_type' => 'farmacia',
                'source_id' => (int)$r['id'],
                'descripcion' => (string)$r['nombre'],
                'precio' => $precio,
                'medico_id' => null,
                'medico_nombre' => '',
            ];
        }, $rows);
    }

    return [];
}

function pp_validate_item(array $item): array {
    $sourceType = strtolower(trim((string)($item['source_type'] ?? '')));
    $descripcion = trim((string)($item['descripcion_snapshot'] ?? ''));
    $cantidad = (float)($item['cantidad'] ?? 0);
    $precio = (float)($item['precio_lista_snapshot'] ?? 0);

    if ($sourceType === '' || $descripcion === '' || $cantidad <= 0 || $precio < 0) {
        throw new InvalidArgumentException('Item invalido: source_type, descripcion_snapshot, cantidad y precio son obligatorios.');
    }

    $subtotal = isset($item['subtotal_snapshot']) ? (float)$item['subtotal_snapshot'] : round($cantidad * $precio, 2);

    return [
        'item_orden' => (int)($item['item_orden'] ?? 1),
        'source_type' => $sourceType,
        'source_id' => isset($item['source_id']) && $item['source_id'] !== '' ? (int)$item['source_id'] : null,
        'medico_id' => isset($item['medico_id']) && $item['medico_id'] !== '' ? (int)$item['medico_id'] : null,
        'descripcion_snapshot' => $descripcion,
        'cantidad' => $cantidad,
        'precio_lista_snapshot' => $precio,
        'subtotal_snapshot' => $subtotal,
        'es_derivado' => !empty($item['es_derivado']) ? 1 : 0,
        'laboratorio_referencia' => isset($item['laboratorio_referencia']) ? trim((string)$item['laboratorio_referencia']) : null,
        'tipo_derivacion' => isset($item['tipo_derivacion']) && $item['tipo_derivacion'] !== '' ? (string)$item['tipo_derivacion'] : null,
        'valor_derivacion' => isset($item['valor_derivacion']) && $item['valor_derivacion'] !== '' ? (float)$item['valor_derivacion'] : null,
        'reglas_json' => isset($item['reglas_json']) ? json_encode($item['reglas_json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
        'honorario_regla' => is_array($item['honorario_regla'] ?? null) ? $item['honorario_regla'] : null,
    ];
}

function pp_save_package(PDO $pdo, array $payload, int $usuarioId): int {
    $id = (int)($payload['id'] ?? 0);
    $nombre = trim((string)($payload['nombre'] ?? ''));
    $codigo = trim((string)($payload['codigo'] ?? ''));
    $tipo = strtolower(trim((string)($payload['tipo'] ?? 'paquete')));
    $estado = strtolower(trim((string)($payload['estado'] ?? 'borrador')));
    $precioGlobal = (float)($payload['precio_global_venta'] ?? 0);
    $modoPrecio = strtolower(trim((string)($payload['modo_precio'] ?? 'fijo_global')));
    $permiteDesc = !empty($payload['permite_descuento_adicional']) ? 1 : 0;
    $descripcion = trim((string)($payload['descripcion'] ?? ''));
    $vigDesde = isset($payload['vigencia_desde']) && $payload['vigencia_desde'] !== '' ? $payload['vigencia_desde'] : null;
    $vigHasta = isset($payload['vigencia_hasta']) && $payload['vigencia_hasta'] !== '' ? $payload['vigencia_hasta'] : null;
    $meta = isset($payload['meta']) ? json_encode($payload['meta'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

    if ($nombre === '' || $precioGlobal < 0 || empty($items)) {
        throw new InvalidArgumentException('Nombre, precio_global_venta e items son obligatorios.');
    }

    if (!in_array($tipo, ['paquete', 'perfil'], true)) $tipo = 'paquete';
    if (!in_array($estado, ['borrador', 'activo', 'inactivo', 'archivado'], true)) $estado = 'borrador';
    if (!in_array($modoPrecio, ['fijo_global', 'calculado_componentes'], true)) $modoPrecio = 'fijo_global';
    if ($codigo === '') $codigo = pp_generate_code();

    $pdo->beginTransaction();
    try {
        if ($id > 0) {
            $stmtUp = $pdo->prepare(
                "UPDATE paquetes_perfiles
                 SET codigo = ?, nombre = ?, descripcion = ?, estado = ?, tipo = ?, precio_global_venta = ?, modo_precio = ?,
                     permite_descuento_adicional = ?, vigencia_desde = ?, vigencia_hasta = ?, meta = ?, updated_by = ?, updated_at = NOW()
                 WHERE id = ?"
            );
            $stmtUp->execute([$codigo, $nombre, $descripcion, $estado, $tipo, $precioGlobal, $modoPrecio, $permiteDesc, $vigDesde, $vigHasta, $meta, $usuarioId, $id]);

            $pdo->prepare("DELETE hr FROM paquetes_perfiles_items_honorario_reglas hr INNER JOIN paquetes_perfiles_items i ON i.id = hr.paquete_item_id WHERE i.paquete_id = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM paquetes_perfiles_items WHERE paquete_id = ?")->execute([$id]);
        } else {
            $stmtIn = $pdo->prepare(
                "INSERT INTO paquetes_perfiles (codigo, nombre, descripcion, estado, tipo, precio_global_venta, modo_precio, permite_descuento_adicional, vigencia_desde, vigencia_hasta, meta, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmtIn->execute([$codigo, $nombre, $descripcion, $estado, $tipo, $precioGlobal, $modoPrecio, $permiteDesc, $vigDesde, $vigHasta, $meta, $usuarioId, $usuarioId]);
            $id = (int)$pdo->lastInsertId();
        }

        $stmtItem = $pdo->prepare(
            "INSERT INTO paquetes_perfiles_items
             (paquete_id, item_orden, source_type, source_id, medico_id, descripcion_snapshot, cantidad, precio_lista_snapshot, subtotal_snapshot,
              es_derivado, laboratorio_referencia, tipo_derivacion, valor_derivacion, reglas_json, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
        );

        $stmtRegla = $pdo->prepare(
            "INSERT INTO paquetes_perfiles_items_honorario_reglas (paquete_item_id, modo_honorario, monto_fijo_medico, porcentaje_medico, observaciones, activo)
             VALUES (?, ?, ?, ?, ?, 1)"
        );

        $order = 1;
        foreach ($items as $rawItem) {
            $it = pp_validate_item($rawItem);
            $stmtItem->execute([
                $id,
                $it['item_orden'] > 0 ? $it['item_orden'] : $order,
                $it['source_type'],
                $it['source_id'],
                $it['medico_id'],
                $it['descripcion_snapshot'],
                $it['cantidad'],
                $it['precio_lista_snapshot'],
                $it['subtotal_snapshot'],
                $it['es_derivado'],
                $it['laboratorio_referencia'],
                $it['tipo_derivacion'],
                $it['valor_derivacion'],
                $it['reglas_json'],
            ]);
            $itemId = (int)$pdo->lastInsertId();

            if ($it['honorario_regla']) {
                $regla = $it['honorario_regla'];
                $modo = strtolower(trim((string)($regla['modo_honorario'] ?? 'usar_configuracion_medico')));
                if (!in_array($modo, ['usar_configuracion_medico', 'monto_fijo_medico_paquete', 'porcentaje_medico_paquete'], true)) {
                    $modo = 'usar_configuracion_medico';
                }
                $montoFijo = isset($regla['monto_fijo_medico']) && $regla['monto_fijo_medico'] !== '' ? (float)$regla['monto_fijo_medico'] : null;
                $porc = isset($regla['porcentaje_medico']) && $regla['porcentaje_medico'] !== '' ? (float)$regla['porcentaje_medico'] : null;
                $obs = isset($regla['observaciones']) ? trim((string)$regla['observaciones']) : null;
                $stmtRegla->execute([$itemId, $modo, $montoFijo, $porc, $obs]);
            }
            $order++;
        }

        $pdo->commit();
        return $id;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

try {
    pp_assert_role();

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $accionGet = strtolower(trim((string)($_GET['accion'] ?? 'listar')));
    $missing = pp_missing_schema_tables($pdo);

    if ($method === 'GET' && $accionGet === 'activos') {
        if (!empty($missing)) {
            pp_respond([
                'success' => true,
                'rows' => [],
                'schema_ready' => false,
                'missing_tables' => $missing,
                'warning' => 'Flujo de perfiles no instalado. Se retorna lista vacia para compatibilidad.',
                'hint' => 'Ejecuta sql/flujo-perfiles/02_schema_paquetes_perfiles.sql y 03_reglas_honorario_paquete.sql'
            ]);
        }
    }

    if ($method === 'GET' && $accionGet === 'listar' && !isset($_GET['paquete_id'])) {
        if (!empty($missing)) {
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 20)));
            pp_respond([
                'success' => true,
                'rows' => [],
                'total' => 0,
                'page' => $page,
                'limit' => $limit,
                'schema_ready' => false,
                'missing_tables' => $missing,
                'warning' => 'Flujo de perfiles no instalado. Se retorna listado vacio para compatibilidad.',
                'hint' => 'Ejecuta sql/flujo-perfiles/02_schema_paquetes_perfiles.sql y 03_reglas_honorario_paquete.sql'
            ]);
        }
    }

    if ($method === 'GET' && $accionGet === 'schema_status') {
        pp_respond([
            'success' => true,
            'schema_ready' => empty($missing),
            'missing_tables' => $missing,
            'hint' => 'Ejecuta sql/flujo-perfiles/02_schema_paquetes_perfiles.sql y 03_reglas_honorario_paquete.sql'
        ]);
    }

    if ($method === 'GET' && $accionGet === 'catalogo') {
        // Catalog can work without the package schema tables.
    } else {
        pp_require_schema($pdo);
    }

    if ($method === 'GET') {
        $accion = $accionGet;

        if ($accion === 'activos') {
            $q = trim((string)($_GET['q'] ?? ''));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 30)));
            $includeItems = isset($_GET['include_items']) && (string)$_GET['include_items'] === '1';

            $params = [];
            $whereSql = "WHERE p.estado = 'activo'";
            if ($q !== '') {
                $whereSql .= " AND (p.nombre LIKE ? OR p.codigo LIKE ?)";
                $like = '%' . $q . '%';
                $params[] = $like;
                $params[] = $like;
            }

            $stmtActivos = $pdo->prepare(
                "SELECT p.*, (SELECT COUNT(*) FROM paquetes_perfiles_items i WHERE i.paquete_id = p.id AND i.activo = 1) AS items_total
                 FROM paquetes_perfiles p
                 {$whereSql}
                 ORDER BY p.nombre ASC
                 LIMIT {$limit}"
            );
            $stmtActivos->execute($params);
            $rows = $stmtActivos->fetchAll(PDO::FETCH_ASSOC);

            if ($includeItems && !empty($rows)) {
                $ids = array_map(function ($r) { return (int)$r['id']; }, $rows);
                $ph = implode(',', array_fill(0, count($ids), '?'));
                $stmtItems = $pdo->prepare(
                    "SELECT i.*, hr.modo_honorario, hr.monto_fijo_medico, hr.porcentaje_medico, hr.observaciones AS honorario_observaciones,
                           TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))) AS medico_nombre_snapshot
                     FROM paquetes_perfiles_items i
                     LEFT JOIN paquetes_perfiles_items_honorario_reglas hr ON hr.paquete_item_id = i.id
                     LEFT JOIN medicos m ON m.id = i.medico_id
                     WHERE i.paquete_id IN ({$ph}) AND i.activo = 1
                     ORDER BY i.paquete_id ASC, i.item_orden ASC, i.id ASC"
                );
                $stmtItems->execute($ids);
                $allItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

                $itemsByPaquete = [];
                foreach ($allItems as $it) {
                    $pid = (int)($it['paquete_id'] ?? 0);
                    if (!isset($itemsByPaquete[$pid])) {
                        $itemsByPaquete[$pid] = [];
                    }
                    $it['honorario_regla'] = [
                        'modo_honorario' => $it['modo_honorario'] ?? 'usar_configuracion_medico',
                        'monto_fijo_medico' => $it['monto_fijo_medico'] ?? null,
                        'porcentaje_medico' => $it['porcentaje_medico'] ?? null,
                        'observaciones' => $it['honorario_observaciones'] ?? null,
                    ];
                    unset($it['modo_honorario'], $it['monto_fijo_medico'], $it['porcentaje_medico'], $it['honorario_observaciones']);
                    $itemsByPaquete[$pid][] = $it;
                }

                foreach ($rows as &$r) {
                    $pid = (int)($r['id'] ?? 0);
                    $r['items'] = $itemsByPaquete[$pid] ?? [];
                }
                unset($r);
            }

            pp_respond(['success' => true, 'rows' => $rows]);
        }

        if ($accion === 'catalogo') {
            $sourceType = strtolower(trim((string)($_GET['source_type'] ?? '')));
            $q = trim((string)($_GET['q'] ?? ''));
            $limit = (int)($_GET['limit'] ?? 30);
            $items = pp_fetch_catalog($pdo, $sourceType, $q, $limit);
            pp_respond(['success' => true, 'items' => $items]);
        }

        if (isset($_GET['paquete_id'])) {
            $id = (int)$_GET['paquete_id'];
            $stmt = $pdo->prepare("SELECT * FROM paquetes_perfiles WHERE id = ? LIMIT 1");
            $stmt->execute([$id]);
            $paquete = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$paquete) {
                pp_respond(['success' => false, 'error' => 'Paquete no encontrado'], 404);
            }

            $stmtItems = $pdo->prepare(
                 "SELECT i.*, hr.modo_honorario, hr.monto_fijo_medico, hr.porcentaje_medico, hr.observaciones AS honorario_observaciones,
                        TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))) AS medico_nombre_snapshot
                 FROM paquetes_perfiles_items i
                 LEFT JOIN paquetes_perfiles_items_honorario_reglas hr ON hr.paquete_item_id = i.id
                  LEFT JOIN medicos m ON m.id = i.medico_id
                 WHERE i.paquete_id = ? AND i.activo = 1
                 ORDER BY i.item_orden ASC, i.id ASC"
            );
            $stmtItems->execute([$id]);
            $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

            foreach ($items as &$it) {
                $it['honorario_regla'] = [
                    'modo_honorario' => $it['modo_honorario'] ?? 'usar_configuracion_medico',
                    'monto_fijo_medico' => $it['monto_fijo_medico'] ?? null,
                    'porcentaje_medico' => $it['porcentaje_medico'] ?? null,
                    'observaciones' => $it['honorario_observaciones'] ?? null,
                ];
                unset($it['modo_honorario'], $it['monto_fijo_medico'], $it['porcentaje_medico'], $it['honorario_observaciones']);
            }
            unset($it);

            $paquete['items'] = $items;
            pp_respond(['success' => true, 'paquete' => $paquete]);
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;
        $q = trim((string)($_GET['q'] ?? ''));
        $estado = trim((string)($_GET['estado'] ?? ''));

        $where = [];
        $params = [];

        if ($q !== '') {
            $where[] = '(p.nombre LIKE ? OR p.codigo LIKE ?)';
            $like = '%' . $q . '%';
            $params[] = $like;
            $params[] = $like;
        }
        if ($estado !== '') {
            $where[] = 'p.estado = ?';
            $params[] = $estado;
        }

        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

        $stmtCount = $pdo->prepare("SELECT COUNT(*) FROM paquetes_perfiles p {$whereSql}");
        $stmtCount->execute($params);
        $total = (int)$stmtCount->fetchColumn();

        $stmtList = $pdo->prepare(
            "SELECT p.*, (SELECT COUNT(*) FROM paquetes_perfiles_items i WHERE i.paquete_id = p.id AND i.activo = 1) AS items_total
             FROM paquetes_perfiles p
             {$whereSql}
             ORDER BY p.updated_at DESC, p.id DESC
             LIMIT {$limit} OFFSET {$offset}"
        );
        $stmtList->execute($params);
        $rows = $stmtList->fetchAll(PDO::FETCH_ASSOC);

        pp_respond([
            'success' => true,
            'rows' => $rows,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
        ]);
    }

    if ($method === 'POST') {
        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        if ($usuarioId <= 0) {
            pp_respond(['success' => false, 'error' => 'Sesion invalida'], 401);
        }

        $data = pp_json_input();
        $accion = strtolower(trim((string)($data['accion'] ?? 'guardar')));

        if ($accion === 'guardar') {
            $id = pp_save_package($pdo, $data, $usuarioId);
            pp_respond(['success' => true, 'id' => $id]);
        }

        if ($accion === 'estado') {
            $id = (int)($data['id'] ?? 0);
            $estado = strtolower(trim((string)($data['estado'] ?? 'inactivo')));
            if ($id <= 0 || !in_array($estado, ['borrador', 'activo', 'inactivo', 'archivado'], true)) {
                pp_respond(['success' => false, 'error' => 'Datos invalidos'], 400);
            }
            $stmt = $pdo->prepare("UPDATE paquetes_perfiles SET estado = ?, updated_by = ?, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$estado, $usuarioId, $id]);
            pp_respond(['success' => true]);
        }

        pp_respond(['success' => false, 'error' => 'Accion no soportada'], 400);
    }

    if ($method === 'DELETE') {
        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        if ($usuarioId <= 0) {
            pp_respond(['success' => false, 'error' => 'Sesion invalida'], 401);
        }

        $data = pp_json_input();
        $id = (int)($data['id'] ?? 0);
        if ($id <= 0) {
            pp_respond(['success' => false, 'error' => 'ID invalido'], 400);
        }

        $stmt = $pdo->prepare("UPDATE paquetes_perfiles SET estado = 'archivado', updated_by = ?, updated_at = NOW() WHERE id = ?");
        $stmt->execute([$usuarioId, $id]);
        pp_respond(['success' => true]);
    }

    pp_respond(['success' => false, 'error' => 'Metodo no permitido'], 405);
} catch (InvalidArgumentException $e) {
    pp_respond(['success' => false, 'error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    pp_respond(['success' => false, 'error' => 'Error interno', 'detail' => $e->getMessage()], 500);
}
