<?php
// Reevaluación: continuación de la MISMA atención (ventana máxima de 7 días desde su registro).
// No es una "Próxima cita": no crea consulta ni HC nueva en la Fase 1; vive en hc_reevaluaciones.
// Todas las funciones toleran que las tablas aún no existan (el código puede desplegarse antes que el SQL).

if (!defined('REV_VENTANA_MAX_DIAS')) {
    define('REV_VENTANA_MAX_DIAS', 7);
}

require_once __DIR__ . '/AgendaMedicoRegla.php';

if (!class_exists('RevError')) {
    // El código de la excepción es el HTTP status a responder.
    class RevError extends RuntimeException {}
}

if (!function_exists('rev_estados_abiertos')) {
    function rev_estados_abiertos(): array {
        return ['pendiente', 'en_espera', 'en_revision'];
    }
}

if (!function_exists('rev_estados_gestion')) {
    function rev_estados_gestion(): array {
        return ['pendiente', 'contactado', 'confirmado', 'no_contesta', 'reprogramar'];
    }
}

if (!function_exists('rev_tipos_motivo')) {
    function rev_tipos_motivo(): array {
        return ['resultados', 'tratamiento', 'otro'];
    }
}

if (!function_exists('rev_tabla_existe')) {
    function rev_tabla_existe($conn, string $tabla): bool {
        static $cache = [];
        if (array_key_exists($tabla, $cache)) {
            return $cache[$tabla];
        }
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
        if (!$stmt) {
            return $cache[$tabla] = false;
        }
        $stmt->bind_param('s', $tabla);
        $stmt->execute();
        $res = $stmt->get_result();
        $existe = $res && $res->num_rows > 0;
        $stmt->close();
        return $cache[$tabla] = $existe;
    }
}

if (!function_exists('rev_disponible')) {
    function rev_disponible($conn): bool {
        return rev_tabla_existe($conn, 'hc_reevaluaciones') && rev_tabla_existe($conn, 'hc_reevaluaciones_eventos');
    }
}

if (!function_exists('rev_actor')) {
    function rev_actor(): array {
        $u = (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) ? $_SESSION['usuario'] : null;
        $rol = $u ? strtolower(trim((string)($u['rol'] ?? ''))) : '';
        $medicoId = 0;

        if ($rol === 'medico' || ($u === null && isset($_SESSION['medico_id']))) {
            $rol = 'medico';
            $medicoId = (int)($_SESSION['medico_id'] ?? ($u['medico_id'] ?? ($u['id'] ?? 0)));
        }

        $nombre = $u ? trim(trim((string)($u['nombre'] ?? '')) . ' ' . trim((string)($u['apellido'] ?? ''))) : '';
        if ($nombre === '' && $u) {
            $nombre = trim((string)($u['usuario'] ?? ''));
        }

        return [
            'rol' => $rol,
            'usuario_id' => $u ? (int)($u['id'] ?? 0) : 0,
            'medico_id' => $medicoId,
            'nombre' => $nombre !== '' ? $nombre : ($rol !== '' ? $rol : 'usuario'),
            'ip' => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
        ];
    }
}

