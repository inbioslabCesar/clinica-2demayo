<?php
// Reevaluación (Fase 2): llegada del paciente, consulta visita ligera, revisión y cierre.
// La visita es una consulta con origen_creacion='hc_reevaluacion' y es_control=1 (sin cobro ni honorario):
// reutiliza cola de sala, torre y listas existentes sin abrir una HC nueva. La evolución se guarda en la HC de origen.

if (!function_exists('rev_acciones_visita')) {
    function rev_acciones_visita(): array {
        return ['llegada', 'deshacer_llegada', 'iniciar', 'diferir', 'completar'];
    }
}

if (!function_exists('rev_conductas')) {
    function rev_conductas(): array {
        return [
            'continuar' => 'Continuar tratamiento',
            'ajustar' => 'Ajustar tratamiento',
            'alta' => 'Alta',
            'derivar' => 'Derivar',
        ];
    }
}

if (!function_exists('rev_visita_actor_puede')) {
    function rev_visita_actor_puede(array $actor, array $row, string $accion): bool {
        $rol = (string)($actor['rol'] ?? '');
        if (in_array($rol, ['administrador', 'recepcionista'], true)) {
            return in_array($accion, ['llegada', 'deshacer_llegada'], true);
        }
        if ($rol === 'medico') {
            return in_array($accion, ['iniciar', 'diferir', 'completar'], true)
                && (int)($actor['medico_id'] ?? 0) > 0
                && (int)$row['medico_id'] === (int)$actor['medico_id'];
        }
        return false;
    }
}

if (!function_exists('rev_crear_visita_consulta')) {
    /** Si llega el día indicado y con hora fija conserva su turno; en otro caso usa la hora de llegada. */
    function rev_crear_visita_consulta($conn, array $row): int {
        $hora = date('H:i:00');
        if ((string)$row['fecha_sugerida'] === date('Y-m-d') && empty($row['sin_hora_fija']) && !empty($row['hora_sugerida'])) {
            $hora = substr((string)$row['hora_sugerida'], 0, 8);
        }
        $fecha = date('Y-m-d');
        $paciente = (int)$row['paciente_id'];
        $medico = (int)$row['medico_id'];
        $hcId = (int)$row['hc_id'];
        $stmt = $conn->prepare(
            'INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado, hc_origen_id, origen_creacion, es_control)
             VALUES (?, ?, ?, ?, "programada", "pendiente", ?, "hc_reevaluacion", 1)'
        );
        if (!$stmt) {
            throw new RevError('No se pudo registrar la llegada.', 500);
        }
        $stmt->bind_param('iissi', $paciente, $medico, $fecha, $hora, $hcId);
        $ok = $stmt->execute();
        $id = $ok ? (int)$stmt->insert_id : 0;
        $stmt->close();
        if ($id <= 0) {
            throw new RevError('No se pudo registrar la llegada.', 500);
        }
        return $id;
    }
}

if (!function_exists('rev_cancelar_consulta_visita')) {
    function rev_cancelar_consulta_visita($conn, int $consultaId): void {
        if ($consultaId <= 0) {
            return;
        }
        $stmt = $conn->prepare('UPDATE consultas SET estado = "cancelada" WHERE id = ? AND origen_creacion = "hc_reevaluacion" AND estado IN ("pendiente", "falta_cancelar")');
        if ($stmt) {
            $stmt->bind_param('i', $consultaId);
            $stmt->execute();
            $stmt->close();
        }
    }
}

