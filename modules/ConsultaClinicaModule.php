<?php
// Consulta clínica asociada a una cotización: implementación única usada por api_cotizaciones.php y CobroModule.
// Antes existían dos copias que se desalineaban (p. ej. el cobro no guardaba la edad del paciente).

require_once __DIR__ . '/EpisodioAtencionModule.php';

if (!function_exists('cc_tabla_existe')) {
    function cc_tabla_existe($conn, $tabla)
    {
        static $cache = [];
        if (!array_key_exists($tabla, $cache)) {
            $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
            $existe = false;
            if ($stmt) {
                $stmt->bind_param('s', $tabla);
                $stmt->execute();
                $existe = (bool)$stmt->get_result()->fetch_assoc();
                $stmt->close();
            }
            $cache[$tabla] = $existe;
        }
        return $cache[$tabla];
    }
}

if (!function_exists('cc_normalizar_fecha')) {
    function cc_normalizar_fecha($value)
    {
        $raw = trim((string)$value);
        if ($raw === '') return null;
        $ts = strtotime($raw);
        if ($ts === false) return null;
        return date('Y-m-d', $ts);
    }
}

if (!function_exists('cc_normalizar_hora')) {
    function cc_normalizar_hora($value)
    {
        $raw = trim((string)$value);
        if ($raw === '') return null;
        if (preg_match('/^(\d{2}):(\d{2})(:\d{2})?$/', $raw)) {
            $parts = explode(':', $raw);
            return sprintf('%02d:%02d:00', (int)$parts[0], (int)$parts[1]);
        }
        $ts = strtotime($raw);
        if ($ts === false) return null;
        return date('H:i:s', $ts);
    }
}

if (!function_exists('cc_medico_existe')) {
    function cc_medico_existe($conn, $medicoId)
    {
        $medicoId = (int)$medicoId;
        if ($medicoId <= 0) {
            return false;
        }
        $stmt = $conn->prepare('SELECT 1 FROM medicos WHERE id = ? LIMIT 1');
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('i', $medicoId);
        $stmt->execute();
        $existe = (bool)$stmt->get_result()->fetch_row();
        $stmt->close();
        return $existe;
    }
}

if (!function_exists('cc_edad_snapshot_asegurar_columnas')) {
    function cc_edad_snapshot_asegurar_columnas($conn)
    {
        $alteraciones = [];
        if (!episodio_columna_existe($conn, 'consultas', 'edad_snapshot_valor')) {
            $alteraciones[] = 'ADD COLUMN edad_snapshot_valor INT NULL';
        }
        if (!episodio_columna_existe($conn, 'consultas', 'edad_snapshot_unidad')) {
            $alteraciones[] = 'ADD COLUMN edad_snapshot_unidad VARCHAR(16) NULL';
        }
        if (!episodio_columna_existe($conn, 'consultas', 'edad_snapshot_es_estimada')) {
            $alteraciones[] = 'ADD COLUMN edad_snapshot_es_estimada TINYINT(1) NOT NULL DEFAULT 0';
        }
        if (!episodio_columna_existe($conn, 'consultas', 'edad_snapshot_fecha_calculo')) {
            $alteraciones[] = 'ADD COLUMN edad_snapshot_fecha_calculo DATE NULL';
        }
        foreach ($alteraciones as $parte) {
            @mysqli_query($conn, 'ALTER TABLE consultas ' . $parte);
        }
    }
}

if (!function_exists('cc_parse_fecha_segura')) {
    function cc_parse_fecha_segura($value)
    {
        $raw = trim((string)$value);
        if ($raw === '') return null;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
            $dt = DateTime::createFromFormat('Y-m-d H:i:s', $raw . ' 00:00:00');
            return ($dt instanceof DateTime) ? $dt : null;
        }
        $ts = strtotime($raw);
        if ($ts === false) return null;
        $dt = new DateTime();
        $dt->setTimestamp($ts);
        return $dt;
    }
}

if (!function_exists('cc_normalizar_unidad_edad')) {
    function cc_normalizar_unidad_edad($unidad)
    {
        $u = strtolower(trim((string)$unidad));
        if ($u === '') return 'anios';
        if (in_array($u, ['anio', 'anios', 'años', 'year', 'years'], true)) return 'anios';
        if (in_array($u, ['mes', 'meses', 'month', 'months'], true)) return 'meses';
        if (in_array($u, ['dia', 'dias', 'días', 'day', 'days'], true)) return 'dias';
        return 'anios';
    }
}

