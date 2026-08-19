<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';

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

    $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
    $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';
    $usuarioIdFiltro = isset($_GET['usuario_id']) ? (int)$_GET['usuario_id'] : 0;
    $turnoFiltro = isset($_GET['turno']) ? trim((string)$_GET['turno']) : '';
    $limite = isset($_GET['limite']) ? max(1, min(5000, (int)$_GET['limite'])) : 300;

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
        $columnaSeguro('egreso_honorarios'),
        $columnaSeguro('egreso_lab_ref'),
        $columnaSeguro('egreso_operativo'),
        $columnaSeguro('total_egresos'),
        $columnaSeguro('ganancia_dia'),
        $columnaSeguro('monto_contado'),
    ];

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
        WHERE c.estado = 'cerrada'
          AND c.fecha >= ?
          AND c.fecha <= ?";

    $params = [$fechaDesde, $fechaHasta];
    if ($usuarioIdFiltro > 0) {
        $sql .= " AND c.usuario_id = ?";
        $params[] = $usuarioIdFiltro;
    }
    if ($turnoFiltro !== '') {
        $sql .= " AND c.turno = ?";
        $params[] = $turnoFiltro;
    }
    $sql .= " ORDER BY c.fecha DESC, c.hora_cierre DESC LIMIT ?";
    $params[] = $limite;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $cajas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $sqlResumen = "SELECT
        c.fecha,
        COUNT(*) AS total_cajas,
        COALESCE(SUM(c.monto_cierre), 0) AS monto_cierre,
        COALESCE(SUM(c.diferencia), 0) AS diferencia,
        COALESCE(SUM(" . (isset($columnasCajas['total_efectivo']) ? "c.total_efectivo" : "0") . "), 0) AS total_efectivo,
        COALESCE(SUM(" . (isset($columnasCajas['total_yape']) ? "c.total_yape" : "0") . "), 0) AS total_yape,
        COALESCE(SUM(" . (isset($columnasCajas['total_plin']) ? "c.total_plin" : "0") . "), 0) AS total_plin,
        COALESCE(SUM(" . (isset($columnasCajas['total_tarjetas']) ? "c.total_tarjetas" : "0") . "), 0) AS total_tarjetas,
        COALESCE(SUM(" . (isset($columnasCajas['total_transferencias']) ? "c.total_transferencias" : "0") . "), 0) AS total_transferencias,
        COALESCE(SUM(" . (isset($columnasCajas['total_egresos']) ? "c.total_egresos" : "0") . "), 0) AS total_egresos,
        COALESCE(SUM(" . (isset($columnasCajas['ganancia_dia']) ? "c.ganancia_dia" : "0") . "), 0) AS ganancia_dia
        FROM cajas c
        WHERE c.estado = 'cerrada'
          AND c.fecha >= ?
          AND c.fecha <= ?";

    $paramsResumen = [$fechaDesde, $fechaHasta];
    if ($usuarioIdFiltro > 0) {
        $sqlResumen .= " AND c.usuario_id = ?";
        $paramsResumen[] = $usuarioIdFiltro;
    }
    if ($turnoFiltro !== '') {
        $sqlResumen .= " AND c.turno = ?";
        $paramsResumen[] = $turnoFiltro;
    }
    $sqlResumen .= " GROUP BY c.fecha ORDER BY c.fecha DESC";

    $stmtResumen = $pdo->prepare($sqlResumen);
    $stmtResumen->execute($paramsResumen);
    $resumenDiario = $stmtResumen->fetchAll(PDO::FETCH_ASSOC);

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
            'limite' => $limite,
        ],
        'usuarios_disponibles' => $usuariosDisponibles,
        'turnos_disponibles' => $turnosDisponibles,
        'resumen_diario' => $resumenDiario,
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