if (!function_exists('rev_volver_a_pendiente')) {
    /** El paciente deja de estar en atención: se cancela la visita y la reevaluación vuelve a esperar (opcionalmente con nueva agenda). */
    function rev_volver_a_pendiente($conn, array $row, string $accion, array $detalle, array $actor, ?array $agenda = null): void {
        $id = (int)$row['id'];
        $estadoAnterior = (string)$row['estado'];
        $usuarioId = (int)($actor['usuario_id'] ?? 0) > 0 ? (int)$actor['usuario_id'] : null;
        rev_cancelar_consulta_visita($conn, (int)($row['consulta_visita_id'] ?? 0));

        if ($agenda !== null) {
            $stmt = $conn->prepare("UPDATE hc_reevaluaciones SET estado = 'pendiente', consulta_visita_id = NULL, llegada_en = NULL, inicio_en = NULL,
                fecha_sugerida = ?, hora_sugerida = ?, sin_hora_fija = ?, actualizado_por = ? WHERE id = ? AND estado IN ('en_espera', 'en_revision')");
            if ($stmt) {
                $stmt->bind_param('ssiii', $agenda['fecha'], $agenda['hora'], $agenda['sin_hora_fija'], $usuarioId, $id);
            }
        } else {
            $stmt = $conn->prepare("UPDATE hc_reevaluaciones SET estado = 'pendiente', consulta_visita_id = NULL, llegada_en = NULL, inicio_en = NULL,
                actualizado_por = ? WHERE id = ? AND estado IN ('en_espera', 'en_revision')");
            if ($stmt) {
                $stmt->bind_param('ii', $usuarioId, $id);
            }
        }
        if (!$stmt) {
            throw new RevError('No se pudo actualizar la reevaluación.', 500);
        }
        $stmt->execute();
        $cambio = $stmt->affected_rows > 0;
        $stmt->close();
        if ($cambio) {
            rev_registrar_evento($conn, $id, $accion, $estadoAnterior, 'pendiente', $detalle, $actor);
        }
    }
}

if (!function_exists('rev_revertir_visitas_abandonadas')) {
    /** Una visita que quedó abierta de un día anterior vuelve a pendiente si aún está en ventana, o vence. */
    function rev_revertir_visitas_abandonadas($conn): void {
        $hoy = date('Y-m-d');
        $inicioHoy = $hoy . ' 00:00:00';
        $stmt = $conn->prepare("SELECT * FROM hc_reevaluaciones WHERE abierta = 1 AND estado IN ('en_espera', 'en_revision') AND llegada_en IS NOT NULL AND llegada_en < ? LIMIT 100");
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('s', $inicioHoy);
        $stmt->execute();
        $res = $stmt->get_result();
        $filas = [];
        while ($r = $res->fetch_assoc()) {
            $filas[] = $r;
        }
        $stmt->close();

        $sistema = ['rol' => 'sistema', 'usuario_id' => 0, 'nombre' => 'sistema', 'ip' => ''];
        foreach ($filas as $r) {
            if ((string)$r['fecha_limite'] >= $hoy) {
                rev_volver_a_pendiente($conn, $r, 'visita_abandonada', ['motivo' => 'La visita no se atendió el mismo día'], $sistema);
                continue;
            }
            rev_cancelar_consulta_visita($conn, (int)($r['consulta_visita_id'] ?? 0));
            $id = (int)$r['id'];
            $upd = $conn->prepare("UPDATE hc_reevaluaciones SET estado = 'vencida', abierta = NULL, cierre_en = NOW(), motivo_cierre = 'Venció la ventana de reevaluación' WHERE id = ? AND estado IN ('en_espera', 'en_revision')");
            if ($upd) {
                $upd->bind_param('i', $id);
                $upd->execute();
                $cambio = $upd->affected_rows > 0;
                $upd->close();
                if ($cambio) {
                    rev_registrar_evento($conn, $id, 'vencida', (string)$r['estado'], 'vencida', [], $sistema);
                }
            }
        }
    }
}

if (!function_exists('rev_on_visita_cancelada')) {
    /** Si la consulta visita se cancela por el flujo normal de consultas, la reevaluación vuelve a esperar. */
    function rev_on_visita_cancelada($conn, int $consultaId): void {
        if ($consultaId <= 0 || !rev_disponible($conn)) {
            return;
        }
        $stmt = $conn->prepare("SELECT * FROM hc_reevaluaciones WHERE consulta_visita_id = ? AND abierta = 1 AND estado IN ('en_espera', 'en_revision') LIMIT 1");
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            rev_volver_a_pendiente($conn, $row, 'visita_cancelada', ['motivo' => 'Se canceló la consulta de la visita'], rev_actor());
        }
    }
}

if (!function_exists('rev_agregar_evolucion_hc')) {
    /** Añade la evolución a datos.reevaluaciones[] de la HC de origen sin tocar el resto de la historia. */
    function rev_agregar_evolucion_hc($conn, array $row, array $entrada): void {
        $stmt = $conn->prepare('SELECT id, datos FROM historia_clinica WHERE id = ? OR consulta_id = ? ORDER BY (id = ?) DESC LIMIT 1');
        $hcId = (int)$row['hc_id'];
        $origen = (int)$row['consulta_origen_id'];
        if (!$stmt) {
            throw new RevError('No se pudo guardar la evolución.', 500);
        }
        $stmt->bind_param('iii', $hcId, $origen, $hcId);
        $stmt->execute();
        $hc = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$hc) {
            throw new RevError('La historia clínica de origen no existe; no se puede registrar la evolución.', 409);
        }
        $datos = json_decode((string)$hc['datos'], true);
        if (!is_array($datos)) {
            $datos = [];
        }
        $lista = (isset($datos['reevaluaciones']) && is_array($datos['reevaluaciones'])) ? $datos['reevaluaciones'] : [];
        $lista[] = $entrada;
        $datos['reevaluaciones'] = $lista;
        $json = json_encode($datos);
        $idHc = (int)$hc['id'];
        $upd = $conn->prepare('UPDATE historia_clinica SET datos = ? WHERE id = ? LIMIT 1');
        if (!$upd) {
            throw new RevError('No se pudo guardar la evolución.', 500);
        }
        $upd->bind_param('si', $json, $idHc);
        $upd->execute();
        $upd->close();
    }
}