if (!function_exists('cc_edad_snapshot_resolver')) {
    // Edad del paciente a la fecha de la consulta: exacta si hay fecha de nacimiento, estimada si solo hay edad declarada.
    function cc_edad_snapshot_resolver($conn, $pacienteId, $fechaReferenciaYmd)
    {
        $vacio = ['valor' => null, 'unidad' => null, 'es_estimada' => 0, 'fecha_calculo' => null];
        $pacienteId = (int)$pacienteId;
        $fechaReferenciaYmd = trim((string)$fechaReferenciaYmd);
        if ($pacienteId <= 0 || $fechaReferenciaYmd === '') {
            return $vacio;
        }

        $stmtPac = $conn->prepare('SELECT fecha_nacimiento, edad, edad_unidad, creado_en FROM pacientes WHERE id = ? LIMIT 1');
        if (!$stmtPac) {
            return $vacio;
        }
        $stmtPac->bind_param('i', $pacienteId);
        $stmtPac->execute();
        $rowPac = $stmtPac->get_result()->fetch_assoc();
        $stmtPac->close();
        if (!$rowPac) {
            return $vacio;
        }

        $fechaRef = cc_parse_fecha_segura($fechaReferenciaYmd);
        if (!($fechaRef instanceof DateTime)) {
            return $vacio;
        }
        $fechaRef->setTime(0, 0, 0);
        $fechaCalculo = $fechaRef->format('Y-m-d');

        $fechaNac = cc_parse_fecha_segura($rowPac['fecha_nacimiento'] ?? null);
        if ($fechaNac instanceof DateTime) {
            $fechaNac->setTime(0, 0, 0);
            $diff = $fechaNac->diff($fechaRef);
            $dias = max(0, (int)$diff->days);
            $meses = max(0, ((int)$diff->y * 12) + (int)$diff->m);
            $anios = max(0, (int)$diff->y);

            if ($dias <= 28) {
                return ['valor' => $dias, 'unidad' => 'dias', 'es_estimada' => 0, 'fecha_calculo' => $fechaCalculo];
            }
            if ($meses < 12) {
                return ['valor' => $meses, 'unidad' => 'meses', 'es_estimada' => 0, 'fecha_calculo' => $fechaCalculo];
            }
            return ['valor' => $anios, 'unidad' => 'años', 'es_estimada' => 0, 'fecha_calculo' => $fechaCalculo];
        }

        $edadBaseRaw = $rowPac['edad'] ?? null;
        if ($edadBaseRaw === null || $edadBaseRaw === '') {
            return ['valor' => null, 'unidad' => null, 'es_estimada' => 0, 'fecha_calculo' => $fechaCalculo];
        }

        $edadBase = max(0, (int)$edadBaseRaw);
        $unidadBase = cc_normalizar_unidad_edad($rowPac['edad_unidad'] ?? 'anios');
        $fechaBase = cc_parse_fecha_segura($rowPac['creado_en'] ?? null);
        if (!($fechaBase instanceof DateTime)) {
            return [
                'valor' => $edadBase,
                'unidad' => $unidadBase === 'anios' ? 'años' : ($unidadBase === 'meses' ? 'meses' : 'dias'),
                'es_estimada' => 1,
                'fecha_calculo' => $fechaCalculo,
            ];
        }

        $fechaBase->setTime(0, 0, 0);
        $diffBase = $fechaBase->diff($fechaRef);
        $aniosTrans = max(0, (int)$diffBase->y);
        $mesesTrans = max(0, ((int)$diffBase->y * 12) + (int)$diffBase->m);
        $diasTrans = max(0, (int)$diffBase->days);

        if ($unidadBase === 'dias') {
            $totalDias = $edadBase + $diasTrans;
            if ($totalDias <= 28) {
                return ['valor' => $totalDias, 'unidad' => 'dias', 'es_estimada' => 1, 'fecha_calculo' => $fechaCalculo];
            }
            return ['valor' => (int)floor($totalDias / 30), 'unidad' => 'meses', 'es_estimada' => 1, 'fecha_calculo' => $fechaCalculo];
        }
        if ($unidadBase === 'meses') {
            $totalMeses = $edadBase + $mesesTrans;
            if ($totalMeses < 12) {
                return ['valor' => $totalMeses, 'unidad' => 'meses', 'es_estimada' => 1, 'fecha_calculo' => $fechaCalculo];
            }
            return ['valor' => (int)floor($totalMeses / 12), 'unidad' => 'años', 'es_estimada' => 1, 'fecha_calculo' => $fechaCalculo];
        }

        return ['valor' => $edadBase + $aniosTrans, 'unidad' => 'años', 'es_estimada' => 1, 'fecha_calculo' => $fechaCalculo];
    }
}

