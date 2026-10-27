<?php
require_once __DIR__ . '/init_api.php';
if (!defined('SKIP_PDO_INIT')) {
    define('SKIP_PDO_INIT', true);
}
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/AgendaMedicoRegla.php';
require_once __DIR__ . '/modules/EpisodioAtencionModule.php';

if (!function_exists('hdisp_table_exists')) {
    function hdisp_table_exists(mysqli $conn, string $table): bool {
        static $cache = [];
        if (isset($cache[$table])) {
            return $cache[$table];
        }
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1');
        if (!$stmt) {
            $cache[$table] = false;
            return false;
        }
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $res = $stmt->get_result();
        $ok = (bool)($res && $res->num_rows > 0);
        $stmt->close();
        $cache[$table] = $ok;
        return $ok;
    }
}

if (!function_exists('hdisp_column_exists')) {
    function hdisp_column_exists(mysqli $conn, string $table, string $column): bool {
        static $cache = [];
        $key = $table . '::' . $column;
        if (isset($cache[$key])) {
            return $cache[$key];
        }
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1');
        if (!$stmt) {
            $cache[$key] = false;
            return false;
        }
        $stmt->bind_param('ss', $table, $column);
        $stmt->execute();
        $res = $stmt->get_result();
        $ok = (bool)($res && $res->num_rows > 0);
        $stmt->close();
        $cache[$key] = $ok;
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

if (!function_exists('hdisp_normalize_slot_minutes')) {
    function hdisp_normalize_slot_minutes($value): int {
        $slot = (int)$value;
        if ($slot <= 0) $slot = 30;
        if ($slot < 5) $slot = 5;
        if ($slot > 120) $slot = 120;
        return $slot;
    }
}

if (!function_exists('hdisp_hora_a_minutos')) {
    function hdisp_hora_a_minutos(string $hora): ?int {
        $norm = hdisp_normalize_hora_hms($hora);
        if ($norm === null) return null;
        $partes = explode(':', $norm);
        if (count($partes) < 2) return null;
        $h = (int)$partes[0];
        $m = (int)$partes[1];
        if ($h < 0 || $h > 23 || $m < 0 || $m > 59) return null;
        return ($h * 60) + $m;
    }
}

if (!function_exists('hdisp_get_slot_minutes')) {
    function hdisp_get_slot_minutes(mysqli $conn): int {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }

        $cached = 30;
        if (!hdisp_table_exists($conn, 'configuracion_clinica')
            || !hdisp_column_exists($conn, 'configuracion_clinica', 'duracion_slot_min')) {
            return $cached;
        }

        $stmt = $conn->prepare('SELECT duracion_slot_min FROM configuracion_clinica ORDER BY id DESC LIMIT 1');
        if (!$stmt) {
            return $cached;
        }

        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $cached = hdisp_normalize_slot_minutes($row['duracion_slot_min'] ?? 30);
        return $cached;
    }
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
    $fecha = isset($_GET['fecha']) ? $_GET['fecha'] : null;
    $consulta_id_excluir = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : 0;
    $cotizacion_id_excluir = isset($_GET['cotizacion_id_excluir']) ? intval($_GET['cotizacion_id_excluir']) : 0;
    
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
        $cotizacionesExcluirIds = [];
        if ($cotizacion_id_excluir > 0) {
            $cotizacionesExcluirIds = episodio_cotizaciones_cadena_ids($conn, $cotizacion_id_excluir) ?: [$cotizacion_id_excluir];
            $cotizacionesExcluirIds = array_values(array_unique(array_filter(array_map('intval', (array)$cotizacionesExcluirIds), function ($id) {
                return $id > 0;
            })));
        }
        $hasConsultasCotizacion = hdisp_table_exists($conn, 'consultas')
            && hdisp_column_exists($conn, 'consultas', 'cotizacion_id');
        $sqlConsultas = '
                SELECT hora FROM consultas 
                WHERE medico_id = ? AND fecha = ? AND ' . agenda_sql_consulta_ocupa_medico('') . '
            ';
        $typesCons = 'is';
        $paramsCons = [$medico_id, $fecha];
        if ($consulta_id_excluir > 0) {
            $sqlConsultas .= ' AND id <> ?';
            $typesCons .= 'i';
            $paramsCons[] = $consulta_id_excluir;
        }
        if (!empty($cotizacionesExcluirIds) && $hasConsultasCotizacion) {
            $phCot = implode(',', array_fill(0, count($cotizacionesExcluirIds), '?'));
            $sqlConsultas .= ' AND COALESCE(cotizacion_id, 0) NOT IN (' . $phCot . ')';
            $typesCons .= str_repeat('i', count($cotizacionesExcluirIds));
            $paramsCons = array_merge($paramsCons, $cotizacionesExcluirIds);
        }
        $stmt_consultas = $conn->prepare($sqlConsultas);
        if ($stmt_consultas) {
            $stmt_consultas->bind_param($typesCons, ...$paramsCons);
            $stmt_consultas->execute();
            $res_consultas = $stmt_consultas->get_result();
            while ($consulta = $res_consultas->fetch_assoc()) {
                $horaNorm = hdisp_normalize_hora_hms($consulta['hora'] ?? null);
                if ($horaNorm !== null) {
                    $horariosOcupadosSet[$horaNorm] = true;
                }
            }
            $stmt_consultas->close();
        }

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
            $hasDetalleCotizacionId = $hasDetalle && hdisp_column_exists($conn, 'cotizaciones_detalle', 'cotizacion_id');

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
                ? ' AND ' . agenda_sql_evento_ocupa_medico('a')
                : '';

            // Solo los servicios que realiza el médico ocupan su horario (no laboratorio ni líneas de paquete).
            $whereServicio = hdisp_column_exists($conn, 'agenda_servicios_cotizacion', 'servicio_tipo')
                ? ' AND ' . agenda_sql_servicio_ocupa_medico('a')
                : '';

            $sqlAgenda = 'SELECT a.hora_programada FROM agenda_servicios_cotizacion a'
                . $joinDetalle
                . $joinTarifa
                . ' WHERE ' . $medicoExpr . ' = ? AND a.fecha_programada = ?'
                . $whereEstado
                . $whereServicio;
            $canExcludeAgendaCotizacion = ($cotizacion_id_excluir > 0 && hdisp_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id'));
            $canExcludeDetalleCotizacion = ($cotizacion_id_excluir > 0 && $hasDetalleCotizacionId && $joinDetalle !== '');
            // Se excluye todo el episodio (cotización base y adendas): sus servicios comparten hora con la consulta.
            $cotizacionesExcluirSql = implode(',', array_map('intval', !empty($cotizacionesExcluirIds) ? $cotizacionesExcluirIds : [$cotizacion_id_excluir]));
            if ($canExcludeAgendaCotizacion || $canExcludeDetalleCotizacion) {
                $sqlAgenda .= ' AND (';
                $conds = [];
                if ($canExcludeAgendaCotizacion) {
                    $conds[] = 'COALESCE(a.cotizacion_id, 0) NOT IN (' . $cotizacionesExcluirSql . ')';
                }
                if ($canExcludeDetalleCotizacion) {
                    $conds[] = 'COALESCE(cd.cotizacion_id, 0) NOT IN (' . $cotizacionesExcluirSql . ')';
                }
                $sqlAgenda .= implode(' AND ', $conds) . ')';
            }

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
        $slotMinutes = hdisp_get_slot_minutes($conn);
        $ocupadosMinutos = [];
        foreach ($horariosOcupados as $horaOcupada) {
            $min = hdisp_hora_a_minutos((string)$horaOcupada);
            if ($min !== null) {
                $ocupadosMinutos[] = $min;
            }
        }

        while ($row = $res->fetch_assoc()) {
            
            // Generar horarios con la duración base configurada.
            list($h_inicio, $m_inicio) = explode(':', $row['hora_inicio']);
            list($h_fin, $m_fin) = explode(':', $row['hora_fin']);
            
            $h = (int)$h_inicio;
            $m = (int)$m_inicio;
            $h_fin = (int)$h_fin;
            $m_fin = (int)$m_fin;
            
            while ($h < $h_fin || ($h == $h_fin && $m < $m_fin)) {
                $horaStr = sprintf("%02d:%02d:00", $h, $m); // Formato completo con segundos
                
                // Bloquear por solape real de intervalos (misma regla del modal de reprogramación).
                $inicioSlot = ($h * 60) + $m;
                $finSlot = min(24 * 60, $inicioSlot + $slotMinutes);
                $solapa = false;
                foreach ($ocupadosMinutos as $inicioOcupado) {
                    if ($inicioOcupado < $finSlot && ($inicioOcupado + $slotMinutes) > $inicioSlot) {
                        $solapa = true;
                        break;
                    }
                }

                if (!$solapa) {
                    $horariosDisponibles[] = [
                        'hora' => sprintf("%02d:%02d", $h, $m), // Para mostrar en frontend sin segundos
                        'hora_db' => $horaStr, // Para comparar con BD
                        'medico_id' => $row['medico_id'],
                        'medico_nombre' => $row['medico_nombre'],
                        'especialidad' => $row['especialidad'],
                        'fecha' => $row['fecha']
                    ];
                }
                
                $m += $slotMinutes;
                if ($m >= 60) {
                    $h += (int)floor($m / 60);
                    $m = $m % 60;
                }
            }
        }
        
        $stmt->close();
        
        echo json_encode([
            'success' => true, 
            'horarios_disponibles' => $horariosDisponibles,
            'horarios_ocupados' => $horariosOcupados,
            'total' => count($horariosDisponibles),
            'duracion_slot_min' => $slotMinutes,
            'consulta_excluida' => $consulta_id_excluir > 0 ? $consulta_id_excluir : null,
            'cotizacion_excluida' => $cotizacion_id_excluir > 0 ? $cotizacion_id_excluir : null,
        ]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
?>
