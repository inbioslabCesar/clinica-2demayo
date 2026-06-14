<?php
require_once __DIR__ . '/init_api.php';
require_once "config.php";
require_once "auth_check.php";

$method = $_SERVER['REQUEST_METHOD'];

function respond($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function extraer_paciente_temporal_desde_observaciones($observaciones) {
    $texto = trim((string)$observaciones);
    if ($texto === '') {
        return ['nombre' => '', 'dni' => ''];
    }

    $nombre = '';
    $dni = '';

    // Formato de cotizaciones: [PARTICULAR] Nombre=...; DNI=...;
    if (stripos($texto, '[PARTICULAR]') !== false) {
        if (preg_match('/Nombre=([^;]+)/i', $texto, $m)) {
            $nombre = trim((string)($m[1] ?? ''));
        }
        if (preg_match('/DNI=([^;]+)/i', $texto, $m)) {
            $dni = trim((string)($m[1] ?? ''));
        }
    }

    // Formato alterno de cobros: Cliente no registrado: NOMBRE (DNI: XXXXX).
    if ($nombre === '' && stripos($texto, 'Cliente no registrado:') !== false) {
        if (preg_match('/Cliente\s+no\s+registrado:\s*([^\(\n\.]+?)(?:\s*\(DNI:\s*([^\)]+)\))?(?:\.|$)/i', $texto, $m)) {
            $nombre = trim((string)($m[1] ?? ''));
            $dni = $dni !== '' ? $dni : trim((string)($m[2] ?? ''));
        }
    }

    return ['nombre' => $nombre, 'dni' => $dni];
}

function table_exists_local($conn, $tableName) {
    static $cache = [];
    $tableName = trim((string)$tableName);
    if ($tableName === '') {
        return false;
    }
    if (array_key_exists($tableName, $cache)) {
        return $cache[$tableName];
    }

    $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    if (!$stmt) {
        $cache[$tableName] = false;
        return false;
    }
    $stmt->bind_param('s', $tableName);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $cache[$tableName] = $exists;
    return $exists;
}

function column_exists_local($conn, $tableName, $columnName) {
    static $cache = [];
    $tableName = trim((string)$tableName);
    $columnName = trim((string)$columnName);
    if ($tableName === '' || $columnName === '') {
        return false;
    }
    $key = $tableName . '::' . $columnName;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    $stmt = $conn->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
    if (!$stmt) {
        $cache[$key] = false;
        return false;
    }
    $stmt->bind_param('ss', $tableName, $columnName);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $cache[$key] = $exists;
    return $exists;
}

function resolver_paciente_desde_cotizacion_por_cobro($conn, $cobroId) {
    static $cache = [];
    $cobroId = (int)$cobroId;
    if ($cobroId <= 0) {
        return ['nombre' => '', 'dni' => ''];
    }
    if (isset($cache[$cobroId])) {
        return $cache[$cobroId];
    }
    if (!table_exists_local($conn, 'cotizacion_movimientos') || !table_exists_local($conn, 'cotizaciones')) {
        $cache[$cobroId] = ['nombre' => '', 'dni' => ''];
        return $cache[$cobroId];
    }

    $sql = "SELECT ct.observaciones, p.nombre, p.apellido, p.dni
            FROM cotizacion_movimientos cm
            INNER JOIN cotizaciones ct ON ct.id = cm.cotizacion_id
            LEFT JOIN pacientes p ON p.id = ct.paciente_id
            WHERE cm.cobro_id = ?
            ORDER BY cm.id DESC
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        $cache[$cobroId] = ['nombre' => '', 'dni' => ''];
        return $cache[$cobroId];
    }
    $stmt->bind_param('i', $cobroId);
    if (!$stmt->execute()) {
        $cache[$cobroId] = ['nombre' => '', 'dni' => ''];
        return $cache[$cobroId];
    }

    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) {
        $cache[$cobroId] = ['nombre' => '', 'dni' => ''];
        return $cache[$cobroId];
    }

    $nombre = formatear_paciente($row['nombre'] ?? '', $row['apellido'] ?? '');
    $dni = trim((string)($row['dni'] ?? ''));
    if ($nombre === 'Particular' && $dni === '') {
        $tmp = extraer_paciente_temporal_desde_observaciones($row['observaciones'] ?? '');
        if (trim((string)($tmp['nombre'] ?? '')) !== '') {
            $nombre = trim((string)$tmp['nombre']);
        }
        $dni = trim((string)($tmp['dni'] ?? ''));
    }

    $cache[$cobroId] = [
        'nombre' => $nombre !== 'Particular' ? $nombre : '',
        'dni' => $dni,
    ];
    return $cache[$cobroId];
}