if (!function_exists('cc_propagar_consulta_id_detalles')) {
    // Asocia la consulta a los detalles clínicos de la cotización que aún no tienen una.
    function cc_propagar_consulta_id_detalles($conn, $cotizacionId, $consultaId)
    {
        $cotizacionId = (int)$cotizacionId;
        $consultaId = (int)$consultaId;
        if ($cotizacionId <= 0 || $consultaId <= 0 || !episodio_columna_existe($conn, 'cotizaciones_detalle', 'consulta_id')) {
            return;
        }

        $whereEstado = episodio_columna_existe($conn, 'cotizaciones_detalle', 'estado_item') ? " AND estado_item <> 'eliminado'" : '';
        $stmt = $conn->prepare(
            "UPDATE cotizaciones_detalle SET consulta_id = ?
             WHERE cotizacion_id = ?
               AND (consulta_id IS NULL OR consulta_id = 0)
               AND LOWER(TRIM(servicio_tipo)) IN ('consulta', 'procedimiento', 'procedimientos', 'operacion', 'operaciones', 'hospitalizacion', 'ecografia', 'rayosx', 'rayos_x', 'rayos x', 'rx', 'imagen', 'imagenologia', 'laboratorio'){$whereEstado}"
        );
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('ii', $consultaId, $cotizacionId);
        $stmt->execute();
        $stmt->close();
    }
}

if (!function_exists('cc_sincronizar_medico_consulta')) {
    function cc_sincronizar_medico_consulta($conn, $consultaId, $medicoId)
    {
        $consultaId = (int)$consultaId;
        $medicoId = (int)$medicoId;
        if ($consultaId <= 0 || $medicoId <= 0 || !cc_medico_existe($conn, $medicoId)) {
            return;
        }
        $stmt = $conn->prepare('UPDATE consultas SET medico_id = ? WHERE id = ? AND (medico_id IS NULL OR medico_id = 0 OR medico_id <> ?)');
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('iii', $medicoId, $consultaId, $medicoId);
        $stmt->execute();
        $stmt->close();
    }
}

if (!function_exists('cc_consulta_por_contrato')) {
    // Cotizaciones de contrato sin ítem de consulta: la consulta sale de agenda_contrato (por contrato + servicio).
    function cc_consulta_por_contrato($conn, $cotizacionId)
    {
        if (!episodio_columna_existe($conn, 'cotizaciones_detalle', 'contrato_paciente_id')
            || !cc_tabla_existe($conn, 'agenda_contrato')
            || !episodio_columna_existe($conn, 'agenda_contrato', 'consulta_id')
            || !episodio_columna_existe($conn, 'cotizaciones_detalle', 'consulta_id')) {
            return 0;
        }
        $stmt = $conn->prepare(
            'SELECT ac.consulta_id
             FROM cotizaciones_detalle cd
             INNER JOIN agenda_contrato ac
                 ON ac.contrato_paciente_id = cd.contrato_paciente_id
                AND LOWER(TRIM(ac.servicio_tipo)) COLLATE utf8mb4_general_ci = LOWER(TRIM(cd.servicio_tipo)) COLLATE utf8mb4_general_ci
                AND ac.servicio_id = cd.servicio_id
             WHERE cd.cotizacion_id = ?
               AND cd.contrato_paciente_id IS NOT NULL AND cd.contrato_paciente_id > 0
               AND ac.consulta_id IS NOT NULL AND ac.consulta_id > 0
             LIMIT 1'
        );
        if (!$stmt) {
            return 0;
        }
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        $consultaId = (int)($row['consulta_id'] ?? 0);
        if ($consultaId > 0) {
            $stmtUpd = $conn->prepare('UPDATE cotizaciones_detalle SET consulta_id = ? WHERE cotizacion_id = ? AND (consulta_id IS NULL OR consulta_id = 0)');
            if ($stmtUpd) {
                $stmtUpd->bind_param('ii', $consultaId, $cotizacionId);
                $stmtUpd->execute();
                $stmtUpd->close();
            }
        }
        return $consultaId;
    }
}

