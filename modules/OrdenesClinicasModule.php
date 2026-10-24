<?php
// Órdenes clínicas generadas desde una cotización (procedimientos, laboratorio, imagen).
// Implementación única usada por api_cotizaciones.php y CobroModule (antes había una copia en cada uno).

require_once __DIR__ . '/ConsultaClinicaModule.php';

if (!function_exists('oc_crear_ordenes_procedimientos')) {
    // Crea o amplía la orden de procedimientos de la cotización con los procedimientos de $detalles.
    function oc_crear_ordenes_procedimientos($conn, $cotizacionId, $pacienteId, $detalles, $consultaId = 0, $usuarioId = 0)
    {
        $cotizacionId = (int)$cotizacionId;
        $pacienteId = (int)$pacienteId;
        if (!cc_tabla_existe($conn, 'ordenes_procedimientos')) {
            return;
        }
        if ($cotizacionId <= 0 || $pacienteId <= 0 || empty($detalles)) {
            return;
        }

        $procIds = [];
        $consultaCandidata = (int)$consultaId > 0 ? (int)$consultaId : 0;

        foreach ((array)$detalles as $det) {
            $tipo = strtolower(trim((string)($det['servicio_tipo'] ?? '')));
            if (!in_array($tipo, ['procedimiento', 'procedimientos'], true)) {
                continue;
            }
            $servicioId = (int)($det['servicio_id'] ?? 0);
            if ($servicioId > 0) {
                $procIds[] = $servicioId;
            }
            if ($consultaCandidata <= 0) {
                $consultaDet = (int)($det['consulta_id'] ?? 0);
                if ($consultaDet > 0) {
                    $consultaCandidata = $consultaDet;
                }
            }
        }

        $procIds = array_values(array_unique(array_filter(array_map('intval', $procIds), function ($id) {
            return $id > 0;
        })));
        if (empty($procIds)) {
            return;
        }

        if ($consultaCandidata <= 0 && episodio_columna_existe($conn, 'cotizaciones_detalle', 'consulta_id')) {
            $stmtConsulta = $conn->prepare(
                'SELECT consulta_id FROM cotizaciones_detalle
                 WHERE cotizacion_id = ? AND consulta_id IS NOT NULL AND consulta_id > 0
                 ORDER BY id ASC LIMIT 1'
            );
            if ($stmtConsulta) {
                $stmtConsulta->bind_param('i', $cotizacionId);
                $stmtConsulta->execute();
                $rowConsulta = $stmtConsulta->get_result()->fetch_assoc();
                $stmtConsulta->close();
                $consultaCandidata = (int)($rowConsulta['consulta_id'] ?? 0);
            }
        }
        if ($consultaCandidata <= 0) {
            return;
        }

        $jsonProc = json_encode($procIds, JSON_UNESCAPED_UNICODE);
        if ($jsonProc === false) {
            $jsonProc = json_encode($procIds);
        }

        $tieneCotizacionId = episodio_columna_existe($conn, 'ordenes_procedimientos', 'cotizacion_id');
        $tienePacienteId = episodio_columna_existe($conn, 'ordenes_procedimientos', 'paciente_id');
        $tieneUsuarioId = episodio_columna_existe($conn, 'ordenes_procedimientos', 'usuario_id');
        $tieneUpdatedAt = episodio_columna_existe($conn, 'ordenes_procedimientos', 'updated_at');

        $usuarioSesion = (int)($_SESSION['usuario']['id'] ?? 0);
        if ($usuarioSesion <= 0) {
            $usuarioSesion = (int)$usuarioId;
        }

        $existenteId = 0;
        $existenteJson = '[]';
        if ($tieneCotizacionId) {
            $stmtBuscar = $conn->prepare('SELECT id, procedimientos_json FROM ordenes_procedimientos WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 1');
            $claveBusqueda = $cotizacionId;
        } else {
            $stmtBuscar = $conn->prepare('SELECT id, procedimientos_json FROM ordenes_procedimientos WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
            $claveBusqueda = $consultaCandidata;
        }
        if ($stmtBuscar) {
            $stmtBuscar->bind_param('i', $claveBusqueda);
            $stmtBuscar->execute();
            $rowExistente = $stmtBuscar->get_result()->fetch_assoc();
            $stmtBuscar->close();
            $existenteId = (int)($rowExistente['id'] ?? 0);
            $existenteJson = (string)($rowExistente['procedimientos_json'] ?? '[]');
        }

        if ($existenteId > 0) {
            $previos = json_decode($existenteJson, true);
            if (!is_array($previos)) {
                $previos = [];
            }
            $idsPrevios = array_values(array_unique(array_filter(array_map('intval', $previos), function ($id) {
                return $id > 0;
            })));
            $idsFinales = array_values(array_unique(array_merge($idsPrevios, $procIds)));
            $jsonFinal = json_encode($idsFinales, JSON_UNESCAPED_UNICODE);
            if ($jsonFinal === false) {
                $jsonFinal = json_encode($idsFinales);
            }

            $sets = ['procedimientos_json = ?', 'consulta_id = CASE WHEN consulta_id IS NULL OR consulta_id = 0 THEN ? ELSE consulta_id END'];
            $tipos = 'si';
            $params = [$jsonFinal, $consultaCandidata];

            if ($tienePacienteId) {
                $sets[] = 'paciente_id = CASE WHEN paciente_id IS NULL OR paciente_id = 0 THEN ? ELSE paciente_id END';
                $tipos .= 'i';
                $params[] = $pacienteId;
            }
            if ($tieneUsuarioId && $usuarioSesion > 0) {
                $sets[] = 'usuario_id = CASE WHEN usuario_id IS NULL OR usuario_id = 0 THEN ? ELSE usuario_id END';
                $tipos .= 'i';
                $params[] = $usuarioSesion;
            }
            if ($tieneUpdatedAt) {
                $sets[] = 'updated_at = NOW()';
            }

            $tipos .= 'i';
            $params[] = $existenteId;

            $stmtUpd = $conn->prepare('UPDATE ordenes_procedimientos SET ' . implode(', ', $sets) . ' WHERE id = ?');
            if ($stmtUpd) {
                $stmtUpd->bind_param($tipos, ...$params);
                $stmtUpd->execute();
                $stmtUpd->close();
            }
            return;
        }

        $cols = ['consulta_id', 'procedimientos_json', 'estado'];
        $vals = ['?', '?', "'pendiente'"];
        $tipos = 'is';
        $params = [$consultaCandidata, $jsonProc];

        if ($tienePacienteId) {
            $cols[] = 'paciente_id';
            $vals[] = '?';
            $tipos .= 'i';
            $params[] = $pacienteId;
        }
        if ($tieneCotizacionId) {
            $cols[] = 'cotizacion_id';
            $vals[] = '?';
            $tipos .= 'i';
            $params[] = $cotizacionId;
        }
        if ($tieneUsuarioId) {
            $cols[] = 'usuario_id';
            $vals[] = '?';
            $tipos .= 'i';
            $params[] = $usuarioSesion > 0 ? $usuarioSesion : 0;
        }

        $stmtIns = $conn->prepare('INSERT INTO ordenes_procedimientos (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')');
        if ($stmtIns) {
            $stmtIns->bind_param($tipos, ...$params);
            $stmtIns->execute();
            $stmtIns->close();
        }
    }
}

if (!function_exists('oc_exam_version_id_desde_payload')) {
    function oc_exam_version_id_desde_payload($detalle)
    {
        if (!is_array($detalle)) return 0;
        $candidatos = [
            $detalle['examen_version_id'] ?? null,
            $detalle['version_id'] ?? null,
            $detalle['snapshot_json']['version_id'] ?? null,
        ];
        foreach ($candidatos as $v) {
            $num = (int)$v;
            if ($num > 0) return $num;
        }
        return 0;
    }
}

if (!function_exists('oc_crear_ordenes_laboratorio')) {
    // Mantiene UNA orden de laboratorio por episodio (cotización raíz y sus adendas) con todos los exámenes,
    // incluso derivados. $consultaCandidata la resuelve quien llama (cada flujo tiene su regla).
    function oc_crear_ordenes_laboratorio($conn, $cotizacionId, $pacienteId, $detalles, $consultaCandidata = 0)
    {
        $cotizacionId = (int)$cotizacionId;
        $pacienteId = (int)$pacienteId;
        $consultaCandidata = (int)$consultaCandidata;
        if (!cc_tabla_existe($conn, 'ordenes_laboratorio')) {
            return;
        }

        $cadena = $cotizacionId > 0 ? episodio_cotizaciones_cadena_ids($conn, $cotizacionId) : [];
        $cotizacionRaizId = !empty($cadena) ? (int)$cadena[0] : $cotizacionId;
        $cotizacionesOrigen = array_values(array_unique(array_filter(array_map('intval', $cadena), function ($id) {
            return $id > 0;
        })));
        if (empty($cotizacionesOrigen)) {
            $cotizacionesOrigen = [$cotizacionId];
        }

        $examIds = [];
        $examPayload = [];
        $respaldoPorExamen = [];
        foreach ((array)$detalles as $det) {
            if (strtolower(trim((string)($det['servicio_tipo'] ?? ''))) !== 'laboratorio') continue;
            $sId = (int)($det['servicio_id'] ?? 0);
            if ($sId > 0) {
                $examIds[] = $sId;
                if (!isset($respaldoPorExamen[$sId])) {
                    $respaldoPorExamen[$sId] = $det;
                }
            }
        }

        if (cc_tabla_existe($conn, 'cotizaciones_detalle')) {
            $tieneSnapshot = episodio_columna_existe($conn, 'cotizaciones_detalle', 'snapshot_json');
            $tieneVersion = episodio_columna_existe($conn, 'cotizaciones_detalle', 'examen_version_id');
            $whereEstado = episodio_columna_existe($conn, 'cotizaciones_detalle', 'estado_item') ? " AND estado_item <> 'eliminado'" : '';
            $placeholders = implode(',', array_fill(0, count($cotizacionesOrigen), '?'));
            $stmtDet = $conn->prepare(
                'SELECT cotizacion_id, servicio_id, descripcion' . ($tieneSnapshot ? ', snapshot_json' : '') . ($tieneVersion ? ', examen_version_id' : '')
                . " FROM cotizaciones_detalle WHERE cotizacion_id IN ({$placeholders}) AND LOWER(TRIM(servicio_tipo)) = 'laboratorio'{$whereEstado}"
                . ' ORDER BY cotizacion_id ASC, id ASC'
            );
            if ($stmtDet) {
                $stmtDet->bind_param(str_repeat('i', count($cotizacionesOrigen)), ...$cotizacionesOrigen);
                $stmtDet->execute();
                $filasDet = $stmtDet->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtDet->close();

                foreach ($filasDet as $rd) {
                    $sid = (int)($rd['servicio_id'] ?? 0);
                    if ($sid <= 0 || isset($examPayload[$sid])) continue;
                    $examIds[] = $sid;
                    $payload = [
                        'id' => $sid,
                        'descripcion' => (string)($rd['descripcion'] ?? ''),
                        'nombre' => (string)($rd['descripcion'] ?? ''),
                    ];
                    if ($tieneSnapshot && !empty($rd['snapshot_json'])) {
                        $decodificado = json_decode((string)$rd['snapshot_json'], true);
                        if (is_array($decodificado)) {
                            $payload['snapshot_json'] = $decodificado;
                            if (isset($decodificado['valores_referenciales']) && is_array($decodificado['valores_referenciales'])) {
                                $payload['valores_referenciales'] = $decodificado['valores_referenciales'];
                            }
                        }
                    }
                    $versionId = $tieneVersion ? (int)($rd['examen_version_id'] ?? 0) : 0;
                    if ($versionId <= 0 && isset($payload['snapshot_json']['version_id'])) {
                        $versionId = (int)$payload['snapshot_json']['version_id'];
                    }
                    if ($versionId > 0) {
                        $payload['examen_version_id'] = $versionId;
                        if (isset($payload['snapshot_json']) && is_array($payload['snapshot_json'])) {
                            $payload['snapshot_json']['version_id'] = $versionId;
                        }
                    }
                    $examPayload[$sid] = $payload;
                }
            }
        }

        $examIds = array_values(array_unique(array_filter(array_map('intval', $examIds), function ($id) {
            return $id > 0;
        })));
        if (empty($examIds) && empty($examPayload)) {
            return;
        }

        foreach ($examIds as $sid) {
            if (isset($examPayload[$sid])) continue;
            $det = isset($respaldoPorExamen[$sid]) && is_array($respaldoPorExamen[$sid]) ? $respaldoPorExamen[$sid] : [];
            $payload = [
                'id' => $sid,
                'descripcion' => (string)($det['descripcion'] ?? ''),
                'nombre' => (string)($det['descripcion'] ?? ''),
            ];
            if (!empty($det['snapshot_json']) && is_array($det['snapshot_json'])) {
                $payload['snapshot_json'] = $det['snapshot_json'];
                if (isset($det['snapshot_json']['valores_referenciales']) && is_array($det['snapshot_json']['valores_referenciales'])) {
                    $payload['valores_referenciales'] = $det['snapshot_json']['valores_referenciales'];
                }
            }
            $versionId = oc_exam_version_id_desde_payload((array)$det);
            if ($versionId > 0) {
                $payload['examen_version_id'] = $versionId;
                if (isset($payload['snapshot_json']) && is_array($payload['snapshot_json'])) {
                    $payload['snapshot_json']['version_id'] = $versionId;
                }
            }
            $examPayload[$sid] = $payload;
        }

        $json = json_encode(!empty($examPayload) ? array_values($examPayload) : $examIds, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            $json = json_encode($examIds);
        }

        $tieneConsultaCol = episodio_columna_existe($conn, 'ordenes_laboratorio', 'consulta_id');

        if (!episodio_columna_existe($conn, 'ordenes_laboratorio', 'cotizacion_id')) {
            // Esquema antiguo sin cotizacion_id: no se puede consolidar, solo registrar la orden.
            if ($tieneConsultaCol) {
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (examenes, paciente_id, consulta_id) VALUES (?, ?, ?)');
                if ($stmt) {
                    $consultaInsert = $consultaCandidata > 0 ? $consultaCandidata : null;
                    $stmt->bind_param('sii', $json, $pacienteId, $consultaInsert);
                    $stmt->execute();
                    $stmt->close();
                }
            } else {
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (examenes, paciente_id) VALUES (?, ?)');
                if ($stmt) {
                    $stmt->bind_param('si', $json, $pacienteId);
                    $stmt->execute();
                    $stmt->close();
                }
            }
            return;
        }

        $ordenId = 0;
        $stmtChk = $conn->prepare('SELECT id FROM ordenes_laboratorio WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 1');
        if ($stmtChk) {
            $stmtChk->bind_param('i', $cotizacionRaizId);
            $stmtChk->execute();
            $existe = $stmtChk->get_result()->fetch_assoc();
            $stmtChk->close();
            if (!empty($existe['id'])) {
                $ordenId = (int)$existe['id'];
            }
        }

        $phOrigen = implode(',', array_fill(0, count($cotizacionesOrigen), '?'));
        if ($ordenId <= 0 && count($cotizacionesOrigen) > 1) {
            $stmtAny = $conn->prepare("SELECT id FROM ordenes_laboratorio WHERE cotizacion_id IN ({$phOrigen}) ORDER BY id ASC LIMIT 1");
            if ($stmtAny) {
                $stmtAny->bind_param(str_repeat('i', count($cotizacionesOrigen)), ...$cotizacionesOrigen);
                $stmtAny->execute();
                $rowAny = $stmtAny->get_result()->fetch_assoc();
                $stmtAny->close();
                if ($rowAny) {
                    $ordenId = (int)($rowAny['id'] ?? 0);
                }
            }
        }

        if ($ordenId > 0) {
            if ($tieneConsultaCol && $consultaCandidata > 0) {
                $stmtUpd = $conn->prepare("UPDATE ordenes_laboratorio SET cotizacion_id = ?, examenes = ?, paciente_id = ?, consulta_id = CASE WHEN consulta_id IS NULL OR consulta_id = 0 THEN ? ELSE consulta_id END, estado = CASE WHEN estado = 'cancelada' THEN 'pendiente' ELSE estado END WHERE id = ?");
                if ($stmtUpd) {
                    $stmtUpd->bind_param('isiii', $cotizacionRaizId, $json, $pacienteId, $consultaCandidata, $ordenId);
                    $stmtUpd->execute();
                    $stmtUpd->close();
                }
            } else {
                $stmtUpd = $conn->prepare("UPDATE ordenes_laboratorio SET cotizacion_id = ?, examenes = ?, paciente_id = ?, estado = CASE WHEN estado = 'cancelada' THEN 'pendiente' ELSE estado END WHERE id = ?");
                if ($stmtUpd) {
                    $stmtUpd->bind_param('isii', $cotizacionRaizId, $json, $pacienteId, $ordenId);
                    $stmtUpd->execute();
                    $stmtUpd->close();
                }
            }
        } elseif ($tieneConsultaCol) {
            $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id, consulta_id) VALUES (?, ?, ?, ?)');
            if ($stmt) {
                $consultaInsert = $consultaCandidata > 0 ? $consultaCandidata : null;
                $stmt->bind_param('isii', $cotizacionRaizId, $json, $pacienteId, $consultaInsert);
                $stmt->execute();
                $stmt->close();
                $ordenId = (int)$conn->insert_id;
            }
        } else {
            $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id) VALUES (?, ?, ?)');
            if ($stmt) {
                $stmt->bind_param('isi', $cotizacionRaizId, $json, $pacienteId);
                $stmt->execute();
                $stmt->close();
                $ordenId = (int)$conn->insert_id;
            }
        }

        // Las órdenes duplicadas del mismo episodio se cancelan, salvo que ya tengan resultados.
        if ($ordenId > 0 && count($cotizacionesOrigen) > 1) {
            $stmtDup = $conn->prepare("SELECT id FROM ordenes_laboratorio WHERE cotizacion_id IN ({$phOrigen}) AND id <> ?");
            if ($stmtDup) {
                $params = $cotizacionesOrigen;
                $params[] = $ordenId;
                $stmtDup->bind_param(str_repeat('i', count($cotizacionesOrigen)) . 'i', ...$params);
                $stmtDup->execute();
                $duplicadas = $stmtDup->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtDup->close();

                foreach ($duplicadas as $dup) {
                    $dupId = (int)($dup['id'] ?? 0);
                    if ($dupId <= 0) continue;
                    $tieneResultados = false;
                    $stmtRes = $conn->prepare('SELECT 1 FROM resultados_laboratorio WHERE orden_id = ? LIMIT 1');
                    if ($stmtRes) {
                        $stmtRes->bind_param('i', $dupId);
                        $stmtRes->execute();
                        $tieneResultados = (bool)$stmtRes->get_result()->fetch_row();
                        $stmtRes->close();
                    }
                    if ($tieneResultados) continue;
                    $stmtCan = $conn->prepare("UPDATE ordenes_laboratorio SET examenes = '[]', estado = 'cancelada', cotizacion_id = ? WHERE id = ?");
                    if ($stmtCan) {
                        $stmtCan->bind_param('ii', $cotizacionRaizId, $dupId);
                        $stmtCan->execute();
                        $stmtCan->close();
                    }
                }
            }
        }
    }
}