function resolver_medico_desde_cobro($conn, $cobroId) {
    static $cache = [];
    $cobroId = (int)$cobroId;
    if ($cobroId <= 0) {
        return '';
    }
    if (isset($cache[$cobroId])) {
        return $cache[$cobroId];
    }

    if (!table_exists_local($conn, 'cotizacion_movimientos') || !table_exists_local($conn, 'cotizaciones_detalle')) {
        $cache[$cobroId] = '';
        return $cache[$cobroId];
    }

    $sql = "SELECT m.nombre, m.apellido
            FROM cotizacion_movimientos cm
            INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = cm.cotizacion_id
            LEFT JOIN medicos m ON m.id = cd.medico_id
            WHERE cm.cobro_id = ?
              AND cd.medico_id IS NOT NULL
              AND cd.medico_id > 0
            ORDER BY cd.id ASC
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        $cache[$cobroId] = '';
        return $cache[$cobroId];
    }
    $stmt->bind_param('i', $cobroId);
    if (!$stmt->execute()) {
        $cache[$cobroId] = '';
        return $cache[$cobroId];
    }
    $row = $stmt->get_result()->fetch_assoc();
    $medico = trim((string)(($row['nombre'] ?? '') . ' ' . ($row['apellido'] ?? '')));
    $cache[$cobroId] = $medico;
    return $cache[$cobroId];
}

function formatear_paciente($nombre, $apellido = '') {
    $nombre = trim((string)$nombre);
    $apellido = trim((string)$apellido);
    $texto = trim($nombre . ' ' . $apellido);
    return $texto !== '' ? $texto : 'Particular';
}

function normalizar_venta_legacy($row) {
    return [
        'id' => (int)$row['id'],
        'source' => 'legacy',
        'origen' => 'farmacia',
        'referencia' => sprintf('F%06d', (int)$row['id']),
        'referencia_origen' => trim((string)($row['referencia_origen'] ?? '')),
        'fecha' => $row['fecha'],
        'paciente_id' => isset($row['paciente_id']) ? (int)$row['paciente_id'] : null,
        'paciente_nombre' => trim((string)($row['paciente_nombre'] ?? '')) !== '' ? $row['paciente_nombre'] : 'Particular',
        'paciente_dni' => $row['paciente_dni'] ?? '',
        'usuario_id' => isset($row['usuario_id']) ? (int)$row['usuario_id'] : null,
        'usuario_nombre' => $row['usuario_nombre'] ?? '',
        'medico_nombre' => '',
        'total' => isset($row['total']) ? (float)$row['total'] : 0,
        'estado' => $row['estado'] ?? 'pagado'
    ];
}

function extraer_detalles_farmacia_desde_json($descripcionJson, $fallbackRow = null) {
    $detalles = [];
    $payload = json_decode((string)$descripcionJson, true);

    if (is_array($payload)) {
        foreach ($payload as $idx => $item) {
            if (!is_array($item)) {
                continue;
            }
            $tipo = strtolower(trim((string)($item['servicio_tipo'] ?? '')));
            if ($tipo !== 'farmacia') {
                continue;
            }
            $detalles[] = [
                'id' => (int)$idx + 1,
                'medicamento_id' => isset($item['servicio_id']) ? (int)$item['servicio_id'] : null,
                'descripcion' => trim((string)($item['descripcion'] ?? 'Medicamento')),
                'cantidad' => isset($item['cantidad']) ? (float)$item['cantidad'] : 1,
                'precio_unitario' => isset($item['precio_unitario']) ? (float)$item['precio_unitario'] : 0,
                'subtotal' => isset($item['subtotal']) ? (float)$item['subtotal'] : 0,
            ];
        }
    }

    if (!empty($detalles)) {
        return $detalles;
    }

    if (is_array($fallbackRow) && strtolower(trim((string)($fallbackRow['servicio_tipo'] ?? ''))) === 'farmacia') {
        $detalles[] = [
            'id' => isset($fallbackRow['id']) ? (int)$fallbackRow['id'] : 1,
            'medicamento_id' => isset($fallbackRow['servicio_id']) ? (int)$fallbackRow['servicio_id'] : null,
            'descripcion' => trim((string)($fallbackRow['descripcion'] ?? 'Medicamento')),
            'cantidad' => isset($fallbackRow['cantidad']) ? (float)$fallbackRow['cantidad'] : 1,
            'precio_unitario' => isset($fallbackRow['precio_unitario']) ? (float)$fallbackRow['precio_unitario'] : 0,
            'subtotal' => isset($fallbackRow['subtotal']) ? (float)$fallbackRow['subtotal'] : 0,
        ];
    }

    return $detalles;
}

