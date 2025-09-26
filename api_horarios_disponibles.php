<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
]);
session_start();

// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
    $fecha = isset($_GET['fecha']) ? $_GET['fecha'] : null;
    
    if (!$medico_id || !$fecha) {
        echo json_encode(['success' => false, 'error' => 'Se requiere medico_id y fecha']);
        exit();
    }
    
    try {
        // Obtener disponibilidad del médico para la fecha
        $stmt = $conn->prepare('
            SELECT dm.*, m.nombre as medico_nombre, m.especialidad 
            FROM disponibilidad_medicos dm 
            INNER JOIN medicos m ON dm.medico_id = m.id
            WHERE dm.medico_id = ? AND dm.fecha = ?
            ORDER BY dm.hora_inicio
        ');
        $stmt->bind_param('is', $medico_id, $fecha);
        $stmt->execute();
        $res = $stmt->get_result();
        
        $horariosDisponibles = [];
        
        while ($row = $res->fetch_assoc()) {
            // Obtener consultas ya agendadas para este médico en esta fecha
            $stmt_consultas = $conn->prepare('
                SELECT hora FROM consultas 
                WHERE medico_id = ? AND fecha = ? AND estado NOT IN ("cancelada", "completada")
            ');
            $stmt_consultas->bind_param('is', $medico_id, $fecha);
            $stmt_consultas->execute();
            $res_consultas = $stmt_consultas->get_result();
            
            $horariosOcupados = [];
            while ($consulta = $res_consultas->fetch_assoc()) {
                $horariosOcupados[] = $consulta['hora'];
            }
            $stmt_consultas->close();
            
            // Generar horarios de 30 en 30 minutos
            list($h_inicio, $m_inicio) = explode(':', $row['hora_inicio']);
            list($h_fin, $m_fin) = explode(':', $row['hora_fin']);
            
            $h = (int)$h_inicio;
            $m = (int)$m_inicio;
            $h_fin = (int)$h_fin;
            $m_fin = (int)$m_fin;
            
            while ($h < $h_fin || ($h == $h_fin && $m < $m_fin)) {
                $horaStr = sprintf("%02d:%02d:00", $h, $m); // Formato completo con segundos
                
                // Solo agregar si no está ocupado
                if (!in_array($horaStr, $horariosOcupados)) {
                    $horariosDisponibles[] = [
                        'hora' => sprintf("%02d:%02d", $h, $m), // Para mostrar en frontend sin segundos
                        'hora_db' => $horaStr, // Para comparar con BD
                        'medico_id' => $row['medico_id'],
                        'medico_nombre' => $row['medico_nombre'],
                        'especialidad' => $row['especialidad'],
                        'fecha' => $row['fecha']
                    ];
                }
                
                // Incrementar 30 minutos
                $m += 30;
                if ($m >= 60) {
                    $h++;
                    $m = 0;
                }
            }
        }
        
        $stmt->close();
        
        echo json_encode([
            'success' => true, 
            'horarios_disponibles' => $horariosDisponibles,
            'total' => count($horariosDisponibles)
        ]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
?>