if (!function_exists('rev_registrar_evento')) {
    function rev_registrar_evento($conn, int $reevaluacionId, string $accion, ?string $estadoAnterior, ?string $estadoNuevo, array $detalle = [], ?array $actor = null): void {
        $actor = $actor ?? rev_actor();
        $json = !empty($detalle) ? json_encode($detalle, JSON_UNESCAPED_UNICODE) : null;
        $usuarioId = (int)($actor['usuario_id'] ?? 0) > 0 ? (int)$actor['usuario_id'] : null;
        $rol = mb_substr((string)($actor['rol'] ?? ''), 0, 40);
        $nombre = mb_substr((string)($actor['nombre'] ?? ''), 0, 120);
        $ip = mb_substr((string)($actor['ip'] ?? ''), 0, 45);

        $stmt = $conn->prepare(
            'INSERT INTO hc_reevaluaciones_eventos
                (reevaluacion_id, accion, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_rol, usuario_nombre, ip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('issssisss', $reevaluacionId, $accion, $estadoAnterior, $estadoNuevo, $json, $usuarioId, $rol, $nombre, $ip);
        $stmt->execute();
        $stmt->close();
    }
}

if (!function_exists('rev_normalizar_hora')) {
    /** Devuelve HH:MM:SS o null si está vacía o es inválida. */
    function rev_normalizar_hora($valor): ?string {
        $raw = trim((string)$valor);
        if ($raw === '' || !preg_match('/^(\d{1,2}):(\d{2})(:\d{2})?$/', $raw, $m)) {
            return null;
        }
        $h = (int)$m[1];
        $min = (int)$m[2];
        if ($h > 23 || $min > 59) {
            return null;
        }
        return sprintf('%02d:%02d:00', $h, $min);
    }
}

if (!function_exists('rev_formatear')) {
    function rev_formatear(array $r): array {
        $estado = (string)($r['estado'] ?? '');
        $fecha = (string)($r['fecha_sugerida'] ?? '');
        $hora = !empty($r['hora_sugerida']) ? substr((string)$r['hora_sugerida'], 0, 5) : '';
        return [
            'id' => (int)($r['id'] ?? 0),
            'consulta_origen_id' => (int)($r['consulta_origen_id'] ?? 0),
            'hc_id' => (int)($r['hc_id'] ?? 0),
            'paciente_id' => (int)($r['paciente_id'] ?? 0),
            'medico_id' => (int)($r['medico_id'] ?? 0),
            'reevaluacion_previa_id' => isset($r['reevaluacion_previa_id']) ? (int)$r['reevaluacion_previa_id'] : null,
            'fecha_sugerida' => $fecha,
            'hora_sugerida' => $hora,
            'sin_hora_fija' => (int)($r['sin_hora_fija'] ?? 0),
            'fecha_limite' => (string)($r['fecha_limite'] ?? ''),
            'tipo_motivo' => (string)($r['tipo_motivo'] ?? 'resultados'),
            'motivo' => (string)($r['motivo'] ?? ''),
            'estado' => $estado,
            'abierta' => (int)($r['abierta'] ?? 0) === 1 ? 1 : 0,
            'es_control' => (int)($r['es_control'] ?? 1),
            'consulta_visita_id' => isset($r['consulta_visita_id']) ? (int)$r['consulta_visita_id'] : null,
            'estado_gestion' => (string)($r['estado_gestion'] ?? 'pendiente'),
            'observacion_gestion' => (string)($r['observacion_gestion'] ?? ''),
            'intentos' => (int)($r['intentos'] ?? 0),
            'fecha_proximo_contacto' => $r['fecha_proximo_contacto'] ?? null,
            'fecha_ultimo_contacto' => $r['fecha_ultimo_contacto'] ?? null,
            'motivo_cierre' => (string)($r['motivo_cierre'] ?? ''),
            'created_at' => (string)($r['created_at'] ?? ''),
            'updated_at' => (string)($r['updated_at'] ?? ''),
            'editable' => $estado === 'pendiente' ? 1 : 0,
            'atrasada' => ($estado === 'pendiente' && $fecha !== '' && $fecha < date('Y-m-d')) ? 1 : 0,
        ];
    }
}

if (!function_exists('rev_obtener')) {
    function rev_obtener($conn, int $id, bool $paraActualizar = false): ?array {
        $stmt = $conn->prepare('SELECT * FROM hc_reevaluaciones WHERE id = ? LIMIT 1' . ($paraActualizar ? ' FOR UPDATE' : ''));
        if (!$stmt) {
            return null;
        }
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }
}

if (!function_exists('rev_fila_abierta')) {
    function rev_fila_abierta($conn, int $consultaId, bool $paraActualizar = false): ?array {
        $stmt = $conn->prepare('SELECT * FROM hc_reevaluaciones WHERE consulta_origen_id = ? AND abierta = 1 LIMIT 1' . ($paraActualizar ? ' FOR UPDATE' : ''));
        if (!$stmt) {
            return null;
        }
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }
}

if (!function_exists('rev_obtener_para_hc')) {
    /** La abierta de la consulta, o la última registrada (para mostrar su estado en la HC). */
    function rev_obtener_para_hc($conn, int $consultaId): ?array {
        if ($consultaId <= 0 || !rev_disponible($conn)) {
            return null;
        }
        rev_vencer_abiertas($conn);
        $row = rev_fila_abierta($conn, $consultaId);
        if (!$row) {
            $stmt = $conn->prepare('SELECT * FROM hc_reevaluaciones WHERE consulta_origen_id = ? ORDER BY id DESC LIMIT 1');
            if ($stmt) {
                $stmt->bind_param('i', $consultaId);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc() ?: null;
                $stmt->close();
            }
        }
        return $row ? rev_formatear($row) : null;
    }
}

if (!function_exists('rev_vencer_abiertas')) {
    /** Las pendientes cuya ventana terminó pasan a 'vencida' (una vez por request). */
    function rev_vencer_abiertas($conn): void {
        static $hecho = false;
        if ($hecho || !rev_disponible($conn)) {
            return;
        }
        $hecho = true;

        $hoy = date('Y-m-d');
        $stmt = $conn->prepare("SELECT id FROM hc_reevaluaciones WHERE estado = 'pendiente' AND abierta = 1 AND fecha_limite < ? LIMIT 200");
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('s', $hoy);
        $stmt->execute();
        $res = $stmt->get_result();
        $ids = [];
        while ($r = $res->fetch_assoc()) {
            $ids[] = (int)$r['id'];
        }
        $stmt->close();

        $sistema = ['rol' => 'sistema', 'usuario_id' => 0, 'nombre' => 'sistema', 'ip' => ''];
        foreach ($ids as $id) {
            $upd = $conn->prepare("UPDATE hc_reevaluaciones SET estado = 'vencida', abierta = NULL, cierre_en = NOW(), motivo_cierre = 'Venció la ventana de reevaluación' WHERE id = ? AND estado = 'pendiente'");
            if (!$upd) {
                continue;
            }
            $upd->bind_param('i', $id);
            $upd->execute();
            $cambio = $upd->affected_rows > 0;
            $upd->close();
            if ($cambio) {
                rev_registrar_evento($conn, $id, 'vencida', 'pendiente', 'vencida', [], $sistema);
            }
        }
    }
}

if (!function_exists('rev_validar_agenda')) {
    /**
     * Valida fecha/hora/motivo. $actual es la fila existente (para no rechazar una hora que ya pasó si no cambió).
     * $baseYmd inicia la ventana de 7 días; $limiteFijo la conserva al reprogramar.
     */
    function rev_validar_agenda(array $in, string $baseYmd, ?array $actual = null, ?string $limiteFijo = null): array {
        $hoy = date('Y-m-d');
        $fecha = trim((string)($in['fecha'] ?? ''));
        $dt = DateTime::createFromFormat('Y-m-d', $fecha);
        if (!$dt || $dt->format('Y-m-d') !== $fecha) {
            throw new RevError('La reevaluación requiere una fecha válida.', 400);
        }

        $limite = $limiteFijo ?: date('Y-m-d', strtotime($baseYmd . ' +' . REV_VENTANA_MAX_DIAS . ' days'));
        if ($fecha > $limite) {
            throw new RevError(
                'La reevaluación admite hasta ' . REV_VENTANA_MAX_DIAS . ' días desde su registro (hasta ' . $limite . '). Para un plazo mayor use Próxima cita.',
                400
            );
        }

        $horaRaw = trim((string)($in['hora'] ?? ''));
        $hora = rev_normalizar_hora($horaRaw);
        if ($horaRaw !== '' && $hora === null) {
            throw new RevError('La hora de la reevaluación no es válida.', 400);
        }

        $sinHoraFija = !empty($in['sin_hora_fija']) || $hora === null;
        if ($sinHoraFija) {
            $hora = null;
        }

        $horaActual = ($actual && !empty($actual['hora_sugerida'])) ? substr((string)$actual['hora_sugerida'], 0, 5) . ':00' : null;
        $cambio = !$actual
            || $fecha !== (string)($actual['fecha_sugerida'] ?? '')
            || $hora !== $horaActual;

        if ($cambio) {
            if ($fecha < $hoy) {
                throw new RevError('La fecha de reevaluación no puede ser anterior a hoy.', 400);
            }
            if ($hora !== null && $fecha === $hoy && $hora < date('H:i:s')) {
                throw new RevError('La hora indicada para hoy ya pasó.', 400);
            }
        }

        $tipo = strtolower(trim((string)($in['tipo_motivo'] ?? 'resultados')));
        if (!in_array($tipo, rev_tipos_motivo(), true)) {
            $tipo = 'resultados';
        }
        $motivo = trim((string)($in['motivo'] ?? ''));
        $motivo = $motivo !== '' ? mb_substr($motivo, 0, 255) : null;

        return [
            'fecha' => $fecha,
            'hora' => $hora,
            'sin_hora_fija' => $sinHoraFija ? 1 : 0,
            'tipo_motivo' => $tipo,
            'motivo' => $motivo,
            'fecha_limite' => $limite,
            'cambio_agenda' => $cambio,
        ];
    }
}

if (!function_exists('rev_columna_existe')) {
    function rev_columna_existe($conn, string $tabla, string $columna): bool {
        static $cache = [];
        $k = $tabla . '.' . $columna;
        if (array_key_exists($k, $cache)) {
            return $cache[$k];
        }
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
        if (!$stmt) {
            return $cache[$k] = false;
        }
        $stmt->bind_param('ss', $tabla, $columna);
        $stmt->execute();
        $res = $stmt->get_result();
        $existe = $res && $res->num_rows > 0;
        $stmt->close();
        return $cache[$k] = $existe;
    }
}

if (!function_exists('rev_hora_a_minutos')) {
    function rev_hora_a_minutos($hora): ?int {
        if (!preg_match('/^(\d{1,2}):(\d{2})/', trim((string)$hora), $m)) {
            return null;
        }
        return ((int)$m[1] * 60) + (int)$m[2];
    }
}

if (!function_exists('rev_duracion_turno_min')) {
    /** Duración de un turno (misma configuración que usa la agenda para calcular solapes). */
    function rev_duracion_turno_min($conn): int {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }
        $cache = 30;
        if (rev_tabla_existe($conn, 'configuracion_clinica') && rev_columna_existe($conn, 'configuracion_clinica', 'duracion_slot_min')) {
            $res = $conn->query('SELECT duracion_slot_min FROM configuracion_clinica ORDER BY id DESC LIMIT 1');
            $row = $res ? $res->fetch_assoc() : null;
            $v = (int)($row['duracion_slot_min'] ?? 30);
            $cache = max(5, min(120, $v > 0 ? $v : 30));
        }
        return $cache;
    }
}

if (!function_exists('rev_solapa')) {
    /** Dos turnos de `$duracion` minutos que empiezan en $a y $b se pisan si distan menos que la duración. */
    function rev_solapa(?int $a, ?int $b, int $duracion): bool {
        return $a !== null && $b !== null && abs($a - $b) < max(1, $duracion);
    }
}

if (!function_exists('rev_conflicto_reevaluacion')) {
    /**
     * Reevaluación pendiente con hora fija que ocupa ese turno del médico, o null.
     * $excluirOrigenId ignora la reevaluación de esa consulta; $excluirId, la de ese id.
     * Las "sin hora fija" nunca bloquean.
     */
    function rev_conflicto_reevaluacion($conn, int $medicoId, string $fecha, $hora, int $excluirOrigenId = 0, int $excluirId = 0): ?array {
        $min = rev_hora_a_minutos($hora);
        if ($min === null || $medicoId <= 0 || !rev_disponible($conn)) {
            return null;
        }
        $stmt = $conn->prepare(
            "SELECT r.id, r.consulta_origen_id, r.hora_sugerida, TRIM(CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, ''))) AS paciente
             FROM hc_reevaluaciones r
             LEFT JOIN pacientes p ON p.id = r.paciente_id
             WHERE r.medico_id = ? AND r.fecha_sugerida = ? AND r.estado = 'pendiente'
               AND r.sin_hora_fija = 0 AND r.hora_sugerida IS NOT NULL AND r.consulta_visita_id IS NULL
               AND r.consulta_origen_id <> ? AND r.id <> ?
             ORDER BY r.hora_sugerida ASC"
        );
        if (!$stmt) {
            return null;
        }
        $stmt->bind_param('isii', $medicoId, $fecha, $excluirOrigenId, $excluirId);
        $stmt->execute();
        $res = $stmt->get_result();
        $duracion = rev_duracion_turno_min($conn);
        $hallado = null;
        while ($row = $res->fetch_assoc()) {
            if (rev_solapa($min, rev_hora_a_minutos($row['hora_sugerida']), $duracion)) {
                $hallado = [
                    'id' => (int)$row['id'],
                    'consulta_origen_id' => (int)$row['consulta_origen_id'],
                    'hora' => substr((string)$row['hora_sugerida'], 0, 5),
                    'paciente' => trim((string)$row['paciente']),
                ];
                break;
            }
        }
        $stmt->close();
        return $hallado;
    }
}

if (!function_exists('rev_mensaje_conflicto')) {
    function rev_mensaje_conflicto(array $c, string $sufijo = 'Elija otra hora.'): string {
        $quien = $c['paciente'] !== '' ? ' de ' . $c['paciente'] : '';
        return 'El médico tiene una reevaluación' . $quien . ' a las ' . $c['hora'] . '. ' . $sufijo;
    }
}

if (!function_exists('rev_cupos_ocupados_en_bloque')) {
    /** Reevaluaciones con hora fija dentro del bloque [ini, fin): cada una consume un cupo. */
    function rev_cupos_ocupados_en_bloque($conn, int $medicoId, string $fecha, string $horaIni, string $horaFin, int $excluirOrigenId = 0): int {
        $ini = rev_hora_a_minutos($horaIni);
        $fin = rev_hora_a_minutos($horaFin);
        if ($ini === null || $fin === null) {
            return 0;
        }
        $n = 0;
        foreach (rev_horas_ocupadas($conn, $medicoId, $fecha, $excluirOrigenId) as $o) {
            $m = rev_hora_a_minutos($o['hora']);
            if ($m !== null && $m >= $ini && $m < $fin) {
                $n++;
            }
        }
        return $n;
    }
}

if (!function_exists('rev_conflicto_agenda_externa')) {
    /**
     * Consulta o servicio de agenda del médico que ocupa ese turno, o null.
     * Es el sentido inverso de las validaciones de agenda: una reevaluación no puede pisar una cita ya tomada.
     * $excluirConsultaId es la consulta de origen (aún en curso al validar la HC).
     */
    function rev_conflicto_agenda_externa($conn, int $medicoId, string $fecha, $hora, int $excluirConsultaId = 0): ?array {
        $min = rev_hora_a_minutos($hora);
        if ($min === null || $medicoId <= 0) {
            return null;
        }
        $duracion = rev_duracion_turno_min($conn);

        if (rev_tabla_existe($conn, 'consultas')) {
            $stmt = $conn->prepare(
                'SELECT c.id, c.hora, TRIM(CONCAT(COALESCE(p.nombre, ""), " ", COALESCE(p.apellido, ""))) AS paciente
                 FROM consultas c LEFT JOIN pacientes p ON p.id = c.paciente_id
                 WHERE c.medico_id = ? AND c.fecha = ? AND c.id <> ? AND ' . agenda_sql_consulta_ocupa_medico('c')
            );
            if ($stmt) {
                $stmt->bind_param('isi', $medicoId, $fecha, $excluirConsultaId);
                $stmt->execute();
                $res = $stmt->get_result();
                while ($row = $res->fetch_assoc()) {
                    if (rev_solapa($min, rev_hora_a_minutos($row['hora']), $duracion)) {
                        $stmt->close();
                        return ['tipo' => 'consulta', 'hora' => substr((string)$row['hora'], 0, 5), 'paciente' => trim((string)$row['paciente'])];
                    }
                }
                $stmt->close();
            }
        }

        if (rev_tabla_existe($conn, 'agenda_servicios_cotizacion')
            && rev_columna_existe($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && rev_columna_existe($conn, 'agenda_servicios_cotizacion', 'hora_programada')) {
            $partes = [];
            if (rev_columna_existe($conn, 'agenda_servicios_cotizacion', 'medico_id')) $partes[] = 'a.medico_id';
            $join = '';
            if (rev_tabla_existe($conn, 'cotizaciones_detalle') && rev_columna_existe($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id')) {
                $join .= ' LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id';
                if (rev_columna_existe($conn, 'cotizaciones_detalle', 'medico_id')) $partes[] = 'cd.medico_id';
            }
            $medicoExpr = empty($partes) ? '0' : ('COALESCE(' . implode(', ', $partes) . ', 0)');
            $filtros = '';
            if (rev_columna_existe($conn, 'agenda_servicios_cotizacion', 'estado_evento')) {
                $filtros .= ' AND ' . agenda_sql_evento_ocupa_medico('a');
            }
            if (rev_columna_existe($conn, 'agenda_servicios_cotizacion', 'servicio_tipo')) {
                $filtros .= ' AND ' . agenda_sql_servicio_ocupa_medico('a');
            }
            $stmt = $conn->prepare(
                'SELECT a.hora_programada FROM agenda_servicios_cotizacion a' . $join
                . ' WHERE ' . $medicoExpr . ' = ? AND a.fecha_programada = ?' . $filtros
            );
            if ($stmt) {
                $stmt->bind_param('is', $medicoId, $fecha);
                $stmt->execute();
                $res = $stmt->get_result();
                while ($row = $res->fetch_assoc()) {
                    if (rev_solapa($min, rev_hora_a_minutos($row['hora_programada']), $duracion)) {
                        $stmt->close();
                        return ['tipo' => 'servicio', 'hora' => substr((string)$row['hora_programada'], 0, 5), 'paciente' => ''];
                    }
                }
                $stmt->close();
            }
        }
        return null;
    }
}

if (!function_exists('rev_asegurar_hora_libre')) {
    /** Lanza RevError(409) si el turno ya está ocupado por otra reevaluación, una consulta o un servicio. */
    function rev_asegurar_hora_libre($conn, int $medicoId, string $fecha, ?string $hora, int $excluirReevId = 0, int $excluirConsultaId = 0): void {
        if ($hora === null) {
            return;
        }
        $reev = rev_conflicto_reevaluacion($conn, $medicoId, $fecha, $hora, 0, $excluirReevId);
        if ($reev) {
            throw new RevError(rev_mensaje_conflicto($reev, 'Elija otra hora o marque "sin hora fija".'), 409);
        }
        $externo = rev_conflicto_agenda_externa($conn, $medicoId, $fecha, $hora, $excluirConsultaId);
        if ($externo) {
            $que = $externo['tipo'] === 'consulta' ? 'una consulta' : 'un servicio programado';
            $quien = $externo['paciente'] !== '' ? ' de ' . $externo['paciente'] : '';
            throw new RevError('El médico ya tiene ' . $que . $quien . ' a las ' . $externo['hora'] . '. Elija otra hora o marque "sin hora fija".', 409);
        }
    }
}

if (!function_exists('rev_obtener_consulta_base')) {
    function rev_obtener_consulta_base($conn, int $consultaId): array {
        $stmt = $conn->prepare('SELECT id, paciente_id, medico_id, fecha FROM consultas WHERE id = ? LIMIT 1');
        if (!$stmt) {
            throw new RevError('No se pudo validar la consulta.', 500);
        }
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            throw new RevError('No se encontró la consulta para registrar la reevaluación.', 404);
        }
        return $row;
    }
}

if (!function_exists('rev_pre_validar_hc')) {
    /** Valida antes de guardar la HC para fallar rápido sin escrituras parciales. */
    function rev_pre_validar_hc($conn, int $consultaId, array $in): void {
        if (!rev_disponible($conn)) {
            throw new RevError('La reevaluación aún no está habilitada en esta instalación (falta aplicar el esquema de BD).', 503);
        }
        $consulta = rev_obtener_consulta_base($conn, $consultaId);
        $abierta = rev_fila_abierta($conn, $consultaId);
        if ($abierta && (string)$abierta['estado'] !== 'pendiente') {
            return;
        }
        $base = $abierta ? substr((string)$abierta['created_at'], 0, 10) : date('Y-m-d');
        $n = rev_validar_agenda($in, $base, $abierta, $abierta ? (string)$abierta['fecha_limite'] : null);
        if ($n['cambio_agenda']) {
            rev_asegurar_hora_libre($conn, (int)$consulta['medico_id'], $n['fecha'], $n['hora'], $abierta ? (int)$abierta['id'] : 0, $consultaId);
        }
    }
}

if (!function_exists('rev_guardar_desde_hc')) {
    /** Crea o actualiza la reevaluación abierta de la consulta al guardar la HC. */
    function rev_guardar_desde_hc($conn, int $consultaId, int $hcId, array $in, ?array $actor = null): array {
        $actor = $actor ?? rev_actor();
        $consulta = rev_obtener_consulta_base($conn, $consultaId);
        $medicoId = (int)$consulta['medico_id'];
        $pacienteId = (int)$consulta['paciente_id'];

        $conn->begin_transaction();
        try {
            $abierta = rev_fila_abierta($conn, $consultaId, true);
            if ($abierta && (string)$abierta['estado'] !== 'pendiente') {
                $conn->rollback();
                return ['reevaluacion' => rev_formatear($abierta), 'accion' => 'bloqueada'];
            }

            $base = $abierta ? substr((string)$abierta['created_at'], 0, 10) : date('Y-m-d');
            $n = rev_validar_agenda($in, $base, $abierta, $abierta ? (string)$abierta['fecha_limite'] : null);
            if ($n['cambio_agenda']) {
                rev_asegurar_hora_libre($conn, $medicoId, $n['fecha'], $n['hora'], $abierta ? (int)$abierta['id'] : 0, $consultaId);
            }

            $usuarioId = (int)($actor['usuario_id'] ?? 0) > 0 ? (int)$actor['usuario_id'] : null;

            if ($abierta) {
                $id = (int)$abierta['id'];
                $motivoActual = (string)($abierta['motivo'] ?? '');
                $hayCambio = $n['cambio_agenda']
                    || (int)$abierta['sin_hora_fija'] !== $n['sin_hora_fija']
                    || (string)$abierta['tipo_motivo'] !== $n['tipo_motivo']
                    || $motivoActual !== (string)($n['motivo'] ?? '');

                if ($hayCambio) {
                    $stmt = $conn->prepare('UPDATE hc_reevaluaciones SET fecha_sugerida = ?, hora_sugerida = ?, sin_hora_fija = ?, tipo_motivo = ?, motivo = ?, hc_id = ?, actualizado_por = ? WHERE id = ?');
                    if (!$stmt) {
                        throw new RevError('No se pudo actualizar la reevaluación.', 500);
                    }
                    $stmt->bind_param('ssissiii', $n['fecha'], $n['hora'], $n['sin_hora_fija'], $n['tipo_motivo'], $n['motivo'], $hcId, $usuarioId, $id);
                    $stmt->execute();
                    $stmt->close();
                    rev_registrar_evento($conn, $id, 'actualizada', 'pendiente', 'pendiente', [
                        'antes' => ['fecha' => $abierta['fecha_sugerida'], 'hora' => $abierta['hora_sugerida']],
                        'despues' => ['fecha' => $n['fecha'], 'hora' => $n['hora']],
                        'origen' => 'historia_clinica',
                    ], $actor);
                }
                $accion = $hayCambio ? 'actualizada' : 'sin_cambios';
            } else {
                $previaId = null;
                $stmtPrev = $conn->prepare('SELECT id FROM hc_reevaluaciones WHERE consulta_origen_id = ? ORDER BY id DESC LIMIT 1');
                if ($stmtPrev) {
                    $stmtPrev->bind_param('i', $consultaId);
                    $stmtPrev->execute();
                    $prev = $stmtPrev->get_result()->fetch_assoc();
                    $stmtPrev->close();
                    $previaId = $prev ? (int)$prev['id'] : null;
                }

                $stmt = $conn->prepare(
                    'INSERT INTO hc_reevaluaciones
                        (consulta_origen_id, hc_id, paciente_id, medico_id, reevaluacion_previa_id, fecha_sugerida, hora_sugerida,
                         sin_hora_fija, fecha_limite, tipo_motivo, motivo, creado_por, actualizado_por)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                if (!$stmt) {
                    throw new RevError('No se pudo registrar la reevaluación.', 500);
                }
                $stmt->bind_param(
                    'iiiiississsii',
                    $consultaId, $hcId, $pacienteId, $medicoId, $previaId, $n['fecha'], $n['hora'],
                    $n['sin_hora_fija'], $n['fecha_limite'], $n['tipo_motivo'], $n['motivo'], $usuarioId, $usuarioId
                );
                try {
                    $ok = $stmt->execute();
                } catch (Throwable $e) {
                    $ok = false;
                }
                $errno = $stmt->errno;
                $id = $ok ? (int)$stmt->insert_id : 0;
                $stmt->close();
                if (!$ok || $id <= 0) {
                    throw new RevError(
                        $errno === 1062 ? 'Ya existe una reevaluación abierta para esta consulta.' : 'No se pudo registrar la reevaluación.',
                        $errno === 1062 ? 409 : 500
                    );
                }
                rev_registrar_evento($conn, $id, 'creada', null, 'pendiente', [
                    'fecha' => $n['fecha'],
                    'hora' => $n['hora'],
                    'motivo' => $n['motivo'],
                    'origen' => 'historia_clinica',
                ], $actor);
                $accion = 'creada';
            }

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            throw $e;
        }

        return ['reevaluacion' => rev_formatear(rev_obtener($conn, $id)), 'accion' => $accion];
    }
}

if (!function_exists('rev_cerrar')) {
    function rev_cerrar($conn, array $row, string $estadoNuevo, string $accion, string $motivo, array $actor): array {
        $id = (int)$row['id'];
        $estadoAnterior = (string)$row['estado'];
        $usuarioId = (int)($actor['usuario_id'] ?? 0) > 0 ? (int)$actor['usuario_id'] : null;
        $motivo = mb_substr($motivo, 0, 255);

        $stmt = $conn->prepare('UPDATE hc_reevaluaciones SET estado = ?, abierta = NULL, cierre_en = NOW(), motivo_cierre = ?, actualizado_por = ? WHERE id = ? AND estado = ?');
        if (!$stmt) {
            throw new RevError('No se pudo actualizar la reevaluación.', 500);
        }
        $stmt->bind_param('ssiis', $estadoNuevo, $motivo, $usuarioId, $id, $estadoAnterior);
        $stmt->execute();
        $cambio = $stmt->affected_rows > 0;
        $stmt->close();
        if (!$cambio) {
            throw new RevError('La reevaluación cambió de estado mientras se procesaba. Actualice la lista.', 409);
        }

        rev_registrar_evento($conn, $id, $accion, $estadoAnterior, $estadoNuevo, ['motivo' => $motivo], $actor);
        return rev_formatear(rev_obtener($conn, $id));
    }
}

if (!function_exists('rev_cancelar_desde_hc')) {
    /** El médico desmarca la reevaluación en la HC: solo se retira si sigue pendiente. */
    function rev_cancelar_desde_hc($conn, int $consultaId, ?array $actor = null): ?array {
        if (!rev_disponible($conn)) {
            return null;
        }
        $row = rev_fila_abierta($conn, $consultaId);
        if (!$row || (string)$row['estado'] !== 'pendiente') {
            return null;
        }
        return rev_cerrar($conn, $row, 'cancelada', 'cancelada', 'Retirada desde la historia clínica', $actor ?? rev_actor());
    }
}

if (!function_exists('rev_actor_puede')) {
    function rev_actor_puede(array $actor, array $row, string $accion): bool {
        $rol = (string)($actor['rol'] ?? '');
        if (in_array($rol, ['administrador', 'recepcionista'], true)) {
            return in_array($accion, ['gestion', 'reprogramar', 'cancelar', 'no_asistio'], true);
        }
        if ($rol === 'medico') {
            return in_array($accion, ['reprogramar', 'cancelar', 'no_asistio'], true)
                && (int)($actor['medico_id'] ?? 0) > 0
                && (int)$row['medico_id'] === (int)$actor['medico_id'];
        }
        return false;
    }
}

if (!function_exists('rev_aplicar_accion')) {
    function rev_aplicar_accion($conn, int $id, string $accion, array $p, array $actor): array {
        if (!rev_disponible($conn)) {
            throw new RevError('La reevaluación aún no está habilitada en esta instalación.', 503);
        }
        rev_vencer_abiertas($conn);

        $row = rev_obtener($conn, $id);
        if (!$row) {
            throw new RevError('Reevaluación no encontrada.', 404);
        }
        if (!rev_actor_puede($actor, $row, $accion)) {
            throw new RevError('No autorizado para esta acción.', 403);
        }
        if ((int)$row['abierta'] !== 1 || (string)$row['estado'] !== 'pendiente') {
            throw new RevError('Solo se puede modificar una reevaluación pendiente (estado actual: ' . $row['estado'] . ').', 409);
        }

        $usuarioId = (int)($actor['usuario_id'] ?? 0) > 0 ? (int)$actor['usuario_id'] : null;

        if ($accion === 'cancelar' || $accion === 'no_asistio') {
            $motivo = trim((string)($p['motivo'] ?? ''));
            if ($accion === 'cancelar' && mb_strlen($motivo) < 3) {
                throw new RevError('Indique el motivo de la cancelación.', 400);
            }
            if ($motivo === '') {
                $motivo = 'El paciente no asistió';
            }
            return rev_cerrar($conn, $row, $accion === 'cancelar' ? 'cancelada' : 'no_asistio', $accion, $motivo, $actor);
        }

        if ($accion === 'gestion') {
            $estadoGestion = strtolower(trim((string)($p['estado'] ?? '')));
            if (!in_array($estadoGestion, rev_estados_gestion(), true)) {
                throw new RevError('Estado de gestión no permitido.', 400);
            }
            $obs = mb_substr(trim((string)($p['observacion'] ?? '')), 0, 2000);
            $proximo = null;
            $proximoRaw = trim((string)($p['fecha_proximo_contacto'] ?? ''));
            if ($proximoRaw !== '' && ($ts = strtotime($proximoRaw)) !== false) {
                $proximo = date('Y-m-d H:i:s', $ts);
            }
            $suma = in_array($estadoGestion, ['contactado', 'confirmado', 'no_contesta', 'reprogramar'], true) ? 1 : 0;

            $stmt = $conn->prepare('UPDATE hc_reevaluaciones SET estado_gestion = ?, observacion_gestion = ?, fecha_proximo_contacto = ?, fecha_ultimo_contacto = NOW(), intentos = intentos + ?, actualizado_por = ? WHERE id = ?');
            if (!$stmt) {
                throw new RevError('No se pudo guardar la gestión.', 500);
            }
            $stmt->bind_param('sssiii', $estadoGestion, $obs, $proximo, $suma, $usuarioId, $id);
            $stmt->execute();
            $stmt->close();
            rev_registrar_evento($conn, $id, 'gestion', 'pendiente', 'pendiente', ['estado_gestion' => $estadoGestion, 'observacion' => $obs], $actor);
            return rev_formatear(rev_obtener($conn, $id));
        }

        if ($accion === 'reprogramar') {
            $n = rev_validar_agenda($p, substr((string)$row['created_at'], 0, 10), $row, (string)$row['fecha_limite']);
            if ($n['cambio_agenda']) {
                rev_asegurar_hora_libre($conn, (int)$row['medico_id'], $n['fecha'], $n['hora'], $id, (int)$row['consulta_origen_id']);
            }
            if (!$n['cambio_agenda'] && (int)$row['sin_hora_fija'] === $n['sin_hora_fija']) {
                return rev_formatear($row);
            }

            $stmt = $conn->prepare('UPDATE hc_reevaluaciones SET fecha_sugerida = ?, hora_sugerida = ?, sin_hora_fija = ?, actualizado_por = ? WHERE id = ? AND estado = \'pendiente\'');
            if (!$stmt) {
                throw new RevError('No se pudo reprogramar la reevaluación.', 500);
            }
            $stmt->bind_param('ssiii', $n['fecha'], $n['hora'], $n['sin_hora_fija'], $usuarioId, $id);
            $stmt->execute();
            $stmt->close();
            rev_registrar_evento($conn, $id, 'reprogramada', 'pendiente', 'pendiente', [
                'antes' => ['fecha' => $row['fecha_sugerida'], 'hora' => $row['hora_sugerida']],
                'despues' => ['fecha' => $n['fecha'], 'hora' => $n['hora']],
            ], $actor);
            return rev_formatear(rev_obtener($conn, $id));
        }

        throw new RevError('Acción no soportada.', 400);
    }
}

if (!function_exists('rev_listar')) {
    /**
     * Filtros: medico_id, paciente_id, consulta_origen_id, abiertas (bool), estado_gestion, busqueda, page, per_page.
     * Devuelve ['items' => filas con datos de paciente/médico, 'total' => int].
     */
    function rev_listar($conn, array $f): array {
        if (!rev_disponible($conn)) {
            return ['items' => [], 'total' => 0];
        }
        rev_vencer_abiertas($conn);

        $where = [];
        $types = '';
        $params = [];

        if (!empty($f['abiertas'])) {
            $where[] = 'r.abierta = 1';
        }
        if (!empty($f['medico_id'])) {
            $where[] = 'r.medico_id = ?';
            $types .= 'i';
            $params[] = (int)$f['medico_id'];
        }
        if (!empty($f['paciente_id'])) {
            $where[] = 'r.paciente_id = ?';
            $types .= 'i';
            $params[] = (int)$f['paciente_id'];
        }
        if (!empty($f['consulta_origen_id'])) {
            $where[] = 'r.consulta_origen_id = ?';
            $types .= 'i';
            $params[] = (int)$f['consulta_origen_id'];
        }
        $estadoGestion = trim((string)($f['estado_gestion'] ?? ''));
        if ($estadoGestion !== '') {
            $where[] = 'r.estado_gestion = ?';
            $types .= 's';
            $params[] = $estadoGestion;
        }
        $busqueda = trim((string)($f['busqueda'] ?? ''));
        if ($busqueda !== '') {
            $where[] = "(CONCAT_WS(' ', p.nombre, p.apellido) LIKE ? OR CONCAT_WS(' ', m.nombre, m.apellido) LIKE ? OR p.dni LIKE ? OR p.telefono LIKE ? OR CAST(r.id AS CHAR) LIKE ?)";
            $like = '%' . $busqueda . '%';
            $types .= 'sssss';
            array_push($params, $like, $like, $like, $like, $like);
        }

        $from = ' FROM hc_reevaluaciones r
                  INNER JOIN pacientes p ON p.id = r.paciente_id
                  INNER JOIN medicos m ON m.id = r.medico_id
                  LEFT JOIN consultas c ON c.id = r.consulta_origen_id';
        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

        $stmtCount = $conn->prepare('SELECT COUNT(*) AS total' . $from . $whereSql);
        $total = 0;
        if ($stmtCount) {
            if ($types !== '') {
                $stmtCount->bind_param($types, ...$params);
            }
            $stmtCount->execute();
            $total = (int)($stmtCount->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtCount->close();
        }

        $sql = 'SELECT r.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.dni AS paciente_dni, p.telefono AS paciente_telefono,
                       m.nombre AS medico_nombre, m.apellido AS medico_apellido, c.fecha AS consulta_origen_fecha'
            . $from . $whereSql
            . " ORDER BY r.fecha_sugerida ASC, COALESCE(r.hora_sugerida, '23:59:59') ASC, r.id ASC";

        $page = (int)($f['page'] ?? 0);
        $perPage = (int)($f['per_page'] ?? 0);
        $listTypes = $types;
        $listParams = $params;
        if ($page > 0 && $perPage > 0) {
            $sql .= ' LIMIT ? OFFSET ?';
            $listTypes .= 'ii';
            $listParams[] = $perPage;
            $listParams[] = ($page - 1) * $perPage;
        }

        $items = [];
        $stmt = $conn->prepare($sql);
        if ($stmt) {
            if ($listTypes !== '') {
                $stmt->bind_param($listTypes, ...$listParams);
            }
            $stmt->execute();
            $res = $stmt->get_result();
            while ($row = $res->fetch_assoc()) {
                $items[] = $row;
            }
            $stmt->close();
        }

        return ['items' => $items, 'total' => $total];
    }
}

if (!function_exists('rev_item_recordatorio')) {
    /** Fila con la forma que consume /recordatorios-citas. Recepción no recibe datos clínicos. */
    function rev_item_recordatorio(array $r): array {
        $f = rev_formatear($r);
        $obs = $f['observacion_gestion'] !== '' ? $f['observacion_gestion'] : $f['motivo'];
        return [
            'id' => $f['id'],
            'paciente_id' => $f['paciente_id'],
            'medico_id' => $f['medico_id'],
            'fecha' => $f['fecha_sugerida'],
            'hora' => $f['hora_sugerida'] !== '' ? $f['hora_sugerida'] . ':00' : '',
            'estado_consulta' => 'pendiente',
            'es_control' => 1,
            'hc_origen_id' => $f['hc_id'],
            'tipo_consulta' => 'programada',
            'origen_consulta' => 'hc_reevaluacion',
            'recordatorio_tipo' => 'reevaluacion',
            'servicio_tipo' => 'Reevaluación',
            'hc_tiene_registro' => 0,
            'hc_ultima_actualizacion' => null,
            'paciente_nombre' => (string)($r['paciente_nombre'] ?? ''),
            'paciente_apellido' => (string)($r['paciente_apellido'] ?? ''),
            'paciente_dni' => (string)($r['paciente_dni'] ?? ''),
            'paciente_telefono' => (string)($r['paciente_telefono'] ?? ''),
            'medico_nombre' => (string)($r['medico_nombre'] ?? ''),
            'medico_apellido' => (string)($r['medico_apellido'] ?? ''),
            'estado_gestion' => $f['estado_gestion'],
            'observacion' => $obs,
            'fecha_proximo_contacto' => $f['fecha_proximo_contacto'],
            'fecha_ultimo_contacto' => $f['fecha_ultimo_contacto'],
            'intentos' => $f['intentos'],
            'gestion_updated_at' => $f['updated_at'],
            'cotizacion_id' => null,
            'cotizacion_estado' => null,
            'saldo_pendiente' => 0,
            'reevaluacion_id' => $f['id'],
            'reevaluacion_estado' => $f['estado'],
            'reevaluacion_motivo' => $f['motivo'],
            'reevaluacion_tipo_motivo' => $f['tipo_motivo'],
            'reevaluacion_sin_hora_fija' => $f['sin_hora_fija'],
            'reevaluacion_fecha_limite' => $f['fecha_limite'],
            'reevaluacion_atrasada' => $f['atrasada'],
            'consulta_origen_id' => $f['consulta_origen_id'],
            'consulta_origen_fecha' => (string)($r['consulta_origen_fecha'] ?? ''),
        ];
    }
}

if (!function_exists('rev_horas_ocupadas')) {
    /** Horas con reevaluación pendiente y hora fija: ocupan el turno del médico. */
    function rev_horas_ocupadas($conn, int $medicoId, string $fechaYmd, int $excluirConsultaOrigen = 0): array {
        if ($medicoId <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaYmd) || !rev_disponible($conn)) {
            return [];
        }
        $stmt = $conn->prepare(
            "SELECT r.id, r.consulta_origen_id, r.paciente_id, r.hora_sugerida, TRIM(CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, ''))) AS paciente
             FROM hc_reevaluaciones r
             LEFT JOIN pacientes p ON p.id = r.paciente_id
             WHERE r.medico_id = ? AND r.fecha_sugerida = ? AND r.estado = 'pendiente'
               AND r.sin_hora_fija = 0 AND r.hora_sugerida IS NOT NULL AND r.consulta_visita_id IS NULL
               AND r.consulta_origen_id <> ?
             ORDER BY r.hora_sugerida ASC"
        );
        if (!$stmt) {
            return [];
        }
        $stmt->bind_param('isi', $medicoId, $fechaYmd, $excluirConsultaOrigen);
        $stmt->execute();
        $res = $stmt->get_result();
        $out = [];
        while ($row = $res->fetch_assoc()) {
            $out[] = [
                'id' => (int)$row['id'],
                'consulta_origen_id' => (int)$row['consulta_origen_id'],
                'paciente_id' => (int)$row['paciente_id'],
                'hora' => substr((string)$row['hora_sugerida'], 0, 8),
                'paciente' => trim((string)$row['paciente']),
            ];
        }
        $stmt->close();
        return $out;
    }
}

if (!function_exists('rev_enriquecer_consultas')) {
    /** Añade reevaluacion_* a cada fila de /mis-consultas (por consulta origen). */
    function rev_enriquecer_consultas($conn, array &$rows): void {
        if (empty($rows) || !rev_disponible($conn)) {
            return;
        }
        rev_vencer_abiertas($conn);

        $ids = [];
        foreach ($rows as $row) {
            $cid = (int)($row['id'] ?? 0);
            if ($cid > 0) {
                $ids[$cid] = $cid;
            }
        }
        $mapa = [];
        if (!empty($ids)) {
            $ids = array_values($ids);
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $conn->prepare("SELECT * FROM hc_reevaluaciones WHERE abierta = 1 AND consulta_origen_id IN ({$ph})");
            if ($stmt) {
                $stmt->bind_param(str_repeat('i', count($ids)), ...$ids);
                $stmt->execute();
                $res = $stmt->get_result();
                while ($r = $res->fetch_assoc()) {
                    $mapa[(int)$r['consulta_origen_id']] = rev_formatear($r);
                }
                $stmt->close();
            }
        }

        foreach ($rows as &$row) {
            $r = $mapa[(int)($row['id'] ?? 0)] ?? null;
            $row['reevaluacion_pendiente'] = $r ? 1 : 0;
            $row['reevaluacion_id'] = $r['id'] ?? null;
            $row['reevaluacion_estado'] = $r['estado'] ?? null;
            $row['reevaluacion_fecha'] = $r['fecha_sugerida'] ?? null;
            $row['reevaluacion_hora'] = $r['hora_sugerida'] ?? null;
            $row['reevaluacion_sin_hora_fija'] = $r['sin_hora_fija'] ?? null;
            $row['reevaluacion_motivo'] = $r['motivo'] ?? null;
            $row['reevaluacion_atrasada'] = $r['atrasada'] ?? 0;
        }
        unset($row);
    }
}

if (!function_exists('rev_stats_medico')) {
    function rev_stats_medico($conn, int $medicoId): array {
        $out = ['abiertas' => 0, 'hoy' => 0, 'atrasadas' => 0];
        if ($medicoId <= 0 || !rev_disponible($conn)) {
            return $out;
        }
        rev_vencer_abiertas($conn);
        $hoy = date('Y-m-d');
        $stmt = $conn->prepare(
            'SELECT COUNT(*) AS abiertas,
                    COALESCE(SUM(CASE WHEN fecha_sugerida = ? THEN 1 ELSE 0 END), 0) AS hoy,
                    COALESCE(SUM(CASE WHEN fecha_sugerida < ? THEN 1 ELSE 0 END), 0) AS atrasadas
             FROM hc_reevaluaciones WHERE medico_id = ? AND abierta = 1'
        );
        if (!$stmt) {
            return $out;
        }
        $stmt->bind_param('ssi', $hoy, $hoy, $medicoId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc() ?: [];
        $stmt->close();
        return [
            'abiertas' => (int)($row['abiertas'] ?? 0),
            'hoy' => (int)($row['hoy'] ?? 0),
            'atrasadas' => (int)($row['atrasadas'] ?? 0),
        ];
    }
}