if (!function_exists('rev_obtener_por_visita')) {
    /** Reevaluación ligada a una consulta visita, con el contexto que necesita la pantalla de revisión. */
    function rev_obtener_por_visita($conn, int $consultaVisitaId): ?array {
        if ($consultaVisitaId <= 0 || !rev_disponible($conn)) {
            return null;
        }
        rev_vencer_abiertas($conn);
        $stmt = $conn->prepare(
            'SELECT r.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.dni AS paciente_dni,
                    c.fecha AS consulta_origen_fecha, cv.estado AS visita_estado
             FROM hc_reevaluaciones r
             INNER JOIN pacientes p ON p.id = r.paciente_id
             LEFT JOIN consultas c ON c.id = r.consulta_origen_id
             LEFT JOIN consultas cv ON cv.id = r.consulta_visita_id
             WHERE r.consulta_visita_id = ? ORDER BY r.id DESC LIMIT 1'
        );
        if (!$stmt) {
            return null;
        }
        $stmt->bind_param('i', $consultaVisitaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            return null;
        }
        return rev_formatear($row) + [
            'paciente_nombre' => (string)$row['paciente_nombre'],
            'paciente_apellido' => (string)$row['paciente_apellido'],
            'paciente_dni' => (string)$row['paciente_dni'],
            'consulta_origen_fecha' => (string)($row['consulta_origen_fecha'] ?? ''),
            'visita_estado' => (string)($row['visita_estado'] ?? ''),
        ];
    }
}

if (!function_exists('rev_enriquecer_visitas')) {
    /** Marca en la lista de citas de recepción las consultas que son visitas de reevaluación. */
    function rev_enriquecer_visitas($conn, array &$items): void {
        $ids = [];
        foreach ($items as $it) {
            if ((string)($it['origen_consulta'] ?? '') === 'hc_reevaluacion' && (int)($it['id'] ?? 0) > 0) {
                $ids[(int)$it['id']] = (int)$it['id'];
            }
        }
        if (empty($ids) || !rev_disponible($conn)) {
            return;
        }
        $ids = array_values($ids);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $conn->prepare("SELECT id, consulta_visita_id, consulta_origen_id, estado, motivo FROM hc_reevaluaciones WHERE consulta_visita_id IN ({$ph})");
        if (!$stmt) {
            return;
        }
        $stmt->bind_param(str_repeat('i', count($ids)), ...$ids);
        $stmt->execute();
        $res = $stmt->get_result();
        $mapa = [];
        while ($r = $res->fetch_assoc()) {
            $mapa[(int)$r['consulta_visita_id']] = $r;
        }
        $stmt->close();
        foreach ($items as &$it) {
            $r = $mapa[(int)($it['id'] ?? 0)] ?? null;
            if ($r && (string)($it['origen_consulta'] ?? '') === 'hc_reevaluacion') {
                $it['reevaluacion_id'] = (int)$r['id'];
                $it['reevaluacion_estado'] = (string)$r['estado'];
                $it['reevaluacion_motivo'] = (string)($r['motivo'] ?? '');
                $it['consulta_origen_id'] = (int)$r['consulta_origen_id'];
            }
        }
        unset($it);
    }
}

