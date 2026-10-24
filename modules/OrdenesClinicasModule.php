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
