
<?php
require_once __DIR__ . '/init_api.php';
require_once "db.php";

$hasHonorariosPorCobrar = false;
try {
    $stmtTbl = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' LIMIT 1");
    $stmtTbl->execute();
    $hasHonorariosPorCobrar = (bool)$stmtTbl->fetchColumn();
} catch (Throwable $e) {
    $hasHonorariosPorCobrar = false;
}

$hasCotizacionMovimientos = false;
try {
    $stmtTblMov = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cotizacion_movimientos' LIMIT 1");
    $stmtTblMov->execute();
    $hasCotizacionMovimientos = (bool)$stmtTblMov->fetchColumn();
} catch (Throwable $e) {
    $hasCotizacionMovimientos = false;
}

$medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
$turno = isset($_GET['turno']) ? $_GET['turno'] : null;
$estado = isset($_GET['estado']) ? $_GET['estado'] : 'pendiente';
$incluirAnuladas = isset($_GET['incluir_anuladas']) && intval($_GET['incluir_anuladas']) === 1;


$where = "WHERE 1=1";
$params = [];
if ($estado === 'pendiente' || $estado === 'pagado') {
    $where .= " AND h.estado_pago_medico = :estado";
    $params[':estado'] = $estado;
}
if ($medico_id) {
    $where .= " AND h.medico_id = :medico_id";
    $params[':medico_id'] = $medico_id;
}
if ($turno) {
    $where .= " AND h.turno = :turno";
    $params[':turno'] = $turno;
}

if (!$incluirAnuladas) {
        if ($hasCotizacionMovimientos) {
                $where .= " AND NOT EXISTS (
                                                SELECT 1
                                                FROM cotizacion_movimientos cmx
                                                INNER JOIN cotizaciones cx ON cx.id = cmx.cotizacion_id
                                                WHERE cmx.cobro_id = h.cobro_id
                                                    AND LOWER(TRIM(COALESCE(cx.estado, ''))) = 'anulada'
                                        )";
        }

        if ($hasHonorariosPorCobrar) {
                $where .= " AND NOT EXISTS (
                                                SELECT 1
                                                FROM honorarios_por_cobrar hpcx
                                                INNER JOIN cotizaciones cx2 ON cx2.id = hpcx.cotizacion_id
                                                WHERE hpcx.honorario_movimiento_id_final = h.id
                                                    AND LOWER(TRIM(COALESCE(cx2.estado, ''))) = 'anulada'
                                        )";
        }
}

// Logging input parameters
error_log('api_honorarios_pendientes.php - Params: ' . json_encode([
     'medico_id' => $medico_id,
     'turno' => $turno,
     'estado' => $estado,
     'where' => $where,
     'params' => $params
]));





$joinHpc = '';
$cobradoPorExpr = 'i.usuario_id';
$cobradoPorNombreExpr = 'uc.nombre';
$cobradoPorRolExpr = 'uc.rol';
if ($hasHonorariosPorCobrar) {
    $joinHpc = " LEFT JOIN honorarios_por_cobrar hpc ON hpc.honorario_movimiento_id_final = h.id AND hpc.estado_consolidacion = 'consolidado'";
    $cobradoPorExpr = 'COALESCE(hpc.usuario_cobro_id, i.usuario_id)';

    if ($hasCotizacionMovimientos) {
        $cobradoPorNombreExpr = "COALESCE(
            NULLIF(
                (
                    SELECT GROUP_CONCAT(DISTINCT ucm.nombre ORDER BY ucm.nombre SEPARATOR ', ')
                    FROM cotizacion_movimientos cm
                    LEFT JOIN usuarios ucm ON ucm.id = cm.usuario_id
                    WHERE cm.cotizacion_id = hpc.cotizacion_id
                      AND cm.tipo_movimiento = 'abono'
                ),
                ''
            ),
            uc.nombre
        )";

        $cobradoPorRolExpr = "CASE
            WHEN (
                SELECT COUNT(DISTINCT cm2.usuario_id)
                FROM cotizacion_movimientos cm2
                WHERE cm2.cotizacion_id = hpc.cotizacion_id
                  AND cm2.tipo_movimiento = 'abono'
            ) > 1 THEN 'multiple'
            ELSE uc.rol
        END";
    }
}

$sql = "SELECT h.id, h.medico_id, m.nombre AS medico_nombre, m.apellido AS medico_apellido, h.descripcion, h.tipo_servicio, h.paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, h.fecha, h.turno, h.monto_medico, h.estado_pago_medico,
    e.usuario_id AS liquidado_por_id, u.nombre AS liquidado_por_nombre, u.rol AS liquidado_por_rol, e.created_at AS fecha_liquidacion,
    $cobradoPorExpr AS cobrado_por_id, $cobradoPorNombreExpr AS cobrado_por_nombre, $cobradoPorRolExpr AS cobrado_por_rol
    FROM honorarios_medicos_movimientos h
    LEFT JOIN medicos m ON h.medico_id = m.id
    LEFT JOIN pacientes p ON h.paciente_id = p.id
    LEFT JOIN egresos e ON e.honorario_movimiento_id = h.id AND e.tipo_egreso = 'honorario_medico'
    LEFT JOIN usuarios u ON e.usuario_id = u.id
    LEFT JOIN ingresos_diarios i ON i.honorario_movimiento_id = h.id
    $joinHpc
    LEFT JOIN usuarios uc ON uc.id = $cobradoPorExpr
    $where
    ORDER BY h.fecha DESC, h.id DESC";

// Logging SQL query
error_log('api_honorarios_pendientes.php - SQL: ' . $sql);

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$honorarios = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Logging result count
error_log('api_honorarios_pendientes.php - Result count: ' . count($honorarios));

echo json_encode([
    "success" => true,
    "honorarios" => $honorarios
]);