if (!function_exists('rev_aplicar_accion_visita')) {
    /** Devuelve la reevaluación formateada; si hay datos extra los entrega en la clave '_extra'. */
    function rev_aplicar_accion_visita($conn, array $row, string $accion, array $p, array $actor): array {
        $id = (int)$row['id'];
        $estado = (string)$row['estado'];
        $usuarioId = (int)($actor['usuario_id'] ?? 0) > 0 ? (int)$actor['usuario_id'] : null;
        $hoy = date('Y-m-d');

        if ($accion === 'llegada') {
            if ((int)$row['abierta'] !== 1 || $estado !== 'pendiente') {
                throw new RevError('La llegada solo se registra sobre una reevaluación pendiente (estado actual: ' . $estado . ').', 409);
            }
            if ($hoy > (string)$row['fecha_limite']) {
                throw new RevError('La ventana de esta reevaluación terminó el ' . $row['fecha_limite'] . '. El médico debe indicar una nueva.', 409);
            }
            $conn->begin_transaction();
            try {
                $fresca = rev_obtener($conn, $id, true);
                if (!$fresca || (string)$fresca['estado'] !== 'pendiente') {
                    throw new RevError('La reevaluación cambió de estado mientras se procesaba. Actualice la lista.', 409);
                }
                $visitaId = rev_crear_visita_consulta($conn, $fresca);
                $stmt = $conn->prepare("UPDATE hc_reevaluaciones SET estado = 'en_espera', consulta_visita_id = ?, llegada_en = NOW(), actualizado_por = ? WHERE id = ? AND estado = 'pendiente'");
                if (!$stmt) {
                    throw new RevError('No se pudo registrar la llegada.', 500);
                }
                $stmt->bind_param('iii', $visitaId, $usuarioId, $id);
                $stmt->execute();
                $stmt->close();
                rev_registrar_evento($conn, $id, 'llegada', 'pendiente', 'en_espera', [
                    'consulta_visita_id' => $visitaId,
                    'adelantada' => $hoy < (string)$row['fecha_sugerida'],
                    'atrasada' => $hoy > (string)$row['fecha_sugerida'],
                ], $actor);
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollback();
                throw $e;
            }
            return rev_formatear(rev_obtener($conn, $id));
        }

        if ($accion === 'deshacer_llegada') {
            if ($estado !== 'en_espera') {
                throw new RevError('Solo se puede deshacer la llegada mientras el paciente espera (estado actual: ' . $estado . ').', 409);
            }
            $conn->begin_transaction();
            try {
                $fresca = rev_obtener($conn, $id, true);
                if (!$fresca || (string)$fresca['estado'] !== 'en_espera') {
                    throw new RevError('La reevaluación cambió de estado mientras se procesaba. Actualice la lista.', 409);
                }
                rev_volver_a_pendiente($conn, $fresca, 'llegada_deshecha', ['motivo' => trim((string)($p['motivo'] ?? ''))], $actor);
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollback();
                throw $e;
            }
            return rev_formatear(rev_obtener($conn, $id));
        }

        if ($accion === 'iniciar') {
            if ($estado === 'en_revision') {
                return rev_formatear($row);
            }
            if ($estado !== 'en_espera') {
                throw new RevError('La revisión solo se inicia con el paciente en espera (estado actual: ' . $estado . ').', 409);
            }
            $stmt = $conn->prepare("UPDATE hc_reevaluaciones SET estado = 'en_revision', inicio_en = NOW(), actualizado_por = ? WHERE id = ? AND estado = 'en_espera'");
            if (!$stmt) {
                throw new RevError('No se pudo iniciar la revisión.', 500);
            }
            $stmt->bind_param('ii', $usuarioId, $id);
            $stmt->execute();
            $cambio = $stmt->affected_rows > 0;
            $stmt->close();
            if ($cambio) {
                rev_registrar_evento($conn, $id, 'iniciada', 'en_espera', 'en_revision', [], $actor);
            }
            return rev_formatear(rev_obtener($conn, $id));
        }

        if (!in_array($estado, ['en_espera', 'en_revision'], true)) {
            throw new RevError('La reevaluación no está en atención (estado actual: ' . $estado . ').', 409);
        }

        if ($accion === 'diferir') {
            // La ventana no se extiende: un plazo mayor se resuelve completando y creando otra reevaluación.
            $n = rev_validar_agenda($p, substr((string)$row['created_at'], 0, 10), $row, (string)$row['fecha_limite']);
            if (!$n['cambio_agenda']) {
                throw new RevError('Indique otra fecha u hora para diferir la reevaluación.', 400);
            }
            if ($n['fecha'] < $hoy) {
                throw new RevError('La nueva fecha no puede ser anterior a hoy.', 400);
            }
            rev_asegurar_hora_libre($conn, (int)$row['medico_id'], $n['fecha'], $n['hora'], $id, (int)$row['consulta_origen_id']);
            $conn->begin_transaction();
            try {
                $fresca = rev_obtener($conn, $id, true);
                if (!$fresca || !in_array((string)$fresca['estado'], ['en_espera', 'en_revision'], true)) {
                    throw new RevError('La reevaluación cambió de estado mientras se procesaba. Actualice la lista.', 409);
                }
                rev_volver_a_pendiente($conn, $fresca, 'diferida', [
                    'motivo' => mb_substr(trim((string)($p['motivo'] ?? '')), 0, 255),
                    'antes' => ['fecha' => $row['fecha_sugerida'], 'hora' => $row['hora_sugerida']],
                    'despues' => ['fecha' => $n['fecha'], 'hora' => $n['hora']],
                ], $actor, $n);
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollback();
                throw $e;
            }
            return rev_formatear(rev_obtener($conn, $id));
        }

        if ($accion === 'completar') {
            $evolucion = trim((string)($p['evolucion'] ?? ''));
            if (mb_strlen($evolucion) < 5) {
                throw new RevError('Registre la evolución del paciente.', 400);
            }
            $conducta = strtolower(trim((string)($p['conducta'] ?? '')));
            $conductas = rev_conductas();
            if (!isset($conductas[$conducta])) {
                throw new RevError('Seleccione la conducta a seguir.', 400);
            }

            $siguiente = null;
            if (isset($p['siguiente']) && is_array($p['siguiente']) && !empty($p['siguiente']['programar'])) {
                $siguiente = $p['siguiente'];
                $ns = rev_validar_agenda($siguiente, $hoy);
                rev_asegurar_hora_libre($conn, (int)$row['medico_id'], $ns['fecha'], $ns['hora'], 0, (int)$row['consulta_origen_id']);
            }

            $conn->begin_transaction();
            try {
                $fresca = rev_obtener($conn, $id, true);
                if (!$fresca || !in_array((string)$fresca['estado'], ['en_espera', 'en_revision'], true)) {
                    throw new RevError('La reevaluación cambió de estado mientras se procesaba. Actualice la lista.', 409);
                }
                rev_agregar_evolucion_hc($conn, $fresca, [
                    'reevaluacion_id' => $id,
                    'fecha' => $hoy,
                    'hora' => date('H:i'),
                    'registrado_en' => date('Y-m-d H:i:s'),
                    'medico_id' => (int)$fresca['medico_id'],
                    'atendido_por' => (string)($actor['nombre'] ?? ''),
                    'consulta_visita_id' => (int)($fresca['consulta_visita_id'] ?? 0),
                    'motivo' => (string)($fresca['motivo'] ?? ''),
                    'evolucion' => $evolucion,
                    'conducta' => $conducta,
                    'conducta_label' => $conductas[$conducta],
                    'resultados_revisados' => !empty($p['resultados_revisados']),
                    'ajustes' => mb_substr(trim((string)($p['ajustes'] ?? '')), 0, 2000),
                ]);

                $visitaId = (int)($fresca['consulta_visita_id'] ?? 0);
                if ($visitaId > 0) {
                    $stmtV = $conn->prepare('UPDATE consultas SET estado = "completada" WHERE id = ? AND origen_creacion = "hc_reevaluacion" LIMIT 1');
                    if ($stmtV) {
                        $stmtV->bind_param('i', $visitaId);
                        $stmtV->execute();
                        $stmtV->close();
                    }
                }

                $motivoCierre = 'Conducta: ' . $conductas[$conducta];
                $stmt = $conn->prepare("UPDATE hc_reevaluaciones SET estado = 'completada', abierta = NULL, cierre_en = NOW(), inicio_en = COALESCE(inicio_en, NOW()), motivo_cierre = ?, actualizado_por = ? WHERE id = ? AND estado IN ('en_espera', 'en_revision')");
                if (!$stmt) {
                    throw new RevError('No se pudo completar la reevaluación.', 500);
                }
                $stmt->bind_param('sii', $motivoCierre, $usuarioId, $id);
                $stmt->execute();
                $stmt->close();
                rev_registrar_evento($conn, $id, 'completada', (string)$fresca['estado'], 'completada', [
                    'conducta' => $conducta,
                    'siguiente' => $siguiente !== null,
                ], $actor);
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollback();
                throw $e;
            }

            $resultado = rev_formatear(rev_obtener($conn, $id));
            $extra = ['siguiente' => null, 'siguiente_error' => null];
            if ($siguiente !== null) {
                try {
                    $g = rev_guardar_desde_hc($conn, (int)$row['consulta_origen_id'], (int)$row['hc_id'], $siguiente, $actor);
                    $extra['siguiente'] = $g['reevaluacion'];
                } catch (Throwable $e) {
                    $extra['siguiente_error'] = $e->getMessage();
                }
            }
            $resultado['_extra'] = $extra;
            return $resultado;
        }

        throw new RevError('Acción no soportada.', 400);
    }
}
