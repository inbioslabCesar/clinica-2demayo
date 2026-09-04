<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/caja_autocierre.php';

if (!isset($_SESSION['usuario'])) {
    error_log('No autenticado: sesión no iniciada');
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'No autenticado',
        'request_id' => function_exists('api_request_id') ? api_request_id() : null,
    ]);
    exit();
}

$usuario = $_SESSION['usuario'];
$fecha = isset($_GET['fecha']) ? $_GET['fecha'] : date('Y-m-d');

// Calcular rango de fecha para el día
$inicioDia = $fecha . ' 00:00:00';
$finDia = date('Y-m-d', strtotime($fecha . ' +1 day')) . ' 00:00:00';

// Egreso honorarios médicos
$egreso_honorarios = 0.0;

try {
    caja_auto_cerrar_vencidas($pdo);

    // El encabezado resume exclusivamente la caja abierta actual. Las cajas cerradas
    // siguen disponibles en cajas_resumen, pero no se mezclan con una caja nueva.
    $stmtCaja = $pdo->prepare('SELECT id, monto_apertura, estado, hora_apertura FROM cajas WHERE fecha >= ? AND fecha < ? AND usuario_id = ? AND estado = "abierta" ORDER BY created_at DESC LIMIT 1');
    $stmtCaja->execute([$inicioDia, $finDia, $usuario['id']]);
    $caja_row = $stmtCaja->fetch(PDO::FETCH_ASSOC) ?: null;
    $caja_id_actual = $caja_row ? (int)$caja_row['id'] : 0;

    $egreso_operativo = 0.0;
    $egreso_lab_ref = 0.0;
    $total = 0.0;
    $ingresos_por_servicio = [];
    $ingresos_por_area = [];
    $ingresos_por_pago = [];
    $egresos_por_metodo = ['efectivo' => 0.0, 'yape' => 0.0, 'plin' => 0.0, 'tarjeta' => 0.0, 'transferencia' => 0.0];
    $egresos_externos = 0.0;
    $total_contratos_abono = 0.0;

    if ($caja_id_actual > 0) {
        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM egresos WHERE caja_id = ? AND tipo_egreso = "honorario_medico"');
        $stmt->execute([$caja_id_actual]);
        $egreso_honorarios = floatval($stmt->fetchColumn());

        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM egresos WHERE caja_id = ? AND tipo_egreso NOT IN ("honorario_medico", "laboratorio")');
        $stmt->execute([$caja_id_actual]);
        $egreso_operativo = floatval($stmt->fetchColumn());

        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
        $stmt->execute([$caja_id_actual]);
        $egreso_lab_ref = floatval($stmt->fetchColumn());
        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM ingresos_diarios WHERE caja_id = ?');
        $stmt->execute([$caja_id_actual]);
        $total = floatval($stmt->fetchColumn());

        $stmt = $pdo->prepare('SELECT tipo_ingreso, SUM(monto) as total_servicio FROM ingresos_diarios WHERE caja_id = ? GROUP BY tipo_ingreso');
        $stmt->execute([$caja_id_actual]);
        $ingresos_por_servicio = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare('SELECT area, SUM(monto) as total_area FROM ingresos_diarios WHERE caja_id = ? GROUP BY area');
        $stmt->execute([$caja_id_actual]);
        $ingresos_por_area = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
        $stmt->execute([$caja_id_actual]);
        $ingresos_por_pago = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM ingresos_diarios WHERE caja_id = ? AND (tipo_ingreso = ? OR referencia_tabla = ?)');
        $stmt->execute([$caja_id_actual, 'contrato_abono', 'paciente_seguimiento_pagos']);
        $total_contratos_abono = floatval($stmt->fetchColumn());

        $stmtFuente = $pdo->query("SHOW COLUMNS FROM egresos LIKE 'fuente_fondos'");
        $usaFuenteFondos = $stmtFuente && $stmtFuente->fetch(PDO::FETCH_ASSOC);
        $sqlEgresoMetodo = $usaFuenteFondos
            ? "SELECT metodo_pago, COALESCE(fuente_fondos, 'clinica') AS fuente_fondos, COALESCE(SUM(monto), 0) AS total FROM egresos WHERE caja_id = ? GROUP BY metodo_pago, COALESCE(fuente_fondos, 'clinica')"
            : "SELECT metodo_pago, 'clinica' AS fuente_fondos, COALESCE(SUM(monto), 0) AS total FROM egresos WHERE caja_id = ? GROUP BY metodo_pago";
        $stmt = $pdo->prepare($sqlEgresoMetodo);
        $stmt->execute([$caja_id_actual]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $egreso) {
            $metodo = strtolower(trim((string)($egreso['metodo_pago'] ?? 'efectivo')));
            $monto = (float)($egreso['total'] ?? 0);
            if (strtolower(trim((string)($egreso['fuente_fondos'] ?? 'clinica'))) !== 'clinica') {
                $egresos_externos += $monto;
            } elseif (array_key_exists($metodo, $egresos_por_metodo)) {
                $egresos_por_metodo[$metodo] += $monto;
            }
        }
    }

    $monto_apertura = ($caja_row && isset($caja_row['monto_apertura'])) ? $caja_row['monto_apertura'] : 0;
    $caja_abierta = $caja_row !== null;
    $totales_pago_metodo = ['efectivo' => 0.0, 'yape' => 0.0, 'plin' => 0.0, 'tarjeta' => 0.0, 'transferencia' => 0.0];
    foreach ($ingresos_por_pago as $pago) {
        $metodoPago = strtolower(trim((string)($pago['metodo_pago'] ?? '')));
        if (array_key_exists($metodoPago, $totales_pago_metodo)) {
            $totales_pago_metodo[$metodoPago] += (float)($pago['total_pago'] ?? 0);
        }
    }
    $virtual_cobrado = $totales_pago_metodo['yape'] + $totales_pago_metodo['plin'] + $totales_pago_metodo['tarjeta'] + $totales_pago_metodo['transferencia'];
    $egresos_virtuales_clinica = (float)$egresos_por_metodo['yape'] + (float)$egresos_por_metodo['plin'] + (float)$egresos_por_metodo['tarjeta'] + (float)$egresos_por_metodo['transferencia'];
    $virtual_esperado = $virtual_cobrado - $egresos_virtuales_clinica;
    // Asegurar que la hora de apertura esté en la zona horaria de Lima
    $hora_apertura = null;
    if ($caja_row && isset($caja_row['hora_apertura'])) {
        $fecha_hora = $fecha . ' ' . $caja_row['hora_apertura'];
        $dt = new DateTime($fecha_hora, new DateTimeZone('America/Lima'));
        $hora_apertura = $dt->format('g:i A');
    }

    $cajas_resumen = array();
    $columnaCajaExiste = function (string $columna) use ($pdo) {
        static $cacheColumnas = [];
        if (array_key_exists($columna, $cacheColumnas)) {
            return $cacheColumnas[$columna];
        }
        try {
            $stmtCol = $pdo->prepare('SHOW COLUMNS FROM cajas LIKE ?');
            $stmtCol->execute([$columna]);
            $exists = (bool)$stmtCol->fetch(PDO::FETCH_ASSOC);
            $cacheColumnas[$columna] = $exists;
            return $exists;
        } catch (Throwable $e) {
            $cacheColumnas[$columna] = false;
            return false;
        }
    };

    $hasVirtualContadoCol = $columnaCajaExiste('virtual_contado');
    $hasDiferenciaVirtualCol = $columnaCajaExiste('diferencia_virtual');
    $hasCierreAutomaticoCol = $columnaCajaExiste('cierre_automatico');
    $hasCierrePendienteCuadreCol = $columnaCajaExiste('cierre_pendiente_cuadre');
    $selectVirtualContadoExpr = $hasVirtualContadoCol ? 'c.virtual_contado AS virtual_contado' : 'NULL AS virtual_contado';
    $selectDiferenciaVirtualExpr = $hasDiferenciaVirtualCol ? 'c.diferencia_virtual AS diferencia_virtual' : 'NULL AS diferencia_virtual';
    $selectCierreAutomaticoExpr = $hasCierreAutomaticoCol ? 'c.cierre_automatico AS cierre_automatico' : '0 AS cierre_automatico';
    $selectCierrePendienteCuadreExpr = $hasCierrePendienteCuadreCol ? 'c.cierre_pendiente_cuadre AS cierre_pendiente_cuadre' : '0 AS cierre_pendiente_cuadre';
    $groupVirtualContadoExpr = $hasVirtualContadoCol ? ', c.virtual_contado' : '';
    $groupDiferenciaVirtualExpr = $hasDiferenciaVirtualCol ? ', c.diferencia_virtual' : '';
    $groupCierreAutomaticoExpr = $hasCierreAutomaticoCol ? ', c.cierre_automatico' : '';
    $groupCierrePendienteCuadreExpr = $hasCierrePendienteCuadreCol ? ', c.cierre_pendiente_cuadre' : '';

    $normalizarControlRealCaja = function (&$caja) {
        $estadoCaja = strtolower(trim((string)($caja['estado'] ?? '')));
        $montoContado = (isset($caja['monto_contado']) && $caja['monto_contado'] !== null && $caja['monto_contado'] !== '')
            ? (float)$caja['monto_contado']
            : null;
        $diferenciaCaja = (isset($caja['diferencia']) && $caja['diferencia'] !== null && $caja['diferencia'] !== '')
            ? (float)$caja['diferencia']
            : null;
        $virtualContadoCaja = (isset($caja['virtual_contado']) && $caja['virtual_contado'] !== null && $caja['virtual_contado'] !== '')
            ? (float)$caja['virtual_contado']
            : null;
        $diferenciaVirtualCaja = (isset($caja['diferencia_virtual']) && $caja['diferencia_virtual'] !== null && $caja['diferencia_virtual'] !== '')
            ? (float)$caja['diferencia_virtual']
            : null;
        $cierreAutomatico = (int)($caja['cierre_automatico'] ?? 0) === 1;
        $cierrePendienteCuadre = (int)($caja['cierre_pendiente_cuadre'] ?? 0) === 1;

        $caja['monto_apertura'] = isset($caja['monto_apertura']) ? (float)$caja['monto_apertura'] : 0.0;
        $caja['monto_cierre'] = isset($caja['monto_cierre']) ? (float)$caja['monto_cierre'] : 0.0;
        $caja['monto_contado'] = $montoContado;
        $caja['diferencia'] = $diferenciaCaja;
        $caja['total_efectivo'] = isset($caja['total_efectivo']) ? (float)$caja['total_efectivo'] : 0.0;
        $caja['total_yape'] = isset($caja['total_yape']) ? (float)$caja['total_yape'] : 0.0;
        $caja['total_plin'] = isset($caja['total_plin']) ? (float)$caja['total_plin'] : 0.0;
        $caja['total_tarjetas'] = isset($caja['total_tarjetas']) ? (float)$caja['total_tarjetas'] : 0.0;
        $caja['total_transferencias'] = isset($caja['total_transferencias']) ? (float)$caja['total_transferencias'] : 0.0;
        $caja['egreso_electronico'] = isset($caja['egreso_electronico']) ? (float)$caja['egreso_electronico'] : 0.0;

        $virtualCobradoCierre =
            $caja['total_yape'] +
            $caja['total_plin'] +
            $caja['total_tarjetas'] +
            $caja['total_transferencias'];

        $caja['cierre_automatico'] = $cierreAutomatico ? 1 : 0;
        $caja['cierre_pendiente_cuadre'] = $cierrePendienteCuadre ? 1 : 0;

        if ($estadoCaja === 'cerrada') {
            $caja['control_real_disponible'] = $cierrePendienteCuadre ? 0 : 1;
            $caja['efectivo_esperado_cierre'] = ($montoContado !== null && $diferenciaCaja !== null)
                ? ($montoContado - $diferenciaCaja)
                : null;
            $caja['virtual_cobrado_cierre'] = $virtualCobradoCierre;
            $caja['virtual_contado_cierre'] = $virtualContadoCaja;
            $caja['diferencia_virtual_cierre'] = $diferenciaVirtualCaja;
            $caja['cuadre_efectivo_ok'] = (!$cierrePendienteCuadre && $diferenciaCaja !== null && abs($diferenciaCaja) < 0.01) ? 1 : 0;
            $caja['cuadre_virtual_ok'] = (!$cierrePendienteCuadre && $diferenciaVirtualCaja !== null && abs($diferenciaVirtualCaja) < 0.01) ? 1 : 0;
            $caja['cierre_estado_control'] = $cierrePendienteCuadre
                ? 'pendiente_cuadre'
                : ($cierreAutomatico ? 'autocierre_regularizado' : 'manual_regularizado');
        } else {
            $caja['control_real_disponible'] = 0;
            $caja['efectivo_esperado_cierre'] = null;
            $caja['virtual_cobrado_cierre'] = $virtualCobradoCierre;
            $caja['virtual_contado_cierre'] = $virtualContadoCaja;
            $caja['diferencia_virtual_cierre'] = $diferenciaVirtualCaja;
            $caja['cuadre_efectivo_ok'] = 0;
            $caja['cuadre_virtual_ok'] = 0;
            $caja['cierre_estado_control'] = 'abierta';
        }
    };
    // Solo el administrador ve el resumen de todas las cajas, las recepcionistas solo ven su propia caja
        if ($usuario['rol'] === 'administrador') {
        $stmt = $pdo->prepare('SELECT c.id, c.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol, c.turno, c.estado, c.monto_apertura, c.monto_cierre, c.monto_contado, c.diferencia, c.total_efectivo, c.total_yape, c.total_plin, c.total_tarjetas, c.total_transferencias, c.egreso_electronico, c.total_egresos, c.ganancia_dia, ' . $selectVirtualContadoExpr . ', ' . $selectDiferenciaVirtualExpr . ', ' . $selectCierreAutomaticoExpr . ', ' . $selectCierrePendienteCuadreExpr . ', SUM(i.monto) as total_caja FROM cajas c LEFT JOIN usuarios u ON c.usuario_id = u.id LEFT JOIN ingresos_diarios i ON i.caja_id = c.id WHERE c.fecha >= ? AND c.fecha < ? GROUP BY c.id, c.usuario_id, c.turno, c.estado, u.nombre, u.rol, c.monto_apertura, c.monto_cierre, c.monto_contado, c.diferencia, c.total_efectivo, c.total_yape, c.total_plin, c.total_tarjetas, c.total_transferencias, c.egreso_electronico, c.total_egresos, c.ganancia_dia' . $groupVirtualContadoExpr . $groupDiferenciaVirtualExpr . $groupCierreAutomaticoExpr . $groupCierrePendienteCuadreExpr . ' ORDER BY c.turno ASC, c.estado DESC');
        $stmt->execute([$inicioDia, $finDia]);
        $cajas_resumen = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Para cada caja, calcular egresos y ganancia propios
        foreach ($cajas_resumen as &$caja) {
            // Egreso honorarios médicos por caja
            $stmtEgreso = $pdo->prepare('SELECT SUM(monto) as egreso_honorarios FROM egresos WHERE caja_id = ? AND tipo_egreso = "honorario_medico"');
            $stmtEgreso->execute([$caja['id']]);
            $egresoCaja = $stmtEgreso->fetchColumn();
            $caja['egreso_honorarios'] = $egresoCaja ? floatval($egresoCaja) : 0.0;
            // Egreso laboratorio de referencia por caja
            $stmtLabRef = $pdo->prepare('SELECT SUM(monto) as egreso_lab_ref FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
            $stmtLabRef->execute([$caja['id']]);
            $egresoLabRef = $stmtLabRef->fetchColumn();
            $caja['egreso_lab_ref'] = $egresoLabRef ? floatval($egresoLabRef) : 0.0;
            // Egreso operativo por caja
            $stmtOperativo = $pdo->prepare('SELECT SUM(monto) as egreso_operativo FROM egresos WHERE caja_id = ? AND tipo_egreso NOT IN ("honorario_medico", "laboratorio")');
            $stmtOperativo->execute([$caja['id']]);
            $egresoOperativo = $stmtOperativo->fetchColumn();
            $caja['egreso_operativo'] = $egresoOperativo ? floatval($egresoOperativo) : 0.0;
            // Ganancia por caja
            $caja['ganancia_dia'] = floatval($caja['total_caja']) - ($caja['egreso_honorarios'] + $caja['egreso_lab_ref'] + $caja['egreso_operativo']);
            // Ingresos por tipo de pago por caja
            $stmtPago = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
            $stmtPago->execute([$caja['id']]);
            $caja['por_pago'] = $stmtPago->fetchAll(PDO::FETCH_ASSOC);
            // Ingresos por tipo de servicio por caja
            $stmtServ = $pdo->prepare('SELECT tipo_ingreso, SUM(monto) as total_servicio FROM ingresos_diarios WHERE caja_id = ? GROUP BY tipo_ingreso');
            $stmtServ->execute([$caja['id']]);
            $caja['por_servicio'] = $stmtServ->fetchAll(PDO::FETCH_ASSOC);

            $normalizarControlRealCaja($caja);
        }
        unset($caja);
    } elseif ($usuario['rol'] === 'recepcionista') {
        // Solo mostrar la caja del usuario actual
        $stmt = $pdo->prepare('SELECT c.id, c.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol, c.turno, c.estado, c.monto_apertura, c.monto_cierre, c.monto_contado, c.diferencia, c.total_efectivo, c.total_yape, c.total_plin, c.total_tarjetas, c.total_transferencias, c.egreso_electronico, c.total_egresos, c.ganancia_dia, ' . $selectVirtualContadoExpr . ', ' . $selectDiferenciaVirtualExpr . ', ' . $selectCierreAutomaticoExpr . ', ' . $selectCierrePendienteCuadreExpr . ', SUM(i.monto) as total_caja FROM cajas c LEFT JOIN usuarios u ON c.usuario_id = u.id LEFT JOIN ingresos_diarios i ON i.caja_id = c.id WHERE c.fecha >= ? AND c.fecha < ? AND c.usuario_id = ? GROUP BY c.id, c.usuario_id, c.turno, c.estado, u.nombre, u.rol, c.monto_apertura, c.monto_cierre, c.monto_contado, c.diferencia, c.total_efectivo, c.total_yape, c.total_plin, c.total_tarjetas, c.total_transferencias, c.egreso_electronico, c.total_egresos, c.ganancia_dia' . $groupVirtualContadoExpr . $groupDiferenciaVirtualExpr . $groupCierreAutomaticoExpr . $groupCierrePendienteCuadreExpr . ' ORDER BY c.turno ASC, c.estado DESC');
        $stmt->execute([$inicioDia, $finDia, $usuario['id']]);
        $cajas_resumen = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cajas_resumen as &$caja) {
            $stmtEgreso = $pdo->prepare('SELECT SUM(monto) as egreso_honorarios FROM egresos WHERE caja_id = ? AND tipo_egreso = "honorario_medico"');
            $stmtEgreso->execute([$caja['id']]);
            $egresoCaja = $stmtEgreso->fetchColumn();
            $caja['egreso_honorarios'] = $egresoCaja ? floatval($egresoCaja) : 0.0;
            $stmtLabRef = $pdo->prepare('SELECT SUM(monto) as egreso_lab_ref FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
            $stmtLabRef->execute([$caja['id']]);
            $egresoLabRef = $stmtLabRef->fetchColumn();
            $caja['egreso_lab_ref'] = $egresoLabRef ? floatval($egresoLabRef) : 0.0;
            $stmtOperativo = $pdo->prepare('SELECT SUM(monto) as egreso_operativo FROM egresos WHERE caja_id = ? AND tipo_egreso NOT IN ("honorario_medico", "laboratorio")');
            $stmtOperativo->execute([$caja['id']]);
            $egresoOperativo = $stmtOperativo->fetchColumn();
            $caja['egreso_operativo'] = $egresoOperativo ? floatval($egresoOperativo) : 0.0;
            $caja['ganancia_dia'] = floatval($caja['total_caja']) - ($caja['egreso_honorarios'] + $caja['egreso_lab_ref'] + $caja['egreso_operativo']);

            $normalizarControlRealCaja($caja);
        }
        unset($caja);
    }
  $ganancia_dia = floatval($total) - ($egreso_honorarios + $egreso_lab_ref + $egreso_operativo);

    echo json_encode(array(
        'success' => true,
        'fecha' => $fecha,
        'hora_apertura' => $hora_apertura,
        'total' => floatval($total),
        'monto_apertura' => floatval($monto_apertura),
        'por_servicio' => $ingresos_por_servicio,
        'por_area' => $ingresos_por_area,
        'por_pago' => $ingresos_por_pago,
        'egresos_por_metodo' => $egresos_por_metodo,
        'egresos_externos' => $egresos_externos,
        'virtual_cobrado' => $virtual_cobrado,
        'egresos_virtuales_clinica' => $egresos_virtuales_clinica,
        'virtual_esperado' => $virtual_esperado,
        'total_contratos_abono' => $total_contratos_abono,
        'egreso_honorarios' => $egreso_honorarios,
        'egreso_lab_ref' => $egreso_lab_ref,
        'egreso_operativo' => $egreso_operativo,
        'ganancia_dia' => $ganancia_dia,
        'cajas_resumen' => $cajas_resumen,
        'caja_abierta' => $caja_abierta
    ));
} catch (Throwable $e) {
    if (function_exists('api_log_server_error')) {
        api_log_server_error('api-resumen-diario', $e->getMessage(), $e->getFile(), (int)$e->getLine());
    } else {
        error_log('Error en api_resumen_diario.php: ' . $e->getMessage());
    }

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor',
        'request_id' => function_exists('api_request_id') ? api_request_id() : null,
    ]);
    exit();
}