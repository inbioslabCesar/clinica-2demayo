<?php
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

// Manejar preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

session_start();

require_once 'config.php';

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    // Obtener parámetros
    $fecha = $_GET['fecha'] ?? date('Y-m-d');
    $tipo_ingreso = $_GET['tipo'] ?? null;
    $metodo_pago = $_GET['metodo'] ?? null;
    $limite = min(intval($_GET['limite'] ?? 50), 100); // Máximo 100 registros
    $offset = intval($_GET['offset'] ?? 0);

    // Base de la consulta
    $sql = "SELECT i.*, u.nombre as usuario_nombre, c.fecha as fecha_caja
            FROM ingresos_diarios i
            INNER JOIN cajas c ON i.caja_id = c.id
            INNER JOIN usuarios u ON i.usuario_registro = u.id
            WHERE DATE(i.fecha_registro) = ?";
    
    $params = [$fecha];
    
    // Filtros adicionales
    if ($tipo_ingreso) {
        $sql .= " AND i.tipo_ingreso = ?";
        $params[] = $tipo_ingreso;
    }
    
    if ($metodo_pago) {
        $sql .= " AND i.metodo_pago = ?";
        $params[] = $metodo_pago;
    }
    
    // Ordenar por fecha descendente
    $sql .= " ORDER BY i.fecha_registro DESC LIMIT ? OFFSET ?";
    $params[] = $limite;
    $params[] = $offset;
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $ingresos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Contar total de registros para paginación
    $sqlCount = "SELECT COUNT(*) as total
                 FROM ingresos_diarios i
                 INNER JOIN cajas c ON i.caja_id = c.id
                 WHERE DATE(i.fecha_registro) = ?";
    
    $paramsCount = [$fecha];
    
    if ($tipo_ingreso) {
        $sqlCount .= " AND i.tipo_ingreso = ?";
        $paramsCount[] = $tipo_ingreso;
    }
    
    if ($metodo_pago) {
        $sqlCount .= " AND i.metodo_pago = ?";
        $paramsCount[] = $metodo_pago;
    }
    
    $stmtCount = $pdo->prepare($sqlCount);
    $stmtCount->execute($paramsCount);
    $totalRegistros = $stmtCount->fetch(PDO::FETCH_ASSOC)['total'];

    // Obtener estadísticas generales del día
    $sqlStats = "SELECT 
                    COUNT(*) as total_transacciones,
                    SUM(monto) as total_ingresos,
                    COUNT(DISTINCT tipo_ingreso) as tipos_diferentes,
                    COUNT(DISTINCT metodo_pago) as metodos_diferentes
                 FROM ingresos_diarios i
                 INNER JOIN cajas c ON i.caja_id = c.id
                 WHERE DATE(i.fecha_registro) = ?";
    
    $stmtStats = $pdo->prepare($sqlStats);
    $stmtStats->execute([$fecha]);
    $estadisticas = $stmtStats->fetch(PDO::FETCH_ASSOC);

    // Obtener resumen por tipo de ingreso
    $sqlTipos = "SELECT 
                    tipo_ingreso,
                    COUNT(*) as cantidad,
                    SUM(monto) as total
                 FROM ingresos_diarios i
                 INNER JOIN cajas c ON i.caja_id = c.id
                 WHERE DATE(i.fecha_registro) = ?
                 GROUP BY tipo_ingreso
                 ORDER BY total DESC";
    
    $stmtTipos = $pdo->prepare($sqlTipos);
    $stmtTipos->execute([$fecha]);
    $resumenTipos = $stmtTipos->fetchAll(PDO::FETCH_ASSOC);

    // Obtener resumen por método de pago
    $sqlMetodos = "SELECT 
                      metodo_pago,
                      COUNT(*) as cantidad,
                      SUM(monto) as total
                   FROM ingresos_diarios i
                   INNER JOIN cajas c ON i.caja_id = c.id
                   WHERE DATE(i.fecha_registro) = ?
                   GROUP BY metodo_pago
                   ORDER BY total DESC";
    
    $stmtMetodos = $pdo->prepare($sqlMetodos);
    $stmtMetodos->execute([$fecha]);
    $resumenMetodos = $stmtMetodos->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'ingresos' => $ingresos,
        'paginacion' => [
            'total' => intval($totalRegistros),
            'limite' => $limite,
            'offset' => $offset,
            'pagina_actual' => floor($offset / $limite) + 1,
            'total_paginas' => ceil($totalRegistros / $limite)
        ],
        'estadisticas' => [
            'total_transacciones' => intval($estadisticas['total_transacciones']),
            'total_ingresos' => floatval($estadisticas['total_ingresos']),
            'tipos_diferentes' => intval($estadisticas['tipos_diferentes']),
            'metodos_diferentes' => intval($estadisticas['metodos_diferentes'])
        ],
        'resumen_tipos' => $resumenTipos,
        'resumen_metodos' => $resumenMetodos
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