/**
 * Paginación real en SQL: UNION ALL de cotizaciones_farmacia + cobros con ítems farmacia.
 * Devuelve sólo las filas de la página solicitada; el total lo resuelve un COUNT separado.
 * Elimina el anti-patrón anterior de traer toda la tabla para paginar en PHP.
 */
function listar_ventas_farmacia_paginado($conn, $page, $limit, $fecha_inicio, $fecha_fin, $buscar) {
    $offset = ($page - 1) * $limit;
    $hasRefLegacy = column_exists_local($conn, 'cotizaciones_farmacia', 'referencia_origen');
    $hasRefCobros = column_exists_local($conn, 'cobros', 'referencia_origen');
    $hasRefCot    = column_exists_local($conn, 'cotizaciones', 'referencia_origen');
    $selectRefLegacy = $hasRefLegacy ? "NULLIF(TRIM(cf.referencia_origen), '')" : 'NULL';
    $selectRefCobros = $hasRefCobros ? "NULLIF(TRIM(c.referencia_origen), '')" : 'NULL';
    $selectRefCot    = $hasRefCot    ? "NULLIF(TRIM(cot.referencia_origen), '')" : 'NULL';

    $whereLegacy     = '1=1';
    $whereGeneral    = "c.estado <> 'anulado'
        AND EXISTS (
            SELECT 1 FROM cobros_detalle cdx
            WHERE cdx.cobro_id = c.id
              AND (cdx.servicio_tipo = 'farmacia'
                   OR cdx.descripcion LIKE '%\\\"servicio_tipo\\\":\\\"farmacia\\\"%')
        )";
    $whereCotizacion = "LOWER(TRIM(cot.estado)) IN ('pendiente', 'parcial')
        AND EXISTS (
            SELECT 1 FROM cotizaciones_detalle cdx2
            WHERE cdx2.cotizacion_id = cot.id
              AND LOWER(TRIM(cdx2.servicio_tipo)) = 'farmacia'
        )";

    $unionParams = [];
    $unionTypes  = '';
    if ($fecha_inicio && $fecha_fin) {
        $whereLegacy     .= ' AND DATE(cf.fecha) BETWEEN ? AND ?';
        $whereGeneral    .= ' AND DATE(c.fecha_cobro) BETWEEN ? AND ?';
        $whereCotizacion .= ' AND DATE(cot.fecha) BETWEEN ? AND ?';
        $unionParams      = [$fecha_inicio, $fecha_fin, $fecha_inicio, $fecha_fin, $fecha_inicio, $fecha_fin];
        $unionTypes       = 'ssssss';
    }

    $unionSql = "
        SELECT
            cf.id                                                                   AS id,
            'legacy'                                                                AS source,
            CONCAT('F', LPAD(cf.id, 6, '0'))                                       AS referencia,
            cf.fecha                                                                AS fecha,
            cf.paciente_id,
            COALESCE(
                NULLIF(TRIM(CONCAT(COALESCE(p.nombre,''), ' ', COALESCE(p.apellido,''))), ''),
                NULLIF(TRIM(cf.paciente_nombre), ''),
                'Particular'
            )                                                                       AS paciente_nombre,
            COALESCE(p.dni, cf.paciente_dni, '')                                    AS paciente_dni,
            cf.usuario_id,
            COALESCE(u.nombre, 'Sistema')                                           AS usuario_nombre,
            cf.total                                                                AS total,
            cf.estado,
            NULL                                                                    AS observaciones,
            {$selectRefLegacy}                                                      AS referencia_origen
        FROM cotizaciones_farmacia cf
        LEFT JOIN pacientes p ON p.id = cf.paciente_id
        LEFT JOIN usuarios u ON u.id = cf.usuario_id
        WHERE $whereLegacy

        UNION ALL

        SELECT
            c.id                                                                    AS id,
            'general'                                                               AS source,
            CONCAT('C', LPAD(c.id, 6, '0'))                                        AS referencia,
            c.fecha_cobro                                                           AS fecha,
            c.paciente_id,
            COALESCE(
                NULLIF(TRIM(CONCAT(COALESCE(p.nombre,''), ' ', COALESCE(p.apellido,''))), ''),
                'Particular'
            )                                                                       AS paciente_nombre,
            COALESCE(p.dni, '')                                                     AS paciente_dni,
            c.usuario_id,
            COALESCE(u.nombre, 'Sistema')                                           AS usuario_nombre,
            COALESCE((
                SELECT SUM(CASE WHEN cd2.servicio_tipo = 'farmacia' THEN cd2.subtotal ELSE 0 END)
                FROM cobros_detalle cd2
                WHERE cd2.cobro_id = c.id
            ), 0)                                                                   AS total,
            c.estado,
            c.observaciones,
            {$selectRefCobros}                                                      AS referencia_origen
        FROM cobros c
        LEFT JOIN pacientes p ON p.id = c.paciente_id
        LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE $whereGeneral

        UNION ALL

        SELECT
            cot.id                                                                  AS id,
            'cotizacion'                                                            AS source,
            CONCAT('Q', LPAD(cot.id, 6, '0'))                                      AS referencia,
            cot.fecha                                                               AS fecha,
            cot.paciente_id,
            COALESCE(
                NULLIF(TRIM(CONCAT(COALESCE(p.nombre,''), ' ', COALESCE(p.apellido,''))), ''),
                'Particular'
            )                                                                       AS paciente_nombre,
            COALESCE(p.dni, '')                                                     AS paciente_dni,
            cot.usuario_id,
            COALESCE(u.nombre, 'Sistema')                                           AS usuario_nombre,
            cot.total                                                               AS total,
            cot.estado,
            cot.observaciones,
            {$selectRefCot}                                                         AS referencia_origen
        FROM cotizaciones cot
        LEFT JOIN pacientes p ON p.id = cot.paciente_id
        LEFT JOIN usuarios u ON u.id = cot.usuario_id
        WHERE $whereCotizacion
    ";

    // Filtro de búsqueda aplicado sobre el resultado del UNION
    $searchWhere  = '1=1';
    $searchParams = [];
    $searchTypes  = '';
    if ($buscar !== '') {
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $buscar) . '%';
        $searchWhere  = '(paciente_nombre LIKE ? OR paciente_dni LIKE ? OR referencia LIKE ? OR usuario_nombre LIKE ? OR referencia_origen LIKE ?)';
        $searchParams = [$like, $like, $like, $like, $like];
        $searchTypes  = 'sssss';
    }

    $allParams = array_merge($unionParams, $searchParams);
    $allTypes  = $unionTypes . $searchTypes;

    // 1) COUNT total (2 queries: count + data — sin importar cuántos registros haya en BD)
    $stmtCount = $conn->prepare("SELECT COUNT(*) AS total FROM ($unionSql) AS ventas WHERE $searchWhere");
    if (!$stmtCount) {
        respond(['success' => false, 'error' => 'Error count farmacia: ' . $conn->error], 500);
    }
    if ($allTypes !== '') {
        $stmtCount->bind_param($allTypes, ...$allParams);
    }
    $stmtCount->execute();
    $total = (int)($stmtCount->get_result()->fetch_assoc()['total'] ?? 0);

    // 2) Datos de la página solicitada
    $dataParams = array_merge($allParams, [$limit, $offset]);
    $dataTypes  = $allTypes . 'ii';
    $stmtData   = $conn->prepare("SELECT * FROM ($unionSql) AS ventas WHERE $searchWhere ORDER BY fecha DESC LIMIT ? OFFSET ?");
    if (!$stmtData) {
        respond(['success' => false, 'error' => 'Error data farmacia: ' . $conn->error], 500);
    }
    if ($dataTypes !== '') {
        $stmtData->bind_param($dataTypes, ...$dataParams);
    }
    $stmtData->execute();
    $rows = $stmtData->get_result()->fetch_all(MYSQLI_ASSOC);

    // 3) Enriquecer medico_nombre para filas 'general': una sola query IN() sobre las N filas de la página
    $cobroIds = array_values(array_filter(
        array_map(fn($r) => $r['source'] === 'general' ? (int)$r['id'] : 0, $rows)
    ));
    $medicoNombrePorCobro = [];
    if (!empty($cobroIds)
        && table_exists_local($conn, 'cotizacion_movimientos')
        && table_exists_local($conn, 'cotizaciones_detalle')
    ) {
        $ph      = implode(',', array_fill(0, count($cobroIds), '?'));
        $stmtMed = $conn->prepare(
            "SELECT cm.cobro_id,
                    MAX(TRIM(CONCAT(COALESCE(m.nombre,''), ' ', COALESCE(m.apellido,'')))) AS medico_nombre
             FROM cotizacion_movimientos cm
             INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = cm.cotizacion_id
             LEFT JOIN medicos m ON m.id = cd.medico_id
             WHERE cm.cobro_id IN ($ph)
               AND cd.medico_id IS NOT NULL AND cd.medico_id > 0
             GROUP BY cm.cobro_id"
        );
        if ($stmtMed) {
            $stmtMed->bind_param(str_repeat('i', count($cobroIds)), ...$cobroIds);
            $stmtMed->execute();
            foreach ($stmtMed->get_result()->fetch_all(MYSQLI_ASSOC) as $mRow) {
                $medicoNombrePorCobro[(int)$mRow['cobro_id']] = trim((string)$mRow['medico_nombre']);
            }
        }
    }

    // 4) Normalizar filas de la página (máximo $limit filas en memoria)
    $ventas = [];
    foreach ($rows as $row) {
        $medico = '';
        if ($row['source'] === 'general') {
            $medico = $medicoNombrePorCobro[(int)$row['id']] ?? '';
        }

        // Para cobros y cotizaciones, intentar rescatar particular manual desde observaciones
        // cuando en el listado llegó como Particular sin DNI.
        if (($row['source'] === 'general' || $row['source'] === 'cotizacion')
            && ($row['paciente_nombre'] ?? '') === 'Particular'
            && ($row['paciente_dni'] ?? '') === '') {
            $tmp = extraer_paciente_temporal_desde_observaciones($row['observaciones'] ?? '');
            if (trim((string)($tmp['nombre'] ?? '')) !== '') {
                $row['paciente_nombre'] = $tmp['nombre'];
            }
            $row['paciente_dni'] = trim((string)($tmp['dni'] ?? ''));
        }
        $ventas[] = [
            'id'              => (int)$row['id'],
            'source'          => $row['source'],
            'origen'          => $row['source'] === 'legacy' ? 'farmacia' : ($row['source'] === 'cotizacion' ? 'cotizacion' : 'cobro'),
            'referencia'      => $row['referencia'],
            'referencia_origen' => trim((string)($row['referencia_origen'] ?? '')),
            'fecha'           => $row['fecha'],
            'paciente_id'     => isset($row['paciente_id']) ? (int)$row['paciente_id'] : null,
            'paciente_nombre' => $row['paciente_nombre'] ?? 'Particular',
            'paciente_dni'    => $row['paciente_dni'] ?? '',
            'usuario_id'      => isset($row['usuario_id']) ? (int)$row['usuario_id'] : null,
            'usuario_nombre'  => $row['usuario_nombre'] ?? '',
            'medico_nombre'   => $medico,
            'total'           => round((float)($row['total'] ?? 0), 2),
            'estado'          => $row['estado'] ?? 'pagado',
        ];
    }

    return ['ventas' => $ventas, 'total' => $total];
}

