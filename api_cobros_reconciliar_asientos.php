<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

$rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
if ($rol !== 'administrador') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Solo administrador']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true) ?: [];
$fechaDesde = trim((string)($payload['fecha_desde'] ?? ''));
$fechaHasta = trim((string)($payload['fecha_hasta'] ?? ''));
$cobroIdFiltro = (int)($payload['cobro_id'] ?? 0);
$dryRun = !empty($payload['dry_run']);

$reFecha = '/^\d{4}-\d{2}-\d{2}$/';
if ($fechaDesde !== '' && !preg_match($reFecha, $fechaDesde)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'fecha_desde invalida']);
    exit;
}
if ($fechaHasta !== '' && !preg_match($reFecha, $fechaHasta)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'fecha_hasta invalida']);
    exit;
}

if ($fechaHasta === '') {
    $fechaHasta = date('Y-m-d');
}
if ($fechaDesde === '') {
    $fechaDesde = date('Y-m-d', strtotime($fechaHasta . ' -30 days'));
}

$where = [
    "DATE(c.fecha_cobro) >= ?",
    "DATE(c.fecha_cobro) <= ?",
    "LOWER(TRIM(COALESCE(c.estado, ''))) = 'pagado'",
];
$params = [$fechaDesde, $fechaHasta];
$types = 'ss';

if ($cobroIdFiltro > 0) {
    $where[] = 'c.id = ?';
    $params[] = $cobroIdFiltro;
    $types .= 'i';
}

$sql = "SELECT c.id, c.total, c.tipo_pago, c.paciente_id, c.usuario_id, c.fecha_cobro,
               COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(i.referencia_tabla, ''))) = 'cobros' THEN i.monto ELSE 0 END), 0) AS total_asentado,
               COUNT(CASE WHEN LOWER(TRIM(COALESCE(i.referencia_tabla, ''))) = 'cobros' THEN 1 END) AS items_asiento,
               MAX(CASE WHEN LOWER(TRIM(COALESCE(i.referencia_tabla, ''))) = 'cobros' THEN i.caja_id ELSE NULL END) AS caja_id_asiento
        FROM cobros c
        LEFT JOIN ingresos_diarios i ON i.referencia_id = c.id
        WHERE " . implode(' AND ', $where) . "
        GROUP BY c.id, c.total, c.tipo_pago, c.paciente_id, c.usuario_id, c.fecha_cobro
        ORDER BY c.id DESC
        LIMIT 1000";

$stmt = $conn->prepare($sql);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo preparar consulta de reconciliacion']);
    exit;
}
$stmt->bind_param($types, ...$params);
$stmt->execute();
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

$metodoMap = [
    'efectivo' => 'efectivo',
    'tarjeta' => 'tarjeta',
    'transferencia' => 'transferencia',
    'yape' => 'yape',
    'plin' => 'plin',
    'seguro' => 'otros',
];

$analizados = 0;
$descuadrados = 0;
$reparados = 0;
$omitidos = 0;
$detalles = [];

foreach ($rows as $row) {
    $analizados++;
    $cobroId = (int)$row['id'];
    $totalCobro = round((float)($row['total'] ?? 0), 2);
    $totalAsentado = round((float)($row['total_asentado'] ?? 0), 2);
    $delta = round($totalCobro - $totalAsentado, 2);

    if (abs($delta) <= 0.01) {
        continue;
    }

    if ($delta < -0.01) {
        $descuadrados++;
        $omitidos++;
        $detalles[] = [
            'cobro_id' => $cobroId,
            'estado' => 'sobre_asentado',
            'motivo' => 'El asiento en caja supera el total del cobro; requiere revision manual.',
            'total_cobro' => $totalCobro,
            'total_asentado' => $totalAsentado,
            'exceso' => abs($delta),
        ];
        continue;
    }

    $descuadrados++;
    $cajaId = (int)($row['caja_id_asiento'] ?? 0);
    if ($cajaId <= 0) {
        $omitidos++;
        $detalles[] = [
            'cobro_id' => $cobroId,
            'estado' => 'omitido',
            'motivo' => 'No se pudo inferir caja_id de forma segura (sin asientos previos).',
            'total_cobro' => $totalCobro,
            'total_asentado' => $totalAsentado,
            'faltante' => $delta,
        ];
        continue;
    }

    if ($dryRun) {
        $detalles[] = [
            'cobro_id' => $cobroId,
            'estado' => 'pendiente_reparacion',
            'caja_id' => $cajaId,
            'total_cobro' => $totalCobro,
            'total_asentado' => $totalAsentado,
            'faltante' => $delta,
        ];
        continue;
    }

    $tipoPago = strtolower(trim((string)($row['tipo_pago'] ?? '')));
    $metodoPago = $metodoMap[$tipoPago] ?? 'otros';
    $descripcion = 'Regularizacion automatica de asiento faltante de cobro #' . $cobroId;
    $turno = null;

    $stmtCaja = $conn->prepare('SELECT turno FROM cajas WHERE id = ? LIMIT 1');
    if ($stmtCaja) {
        $stmtCaja->bind_param('i', $cajaId);
        $stmtCaja->execute();
        $turnoRow = $stmtCaja->get_result()->fetch_assoc();
        $stmtCaja->close();
        $turno = $turnoRow['turno'] ?? null;
    }

    $stmtIns = $conn->prepare("INSERT INTO ingresos_diarios (
        caja_id, tipo_ingreso, area, descripcion, monto, metodo_pago, referencia_id, referencia_tabla,
        paciente_id, paciente_nombre, usuario_id, turno, honorario_movimiento_id, cobrado_por, liquidado_por, fecha_liquidacion, fecha_hora
    ) VALUES (?, 'regularizacion_asiento', 'Regularizacion', ?, ?, ?, ?, 'cobros', ?, '', ?, ?, NULL, ?, NULL, NULL, ?)");

    if (!$stmtIns) {
        $omitidos++;
        $detalles[] = [
            'cobro_id' => $cobroId,
            'estado' => 'error',
            'motivo' => 'No se pudo preparar insercion de regularizacion.',
        ];
        continue;
    }

    $usuarioId = (int)($row['usuario_id'] ?? 0);
    $pacienteId = (int)($row['paciente_id'] ?? 0);
    $fechaHora = (string)($row['fecha_cobro'] ?? date('Y-m-d H:i:s'));
    $faltanteAbs = round(max(0, $delta), 2);
    $stmtIns->bind_param('isdsiiisis', $cajaId, $descripcion, $faltanteAbs, $metodoPago, $cobroId, $pacienteId, $usuarioId, $turno, $usuarioId, $fechaHora);
    $okIns = $stmtIns->execute();
    $stmtIns->close();

    if ($okIns) {
        $reparados++;
        $detalles[] = [
            'cobro_id' => $cobroId,
            'estado' => 'reparado',
            'caja_id' => $cajaId,
            'faltante' => $delta,
        ];
    } else {
        $omitidos++;
        $detalles[] = [
            'cobro_id' => $cobroId,
            'estado' => 'error',
            'motivo' => 'Fallo al insertar regularizacion.',
        ];
    }
}

echo json_encode([
    'success' => true,
    'dry_run' => $dryRun,
    'fecha_desde' => $fechaDesde,
    'fecha_hasta' => $fechaHasta,
    'cobro_id' => $cobroIdFiltro > 0 ? $cobroIdFiltro : null,
    'analizados' => $analizados,
    'descuadrados' => $descuadrados,
    'reparados' => $reparados,
    'omitidos' => $omitidos,
    'detalles' => $detalles,
]);
