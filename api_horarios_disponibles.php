<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if (!function_exists('hdisp_table_exists')) {
    function hdisp_table_exists(mysqli $conn, string $table): bool {
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1');
        if (!$stmt) return false;
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $res = $stmt->get_result();
        $ok = (bool)($res && $res->num_rows > 0);
        $stmt->close();
        return $ok;
    }
}

if (!function_exists('hdisp_column_exists')) {
    function hdisp_column_exists(mysqli $conn, string $table, string $column): bool {
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1');
        if (!$stmt) return false;
        $stmt->bind_param('ss', $table, $column);
        $stmt->execute();
        $res = $stmt->get_result();
        $ok = (bool)($res && $res->num_rows > 0);
        $stmt->close();
        return $ok;
    }
}

if (!function_exists('hdisp_normalize_hora_hms')) {
    function hdisp_normalize_hora_hms($value): ?string {
        $raw = trim((string)$value);
        if ($raw === '') return null;
        if (preg_match('/^(\d{2}):(\d{2})(:\d{2})?$/', $raw, $m)) {
            return sprintf('%02d:%02d:00', (int)$m[1], (int)$m[2]);
        }
        $ts = strtotime($raw);
        if ($ts === false) return null;
        return date('H:i:00', $ts);
    }
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
    $fecha = isset($_GET['fecha']) ? $_GET['fecha'] : null;
    $consulta_id_excluir = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : 0;
    
    if (!$medico_id || !$fecha) {
        echo json_encode(['success' => false, 'error' => 'Se requiere medico_id y fecha']);
        exit();
    }
    
    try {
        // Obtener disponibilidad del médico para la fecha
        $stmt = $conn->prepare('
            SELECT dm.*, CONCAT(m.nombre, " ", COALESCE(m.apellido, "")) as medico_nombre, m.especialidad 
            FROM disponibilidad_medicos dm 
            INNER JOIN medicos m ON dm.medico_id = m.id
            WHERE dm.medico_id = ? AND dm.fecha = ?
            ORDER BY dm.hora_inicio
        ');
        $stmt->bind_param('is', $medico_id, $fecha);
        $stmt->execute();
        $res = $stmt->get_result();
        
        $horariosDisponibles = [];
        
        $horariosOcupadosSet = [];
        if ($consulta_id_excluir > 0) {
            $stmt_consultas = $conn->prepare('
                SELECT hora FROM consultas 
                WHERE medico_id = ? AND fecha = ? AND estado NOT IN ("cancelada", "completada") AND id <> ?
            ');
            $stmt_consultas->bind_param('isi', $medico_id, $fecha, $consulta_id_excluir);
        } else {
            $stmt_consultas = $conn->prepare('
                SELECT hora FROM consultas 
                WHERE medico_id = ? AND fecha = ? AND estado NOT IN ("cancelada", "completada")
            ');
            $stmt_consultas->bind_param('is', $medico_id, $fecha);
        }

        $stmt_consultas->execute();
        $res_consultas = $stmt_consultas->get_result();
        while ($consulta = $res_consultas->fetch_assoc()) {
            $horaNorm = hdisp_normalize_hora_hms($consulta['hora'] ?? null);
            if ($horaNorm !== null) {
                $horariosOcupadosSet[$horaNorm] = true;
            }
        }
        $stmt_consultas->close();

        // Unificar ocupados de agenda de servicios para que la disponibilidad
        // refleje la misma verdad operativa usada en Recordatorios.
        if (hdisp_table_exists($conn, 'agenda_servicios_cotizacion')
            && hdisp_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && hdisp_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada')) {

            $hasAgendaEstado = hdisp_column_exists($conn, 'agenda_servicios_cotizacion', 'estado_evento');
            $hasAgendaMedico = hdisp_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id');
            $hasAgendaDetalle = hdisp_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id');
            $hasAgendaServicio = hdisp_column_exists($conn, 'agenda_servicios_cotizacion', 'servicio_id');

            $hasDetalle = hdisp_table_exists($conn, 'cotizaciones_detalle');
            $hasDetalleId = $hasDetalle && hdisp_column_exists($conn, 'cotizaciones_detalle', 'id');
            $hasDetalleMed = $hasDetalle && hdisp_column_exists($conn, 'cotizaciones_detalle', 'medico_id');
            $hasDetalleServ = $hasDetalle && hdisp_column_exists($conn, 'cotizaciones_detalle', 'servicio_id');

            $hasTarifas = hdisp_table_exists($conn, 'tarifas');
            $hasTarifaId = $hasTarifas && hdisp_column_exists($conn, 'tarifas', 'id');
            $hasTarifaMed = $hasTarifas && hdisp_column_exists($conn, 'tarifas', 'medico_id');

            $joinDetalle = ($hasAgendaDetalle && $hasDetalle && $hasDetalleId)
                ? ' LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id'
                : '';
            $joinTarifa = ($hasTarifas && $hasTarifaId)
                ? ' LEFT JOIN tarifas t ON t.id = COALESCE('
                    . ($hasDetalleServ ? 'cd.servicio_id, ' : '')
                    . ($hasAgendaServicio ? 'a.servicio_id' : '0')
                    . ')'
                : '';

            $medicoParts = [];
            if ($hasAgendaMedico) $medicoParts[] = 'a.medico_id';
            if ($hasDetalleMed) $medicoParts[] = 'cd.medico_id';
            if ($hasTarifaMed) $medicoParts[] = 't.medico_id';
            $medicoExpr = empty($medicoParts) ? '0' : ('COALESCE(' . implode(', ', $medicoParts) . ', 0)');

            $whereEstado = $hasAgendaEstado
                ? ' AND LOWER(TRIM(COALESCE(a.estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada", "completado")'
                : '';

            $sqlAgenda = 'SELECT a.hora_programada FROM agenda_servicios_cotizacion a'
                . $joinDetalle
                . $joinTarifa
                . ' WHERE ' . $medicoExpr . ' = ? AND a.fecha_programada = ?'
                . $whereEstado;

            $stmtAgenda = $conn->prepare($sqlAgenda);
            if ($stmtAgenda) {
                $stmtAgenda->bind_param('is', $medico_id, $fecha);
                $stmtAgenda->execute();
                $resAgenda = $stmtAgenda->get_result();
                while ($ag = $resAgenda->fetch_assoc()) {
                    $horaNorm = hdisp_normalize_hora_hms($ag['hora_programada'] ?? null);
                    if ($horaNorm !== null) {
                        $horariosOcupadosSet[$horaNorm] = true;
                    }
                }
                $stmtAgenda->close();
            }
        }

        $horariosOcupados = array_keys($horariosOcupadosSet);
        sort($horariosOcupados);

        while ($row = $res->fetch_assoc()) {
            
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
                if (!isset($horariosOcupadosSet[$horaStr])) {
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
            'horarios_ocupados' => $horariosOcupados,
            'total' => count($horariosDisponibles),
            'consulta_excluida' => $consulta_id_excluir > 0 ? $consulta_id_excluir : null,
        ]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
?>
