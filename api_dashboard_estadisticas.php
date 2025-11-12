
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['usuario']) || !in_array($_SESSION['usuario']['rol'], ['administrador', 'recepcionista'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

try {

    // Rango de fechas para el mes actual
    $inicioMes = date('Y-m-01');
    $inicioMesSiguiente = date('Y-m-01', strtotime('+1 month'));
    $hoy = date('Y-m-d');
    $inicioTrimestre = date('Y-m-01', strtotime('-2 month'));
    $inicioAnio = date('Y-01-01');

    // Resumen diario, mensual, trimestral y anual usando ganancia_dia con rangos
    $sqlResumen = "SELECT 
        SUM(CASE WHEN fecha = :hoy THEN ganancia_dia ELSE 0 END) AS gananciaDia,
        SUM(CASE WHEN fecha >= :inicioMes AND fecha < :inicioMesSiguiente THEN ganancia_dia ELSE 0 END) AS gananciaMes,
        SUM(CASE WHEN fecha >= :inicioTrimestre AND fecha < :inicioMesSiguiente THEN ganancia_dia ELSE 0 END) AS gananciaTrimestre,
        SUM(CASE WHEN fecha >= :inicioAnio AND fecha < :inicioMesSiguiente THEN ganancia_dia ELSE 0 END) AS gananciaAnio
    FROM cajas WHERE estado = 'cerrada';";
    $stmtResumen = $pdo->prepare($sqlResumen);
    $stmtResumen->execute([
        ':hoy' => $hoy,
        ':inicioMes' => $inicioMes,
        ':inicioMesSiguiente' => $inicioMesSiguiente,
        ':inicioTrimestre' => $inicioTrimestre,
        ':inicioAnio' => $inicioAnio
    ]);
    $res = $stmtResumen->fetch(PDO::FETCH_ASSOC);

    // Calcular crecimiento mensual (%) comparando con el mes anterior usando rangos
    $inicioMesPrev = date('Y-m-01', strtotime('-1 month'));
    $inicioMesActual = $inicioMes;
    $sqlPrevMonth = "SELECT SUM(ganancia_dia) AS gananciaMesPrev
        FROM cajas
        WHERE estado = 'cerrada' AND fecha >= :inicioMesPrev AND fecha < :inicioMesActual";
    $stmtPrevMonth = $pdo->prepare($sqlPrevMonth);
    $stmtPrevMonth->execute([
        ':inicioMesPrev' => $inicioMesPrev,
        ':inicioMesActual' => $inicioMesActual
    ]);
    $resPrev = $stmtPrevMonth->fetch(PDO::FETCH_ASSOC);
    $gananciaMes = floatval($res['gananciaMes'] ?? 0);
    $gananciaPrev = floatval($resPrev['gananciaMesPrev'] ?? 0);
    if ($gananciaPrev > 0) {
        $crecimiento = (($gananciaMes - $gananciaPrev) / $gananciaPrev) * 100;
    } else {
        $crecimiento = null;
    }

    // Pacientes atendidos en el mes actual usando rangos
    $pacientesMes = 0;
    try {
        $stmtPacientesMes = $pdo->prepare("SELECT COUNT(DISTINCT paciente_id) as total FROM atenciones WHERE fecha >= :inicioMes AND fecha < :inicioMesSiguiente");
        $stmtPacientesMes->execute([
            ':inicioMes' => $inicioMes,
            ':inicioMesSiguiente' => $inicioMesSiguiente
        ]);
        $rowPacientesMes = $stmtPacientesMes->fetch();
        $pacientesMes = $rowPacientesMes ? intval($rowPacientesMes['total']) : 0;
    } catch (PDOException $e) {
        // Si no existe la tabla atenciones, intentar con consultas
        try {
            $stmtPacientesMes = $pdo->prepare("SELECT COUNT(DISTINCT paciente_id) as total FROM consultas WHERE fecha >= :inicioMes AND fecha < :inicioMesSiguiente");
            $stmtPacientesMes->execute([
                ':inicioMes' => $inicioMes,
                ':inicioMesSiguiente' => $inicioMesSiguiente
            ]);
            $rowPacientesMes = $stmtPacientesMes->fetch();
            $pacientesMes = $rowPacientesMes ? intval($rowPacientesMes['total']) : 0;
        } catch (PDOException $e2) {
            $pacientesMes = 0;
        }
    }

        // Ganancia por usuario por día (solo recepcionista y administrador)
        $sqlGananciaUsuarios = "SELECT 
            DATE(fecha) as fecha,
            u.id as usuario_id,
            u.nombre as usuario_nombre,
            u.rol,
            SUM(c.ganancia_dia) as ganancia
        FROM cajas c
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.estado = 'cerrada' AND u.rol IN ('administrador','recepcionista')
        GROUP BY DATE(fecha), u.id, u.nombre, u.rol
        ORDER BY fecha DESC, ganancia DESC";
        $gananciaUsuarios = $pdo->query($sqlGananciaUsuarios)->fetchAll(PDO::FETCH_ASSOC);

    // Ranking de usuarios (admin y recepcionistas) usando ganancia_dia
    $sqlRanking = "SELECT u.nombre, u.rol, SUM(c.ganancia_dia) AS ingresos
        FROM cajas c
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.estado = 'cerrada' AND u.rol IN ('administrador','recepcionista')
          AND MONTH(c.fecha) = MONTH(CURDATE()) AND YEAR(c.fecha) = YEAR(CURDATE())
        GROUP BY c.usuario_id, u.nombre, u.rol
        ORDER BY ingresos DESC";
    $ranking = $pdo->query($sqlRanking)->fetchAll(PDO::FETCH_ASSOC);

    // Servicios más vendidos usando el campo descripcion (JSON) de cobros_detalle
    $sqlServicios = "SELECT 
        cd.servicio_tipo, 
        cd.servicio_id, 
        cd.descripcion,
        cd.cantidad, 
        cd.subtotal
    FROM cobros_detalle cd
    INNER JOIN cobros c ON cd.cobro_id = c.id
    WHERE MONTH(c.fecha_cobro) = MONTH(CURDATE()) AND YEAR(c.fecha_cobro) = YEAR(CURDATE()) AND c.estado = 'pagado'";
    $serviciosRaw = $pdo->query($sqlServicios)->fetchAll(PDO::FETCH_ASSOC);

    // Agrupar por nombre y tipo, sumando cantidad y monto
    $serviciosAgrupados = [];
    foreach ($serviciosRaw as $s) {
        $desc = json_decode($s['descripcion'], true);
        if (is_array($desc) && isset($desc[0]['descripcion'])) {
            $nombre_servicio = $desc[0]['descripcion'];
        } else if (is_array($desc) && isset($desc['descripcion'])) {
            $nombre_servicio = $desc['descripcion'];
        } else {
            $nombre_servicio = null;
        }
        $key = $s['servicio_tipo'] . '|' . $nombre_servicio;
        if (!isset($serviciosAgrupados[$key])) {
            $serviciosAgrupados[$key] = [
                'tipo_servicio' => $s['servicio_tipo'],
                'servicio_id' => $s['servicio_id'],
                'nombre_servicio' => $nombre_servicio,
                'cantidad_total' => 0,
                'monto_total' => 0
            ];
        }
        $serviciosAgrupados[$key]['cantidad_total'] += floatval($s['cantidad']);
        $serviciosAgrupados[$key]['monto_total'] += floatval($s['subtotal']);
    }
    // Convertir a array y ordenar por monto_total DESC, cantidad_total DESC
    $servicios = array_values($serviciosAgrupados);
    usort($servicios, function($a, $b) {
        if ($a['monto_total'] == $b['monto_total']) {
            return $b['cantidad_total'] <=> $a['cantidad_total'];
        }
        return $b['monto_total'] <=> $a['monto_total'];
    });

    // Tendencias de ingresos (por día del mes) usando ganancia_dia (ganancia neta)
    $sqlTendencias = "SELECT DATE(fecha) as fecha, SUM(ganancia_dia) as total
        FROM cajas
        WHERE estado = 'cerrada' AND MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())
        GROUP BY DATE(fecha)
        ORDER BY fecha ASC";
    $tendencias = $pdo->query($sqlTendencias)->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'resumen' => [
            'gananciaDia' => floatval($res['gananciaDia'] ?? 0),
            'gananciaMes' => floatval($res['gananciaMes'] ?? 0),
            'gananciaTrimestre' => floatval($res['gananciaTrimestre'] ?? 0),
            'gananciaAnio' => floatval($res['gananciaAnio'] ?? 0),
            'pacientes' => $pacientesMes,
            'gananciaUsuarios' => $gananciaUsuarios,
            'crecimiento' => is_null($crecimiento) ? null : round($crecimiento, 2)
        ],
        'ranking' => $ranking,
        'servicios' => $servicios,
        'tendencias' => $tendencias
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