if (!function_exists('oc_resolver_tipo_orden_imagen')) {
    function oc_resolver_tipo_orden_imagen($servicioTipo, $descripcion = '')
    {
        $tipo = strtolower(trim((string)$servicioTipo));
        $desc = strtolower(trim((string)$descripcion));

        if (in_array($tipo, ['rayosx', 'rayos_x', 'rayos x', 'rx'], true)) {
            return 'rx';
        }
        if ($tipo === 'ecografia') {
            return 'ecografia';
        }
        if ($tipo === 'tomografia') {
            return 'tomografia';
        }
        if (in_array($tipo, ['procedimiento', 'procedimientos'], true)) {
            if (preg_match('/tomograf|\btac\b/u', $desc)) {
                return 'tomografia';
            }
            if (preg_match('/rayos\s*x|\brx\b/u', $desc)) {
                return 'rx';
            }
            if (preg_match('/ecograf/i', $desc)) {
                return 'ecografia';
            }
        }
        return null;
    }
}

if (!function_exists('oc_crear_ordenes_imagen')) {
    // Una orden de imagen por servicio cotizado (idempotente por cotización + tipo + indicaciones).
    // $consultaEpisodioId la resuelve quien llama; el vínculo propio del detalle tiene prioridad.
    function oc_crear_ordenes_imagen($conn, $cotizacionId, $pacienteId, $detalles, $consultaEpisodioId = 0, $usuarioId = 0)
    {
        $cotizacionId = (int)$cotizacionId;
        $pacienteId = (int)$pacienteId;
        $consultaEpisodioId = (int)$consultaEpisodioId;
        if (!cc_tabla_existe($conn, 'ordenes_imagen')) {
            return;
        }
        if ($cotizacionId <= 0 || $pacienteId <= 0 || empty($detalles)) {
            return;
        }

        $detallesImagen = [];
        foreach ((array)$detalles as $det) {
            $tipo = oc_resolver_tipo_orden_imagen($det['servicio_tipo'] ?? '', $det['descripcion'] ?? '');
            if (!$tipo) continue;
            $descripcion = strtoupper(trim((string)($det['descripcion'] ?? '')));
            if ($descripcion === '') {
                $descripcion = strtoupper($tipo);
            }
            $detallesImagen[] = [
                'tipo' => $tipo,
                'detalle_id' => (int)($det['id'] ?? 0),
                'descripcion' => $descripcion,
                'medico_id' => (int)($det['medico_id'] ?? 0),
                'servicio_id' => (int)($det['servicio_id'] ?? 0),
                'consulta_id' => (int)($det['consulta_id'] ?? 0),
            ];
        }
        if (empty($detallesImagen)) {
            return;
        }

        $tieneCotizacionId = episodio_columna_existe($conn, 'ordenes_imagen', 'cotizacion_id');
        $tieneConsultaId = episodio_columna_existe($conn, 'ordenes_imagen', 'consulta_id');
        $tieneSolicitadoPor = episodio_columna_existe($conn, 'ordenes_imagen', 'solicitado_por');
        $tieneCargaAnticipada = episodio_columna_existe($conn, 'ordenes_imagen', 'carga_anticipada');
        $tieneMedicoId = episodio_columna_existe($conn, 'ordenes_imagen', 'medico_id');
        $detalleTieneMedico = episodio_columna_existe($conn, 'cotizaciones_detalle', 'medico_id');
        $agendaResuelveMedico = cc_tabla_existe($conn, 'agenda_servicios_cotizacion')
            && episodio_columna_existe($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            && episodio_columna_existe($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id')
            && episodio_columna_existe($conn, 'agenda_servicios_cotizacion', 'medico_id');

        $consultaColumna = $conn->query("SHOW COLUMNS FROM ordenes_imagen LIKE 'consulta_id'");
        $consultaAdmiteNull = $consultaColumna && ($consultaMeta = $consultaColumna->fetch_assoc())
            && strtoupper((string)($consultaMeta['Null'] ?? 'NO')) === 'YES';

        $usuarioSesion = (int)($_SESSION['usuario']['id'] ?? 0);
        if ($usuarioSesion <= 0) {
            $usuarioSesion = (int)$usuarioId;
        }

        // Órdenes genéricas de versiones antiguas (sin token de detalle): se eliminan si no tienen archivos.
        if ($tieneCotizacionId) {
            $indicacionGenerica = 'Orden creada desde cotización #' . $cotizacionId;
            $stmtDel = $conn->prepare(
                'DELETE oi FROM ordenes_imagen oi
                 LEFT JOIN ordenes_imagen_archivos oia ON oia.orden_id = oi.id
                 WHERE oi.cotizacion_id = ? AND oi.indicaciones = ? AND oia.id IS NULL'
            );
            if ($stmtDel) {
                $stmtDel->bind_param('is', $cotizacionId, $indicacionGenerica);
                $stmtDel->execute();
                $stmtDel->close();
            }
        }

        foreach ($detallesImagen as $item) {
            $tipoOrden = (string)$item['tipo'];
            $detalleId = (int)$item['detalle_id'];
            $descripcionItem = (string)$item['descripcion'];
            $medicoId = (int)$item['medico_id'];
            $servicioId = (int)$item['servicio_id'];
            $consultaOrigen = (int)$item['consulta_id'] > 0 ? (int)$item['consulta_id'] : $consultaEpisodioId;

            // Al sincronizar tras un abono, priorizar el vínculo ya persistido en el detalle.
            if ($detalleId > 0 && ($medicoId <= 0 || $consultaOrigen <= 0 || $servicioId <= 0) && $detalleTieneMedico) {
                $stmtDetalle = $conn->prepare('SELECT medico_id, consulta_id, servicio_id FROM cotizaciones_detalle WHERE id = ? AND cotizacion_id = ? LIMIT 1');
                if ($stmtDetalle) {
                    $stmtDetalle->bind_param('ii', $detalleId, $cotizacionId);
                    $stmtDetalle->execute();
                    $rowDetalle = $stmtDetalle->get_result()->fetch_assoc();
                    $stmtDetalle->close();
                    if ($medicoId <= 0) {
                        $medicoId = (int)($rowDetalle['medico_id'] ?? 0);
                    }
                    if ($consultaOrigen <= 0) {
                        $consultaOrigen = (int)($rowDetalle['consulta_id'] ?? 0);
                    }
                    if ($servicioId <= 0) {
                        $servicioId = (int)($rowDetalle['servicio_id'] ?? 0);
                    }
                }
            }

            if ($medicoId <= 0 && $detalleId > 0 && $agendaResuelveMedico) {
                $stmtAgenda = $conn->prepare('SELECT medico_id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND cotizacion_detalle_id = ? AND medico_id > 0 ORDER BY id ASC LIMIT 1');
                if ($stmtAgenda) {
                    $stmtAgenda->bind_param('ii', $cotizacionId, $detalleId);
                    $stmtAgenda->execute();
                    $medicoId = (int)($stmtAgenda->get_result()->fetch_assoc()['medico_id'] ?? 0);
                    $stmtAgenda->close();
                }
            }
            if ($medicoId <= 0 && $servicioId > 0) {
                $stmtTarifa = $conn->prepare('SELECT medico_id FROM tarifas WHERE id = ? LIMIT 1');
                if ($stmtTarifa) {
                    $stmtTarifa->bind_param('i', $servicioId);
                    $stmtTarifa->execute();
                    $medicoId = (int)($stmtTarifa->get_result()->fetch_assoc()['medico_id'] ?? 0);
                    $stmtTarifa->close();
                }
            }
            if ($medicoId <= 0 && $consultaOrigen > 0) {
                $stmtConsulta = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
                if ($stmtConsulta) {
                    $stmtConsulta->bind_param('i', $consultaOrigen);
                    $stmtConsulta->execute();
                    $medicoId = (int)($stmtConsulta->get_result()->fetch_assoc()['medico_id'] ?? 0);
                    $stmtConsulta->close();
                }
            }

            $indicaciones = ($detalleId > 0 ? "Detalle #{$detalleId} - " : '') . "{$descripcionItem} | Orden creada desde cotización #{$cotizacionId}";

            if ($tieneCotizacionId) {
                $stmtChk = $conn->prepare('SELECT id FROM ordenes_imagen WHERE cotizacion_id = ? AND tipo = ? AND indicaciones = ? LIMIT 1');
                if ($stmtChk) {
                    $stmtChk->bind_param('iss', $cotizacionId, $tipoOrden, $indicaciones);
                    $stmtChk->execute();
                    $existe = $stmtChk->get_result()->fetch_assoc();
                    $stmtChk->close();
                    if ($existe) {
                        $ordenId = (int)($existe['id'] ?? 0);
                        if ($ordenId > 0 && $tieneMedicoId && $medicoId > 0) {
                            $stmtUpdMedico = $conn->prepare('UPDATE ordenes_imagen SET medico_id = ? WHERE id = ? AND (medico_id IS NULL OR medico_id = 0)');
                            if ($stmtUpdMedico) {
                                $stmtUpdMedico->bind_param('ii', $medicoId, $ordenId);
                                $stmtUpdMedico->execute();
                                $stmtUpdMedico->close();
                            }
                        }
                        if ($ordenId > 0 && $consultaOrigen > 0 && $tieneConsultaId) {
                            $stmtUpdConsulta = $conn->prepare('UPDATE ordenes_imagen SET consulta_id = CASE WHEN consulta_id IS NULL OR consulta_id = 0 THEN ? ELSE consulta_id END WHERE id = ?');
                            if ($stmtUpdConsulta) {
                                $stmtUpdConsulta->bind_param('ii', $consultaOrigen, $ordenId);
                                $stmtUpdConsulta->execute();
                                $stmtUpdConsulta->close();
                            }
                        }
                        continue;
                    }
                }
            }

            $cols = ['consulta_id', 'paciente_id', 'tipo', 'indicaciones', 'estado'];
            $vals = ['?', '?', '?', '?', "'pendiente'"];
            $tipos = 'iiss';
            $params = [$consultaOrigen > 0 ? $consultaOrigen : ($consultaAdmiteNull ? null : 0), $pacienteId, $tipoOrden, $indicaciones];

            if ($tieneSolicitadoPor) {
                $cols[] = 'solicitado_por';
                $vals[] = '?';
                $tipos .= 'i';
                $params[] = $usuarioSesion;
            }
            if ($tieneMedicoId) {
                $cols[] = 'medico_id';
                $vals[] = '?';
                $tipos .= 'i';
                $params[] = $medicoId;
            }
            if ($tieneCotizacionId) {
                $cols[] = 'cotizacion_id';
                $vals[] = '?';
                $tipos .= 'i';
                $params[] = $cotizacionId;
            }
            if ($tieneCargaAnticipada) {
                $cols[] = 'carga_anticipada';
                $vals[] = '?';
                $tipos .= 'i';
                $params[] = 0;
            }

            $stmtIns = $conn->prepare('INSERT INTO ordenes_imagen (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')');
            if ($stmtIns) {
                $stmtIns->bind_param($tipos, ...$params);
                $stmtIns->execute();
                $stmtIns->close();
            }
        }

        if ($tieneCotizacionId && $tieneConsultaId && $consultaEpisodioId > 0) {
            $stmtAjuste = $conn->prepare('UPDATE ordenes_imagen SET consulta_id = ? WHERE cotizacion_id = ? AND (consulta_id IS NULL OR consulta_id = 0)');
            if ($stmtAjuste) {
                $stmtAjuste->bind_param('ii', $consultaEpisodioId, $cotizacionId);
                $stmtAjuste->execute();
                $stmtAjuste->close();
            }
        }
    }
}
