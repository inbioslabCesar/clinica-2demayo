<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';
require_once __DIR__ . '/caja_autocierre.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    // Verificar que sea administrador
    if ($_SESSION['usuario']['rol'] !== 'administrador') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Solo los administradores pueden ver cajas cerradas']);
        exit;
    }

    caja_auto_cerrar_vencidas($pdo);

    $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
    $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';
    $usuarioIdFiltro = isset($_GET['usuario_id']) ? (int)$_GET['usuario_id'] : 0;
    $turnoFiltro = isset($_GET['turno']) ? trim((string)$_GET['turno']) : '';
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $perPage = isset($_GET['per_page']) ? max(1, min(200, (int)$_GET['per_page'])) : 10;
    $limiteLegacy = isset($_GET['limite']) ? max(1, min(5000, (int)$_GET['limite'])) : null;
    if ($limiteLegacy !== null && !isset($_GET['per_page'])) {
        $perPage = min(200, $limiteLegacy);
    }

    $fechaRegex = '/^\d{4}-\d{2}-\d{2}$/';
    if ($fechaDesde !== '' && !preg_match($fechaRegex, $fechaDesde)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'fecha_desde inválida']);
        exit;
    }
    if ($fechaHasta !== '' && !preg_match($fechaRegex, $fechaHasta)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'fecha_hasta inválida']);
        exit;
    }

    // Si no envían rango, mostrar últimos 30 días para no quedar solo en 20 filas.
    if ($fechaHasta === '') {
        $fechaHasta = date('Y-m-d');
    }
    if ($fechaDesde === '') {
        $fechaDesde = date('Y-m-d', strtotime($fechaHasta . ' -30 days'));
    }

    $columnasCajas = [];
    $stmtCols = $pdo->query("SHOW COLUMNS FROM cajas");
    foreach ($stmtCols->fetchAll(PDO::FETCH_ASSOC) as $col) {
        $columnasCajas[(string)$col['Field']] = true;
    }

    $columnaSeguro = static function (string $nombre, string $alias = null) use ($columnasCajas): string {
        $aliasFinal = $alias ?: $nombre;
        if (isset($columnasCajas[$nombre])) {
            return "c.`{$nombre}` AS {$aliasFinal}";
        }
        return "0 AS {$aliasFinal}";
    };

    $selectExtras = [
        $columnaSeguro('total_efectivo'),
        $columnaSeguro('total_yape'),
        $columnaSeguro('total_plin'),
        $columnaSeguro('total_tarjetas'),
        $columnaSeguro('total_transferencias'),
        $columnaSeguro('virtual_contado'),
        $columnaSeguro('diferencia_virtual'),
        $columnaSeguro('cierre_automatico'),
        $columnaSeguro('cierre_pendiente_cuadre'),
        $columnaSeguro('monto_contado'),
    ];

        $exprTotalEfectivo = isset($columnasCajas['total_efectivo']) ? 'COALESCE(c.total_efectivo, 0)' : '0';
        $exprTotalYape = isset($columnasCajas['total_yape']) ? 'COALESCE(c.total_yape, 0)' : '0';
        $exprTotalPlin = isset($columnasCajas['total_plin']) ? 'COALESCE(c.total_plin, 0)' : '0';
        $exprTotalTarjetas = isset($columnasCajas['total_tarjetas']) ? 'COALESCE(c.total_tarjetas, 0)' : '0';
        $exprTotalTransferencias = isset($columnasCajas['total_transferencias']) ? 'COALESCE(c.total_transferencias, 0)' : '0';
        $exprIngresoCaja = "({$exprTotalEfectivo} + {$exprTotalYape} + {$exprTotalPlin} + {$exprTotalTarjetas} + {$exprTotalTransferencias})";

        $exprEgresoHonorarios = "COALESCE((
                SELECT SUM(h.monto_medico)
                FROM honorarios_medicos_movimientos h
                WHERE h.caja_id = c.id
                    AND LOWER(TRIM(COALESCE(h.estado_pago_medico, ''))) = 'pagado'
        ), 0)";
        $exprEgresoHonorariosDiaOperativo = "COALESCE((
                SELECT SUM(h.monto_medico)
                FROM honorarios_medicos_movimientos h
                WHERE h.caja_id = c.id
                    AND LOWER(TRIM(COALESCE(h.estado_pago_medico, ''))) = 'pagado'
                    AND DATE(h.fecha) = DATE(c.fecha)
        ), 0)";
        $exprEgresoLabRef = "COALESCE((
                SELECT SUM(e.monto)
                FROM egresos e
                WHERE e.caja_id = c.id
                    AND e.tipo_egreso = 'laboratorio'
        ), 0)";
        $exprEgresoOperativo = "COALESCE((
                SELECT SUM(e.monto)
                FROM egresos e
                WHERE e.caja_id = c.id
                    AND e.tipo_egreso NOT IN ('honorario_medico', 'laboratorio')
        ), 0)";
        $exprEgresoHonorariosArrastre = "GREATEST(0, {$exprEgresoHonorarios} - {$exprEgresoHonorariosDiaOperativo})";
        $exprTotalEgresosCaja = "({$exprEgresoHonorarios} + {$exprEgresoLabRef} + {$exprEgresoOperativo})";
        $exprGananciaCaja = "({$exprIngresoCaja} - {$exprTotalEgresosCaja})";

        $selectExtras[] = $exprEgresoHonorarios . ' AS egreso_honorarios';
        $selectExtras[] = $exprEgresoHonorarios . ' AS egreso_honorarios_caja';
        $selectExtras[] = $exprEgresoHonorariosDiaOperativo . ' AS egreso_honorarios_dia_operativo';
        $selectExtras[] = $exprEgresoHonorariosArrastre . ' AS egreso_honorarios_arrastre';
        $selectExtras[] = $exprEgresoLabRef . ' AS egreso_lab_ref';
        $selectExtras[] = $exprEgresoOperativo . ' AS egreso_operativo';
        $selectExtras[] = $exprTotalEgresosCaja . ' AS total_egresos';
        $selectExtras[] = $exprGananciaCaja . ' AS ganancia_dia';

    $where = [
        "c.estado = 'cerrada'",
        'c.fecha >= ?',
        'c.fecha <= ?',
    ];
    $paramsBase = [$fechaDesde, $fechaHasta];
    if ($usuarioIdFiltro > 0) {
        $where[] = 'c.usuario_id = ?';
        $paramsBase[] = $usuarioIdFiltro;
    }
    if ($turnoFiltro !== '') {
        $where[] = 'c.turno = ?';
        $paramsBase[] = $turnoFiltro;
    }
    $whereSql = implode(' AND ', $where);

    $stmtTotal = $pdo->prepare("SELECT COUNT(*) FROM cajas c WHERE {$whereSql}");
    $stmtTotal->execute($paramsBase);
    $totalRegistros = (int)$stmtTotal->fetchColumn();
    $totalPaginas = max(1, (int)ceil($totalRegistros / max(1, $perPage)));
    if ($page > $totalPaginas) {
        $page = $totalPaginas;
    }
    $offset = ($page - 1) * $perPage;

    $sql = "SELECT 
        c.id,
        c.fecha,
        c.hora_apertura,
        c.hora_cierre,
        c.monto_apertura,
        c.monto_cierre,
        c.diferencia,
        c.observaciones_cierre,
        u.nombre as usuario_nombre,
        c.turno,
        " . implode(",\n        ", $selectExtras) . "
        FROM cajas c
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE {$whereSql}
        ORDER BY c.fecha DESC, c.hora_cierre DESC, c.id DESC
        LIMIT {$perPage} OFFSET {$offset}";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($paramsBase);
    $cajas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $sqlResumen = "SELECT
        c.fecha,
        COUNT(*) AS total_cajas,
        COALESCE(SUM(c.monto_cierre), 0) AS monto_cierre,
        COALESCE(SUM(c.diferencia), 0) AS diferencia,
        COALESCE(SUM({$exprTotalEfectivo}), 0) AS total_efectivo,
        COALESCE(SUM({$exprTotalYape}), 0) AS total_yape,
        COALESCE(SUM({$exprTotalPlin}), 0) AS total_plin,
        COALESCE(SUM({$exprTotalTarjetas}), 0) AS total_tarjetas,
        COALESCE(SUM({$exprTotalTransferencias}), 0) AS total_transferencias,
        COALESCE(SUM(" . (isset($columnasCajas['virtual_contado']) ? "c.virtual_contado" : "0") . "), 0) AS virtual_contado,
        COALESCE(SUM(" . (isset($columnasCajas['diferencia_virtual']) ? "c.diferencia_virtual" : "0") . "), 0) AS diferencia_virtual,
        COALESCE(SUM({$exprTotalEgresosCaja}), 0) AS total_egresos,
        COALESCE(SUM({$exprGananciaCaja}), 0) AS ganancia_dia
        FROM cajas c
        WHERE {$whereSql}
        GROUP BY c.fecha
        ORDER BY c.fecha DESC";

    $stmtResumen = $pdo->prepare($sqlResumen);
    $stmtResumen->execute($paramsBase);
    $resumenDiario = $stmtResumen->fetchAll(PDO::FETCH_ASSOC);

    $exprPendiente = isset($columnasCajas['cierre_pendiente_cuadre']) ? 'COALESCE(c.cierre_pendiente_cuadre, 0)' : '0';
    $exprMontoContado = isset($columnasCajas['monto_contado']) ? 'c.monto_contado' : 'NULL';
    $exprVirtualContado = isset($columnasCajas['virtual_contado']) ? 'c.virtual_contado' : 'NULL';
    $exprDiferenciaVirtual = isset($columnasCajas['diferencia_virtual']) ? 'c.diferencia_virtual' : 'NULL';
    $exprTotalYape = isset($columnasCajas['total_yape']) ? 'c.total_yape' : '0';
    $exprTotalPlin = isset($columnasCajas['total_plin']) ? 'c.total_plin' : '0';
    $exprTotalTarjetas = isset($columnasCajas['total_tarjetas']) ? 'c.total_tarjetas' : '0';
    $exprTotalTransferencias = isset($columnasCajas['total_transferencias']) ? 'c.total_transferencias' : '0';

    $sqlResumenRealDiario = "SELECT
        c.fecha,
        COUNT(*) AS total_cajas,
        SUM(CASE WHEN {$exprPendiente} = 1 THEN 1 ELSE 0 END) AS cajas_pendientes_cuadre,
        SUM(CASE WHEN {$exprPendiente} = 0 THEN 1 ELSE 0 END) AS cajas_regularizadas,
        COALESCE(SUM(CASE
            WHEN {$exprPendiente} = 0 AND {$exprMontoContado} IS NOT NULL THEN COALESCE({$exprMontoContado}, 0)
            ELSE 0
        END), 0) AS efectivo_real_contado,
        COALESCE(SUM(CASE
            WHEN {$exprPendiente} = 0 AND {$exprMontoContado} IS NOT NULL AND c.diferencia IS NOT NULL THEN COALESCE({$exprMontoContado}, 0) - COALESCE(c.diferencia, 0)
            ELSE 0
        END), 0) AS efectivo_esperado_regularizado,
        COALESCE(SUM(CASE
            WHEN {$exprPendiente} = 0 THEN COALESCE({$exprTotalYape}, 0) + COALESCE({$exprTotalPlin}, 0) + COALESCE({$exprTotalTarjetas}, 0) + COALESCE({$exprTotalTransferencias}, 0)
            ELSE 0
        END), 0) AS virtual_cobrado_regularizado,
        COALESCE(SUM(CASE
            WHEN {$exprPendiente} = 0 AND {$exprVirtualContado} IS NOT NULL THEN COALESCE({$exprVirtualContado}, 0)
            ELSE 0
        END), 0) AS virtual_real_contado,
        COALESCE(SUM(CASE
            WHEN {$exprPendiente} = 0 AND {$exprDiferenciaVirtual} IS NOT NULL THEN COALESCE({$exprDiferenciaVirtual}, 0)
            ELSE 0
        END), 0) AS diferencia_virtual_regularizada,
        COALESCE(SUM(CASE
            WHEN {$exprPendiente} = 0 AND c.diferencia IS NOT NULL THEN COALESCE(c.diferencia, 0)
            ELSE 0
        END), 0) AS diferencia_efectivo_regularizada
        FROM cajas c
        WHERE {$whereSql}
        GROUP BY c.fecha
        ORDER BY c.fecha DESC";

    $stmtResumenRealDiario = $pdo->prepare($sqlResumenRealDiario);
    $stmtResumenRealDiario->execute($paramsBase);
    $resumenCierreRealDiario = $stmtResumenRealDiario->fetchAll(PDO::FETCH_ASSOC);

    $indicadores = [
        'total_cajas' => 0,
        'total_pendientes_cuadre' => 0,
        'total_regularizadas' => 0,
        'efectivo_real_total' => 0.0,
        'efectivo_esperado_total' => 0.0,
        'diferencia_efectivo_total' => 0.0,
        'virtual_cobrado_total' => 0.0,
        'virtual_real_total' => 0.0,
        'diferencia_virtual_total' => 0.0,
    ];

    foreach ($resumenCierreRealDiario as &$filaReal) {
        $filaReal['total_cajas'] = (int)($filaReal['total_cajas'] ?? 0);
        $filaReal['cajas_pendientes_cuadre'] = (int)($filaReal['cajas_pendientes_cuadre'] ?? 0);
        $filaReal['cajas_regularizadas'] = (int)($filaReal['cajas_regularizadas'] ?? 0);
        $filaReal['efectivo_real_contado'] = (float)($filaReal['efectivo_real_contado'] ?? 0);
        $filaReal['efectivo_esperado_regularizado'] = (float)($filaReal['efectivo_esperado_regularizado'] ?? 0);
        $filaReal['virtual_cobrado_regularizado'] = (float)($filaReal['virtual_cobrado_regularizado'] ?? 0);
        $filaReal['virtual_real_contado'] = (float)($filaReal['virtual_real_contado'] ?? 0);
        $filaReal['diferencia_virtual_regularizada'] = (float)($filaReal['diferencia_virtual_regularizada'] ?? 0);
        $filaReal['diferencia_efectivo_regularizada'] = (float)($filaReal['diferencia_efectivo_regularizada'] ?? 0);

        $indicadores['total_cajas'] += $filaReal['total_cajas'];
        $indicadores['total_pendientes_cuadre'] += $filaReal['cajas_pendientes_cuadre'];
        $indicadores['total_regularizadas'] += $filaReal['cajas_regularizadas'];
        $indicadores['efectivo_real_total'] += $filaReal['efectivo_real_contado'];
        $indicadores['efectivo_esperado_total'] += $filaReal['efectivo_esperado_regularizado'];
        $indicadores['diferencia_efectivo_total'] += $filaReal['diferencia_efectivo_regularizada'];
        $indicadores['virtual_cobrado_total'] += $filaReal['virtual_cobrado_regularizado'];
        $indicadores['virtual_real_total'] += $filaReal['virtual_real_contado'];
        $indicadores['diferencia_virtual_total'] += $filaReal['diferencia_virtual_regularizada'];
    }
    unset($filaReal);

    $stmtUsuarios = $pdo->prepare("SELECT DISTINCT c.usuario_id AS id, COALESCE(u.nombre, CONCAT('Usuario #', c.usuario_id)) AS nombre FROM cajas c LEFT JOIN usuarios u ON u.id = c.usuario_id WHERE c.estado = 'cerrada' AND c.fecha >= ? AND c.fecha <= ? ORDER BY nombre ASC");
    $stmtUsuarios->execute([$fechaDesde, $fechaHasta]);
    $usuariosDisponibles = $stmtUsuarios->fetchAll(PDO::FETCH_ASSOC);

    $stmtTurnos = $pdo->prepare("SELECT DISTINCT c.turno FROM cajas c WHERE c.estado = 'cerrada' AND c.fecha >= ? AND c.fecha <= ? AND c.turno IS NOT NULL AND c.turno <> '' ORDER BY c.turno ASC");
    $stmtTurnos->execute([$fechaDesde, $fechaHasta]);
    $turnosDisponibles = array_map(static function ($row) {
        return (string)$row['turno'];
    }, $stmtTurnos->fetchAll(PDO::FETCH_ASSOC));

    // Obtener historial de reaperturas para contexto
    $sqlReaperturas = "SELECT 
        lr.caja_id,
        lr.fecha_reapertura,
        lr.usuario_nombre,
        lr.motivo
        FROM log_reaperturas lr
        ORDER BY lr.fecha_reapertura DESC
        LIMIT 10";
    
    $stmtReaperturas = $pdo->prepare($sqlReaperturas);
    $stmtReaperturas->execute();
    $reaperturas = $stmtReaperturas->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'filtros' => [
            'fecha_desde' => $fechaDesde,
            'fecha_hasta' => $fechaHasta,
            'usuario_id' => $usuarioIdFiltro,
            'turno' => $turnoFiltro,
            'page' => $page,
            'per_page' => $perPage,
            'limite' => $limiteLegacy,
        ],
        'paginacion' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $totalRegistros,
            'total_pages' => $totalPaginas,
            'from' => $totalRegistros > 0 ? ($offset + 1) : 0,
            'to' => min($offset + $perPage, $totalRegistros),
        ],
        'indicadores' => $indicadores,
        'usuarios_disponibles' => $usuariosDisponibles,
        'turnos_disponibles' => $turnosDisponibles,
        'resumen_diario' => $resumenDiario,
        'resumen_cierre_real_diario' => $resumenCierreRealDiario,
        'cajas_cerradas' => $cajas,
        'historial_reaperturas' => $reaperturas
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error de base de datos: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error del servidor: ' . $e->getMessage()
    ]);
}
?>