function obtener_detalle_venta_cotizacion($conn, $cotizacionId) {
    $selectRefOrigen = column_exists_local($conn, 'cotizaciones', 'referencia_origen')
        ? 'cot.referencia_origen'
        : 'NULL AS referencia_origen';
    $stmt = $conn->prepare("SELECT
            cot.id,
            cot.paciente_id,
            cot.usuario_id,
            cot.fecha,
            cot.total,
            cot.saldo_pendiente,
            cot.estado,
            cot.observaciones,
            {$selectRefOrigen},
            p.nombre,
            p.apellido,
            p.dni,
            u.nombre AS usuario_nombre
        FROM cotizaciones cot
        LEFT JOIN pacientes p ON p.id = cot.paciente_id
        LEFT JOIN usuarios u ON u.id = cot.usuario_id
        WHERE cot.id = ?");
    if (!$stmt) {
        respond(['success' => false, 'error' => 'Error al preparar detalle cotización: ' . $conn->error], 500);
    }
    $stmt->bind_param('i', $cotizacionId);
    if (!$stmt->execute()) {
        respond(['success' => false, 'error' => 'Error al consultar cotización: ' . $stmt->error], 500);
    }
    $cot = $stmt->get_result()->fetch_assoc();
    if (!$cot) {
        respond(['success' => false, 'error' => 'Cotización no encontrada'], 404);
    }

    $stmtDet = $conn->prepare("SELECT id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'farmacia'");
    if (!$stmtDet) {
        respond(['success' => false, 'error' => 'Error al preparar detalle: ' . $conn->error], 500);
    }
    $stmtDet->bind_param('i', $cotizacionId);
    $stmtDet->execute();
    $detalleRows = $stmtDet->get_result()->fetch_all(MYSQLI_ASSOC);

    $detalles = [];
    foreach ($detalleRows as $dr) {
        $detalles[] = [
            'id'              => (int)$dr['id'],
            'medicamento_id'  => (int)($dr['servicio_id'] ?? 0),
            'medicamento'     => $dr['descripcion'] ?? '',
            'cantidad'        => (float)($dr['cantidad'] ?? 1),
            'precio_unitario' => (float)($dr['precio_unitario'] ?? 0),
            'subtotal'        => (float)($dr['subtotal'] ?? 0),
        ];
    }

    if (empty($detalles)) {
        respond(['success' => false, 'error' => 'La cotización no tiene ítems de farmacia'], 404);
    }

    $pacienteNombre = formatear_paciente($cot['nombre'] ?? '', $cot['apellido'] ?? '');
    $pacienteDni    = trim((string)($cot['dni'] ?? ''));
    if ($pacienteNombre === 'Particular' && $pacienteDni === '') {
        $tmp = extraer_paciente_temporal_desde_observaciones($cot['observaciones'] ?? '');
        if (trim((string)($tmp['nombre'] ?? '')) !== '') {
            $pacienteNombre = $tmp['nombre'];
        }
        $pacienteDni = trim((string)($tmp['dni'] ?? ''));
    }

    $totalFarmacia = array_sum(array_column($detalles, 'subtotal'));

    return [
        'id'               => $cotizacionId,
        'source'           => 'cotizacion',
        'origen'           => 'cotizacion',
        'referencia'       => sprintf('Q%06d', $cotizacionId),
        'referencia_origen'=> trim((string)($cot['referencia_origen'] ?? '')),
        'fecha'            => $cot['fecha'],
        'paciente_id'      => isset($cot['paciente_id']) ? (int)$cot['paciente_id'] : null,
        'paciente_nombre'  => $pacienteNombre,
        'paciente_dni'     => $pacienteDni,
        'usuario_id'       => isset($cot['usuario_id']) ? (int)$cot['usuario_id'] : null,
        'usuario_nombre'   => $cot['usuario_nombre'] ?? '',
        'medico_nombre'    => '',
        'total'            => round($totalFarmacia, 2),
        'estado'           => $cot['estado'] ?? 'pendiente',
        'saldo_pendiente'  => round((float)($cot['saldo_pendiente'] ?? $totalFarmacia), 2),
        'detalles'         => $detalles,
    ];
}

function obtener_detalle_venta_general($conn, $cobroId) {
    $selectReferenciaOrigen = column_exists_local($conn, 'cobros', 'referencia_origen')
        ? 'c.referencia_origen'
        : 'NULL AS referencia_origen';
    $stmt = $conn->prepare("SELECT
            c.id,
            c.paciente_id,
            c.usuario_id,
            c.fecha_cobro,
            c.total,
            c.estado,
            c.observaciones,
            {$selectReferenciaOrigen},
            p.nombre,
            p.apellido,
            p.dni,
            u.nombre AS usuario_nombre
        FROM cobros c
        LEFT JOIN pacientes p ON c.paciente_id = p.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.id = ?");
    if (!$stmt) {
        respond(['success' => false, 'error' => 'Error al preparar consulta de detalle: ' . $conn->error], 500);
    }
    $stmt->bind_param('i', $cobroId);
    if (!$stmt->execute()) {
        respond(['success' => false, 'error' => 'Error al consultar venta: ' . $stmt->error], 500);
    }
    $venta = $stmt->get_result()->fetch_assoc();
    if (!$venta) {
        respond(['success' => false, 'error' => 'Venta no encontrada'], 404);
    }

    $stmtDetalle = $conn->prepare("SELECT id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal FROM cobros_detalle WHERE cobro_id = ?");
    if (!$stmtDetalle) {
        respond(['success' => false, 'error' => 'Error al preparar detalle de venta: ' . $conn->error], 500);
    }
    $stmtDetalle->bind_param('i', $cobroId);
    if (!$stmtDetalle->execute()) {
        respond(['success' => false, 'error' => 'Error al consultar detalle de venta: ' . $stmtDetalle->error], 500);
    }
    $detalleRows = $stmtDetalle->get_result()->fetch_all(MYSQLI_ASSOC);
    $detalles = [];
    foreach ($detalleRows as $detalleRow) {
        $detalles = array_merge(
            $detalles,
            extraer_detalles_farmacia_desde_json($detalleRow['descripcion'] ?? '', $detalleRow)
        );
    }
    if (empty($detalles)) {
        respond(['success' => false, 'error' => 'La venta no tiene ítems de farmacia'], 404);
    }

    $pacienteNombre = formatear_paciente($venta['nombre'] ?? '', $venta['apellido'] ?? '');
    $pacienteDni = trim((string)($venta['dni'] ?? ''));
    if ($pacienteNombre === 'Particular' && $pacienteDni === '') {
        $temp = extraer_paciente_temporal_desde_observaciones($venta['observaciones'] ?? '');
        if (trim((string)($temp['nombre'] ?? '')) !== '') {
            $pacienteNombre = $temp['nombre'];
        }
        $pacienteDni = trim((string)($temp['dni'] ?? ''));

        if (($pacienteNombre === 'Particular' || $pacienteNombre === '') && $pacienteDni === '') {
            $pacienteCot = resolver_paciente_desde_cotizacion_por_cobro($conn, $cobroId);
            if (trim((string)($pacienteCot['nombre'] ?? '')) !== '') {
                $pacienteNombre = trim((string)$pacienteCot['nombre']);
            }
            if (trim((string)($pacienteCot['dni'] ?? '')) !== '') {
                $pacienteDni = trim((string)$pacienteCot['dni']);
            }
        }
    }

    $totalFarmacia = 0;
    foreach ($detalles as $detalle) {
        $totalFarmacia += (float)($detalle['subtotal'] ?? 0);
    }

    return [
        'id' => $cobroId,
        'source' => 'general',
        'origen' => 'cobro',
        'referencia' => sprintf('C%06d', $cobroId),
        'referencia_origen' => trim((string)($venta['referencia_origen'] ?? '')),
        'fecha' => $venta['fecha_cobro'],
        'paciente_id' => isset($venta['paciente_id']) ? (int)$venta['paciente_id'] : null,
        'paciente_nombre' => $pacienteNombre,
        'paciente_dni' => $pacienteDni,
        'usuario_id' => isset($venta['usuario_id']) ? (int)$venta['usuario_id'] : null,
        'usuario_nombre' => $venta['usuario_nombre'] ?? '',
        'medico_nombre' => resolver_medico_desde_cobro($conn, $cobroId),
        'total' => round($totalFarmacia, 2),
        'estado' => $venta['estado'] ?? 'pagado',
        'detalles' => $detalles,
    ];
}

switch($method) {
    case 'POST':
        // Registrar cotización y salida de medicamentos
        $data = json_decode(file_get_contents('php://input'), true);
        $pacienteValido = isset($data['paciente_id']) || (isset($data['paciente_dni']) && isset($data['paciente_nombre']) && $data['paciente_dni'] && $data['paciente_nombre']);
        if (!$pacienteValido || !isset($data['usuario_id']) || !isset($data['total']) || !isset($data['detalles']) || empty($data['detalles'])) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        $conn->begin_transaction();
        try {
            $observaciones = $data['observaciones'] ?? '';
            $referenciaOrigen = trim((string)($data['referencia_origen'] ?? ''));
            $hasReferenciaOrigenLegacy = column_exists_local($conn, 'cotizaciones_farmacia', 'referencia_origen');
            // Si paciente_id existe, usarlo. Si no, guardar paciente_dni y paciente_nombre en campos extra
            if (isset($data['paciente_id'])) {
                $stmt = $conn->prepare("INSERT INTO cotizaciones_farmacia (paciente_id, usuario_id, total, estado, observaciones) VALUES (?, ?, ?, 'pagado', ?)");
                $stmt->bind_param("iids", $data['paciente_id'], $data['usuario_id'], $data['total'], $observaciones);
            } else {
                $stmt = $conn->prepare("INSERT INTO cotizaciones_farmacia (usuario_id, total, estado, observaciones, paciente_dni, paciente_nombre) VALUES (?, ?, 'pagado', ?, ?, ?)");
                $stmt->bind_param("idsss", $data['usuario_id'], $data['total'], $observaciones, $data['paciente_dni'], $data['paciente_nombre']);
            }
            $stmt->execute();
            $cotizacion_id = $conn->insert_id;
            if ($hasReferenciaOrigenLegacy) {
                $stmtRef = $conn->prepare("UPDATE cotizaciones_farmacia SET referencia_origen = ? WHERE id = ?");
                if ($stmtRef) {
                    $stmtRef->bind_param("si", $referenciaOrigen, $cotizacion_id);
                    $stmtRef->execute();
                    $stmtRef->close();
                }
            }
            $stmt_detalle = $conn->prepare("INSERT INTO cotizaciones_farmacia_detalle (cotizacion_id, medicamento_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($data['detalles'] as $detalle) {
                $stmt_detalle->bind_param("iisiid", $cotizacion_id, $detalle['medicamento_id'], $detalle['descripcion'], $detalle['cantidad'], $detalle['precio_unitario'], $detalle['subtotal']);
                $stmt_detalle->execute();
                // Descontar stock
                $stmt_stock = $conn->prepare("UPDATE medicamentos SET stock = stock - ? WHERE id = ? AND stock >= ?");
                $stmt_stock->bind_param("iii", $detalle['cantidad'], $detalle['medicamento_id'], $detalle['cantidad']);
                $stmt_stock->execute();
                // Registrar movimiento
                $stmt_mov = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, usuario_id, cantidad, tipo_movimiento, observaciones) VALUES (?, ?, ?, 'salida', ?)");
                $stmt_mov->bind_param("iiis", $detalle['medicamento_id'], $data['usuario_id'], $detalle['cantidad'], $observaciones);
                $stmt_mov->execute();
            }
            $conn->commit();
            $numero_comprobante = sprintf("F%06d", $cotizacion_id);
            echo json_encode([
                'success' => true,
                'cotizacion_id' => $cotizacion_id,
                'numero_comprobante' => $numero_comprobante,
                'message' => 'Venta registrada exitosamente'
            ]);
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Error en venta farmacia: " . $e->getMessage());
            if (isset($stmt) && $stmt->error) {
                error_log("MySQL error: " . $stmt->error);
            }
            echo json_encode(['success' => false, 'error' => 'Error al registrar la venta: ' . $e->getMessage() . ($stmt->error ? ' | MySQL: ' . $stmt->error : '')]);
        }
        break;
    case 'GET':
        // Listar cotizaciones o movimientos
        if (isset($_GET['cotizacion_id'])) {
            $ventaId = (int)$_GET['cotizacion_id'];
            $source = trim((string)($_GET['source'] ?? 'legacy'));

            if ($source === 'cotizacion') {
                $venta = obtener_detalle_venta_cotizacion($conn, $ventaId);
                respond(['success' => true, 'cotizacion' => $venta]);
            }

            if ($source === 'general') {
                $venta = obtener_detalle_venta_general($conn, $ventaId);
                respond(['success' => true, 'cotizacion' => $venta]);
            }

            $stmt = $conn->prepare("SELECT c.*, COALESCE(p.nombre, c.paciente_nombre) as paciente_nombre, COALESCE(p.dni, c.paciente_dni) as paciente_dni, u.nombre as usuario_nombre FROM cotizaciones_farmacia c LEFT JOIN pacientes p ON c.paciente_id = p.id LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.id = ?");
            $stmt->bind_param("i", $ventaId);
            $stmt->execute();
            $cotizacion = $stmt->get_result()->fetch_assoc();
            if (!$cotizacion) {
                respond(['success' => false, 'error' => 'Cotización no encontrada'], 404);
            }

            $stmt_detalle = $conn->prepare("SELECT * FROM cotizaciones_farmacia_detalle WHERE cotizacion_id = ?");
            $stmt_detalle->bind_param("i", $cotizacion['id']);
            $stmt_detalle->execute();
            $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);

            $venta = normalizar_venta_legacy($cotizacion);
            $venta['detalles'] = $detalles;
            respond(['success' => true, 'cotizacion' => $venta]);
        } elseif (isset($_GET['movimientos'])) {
            // Panel del químico: listar movimientos
            $stmt = $conn->prepare("SELECT m.*, me.nombre as medicamento, u.nombre as usuario FROM movimientos_medicamento m JOIN medicamentos me ON m.medicamento_id = me.id JOIN usuarios u ON m.usuario_id = u.id ORDER BY m.fecha_hora DESC");
            $stmt->execute();
            $movimientos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            respond(['success' => true, 'movimientos' => $movimientos]);
        } else {
            // Todas las ventas de farmacia — paginación real en SQL (UNION ALL + LIMIT/OFFSET)
            $page         = max(1, (int)($_GET['page']  ?? 1));
            $limit        = max(1, min(100, (int)($_GET['limit'] ?? 10)));
            $fecha_inicio = $_GET['fecha_inicio'] ?? null;
            $fecha_fin    = $_GET['fecha_fin']    ?? null;
            $buscar       = trim((string)($_GET['buscar'] ?? ''));

            $resultado = listar_ventas_farmacia_paginado($conn, $page, $limit, $fecha_inicio, $fecha_fin, $buscar);

            respond([
                'success'      => true,
                'cotizaciones' => $resultado['ventas'],
                'total'        => $resultado['total'],
                'page'         => $page,
                'limit'        => $limit,
            ]);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}
?>