if (!function_exists('cc_asegurar_consulta_desde_cotizacion')) {
    // Garantiza que la cotización con ítem de consulta tenga su consulta clínica y la asocia a sus servicios.
    // Devuelve ['success','consulta_id','ya_existia','error','tiene_item_consulta'].
    function cc_asegurar_consulta_desde_cotizacion($conn, $cotizacionId)
    {
        $cotizacionId = (int)$cotizacionId;
        $out = [
            'success' => true,
            'consulta_id' => 0,
            'ya_existia' => false,
            'error' => null,
            'tiene_item_consulta' => false,
        ];

        if ($cotizacionId <= 0) {
            $out['success'] = false;
            $out['error'] = 'cotizacion_id requerido';
            return $out;
        }

        $stmtCot = $conn->prepare('SELECT paciente_id, fecha FROM cotizaciones WHERE id = ? LIMIT 1');
        if (!$stmtCot) {
            $out['success'] = false;
            $out['error'] = 'Error preparando consulta';
            return $out;
        }
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $cot = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();
        if (!$cot) {
            $out['success'] = false;
            return $out;
        }

        $pacienteId = (int)($cot['paciente_id'] ?? 0);
        $fechaCot = cc_normalizar_fecha($cot['fecha'] ?? null);
        $horaCot = cc_normalizar_hora($cot['fecha'] ?? null);
        if ($fechaCot === null) {
            $fechaCot = date('Y-m-d');
        }

        $tieneConsultaId = episodio_columna_existe($conn, 'cotizaciones_detalle', 'consulta_id');
        $tieneMedicoId = episodio_columna_existe($conn, 'cotizaciones_detalle', 'medico_id');
        $whereEstado = episodio_columna_existe($conn, 'cotizaciones_detalle', 'estado_item') ? " AND estado_item <> 'eliminado'" : '';
        $tieneFechaDet = episodio_columna_existe($conn, 'cotizaciones_detalle', 'fecha_programada');
        $tieneHoraDet = episodio_columna_existe($conn, 'cotizaciones_detalle', 'hora_programada');

        $campos = [
            'id',
            'descripcion',
            $tieneMedicoId ? 'medico_id' : '0 AS medico_id',
            $tieneConsultaId ? 'consulta_id' : '0 AS consulta_id',
            $tieneFechaDet ? 'fecha_programada' : 'NULL AS fecha_programada',
            $tieneHoraDet ? 'hora_programada' : 'NULL AS hora_programada',
        ];
        $stmtDet = $conn->prepare(
            'SELECT ' . implode(', ', $campos)
            . " FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta'{$whereEstado} ORDER BY id ASC LIMIT 1"
        );
        if (!$stmtDet) {
            $out['success'] = false;
            $out['error'] = 'Error preparando detalle';
            return $out;
        }
        $stmtDet->bind_param('i', $cotizacionId);
        $stmtDet->execute();
        $rowDet = $stmtDet->get_result()->fetch_assoc();
        $stmtDet->close();

        if (!$rowDet) {
            $consultaContrato = cc_consulta_por_contrato($conn, $cotizacionId);
            if ($consultaContrato > 0) {
                $out['consulta_id'] = $consultaContrato;
                $out['ya_existia'] = true;
            }
            return $out;
        }

        $out['tiene_item_consulta'] = true;
        $detalleId = (int)($rowDet['id'] ?? 0);
        $medicoId = (int)($rowDet['medico_id'] ?? 0);
        $consultaExistenteId = (int)($rowDet['consulta_id'] ?? 0);

        if ($consultaExistenteId > 0) {
            cc_propagar_consulta_id_detalles($conn, $cotizacionId, $consultaExistenteId);
            cc_sincronizar_medico_consulta($conn, $consultaExistenteId, $medicoId);
            $out['consulta_id'] = $consultaExistenteId;
            $out['ya_existia'] = true;
            return $out;
        }

        if ($medicoId <= 0) {
            $out['success'] = false;
            $out['error'] = 'No hay médico asignado al detalle de consulta';
            return $out;
        }
        if ($pacienteId <= 0) {
            // Cotización de paciente temporal/particular: no se crea consulta clínica.
            return $out;
        }
        if (!cc_medico_existe($conn, $medicoId)) {
            $out['success'] = false;
            $out['error'] = 'El médico asignado al detalle de consulta no existe o ya no está disponible';
            return $out;
        }

        $fechaProgramada = cc_normalizar_fecha($rowDet['fecha_programada'] ?? null);
        $horaProgramada = cc_normalizar_hora($rowDet['hora_programada'] ?? null);
        // El detalle de consulta no guarda fecha/hora propias: la descripción lleva "(YYYY-MM-DD HH:MM)".
        if (($fechaProgramada === null || $horaProgramada === null)
            && preg_match('/\((\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\)/', (string)($rowDet['descripcion'] ?? ''), $mDesc)) {
            $fechaProgramada = $fechaProgramada ?? $mDesc[1];
            $horaProgramada = $horaProgramada ?? cc_normalizar_hora($mDesc[2]);
        }
        if ($fechaProgramada !== null) {
            $fechaCot = $fechaProgramada;
        }
        if ($horaProgramada !== null) {
            $horaCot = $horaProgramada;
        }

        // Si la cotización ya tiene servicios agendados, la consulta se alinea a la primera programación.
        if (cc_tabla_existe($conn, 'agenda_servicios_cotizacion')
            && episodio_columna_existe($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            && episodio_columna_existe($conn, 'agenda_servicios_cotizacion', 'fecha_programada')) {
            $selectHora = episodio_columna_existe($conn, 'agenda_servicios_cotizacion', 'hora_programada') ? 'hora_programada' : 'NULL AS hora_programada';
            $whereEstadoAgenda = episodio_columna_existe($conn, 'agenda_servicios_cotizacion', 'estado_evento')
                ? ' AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")'
                : '';
            $stmtAgenda = $conn->prepare(
                'SELECT fecha_programada, ' . $selectHora . ' FROM agenda_servicios_cotizacion WHERE cotizacion_id = ?'
                . $whereEstadoAgenda . ' ORDER BY fecha_programada ASC, hora_programada ASC, id ASC LIMIT 1'
            );
            if ($stmtAgenda) {
                $stmtAgenda->bind_param('i', $cotizacionId);
                $stmtAgenda->execute();
                $rowAgenda = $stmtAgenda->get_result()->fetch_assoc();
                $stmtAgenda->close();
                if (is_array($rowAgenda)) {
                    $fechaAgenda = cc_normalizar_fecha($rowAgenda['fecha_programada'] ?? null);
                    $horaAgenda = cc_normalizar_hora($rowAgenda['hora_programada'] ?? null);
                    if ($fechaAgenda !== null) {
                        $fechaCot = $fechaAgenda;
                    }
                    if ($horaAgenda !== null) {
                        $horaCot = $horaAgenda;
                    }
                }
            }
        }

        $hora = $horaCot !== null ? $horaCot : date('H:i:s');
        $tipoConsulta = 'programada';
        cc_edad_snapshot_asegurar_columnas($conn);
        $edad = cc_edad_snapshot_resolver($conn, $pacienteId, $fechaCot);

        $columnas = ['paciente_id', 'medico_id', 'fecha', 'hora', 'tipo_consulta'];
        $tipos = 'iisss';
        $valores = [$pacienteId, $medicoId, $fechaCot, $hora, $tipoConsulta];
        if (episodio_columna_existe($conn, 'consultas', 'origen_creacion')) {
            $columnas[] = 'origen_creacion';
            $tipos .= 's';
            $valores[] = 'cotizador';
        }
        if ($edad['valor'] !== null
            && episodio_columna_existe($conn, 'consultas', 'edad_snapshot_valor')
            && episodio_columna_existe($conn, 'consultas', 'edad_snapshot_unidad')
            && episodio_columna_existe($conn, 'consultas', 'edad_snapshot_es_estimada')
            && episodio_columna_existe($conn, 'consultas', 'edad_snapshot_fecha_calculo')) {
            array_push($columnas, 'edad_snapshot_valor', 'edad_snapshot_unidad', 'edad_snapshot_es_estimada', 'edad_snapshot_fecha_calculo');
            $tipos .= 'isis';
            array_push($valores, (int)$edad['valor'], (string)$edad['unidad'], (int)$edad['es_estimada'], (string)$edad['fecha_calculo']);
        }

        $stmtIns = $conn->prepare(
            'INSERT INTO consultas (' . implode(', ', $columnas) . ') VALUES (' . implode(', ', array_fill(0, count($columnas), '?')) . ')'
        );
        if (!$stmtIns) {
            $out['success'] = false;
            $out['error'] = 'Error preparando inserción de consulta';
            return $out;
        }
        $stmtIns->bind_param($tipos, ...$valores);
        $ok = $stmtIns->execute();
        $consultaNuevaId = $ok ? (int)$stmtIns->insert_id : 0;
        $stmtIns->close();
        if (!$ok || $consultaNuevaId <= 0) {
            $out['success'] = false;
            $out['error'] = 'No se pudo crear la consulta';
            return $out;
        }

        if ($tieneConsultaId && $detalleId > 0) {
            cc_propagar_consulta_id_detalles($conn, $cotizacionId, $consultaNuevaId);
        }

        $out['consulta_id'] = $consultaNuevaId;
        return $out;
    }
}
