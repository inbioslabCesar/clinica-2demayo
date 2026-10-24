<?php
require_once __DIR__ . '/PaqueteComercialModule.php';
require_once __DIR__ . '/AgendaMedicoRegla.php';
require_once __DIR__ . '/EpisodioAtencionModule.php';
require_once __DIR__ . '/ConsultaClinicaModule.php';
require_once __DIR__ . '/OrdenesClinicasModule.php';
// Módulo de Cobros: lógica principal para registrar cobros y detalles
class CobroModule
{
    private static function toFloatFlexible($value)
    {
        if (is_int($value) || is_float($value)) {
            return (float)$value;
        }

        if (is_string($value)) {
            $normalized = str_replace(',', '.', trim($value));
            return is_numeric($normalized) ? (float)$normalized : 0.0;
        }

        return 0.0;
    }

    private static function calcularMontoOriginalDesdeDetalles($detalles)
    {
        if (!is_array($detalles)) {
            return 0.0;
        }

        $total = 0.0;
        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) continue;
            $subtotal = self::toFloatFlexible($detalle['subtotal'] ?? 0);
            if ($subtotal > 0) {
                $total += $subtotal;
            }
        }

        return max(0.0, round($total, 2));
    }

    private static function normalizarDescuento($data, $montoOriginal)
    {
        $montoOriginal = max(0.0, self::toFloatFlexible($montoOriginal));
        if ($montoOriginal <= 0) {
            return 0.0;
        }

        $tipo = strtolower(trim((string)($data['tipo_descuento'] ?? '')));
        $valor = self::toFloatFlexible($data['valor_descuento'] ?? 0);
        $montoEnviado = self::toFloatFlexible($data['monto_descuento'] ?? 0);

        if ($tipo === 'porcentaje') {
            $porcentaje = min(max($valor, 0.0), 100.0);
            return round(($montoOriginal * $porcentaje) / 100, 2);
        }

        if ($tipo === 'monto') {
            return round(min(max($valor, 0.0), $montoOriginal), 2);
        }

        return round(min(max($montoEnviado, 0.0), $montoOriginal), 2);
    }

    private static function normalizarServicioTipo($servicioTipo)
    {
        $tipo = strtolower(trim((string)$servicioTipo));
        if ($tipo === 'rayos_x' || $tipo === 'rayos x' || $tipo === 'rx') return 'rayosx';
        if ($tipo === 'operaciones') return 'operacion';
        if ($tipo === 'procedimientos') return 'procedimiento';
        return $tipo;
    }

    private static function normalizarTextoBusqueda($texto)
    {
        $texto = strtolower(trim((string)$texto));
        if ($texto === '') {
            return '';
        }

        $normalizado = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $texto);
        if ($normalizado !== false && $normalizado !== '') {
            $texto = strtolower($normalizado);
        }

        $texto = preg_replace('/[^a-z0-9]+/u', ' ', $texto);
        $texto = preg_replace('/\s+/u', ' ', $texto);

        return trim($texto);
    }

    private static function resolverExamenLaboratorioIdPorDescripcion($conn, $descripcion)
    {
        $descripcion = trim((string)$descripcion);
        if ($descripcion === '') {
            return 0;
        }

        $descripcionNormalizada = self::normalizarTextoBusqueda($descripcion);

        $stmtExact = $conn->prepare("SELECT id FROM examenes_laboratorio WHERE activo = 1 AND nombre = ? ORDER BY id DESC LIMIT 1");
        if ($stmtExact) {
            $stmtExact->bind_param("s", $descripcion);
            $stmtExact->execute();
            $row = $stmtExact->get_result()->fetch_assoc();
            if ($row && !empty($row['id'])) {
                return (int)$row['id'];
            }
        }

        $stmtExactNorm = $conn->prepare("SELECT id, nombre FROM examenes_laboratorio WHERE activo = 1 ORDER BY id DESC LIMIT 200");
        if ($stmtExactNorm) {
            $stmtExactNorm->execute();
            $rows = $stmtExactNorm->get_result()->fetch_all(MYSQLI_ASSOC);
            foreach ($rows as $row) {
                $nombreNormalizado = self::normalizarTextoBusqueda($row['nombre'] ?? '');
                if ($nombreNormalizado !== '' && $nombreNormalizado === $descripcionNormalizada) {
                    return (int)($row['id'] ?? 0);
                }
            }
        }

        $like = '%' . $descripcion . '%';
        $stmtLike = $conn->prepare("SELECT id FROM examenes_laboratorio WHERE activo = 1 AND nombre LIKE ? ORDER BY id DESC LIMIT 1");
        if ($stmtLike) {
            $stmtLike->bind_param("s", $like);
            $stmtLike->execute();
            $row = $stmtLike->get_result()->fetch_assoc();
            if ($row && !empty($row['id'])) {
                return (int)$row['id'];
            }
        }

        $tokens = array_values(array_filter(array_unique(explode(' ', $descripcionNormalizada)), static function ($token) {
            if ($token === '') {
                return false;
            }
            if (strlen($token) < 3) {
                return false;
            }
            return !in_array($token, ['completo', 'general', 'simple', 'basico', 'basica', 'perfil', 'paquete', 'examen', 'estudio', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con'], true);
        }));

        if (!empty($tokens)) {
            $mejorId = 0;
            $mejorPuntaje = 0;

            $stmtBusca = $conn->prepare("SELECT id, nombre FROM examenes_laboratorio WHERE activo = 1 AND nombre LIKE ? ORDER BY id DESC LIMIT 50");
            if ($stmtBusca) {
                foreach ($tokens as $token) {
                    $likeToken = '%' . $token . '%';
                    $stmtBusca->bind_param('s', $likeToken);
                    $stmtBusca->execute();
                    $res = $stmtBusca->get_result();
                    while ($row = $res->fetch_assoc()) {
                        $nombreNormalizado = self::normalizarTextoBusqueda($row['nombre'] ?? '');
                        if ($nombreNormalizado === '') {
                            continue;
                        }

                        $puntaje = 1;
                        foreach ($tokens as $otroToken) {
                            if (strpos($nombreNormalizado, $otroToken) !== false) {
                                $puntaje++;
                            }
                        }

                        if ($puntaje > $mejorPuntaje) {
                            $mejorPuntaje = $puntaje;
                            $mejorId = (int)($row['id'] ?? 0);
                        }
                    }
                }
            }

            if ($mejorId > 0) {
                return $mejorId;
            }
        }

        return 0;
    }

    private static function resolverMedicamentoIdPorDescripcion($conn, $descripcion)
    {
        $descripcion = trim((string)$descripcion);
        if ($descripcion === '') {
            return 0;
        }

        $stmtExact = $conn->prepare("SELECT id FROM medicamentos WHERE estado = 'activo' AND nombre = ? ORDER BY id DESC LIMIT 1");
        if ($stmtExact) {
            $stmtExact->bind_param("s", $descripcion);
            $stmtExact->execute();
            $row = $stmtExact->get_result()->fetch_assoc();
            if ($row && !empty($row['id'])) {
                return (int)$row['id'];
            }
        }

        $like = '%' . $descripcion . '%';
        $stmtLike = $conn->prepare("SELECT id FROM medicamentos WHERE estado = 'activo' AND nombre LIKE ? ORDER BY id DESC LIMIT 1");
        if ($stmtLike) {
            $stmtLike->bind_param("s", $like);
            $stmtLike->execute();
            $row = $stmtLike->get_result()->fetch_assoc();
            if ($row && !empty($row['id'])) {
                return (int)$row['id'];
            }
        }

        return 0;
    }

    private static function expandirDetallesPaquete($detalles, mysqli $conn)
    {
        return PaqueteComercialModule::expandir(
            (array)$detalles,
            static function ($tipo) { return self::normalizarServicioTipo($tipo); },
            static function (array $item) use ($conn): array {
                return PaqueteComercialModule::tarifa($conn, $item);
            }
        );
    }

    private static function enriquecerDetalleDesdeCotizacionDetalle($conn, $detalle)
    {
        if (!is_array($detalle) || !self::tableExists($conn, 'cotizaciones_detalle')) {
            return $detalle;
        }

        $detalleId = isset($detalle['cotizacion_detalle_id'])
            ? (int)$detalle['cotizacion_detalle_id']
            : (isset($detalle['detalle_id']) ? (int)$detalle['detalle_id'] : 0);
        if ($detalleId <= 0) {
            return $detalle;
        }

        $cols = ['id', 'servicio_tipo', 'servicio_id', 'descripcion', 'medico_id', 'consulta_id', 'snapshot_json'];
        if (self::columnExists($conn, 'cotizaciones_detalle', 'paquete_id')) {
            $cols[] = 'paquete_id';
        }
        if (self::columnExists($conn, 'cotizaciones_detalle', 'paquete_codigo')) {
            $cols[] = 'paquete_codigo';
        }
        if (self::columnExists($conn, 'cotizaciones_detalle', 'paquete_tipo')) {
            $cols[] = 'paquete_tipo';
        }

        $stmt = $conn->prepare('SELECT ' . implode(', ', $cols) . ' FROM cotizaciones_detalle WHERE id = ? LIMIT 1');
        if (!$stmt) {
            return $detalle;
        }
        $stmt->bind_param('i', $detalleId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            return $detalle;
        }

        if (!isset($detalle['servicio_tipo']) || trim((string)$detalle['servicio_tipo']) === '') {
            $detalle['servicio_tipo'] = (string)($row['servicio_tipo'] ?? '');
        }
        if (empty($detalle['servicio_id']) && !empty($row['servicio_id'])) {
            $detalle['servicio_id'] = (int)$row['servicio_id'];
        }
        if (!isset($detalle['descripcion']) || trim((string)$detalle['descripcion']) === '') {
            $detalle['descripcion'] = (string)($row['descripcion'] ?? '');
        }
        if (empty($detalle['medico_id']) && !empty($row['medico_id'])) {
            $detalle['medico_id'] = (int)$row['medico_id'];
        }
        if (empty($detalle['consulta_id']) && !empty($row['consulta_id'])) {
            $detalle['consulta_id'] = (int)$row['consulta_id'];
        }
        if ((!isset($detalle['snapshot_json']) || $detalle['snapshot_json'] === '' || $detalle['snapshot_json'] === null) && !empty($row['snapshot_json'])) {
            $detalle['snapshot_json'] = (string)$row['snapshot_json'];
        }
        if ((PaqueteComercialModule::snapshot($row)['paquete_modelo_comercial'] ?? '') === 'importe_unico') {
            $detalle['snapshot_json'] = $row['snapshot_json'];
            $detalle['servicio_tipo'] = $row['servicio_tipo'];
            $detalle['servicio_id'] = (int)$row['servicio_id'];
        }

        if (!isset($detalle['paquete_id']) && array_key_exists('paquete_id', $row)) {
            $detalle['paquete_id'] = !empty($row['paquete_id']) ? (int)$row['paquete_id'] : null;
        }
        if (!isset($detalle['paquete_codigo']) && array_key_exists('paquete_codigo', $row)) {
            $detalle['paquete_codigo'] = (string)($row['paquete_codigo'] ?? '');
        }
        if (!isset($detalle['paquete_tipo']) && array_key_exists('paquete_tipo', $row)) {
            $detalle['paquete_tipo'] = (string)($row['paquete_tipo'] ?? '');
        }

        return $detalle;
    }

    private static function distribuirDescuentoProporcionalEnDetalles($detalles, $montoDescuento)
    {
        if (!is_array($detalles) || empty($detalles)) {
            return [];
        }

        $montoDescuento = max(0.0, self::toFloatFlexible($montoDescuento));
        $acumuladoBase = 0.0;
        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) continue;
            $acumuladoBase += max(0.0, self::toFloatFlexible($detalle['subtotal'] ?? 0));
        }
        $acumuladoBase = round($acumuladoBase, 2);

        if ($montoDescuento <= 0 || $acumuladoBase <= 0) {
            foreach ($detalles as &$detalle) {
                if (!is_array($detalle)) continue;
                $sub = max(0.0, self::toFloatFlexible($detalle['subtotal'] ?? 0));
                $detalle['subtotal_original'] = round($sub, 2);
                $detalle['descuento_item'] = 0.0;
            }
            unset($detalle);
            return $detalles;
        }

        $descuentoTotal = min($montoDescuento, $acumuladoBase);
        $descuentoAsignado = 0.0;
        $indicesValidos = [];
        foreach ($detalles as $idx => $detalle) {
            $sub = max(0.0, self::toFloatFlexible($detalle['subtotal'] ?? 0));
            if ($sub > 0) {
                $indicesValidos[] = $idx;
            }
        }

        $ultimoIdx = !empty($indicesValidos) ? $indicesValidos[count($indicesValidos) - 1] : null;
        foreach ($detalles as $idx => &$detalle) {
            if (!is_array($detalle)) continue;

            $subtotalOriginal = max(0.0, self::toFloatFlexible($detalle['subtotal'] ?? 0));
            $detalle['subtotal_original'] = round($subtotalOriginal, 2);

            if ($subtotalOriginal <= 0 || $descuentoTotal <= 0) {
                $detalle['descuento_item'] = 0.0;
                continue;
            }

            if ($idx === $ultimoIdx) {
                $descuentoItem = max(0.0, round($descuentoTotal - $descuentoAsignado, 2));
            } else {
                $proporcion = $subtotalOriginal / $acumuladoBase;
                $descuentoItem = round($descuentoTotal * $proporcion, 2);
                $descuentoAsignado = round($descuentoAsignado + $descuentoItem, 2);
            }

            $descuentoItem = min($descuentoItem, $subtotalOriginal);
            $subtotalNeto = max(0.0, round($subtotalOriginal - $descuentoItem, 2));
            $cantidad = max(1, (int)($detalle['cantidad'] ?? 1));
            $precioNeto = round($subtotalNeto / $cantidad, 2);

            $detalle['descuento_item'] = round($descuentoItem, 2);
            $detalle['subtotal'] = $subtotalNeto;
            $detalle['precio_unitario'] = $precioNeto;
        }
        unset($detalle);

        return $detalles;
    }

    private static function resolverCotizacionIdsDesdeCobro($data)
    {
        $ids = [];

        if (isset($data['cotizacion_ids'])) {
            if (is_array($data['cotizacion_ids'])) {
                $ids = array_merge($ids, $data['cotizacion_ids']);
            } elseif (is_string($data['cotizacion_ids'])) {
                $ids = array_merge($ids, preg_split('/\s*,\s*/', trim($data['cotizacion_ids'])) ?: []);
            }
        }

        if (isset($data['cotizacion_id'])) {
            $ids[] = $data['cotizacion_id'];
        }

        if (isset($data['detalles']) && is_array($data['detalles'])) {
            foreach ($data['detalles'] as $detalle) {
                if (!is_array($detalle)) {
                    continue;
                }
                if (isset($detalle['cotizacion_id'])) {
                    $ids[] = $detalle['cotizacion_id'];
                }
            }
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), function ($id) {
            return $id > 0;
        })));
        sort($ids);
        return $ids;
    }

    private static function normalizarClientRequestId($value)
    {
        $id = trim((string)$value);
        if ($id === '') {
            return '';
        }

        if (strlen($id) > 80) {
            $id = substr($id, 0, 80);
        }

        if (!preg_match('/^[A-Za-z0-9._:-]+$/', $id)) {
            return '';
        }

        return $id;
    }

    private static function buscarCobroIdPorClientRequestId($conn, $clientRequestId, $usuarioId = 0)
    {
        $clientRequestId = self::normalizarClientRequestId($clientRequestId);
        if ($clientRequestId === '') {
            return 0;
        }
        if (!self::tableExists($conn, 'cobros') || !self::columnExists($conn, 'cobros', 'client_request_id')) {
            return 0;
        }

        $usuarioId = (int)$usuarioId;
        $stmt = $conn->prepare('SELECT id FROM cobros WHERE client_request_id = ?' . ($usuarioId > 0 ? ' AND usuario_id = ?' : '') . ' ORDER BY id DESC LIMIT 1');
        if (!$stmt) {
            return 0;
        }

        if ($usuarioId > 0) {
            $stmt->bind_param('si', $clientRequestId, $usuarioId);
        } else {
            $stmt->bind_param('s', $clientRequestId);
        }
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        return (int)($row['id'] ?? 0);
    }

    private static function construirRespuestaCobroIdempotente($cobroId)
    {
        $cobroId = (int)$cobroId;
        return [
            'success' => true,
            'cobro_id' => $cobroId,
            'numero_comprobante' => sprintf('C%06d', $cobroId),
            'idempotent_replay' => true,
            'message' => 'Cobro previamente registrado. Se devolvio la respuesta del mismo intento.'
        ];
    }

    private static function resolverFechaHoraCobroParaIngreso($conn, $cobroId)
    {
        $cobroId = (int)$cobroId;
        if ($cobroId <= 0) {
            return null;
        }

        if (!self::tableExists($conn, 'cobros') || !self::columnExists($conn, 'cobros', 'fecha_cobro')) {
            return null;
        }

        $stmt = $conn->prepare('SELECT fecha_cobro FROM cobros WHERE id = ? LIMIT 1');
        if (!$stmt) {
            return null;
        }

        $stmt->bind_param('i', $cobroId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $fechaCobro = trim((string)($row['fecha_cobro'] ?? ''));
        return $fechaCobro !== '' ? $fechaCobro : null;
    }

    private static function construirResumenCobroPorCotizacion($detalles)
    {
        $resumen = [];
        $orden = 0;

        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) {
                continue;
            }

            $cotizacionId = (int)($detalle['cotizacion_id'] ?? 0);
            if (!empty($detalle['_paquete_solo_honorario'])) continue;
            if ($cotizacionId <= 0) {
                continue;
            }

            if (!isset($resumen[$cotizacionId])) {
                $orden++;
                $resumen[$cotizacionId] = [
                    'cotizacion_id' => $cotizacionId,
                    'monto_original' => 0.0,
                    'descuento_aplicado' => 0.0,
                    'monto_aplicado' => 0.0,
                    'orden_aplicacion' => $orden,
                ];
            }

            $resumen[$cotizacionId]['monto_original'] += self::toFloatFlexible($detalle['subtotal_original'] ?? $detalle['subtotal'] ?? 0);
            $resumen[$cotizacionId]['descuento_aplicado'] += self::toFloatFlexible($detalle['descuento_item'] ?? 0);
            $resumen[$cotizacionId]['monto_aplicado'] += self::toFloatFlexible($detalle['subtotal'] ?? 0);
        }

        foreach ($resumen as &$row) {
            $row['monto_original'] = round($row['monto_original'], 2);
            $row['descuento_aplicado'] = round($row['descuento_aplicado'], 2);
            $row['monto_aplicado'] = round($row['monto_aplicado'], 2);
        }
        unset($row);

        return $resumen;
    }

    private static function bloquearCotizacionesParaCobro($conn, $cotizacionIds)
    {
        $cotizacionIds = array_values(array_unique(array_filter(array_map('intval', (array)$cotizacionIds), function ($id) {
            return $id > 0;
        })));
        if (empty($cotizacionIds) || !self::tableExists($conn, 'cotizaciones')) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($cotizacionIds), '?'));
        $types = str_repeat('i', count($cotizacionIds));
        $sql = "SELECT id, paciente_id, estado, observaciones, total, total_pagado, saldo_pendiente, "
            . (self::columnExists($conn, 'cotizaciones', 'fecha_vencimiento') ? 'fecha_vencimiento' : 'NULL AS fecha_vencimiento')
            . ", " . (self::columnExists($conn, 'cotizaciones', 'referencia_origen') ? 'referencia_origen' : 'NULL AS referencia_origen')
            . " FROM cotizaciones WHERE id IN ($placeholders) FOR UPDATE";

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            throw new \Exception('No se pudo bloquear las cotizaciones seleccionadas para el cobro.');
        }
        $stmt->bind_param($types, ...$cotizacionIds);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $byId = [];
        foreach ($rows as $row) {
            $byId[(int)($row['id'] ?? 0)] = $row;
        }

        return $byId;
    }

    private static function validarMontoContraSaldoCotizaciones($resumenPorCotizacion, $cotizacionesBloqueadas)
    {
        foreach ((array)$resumenPorCotizacion as $resumen) {
            $cotizacionId = (int)($resumen['cotizacion_id'] ?? 0);
            if ($cotizacionId <= 0 || !isset($cotizacionesBloqueadas[$cotizacionId])) {
                continue;
            }

            $cot = $cotizacionesBloqueadas[$cotizacionId];
            $totalActual = self::toFloatFlexible($cot['total'] ?? 0);
            $pagadoActual = self::toFloatFlexible($cot['total_pagado'] ?? 0);
            $saldoActual = self::toFloatFlexible($cot['saldo_pendiente'] ?? 0);
            $estadoActual = strtolower(trim((string)($cot['estado'] ?? 'pendiente')));
            if ($saldoActual <= 0 && $totalActual > $pagadoActual && $estadoActual !== 'pagado') {
                $saldoActual = max(0.0, round($totalActual - $pagadoActual, 2));
            }

            $montoAplicar = round(self::toFloatFlexible($resumen['monto_aplicado'] ?? 0), 2);
            if ($montoAplicar > round($saldoActual, 2) + 0.01) {
                throw new \Exception(
                    'El monto a cobrar de la cotización #' . $cotizacionId
                    . ' (S/ ' . number_format($montoAplicar, 2) . ') supera su saldo pendiente (S/ ' . number_format($saldoActual, 2) . ').'
                    . ' Es posible que este cobro ya se haya registrado. Refresca la pantalla antes de volver a cobrar.'
                );
            }
        }
    }

    private static function registrarCobroCotizaciones($conn, $cobroId, $resumenPorCotizacion, $cotizacionesBloqueadas, $usuarioId)
    {
        $cobroId = (int)$cobroId;
        $usuarioId = (int)$usuarioId;
        if ($cobroId <= 0 || empty($resumenPorCotizacion) || !self::tableExists($conn, 'cobros_cotizaciones')) {
            return;
        }

        $stmt = $conn->prepare(
            "INSERT INTO cobros_cotizaciones (
                cobro_id,
                cotizacion_id,
                monto_original,
                descuento_aplicado,
                monto_aplicado,
                saldo_anterior,
                saldo_nuevo,
                estado_resultado,
                orden_aplicacion,
                usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                monto_original = VALUES(monto_original),
                descuento_aplicado = VALUES(descuento_aplicado),
                monto_aplicado = VALUES(monto_aplicado),
                saldo_anterior = VALUES(saldo_anterior),
                saldo_nuevo = VALUES(saldo_nuevo),
                estado_resultado = VALUES(estado_resultado),
                orden_aplicacion = VALUES(orden_aplicacion),
                usuario_id = VALUES(usuario_id),
                updated_at = CURRENT_TIMESTAMP"
        );
        if (!$stmt) {
            throw new \Exception('No se pudo registrar la relación entre el cobro y las cotizaciones.');
        }

        foreach ($resumenPorCotizacion as $resumen) {
            $cotizacionId = (int)($resumen['cotizacion_id'] ?? 0);
            if ($cotizacionId <= 0 || !isset($cotizacionesBloqueadas[$cotizacionId])) {
                continue;
            }

            $cot = $cotizacionesBloqueadas[$cotizacionId];
            $totalActual = self::toFloatFlexible($cot['total'] ?? 0);
            $pagadoActual = self::toFloatFlexible($cot['total_pagado'] ?? 0);
            $saldoActual = self::toFloatFlexible($cot['saldo_pendiente'] ?? 0);
            $estadoActual = strtolower(trim((string)($cot['estado'] ?? 'pendiente')));
            if ($saldoActual <= 0 && $totalActual > $pagadoActual && $estadoActual !== 'pagado') {
                $saldoActual = max(0.0, round($totalActual - $pagadoActual, 2));
            }

            $montoOriginal = round(self::toFloatFlexible($resumen['monto_original'] ?? 0), 2);
            $descuentoAplicado = round(self::toFloatFlexible($resumen['descuento_aplicado'] ?? 0), 2);
            $montoAplicado = round(min(self::toFloatFlexible($resumen['monto_aplicado'] ?? 0), $saldoActual), 2);
            $totalAjustado = $descuentoAplicado > 0 ? max(0.0, round($totalActual - $descuentoAplicado, 2)) : $totalActual;
            $pagadoNuevo = min($totalAjustado, round($pagadoActual + $montoAplicado, 2));
            $saldoNuevo = max(0.0, round($totalAjustado - $pagadoNuevo, 2));
            $estadoResultado = $saldoNuevo <= 0 ? 'pagado' : ($montoAplicado > 0 ? 'parcial' : $estadoActual);
            $ordenAplicacion = (int)($resumen['orden_aplicacion'] ?? 1);

            $stmt->bind_param(
                'iidddddsii',
                $cobroId,
                $cotizacionId,
                $montoOriginal,
                $descuentoAplicado,
                $montoAplicado,
                $saldoActual,
                $saldoNuevo,
                $estadoResultado,
                $ordenAplicacion,
                $usuarioId
            );
            $stmt->execute();
        }

        $stmt->close();
    }

    private static function cargarDetallesCobros($conn, $cobroIds)
    {
        $cobroIds = array_values(array_unique(array_filter(array_map('intval', $cobroIds), function ($id) {
            return $id > 0;
        })));
        if (empty($cobroIds)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($cobroIds), '?'));
        $types = str_repeat('i', count($cobroIds));
        $sql = "SELECT * FROM cobros_detalle WHERE cobro_id IN ($placeholders) ORDER BY cobro_id ASC, id ASC";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$cobroIds);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

        $detallesPorCobro = [];
        foreach ($rows as $row) {
            $cobroId = (int)($row['cobro_id'] ?? 0);
            if (!isset($detallesPorCobro[$cobroId])) {
                $detallesPorCobro[$cobroId] = [];
            }
            $detallesPorCobro[$cobroId][] = $row;
        }

        return $detallesPorCobro;
    }

    private static function adjuntarDetallesCobros($conn, $cobros)
    {
        if (empty($cobros)) {
            return $cobros;
        }

        $detallesPorCobro = self::cargarDetallesCobros($conn, array_column($cobros, 'id'));
        foreach ($cobros as &$cobro) {
            $cobroId = (int)($cobro['id'] ?? 0);
            $cobro['detalles'] = $detallesPorCobro[$cobroId] ?? [];
        }
        unset($cobro);

        return $cobros;
    }

    private static function tableExists($conn, $tableName)
    {
        $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param("s", $tableName);
        $stmt->execute();
        $res = $stmt->get_result();
        return $res && $res->num_rows > 0;
    }

    private static function columnExists($conn, $tableName, $columnName)
    {
        $stmt = $conn->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param("ss", $tableName, $columnName);
        $stmt->execute();
        $res = $stmt->get_result();
        return $res && $res->num_rows > 0;
    }

    private static function normalizarDuracionSlot($value)
    {
        $slot = (int)$value;
        if ($slot <= 0) $slot = 30;
        if ($slot < 5) $slot = 5;
        if ($slot > 120) $slot = 120;
        return $slot;
    }

    private static function obtenerDuracionSlotMin($conn)
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }

        $cache = 30;
        if (!self::tableExists($conn, 'configuracion_clinica')
            || !self::columnExists($conn, 'configuracion_clinica', 'duracion_slot_min')) {
            return $cache;
        }

        $stmt = $conn->prepare('SELECT duracion_slot_min FROM configuracion_clinica ORDER BY id DESC LIMIT 1');
        if (!$stmt) {
            return $cache;
        }

        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $cache = self::normalizarDuracionSlot($row['duracion_slot_min'] ?? 30);
        return $cache;
    }

    private static function resolverMedicoDesdeConsulta($conn, $consultaId)
    {
        $consultaId = (int)$consultaId;
        if ($consultaId <= 0 || !self::tableExists($conn, 'consultas') || !self::columnExists($conn, 'consultas', 'medico_id')) {
            return 0;
        }

        $stmt = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if (!$stmt) {
            return 0;
        }
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        return (int)($row['medico_id'] ?? 0);
    }

    private static function resolverContextoClinicoCotizacion($conn, $cotizacionId, &$cacheMedicoConsulta)
    {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0 || !self::tableExists($conn, 'cotizaciones_detalle')) {
            return ['consulta_id' => 0, 'medico_id' => 0];
        }

        $hasConsultaId = self::columnExists($conn, 'cotizaciones_detalle', 'consulta_id');
        $hasMedicoId = self::columnExists($conn, 'cotizaciones_detalle', 'medico_id');
        if (!$hasConsultaId && !$hasMedicoId) {
            return ['consulta_id' => 0, 'medico_id' => 0];
        }

        $selectCols = [];
        if ($hasConsultaId) {
            $selectCols[] = 'cd.consulta_id';
        }
        if ($hasMedicoId) {
            $selectCols[] = 'cd.medico_id';
        }

        $where = [];
        if ($hasConsultaId) {
            $where[] = '(cd.consulta_id IS NOT NULL AND cd.consulta_id > 0)';
        }
        if ($hasMedicoId) {
            $where[] = '(cd.medico_id IS NOT NULL AND cd.medico_id > 0)';
        }

        if (empty($selectCols) || empty($where)) {
            return ['consulta_id' => 0, 'medico_id' => 0];
        }

        $whereEstado = self::columnExists($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND cd.estado_item <> 'eliminado'"
            : '';

        $sql = 'SELECT ' . implode(', ', $selectCols) . '
                FROM cotizaciones_detalle cd
                WHERE cd.cotizacion_id = ?
                  AND (' . implode(' OR ', $where) . ')'
                . $whereEstado . '
                ORDER BY CASE WHEN LOWER(TRIM(cd.servicio_tipo)) = "consulta" THEN 0 ELSE 1 END, cd.id ASC
                LIMIT 1';

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return ['consulta_id' => 0, 'medico_id' => 0];
        }
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            return ['consulta_id' => 0, 'medico_id' => 0];
        }

        $consultaId = (int)($row['consulta_id'] ?? 0);
        $medicoId = (int)($row['medico_id'] ?? 0);

        if ($medicoId <= 0 && $consultaId > 0) {
            if (!array_key_exists($consultaId, $cacheMedicoConsulta)) {
                $cacheMedicoConsulta[$consultaId] = self::resolverMedicoDesdeConsulta($conn, $consultaId);
            }
            $medicoId = (int)$cacheMedicoConsulta[$consultaId];
        }

        return [
            'consulta_id' => max(0, $consultaId),
            'medico_id' => max(0, $medicoId),
        ];
    }

    private static function resolverOrigenOperacionProduccionDetalle($detalle, $clasificacionOrigen, $cotizacionId)
    {
        $origen = strtolower(trim((string)($detalle['origen_operacion'] ?? '')));
        if ($origen !== '') {
            return $origen;
        }

        $servicioTipo = self::normalizarServicioTipo($detalle['servicio_tipo'] ?? '');

        if ($cotizacionId > 0) {
            return 'cotizacion';
        }

        if ($clasificacionOrigen === 'venta_directa') {
            if ($servicioTipo === 'farmacia') {
                return 'farmacia_directa';
            }
            return 'caja_directa';
        }

        return 'cobro_directo';
    }

    private static function registrarProduccionMedicaDetalle($conn, $data, $cobroId, $cajaId = null, $turno = null)
    {
        if (!self::tableExists($conn, 'produccion_medica_detalle')) {
            return;
        }

        $detalles = is_array($data['detalles'] ?? null) ? $data['detalles'] : [];
        if (empty($detalles)) {
            return;
        }

        $pacienteIdGlobal = isset($data['paciente_id']) && $data['paciente_id'] !== 'null'
            ? (int)$data['paciente_id']
            : null;
        $usuarioCajaId = (int)($_SESSION['usuario']['id'] ?? ($data['usuario_id'] ?? 0));
        $cotizacionIdGlobal = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
        $tipoPago = strtolower(trim((string)($data['tipo_pago'] ?? '')));
        $fechaCobro = date('Y-m-d H:i:s');
        $periodo = date('Ym');

        $sql = "INSERT INTO produccion_medica_detalle (
            fecha_cobro,
            periodo_yyyymm,
            cobro_id,
            cobro_detalle_idx,
            cotizacion_id,
            cotizacion_detalle_id,
            consulta_id,
            medico_id,
            paciente_id,
            clasificacion_origen,
            origen_operacion,
            servicio_tipo,
            servicio_id,
            servicio_nombre,
            cantidad,
            precio_unitario_lista,
            monto_bruto_item,
            descuento_item,
            monto_neto_item,
            usuario_caja_id,
            caja_id,
            turno,
            tipo_pago,
            hash_origen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            consulta_id = VALUES(consulta_id),
            medico_id = VALUES(medico_id),
            paciente_id = VALUES(paciente_id),
            clasificacion_origen = VALUES(clasificacion_origen),
            origen_operacion = VALUES(origen_operacion),
            servicio_nombre = VALUES(servicio_nombre),
            cantidad = VALUES(cantidad),
            precio_unitario_lista = VALUES(precio_unitario_lista),
            monto_bruto_item = VALUES(monto_bruto_item),
            descuento_item = VALUES(descuento_item),
            monto_neto_item = VALUES(monto_neto_item),
            usuario_caja_id = VALUES(usuario_caja_id),
            caja_id = VALUES(caja_id),
            turno = VALUES(turno),
            tipo_pago = VALUES(tipo_pago),
            updated_at = CURRENT_TIMESTAMP";

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            throw new \Exception('No se pudo preparar inserción en produccion_medica_detalle');
        }

        $cacheMedicoConsulta = [];
        $cacheContextoCotizacion = [];
        foreach ($detalles as $idx => $detalle) {
            if (!is_array($detalle)) {
                continue;
            }

            $servicioTipo = self::normalizarServicioTipo($detalle['servicio_tipo'] ?? 'otros');
            $servicioId = isset($detalle['servicio_id']) && $detalle['servicio_id'] !== ''
                ? (int)$detalle['servicio_id']
                : null;
            $servicioNombre = trim((string)($detalle['descripcion'] ?? 'Servicio'));

            $cantidad = self::toFloatFlexible($detalle['cantidad'] ?? 1);
            if ($cantidad <= 0) {
                $cantidad = 1.0;
            }

            $descuentoItem = max(0.0, self::toFloatFlexible($detalle['descuento_item'] ?? 0));
            $montoNeto = max(0.0, self::toFloatFlexible($detalle['subtotal'] ?? 0));
            $montoBruto = self::toFloatFlexible($detalle['subtotal_original'] ?? 0);
            if ($montoBruto <= 0) {
                $montoBruto = $montoNeto + $descuentoItem;
            }
            $montoBruto = max(0.0, round($montoBruto, 2));
            $montoNeto = max(0.0, round($montoNeto, 2));
            $descuentoItem = max(0.0, round($descuentoItem, 2));

            $precioUnitarioLista = $cantidad > 0 ? round($montoBruto / $cantidad, 2) : 0.0;

            $cotizacionId = isset($detalle['cotizacion_id']) ? (int)$detalle['cotizacion_id'] : $cotizacionIdGlobal;
            if ($cotizacionId <= 0) {
                $cotizacionId = null;
            }

            $cotizacionDetalleId = isset($detalle['cotizacion_detalle_id'])
                ? (int)$detalle['cotizacion_detalle_id']
                : (isset($detalle['detalle_id']) ? (int)$detalle['detalle_id'] : 0);
            if ($cotizacionDetalleId <= 0) {
                $cotizacionDetalleId = null;
            }

            $consultaId = isset($detalle['consulta_id']) ? (int)$detalle['consulta_id'] : 0;
            if ($consultaId <= 0) {
                $consultaId = null;
            }

            $medicoId = isset($detalle['medico_id']) ? (int)$detalle['medico_id'] : 0;
            if ($medicoId <= 0 && $consultaId !== null) {
                if (!array_key_exists($consultaId, $cacheMedicoConsulta)) {
                    $cacheMedicoConsulta[$consultaId] = self::resolverMedicoDesdeConsulta($conn, $consultaId);
                }
                $medicoId = (int)$cacheMedicoConsulta[$consultaId];
            }

            if (($consultaId === null || $medicoId <= 0) && $cotizacionId !== null) {
                $cotizacionCtxId = (int)$cotizacionId;
                if (!array_key_exists($cotizacionCtxId, $cacheContextoCotizacion)) {
                    $cacheContextoCotizacion[$cotizacionCtxId] = self::resolverContextoClinicoCotizacion($conn, $cotizacionCtxId, $cacheMedicoConsulta);
                }
                $ctx = $cacheContextoCotizacion[$cotizacionCtxId];
                $consultaCtx = (int)($ctx['consulta_id'] ?? 0);
                $medicoCtx = (int)($ctx['medico_id'] ?? 0);

                if ($consultaId === null && $consultaCtx > 0) {
                    $consultaId = $consultaCtx;
                }
                if ($medicoId <= 0 && $medicoCtx > 0) {
                    $medicoId = $medicoCtx;
                }
            }

            if ($medicoId <= 0) {
                $medicoId = null;
            }

            $pacienteId = isset($detalle['paciente_id']) && $detalle['paciente_id'] !== null && $detalle['paciente_id'] !== 'null'
                ? (int)$detalle['paciente_id']
                : $pacienteIdGlobal;
            if ($pacienteId !== null && $pacienteId <= 0) {
                $pacienteId = null;
            }

            $clasificacionOrigen = ($consultaId !== null || $medicoId !== null)
                ? 'produccion_medica'
                : 'venta_directa';
            $origenOperacion = self::resolverOrigenOperacionProduccionDetalle($detalle, $clasificacionOrigen, (int)($cotizacionId ?? 0));

            $hashOrigen = sha1(implode('|', [
                (int)$cobroId,
                (int)$idx,
                (string)$servicioTipo,
                (string)($servicioId ?? 0),
                (string)($cotizacionId ?? 0),
                (string)($cotizacionDetalleId ?? 0),
                number_format($montoNeto, 2, '.', ''),
            ]));

            $cobroDetalleIdx = (int)$idx + 1;
            $cajaIdVal = $cajaId !== null ? (int)$cajaId : null;
            $turnoVal = $turno !== null ? (string)$turno : null;
            $tipoPagoVal = $tipoPago !== '' ? $tipoPago : null;

            $stmt->bind_param(
                'ssiiiiiiisssisdddddiisss',
                $fechaCobro,
                $periodo,
                $cobroId,
                $cobroDetalleIdx,
                $cotizacionId,
                $cotizacionDetalleId,
                $consultaId,
                $medicoId,
                $pacienteId,
                $clasificacionOrigen,
                $origenOperacion,
                $servicioTipo,
                $servicioId,
                $servicioNombre,
                $cantidad,
                $precioUnitarioLista,
                $montoBruto,
                $descuentoItem,
                $montoNeto,
                $usuarioCajaId,
                $cajaIdVal,
                $turnoVal,
                $tipoPagoVal,
                $hashOrigen
            );

            $stmt->execute();
        }

        $stmt->close();
    }

    private static function resolverCotizacionIdDesdeCobro($data)
    {
        $ids = self::resolverCotizacionIdsDesdeCobro($data);
        return !empty($ids) ? (int)$ids[0] : 0;
    }

    private static function cotizacionEstaPagada($conn, $cotizacionId)
    {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0 || !self::tableExists($conn, 'cotizaciones')) {
            return false;
        }

        $stmt = $conn->prepare("SELECT estado FROM cotizaciones WHERE id = ? LIMIT 1");
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param("i", $cotizacionId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        if (!$row) {
            return false;
        }

        return strtolower(trim((string)($row['estado'] ?? ''))) === 'pagado';
    }

    private static function sincronizarAbonoCotizacionDesdeCobro($conn, $cotizacionId, $cobroId, $montoCobrado, $usuarioId, $montoDescuento = 0.0, $modoCobro = '')
    {
        $cotizacionId = (int)$cotizacionId;
        $cobroId = (int)$cobroId;
        $usuarioId = (int)$usuarioId;
        $montoCobrado = (float)$montoCobrado;
        $montoDescuento = max(0.0, (float)$montoDescuento);

        if ($cotizacionId <= 0 || $cobroId <= 0 || ($montoCobrado <= 0 && $montoDescuento <= 0)) {
            return;
        }

        if (!self::tableExists($conn, 'cotizaciones')) {
            return;
        }

        $hasSaldoV2 = self::columnExists($conn, 'cotizaciones', 'total_pagado') && self::columnExists($conn, 'cotizaciones', 'saldo_pendiente');
        if (!$hasSaldoV2) {
            return;
        }

        $stmtCot = $conn->prepare("SELECT id, total, total_pagado, saldo_pendiente, estado FROM cotizaciones WHERE id = ? FOR UPDATE");
        if (!$stmtCot) {
            throw new \Exception('No se pudo preparar lectura de cotización para sincronizar cobro');
        }
        $stmtCot->bind_param("i", $cotizacionId);
        $stmtCot->execute();
        $cot = $stmtCot->get_result()->fetch_assoc();
        if (!$cot) {
            return;
        }

        $total = (float)($cot['total'] ?? 0);
        $pagadoActual = (float)($cot['total_pagado'] ?? 0);
        $saldoActual = (float)($cot['saldo_pendiente'] ?? 0);
        $estadoActual = strtolower((string)($cot['estado'] ?? 'pendiente'));

        if ($saldoActual <= 0 && $total > $pagadoActual && $estadoActual !== 'pagado') {
            $saldoActual = max(0, $total - $pagadoActual);
        }

        // Aplicar descuento al total de la cotización si corresponde
        $totalAjustado = $montoDescuento > 0 ? max(0.0, $total - $montoDescuento) : $total;

        $montoAplicado = min($montoCobrado, $saldoActual);
        if ($montoAplicado <= 0 && $montoDescuento <= 0) {
            return;
        }

        $pagadoNuevo = min($totalAjustado, $pagadoActual + $montoAplicado);
        $saldoNuevo = max(0.0, $totalAjustado - $pagadoNuevo);
        $estadoNuevo = $saldoNuevo <= 0 ? 'pagado' : 'parcial';

        if ($montoDescuento > 0) {
            $stmtUp = $conn->prepare("UPDATE cotizaciones SET total = ?, total_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?");
            if (!$stmtUp) {
                throw new \Exception('No se pudo preparar actualización de cotización desde cobro');
            }
            $stmtUp->bind_param("dddsi", $totalAjustado, $pagadoNuevo, $saldoNuevo, $estadoNuevo, $cotizacionId);
        } else {
            $stmtUp = $conn->prepare("UPDATE cotizaciones SET total_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?");
            if (!$stmtUp) {
                throw new \Exception('No se pudo preparar actualización de cotización desde cobro');
            }
            $stmtUp->bind_param("ddsi", $pagadoNuevo, $saldoNuevo, $estadoNuevo, $cotizacionId);
        }
        $stmtUp->execute();

        if (self::tableExists($conn, 'cotizacion_movimientos')) {
            $stmtDup = $conn->prepare("SELECT id FROM cotizacion_movimientos WHERE cotizacion_id = ? AND cobro_id = ? AND tipo_movimiento = 'abono' LIMIT 1");
            if ($stmtDup) {
                $stmtDup->bind_param("ii", $cotizacionId, $cobroId);
                $stmtDup->execute();
                $exists = $stmtDup->get_result()->fetch_assoc();
                if ($exists) {
                    return;
                }
            }

            $modoCobroNorm = strtolower(trim((string)$modoCobro));
            $esAdelantoManual = ($modoCobroNorm === 'parcial' || $modoCobroNorm === 'adelanto_manual');
            if (!$esAdelantoManual) {
                // Fallback por saldo: si aún queda saldo tras aplicar, es adelanto.
                $esAdelantoManual = $saldoNuevo > 0.00001;
            }
            $descripcion = $esAdelantoManual
                ? ('Adelanto manual desde cobro #' . $cobroId)
                : ('Cobro final desde cobro #' . $cobroId);
            $tipoMov = 'abono';
            if ($montoAplicado > 0) {
                $stmtMov = $conn->prepare("INSERT INTO cotizacion_movimientos (cotizacion_id, cobro_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                if ($stmtMov) {
                    $stmtMov->bind_param("iisdddsi", $cotizacionId, $cobroId, $tipoMov, $montoAplicado, $saldoActual, $saldoNuevo, $descripcion, $usuarioId);
                    $stmtMov->execute();
                }
            }

            if ($montoDescuento > 0) {
                $tipoMovDesc = 'devolucion';
                $descripcionDesc = 'Descuento aplicado en cobro #' . $cobroId;
                $saldoTrasAbono = $saldoNuevo + $montoDescuento; // saldo antes de aplicar el descuento
                $stmtMovDesc = $conn->prepare("INSERT INTO cotizacion_movimientos (cotizacion_id, cobro_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                if ($stmtMovDesc) {
                    $stmtMovDesc->bind_param("iisdddsi", $cotizacionId, $cobroId, $tipoMovDesc, $montoDescuento, $saldoTrasAbono, $saldoNuevo, $descripcionDesc, $usuarioId);
                    $stmtMovDesc->execute();
                }
            }
        }
    }

    private static function cargarDetallesCotizacionActivos($conn, $cotizacionId)
    {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0 || !self::tableExists($conn, 'cotizaciones_detalle')) {
            return [];
        }

        $whereEstado = self::columnExists($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND estado_item <> 'eliminado'"
            : '';

        $stmt = $conn->prepare("SELECT * FROM cotizaciones_detalle WHERE cotizacion_id = ?{$whereEstado}");
        if (!$stmt) {
            return [];
        }
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        return is_array($rows) ? $rows : [];
    }

    private static function resolverTipoOrdenImagen($servicioTipo, $descripcion = '')
    {
        return oc_resolver_tipo_orden_imagen($servicioTipo, $descripcion);
    }

    private static function asegurarConsultaDesdeCotizacion($conn, $cotizacionId)
    {
        // El cobro nunca debe fallar por la consulta: ante cualquier error devuelve consulta_id 0.
        $r = cc_asegurar_consulta_desde_cotizacion($conn, (int)$cotizacionId);
        return [
            'success' => true,
            'consulta_id' => (int)($r['consulta_id'] ?? 0),
            'ya_existia' => !empty($r['ya_existia']),
        ];
    }

    private static function crearOrdenesLaboratorioCotizacion($conn, $cotizacionId, $pacienteId, $detalles, $consultaId = 0)
    {
        oc_crear_ordenes_laboratorio($conn, $cotizacionId, $pacienteId, $detalles, $consultaId);
    }

    private static function crearOrdenesProcedimientosCotizacion($conn, $cotizacionId, $pacienteId, $detalles, $consultaId = 0, $usuarioId = 0)
    {
        oc_crear_ordenes_procedimientos($conn, $cotizacionId, $pacienteId, $detalles, $consultaId, $usuarioId);
    }

    private static function crearOrdenesImagenCotizacion($conn, $cotizacionId, $pacienteId, $detalles, $usuarioId = 0, $consultaId = 0)
    {
        // El cobro ya conoce la consulta del episodio; el vínculo propio de cada detalle tiene prioridad.
        oc_crear_ordenes_imagen($conn, $cotizacionId, $pacienteId, $detalles, $consultaId, $usuarioId);
    }

    private static function desbloquearConsultasPorCotizacion($conn, $cotizacionId)
    {
        cc_reabrir_consultas_falta_cancelar($conn, $cotizacionId);
    }

    private static function sincronizarServiciosClinicosPostPagoCotizacion($conn, $cotizacionId, $usuarioId = 0)
    {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0 || !self::tableExists($conn, 'cotizaciones')) {
            return;
        }

        $stmtCot = $conn->prepare('SELECT paciente_id FROM cotizaciones WHERE id = ? LIMIT 1');
        if (!$stmtCot) {
            return;
        }
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $row = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();
        $pacienteId = (int)($row['paciente_id'] ?? 0);
        if ($pacienteId <= 0) {
            return;
        }

        $detalles = self::cargarDetallesCotizacionActivos($conn, $cotizacionId);
        $consultaSync = self::asegurarConsultaDesdeCotizacion($conn, $cotizacionId);
        $consultaId = (int)($consultaSync['consulta_id'] ?? 0);

        self::crearOrdenesProcedimientosCotizacion($conn, $cotizacionId, $pacienteId, $detalles, $consultaId, (int)$usuarioId);
        self::crearOrdenesLaboratorioCotizacion($conn, $cotizacionId, $pacienteId, $detalles, $consultaId);
        self::crearOrdenesImagenCotizacion($conn, $cotizacionId, $pacienteId, $detalles, (int)$usuarioId, $consultaId);
        if ($consultaId > 0) {
            episodio_adoptar_servicios_en_consulta($conn, $cotizacionId, $consultaId);
        }
        self::desbloquearConsultasPorCotizacion($conn, $cotizacionId);
    }

    private static function confirmarAgendaServiciosPorCobro($conn, $cotizacionId, $usuarioId = 0)
    {
        $cotizacionId = (int)$cotizacionId;
        $usuarioId = (int)$usuarioId;
        if ($cotizacionId <= 0) {
            return;
        }
        if (!self::tableExists($conn, 'agenda_servicios_cotizacion')) {
            return;
        }
        if (!self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')) {
            return;
        }
        if (!self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')) {
            return;
        }

        $sets = ['estado_evento = "confirmado"'];
        if (self::columnExists($conn, 'agenda_servicios_cotizacion', 'updated_by')) {
            $sets[] = 'updated_by = ?';
        }

        $sql = 'UPDATE agenda_servicios_cotizacion SET ' . implode(', ', $sets)
            . ' WHERE cotizacion_id = ?'
            . ' AND LOWER(TRIM(COALESCE(estado_evento, ""))) = "pendiente"';

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return;
        }

        if (self::columnExists($conn, 'agenda_servicios_cotizacion', 'updated_by')) {
            $stmt->bind_param('ii', $usuarioId, $cotizacionId);
        } else {
            $stmt->bind_param('i', $cotizacionId);
        }
        $stmt->execute();
        $stmt->close();
    }

    private static function normalizarFechaProgramadaAgenda($value)
    {
        $raw = trim((string)$value);
        if ($raw === '') {
            return null;
        }
        $ts = strtotime($raw);
        if ($ts === false) {
            return null;
        }
        return date('Y-m-d', $ts);
    }

    private static function normalizarHoraProgramadaAgenda($value)
    {
        $raw = trim((string)$value);
        if ($raw === '') {
            return null;
        }
        if (preg_match('/^(\d{2}):(\d{2})(:\d{2})?$/', $raw)) {
            $parts = explode(':', $raw);
            return sprintf('%02d:%02d:00', (int)$parts[0], (int)$parts[1]);
        }
        $ts = strtotime($raw);
        if ($ts === false) {
            return null;
        }
        return date('H:i:s', $ts);
    }

    private static function servicioTipoEsAgendable($servicioTipo)
    {
        $tipo = self::normalizarServicioTipo($servicioTipo);
        return in_array($tipo, [
            'ecografia',
            'rayosx',
            'tomografia',
            'procedimiento',
            'operacion',
            'hospitalizacion',
            'laboratorio',
            'imagen',
            'imagenologia',
        ], true);
    }

    // Solo los servicios que realiza el médico ocupan su horario (no laboratorio ni líneas de paquete).
    private static function filtroServicioOcupaMedicoSql($conn)
    {
        return self::columnExists($conn, 'agenda_servicios_cotizacion', 'servicio_tipo')
            ? ' AND ' . agenda_sql_servicio_ocupa_medico('')
            : '';
    }

    private static function servicioTipoRequiereValidacionHorarioCobro($servicioTipo)
    {
        $tipo = self::normalizarServicioTipo($servicioTipo);
        return in_array($tipo, [
            'ecografia',
            'rayosx',
            'tomografia',
            'procedimiento',
            'operacion',
            'hospitalizacion',
            'imagen',
            'imagenologia',
        ], true);
    }

    private static function cotizacionProvieneHc($cotizacion)
    {
        if (!is_array($cotizacion)) return false;

        $referencia = strtolower(trim((string)($cotizacion['referencia_origen'] ?? '')));
        $obs = strtolower(trim((string)($cotizacion['observaciones'] ?? '')));

        if ($referencia !== '' && strpos($referencia, 'hc') !== false) {
            return true;
        }
        if ($obs !== '' && (
            strpos($obs, 'desde consulta #') !== false
            || strpos($obs, 'hc consulta #') !== false
            || strpos($obs, 'orden de ') !== false
        )) {
            return true;
        }

        return false;
    }

    private static function cotizacionDetalleProvieneHcPorOrdenImagen($conn, $cotizacionId, $detalleId = 0)
    {
        $cotizacionId = (int)$cotizacionId;
        $detalleId = (int)$detalleId;
        if ($cotizacionId <= 0) {
            return false;
        }
        if (!self::tableExists($conn, 'ordenes_imagen')) {
            return false;
        }
        if (!self::columnExists($conn, 'ordenes_imagen', 'cotizacion_id')) {
            return false;
        }

        $cols = [];
        if (self::columnExists($conn, 'ordenes_imagen', 'consulta_id')) {
            $cols[] = 'consulta_id';
        } else {
            $cols[] = '0 AS consulta_id';
        }
        if (self::columnExists($conn, 'ordenes_imagen', 'indicaciones')) {
            $cols[] = 'indicaciones';
        } else {
            $cols[] = '"" AS indicaciones';
        }

        $sql = 'SELECT ' . implode(', ', $cols)
            . ' FROM ordenes_imagen WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 5';
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $res = $stmt->get_result();

        $needleDetalle = $detalleId > 0 ? ('detalle #' . $detalleId) : '';
        $fallback = false;
        while ($res && ($row = $res->fetch_assoc())) {
            $consultaId = (int)($row['consulta_id'] ?? 0);
            $indicaciones = strtolower(trim((string)($row['indicaciones'] ?? '')));
            $matchDetalle = $needleDetalle === '' || ($indicaciones !== '' && strpos($indicaciones, $needleDetalle) !== false);
            $marcaHc = $consultaId > 0
                || ($indicaciones !== '' && (
                    strpos($indicaciones, 'desde consulta #') !== false
                    || strpos($indicaciones, 'hc consulta #') !== false
                ));

            if ($matchDetalle && $marcaHc) {
                $stmt->close();
                return true;
            }

            if ($marcaHc) {
                $fallback = true;
            }
        }

        $stmt->close();
        return $fallback;
    }

    private static function toMinutesFromHm($hora)
    {
        $h = trim((string)$hora);
        if (!preg_match('/^(\d{2}):(\d{2})(:\d{2})?$/', $h, $m)) {
            return null;
        }
        $hh = (int)$m[1];
        $mm = (int)$m[2];
        if ($hh < 0 || $hh > 23 || $mm < 0 || $mm > 59) {
            return null;
        }
        return ($hh * 60) + $mm;
    }

    private static function toHmFromMinutes($minutes)
    {
        $val = max(0, min(1439, (int)$minutes));
        $hh = (int)floor($val / 60);
        $mm = $val % 60;
        return sprintf('%02d:%02d:00', $hh, $mm);
    }

    private static function resolverHorariosDisponiblesMedicoFecha($conn, $medicoId, $fechaYmd, $horaReferencia = null, $maxSugerencias = 6)
    {
        $medicoId = (int)$medicoId;
        $fechaYmd = trim((string)$fechaYmd);
        $maxSugerencias = max(1, min(12, (int)$maxSugerencias));

        if ($medicoId <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaYmd)) {
            return [];
        }

        $ocupadas = [];

        if (self::tableExists($conn, 'consultas')) {
            $stmtOccC = $conn->prepare('SELECT hora FROM consultas WHERE medico_id = ? AND fecha = ? AND ' . agenda_sql_consulta_ocupa_medico(''));
            if ($stmtOccC) {
                $stmtOccC->bind_param('is', $medicoId, $fechaYmd);
                $stmtOccC->execute();
                $resOccC = $stmtOccC->get_result();
                while ($resOccC && ($row = $resOccC->fetch_assoc())) {
                    $horaDb = self::normalizarHoraProgramadaAgenda($row['hora'] ?? null);
                    if ($horaDb !== null) {
                        $ocupadas[$horaDb] = true;
                    }
                }
                $stmtOccC->close();
            }
        }

        if (self::tableExists($conn, 'agenda_servicios_cotizacion')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'medico_id')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')) {
            $stmtOccA = $conn->prepare('SELECT hora_programada FROM agenda_servicios_cotizacion WHERE medico_id = ? AND fecha_programada = ? AND ' . agenda_sql_evento_ocupa_medico('') . self::filtroServicioOcupaMedicoSql($conn));
            if ($stmtOccA) {
                $stmtOccA->bind_param('is', $medicoId, $fechaYmd);
                $stmtOccA->execute();
                $resOccA = $stmtOccA->get_result();
                while ($resOccA && ($row = $resOccA->fetch_assoc())) {
                    $horaDb = self::normalizarHoraProgramadaAgenda($row['hora_programada'] ?? null);
                    if ($horaDb !== null) {
                        $ocupadas[$horaDb] = true;
                    }
                }
                $stmtOccA->close();
            }
        }

        $slots = [];
        $slotMinutes = self::obtenerDuracionSlotMin($conn);
        if (self::tableExists($conn, 'disponibilidad_medicos')) {
            $stmtDisp = $conn->prepare('SELECT hora_inicio, hora_fin FROM disponibilidad_medicos WHERE medico_id = ? AND fecha = ? ORDER BY hora_inicio ASC');
            if ($stmtDisp) {
                $stmtDisp->bind_param('is', $medicoId, $fechaYmd);
                $stmtDisp->execute();
                $resDisp = $stmtDisp->get_result();
                while ($resDisp && ($row = $resDisp->fetch_assoc())) {
                    $ini = self::toMinutesFromHm((string)($row['hora_inicio'] ?? ''));
                    $fin = self::toMinutesFromHm((string)($row['hora_fin'] ?? ''));
                    if ($ini === null || $fin === null || $fin <= $ini) continue;
                    for ($m = $ini; $m < $fin; $m += $slotMinutes) {
                        $h = self::toHmFromMinutes($m);
                        if (!isset($ocupadas[$h])) {
                            $slots[$h] = true;
                        }
                    }
                }
                $stmtDisp->close();
            }
        }

        if (empty($slots)) {
            for ($m = (7 * 60); $m <= (20 * 60); $m += $slotMinutes) {
                $h = self::toHmFromMinutes($m);
                if (!isset($ocupadas[$h])) {
                    $slots[$h] = true;
                }
            }
        }

        $slotList = array_keys($slots);
        sort($slotList);

        $refMin = self::toMinutesFromHm((string)$horaReferencia);
        if ($refMin !== null) {
            usort($slotList, function ($a, $b) use ($refMin) {
                $ma = self::toMinutesFromHm($a);
                $mb = self::toMinutesFromHm($b);
                $da = $ma === null ? 9999 : (($ma >= $refMin) ? ($ma - $refMin) : (1440 + $ma - $refMin));
                $db = $mb === null ? 9999 : (($mb >= $refMin) ? ($mb - $refMin) : (1440 + $mb - $refMin));
                if ($da === $db) return strcmp($a, $b);
                return $da <=> $db;
            });
        }

        $out = [];
        foreach ($slotList as $horaDb) {
            $out[] = [
                'fecha_programada' => $fechaYmd,
                'hora_programada' => $horaDb,
                'hora_label' => substr($horaDb, 0, 5),
            ];
            if (count($out) >= $maxSugerencias) break;
        }

        return $out;
    }

    private static function filtrarHorariosPosteriores($sugeridos, $minutosBase)
    {
        $base = is_numeric($minutosBase) ? (int)$minutosBase : null;
        if ($base === null) {
            return is_array($sugeridos) ? array_values($sugeridos) : [];
        }

        $out = [];
        foreach ((array)$sugeridos as $slot) {
            if (!is_array($slot)) continue;
            $hora = self::normalizarHoraProgramadaAgenda($slot['hora_programada'] ?? null);
            $m = self::toMinutesFromHm((string)$hora);
            if ($m === null || $m <= $base) {
                continue;
            }
            $out[] = [
                'fecha_programada' => (string)($slot['fecha_programada'] ?? ''),
                'hora_programada' => $hora,
                'hora_label' => substr((string)$hora, 0, 5),
            ];
        }

        return $out;
    }

    private static function resolverHoraMaximaOcupadaDia($conn, $medicoId, $fechaYmd, $consultaExcluirId = 0, $agendaExcluirId = 0, $cotizacionExcluirId = 0, $detalleExcluirId = 0)
    {
        $medicoId = (int)$medicoId;
        $consultaExcluirId = (int)$consultaExcluirId;
        $agendaExcluirId = (int)$agendaExcluirId;
        $cotizacionExcluirId = (int)$cotizacionExcluirId;
        $detalleExcluirId = (int)$detalleExcluirId;
        $fechaYmd = trim((string)$fechaYmd);

        if ($medicoId <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaYmd)) {
            return null;
        }

        $maxMin = null;

        if (self::tableExists($conn, 'consultas')) {
            $sqlC = 'SELECT hora FROM consultas WHERE medico_id = ? AND fecha = ? AND ' . agenda_sql_consulta_ocupa_medico('');
            if ($consultaExcluirId > 0) {
                $sqlC .= ' AND id <> ?';
            }
            $stmtC = $conn->prepare($sqlC);
            if ($stmtC) {
                if ($consultaExcluirId > 0) {
                    $stmtC->bind_param('isi', $medicoId, $fechaYmd, $consultaExcluirId);
                } else {
                    $stmtC->bind_param('is', $medicoId, $fechaYmd);
                }
                $stmtC->execute();
                $resC = $stmtC->get_result();
                while ($resC && ($row = $resC->fetch_assoc())) {
                    $hora = self::normalizarHoraProgramadaAgenda($row['hora'] ?? null);
                    $m = self::toMinutesFromHm((string)$hora);
                    if ($m === null) continue;
                    $maxMin = ($maxMin === null) ? $m : max($maxMin, $m);
                }
                $stmtC->close();
            }
        }

        if (self::tableExists($conn, 'agenda_servicios_cotizacion')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'medico_id')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')) {
            $sqlA = 'SELECT id, cotizacion_id, cotizacion_detalle_id, hora_programada FROM agenda_servicios_cotizacion'
                . ' WHERE medico_id = ? AND fecha_programada = ?'
                . ' AND ' . agenda_sql_evento_ocupa_medico('')
                . self::filtroServicioOcupaMedicoSql($conn);
            $stmtA = $conn->prepare($sqlA);
            if ($stmtA) {
                $stmtA->bind_param('is', $medicoId, $fechaYmd);
                $stmtA->execute();
                $resA = $stmtA->get_result();
                while ($resA && ($row = $resA->fetch_assoc())) {
                    $agendaIdRow = (int)($row['id'] ?? 0);
                    if ($agendaExcluirId > 0 && $agendaIdRow === $agendaExcluirId) {
                        continue;
                    }
                    if ($cotizacionExcluirId > 0 && (int)($row['cotizacion_id'] ?? 0) === $cotizacionExcluirId) {
                        // Ignorar filas hermanas de la misma cotizacion para evitar
                        // que un lote multi-servicio se autoinvalide por orden interno.
                        continue;
                    }
                    if ($cotizacionExcluirId > 0 && $detalleExcluirId > 0) {
                        $mismaCot = (int)($row['cotizacion_id'] ?? 0) === $cotizacionExcluirId;
                        $mismoDet = (int)($row['cotizacion_detalle_id'] ?? 0) === $detalleExcluirId;
                        if ($mismaCot && $mismoDet) {
                            continue;
                        }
                    }

                    $hora = self::normalizarHoraProgramadaAgenda($row['hora_programada'] ?? null);
                    $m = self::toMinutesFromHm((string)$hora);
                    if ($m === null) continue;
                    $maxMin = ($maxMin === null) ? $m : max($maxMin, $m);
                }
                $stmtA->close();
            }
        }

        return $maxMin;
    }

    private static function resolverProgramacionAgendaDetalle($conn, $cotizacionId, $detalleId)
    {
        $cotizacionId = (int)$cotizacionId;
        $detalleId = (int)$detalleId;
        if ($cotizacionId <= 0 || $detalleId <= 0) {
            return ['agenda_id' => 0, 'fecha_programada' => null, 'hora_programada' => null, 'medico_id' => 0];
        }
        if (!self::tableExists($conn, 'agenda_servicios_cotizacion')) {
            return ['agenda_id' => 0, 'fecha_programada' => null, 'hora_programada' => null, 'medico_id' => 0];
        }
        if (!self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            || !self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id')) {
            return ['agenda_id' => 0, 'fecha_programada' => null, 'hora_programada' => null, 'medico_id' => 0];
        }

        $cols = ['id AS agenda_id', 'fecha_programada'];
        if (self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada')) {
            $cols[] = 'hora_programada';
        } else {
            $cols[] = 'NULL AS hora_programada';
        }
        if (self::columnExists($conn, 'agenda_servicios_cotizacion', 'medico_id')) {
            $cols[] = 'medico_id';
        } else {
            $cols[] = '0 AS medico_id';
        }

        $whereEstado = self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')
            ? ' AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")'
            : '';

        $sql = 'SELECT ' . implode(', ', $cols)
            . ' FROM agenda_servicios_cotizacion'
            . ' WHERE cotizacion_id = ? AND cotizacion_detalle_id = ?'
            . $whereEstado
            . ' ORDER BY id ASC LIMIT 1';
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return ['agenda_id' => 0, 'fecha_programada' => null, 'hora_programada' => null, 'medico_id' => 0];
        }
        $stmt->bind_param('ii', $cotizacionId, $detalleId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            return ['agenda_id' => 0, 'fecha_programada' => null, 'hora_programada' => null, 'medico_id' => 0];
        }

        return [
            'agenda_id' => (int)($row['agenda_id'] ?? 0),
            'fecha_programada' => self::normalizarFechaProgramadaAgenda($row['fecha_programada'] ?? null),
            'hora_programada' => self::normalizarHoraProgramadaAgenda($row['hora_programada'] ?? null),
            'medico_id' => (int)($row['medico_id'] ?? 0),
        ];
    }

    private static function normalizarReprogramacionHorariaPayload($payload)
    {
        $out = [];
        if (!is_array($payload)) return $out;

        foreach ($payload as $key => $row) {
            $detalleId = (int)$key;
            if ($detalleId <= 0 || !is_array($row)) continue;
            $fecha = self::normalizarFechaProgramadaAgenda($row['fecha_programada'] ?? null);
            $hora = self::normalizarHoraProgramadaAgenda($row['hora_programada'] ?? null);
            if ($fecha === null || $hora === null) continue;
            $out[(string)$detalleId] = [
                'fecha_programada' => $fecha,
                'hora_programada' => $hora,
            ];
        }

        return $out;
    }

    private static function aplicarReprogramacionHorariaEnDetalles(&$detalles, $reprogramacionMap)
    {
        if (!is_array($detalles) || empty($detalles) || !is_array($reprogramacionMap) || empty($reprogramacionMap)) {
            return;
        }

        foreach ($detalles as &$detalle) {
            if (!is_array($detalle)) continue;
            $detalleId = (int)($detalle['cotizacion_detalle_id'] ?? ($detalle['detalle_id'] ?? 0));
            if ($detalleId <= 0) continue;
            $key = (string)$detalleId;
            if (!isset($reprogramacionMap[$key])) continue;
            $detalle['fecha_programada'] = $reprogramacionMap[$key]['fecha_programada'];
            $detalle['hora_programada'] = $reprogramacionMap[$key]['hora_programada'];
        }
        unset($detalle);
    }

    private static function persistirReprogramacionEnCotizacionDetalle($conn, $detalles, $reprogramacionMap)
    {
        if (!is_array($detalles) || empty($detalles) || !is_array($reprogramacionMap) || empty($reprogramacionMap)) {
            return;
        }
        if (!self::tableExists($conn, 'cotizaciones_detalle')) {
            return;
        }

        $hasFecha = self::columnExists($conn, 'cotizaciones_detalle', 'fecha_programada');
        $hasHora = self::columnExists($conn, 'cotizaciones_detalle', 'hora_programada');
        if (!$hasFecha && !$hasHora) {
            return;
        }

        $sql = null;
        if ($hasFecha && $hasHora) {
            $sql = 'UPDATE cotizaciones_detalle SET fecha_programada = ?, hora_programada = ? WHERE id = ? AND cotizacion_id = ?';
        } elseif ($hasFecha) {
            $sql = 'UPDATE cotizaciones_detalle SET fecha_programada = ? WHERE id = ? AND cotizacion_id = ?';
        } else {
            $sql = 'UPDATE cotizaciones_detalle SET hora_programada = ? WHERE id = ? AND cotizacion_id = ?';
        }

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return;
        }

        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) continue;
            $detalleId = (int)($detalle['cotizacion_detalle_id'] ?? ($detalle['detalle_id'] ?? 0));
            $cotizacionId = (int)($detalle['cotizacion_id'] ?? 0);
            if ($detalleId <= 0 || $cotizacionId <= 0) continue;
            $key = (string)$detalleId;
            if (!isset($reprogramacionMap[$key])) continue;
            $fecha = $reprogramacionMap[$key]['fecha_programada'];
            $hora = $reprogramacionMap[$key]['hora_programada'];

            if ($hasFecha && $hasHora) {
                $stmt->bind_param('ssii', $fecha, $hora, $detalleId, $cotizacionId);
            } elseif ($hasFecha) {
                $stmt->bind_param('sii', $fecha, $detalleId, $cotizacionId);
            } else {
                $stmt->bind_param('sii', $hora, $detalleId, $cotizacionId);
            }
            $stmt->execute();
        }

        $stmt->close();
    }

    private static function persistirReprogramacionEnAgendaServicios($conn, $detalles, $reprogramacionMap, $usuarioId = 0)
    {
        if (!is_array($detalles) || empty($detalles) || !is_array($reprogramacionMap) || empty($reprogramacionMap)) {
            return;
        }
        if (!self::tableExists($conn, 'agenda_servicios_cotizacion')) {
            return;
        }
        if (!self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            || !self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id')
            || !self::columnExists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')) {
            return;
        }

        $hasHora = self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada');
        $hasUpdatedBy = self::columnExists($conn, 'agenda_servicios_cotizacion', 'updated_by');
        $hasEstado = self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento');

        $sets = ['fecha_programada = ?'];
        if ($hasHora) {
            $sets[] = 'hora_programada = ?';
        }
        if ($hasUpdatedBy) {
            $sets[] = 'updated_by = ?';
        }
        if ($hasEstado) {
            $sets[] = 'estado_evento = CASE'
                . ' WHEN LOWER(TRIM(COALESCE(estado_evento, ""))) IN ("cancelado", "no_asistio", "anulada") THEN estado_evento'
                . ' ELSE "confirmado" END';
        }

        $whereEstado = $hasEstado
            ? ' AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")'
            : '';

        $sql = 'UPDATE agenda_servicios_cotizacion SET ' . implode(', ', $sets)
            . ' WHERE cotizacion_id = ? AND cotizacion_detalle_id = ?'
            . $whereEstado;

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return;
        }

        $usuarioId = (int)$usuarioId;
        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) continue;
            $detalleId = (int)($detalle['cotizacion_detalle_id'] ?? ($detalle['detalle_id'] ?? 0));
            $cotizacionId = (int)($detalle['cotizacion_id'] ?? 0);
            if ($detalleId <= 0 || $cotizacionId <= 0) continue;
            $key = (string)$detalleId;
            if (!isset($reprogramacionMap[$key])) continue;

            $fecha = $reprogramacionMap[$key]['fecha_programada'];
            $hora = $reprogramacionMap[$key]['hora_programada'];

            if ($hasHora && $hasUpdatedBy) {
                $stmt->bind_param('ssiii', $fecha, $hora, $usuarioId, $cotizacionId, $detalleId);
            } elseif ($hasHora) {
                $stmt->bind_param('ssii', $fecha, $hora, $cotizacionId, $detalleId);
            } elseif ($hasUpdatedBy) {
                $stmt->bind_param('siii', $fecha, $usuarioId, $cotizacionId, $detalleId);
            } else {
                $stmt->bind_param('sii', $fecha, $cotizacionId, $detalleId);
            }
            $stmt->execute();
        }

        $stmt->close();
    }

    private static function validarChoquesHorarioAntesCobro($conn, $detalles, $cotizacionesBloqueadas, $reprogramacionMap = [])
    {
        $conflictos = [];
        $cacheMedico = [];
        $cacheOrigenHc = [];
        $cacheConsultasCotizacion = [];
        $cacheCadenaEpisodio = [];
        $cacheSlotMismaCotizacion = [];
        foreach ((array)$detalles as $detalle) {
            if (!is_array($detalle)) continue;
            if ((int)($detalle['solo_cobro_diferencia'] ?? 0) === 1 || (int)($detalle['_lectura_comercial_paquete'] ?? 0) === 1) {
                continue;
            }

            $servicioTipo = self::normalizarServicioTipo($detalle['servicio_tipo'] ?? '');
            if (!self::servicioTipoRequiereValidacionHorarioCobro($servicioTipo)) {
                continue;
            }

            $cotizacionId = (int)($detalle['cotizacion_id'] ?? 0);
            $cotMeta = ($cotizacionId > 0 && isset($cotizacionesBloqueadas[$cotizacionId])) ? $cotizacionesBloqueadas[$cotizacionId] : [];
            $detalleId = (int)($detalle['cotizacion_detalle_id'] ?? ($detalle['detalle_id'] ?? 0));
            $keyOrigen = $cotizacionId . '|' . $detalleId;
            if (!array_key_exists($keyOrigen, $cacheOrigenHc)) {
                $cacheOrigenHc[$keyOrigen] = (
                    self::cotizacionProvieneHc($cotMeta)
                    || (int)($detalle['consulta_id'] ?? 0) > 0
                    || self::cotizacionDetalleProvieneHcPorOrdenImagen($conn, $cotizacionId, $detalleId)
                );
            }
            $esOrigenHc = (bool)$cacheOrigenHc[$keyOrigen];
            if (!$esOrigenHc) {
                continue;
            }

            $detalleKey = $detalleId > 0 ? (string)$detalleId : '';
            $override = ($detalleKey !== '' && isset($reprogramacionMap[$detalleKey])) ? $reprogramacionMap[$detalleKey] : null;
            $agendaMeta = ($cotizacionId > 0 && $detalleId > 0)
                ? self::resolverProgramacionAgendaDetalle($conn, $cotizacionId, $detalleId)
                : ['agenda_id' => 0, 'fecha_programada' => null, 'hora_programada' => null, 'medico_id' => 0];
            $agendaIdActual = (int)($agendaMeta['agenda_id'] ?? 0);

            $consultaId = (int)($detalle['consulta_id'] ?? 0);
            $medicoId = (int)($detalle['medico_id'] ?? 0);
            if ($medicoId <= 0) {
                $medicoId = (int)($agendaMeta['medico_id'] ?? 0);
            }
            if ($medicoId <= 0 && $consultaId > 0) {
                if (!isset($cacheMedico[$consultaId])) {
                    $cacheMedico[$consultaId] = self::resolverMedicoDesdeConsulta($conn, $consultaId);
                }
                $medicoId = (int)$cacheMedico[$consultaId];
            }

            $fecha = self::normalizarFechaProgramadaAgenda(
                $override['fecha_programada']
                ?? ($agendaMeta['fecha_programada'] ?? null)
                ?? ($detalle['fecha_programada'] ?? ($detalle['fecha_programada_servicio'] ?? null))
            );
            if ($fecha === null) {
                $fecha = self::normalizarFechaProgramadaAgenda($detalle['fecha'] ?? ($cotMeta['fecha'] ?? null));
            }
            $hora = self::normalizarHoraProgramadaAgenda(
                $override['hora_programada']
                ?? ($agendaMeta['hora_programada'] ?? null)
                ?? ($detalle['hora_programada'] ?? ($detalle['hora_programada_servicio'] ?? null))
            );
            if ($hora === null) {
                $hora = self::normalizarHoraProgramadaAgenda($detalle['hora'] ?? null);
            }

            if ($medicoId <= 0 || $fecha === null) {
                continue;
            }

            $descripcion = trim((string)($detalle['descripcion'] ?? 'Servicio'));
            if ($descripcion === '') $descripcion = 'Servicio';

            $sugeridos = self::resolverHorariosDisponiblesMedicoFecha($conn, $medicoId, $fecha, $hora, 6);

            if ($hora === null) {
                $conflictos[] = [
                    'tipo' => 'sin_hora',
                    'detalle_id' => $detalleId,
                    'cotizacion_id' => $cotizacionId,
                    'medico_id' => $medicoId,
                    'servicio_tipo' => $servicioTipo,
                    'descripcion' => $descripcion,
                    'fecha_programada' => $fecha,
                    'hora_programada' => null,
                    'horarios_sugeridos' => $sugeridos,
                    'mensaje' => 'La solicitud no tiene hora programada. Selecciona un horario disponible antes de cobrar.',
                ];
                continue;
            }

            if (!isset($cacheCadenaEpisodio[$cotizacionId])) {
                $cacheCadenaEpisodio[$cotizacionId] = $cotizacionId > 0 ? episodio_cotizaciones_cadena_ids($conn, $cotizacionId) : [];
            }
            $cadenaEpisodioIds = $cacheCadenaEpisodio[$cotizacionId] ?: [$cotizacionId];

            $choqueConsultas = false;
            if (self::tableExists($conn, 'consultas')) {
                $hasConsultaCotizacionId = self::columnExists($conn, 'consultas', 'cotizacion_id');
                if (!isset($cacheConsultasCotizacion[$cotizacionId])) {
                    $cacheConsultasCotizacion[$cotizacionId] = [];
                    $cadenaEpisodioSql = implode(',', array_map('intval', $cadenaEpisodioIds));
                    if ($cotizacionId > 0
                        && self::tableExists($conn, 'cotizaciones_detalle')
                        && self::columnExists($conn, 'cotizaciones_detalle', 'consulta_id')) {
                        $stmtConsultasCot = $conn->prepare('SELECT DISTINCT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id IN (' . $cadenaEpisodioSql . ') AND consulta_id > 0');
                        if ($stmtConsultasCot) {
                            $stmtConsultasCot->execute();
                            $resConsultasCot = $stmtConsultasCot->get_result();
                            while ($resConsultasCot && ($rowConsultaCot = $resConsultasCot->fetch_assoc())) {
                                $cacheConsultasCotizacion[$cotizacionId][(int)$rowConsultaCot['consulta_id']] = true;
                            }
                            $stmtConsultasCot->close();
                        }
                    }
                    if ($cotizacionId > 0 && $hasConsultaCotizacionId) {
                        $stmtConsultasDirectas = $conn->prepare('SELECT id FROM consultas WHERE cotizacion_id = ?');
                        if ($stmtConsultasDirectas) {
                            $stmtConsultasDirectas->bind_param('i', $cotizacionId);
                            $stmtConsultasDirectas->execute();
                            $resConsultasDirectas = $stmtConsultasDirectas->get_result();
                            while ($resConsultasDirectas && ($rowConsultaDirecta = $resConsultasDirectas->fetch_assoc())) {
                                $consultaDirectaId = (int)($rowConsultaDirecta['id'] ?? 0);
                                if ($consultaDirectaId > 0) {
                                    $cacheConsultasCotizacion[$cotizacionId][$consultaDirectaId] = true;
                                }
                            }
                            $stmtConsultasDirectas->close();
                        }
                    }
                }
                $consultasMismaCotizacion = $cacheConsultasCotizacion[$cotizacionId] ?? [];
                if ($consultaId > 0) {
                    $sqlChkC = 'SELECT id FROM consultas WHERE medico_id = ? AND fecha = ? AND hora = ? AND id <> ? AND ' . agenda_sql_consulta_ocupa_medico('');
                    if ($cotizacionId > 0 && $hasConsultaCotizacionId) {
                        $sqlChkC .= ' AND COALESCE(cotizacion_id, 0) <> ?';
                    }
                    $stmtChkC = $conn->prepare($sqlChkC);
                    if ($stmtChkC) {
                        if ($cotizacionId > 0 && $hasConsultaCotizacionId) {
                            $stmtChkC->bind_param('issii', $medicoId, $fecha, $hora, $consultaId, $cotizacionId);
                        } else {
                            $stmtChkC->bind_param('issi', $medicoId, $fecha, $hora, $consultaId);
                        }
                        $stmtChkC->execute();
                        $resChkC = $stmtChkC->get_result();
                        while ($resChkC && ($rowChkC = $resChkC->fetch_assoc())) {
                            $consultaChoqueId = (int)($rowChkC['id'] ?? 0);
                            if ($consultaChoqueId > 0 && !isset($consultasMismaCotizacion[$consultaChoqueId])) {
                                $choqueConsultas = true;
                                break;
                            }
                        }
                        $stmtChkC->close();
                    }
                } else {
                    $sqlChkC = 'SELECT id FROM consultas WHERE medico_id = ? AND fecha = ? AND hora = ? AND ' . agenda_sql_consulta_ocupa_medico('');
                    if ($cotizacionId > 0 && $hasConsultaCotizacionId) {
                        $sqlChkC .= ' AND COALESCE(cotizacion_id, 0) <> ?';
                    }
                    $stmtChkC = $conn->prepare($sqlChkC);
                    if ($stmtChkC) {
                        if ($cotizacionId > 0 && $hasConsultaCotizacionId) {
                            $stmtChkC->bind_param('issi', $medicoId, $fecha, $hora, $cotizacionId);
                        } else {
                            $stmtChkC->bind_param('iss', $medicoId, $fecha, $hora);
                        }
                        $stmtChkC->execute();
                        $resChkC = $stmtChkC->get_result();
                        while ($resChkC && ($rowChkC = $resChkC->fetch_assoc())) {
                            $consultaChoqueId = (int)($rowChkC['id'] ?? 0);
                            if ($consultaChoqueId > 0 && !isset($consultasMismaCotizacion[$consultaChoqueId])) {
                                $choqueConsultas = true;
                                break;
                            }
                        }
                        $stmtChkC->close();
                    }
                }
            }

            $choqueAgenda = false;
            if (self::tableExists($conn, 'agenda_servicios_cotizacion')
                && self::columnExists($conn, 'agenda_servicios_cotizacion', 'medico_id')
                && self::columnExists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
                && self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
                && self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')) {
                $sqlAgenda = 'SELECT id, cotizacion_id, cotizacion_detalle_id FROM agenda_servicios_cotizacion WHERE medico_id = ? AND fecha_programada = ? AND hora_programada = ? AND ' . agenda_sql_evento_ocupa_medico('') . self::filtroServicioOcupaMedicoSql($conn);
                $stmtChkA = $conn->prepare($sqlAgenda);
                if ($stmtChkA) {
                    $stmtChkA->bind_param('iss', $medicoId, $fecha, $hora);
                    $stmtChkA->execute();
                    $resChkA = $stmtChkA->get_result();
                    while ($resChkA && ($rowA = $resChkA->fetch_assoc())) {
                        $mismoAgenda = $agendaIdActual > 0 && (int)($rowA['id'] ?? 0) === $agendaIdActual;
                        if ($mismoAgenda) {
                            continue;
                        }
                        $mismaCot = in_array((int)($rowA['cotizacion_id'] ?? 0), $cadenaEpisodioIds, true);
                        if ($cotizacionId > 0 && $mismaCot) {
                            continue;
                        }
                        $choqueAgenda = true;
                        break;
                    }
                    $stmtChkA->close();
                }
            }

            if ($choqueConsultas || $choqueAgenda) {
                $esSlotMismaCotizacion = false;
                if ($cotizacionId > 0
                    && $hora !== null
                    && self::tableExists($conn, 'agenda_servicios_cotizacion')
                    && self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
                    && self::columnExists($conn, 'agenda_servicios_cotizacion', 'medico_id')
                    && self::columnExists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
                    && self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada')) {
                    $cacheKeySlot = $cotizacionId . '|' . $medicoId . '|' . $fecha . '|' . $hora;
                    if (!array_key_exists($cacheKeySlot, $cacheSlotMismaCotizacion)) {
                        $whereEstadoBase = self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')
                            ? ' AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")'
                            : '';
                        $stmtSlotMismaCot = $conn->prepare(
                            'SELECT 1 FROM agenda_servicios_cotizacion
                             WHERE cotizacion_id = ? AND medico_id = ? AND fecha_programada = ? AND hora_programada = ?'
                            . $whereEstadoBase
                            . ' LIMIT 1'
                        );
                        $existeSlot = false;
                        if ($stmtSlotMismaCot) {
                            $stmtSlotMismaCot->bind_param('iiss', $cotizacionId, $medicoId, $fecha, $hora);
                            $stmtSlotMismaCot->execute();
                            $rowSlot = $stmtSlotMismaCot->get_result()->fetch_assoc();
                            $stmtSlotMismaCot->close();
                            $existeSlot = (bool)$rowSlot;
                        }
                        $cacheSlotMismaCotizacion[$cacheKeySlot] = $existeSlot;
                    }
                    $esSlotMismaCotizacion = (bool)$cacheSlotMismaCotizacion[$cacheKeySlot];
                }
                if ($esSlotMismaCotizacion) {
                    continue;
                }
                $conflictos[] = [
                    'tipo' => 'ocupado',
                    'detalle_id' => $detalleId,
                    'cotizacion_id' => $cotizacionId,
                    'medico_id' => $medicoId,
                    'servicio_tipo' => $servicioTipo,
                    'descripcion' => $descripcion,
                    'fecha_programada' => $fecha,
                    'hora_programada' => $hora,
                    'horarios_sugeridos' => $sugeridos,
                    'mensaje' => 'El médico ya tiene un servicio en ese turno. Selecciona otro horario disponible.',
                ];
                continue;
            }

        }

        if (empty($conflictos)) {
            return ['ok' => true, 'conflictos' => [], 'message' => ''];
        }

        $partes = [];
        foreach ($conflictos as $c) {
            $horaTxt = $c['hora_programada'] ? substr((string)$c['hora_programada'], 0, 5) : 'sin hora';
            $partes[] = sprintf('%s (%s %s)', (string)($c['descripcion'] ?? 'Servicio'), (string)($c['fecha_programada'] ?? '-'), $horaTxt);
        }

        return [
            'ok' => false,
            'conflictos' => $conflictos,
            'message' => 'Hay conflictos de horario para: ' . implode('; ', $partes) . '.',
        ];
    }

    private static function cotizacionTieneProgramacionPreexistente($conn, $cotizacionId)
    {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0) {
            return false;
        }

        if (self::tableExists($conn, 'cotizaciones_detalle') && self::columnExists($conn, 'cotizaciones_detalle', 'consulta_id')) {
            $whereEstado = self::columnExists($conn, 'cotizaciones_detalle', 'estado_item')
                ? " AND LOWER(TRIM(COALESCE(estado_item, ''))) <> 'eliminado'"
                : '';
            $stmtConsulta = $conn->prepare('SELECT 1 FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id > 0' . $whereEstado . ' LIMIT 1');
            if ($stmtConsulta) {
                $stmtConsulta->bind_param('i', $cotizacionId);
                $stmtConsulta->execute();
                $rowConsulta = $stmtConsulta->get_result()->fetch_assoc();
                $stmtConsulta->close();
                if ($rowConsulta) {
                    return true;
                }
            }
        }

        if (self::tableExists($conn, 'agenda_servicios_cotizacion')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')) {
            $whereAgendaEstado = self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')
                ? " AND LOWER(TRIM(COALESCE(estado_evento, ''))) NOT IN ('cancelado', 'no_asistio', 'anulada')"
                : '';
            $stmtAgenda = $conn->prepare('SELECT 1 FROM agenda_servicios_cotizacion WHERE cotizacion_id = ?' . $whereAgendaEstado . ' LIMIT 1');
            if ($stmtAgenda) {
                $stmtAgenda->bind_param('i', $cotizacionId);
                $stmtAgenda->execute();
                $rowAgenda = $stmtAgenda->get_result()->fetch_assoc();
                $stmtAgenda->close();
                if ($rowAgenda) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function debeOmitirValidacionHorariaCobroSaldo($conn, $cotizacionIds, $cotizacionesBloqueadas, $reprogramacionMap = [])
    {
        if (!empty((array)$reprogramacionMap)) {
            return false;
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', (array)$cotizacionIds), function ($id) {
            return $id > 0;
        })));
        if (empty($ids)) {
            return false;
        }

        foreach ($ids as $cotizacionId) {
            if (!isset($cotizacionesBloqueadas[$cotizacionId]) || !is_array($cotizacionesBloqueadas[$cotizacionId])) {
                return false;
            }

            $estadoCot = strtolower(trim((string)($cotizacionesBloqueadas[$cotizacionId]['estado'] ?? '')));
            if ($estadoCot !== 'parcial') {
                return false;
            }

            if (!self::cotizacionTieneProgramacionPreexistente($conn, $cotizacionId)) {
                return false;
            }
        }

        return true;
    }

    private static function asegurarAgendaServiciosPorCobro($conn, $cotizacionId, $usuarioId = 0)
    {
        $cotizacionId = (int)$cotizacionId;
        $usuarioId = (int)$usuarioId;
        if ($cotizacionId <= 0) {
            return;
        }
        if (!self::tableExists($conn, 'agenda_servicios_cotizacion')) {
            return;
        }
        if (!self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            || !self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id')
            || !self::columnExists($conn, 'agenda_servicios_cotizacion', 'paciente_id')
            || !self::columnExists($conn, 'agenda_servicios_cotizacion', 'servicio_tipo')
            || !self::columnExists($conn, 'agenda_servicios_cotizacion', 'titulo_evento')
            || !self::columnExists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')) {
            return;
        }

        if (!self::tableExists($conn, 'cotizaciones')) {
            return;
        }

        $stmtCot = $conn->prepare('SELECT paciente_id, fecha FROM cotizaciones WHERE id = ? LIMIT 1');
        if (!$stmtCot) {
            return;
        }
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $cot = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();

        $pacienteId = (int)($cot['paciente_id'] ?? 0);
        if ($pacienteId <= 0) {
            return;
        }

        $fechaCotizacion = self::normalizarFechaProgramadaAgenda($cot['fecha'] ?? null);
        $horaCotizacion = self::normalizarHoraProgramadaAgenda($cot['fecha'] ?? null);

        $detalles = self::cargarDetallesCotizacionActivos($conn, $cotizacionId);
        if (empty($detalles)) {
            return;
        }

        $usaHora = self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada');
        $usaEstado = self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento');
        $usaObs = self::columnExists($conn, 'agenda_servicios_cotizacion', 'observaciones');
        $usaCreatedBy = self::columnExists($conn, 'agenda_servicios_cotizacion', 'created_by');
        $usaUpdatedBy = self::columnExists($conn, 'agenda_servicios_cotizacion', 'updated_by');
        $usaMedico = self::columnExists($conn, 'agenda_servicios_cotizacion', 'medico_id');
        $usaServicioId = self::columnExists($conn, 'agenda_servicios_cotizacion', 'servicio_id');

        $stmtExiste = $conn->prepare('SELECT id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND cotizacion_detalle_id = ? LIMIT 1');
        if (!$stmtExiste) {
            return;
        }

        $stmtConsulta = null;
        if (self::tableExists($conn, 'consultas')) {
            $stmtConsulta = $conn->prepare('SELECT fecha, hora, medico_id FROM consultas WHERE id = ? LIMIT 1');
        }

        foreach ($detalles as $detalle) {
            $detalleId = (int)($detalle['id'] ?? 0);
            if ($detalleId <= 0) {
                continue;
            }

            $servicioTipo = self::normalizarServicioTipo($detalle['servicio_tipo'] ?? '');
            if (!self::servicioTipoEsAgendable($servicioTipo)) {
                continue;
            }

            $stmtExiste->bind_param('ii', $cotizacionId, $detalleId);
            $stmtExiste->execute();
            $exists = $stmtExiste->get_result()->fetch_assoc();
            $agendaExistenteId = (int)($exists['id'] ?? 0);

            if ($agendaExistenteId > 0) {
                // La reserva ya existe: conserva la fecha/hora elegidas al cotizar. Solo se modifica si el
                // detalle trae una programacion explicita; nunca desde la consulta ni la fecha de la cotizacion.
                $fechaExplicita = self::normalizarFechaProgramadaAgenda($detalle['fecha_programada'] ?? ($detalle['fecha_programada_servicio'] ?? null));
                $horaExplicita = self::normalizarHoraProgramadaAgenda($detalle['hora_programada'] ?? ($detalle['hora_programada_servicio'] ?? null));
                $medicoExplicito = (int)($detalle['medico_id'] ?? 0);

                $setsAgenda = [];
                $typesAgenda = '';
                $paramsAgenda = [];
                if ($fechaExplicita !== null) {
                    $setsAgenda[] = 'fecha_programada = ?';
                    $typesAgenda .= 's';
                    $paramsAgenda[] = $fechaExplicita;
                    if ($usaHora && $horaExplicita !== null) {
                        $setsAgenda[] = 'hora_programada = ?';
                        $typesAgenda .= 's';
                        $paramsAgenda[] = $horaExplicita;
                    }
                }
                if ($usaMedico && $medicoExplicito > 0) {
                    $setsAgenda[] = 'medico_id = ?';
                    $typesAgenda .= 'i';
                    $paramsAgenda[] = $medicoExplicito;
                }
                if (empty($setsAgenda)) {
                    continue;
                }
                if ($usaUpdatedBy) {
                    $setsAgenda[] = 'updated_by = ?';
                    $typesAgenda .= 'i';
                    $paramsAgenda[] = $usuarioId;
                }
                $typesAgenda .= 'i';
                $paramsAgenda[] = $agendaExistenteId;
                $stmtUpdateAgenda = $conn->prepare(
                    'UPDATE agenda_servicios_cotizacion SET ' . implode(', ', $setsAgenda) . ' WHERE id = ?'
                );
                if ($stmtUpdateAgenda) {
                    $stmtUpdateAgenda->bind_param($typesAgenda, ...$paramsAgenda);
                    $stmtUpdateAgenda->execute();
                    $stmtUpdateAgenda->close();
                }
                continue;
            }

            $consultaFecha = null;
            $consultaHora = null;
            $consultaMedicoId = 0;
            $consultaId = (int)($detalle['consulta_id'] ?? 0);
            if ($stmtConsulta && $consultaId > 0) {
                $stmtConsulta->bind_param('i', $consultaId);
                $stmtConsulta->execute();
                $rowConsulta = $stmtConsulta->get_result()->fetch_assoc();
                $consultaFecha = self::normalizarFechaProgramadaAgenda($rowConsulta['fecha'] ?? null);
                $consultaHora = self::normalizarHoraProgramadaAgenda($rowConsulta['hora'] ?? null);
                $consultaMedicoId = (int)($rowConsulta['medico_id'] ?? 0);
            }

            $fechaProgramada = $consultaFecha;
            if ($fechaProgramada === null) {
                $fechaProgramada = self::normalizarFechaProgramadaAgenda($detalle['fecha_programada'] ?? null);
            }
            if ($fechaProgramada === null) {
                $fechaProgramada = self::normalizarFechaProgramadaAgenda($detalle['fecha_programada_servicio'] ?? null);
            }
            if ($fechaProgramada === null) {
                $fechaProgramada = self::normalizarFechaProgramadaAgenda($detalle['fecha'] ?? null);
            }
            if ($fechaProgramada === null) {
                $fechaProgramada = $fechaCotizacion;
            }
            if ($fechaProgramada === null) {
                continue;
            }

            $horaProgramada = $consultaHora;
            if ($horaProgramada === null) {
                $horaProgramada = self::normalizarHoraProgramadaAgenda($detalle['hora_programada'] ?? null);
            }
            if ($horaProgramada === null) {
                $horaProgramada = self::normalizarHoraProgramadaAgenda($detalle['hora_programada_servicio'] ?? null);
            }
            if ($horaProgramada === null) {
                $horaProgramada = self::normalizarHoraProgramadaAgenda($detalle['hora'] ?? null);
            }
            if ($horaProgramada === null) {
                $horaProgramada = $horaCotizacion;
            }

            $medicoId = (int)($detalle['medico_id'] ?? 0);
            if ($medicoId <= 0) {
                $medicoId = $consultaMedicoId;
            }

            $servicioId = isset($detalle['servicio_id']) ? (int)$detalle['servicio_id'] : null;
            $titulo = trim((string)($detalle['descripcion'] ?? ''));
            if ($titulo === '') {
                $titulo = 'Servicio programado';
            }

            $cols = [
                'cotizacion_id',
                'cotizacion_detalle_id',
                'paciente_id',
            ];
            $vals = ['?', '?', '?'];
            $types = 'iii';
            $params = [$cotizacionId, $detalleId, $pacienteId];

            if ($usaMedico) {
                $cols[] = 'medico_id';
                $vals[] = '?';
                $types .= 'i';
                $params[] = $medicoId > 0 ? $medicoId : null;
            }

            $cols[] = 'servicio_tipo';
            $vals[] = '?';
            $types .= 's';
            $params[] = $servicioTipo;

            if ($usaServicioId) {
                $cols[] = 'servicio_id';
                $vals[] = '?';
                $types .= 'i';
                $params[] = ($servicioId && $servicioId > 0) ? $servicioId : null;
            }

            $cols[] = 'titulo_evento';
            $vals[] = '?';
            $types .= 's';
            $params[] = $titulo;

            $cols[] = 'fecha_programada';
            $vals[] = '?';
            $types .= 's';
            $params[] = $fechaProgramada;

            if ($usaHora) {
                $cols[] = 'hora_programada';
                $vals[] = '?';
                $types .= 's';
                $params[] = $horaProgramada;
            }
            if ($usaEstado) {
                $cols[] = 'estado_evento';
                $vals[] = '"pendiente"';
            }
            if ($usaObs) {
                $cols[] = 'observaciones';
                $vals[] = '?';
                $types .= 's';
                $params[] = 'Auto-agendado por cobro de cotizacion pendiente';
            }
            if ($usaCreatedBy) {
                $cols[] = 'created_by';
                $vals[] = '?';
                $types .= 'i';
                $params[] = $usuarioId;
            }
            if ($usaUpdatedBy) {
                $cols[] = 'updated_by';
                $vals[] = '?';
                $types .= 'i';
                $params[] = $usuarioId;
            }

            $sql = 'INSERT INTO agenda_servicios_cotizacion (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
            $stmtIns = $conn->prepare($sql);
            if (!$stmtIns) {
                continue;
            }
            $stmtIns->bind_param($types, ...$params);
            $stmtIns->execute();
            $stmtIns->close();
        }

        $stmtExiste->close();
        if ($stmtConsulta) {
            $stmtConsulta->close();
        }
    }

    // Obtener cobros (por paciente, por id, o todos con filtros)
    public static function obtenerCobros($conn, $params)
    {
        // Por paciente_id
        if (isset($params['paciente_id'])) {
            $stmt = $conn->prepare("SELECT c.*, p.nombre, p.apellido, u.nombre as usuario_nombre FROM cobros c JOIN pacientes p ON c.paciente_id = p.id JOIN usuarios u ON c.usuario_id = u.id WHERE c.paciente_id = ? ORDER BY c.fecha_cobro DESC");
            $stmt->bind_param("i", $params['paciente_id']);
            $stmt->execute();
            $result = $stmt->get_result();
            $cobros = $result->fetch_all(MYSQLI_ASSOC);
            $cobros = self::adjuntarDetallesCobros($conn, $cobros);
            return ['success' => true, 'cobros' => $cobros];
        }
        // Por cobro_id
        if (isset($params['cobro_id'])) {
            $stmt = $conn->prepare("SELECT c.*, p.nombre, p.apellido, p.dni, p.historia_clinica, u.nombre as usuario_nombre FROM cobros c JOIN pacientes p ON c.paciente_id = p.id JOIN usuarios u ON c.usuario_id = u.id WHERE c.id = ?");
            $stmt->bind_param("i", $params['cobro_id']);
            $stmt->execute();
            $result = $stmt->get_result();
            $cobro = $result->fetch_assoc();
            if ($cobro) {
                $cobros = self::adjuntarDetallesCobros($conn, [$cobro]);
                $cobro = $cobros[0];
                return ['success' => true, 'cobro' => $cobro];
            } else {
                return ['success' => false, 'error' => 'Cobro no encontrado'];
            }
        }
        // Todos los cobros con filtros y paginación
        $page = $params['page'] ?? 1;
        $limit = $params['limit'] ?? 3;
        $offset = ($page - 1) * $limit;
        $servicio = $params['servicio'] ?? null;
        $fecha_inicio = $params['fecha_inicio'] ?? null;
        $fecha_fin = $params['fecha_fin'] ?? null;
        $where_conditions = [];
        $query_params = [];
        $types = "";
        if ($servicio === 'farmacia') {
            $where_conditions[] = "EXISTS (SELECT 1 FROM cobros_detalle cd WHERE cd.cobro_id = c.id AND cd.servicio_tipo = 'farmacia')";
        }
        if ($fecha_inicio && $fecha_fin) {
            $where_conditions[] = "DATE(c.fecha_cobro) BETWEEN ? AND ?";
            $query_params[] = $fecha_inicio;
            $query_params[] = $fecha_fin;
            $types .= "ss";
        }
        $where_clause = "";
        if (!empty($where_conditions)) {
            $where_clause = "WHERE " . implode(" AND ", $where_conditions);
        }
        $sql = "SELECT c.*, COALESCE(p.nombre, SUBSTRING_INDEX(SUBSTRING_INDEX(c.observaciones, 'Cliente no registrado: ', -1), ' (DNI:', 1)) as nombre, COALESCE(p.apellido, '') as apellido, COALESCE(p.dni, SUBSTRING_INDEX(SUBSTRING_INDEX(c.observaciones, '(DNI: ', -1), ')', 1)) as dni, u.nombre as usuario_nombre FROM cobros c LEFT JOIN pacientes p ON c.paciente_id = p.id JOIN usuarios u ON c.usuario_id = u.id $where_clause ORDER BY c.fecha_cobro DESC LIMIT ? OFFSET ?";
        $query_params[] = $limit;
        $query_params[] = $offset;
        $types .= "ii";
        $stmt = $conn->prepare($sql);
        if (!empty($query_params)) {
            $stmt->bind_param($types, ...$query_params);
        }
        $stmt->execute();
        $result = $stmt->get_result();
        $cobros = $result->fetch_all(MYSQLI_ASSOC);
        $cobros = self::adjuntarDetallesCobros($conn, $cobros);
        // Contar total con los mismos filtros
        $count_sql = "SELECT COUNT(*) as total FROM cobros c LEFT JOIN pacientes p ON c.paciente_id = p.id JOIN usuarios u ON c.usuario_id = u.id $where_clause";
        $stmt_count = $conn->prepare($count_sql);
        if (!empty($where_conditions)) {
            $count_params = array_slice($query_params, 0, -2);
            $count_types = substr($types, 0, -2);
            if (!empty($count_params)) {
                $stmt_count->bind_param($count_types, ...$count_params);
            }
        }
        $stmt_count->execute();
        $total = $stmt_count->get_result()->fetch_assoc()['total'];
        return [
            'success' => true,
            'cobros' => $cobros,
            'total' => $total,
            'page' => $page,
            'limit' => $limit
        ];
    }
    // Actualizar estado del cobro (anular, devolver, etc.)
    public static function actualizarEstadoCobro($conn, $data)
    {
        $estados_validos = ['pagado', 'anulado', 'devolucion', 'pendiente'];
        if (!isset($data['id']) || !isset($data['estado'])) {
            return ['success' => false, 'error' => 'Datos incompletos'];
        }
        if (!in_array($data['estado'], $estados_validos)) {
            return ['success' => false, 'error' => 'Estado no válido'];
        }
        $conn->begin_transaction();
        try {
            $stmt_current = $conn->prepare("SELECT c.estado, c.paciente_id, p.nombre, p.apellido, p.dni, p.historia_clinica FROM cobros c JOIN pacientes p ON c.paciente_id = p.id WHERE c.id = ?");
            $stmt_current->bind_param("i", $data['id']);
            $stmt_current->execute();
            $current_result = $stmt_current->get_result()->fetch_assoc();
            $estado_actual = $current_result['estado'];
            $nombre_paciente = ($current_result['nombre'] ?? '') . ' ' . ($current_result['apellido'] ?? '');
            $dni_paciente = $current_result['dni'] ?? '';
            $hc_paciente = $current_result['historia_clinica'] ?? '';
            // Si se está anulando un cobro de farmacia que estaba pagado, revertir stock
            if ($data['estado'] === 'anulado' && $estado_actual === 'pagado') {
                $stmt_detalles = $conn->prepare("SELECT servicio_tipo, servicio_id, descripcion FROM cobros_detalle WHERE cobro_id = ?");
                $stmt_detalles->bind_param("i", $data['id']);
                $stmt_detalles->execute();
                $detalles_result = $stmt_detalles->get_result();
                while ($detalle = $detalles_result->fetch_assoc()) {
                    if ($detalle['servicio_tipo'] === 'farmacia') {
                        $detalles_json = json_decode($detalle['descripcion'], true);
                        foreach ($detalles_json as $item) {
                            $medicamento_id = $item['servicio_id'];
                            $cantidad_vendida = $item['cantidad'];
                            $stmt_med = $conn->prepare("SELECT stock, unidades_por_caja, nombre FROM medicamentos WHERE id = ?");
                            $stmt_med->bind_param("i", $medicamento_id);
                            $stmt_med->execute();
                            $med_result = $stmt_med->get_result()->fetch_assoc();
                            if ($med_result) {
                                $stock_actual = intval($med_result['stock']);
                                $unidades_por_caja = intval($med_result['unidades_por_caja']) ?: 1;
                                $nombre_medicamento = $med_result['nombre'];
                                $es_caja = strpos($item['descripcion'], '(Caja)') !== false;
                                if ($es_caja) {
                                    $cantidad_total_unidades = $cantidad_vendida * $unidades_por_caja;
                                    $tipo_movimiento = 'devolucion_caja';
                                } else {
                                    $cantidad_total_unidades = $cantidad_vendida;
                                    $tipo_movimiento = 'devolucion_unidad';
                                }
                                $nuevo_stock = $stock_actual + $cantidad_total_unidades;
                                $stmt_stock_return = $conn->prepare("UPDATE medicamentos SET stock = ? WHERE id = ?");
                                $stmt_stock_return->bind_param("ii", $nuevo_stock, $medicamento_id);
                                $stmt_stock_return->execute();
                                $observaciones = "Devolución - Anulación Cobro #{$data['id']} - Paciente: $nombre_paciente (DNI: $dni_paciente, HC: $hc_paciente) - " . ($es_caja ? "$cantidad_vendida caja(s)" : "$cantidad_vendida unidad(es)");
                                $usuario_actual = $_SESSION['usuario']['id'] ?? 1;
                                $stmt_mov_return = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, tipo_movimiento, cantidad, observaciones, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW())");
                                $stmt_mov_return->bind_param("isisi", $medicamento_id, $tipo_movimiento, $cantidad_total_unidades, $observaciones, $usuario_actual);
                                $stmt_mov_return->execute();
                            }
                        }
                    }
                }
            }
            $observaciones_update = $data['observaciones'] ?? '';
            $stmt = $conn->prepare("UPDATE cobros SET estado = ?, observaciones = ? WHERE id = ?");
            $stmt->bind_param("ssi", $data['estado'], $observaciones_update, $data['id']);
            $stmt->execute();

            // Si se anuló y existen registros en cobros_cotizaciones, revertir saldo de cada cotización
            if ($data['estado'] === 'anulado' && self::tableExists($conn, 'cobros_cotizaciones')) {
                $stmtBridge = $conn->prepare(
                    "SELECT cotizacion_id, monto_aplicado FROM cobros_cotizaciones WHERE cobro_id = ? AND estado_resultado <> 'anulado'"
                );
                if ($stmtBridge) {
                    $stmtBridge->bind_param('i', $data['id']);
                    $stmtBridge->execute();
                    $bridges = $stmtBridge->get_result()->fetch_all(MYSQLI_ASSOC);
                    foreach ($bridges as $bridge) {
                        $cotId  = (int)$bridge['cotizacion_id'];
                        $monto  = (float)$bridge['monto_aplicado'];
                        $stmtCot = $conn->prepare("SELECT total_pagado, saldo_pendiente, total FROM cotizaciones WHERE id = ? FOR UPDATE");
                        if (!$stmtCot) continue;
                        $stmtCot->bind_param('i', $cotId);
                        $stmtCot->execute();
                        $cot = $stmtCot->get_result()->fetch_assoc();
                        if (!$cot) continue;
                        $nuevoPagado = max(0, (float)$cot['total_pagado'] - $monto);
                        $nuevoSaldo  = max(0, (float)$cot['total'] - $nuevoPagado);
                        $nuevoEstado = ($nuevoSaldo <= 0.00001) ? 'pagado' : ($nuevoPagado > 0 ? 'parcial' : 'pendiente');
                        $stmtUp = $conn->prepare("UPDATE cotizaciones SET total_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?");
                        if ($stmtUp) {
                            $stmtUp->bind_param('ddsi', $nuevoPagado, $nuevoSaldo, $nuevoEstado, $cotId);
                            $stmtUp->execute();
                        }
                    }
                    // Marcar filas del bridge como anuladas
                    $stmtMarkBridge = $conn->prepare(
                        "UPDATE cobros_cotizaciones SET estado_resultado = 'anulado', updated_at = NOW() WHERE cobro_id = ?"
                    );
                    if ($stmtMarkBridge) {
                        $stmtMarkBridge->bind_param('i', $data['id']);
                        $stmtMarkBridge->execute();
                    }
                }
            }

            $conn->commit();
            return ['success' => true, 'message' => 'Estado actualizado'];
        } catch (\Exception $e) {
            $conn->rollback();
            // ...eliminado log de depuración...
            return ['success' => false, 'error' => 'Error al actualizar: ' . $e->getMessage()];
        }
    }
    // Enriquece y expande los detalles (paquetes) y fija los montos del cobro: original, descuento y total.
    // Devuelve ['data' => datos con detalles ya con descuento proporcional, 'monto_original', 'monto_descuento', 'total_cobro'].
    private static function prepararDetallesYMontosDelCobro($conn, $data)
    {
        $detallesOriginales = is_array($data['detalles'] ?? null) ? $data['detalles'] : [];
        foreach ($detallesOriginales as &$detalleOriginal) {
            $detalleOriginal = self::enriquecerDetalleDesdeCotizacionDetalle($conn, $detalleOriginal);
        }
        unset($detalleOriginal);
        $detallesExpandido = self::expandirDetallesPaquete($detallesOriginales, $conn);
        $detallesExpandido = PaqueteComercialModule::completarComponentesCobro($conn, $detallesExpandido);
        if (empty($detallesExpandido)) {
            throw new \Exception('No hay detalles válidos para procesar el cobro.');
        }
        $data['detalles'] = $detallesExpandido;

        // Normalizar montos de cobro en backend para evitar desfaces entre UI y persistencia.
        $montoOriginal = self::toFloatFlexible($data['monto_original'] ?? 0);
        if ($montoOriginal <= 0) {
            $montoOriginal = self::calcularMontoOriginalDesdeDetalles($data['detalles'] ?? []);
        }
        $montoDescuento = self::normalizarDescuento($data, $montoOriginal);
        $totalCobro = max(0.0, round($montoOriginal - $montoDescuento, 2));

        // Aplicar descuento proporcional a cada item para mantener consistencia
        // entre caja, honorarios, derivaciones y farmacia.
        $data['detalles'] = self::distribuirDescuentoProporcionalEnDetalles($data['detalles'], $montoDescuento);
        $data['detalles'] = PaqueteComercialModule::aplicarDescuentos($data['detalles'], $conn, !empty($data['atencion_solidaria']));

        return [
            'data' => $data,
            'monto_original' => $montoOriginal,
            'monto_descuento' => $montoDescuento,
            'total_cobro' => $totalCobro,
        ];
    }

    // Aplica la reprogramación pedida en el cobro y valida choques de horario.
    // Devuelve null si todo está bien; si hay conflicto revierte la transacción y devuelve la respuesta de error.
    private static function aplicarReprogramacionYValidarHorario($conn, &$data, $cotizacionIdsFlujo, $cotizacionesBloqueadas, $usuarioSesionId)
    {
        $reprogramacionHorariaMap = self::normalizarReprogramacionHorariaPayload($data['reprogramacion_horaria'] ?? null);
        if (!empty($reprogramacionHorariaMap)) {
            self::aplicarReprogramacionHorariaEnDetalles($data['detalles'], $reprogramacionHorariaMap);
            self::persistirReprogramacionEnCotizacionDetalle($conn, $data['detalles'], $reprogramacionHorariaMap);
            self::persistirReprogramacionEnAgendaServicios($conn, $data['detalles'], $reprogramacionHorariaMap, (int)$usuarioSesionId);
        }

        $omitirValidacionHorariaSaldo = self::debeOmitirValidacionHorariaCobroSaldo(
            $conn,
            $cotizacionIdsFlujo,
            $cotizacionesBloqueadas,
            $reprogramacionHorariaMap
        );
        if (!$omitirValidacionHorariaSaldo) {
            $validacionHoraria = self::validarChoquesHorarioAntesCobro($conn, $data['detalles'], $cotizacionesBloqueadas, $reprogramacionHorariaMap);
            if (!$validacionHoraria['ok']) {
                $conn->rollback();
                return [
                    'success' => false,
                    'code' => 'conflicto_horario',
                    'error' => (string)($validacionHoraria['message'] ?? 'Conflicto de horario detectado.'),
                    'conflictos' => $validacionHoraria['conflictos'] ?? [],
                ];
            }
        }
        return null;
    }

    // Reparte el cobro entre las cotizaciones involucradas y valida que no supere su saldo vigente.
    private static function resumirYValidarMontoPorCotizacion($data, $cotizacionId, $cotizacionesBloqueadas, $montoOriginal, $montoDescuento, $totalCobro)
    {
        $resumenPorCotizacion = self::construirResumenCobroPorCotizacion($data['detalles']);
        if (empty($resumenPorCotizacion) && $cotizacionId > 0) {
            $resumenPorCotizacion[$cotizacionId] = [
                'cotizacion_id' => $cotizacionId,
                'monto_original' => round($montoOriginal, 2),
                'descuento_aplicado' => round($montoDescuento, 2),
                'monto_aplicado' => round($totalCobro, 2),
                'orden_aplicacion' => 1,
            ];
        }

        // Anti-duplicado: el monto a aplicar no puede superar el saldo vigente de la cotización
        // (bloqueada FOR UPDATE). Evita doble envío del mismo cobro sobre un saldo ya abonado.
        self::validarMontoContraSaldoCotizaciones($resumenPorCotizacion, $cotizacionesBloqueadas);
        return $resumenPorCotizacion;
    }

    // Reglas de atención solidaria (descuento total, motivo, sin honorario médico) y referencia de origen heredada de la cotización.
    private static function aplicarAtencionSolidariaYReferenciaOrigen($data, $cotizacionesBloqueadas, $montoOriginal, $montoDescuento, $totalCobro)
    {
        $esAtencionSolidaria = !empty($data['atencion_solidaria']);
        if ($esAtencionSolidaria) {
            if ($montoOriginal <= 0 || $montoDescuento < ($montoOriginal - 0.00001) || $totalCobro > 0.00001) {
                throw new \Exception('La atención solidaria requiere un descuento total y un cobro final de S/ 0.00.');
            }
            if (trim((string)($data['motivo'] ?? '')) === '') {
                throw new \Exception('La atención solidaria requiere registrar el motivo de la atención.');
            }
            foreach ($data['detalles'] as &$detalleSolidario) {
                if (is_array($detalleSolidario)) {
                    $detalleSolidario['renuncia_honorario_medico'] = true;
                }
            }
            unset($detalleSolidario);
        }
        if (empty(trim((string)($data['referencia_origen'] ?? ''))) && !empty($cotizacionesBloqueadas)) {
            foreach ($cotizacionesBloqueadas as $cotizacionBloqueada) {
                $refOrigenCot = trim((string)($cotizacionBloqueada['referencia_origen'] ?? ''));
                if ($refOrigenCot !== '') {
                    $data['referencia_origen'] = $refOrigenCot;
                    break;
                }
            }
        }
        return $data;
    }

    // Descuenta stock y registra la venta de cada ítem de farmacia del cobro.
    private static function procesarVentasFarmaciaDelCobro($conn, $data, $cobro_id, $nombre_paciente, $cotizacionId)
    {
        $dni_paciente = $data['paciente_dni'] ?? '';
        $hc_paciente = $data['paciente_hc'] ?? '';
        foreach ($data['detalles'] as $detalle) {
            $detalleTipo = strtolower(trim((string)($detalle['servicio_tipo'] ?? '')));
            if ($detalleTipo === 'farmacia') {
                FarmaciaModule::procesarVenta(
                    $conn,
                    $detalle,
                    $cobro_id,
                    $nombre_paciente,
                    $dni_paciente,
                    $hc_paciente,
                    $data['usuario_id'],
                    (int)($detalle['cotizacion_id'] ?? $cotizacionId)
                );
            }
        }
    }

    // Registra la atención del paciente con el servicio principal del cobro (los cargos de paquete no cuentan).
    private static function registrarAtencionDelCobro($conn, $data, $cobro_id)
    {
        $servicio_key = $data['servicio_info']['key'] ?? '';
        if (!in_array($servicio_key, ['consulta', 'ecografia', 'operacion', 'rayosx', 'laboratorio', 'farmacia', 'procedimiento', 'hospitalizacion'], true)) {
            $servicio_key = 'consulta';
            foreach ($data['detalles'] as $detalleAtencion) {
                if (!PaqueteComercialModule::esCargo($detalleAtencion)) {
                    $servicio_key = self::normalizarServicioTipo($detalleAtencion['servicio_tipo'] ?? 'consulta');
                    break;
                }
            }
        }
        if ($data['paciente_id'] && $data['paciente_id'] !== 'null') {
            $ok = AtencionModule::registrarAtencion($conn, $data['paciente_id'], $data['usuario_id'], $servicio_key, $cobro_id);
            if (!$ok) {
                throw new \Exception("Servicio '$servicio_key' no permitido en atenciones. Actualiza el ENUM o revisa el frontend.");
            }
        }
    }

    // Aplica el abono a cada cotización del cobro y, según su estado, confirma la agenda y sincroniza lo clínico y los honorarios.
    private static function sincronizarCotizacionesTrasCobro($conn, $data, $cobro_id, $resumenPorCotizacion)
    {
        foreach ($resumenPorCotizacion as $resumenCotizacion) {
            $cotizacionIdSync = (int)($resumenCotizacion['cotizacion_id'] ?? 0);
            if ($cotizacionIdSync <= 0) {
                continue;
            }

            self::sincronizarAbonoCotizacionDesdeCobro(
                $conn,
                $cotizacionIdSync,
                $cobro_id,
                (float)($resumenCotizacion['monto_aplicado'] ?? 0),
                (int)($data['usuario_id'] ?? 0),
                (float)($resumenCotizacion['descuento_aplicado'] ?? 0),
                (string)($data['modo_cobro'] ?? '')
            );

            $stmtEstadoCot = $conn->prepare('SELECT estado FROM cotizaciones WHERE id = ? LIMIT 1');
            if ($stmtEstadoCot) {
                $stmtEstadoCot->bind_param('i', $cotizacionIdSync);
                $stmtEstadoCot->execute();
                $rowEstadoCot = $stmtEstadoCot->get_result()->fetch_assoc();
                $stmtEstadoCot->close();
                $estadoCotizacionActual = strtolower(trim((string)($rowEstadoCot['estado'] ?? '')));
                if (in_array($estadoCotizacionActual, ['parcial', 'pagado'], true)) {
                    self::asegurarAgendaServiciosPorCobro($conn, $cotizacionIdSync, (int)($data['usuario_id'] ?? 0));
                    self::confirmarAgendaServiciosPorCobro($conn, $cotizacionIdSync, (int)($data['usuario_id'] ?? 0));
                }
            }

            if (self::cotizacionEstaPagada($conn, $cotizacionIdSync)) {
                self::sincronizarServiciosClinicosPostPagoCotizacion($conn, $cotizacionIdSync, (int)($data['usuario_id'] ?? 0));
                HonorarioModule::consolidarPorCobrarCotizacion($conn, $cotizacionIdSync);
            }
        }
    }

    // Proceso principal de cobro: registra cobro, caja, laboratorio, farmacia, honorarios y atención
    public static function procesarCobro($conn, $data)
    {
        try {
            $usuarioSesionId = (int)($_SESSION['usuario']['id'] ?? 0);
            if ($usuarioSesionId <= 0) {
                throw new \Exception('No autenticado para procesar cobro.');
            }

            $data['client_request_id'] = self::normalizarClientRequestId($data['client_request_id'] ?? '');
            if ($data['client_request_id'] !== '' && self::columnExists($conn, 'cobros', 'client_request_id')) {
                $cobroIdExistente = self::buscarCobroIdPorClientRequestId($conn, $data['client_request_id'], $usuarioSesionId);
                if ($cobroIdExistente > 0) {
                    return self::construirRespuestaCobroIdempotente($cobroIdExistente);
                }
            }

            // Fuente de verdad del usuario: sesión del backend.
            $data['usuario_id'] = $usuarioSesionId;

            $conn->begin_transaction();

            $cotizacionIdsFlujo = self::resolverCotizacionIdsDesdeCobro($data);
            $cotizacionId = !empty($cotizacionIdsFlujo) ? (int)$cotizacionIdsFlujo[0] : 0;
            $cotizacionesBloqueadas = self::bloquearCotizacionesParaCobro($conn, $cotizacionIdsFlujo);

            if (!empty($cotizacionIdsFlujo)) {
                foreach ($cotizacionIdsFlujo as $cotizacionIdValidar) {
                    if (!isset($cotizacionesBloqueadas[$cotizacionIdValidar])) {
                        throw new \Exception('Una de las cotizaciones seleccionadas ya no existe o no está disponible para cobrar.');
                    }
                }
            }

            // Resolver paciente_id desde las cotizaciones si no viene en los datos
            $pacienteId = isset($data['paciente_id']) ? (int)$data['paciente_id'] : 0;
            $pacientesCotizacion = [];
            foreach ($cotizacionesBloqueadas as $cotizacionBloqueada) {
                $pacienteCot = (int)($cotizacionBloqueada['paciente_id'] ?? 0);
                if ($pacienteCot > 0) {
                    $pacientesCotizacion[$pacienteCot] = true;
                }
            }
            if (count($pacientesCotizacion) > 1) {
                throw new \Exception('No se puede unificar el cobro de cotizaciones de pacientes distintos.');
            }
            if (($pacienteId <= 0 || $pacienteId === null) && count($pacientesCotizacion) === 1) {
                $data['paciente_id'] = (int)array_key_first($pacientesCotizacion);
                $pacienteId = (int)$data['paciente_id'];
            }
            if ($pacienteId > 0) {
                foreach ($cotizacionesBloqueadas as $cotizacionBloqueada) {
                    $pacienteCot = (int)($cotizacionBloqueada['paciente_id'] ?? 0);
                    if ($pacienteCot > 0 && $pacienteCot !== $pacienteId) {
                        throw new \Exception('Las cotizaciones seleccionadas no pertenecen al paciente actual.');
                    }
                }
            }

            foreach ($cotizacionesBloqueadas as $cotizacionBloqueada) {
                $estadoCot = strtolower(trim((string)($cotizacionBloqueada['estado'] ?? '')));
                $observacionesCot = (string)($cotizacionBloqueada['observaciones'] ?? '');
                $esInformativa = $estadoCot === 'informativo' || stripos($observacionesCot, '[COTIZACION_INFORMATIVA]') !== false;
                if (in_array($estadoCot, ['anulada', 'anulado', 'pagado'], true) || $esInformativa) {
                    throw new \Exception('Una de las cotizaciones seleccionadas ya no admite cobro. Refresca la pantalla e inténtalo nuevamente.');
                }

                $fechaVenc = trim((string)($cotizacionBloqueada['fecha_vencimiento'] ?? ''));
                if ($fechaVenc !== '' && in_array($estadoCot, ['pendiente', 'parcial'], true)) {
                    $tsVence = strtotime($fechaVenc);
                    if ($tsVence !== false && time() > $tsVence) {
                        throw new \Exception('Una de las cotizaciones seleccionadas está vencida y no puede cobrarse. Solicita una recotización.');
                    }
                }
            }

            $preparado = self::prepararDetallesYMontosDelCobro($conn, $data);
            $data = $preparado['data'];
            $montoOriginal = $preparado['monto_original'];
            $montoDescuento = $preparado['monto_descuento'];
            $totalCobro = $preparado['total_cobro'];

            $conflictoHorario = self::aplicarReprogramacionYValidarHorario($conn, $data, $cotizacionIdsFlujo, $cotizacionesBloqueadas, (int)$usuarioSesionId);
            if ($conflictoHorario !== null) {
                return $conflictoHorario;
            }

            $resumenPorCotizacion = self::resumirYValidarMontoPorCotizacion($data, $cotizacionId, $cotizacionesBloqueadas, $montoOriginal, $montoDescuento, $totalCobro);

            $data['monto_original'] = $montoOriginal;
            $data['monto_descuento'] = $montoDescuento;
            $data['total'] = $totalCobro;
            $data['cotizacion_ids'] = $cotizacionIdsFlujo;

            $data = self::aplicarAtencionSolidariaYReferenciaOrigen($data, $cotizacionesBloqueadas, $montoOriginal, $montoDescuento, $totalCobro);

            // Validar que exista una caja abierta antes de cualquier registro
            $fecha_cobro = $data['fecha'] ?? date('Y-m-d');
            $turno_cobro = $data['turno'] ?? null;
            $caja_abierta = CajaModule::obtenerCajaAbierta($conn, $usuarioSesionId, $fecha_cobro, $turno_cobro);
            if (!$caja_abierta || empty($caja_abierta['id'])) {
                throw new \Exception('No hay una caja abierta para tu usuario y fecha/turno actual. Abre tu caja antes de cobrar.');
            }
            $caja_id = $caja_abierta['id'];

            // Registrar cobro principal y detalles
            $registroCobro = self::registrarCobro($conn, $data);
            $cobro_id = (int)($registroCobro['cobro_id'] ?? 0);
            if ($cobro_id <= 0) {
                throw new \Exception('No se pudo registrar el cobro principal.');
            }

            if (!empty($registroCobro['idempotent_replay'])) {
                $conn->rollback();
                return self::construirRespuestaCobroIdempotente($cobro_id);
            }

            $fechaHoraIngresoBase = self::resolverFechaHoraCobroParaIngreso($conn, $cobro_id);
            // Registrar descuento aplicado si corresponde
            self::registrarDescuento($conn, $data, $cobro_id);
            self::registrarCobroCotizaciones(
                $conn,
                $cobro_id,
                $resumenPorCotizacion,
                $cotizacionesBloqueadas,
                (int)($data['usuario_id'] ?? 0)
            );

            // Espejo analitico itemizado para clasificar produccion medica vs venta directa.
            self::registrarProduccionMedicaDetalle(
                $conn,
                $data,
                $cobro_id,
                (int)$caja_id,
                $caja_abierta['turno'] ?? ($data['turno'] ?? null)
            );

            // Caja ya validada arriba; usar datos para registrar ingreso

            $cotizacionIdFlujo = self::resolverCotizacionIdDesdeCobro($data);
            $usarHonorarioDiferido = !empty($cotizacionIdsFlujo);

            // Registrar movimientos de laboratorio de referencia
            foreach ($data['detalles'] as $detalle) {
                if (!empty($detalle['derivado'])) {
                    $usuario_caja = $caja_abierta['usuario_id'] ?? $data['usuario_id'];
                    $turno_caja = $caja_abierta['turno'] ?? ($data['turno'] ?? null);
                    $cotizacion_det = isset($detalle['cotizacion_id']) ? intval($detalle['cotizacion_id']) : intval($data['cotizacion_id'] ?? 0);
                    LaboratorioModule::registrarMovimientoReferencia($conn, $cobro_id, $detalle, $caja_id, $data['paciente_id'], $usuario_caja, $turno_caja, $cotizacion_det);
                }
            }

            $nombre_paciente = self::registrarIngresosYHonorariosDelCobro(
                $conn,
                $data,
                $cobro_id,
                $caja_abierta,
                $caja_id,
                $cotizacionId,
                $cotizacionIdFlujo,
                $usarHonorarioDiferido,
                $fechaHoraIngresoBase
            );

            self::procesarVentasFarmaciaDelCobro($conn, $data, $cobro_id, $nombre_paciente, $cotizacionId);

            // ...el bloque de registro de honorarios médicos ya se ejecuta arriba, no repetir aquí...

            self::registrarAtencionDelCobro($conn, $data, $cobro_id);

            self::sincronizarCotizacionesTrasCobro($conn, $data, $cobro_id, $resumenPorCotizacion);

            // Hardening anti-huerfanos: no confirmar cobro si no quedo asentado en caja.
            $validacionAsiento = self::validarAsientoCobroEnCaja(
                $conn,
                (int)$caja_id,
                (int)$cobro_id,
                (float)($data['total'] ?? 0)
            );
            if (!$validacionAsiento['ok']) {
                throw new \Exception($validacionAsiento['error'] ?? 'El cobro no quedo correctamente asentado en caja.');
            }

            // Commit y respuesta
            $conn->commit();
            $numero_comprobante = sprintf("C%06d", $cobro_id);
            return [
                'success' => true,
                'cobro_id' => $cobro_id,
                'numero_comprobante' => $numero_comprobante,
                'message' => 'Cobro procesado exitosamente'
            ];
        } catch (\Exception $e) {
            $conn->rollback();
            return ['success' => false, 'error' => 'Error al procesar el cobro: ' . $e->getMessage()];
        }
    }

    // Registra el ingreso en caja de cada detalle cobrado (cargos de paquete, honorarios médicos, laboratorio de referencia, etc.).
    // Devuelve el nombre del paciente usado en los ingresos. El cuerpo conserva su sangría original para que el cambio sea verificable.
    private static function registrarIngresosYHonorariosDelCobro($conn, $data, $cobro_id, $caja_abierta, $caja_id, $cotizacionId, $cotizacionIdFlujo, $usarHonorarioDiferido, $fechaHoraIngresoBase)
    {
            // Registrar ingreso en caja
            if ($caja_abierta) {
                $servicio_key = $data['servicio_info']['key'] ?? 'otros';
                $area_servicio = $data['servicio_info']['nombre'] ?? 'Otros servicios';
                $tipo_ingreso_map = [
                    'farmacia' => 'farmacia',
                    'laboratorio' => 'laboratorio',
                    'consulta' => 'consulta',
                    'ecografia' => 'ecografia',
                    'rayosx' => 'rayosx',
                    'procedimiento' => 'procedimiento',
                    'operacion' => 'operaciones',
                    'cirugia' => 'operaciones',
                    'cirugia_mayor' => 'operaciones'
                ];
                $tipo_ingreso = $tipo_ingreso_map[$servicio_key] ?? 'otros';
                $metodo_pago_map = [
                    'efectivo' => 'efectivo',
                    'tarjeta' => 'tarjeta',
                    'transferencia' => 'transferencia',
                    'yape' => 'yape',
                    'plin' => 'plin',
                    'seguro' => 'otros'
                ];
                $metodo_pago = $metodo_pago_map[$data['tipo_pago']] ?? 'otros';
                $descripcion_ingreso = "Cobro automático - ";
                if (count($data['detalles']) == 1) {
                    $descripcion_ingreso .= $data['detalles'][0]['descripcion'];
                } else {
                    $descripcion_ingreso .= count($data['detalles']) . " servicios/productos";
                }
                $total_param = $data['total'] ?? 0;
                $referencia_tabla_param = 'cobros';
                $paciente_id_param = $data['paciente_id'] ?? null;
                $nombre_paciente = $data['paciente_nombre'] ?? '';
                $usuario_id_param = $data['usuario_id'];
                $turno_param = $caja_abierta['turno'] ?? ($data['turno'] ?? null);
                // Buscar el id del movimiento de honorario si existe
                $honorario_movimiento_id = null; // Inicializar honorario_movimiento_id
                $liquidado_por = null;
                $fecha_liquidacion = null;
                if (isset($data['detalles']) && is_array($data['detalles'])) {
                    foreach ($data['detalles'] as $detalle) {
                        if (isset($detalle['honorario_movimiento_id'])) {
                            $honorario_movimiento_id = $detalle['honorario_movimiento_id'];
                        }
                        if (isset($detalle['liquidado_por'])) {
                            $liquidado_por = $detalle['liquidado_por'];
                        }
                        if (isset($detalle['fecha_liquidacion'])) {
                            $fecha_liquidacion = $detalle['fecha_liquidacion'];
                        }
                    }
                }
                // Modificar el registro de honorarios para guardar el id retornado
                if (!empty($data['detalles'])) {
                    $esCobroSoloPaqueteComercial = false;
                    $descripcionPaqueteComercial = '';
                    $montoIngresoUnicoPaquete = self::toFloatFlexible($total_param);
                    $detallesPaqueteEvaluadas = 0;
                    $detallesPaqueteValidas = 0;
                    foreach ($data['detalles'] as $detallePre) {
                        $subtotalPre = self::toFloatFlexible($detallePre['subtotal'] ?? 0);
                        if ($subtotalPre <= 0) {
                            continue;
                        }
                        $detallesPaqueteEvaluadas++;

                        $tipoPre = self::normalizarServicioTipo($detallePre['servicio_tipo'] ?? '');
                        if (in_array($tipoPre, ['laboratorio', 'farmacia'], true)) {
                            continue;
                        }

                        $snapshotPre = $detallePre['snapshot_json'] ?? null;
                        if (is_string($snapshotPre)) {
                            $snapshotDecodedPre = json_decode($snapshotPre, true);
                            $snapshotPre = is_array($snapshotDecodedPre) ? $snapshotDecodedPre : null;
                        } elseif (!is_array($snapshotPre)) {
                            $snapshotPre = null;
                        }

                        $paqueteTipoPre = strtolower(trim((string)($detallePre['paquete_tipo'] ?? ($snapshotPre['paquete_tipo'] ?? ''))));
                        $paqueteCodigoPre = trim((string)($detallePre['paquete_codigo'] ?? ($snapshotPre['paquete_codigo'] ?? '')));
                        $paqueteNombrePre = trim((string)($detallePre['paquete_nombre'] ?? ($snapshotPre['paquete_nombre'] ?? '')));
                        $paqueteIdPre = (int)($detallePre['paquete_id'] ?? ($snapshotPre['paquete_id'] ?? 0));
                        $descripcionPre = strtolower(trim((string)($detallePre['descripcion'] ?? '')));
                        $esSoloDiferenciaPre = (
                            (int)($detallePre['solo_cobro_diferencia'] ?? 0) === 1
                            || (int)($detallePre['_lectura_comercial_paquete'] ?? 0) === 1
                            || strpos($descripcionPre, 'diferencia pendiente del paquete') !== false
                            || strpos($descripcionPre, 'pago de diferencia de paquete') !== false
                        );

                        $esPaqueteComercialPre = (
                            $esSoloDiferenciaPre
                            || $paqueteIdPre > 0
                            || $paqueteCodigoPre !== ''
                            || in_array($paqueteTipoPre, ['paquete', 'perfil'], true)
                        );

                        if ($esPaqueteComercialPre) {
                            $detallesPaqueteValidas++;
                            if ($descripcionPaqueteComercial === '') {
                                $descripcionPaqueteComercial = $paqueteNombrePre !== '' ? $paqueteNombrePre : $paqueteCodigoPre;
                            }
                        }
                    }

                    $esCobroSoloPaqueteComercial = ($detallesPaqueteEvaluadas > 0 && $detallesPaqueteEvaluadas === $detallesPaqueteValidas);
                    foreach ($data['detalles'] as $detalleCargo) {
                        if (PaqueteComercialModule::esCargo($detalleCargo)) {
                            $esCobroSoloPaqueteComercial = false;
                            break;
                        }
                    }
                    if ($montoIngresoUnicoPaquete <= 0) {
                        $montoIngresoUnicoPaquete = 0.0;
                        foreach ($data['detalles'] as $detallePreMonto) {
                            $montoIngresoUnicoPaquete += max(0, self::toFloatFlexible($detallePreMonto['subtotal'] ?? 0));
                        }
                    }

                    $ingresoUnicoPaqueteRegistrado = false;
                    $cacheMedicoConsultaHonorarios = [];
                    $cacheContextoCotizacionHonorarios = [];
                    foreach ($data['detalles'] as $i => $detalleServicio) {
                        if (PaqueteComercialModule::esCargo($detalleServicio)) {
                            $montoCargo = self::toFloatFlexible($detalleServicio['subtotal'] ?? 0);
                            if ($montoCargo > 0) {
                                $okCargo = CajaModule::registrarIngreso($conn, [
                                    'caja_id' => $caja_id,
                                    'tipo_ingreso' => 'paquete',
                                    'area_servicio' => 'Paquetes',
                                    'descripcion_ingreso' => (string)$detalleServicio['descripcion'],
                                    'total_param' => $montoCargo,
                                    'metodo_pago' => $metodo_pago,
                                    'cobro_id' => $cobro_id,
                                    'referencia_tabla_param' => 'cobros',
                                    'paciente_id_param' => $paciente_id_param,
                                    'nombre_paciente' => $nombre_paciente,
                                    'usuario_id_param' => $usuario_id_param,
                                    'turno_param' => $turno_param,
                                    'honorario_movimiento_id' => null,
                                    'cobrado_por' => ($_SESSION['usuario']['id'] ?? $usuario_id_param),
                                    'liquidado_por' => null,
                                    'fecha_liquidacion' => null,
                                    'fecha_hora_param' => $fechaHoraIngresoBase,
                                ]);
                                if (!$okCargo) throw new \Exception('No se pudo registrar el cargo unico del paquete en caja');
                            }
                            continue;
                        }
                        $detalleServicioKey = self::normalizarServicioTipo($detalleServicio['servicio_tipo'] ?? $servicio_key);
                        if (!in_array($detalleServicioKey, ['consulta', 'ecografia', 'operacion', 'rayosx', 'laboratorio', 'farmacia', 'procedimiento'], true)) {
                            $detalleServicioKey = $servicio_key;
                        }

                        $tipo_ingreso_map_detalle = [
                            'farmacia' => 'farmacia',
                            'laboratorio' => 'laboratorio',
                            'consulta' => 'consulta',
                            'ecografia' => 'ecografia',
                            'rayosx' => 'rayosx',
                            'procedimiento' => 'procedimiento',
                            'operacion' => 'operaciones',
                            'cirugia' => 'operaciones',
                            'cirugia_mayor' => 'operaciones'
                        ];
                        $area_servicio_map_detalle = [
                            'consulta' => 'Consultas',
                            'laboratorio' => 'Laboratorio',
                            'farmacia' => 'Farmacia',
                            'ecografia' => 'Ecografía',
                            'rayosx' => 'Rayos X',
                            'procedimiento' => 'Procedimientos',
                            'operacion' => 'Operaciones',
                        ];
                        // Asegurar que cada detalle tenga paciente_id
                        if (!isset($detalleServicio['paciente_id']) || $detalleServicio['paciente_id'] === null) {
                            $detalleServicio['paciente_id'] = $data['paciente_id'] ?? null;
                        }

                        // Rehidratar metadata clínica/paquete desde cotizaciones_detalle para que
                        // el cálculo de honorarios respete reglas de campaña en cobros mixtos.
                        $detalleServicio = self::enriquecerDetalleDesdeCotizacionDetalle($conn, $detalleServicio);

                        $descripcionDetalleIngreso = (string)($detalleServicio['descripcion'] ?? '');
                        $snapshotDetalle = $detalleServicio['snapshot_json'] ?? null;
                        if (is_string($snapshotDetalle)) {
                            $snapshotDecoded = json_decode($snapshotDetalle, true);
                            $snapshotDetalle = is_array($snapshotDecoded) ? $snapshotDecoded : null;
                        } elseif (!is_array($snapshotDetalle)) {
                            $snapshotDetalle = null;
                        }

                        $paqueteTipoDetalle = strtolower(trim((string)($detalleServicio['paquete_tipo'] ?? ($snapshotDetalle['paquete_tipo'] ?? ''))));
                        $paqueteCodigoDetalle = trim((string)($detalleServicio['paquete_codigo'] ?? ($snapshotDetalle['paquete_codigo'] ?? '')));
                        $paqueteIdDetalle = (int)($detalleServicio['paquete_id'] ?? ($snapshotDetalle['paquete_id'] ?? 0));
                        $esDetallePaqueteComercial = (
                            $paqueteIdDetalle > 0
                            || $paqueteCodigoDetalle !== ''
                            || in_array($paqueteTipoDetalle, ['paquete', 'perfil'], true)
                        );

                        $esSoloCobroDiferenciaPaquete = (
                            (int)($detalleServicio['solo_cobro_diferencia'] ?? 0) === 1
                            || (int)($detalleServicio['_lectura_comercial_paquete'] ?? 0) === 1
                            || stripos($descripcionDetalleIngreso, 'diferencia pendiente del paquete') !== false
                            || stripos($descripcionDetalleIngreso, 'pago de diferencia de paquete') !== false
                        );
                        $esPaqueteComercial = $esSoloCobroDiferenciaPaquete || $esDetallePaqueteComercial;
                        $tipo_ingreso_detalle = $esPaqueteComercial
                            ? 'paquete'
                            : ($tipo_ingreso_map_detalle[$detalleServicioKey] ?? 'otros');
                        $area_servicio_detalle = $esPaqueteComercial
                            ? 'Paquetes'
                            : ($area_servicio_map_detalle[$detalleServicioKey] ?? ($area_servicio ?: 'Otros servicios'));

                        $consultaIdDetalle = isset($detalleServicio['consulta_id']) ? (int)$detalleServicio['consulta_id'] : 0;
                        $medicoIdDetalle = isset($detalleServicio['medico_id']) ? (int)$detalleServicio['medico_id'] : 0;
                        if ($medicoIdDetalle <= 0 && $consultaIdDetalle > 0) {
                            if (!array_key_exists($consultaIdDetalle, $cacheMedicoConsultaHonorarios)) {
                                $cacheMedicoConsultaHonorarios[$consultaIdDetalle] = self::resolverMedicoDesdeConsulta($conn, $consultaIdDetalle);
                            }
                            $medicoIdDetalle = (int)$cacheMedicoConsultaHonorarios[$consultaIdDetalle];
                            if ($medicoIdDetalle > 0) {
                                $detalleServicio['medico_id'] = $medicoIdDetalle;
                            }
                        }

                        if ($medicoIdDetalle <= 0) {
                            $cotizacionCtxId = isset($detalleServicio['cotizacion_id']) ? (int)$detalleServicio['cotizacion_id'] : 0;
                            if ($cotizacionCtxId <= 0) {
                                $cotizacionCtxId = (int)($cotizacionId ?? 0);
                            }
                            if ($cotizacionCtxId > 0) {
                                if (!array_key_exists($cotizacionCtxId, $cacheContextoCotizacionHonorarios)) {
                                    $cacheContextoCotizacionHonorarios[$cotizacionCtxId] = self::resolverContextoClinicoCotizacion($conn, $cotizacionCtxId, $cacheMedicoConsultaHonorarios);
                                }
                                $ctxHonor = $cacheContextoCotizacionHonorarios[$cotizacionCtxId];
                                $consultaCtx = (int)($ctxHonor['consulta_id'] ?? 0);
                                $medicoCtx = (int)($ctxHonor['medico_id'] ?? 0);
                                if ($consultaIdDetalle <= 0 && $consultaCtx > 0) {
                                    $detalleServicio['consulta_id'] = $consultaCtx;
                                    $consultaIdDetalle = $consultaCtx;
                                }
                                if ($medicoIdDetalle <= 0 && $medicoCtx > 0) {
                                    $detalleServicio['medico_id'] = $medicoCtx;
                                    $medicoIdDetalle = $medicoCtx;
                                }
                            }
                        }

                        $data['detalles'][$i] = $detalleServicio;

                        $tarifa = null;
                        if ($detalleServicioKey === 'laboratorio') {
                            $examen_id = intval($detalleServicio['servicio_id'] ?? 0);
                            if ($examen_id <= 0) {
                                $examen_id = intval($detalleServicio['source_id'] ?? $detalleServicio['examen_id'] ?? 0);
                            }
                            if ($examen_id <= 0) {
                                $descBusqueda = (string)($detalleServicio['descripcion'] ?? ($detalleServicio['descripcion_snapshot'] ?? ''));
                                $examen_id = self::resolverExamenLaboratorioIdPorDescripcion($conn, $descBusqueda);
                                if ($examen_id > 0) {
                                    $detalleServicio['servicio_id'] = $examen_id;
                                    $data['detalles'][$i]['servicio_id'] = $examen_id;
                                }
                            }
                            if ($examen_id) {
                                $stmt_examen = $conn->prepare("SELECT * FROM examenes_laboratorio WHERE id = ? AND activo = 1 LIMIT 1");
                                $stmt_examen->bind_param("i", $examen_id);
                                $stmt_examen->execute();
                                $tarifa = $stmt_examen->get_result()->fetch_assoc();
                                if (!$tarifa) {
                                    throw new \Exception('No se encontró examen activo para el servicio seleccionado (id: ' . $examen_id . ').');
                                }
                            } else {
                                throw new \Exception('No se envió examen_id para laboratorio y no se pudo resolver por descripción.');
                            }
                        } else if ($detalleServicioKey === 'farmacia') {
                            $medicamento_id = intval($detalleServicio['servicio_id'] ?? 0);
                            if ($medicamento_id <= 0) {
                                $descBusqueda = (string)($detalleServicio['descripcion'] ?? ($detalleServicio['descripcion_snapshot'] ?? ''));
                                $medicamento_id = self::resolverMedicamentoIdPorDescripcion($conn, $descBusqueda);
                                if ($medicamento_id > 0) {
                                    $detalleServicio['servicio_id'] = $medicamento_id;
                                    $data['detalles'][$i]['servicio_id'] = $medicamento_id;
                                }
                            }
                            if ($medicamento_id) {
                                $stmt_medicamento = $conn->prepare("SELECT * FROM medicamentos WHERE id = ? AND estado = 'activo' LIMIT 1");
                                $stmt_medicamento->bind_param("i", $medicamento_id);
                                $stmt_medicamento->execute();
                                $tarifa = $stmt_medicamento->get_result()->fetch_assoc();
                                if (!$tarifa) {
                                    throw new \Exception('No se encontró medicamento activo para el servicio seleccionado (id: ' . $medicamento_id . ').');
                                }
                            } else {
                                throw new \Exception('No se envió medicamento_id para farmacia y no se pudo resolver por descripción.');
                            }
                        } else {
                            $tarifa_id = $detalleServicio['tarifa_id'] ?? ($detalleServicio['servicio_id'] ?? null);
                            // Logging para depuración de Rayos X
                            if ($detalleServicioKey === 'rayosx') {
                                // Eliminado log de depuración rayosx
                            }
                            if ($tarifa_id) {
                                // Validar existencia del tarifa_id en tarifas
                                $stmt_check = $conn->prepare("SELECT COUNT(*) as total FROM tarifas WHERE id = ?");
                                $stmt_check->bind_param("i", $tarifa_id);
                                $stmt_check->execute();
                                $total_tarifa = $stmt_check->get_result()->fetch_assoc()['total'];
                                if ($total_tarifa == 0) {
                                    // Compatibilidad: algunas cotizaciones antiguas de consulta guardaron servicio_id=medico_id.
                                    if ($detalleServicioKey === 'consulta') {
                                        $medico_id_buscar = intval($detalleServicio['medico_id'] ?? 0);
                                        if ($medico_id_buscar > 0) {
                                            $stmt_fix = $conn->prepare("SELECT * FROM tarifas WHERE servicio_tipo = 'consulta' AND activo = 1 AND medico_id = ? ORDER BY id DESC LIMIT 1");
                                            $stmt_fix->bind_param("i", $medico_id_buscar);
                                            $stmt_fix->execute();
                                            $tarifa = $stmt_fix->get_result()->fetch_assoc();
                                            $stmt_fix->close();
                                        }

                                        if (!$tarifa) {
                                            $stmt_fix2 = $conn->prepare("SELECT * FROM tarifas WHERE servicio_tipo = 'consulta' AND activo = 1 ORDER BY id DESC LIMIT 1");
                                            $stmt_fix2->execute();
                                            $tarifa = $stmt_fix2->get_result()->fetch_assoc();
                                            $stmt_fix2->close();
                                        }

                                        if ($tarifa && isset($tarifa['id'])) {
                                            $tarifa_id = intval($tarifa['id']);
                                            $data['detalles'][$i]['tarifa_id'] = $tarifa_id;
                                            $data['detalles'][$i]['servicio_id'] = $tarifa_id;
                                        } else {
                                            throw new \Exception('No se encontró una tarifa de consulta activa para corregir el servicio de esta cotización.');
                                        }
                                    } else {
                                        throw new \Exception('El tarifa_id enviado (' . $tarifa_id . ') no existe en la tabla tarifas. Verifica la selección en el frontend/API.');
                                    }
                                }
                                if (!$tarifa) {
                                    $stmt_tarifa = $conn->prepare("SELECT * FROM tarifas WHERE id = ? AND activo = 1 LIMIT 1");
                                    $stmt_tarifa->bind_param("i", $tarifa_id);
                                    $stmt_tarifa->execute();
                                    $tarifa = $stmt_tarifa->get_result()->fetch_assoc();
                                    if (!$tarifa) {
                                        throw new \Exception('No se encontró tarifa activa para el servicio seleccionado (id: ' . $tarifa_id . ').');
                                    }
                                }
                            } else {
                                $medico_id_buscar = isset($detalleServicio['medico_id']) ? $detalleServicio['medico_id'] : null;
                                if ($medico_id_buscar) {
                                    $stmt_tarifa_tipo = $conn->prepare("SELECT * FROM tarifas WHERE servicio_tipo = ? AND medico_id = ? AND activo = 1 LIMIT 1");
                                    $stmt_tarifa_tipo->bind_param("si", $detalleServicioKey, $medico_id_buscar);
                                    $stmt_tarifa_tipo->execute();
                                    $tarifa = $stmt_tarifa_tipo->get_result()->fetch_assoc();

                                    if (!$tarifa) {
                                        $stmt_tarifa_tipo = $conn->prepare("SELECT * FROM tarifas WHERE servicio_tipo = ? AND activo = 1 LIMIT 1");
                                        $stmt_tarifa_tipo->bind_param("s", $detalleServicioKey);
                                        $stmt_tarifa_tipo->execute();
                                        $tarifa = $stmt_tarifa_tipo->get_result()->fetch_assoc();
                                    }
                                } else {
                                    $stmt_tarifa_tipo = $conn->prepare("SELECT * FROM tarifas WHERE servicio_tipo = ? AND activo = 1 LIMIT 1");
                                    $stmt_tarifa_tipo->bind_param("s", $detalleServicioKey);
                                    $stmt_tarifa_tipo->execute();
                                    $tarifa = $stmt_tarifa_tipo->get_result()->fetch_assoc();
                                }
                            }
                        }
                        $metodo_pago_map = [
                            'efectivo' => 'efectivo',
                            'tarjeta' => 'tarjeta',
                            'transferencia' => 'transferencia',
                            'yape' => 'yape',
                            'plin' => 'plin',
                            'seguro' => 'otros'
                        ];
                        $metodo_pago = $metodo_pago_map[$data['tipo_pago']] ?? 'otros';
                        if ($tarifa) {
                            $mov_id = null;
                            $requiereHonorario = in_array($detalleServicioKey, ['consulta', 'ecografia', 'operacion', 'rayosx', 'procedimiento'], true);

                            if ($requiereHonorario) {
                                $medicoDetalle = intval($detalleServicio['medico_id'] ?? 0);
                                $medicoTarifa = intval($tarifa['medico_id'] ?? 0);
                                $tieneMedicoAsignado = ($medicoDetalle > 0 || $medicoTarifa > 0);
                                $requiereMedicoEstricto = in_array($detalleServicioKey, ['consulta', 'operacion'], true);

                                if ($tieneMedicoAsignado || $requiereMedicoEstricto) {
                                    if ($usarHonorarioDiferido) {
                                        // Asegura una identidad estable del detalle para deduplicar
                                        // honorarios en cobros parciales/reintentos.
                                        if (empty($detalleServicio['cotizacion_detalle_id']) && !empty($detalleServicio['detalle_id'])) {
                                            $detalleServicio['cotizacion_detalle_id'] = (int)$detalleServicio['detalle_id'];
                                        }
                                        $registroPorCobrar = HonorarioModule::registrarPorCobrar(
                                            $conn,
                                            $detalleServicio,
                                            $tarifa,
                                            $detalleServicioKey,
                                            $metodo_pago,
                                            $cobro_id,
                                            (int)($detalleServicio['cotizacion_id'] ?? $cotizacionIdFlujo),
                                            (int)($_SESSION['usuario']['id'] ?? $usuario_id_param),
                                            (int)$caja_id,
                                            $turno_param
                                        );

                                        if (is_array($registroPorCobrar) && isset($registroPorCobrar['success']) && !$registroPorCobrar['success']) {
                                            throw new \Exception($registroPorCobrar['error'] ?? 'No se pudo registrar honorario pendiente por cobrar.');
                                        }
                                    } else {
                                        $movimientoHonorario = HonorarioModule::registrarMovimiento($conn, $detalleServicio, $tarifa, $detalleServicioKey, $metodo_pago, $cobro_id);
                                        if (is_array($movimientoHonorario) && isset($movimientoHonorario['success']) && !$movimientoHonorario['success']) {
                                            throw new \Exception($movimientoHonorario['error'] ?? 'No se pudo registrar el movimiento de honorario médico.');
                                        }
                                        if ($movimientoHonorario !== null) {
                                            $mov_id = intval($movimientoHonorario);
                                            if ($mov_id <= 0) {
                                                throw new \Exception('No se pudo registrar el movimiento de honorario médico.');
                                            }
                                            $data['detalles'][$i]['honorario_movimiento_id'] = $mov_id;
                                            $honorario_movimiento_id = $mov_id;
                                        }
                                    }
                                }
                            }

                            // Registrar ingreso comercial.
                            if (PaqueteComercialModule::esComponente($detalleServicio) && (float)$detalleServicio['subtotal'] <= 0) {
                                continue;
                            }
                            // Para cobro de solo paquete, se registra una sola linea por el total del paquete.
                            if ($esCobroSoloPaqueteComercial) {
                                if ($ingresoUnicoPaqueteRegistrado) {
                                    continue;
                                }
                            }

                            $monto_detalle = self::toFloatFlexible($detalleServicio['subtotal'] ?? $total_param);
                            $tipoIngresoFinal = $tipo_ingreso_detalle;
                            $areaServicioFinal = $area_servicio_detalle;
                            $descripcionIngresoFinal = $descripcionDetalleIngreso !== '' ? $descripcionDetalleIngreso : $descripcion_ingreso;
                            if ($esCobroSoloPaqueteComercial) {
                                $tipoIngresoFinal = 'paquete';
                                $areaServicioFinal = 'Paquetes';
                                $monto_detalle = max(0, self::toFloatFlexible($montoIngresoUnicoPaquete));
                                $descripcionIngresoFinal = $descripcionPaqueteComercial !== ''
                                    ? ('Cobro de paquete - ' . $descripcionPaqueteComercial)
                                    : 'Cobro de paquete';
                            }

                            $params_individual = [
                                'caja_id' => $caja_id,
                                'tipo_ingreso' => $tipoIngresoFinal,
                                'area_servicio' => $areaServicioFinal,
                                'descripcion_ingreso' => $descripcionIngresoFinal,
                                'total_param' => $monto_detalle,
                                'metodo_pago' => $metodo_pago,
                                'cobro_id' => $cobro_id,
                                'referencia_tabla_param' => $referencia_tabla_param,
                                'paciente_id_param' => $detalleServicio['paciente_id'] ?? $paciente_id_param,
                                'nombre_paciente' => $nombre_paciente,
                                'usuario_id_param' => $usuario_id_param,
                                'turno_param' => $turno_param,
                                'honorario_movimiento_id' => $mov_id,
                                'cobrado_por' => ($_SESSION['usuario']['id'] ?? $usuario_id_param),
                                'liquidado_por' => $liquidado_por,
                                'fecha_liquidacion' => $fecha_liquidacion,
                                'fecha_hora_param' => $fechaHoraIngresoBase
                            ];
                            $okIngreso = CajaModule::registrarIngreso($conn, $params_individual);
                            if (!$okIngreso) {
                                throw new \Exception('No se pudo registrar el ingreso en caja para el detalle cobrado.');
                            }
                            if ($esCobroSoloPaqueteComercial) {
                                $ingresoUnicoPaqueteRegistrado = true;
                            }
                        } else {
                            throw new \Exception('No se encontró tarifa activa para el servicio y médico seleccionado (servicio_tipo: ' . $servicio_key . ', medico_id: ' . ($medico_id_buscar ?? 'N/A') . ').');
                        }
                    }
                }
                // Eliminado: registro duplicado de ingreso general para consultas médicas
            }

            return $nombre_paciente;
    }

    private static function obtenerAsientoCobroEnCaja($conn, $cajaId, $cobroId)
    {
        $cajaId = (int)$cajaId;
        $cobroId = (int)$cobroId;
        if ($cajaId <= 0 || $cobroId <= 0) {
            return ['total' => 0.0, 'items' => 0];
        }

        $sql = "SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS items
                FROM ingresos_diarios
                WHERE caja_id = ?
                  AND referencia_id = ?
                  AND LOWER(TRIM(COALESCE(referencia_tabla, ''))) = 'cobros'";
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return ['total' => 0.0, 'items' => 0];
        }
        $stmt->bind_param('ii', $cajaId, $cobroId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc() ?: [];
        $stmt->close();

        return [
            'total' => (float)($row['total'] ?? 0),
            'items' => (int)($row['items'] ?? 0),
        ];
    }

    private static function validarAsientoCobroEnCaja($conn, $cajaId, $cobroId, $totalEsperado)
    {
        $totalEsperado = round(max(0.0, (float)$totalEsperado), 2);
        $asiento = self::obtenerAsientoCobroEnCaja($conn, $cajaId, $cobroId);
        $totalAsentado = round((float)($asiento['total'] ?? 0), 2);
        $itemsAsiento = (int)($asiento['items'] ?? 0);

        if ($itemsAsiento <= 0 && $totalEsperado > 0.00001) {
            return [
                'ok' => false,
                'error' => 'Cobro sin asiento en caja detectado. La operación fue cancelada para proteger la conciliación.',
            ];
        }

        $delta = round(abs($totalAsentado - $totalEsperado), 2);
        if ($delta > 0.01) {
            return [
                'ok' => false,
                'error' => 'Descuadre entre cobro y asiento en caja (esperado: S/ ' . number_format($totalEsperado, 2) . ', asentado: S/ ' . number_format($totalAsentado, 2) . ').',
            ];
        }

        return ['ok' => true, 'error' => null];
    }

    // Validar datos principales del cobro
    public static function validarDatos($data)
    {
        if (
            !isset($data['usuario_id']) ||
            !isset($data['total']) || !isset($data['tipo_pago']) ||
            !isset($data['detalles']) || empty($data['detalles'])
        ) {
            return ['success' => false, 'error' => 'Datos incompletos'];
        }
        return ['success' => true];
    }
    // --- Registrar cobro principal y detalles ---
    public static function registrarCobro($conn, $data)
    {
        $observaciones = $data['observaciones'] ?? '';
        $esAtencionSolidaria = !empty($data['atencion_solidaria']) ? 1 : 0;
        if ($esAtencionSolidaria === 1) {
            $observaciones = trim($observaciones . ' [ATENCION_SOLIDARIA: renuncia de honorario medico]');
        }
        $referenciaOrigen = trim((string)($data['referencia_origen'] ?? ''));
        if (!$data['paciente_id'] || $data['paciente_id'] === 'null') {
            $nombre_paciente = trim((string)($data['paciente_nombre'] ?? '')) ?: 'Cliente particular';
            $dni_paciente = $data['paciente_dni'] ?? '';
            $observaciones = "Cliente no registrado: $nombre_paciente (DNI: $dni_paciente). " . $observaciones;
        }
        $paciente_id_param = ($data['paciente_id'] && $data['paciente_id'] !== 'null') ? $data['paciente_id'] : null;
    $usuario_id_param = (int)($_SESSION['usuario']['id'] ?? ($data['usuario_id'] ?? 0));
        $total_param = $data['total'];
        $tipo_pago_param = $data['tipo_pago'];
        $clientRequestId = self::normalizarClientRequestId($data['client_request_id'] ?? '');
        $hasReferenciaOrigen = self::columnExists($conn, 'cobros', 'referencia_origen');
        $hasAtencionSolidaria = self::columnExists($conn, 'cobros', 'atencion_solidaria');
        $hasClientRequestId = self::columnExists($conn, 'cobros', 'client_request_id');
        if ($hasReferenciaOrigen && $hasAtencionSolidaria && $hasClientRequestId) {
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones, referencia_origen, atencion_solidaria, client_request_id) VALUES (?, ?, ?, ?, 'pagado', ?, ?, ?, ?)");
            $stmt->bind_param("iidsssis", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones, $referenciaOrigen, $esAtencionSolidaria, $clientRequestId);
        } elseif ($hasAtencionSolidaria && $hasClientRequestId) {
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones, atencion_solidaria, client_request_id) VALUES (?, ?, ?, ?, 'pagado', ?, ?, ?)");
            $stmt->bind_param("iidssis", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones, $esAtencionSolidaria, $clientRequestId);
        } elseif ($hasReferenciaOrigen && $hasClientRequestId) {
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones, referencia_origen, client_request_id) VALUES (?, ?, ?, ?, 'pagado', ?, ?, ?)");
            $stmt->bind_param("iidssss", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones, $referenciaOrigen, $clientRequestId);
        } elseif ($hasClientRequestId) {
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones, client_request_id) VALUES (?, ?, ?, ?, 'pagado', ?, ?)");
            $stmt->bind_param("iidsss", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones, $clientRequestId);
        } elseif ($hasReferenciaOrigen && $hasAtencionSolidaria) {
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones, referencia_origen, atencion_solidaria) VALUES (?, ?, ?, ?, 'pagado', ?, ?, ?)");
            $stmt->bind_param("iidsssi", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones, $referenciaOrigen, $esAtencionSolidaria);
        } elseif ($hasAtencionSolidaria) {
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones, atencion_solidaria) VALUES (?, ?, ?, ?, 'pagado', ?, ?)");
            $stmt->bind_param("iidssi", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones, $esAtencionSolidaria);
        } elseif ($hasReferenciaOrigen) {
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones, referencia_origen) VALUES (?, ?, ?, ?, 'pagado', ?, ?)");
            $stmt->bind_param("iidsss", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones, $referenciaOrigen);
        } else {
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones) VALUES (?, ?, ?, ?, 'pagado', ?)");
            $stmt->bind_param("iidss", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones);
        }
        if (!$stmt) {
            throw new \Exception('No se pudo preparar el registro del cobro.');
        }
        if (!$stmt->execute()) {
            if ((int)$conn->errno === 1062 && $hasClientRequestId && $clientRequestId !== '') {
                $cobroExistenteId = self::buscarCobroIdPorClientRequestId($conn, $clientRequestId, $usuario_id_param);
                if ($cobroExistenteId > 0) {
                    return ['cobro_id' => $cobroExistenteId, 'idempotent_replay' => true];
                }
            }
            throw new \Exception('No se pudo registrar el cobro en la tabla cobros.');
        }
        $cobro_id = $conn->insert_id;
        if ((int)$cobro_id <= 0) {
            throw new \Exception('No se obtuvo ID de cobro luego del registro principal.');
        }
        // Insertar detalles del cobro
        $tiposServicio = [];
        foreach ($data['detalles'] as $detalle) {
            $tipoDetalle = self::normalizarServicioTipo($detalle['servicio_tipo'] ?? '');
            if ($tipoDetalle !== '') {
                $tiposServicio[$tipoDetalle] = true;
            }
        }
        $tiposServicio = array_keys($tiposServicio);
        $servicio_tipo = count($tiposServicio) === 1 ? $tiposServicio[0] : 'mixto';
        $servicio_id = count($data['detalles']) === 1
            ? ($data['detalles'][0]['tarifa_id'] ?? ($data['detalles'][0]['servicio_id'] ?? null))
            : null;
        $descripcion_json = json_encode($data['detalles']);
        $cantidad = count($data['detalles']);
        $precio_unitario = array_sum(array_map(function ($d) {
            return $d['precio_unitario'];
        }, $data['detalles'])) / max(1, $cantidad);
        $subtotal = array_sum(array_map(function ($d) {
            return $d['subtotal'];
        }, $data['detalles']));
        $stmt_detalle = $conn->prepare("INSERT INTO cobros_detalle (cobro_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
        if (!$stmt_detalle) {
            throw new \Exception('No se pudo preparar el detalle del cobro.');
        }
        $stmt_detalle->bind_param("isisssd", $cobro_id, $servicio_tipo, $servicio_id, $descripcion_json, $cantidad, $precio_unitario, $subtotal);
        if (!$stmt_detalle->execute()) {
            throw new \Exception('No se pudo registrar el detalle del cobro.');
        }
        return ['cobro_id' => (int)$cobro_id, 'idempotent_replay' => false];
    }
    // --- Registrar descuento aplicado en cobro ---
    public static function registrarDescuento($conn, $data, $cobro_id) {
                // DEBUG: Log temporal para depuración de servicio_tipo
        if (!isset($data['monto_descuento']) || $data['monto_descuento'] <= 0) return;
        $fecha = date('Y-m-d');
        $hora = date('H:i:s');
        // Forzar string correcto para servicio (igual que en atenciones)
        // Usar el mismo valor que en cobros_detalle para máxima consistencia
        $servicio = $data['detalles'][0]['servicio_tipo'] ?? '';
        $monto_original = $data['monto_original'] ?? 0;
        $monto_descuento = $data['monto_descuento'] ?? 0;
        $monto_final = $data['total'] ?? 0;
        $motivo = $data['motivo'] ?? '';
        $usuario_nombre = $data['usuario_nombre'] ?? '';
        $paciente_nombre = $data['paciente_nombre'] ?? '';
        $tipo_descuento = $data['tipo_descuento'] ?? '';
        $valor_descuento = $data['valor_descuento'] ?? 0;
        $stmt = $conn->prepare("INSERT INTO descuentos_aplicados 
            (cobro_id, usuario_id, usuario_nombre, paciente_id, paciente_nombre, fecha, hora, servicio, monto_original, tipo_descuento, valor_descuento, monto_descuento, monto_final, motivo) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("iissssssdsddds", 
            $cobro_id, 
            $data['usuario_id'], 
            $usuario_nombre,
            $data['paciente_id'], 
            $paciente_nombre,
            $fecha, 
            $hora, 
            $servicio, 
            $monto_original, 
            $tipo_descuento,
            $valor_descuento,
            $monto_descuento, 
            $monto_final, 
            $motivo
        );
        $stmt->execute();
    }
}
