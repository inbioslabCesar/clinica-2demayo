<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db_ocupacional.php';

function out_clin($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function parse_session_permisos_clin()
{
    $raw = $_SESSION['usuario']['permisos'] ?? [];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($raw)) {
        return [];
    }
    return array_values(array_filter(array_map('strval', $raw), fn($v) => trim($v) !== ''));
}

function require_ocup_permiso_any_clin($permisosValidos, $fallback = 'ver_ordenes_ocupacional')
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_clin(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }

    $permisos = parse_session_permisos_clin();
    if (!in_array('access_salud_ocupacional', $permisos, true)) {
        out_clin(403, ['success' => false, 'error' => 'No autorizado para salud ocupacional']);
    }

    $lista = is_array($permisosValidos) ? $permisosValidos : [$permisosValidos];
    if ($fallback !== '') {
        $lista[] = $fallback;
    }

    foreach ($lista as $perm) {
        $p = trim((string)$perm);
        if ($p !== '' && in_array($p, $permisos, true)) {
            return;
        }
    }

    out_clin(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
}

function table_exists_clin($conn, $table)
{
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

function format_historia_clin_row($row)
{
    return [
        'id' => (int)$row['id'],
        'orden_id' => (int)$row['orden_id'],
        'motivo_evaluacion' => (string)($row['motivo_evaluacion'] ?? ''),
        'puesto_actual' => (string)($row['puesto_actual'] ?? ''),
        'area_trabajo' => (string)($row['area_trabajo'] ?? ''),
        'tiempo_puesto_meses' => isset($row['tiempo_puesto_meses']) ? (int)$row['tiempo_puesto_meses'] : null,
        'antecedentes_laborales_json' => $row['antecedentes_laborales_json'] !== null ? json_decode((string)$row['antecedentes_laborales_json'], true) : null,
        'antecedentes_patologicos_json' => $row['antecedentes_patologicos_json'] !== null ? json_decode((string)$row['antecedentes_patologicos_json'], true) : null,
        'habitos_json' => $row['habitos_json'] !== null ? json_decode((string)$row['habitos_json'], true) : null,
        'observaciones' => (string)($row['observaciones'] ?? ''),
        'created_at' => (string)($row['created_at'] ?? ''),
    ];
}

$requiredTables = [
    'ocupacional_ordenes',
    'ocupacional_orden_detalle',
    'ocupacional_historia_ocupacional',
    'empresas_ocupacionales',
    'pacientes_ocupacionales',
    'ocupacional_protocolos_empresa',
    'ocupacional_tipos_evaluacion',
];

foreach ($requiredTables as $table) {
    if (!table_exists_clin($mysqliOcup, $table)) {
        out_clin(500, [
            'success' => false,
            'error' => 'Falta la tabla ' . $table . '. Aplicar scripts SQL de Fase 3/Fase 4 en la base ocupacional.',
        ]);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    out_clin(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

$accion = trim((string)($_GET['accion'] ?? 'consolidado'));

if ($accion !== 'consolidado') {
    out_clin(422, ['success' => false, 'error' => 'accion GET no soportada']);
}

require_ocup_permiso_any_clin(['ver_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);

$ordenId = (int)($_GET['orden_id'] ?? 0);
if ($ordenId <= 0) {
    out_clin(422, ['success' => false, 'error' => 'orden_id es obligatorio']);
}

$stmtCab = $mysqliOcup->prepare('SELECT
                                    o.id,
                                    o.codigo,
                                    o.fecha_orden,
                                    o.estado,
                                    o.monto_total,
                                    o.observacion,
                                    o.aptitud_final,
                                    o.restriccion_final,
                                    o.recomendacion_final,
                                    o.medico_responsable,
                                    e.razon_social AS empresa,
                                    t.documento_numero,
                                    t.puesto_trabajo,
                                    p.descripcion AS protocolo_descripcion,
                                    te.codigo AS tipo_codigo,
                                    te.nombre AS tipo_nombre
                                 FROM ocupacional_ordenes o
                                 INNER JOIN empresas_ocupacionales e ON e.id = o.empresa_id
                                 INNER JOIN pacientes_ocupacionales t ON t.id = o.trabajador_id
                                 INNER JOIN ocupacional_protocolos_empresa p ON p.id = o.protocolo_id
                                 INNER JOIN ocupacional_tipos_evaluacion te ON te.id = o.tipo_evaluacion_id
                                 WHERE o.id = ? LIMIT 1');
if (!$stmtCab) {
    out_clin(500, ['success' => false, 'error' => 'No se pudo consultar cabecera de orden']);
}
$stmtCab->bind_param('i', $ordenId);
$stmtCab->execute();
$cab = $stmtCab->get_result()->fetch_assoc();
$stmtCab->close();

if (!$cab) {
    out_clin(404, ['success' => false, 'error' => 'Orden no encontrada']);
}

$stmtDet = $mysqliOcup->prepare('SELECT
                                                                        d.id,
                                                                        d.examen_codigo,
                                                                        d.examen_descripcion,
                                                                        d.monto,
                                                                        d.estado_ejecucion,
                                                                        d.observacion_ejecucion,
                                                                        d.fecha_ejecucion,
                                                                        EXISTS (
                                                                            SELECT 1 FROM ocupacional_resultados_clinicos rc
                                                                            WHERE rc.orden_detalle_id = d.id AND rc.estado = "finalizado"
                                                                        ) AS resultado_finalizado
                                                                 FROM ocupacional_orden_detalle d
                                                                 WHERE d.orden_id = ?
                                                                 ORDER BY d.id ASC');
if (!$stmtDet) {
    out_clin(500, ['success' => false, 'error' => 'No se pudo consultar detalle clinico de orden']);
}
$stmtDet->bind_param('i', $ordenId);
$stmtDet->execute();
$resDet = $stmtDet->get_result();

$detalles = [];
$totalItems = 0;
$totalCompletados = 0;
$totalObservados = 0;
while ($row = $resDet->fetch_assoc()) {
    $estadoEjec = (string)($row['estado_ejecucion'] ?? 'pendiente');
    if ($estadoEjec === 'realizado' && (int)($row['resultado_finalizado'] ?? 0) === 1) {
        $totalCompletados++;
    }
    if ($estadoEjec === 'observado') {
        $totalObservados++;
    }
    $totalItems++;

    $detalles[] = [
        'id' => (int)$row['id'],
        'examen_codigo' => (string)($row['examen_codigo'] ?? ''),
        'examen_descripcion' => (string)($row['examen_descripcion'] ?? ''),
        'monto' => number_format((float)($row['monto'] ?? 0), 2, '.', ''),
        'estado_ejecucion' => $estadoEjec,
        'observacion_ejecucion' => (string)($row['observacion_ejecucion'] ?? ''),
        'fecha_ejecucion' => (string)($row['fecha_ejecucion'] ?? ''),
        'resultado_finalizado' => (int)($row['resultado_finalizado'] ?? 0) === 1,
    ];
}
$stmtDet->close();

$stmtHist = $mysqliOcup->prepare('SELECT *
                                  FROM ocupacional_historia_ocupacional
                                  WHERE orden_id = ? AND estado <> "anulado"
                                  ORDER BY id DESC');
$historias = [];
if ($stmtHist) {
    $stmtHist->bind_param('i', $ordenId);
    $stmtHist->execute();
    $resHist = $stmtHist->get_result();
    while ($h = $resHist->fetch_assoc()) {
        $historias[] = format_historia_clin_row($h);
    }
    $stmtHist->close();
}

$resumen = [
    'total_items' => $totalItems,
    'total_completados' => $totalCompletados,
    'total_observados' => $totalObservados,
    'total_pendientes' => max(0, $totalItems - $totalCompletados),
    'porcentaje_avance' => $totalItems > 0 ? (int)round(($totalCompletados / $totalItems) * 100) : 0,
    'historias_registradas' => count($historias),
];

$stmtInter = $mysqliOcup->prepare('SELECT COUNT(*) AS total
                                   FROM ocupacional_interconsultas
                                   WHERE orden_id = ? AND estado IN ("solicitada", "respondida")');
if ($stmtInter) {
    $stmtInter->bind_param('i', $ordenId);
    $stmtInter->execute();
    $resumen['interconsultas_abiertas'] = (int)($stmtInter->get_result()->fetch_assoc()['total'] ?? 0);
    $stmtInter->close();
} else {
    $resumen['interconsultas_abiertas'] = 0;
}

out_clin(200, [
    'success' => true,
    'data' => [
        'cabecera' => [
            'id' => (int)$cab['id'],
            'codigo' => (string)($cab['codigo'] ?? ''),
            'fecha_orden' => (string)($cab['fecha_orden'] ?? ''),
            'estado' => (string)($cab['estado'] ?? ''),
            'monto_total' => number_format((float)($cab['monto_total'] ?? 0), 2, '.', ''),
            'observacion' => (string)($cab['observacion'] ?? ''),
            'aptitud_final' => (string)($cab['aptitud_final'] ?? ''),
            'restriccion_final' => (string)($cab['restriccion_final'] ?? ''),
            'recomendacion_final' => (string)($cab['recomendacion_final'] ?? ''),
            'medico_responsable' => (string)($cab['medico_responsable'] ?? ''),
            'empresa' => (string)($cab['empresa'] ?? ''),
            'documento_numero' => (string)($cab['documento_numero'] ?? ''),
            'puesto_trabajo' => (string)($cab['puesto_trabajo'] ?? ''),
            'protocolo_descripcion' => (string)($cab['protocolo_descripcion'] ?? ''),
            'tipo_codigo' => (string)($cab['tipo_codigo'] ?? ''),
            'tipo_nombre' => (string)($cab['tipo_nombre'] ?? ''),
        ],
        'resumen' => $resumen,
        'detalles' => $detalles,
        'historias' => $historias,
    ],
]);
