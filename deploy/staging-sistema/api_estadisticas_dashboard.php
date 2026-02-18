<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php'; 

try {
    // Obtener total de pacientes registrados
    $stmt_total_pacientes = $pdo->query("SELECT COUNT(*) as total FROM pacientes");
    $total_pacientes = $stmt_total_pacientes->fetch()['total'];

    // Obtener pacientes atendidos hoy (si existe tabla atenciones)
    $pacientes_hoy = 0;
    try {
        $stmt_pacientes_hoy = $pdo->query("SELECT COUNT(DISTINCT paciente_id) as total FROM atenciones WHERE DATE(fecha) = CURDATE()");
        $result = $stmt_pacientes_hoy->fetch();
        $pacientes_hoy = $result ? $result['total'] : 0;
    } catch (PDOException $e) {
        // Si no existe la tabla atenciones, mantener en 0
        $pacientes_hoy = 0;
    }

    // Obtener consultas médicas hoy (si existe tabla consultas)
    $consultas_hoy = 0;
    try {
        $stmt_consultas_hoy = $pdo->query("SELECT COUNT(*) as total FROM consultas WHERE DATE(fecha) = CURDATE()");
        $result = $stmt_consultas_hoy->fetch();
        $consultas_hoy = $result ? $result['total'] : 0;
    } catch (PDOException $e) {
        // Si no existe la tabla consultas, mantener en 0
        $consultas_hoy = 0;
    }

    // Si no hay datos de consultas, intentar contar desde historia_clinica de hoy
    if ($consultas_hoy == 0) {
        try {
            $stmt_hc_hoy = $pdo->query("SELECT COUNT(*) as total FROM historia_clinica WHERE DATE(fecha) = CURDATE()");
            $result = $stmt_hc_hoy->fetch();
            $consultas_hoy = $result ? $result['total'] : 0;
        } catch (PDOException $e) {
            $consultas_hoy = 0;
        }
    }

    echo json_encode([
        'success' => true,
        'estadisticas' => [
            'total_pacientes' => intval($total_pacientes),
            'pacientes_hoy' => intval($pacientes_hoy),
            'consultas_hoy' => intval($consultas_hoy)
        ]
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'error' => 'Error al obtener estadísticas: ' . $e->getMessage()
    ]);
}
?>