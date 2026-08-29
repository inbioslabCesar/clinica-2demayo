<?php
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

    private static function expandirDetallesPaquete($detalles)
    {
        if (!is_array($detalles) || empty($detalles)) {
            return [];
        }

        $expandido = [];
        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) {
                continue;
            }

            $tipo = self::normalizarServicioTipo($detalle['servicio_tipo'] ?? '');
            $esPaquete = in_array($tipo, ['paquete', 'perfil'], true) || !empty($detalle['es_paquete']) || !empty($detalle['es_perfil']);
            $componentes = null;
            if (isset($detalle['componentes']) && is_array($detalle['componentes'])) {
                $componentes = $detalle['componentes'];
            } elseif (isset($detalle['paquete_items']) && is_array($detalle['paquete_items'])) {
                $componentes = $detalle['paquete_items'];
            } elseif (isset($detalle['items_paquete']) && is_array($detalle['items_paquete'])) {
                $componentes = $detalle['items_paquete'];
            }

            if (!$esPaquete || !is_array($componentes) || empty($componentes)) {
                $detalle['servicio_tipo'] = self::normalizarServicioTipo($detalle['servicio_tipo'] ?? 'procedimiento');
                $expandido[] = $detalle;
                continue;
            }

            $cantidadPaquete = max(1, (int)($detalle['cantidad'] ?? 1));
            $componentesNormalizados = [];
            $sumaBaseComponentes = 0.0;

            foreach ($componentes as $comp) {
                if (!is_array($comp)) {
                    continue;
                }

                $item = $comp;
                $itemTipo = self::normalizarServicioTipo($item['servicio_tipo'] ?? ($item['source_type'] ?? 'procedimiento'));
                if ($itemTipo === 'paquete' || $itemTipo === 'perfil') {
                    continue;
                }

                $itemCantidad = max(1, (int)($item['cantidad'] ?? 1));
                $cantidadFinal = $itemCantidad * $cantidadPaquete;
                $precio = self::toFloatFlexible($item['precio_unitario'] ?? ($item['precio_lista_snapshot'] ?? 0));
                $subtotal = self::toFloatFlexible($item['subtotal'] ?? ($item['subtotal_snapshot'] ?? ($precio * $cantidadFinal)));
                $subtotal = round((float)$subtotal, 2);

                $componentesNormalizados[] = [
                    'item' => $item,
                    'item_tipo' => $itemTipo,
                    'cantidad_final' => $cantidadFinal,
                    'subtotal_base' => $subtotal,
                ];
                $sumaBaseComponentes += max(0.0, $subtotal);
            }

            $subtotalPaquete = self::toFloatFlexible($detalle['subtotal'] ?? 0);
            if ($subtotalPaquete <= 0) {
                $subtotalPaquete = self::toFloatFlexible($detalle['precio_unitario'] ?? 0) * $cantidadPaquete;
            }
            $subtotalObjetivo = $subtotalPaquete > 0 ? round($subtotalPaquete, 2) : round($sumaBaseComponentes, 2);
            $factorProrrateo = ($sumaBaseComponentes > 0 && $subtotalObjetivo > 0)
                ? ($subtotalObjetivo / $sumaBaseComponentes)
                : 1.0;

            $subtotalAcumulado = 0.0;
            $lastIdx = count($componentesNormalizados) - 1;
            foreach ($componentesNormalizados as $idx => $payload) {
                $item = $payload['item'];
                $itemTipo = $payload['item_tipo'];
                $cantidadFinal = $payload['cantidad_final'];
                $subtotalBase = (float)$payload['subtotal_base'];

                if ($idx === $lastIdx && $subtotalObjetivo > 0) {
                    $subtotalAjustado = round(max(0.0, $subtotalObjetivo - $subtotalAcumulado), 2);
                } else {
                    $subtotalAjustado = round(max(0.0, $subtotalBase * $factorProrrateo), 2);
                    $subtotalAcumulado = round($subtotalAcumulado + $subtotalAjustado, 2);
                }
                $precioAjustado = $cantidadFinal > 0 ? round($subtotalAjustado / $cantidadFinal, 2) : 0.0;

                $item['servicio_tipo'] = $itemTipo;
                if (!isset($item['servicio_id']) || $item['servicio_id'] === null || $item['servicio_id'] === '') {
                    $item['servicio_id'] = $item['source_id'] ?? null;
                }
                if (!isset($item['tarifa_id']) || $item['tarifa_id'] === null || $item['tarifa_id'] === '') {
                    $item['tarifa_id'] = $item['servicio_id'] ?? null;
                }
                if (!isset($item['descripcion']) || trim((string)$item['descripcion']) === '') {
                    $item['descripcion'] = (string)($item['descripcion_snapshot'] ?? 'Item paquete/perfil');
                }
                $item['cantidad'] = $cantidadFinal;
                $item['precio_unitario'] = $precioAjustado;
                $item['subtotal'] = $subtotalAjustado;
                $item['subtotal_original'] = $subtotalAjustado;

                if (!isset($item['cotizacion_id']) && isset($detalle['cotizacion_id'])) {
                    $item['cotizacion_id'] = $detalle['cotizacion_id'];
                }
                if (!isset($item['paquete_id']) && isset($detalle['paquete_id'])) {
                    $item['paquete_id'] = $detalle['paquete_id'];
                }
                if (!isset($item['paquete_codigo']) && isset($detalle['paquete_codigo'])) {
                    $item['paquete_codigo'] = $detalle['paquete_codigo'];
                }
                if (!isset($item['paquete_tipo']) && isset($detalle['paquete_tipo'])) {
                    $item['paquete_tipo'] = $detalle['paquete_tipo'];
                }
                if (!isset($item['paquete_nombre']) && isset($detalle['descripcion'])) {
                    $item['paquete_nombre'] = $detalle['descripcion'];
                }

                $expandido[] = $item;
            }
        }

        return $expandido;
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
        if ((!isset($detalle['snapshot_json']) || trim((string)$detalle['snapshot_json']) === '') && !empty($row['snapshot_json'])) {
            $detalle['snapshot_json'] = (string)$row['snapshot_json'];
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

    private static function construirResumenCobroPorCotizacion($detalles)
    {
        $resumen = [];
        $orden = 0;

        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) {
                continue;
            }

            $cotizacionId = (int)($detalle['cotizacion_id'] ?? 0);
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

    private static function sincronizarAbonoCotizacionDesdeCobro($conn, $cotizacionId, $cobroId, $montoCobrado, $usuarioId, $montoDescuento = 0.0)
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

            $descripcion = 'Abono automatico desde cobro #' . $cobroId;
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

    private static function asegurarConsultaDesdeCotizacion($conn, $cotizacionId)
    {
        $out = [
            'success' => true,
            'consulta_id' => 0,
            'ya_existia' => false,
        ];

        if (!self::tableExists($conn, 'cotizaciones') || !self::tableExists($conn, 'cotizaciones_detalle') || !self::tableExists($conn, 'consultas')) {
            return $out;
        }

        $stmtCot = $conn->prepare('SELECT paciente_id, fecha FROM cotizaciones WHERE id = ? LIMIT 1');
        if (!$stmtCot) {
            return $out;
        }
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $cot = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();
        if (!$cot) {
            return $out;
        }

        $hasConsultaId = self::columnExists($conn, 'cotizaciones_detalle', 'consulta_id');
        $hasMedicoId = self::columnExists($conn, 'cotizaciones_detalle', 'medico_id');
        $whereEstado = self::columnExists($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND estado_item <> 'eliminado'"
            : '';

        if ($hasConsultaId && $hasMedicoId) {
            $stmtDet = $conn->prepare("SELECT id, medico_id, consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta'{$whereEstado} ORDER BY id ASC LIMIT 1");
        } elseif ($hasMedicoId) {
            $stmtDet = $conn->prepare("SELECT id, medico_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta'{$whereEstado} ORDER BY id ASC LIMIT 1");
        } else {
            $stmtDet = $conn->prepare("SELECT id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta'{$whereEstado} ORDER BY id ASC LIMIT 1");
        }

        if (!$stmtDet) {
            return $out;
        }
        $stmtDet->bind_param('i', $cotizacionId);
        $stmtDet->execute();
        $detalle = $stmtDet->get_result()->fetch_assoc();
        $stmtDet->close();

        if (!$detalle) {
            // Fallback para cotizaciones de contrato que solo tienen items de laboratorio/imagen
            // sin ningun item tipo 'consulta': buscar consulta_id via agenda_contrato usando
            // contrato_paciente_id + servicio_tipo + servicio_id del item de lab.
            if (self::columnExists($conn, 'cotizaciones_detalle', 'contrato_paciente_id')
                && self::tableExists($conn, 'agenda_contrato')
                && self::columnExists($conn, 'agenda_contrato', 'consulta_id')
                && $hasConsultaId) {
                $stmtFb = $conn->prepare(
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
                if ($stmtFb) {
                    $stmtFb->bind_param('i', $cotizacionId);
                    $stmtFb->execute();
                    $rowFb = $stmtFb->get_result()->fetch_assoc();
                    $stmtFb->close();
                    $consultaFb = intval($rowFb['consulta_id'] ?? 0);
                    if ($consultaFb > 0) {
                        // Propagar consulta_id a todos los detalles de esta cotizacion que no lo tengan
                        $stmtUpd = $conn->prepare(
                            'UPDATE cotizaciones_detalle SET consulta_id = ? WHERE cotizacion_id = ? AND (consulta_id IS NULL OR consulta_id = 0)'
                        );
                        if ($stmtUpd) {
                            $stmtUpd->bind_param('ii', $consultaFb, $cotizacionId);
                            $stmtUpd->execute();
                            $stmtUpd->close();
                        }
                        $out['consulta_id'] = $consultaFb;
                        $out['ya_existia'] = true;
                    }
                }
            }
            return $out;
        }

        $detalleId = (int)($detalle['id'] ?? 0);
        $medicoId = (int)($detalle['medico_id'] ?? 0);
        $consultaActual = (int)($detalle['consulta_id'] ?? 0);
        if ($consultaActual > 0) {
            $out['consulta_id'] = $consultaActual;
            $out['ya_existia'] = true;
            return $out;
        }
        if ($medicoId <= 0) {
            return $out;
        }

        $pacienteId = (int)($cot['paciente_id'] ?? 0);
        if ($pacienteId <= 0) {
            return $out;
        }
        $programacionRef = self::resolverProgramacionReferenciaConsultaCotizacion($conn, $cotizacionId, (string)($cot['fecha'] ?? ''), $detalle);
        $fecha = (string)($programacionRef['fecha'] ?? date('Y-m-d'));
        $hora = (string)($programacionRef['hora'] ?? date('H:i:s'));
        $tipoConsulta = 'programada';

        if (self::columnExists($conn, 'consultas', 'origen_creacion')) {
            $stmtIns = $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, origen_creacion) VALUES (?, ?, ?, ?, ?, ?)');
            if (!$stmtIns) {
                return $out;
            }
            $origen = 'cotizador';
            $stmtIns->bind_param('iissss', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $origen);
        } else {
            $stmtIns = $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta) VALUES (?, ?, ?, ?, ?)');
            if (!$stmtIns) {
                return $out;
            }
            $stmtIns->bind_param('iisss', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta);
        }

        $ok = $stmtIns->execute();
        $consultaNueva = $ok ? (int)$stmtIns->insert_id : 0;
        $stmtIns->close();
        if ($consultaNueva <= 0) {
            return $out;
        }

        if ($hasConsultaId && $detalleId > 0) {
            $stmtVinc = $conn->prepare('UPDATE cotizaciones_detalle SET consulta_id = ? WHERE id = ?');
            if ($stmtVinc) {
                $stmtVinc->bind_param('ii', $consultaNueva, $detalleId);
                $stmtVinc->execute();
                $stmtVinc->close();
            }
        }

        $out['consulta_id'] = $consultaNueva;
        return $out;
    }

    private static function resolverProgramacionReferenciaConsultaCotizacion($conn, $cotizacionId, $fechaCotizacionRaw = '', $detalleConsulta = [])
    {
        $fecha = null;
        $hora = null;

        if (is_array($detalleConsulta)) {
            $fecha = self::normalizarFechaProgramadaAgenda(
                $detalleConsulta['fecha_programada']
                ?? ($detalleConsulta['fecha_programada_servicio'] ?? null)
            );
            $hora = self::normalizarHoraProgramadaAgenda(
                $detalleConsulta['hora_programada']
                ?? ($detalleConsulta['hora_programada_servicio'] ?? null)
            );
        }

        if (self::tableExists($conn, 'agenda_servicios_cotizacion')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            && self::columnExists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')) {
            $selectHora = self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
                ? 'hora_programada'
                : 'NULL AS hora_programada';
            $whereEstado = self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')
                ? ' AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")'
                : '';

            $sqlAgenda = 'SELECT fecha_programada, ' . $selectHora
                . ' FROM agenda_servicios_cotizacion'
                . ' WHERE cotizacion_id = ?'
                . $whereEstado
                . ' ORDER BY fecha_programada ASC, hora_programada ASC, id ASC LIMIT 1';
            $stmtAgenda = $conn->prepare($sqlAgenda);
            if ($stmtAgenda) {
                $stmtAgenda->bind_param('i', $cotizacionId);
                $stmtAgenda->execute();
                $rowAgenda = $stmtAgenda->get_result()->fetch_assoc();
                $stmtAgenda->close();

                if (is_array($rowAgenda)) {
                    $fechaAgenda = self::normalizarFechaProgramadaAgenda($rowAgenda['fecha_programada'] ?? null);
                    $horaAgenda = self::normalizarHoraProgramadaAgenda($rowAgenda['hora_programada'] ?? null);
                    if ($fechaAgenda !== null) {
                        $fecha = $fechaAgenda;
                    }
                    if ($horaAgenda !== null) {
                        $hora = $horaAgenda;
                    }
                }
            }
        }

        if ($fecha === null) {
            $fecha = !empty($fechaCotizacionRaw)
                ? self::normalizarFechaProgramadaAgenda($fechaCotizacionRaw)
                : null;
        }
        if ($fecha === null) {
            $fecha = date('Y-m-d');
        }

        if ($hora === null) {
            $hora = !empty($fechaCotizacionRaw)
                ? self::normalizarHoraProgramadaAgenda($fechaCotizacionRaw)
                : null;
        }
        if ($hora === null) {
            $hora = date('H:i:s');
        }

        return [
            'fecha' => $fecha,
            'hora' => $hora,
        ];
    }

    private static function crearOrdenesLaboratorioCotizacion($conn, $cotizacionId, $pacienteId, $detalles, $consultaId = 0)
    {
        if (!self::tableExists($conn, 'ordenes_laboratorio')) {
            return;
        }

        $examIds = [];
        foreach ((array)$detalles as $det) {
            $tipo = strtolower(trim((string)($det['servicio_tipo'] ?? '')));
            if ($tipo !== 'laboratorio') continue;
            $sid = (int)($det['servicio_id'] ?? 0);
            if ($sid > 0) $examIds[] = $sid;
        }
        $examIds = array_values(array_unique($examIds));
        if (empty($examIds)) {
            return;
        }

        $json = json_encode($examIds);
        $hasCotizacionId = self::columnExists($conn, 'ordenes_laboratorio', 'cotizacion_id');
        $hasConsultaId = self::columnExists($conn, 'ordenes_laboratorio', 'consulta_id');

        if ($hasCotizacionId) {
            $stmtChk = $conn->prepare('SELECT id FROM ordenes_laboratorio WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 1');
            if ($stmtChk) {
                $stmtChk->bind_param('i', $cotizacionId);
                $stmtChk->execute();
                $exists = $stmtChk->get_result()->fetch_assoc();
                $stmtChk->close();
                if ($exists) {
                    $ordenId = (int)($exists['id'] ?? 0);
                    if ($ordenId > 0) {
                        if ($hasConsultaId && $consultaId > 0) {
                            $stmtUp = $conn->prepare("UPDATE ordenes_laboratorio SET examenes = ?, paciente_id = ?, consulta_id = CASE WHEN consulta_id IS NULL OR consulta_id = 0 THEN ? ELSE consulta_id END, estado = CASE WHEN estado = 'cancelada' THEN 'pendiente' ELSE estado END WHERE id = ?");
                            if ($stmtUp) {
                                $stmtUp->bind_param('siii', $json, $pacienteId, $consultaId, $ordenId);
                                $stmtUp->execute();
                                $stmtUp->close();
                            }
                        } else {
                            $stmtUp = $conn->prepare("UPDATE ordenes_laboratorio SET examenes = ?, paciente_id = ?, estado = CASE WHEN estado = 'cancelada' THEN 'pendiente' ELSE estado END WHERE id = ?");
                            if ($stmtUp) {
                                $stmtUp->bind_param('sii', $json, $pacienteId, $ordenId);
                                $stmtUp->execute();
                                $stmtUp->close();
                            }
                        }
                    }
                    return;
                }
            }

            if ($hasConsultaId && $consultaId > 0) {
                $stmtIns = $conn->prepare('INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id, consulta_id) VALUES (?, ?, ?, ?)');
                if ($stmtIns) {
                    $stmtIns->bind_param('isii', $cotizacionId, $json, $pacienteId, $consultaId);
                    $stmtIns->execute();
                    $stmtIns->close();
                }
            } else {
                $stmtIns = $conn->prepare('INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id) VALUES (?, ?, ?)');
                if ($stmtIns) {
                    $stmtIns->bind_param('isi', $cotizacionId, $json, $pacienteId);
                    $stmtIns->execute();
                    $stmtIns->close();
                }
            }
            return;
        }

        if ($hasConsultaId && $consultaId > 0) {
            $stmtIns = $conn->prepare('INSERT INTO ordenes_laboratorio (examenes, paciente_id, consulta_id) VALUES (?, ?, ?)');
            if ($stmtIns) {
                $stmtIns->bind_param('sii', $json, $pacienteId, $consultaId);
                $stmtIns->execute();
                $stmtIns->close();
            }
        } else {
            $stmtIns = $conn->prepare('INSERT INTO ordenes_laboratorio (examenes, paciente_id) VALUES (?, ?)');
            if ($stmtIns) {
                $stmtIns->bind_param('si', $json, $pacienteId);
                $stmtIns->execute();
                $stmtIns->close();
            }
        }
    }

    private static function crearOrdenesProcedimientosCotizacion($conn, $cotizacionId, $pacienteId, $detalles, $consultaId = 0, $usuarioId = 0)
    {
        if (!self::tableExists($conn, 'ordenes_procedimientos')) {
            return;
        }

        $cotizacionId = (int)$cotizacionId;
        $pacienteId = (int)$pacienteId;
        $consultaCandidata = (int)$consultaId;
        if ($cotizacionId <= 0 || $pacienteId <= 0) {
            return;
        }

        $procIds = [];
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

        if ($consultaCandidata <= 0 && self::columnExists($conn, 'cotizaciones_detalle', 'consulta_id')) {
            $stmtConsulta = $conn->prepare("SELECT consulta_id
                                            FROM cotizaciones_detalle
                                            WHERE cotizacion_id = ?
                                              AND consulta_id IS NOT NULL
                                              AND consulta_id > 0
                                            ORDER BY id ASC
                                            LIMIT 1");
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

        $hasCotizacionId = self::columnExists($conn, 'ordenes_procedimientos', 'cotizacion_id');
        $hasPacienteId = self::columnExists($conn, 'ordenes_procedimientos', 'paciente_id');
        $hasUsuarioId = self::columnExists($conn, 'ordenes_procedimientos', 'usuario_id');
        $hasUpdatedAt = self::columnExists($conn, 'ordenes_procedimientos', 'updated_at');

        $usuarioSesion = (int)($_SESSION['usuario']['id'] ?? 0);
        if ($usuarioSesion <= 0) {
            $usuarioSesion = (int)$usuarioId;
        }

        $existingId = 0;
        $existingJson = '[]';
        if ($hasCotizacionId) {
            $stmtFind = $conn->prepare('SELECT id, procedimientos_json FROM ordenes_procedimientos WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 1');
            if ($stmtFind) {
                $stmtFind->bind_param('i', $cotizacionId);
                $stmtFind->execute();
                $rowExist = $stmtFind->get_result()->fetch_assoc();
                $stmtFind->close();
                $existingId = (int)($rowExist['id'] ?? 0);
                $existingJson = (string)($rowExist['procedimientos_json'] ?? '[]');
            }
        } else {
            $stmtFind = $conn->prepare('SELECT id, procedimientos_json FROM ordenes_procedimientos WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
            if ($stmtFind) {
                $stmtFind->bind_param('i', $consultaCandidata);
                $stmtFind->execute();
                $rowExist = $stmtFind->get_result()->fetch_assoc();
                $stmtFind->close();
                $existingId = (int)($rowExist['id'] ?? 0);
                $existingJson = (string)($rowExist['procedimientos_json'] ?? '[]');
            }
        }

        if ($existingId > 0) {
            $prev = json_decode($existingJson, true);
            if (!is_array($prev)) {
                $prev = [];
            }

            $prevIds = array_values(array_unique(array_filter(array_map('intval', $prev), function ($id) {
                return $id > 0;
            })));
            $finalIds = array_values(array_unique(array_merge($prevIds, $procIds)));
            $jsonFinal = json_encode($finalIds, JSON_UNESCAPED_UNICODE);
            if ($jsonFinal === false) {
                $jsonFinal = json_encode($finalIds);
            }

            $sets = ['procedimientos_json = ?', 'consulta_id = CASE WHEN consulta_id IS NULL OR consulta_id = 0 THEN ? ELSE consulta_id END'];
            $types = 'si';
            $params = [$jsonFinal, $consultaCandidata];

            if ($hasPacienteId) {
                $sets[] = 'paciente_id = CASE WHEN paciente_id IS NULL OR paciente_id = 0 THEN ? ELSE paciente_id END';
                $types .= 'i';
                $params[] = $pacienteId;
            }
            if ($hasUsuarioId && $usuarioSesion > 0) {
                $sets[] = 'usuario_id = CASE WHEN usuario_id IS NULL OR usuario_id = 0 THEN ? ELSE usuario_id END';
                $types .= 'i';
                $params[] = $usuarioSesion;
            }
            if ($hasUpdatedAt) {
                $sets[] = 'updated_at = NOW()';
            }

            $types .= 'i';
            $params[] = $existingId;

            $sqlUpd = 'UPDATE ordenes_procedimientos SET ' . implode(', ', $sets) . ' WHERE id = ?';
            $stmtUpd = $conn->prepare($sqlUpd);
            if ($stmtUpd) {
                $stmtUpd->bind_param($types, ...$params);
                $stmtUpd->execute();
                $stmtUpd->close();
            }
            return;
        }

        $cols = ['consulta_id', 'procedimientos_json', 'estado'];
        $vals = ['?', '?', "'pendiente'"];
        $types = 'is';
        $params = [$consultaCandidata, $jsonProc];

        if ($hasPacienteId) {
            $cols[] = 'paciente_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $pacienteId;
        }
        if ($hasCotizacionId) {
            $cols[] = 'cotizacion_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $cotizacionId;
        }
        if ($hasUsuarioId) {
            $cols[] = 'usuario_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $usuarioSesion > 0 ? $usuarioSesion : 0;
        }

        $sqlIns = 'INSERT INTO ordenes_procedimientos (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
        $stmtIns = $conn->prepare($sqlIns);
        if ($stmtIns) {
            $stmtIns->bind_param($types, ...$params);
            $stmtIns->execute();
            $stmtIns->close();
        }
    }

    private static function crearOrdenesImagenCotizacion($conn, $cotizacionId, $pacienteId, $detalles, $usuarioId = 0, $consultaId = 0)
    {
        if (!self::tableExists($conn, 'ordenes_imagen')) {
            return;
        }

        // Filtrar solo los detalles de tipo imagen, uno por servicio
        $imageDetalles = [];
        foreach ((array)$detalles as $det) {
            $tipoOrden = self::resolverTipoOrdenImagen($det['servicio_tipo'] ?? '', $det['descripcion'] ?? '');
            if ($tipoOrden) {
                $imageDetalles[] = [
                    'detalle_id' => (int)($det['id'] ?? 0),
                    'tipo'       => $tipoOrden,
                    'descripcion' => strtoupper(trim($det['descripcion'] ?? '')),
                    'medico_id'  => (int)($det['medico_id'] ?? 0),
                ];
            }
        }
        if (empty($imageDetalles)) {
            return;
        }

        $hasCotizacionId = self::columnExists($conn, 'ordenes_imagen', 'cotizacion_id');
        $hasConsultaId   = self::columnExists($conn, 'ordenes_imagen', 'consulta_id');
        $hasMedicoId     = self::columnExists($conn, 'ordenes_imagen', 'medico_id');
        $hasSolicitadoPor = self::columnExists($conn, 'ordenes_imagen', 'solicitado_por');
        $hasCargaAnticipada = self::columnExists($conn, 'ordenes_imagen', 'carga_anticipada');

        // Eliminar órdenes genéricas antiguas (sin token de detalle ni nombre de servicio)
        // creadas por versiones anteriores de esta función, solo si no tienen archivos adjuntos
        if ($hasCotizacionId) {
            $genericIndicaciones = 'Orden creada desde cotización #' . $cotizacionId;
            $stmtDel = $conn->prepare(
                'DELETE oi FROM ordenes_imagen oi
                 LEFT JOIN ordenes_imagen_archivos oia ON oia.orden_id = oi.id
                 WHERE oi.cotizacion_id = ? AND oi.indicaciones = ? AND oia.id IS NULL'
            );
            if ($stmtDel) {
                $stmtDel->bind_param('is', $cotizacionId, $genericIndicaciones);
                $stmtDel->execute();
                $stmtDel->close();
            }
        }

        // Crear una orden por cada servicio de imagen con formato token
        foreach ($imageDetalles as $item) {
            $tipo        = $item['tipo'];
            $detalleId   = $item['detalle_id'];
            $descripcion = $item['descripcion'];
            $medicoId    = (int)($item['medico_id'] ?? 0);

            if ($medicoId <= 0 && $detalleId > 0 && self::columnExists($conn, 'cotizaciones_detalle', 'medico_id')) {
                $stmtMedicoDetalle = $conn->prepare('SELECT medico_id FROM cotizaciones_detalle WHERE id = ? AND cotizacion_id = ? LIMIT 1');
                if ($stmtMedicoDetalle) {
                    $stmtMedicoDetalle->bind_param('ii', $detalleId, $cotizacionId);
                    $stmtMedicoDetalle->execute();
                    $rowMedicoDetalle = $stmtMedicoDetalle->get_result()->fetch_assoc();
                    $medicoId = (int)($rowMedicoDetalle['medico_id'] ?? 0);
                    $stmtMedicoDetalle->close();
                }
            }

            // Formato token idéntico al de api_cotizaciones.php::crear_ordenes_imagen_cotizacion
            if ($detalleId > 0) {
                $indicaciones = "Detalle #{$detalleId} - {$descripcion} | Orden creada desde cotización #{$cotizacionId}";
            } else {
                $indicaciones = "{$descripcion} | Orden creada desde cotización #{$cotizacionId}";
            }

            // Idempotencia por indicaciones exactas (una orden por servicio)
            if ($hasCotizacionId) {
                $stmtChk = $conn->prepare('SELECT id FROM ordenes_imagen WHERE cotizacion_id = ? AND indicaciones = ? LIMIT 1');
                if ($stmtChk) {
                    $stmtChk->bind_param('is', $cotizacionId, $indicaciones);
                    $stmtChk->execute();
                    $exists = $stmtChk->get_result()->fetch_assoc();
                    $stmtChk->close();
                    if ($exists) {
                        $ordenId = (int)$exists['id'];
                        if ($hasMedicoId && $medicoId > 0) {
                            $stmtMedico = $conn->prepare('UPDATE ordenes_imagen SET medico_id = ? WHERE id = ? AND (medico_id IS NULL OR medico_id = 0)');
                            if ($stmtMedico) {
                                $stmtMedico->bind_param('ii', $medicoId, $ordenId);
                                $stmtMedico->execute();
                                $stmtMedico->close();
                            }
                        }
                        // Actualizar consulta_id si aún no está asignado
                        if ($hasConsultaId && $consultaId > 0) {
                            $stmtUp = $conn->prepare('UPDATE ordenes_imagen SET consulta_id = CASE WHEN consulta_id IS NULL OR consulta_id = 0 THEN ? ELSE consulta_id END WHERE id = ?');
                            if ($stmtUp) {
                                $stmtUp->bind_param('ii', $consultaId, $ordenId);
                                $stmtUp->execute();
                                $stmtUp->close();
                            }
                        }
                        continue;
                    }
                }
            }

            $cols   = ['consulta_id', 'paciente_id', 'tipo', 'indicaciones', 'estado'];
            $vals   = ['?', '?', '?', '?', "'pendiente'"];
            $types  = 'iiss';
            $params = [$consultaId > 0 ? $consultaId : 0, $pacienteId, $tipo, $indicaciones];

            if ($hasSolicitadoPor) {
                $cols[]   = 'solicitado_por';
                $vals[]   = '?';
                $types   .= 'i';
                $params[] = (int)$usuarioId;
            }
            if ($hasMedicoId) {
                $cols[]   = 'medico_id';
                $vals[]   = '?';
                $types   .= 'i';
                $params[] = $medicoId;
            }
            if ($hasCotizacionId) {
                $cols[]   = 'cotizacion_id';
                $vals[]   = '?';
                $types   .= 'i';
                $params[] = (int)$cotizacionId;
            }
            if ($hasCargaAnticipada) {
                $cols[]   = 'carga_anticipada';
                $vals[]   = '?';
                $types   .= 'i';
                $params[] = 0;
            }

            $sql = 'INSERT INTO ordenes_imagen (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
            $stmtIns = $conn->prepare($sql);
            if ($stmtIns) {
                $stmtIns->bind_param($types, ...$params);
                $stmtIns->execute();
                $stmtIns->close();
            }
        }
    }

    private static function desbloquearConsultasPorCotizacion($conn, $cotizacionId)
    {
        if (!self::tableExists($conn, 'cotizaciones_detalle') || !self::tableExists($conn, 'consultas') || !self::columnExists($conn, 'cotizaciones_detalle', 'consulta_id')) {
            return;
        }

        $stmt = $conn->prepare('SELECT DISTINCT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id > 0');
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        if (empty($rows)) {
            return;
        }

        $stmtUpd = $conn->prepare("UPDATE consultas SET estado = 'pendiente' WHERE id = ? AND estado = 'falta_cancelar'");
        if (!$stmtUpd) {
            return;
        }
        foreach ($rows as $row) {
            $cid = (int)($row['consulta_id'] ?? 0);
            if ($cid <= 0) continue;
            $stmtUpd->bind_param('i', $cid);
            $stmtUpd->execute();
        }
        $stmtUpd->close();
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
            $stmtOccC = $conn->prepare('SELECT hora FROM consultas WHERE medico_id = ? AND fecha = ? AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "anulada", "completada")');
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
            $stmtOccA = $conn->prepare('SELECT hora_programada FROM agenda_servicios_cotizacion WHERE medico_id = ? AND fecha_programada = ? AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")');
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
                    for ($m = $ini; $m < $fin; $m += 30) {
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
            for ($m = (7 * 60); $m <= (20 * 60); $m += 30) {
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
            $sqlC = 'SELECT hora FROM consultas WHERE medico_id = ? AND fecha = ? AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "anulada", "completada")';
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
                . ' AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")';
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

        foreach ((array)$detalles as $detalle) {
            if (!is_array($detalle)) continue;

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

            $choqueConsultas = false;
            if (self::tableExists($conn, 'consultas')) {
                if ($consultaId > 0) {
                    $stmtChkC = $conn->prepare('SELECT id FROM consultas WHERE medico_id = ? AND fecha = ? AND hora = ? AND id <> ? AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "anulada", "completada") LIMIT 1');
                    if ($stmtChkC) {
                        $stmtChkC->bind_param('issi', $medicoId, $fecha, $hora, $consultaId);
                        $stmtChkC->execute();
                        $rowChkC = $stmtChkC->get_result()->fetch_assoc();
                        $stmtChkC->close();
                        $choqueConsultas = (bool)$rowChkC;
                    }
                } else {
                    $stmtChkC = $conn->prepare('SELECT id FROM consultas WHERE medico_id = ? AND fecha = ? AND hora = ? AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "anulada", "completada") LIMIT 1');
                    if ($stmtChkC) {
                        $stmtChkC->bind_param('iss', $medicoId, $fecha, $hora);
                        $stmtChkC->execute();
                        $rowChkC = $stmtChkC->get_result()->fetch_assoc();
                        $stmtChkC->close();
                        $choqueConsultas = (bool)$rowChkC;
                    }
                }
            }

            $choqueAgenda = false;
            if (self::tableExists($conn, 'agenda_servicios_cotizacion')
                && self::columnExists($conn, 'agenda_servicios_cotizacion', 'medico_id')
                && self::columnExists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
                && self::columnExists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
                && self::columnExists($conn, 'agenda_servicios_cotizacion', 'estado_evento')) {
                $sqlAgenda = 'SELECT id, cotizacion_id, cotizacion_detalle_id FROM agenda_servicios_cotizacion WHERE medico_id = ? AND fecha_programada = ? AND hora_programada = ? AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada")';
                $stmtChkA = $conn->prepare($sqlAgenda);
                if ($stmtChkA) {
                    $stmtChkA->bind_param('iss', $medicoId, $fecha, $hora);
                    $stmtChkA->execute();
                    $resChkA = $stmtChkA->get_result();
                    while ($resChkA && ($rowA = $resChkA->fetch_assoc())) {
                        $mismaCot = (int)($rowA['cotizacion_id'] ?? 0) === $cotizacionId;
                        $mismoDet = $detalleId > 0 && (int)($rowA['cotizacion_detalle_id'] ?? 0) === $detalleId;
                        if ($mismaCot && $mismoDet) {
                            continue;
                        }
                        $choqueAgenda = true;
                        break;
                    }
                    $stmtChkA->close();
                }
            }

            if ($choqueConsultas || $choqueAgenda) {
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

            $horaActualMin = self::toMinutesFromHm($hora);
            $horaMaximaOcupada = self::resolverHoraMaximaOcupadaDia(
                $conn,
                $medicoId,
                $fecha,
                $consultaId,
                $agendaIdActual,
                $cotizacionId,
                $detalleId
            );

            if ($horaActualMin !== null && $horaMaximaOcupada !== null && $horaActualMin <= $horaMaximaOcupada) {
                $sugeridosPosteriores = self::filtrarHorariosPosteriores($sugeridos, $horaMaximaOcupada);
                if (empty($sugeridosPosteriores)) {
                    $referenciaPosterior = self::toHmFromMinutes(min(1439, $horaMaximaOcupada + 1));
                    $sugeridosPosteriores = self::filtrarHorariosPosteriores(
                        self::resolverHorariosDisponiblesMedicoFecha($conn, $medicoId, $fecha, $referenciaPosterior, 10),
                        $horaMaximaOcupada
                    );
                }

                $conflictos[] = [
                    'tipo' => 'requiere_reprogramacion',
                    'detalle_id' => $detalleId,
                    'cotizacion_id' => $cotizacionId,
                    'medico_id' => $medicoId,
                    'servicio_tipo' => $servicioTipo,
                    'descripcion' => $descripcion,
                    'fecha_programada' => $fecha,
                    'hora_programada' => $hora,
                    'horarios_sugeridos' => $sugeridosPosteriores,
                    'mensaje' => 'Para mantener el orden operativo del día, reprograme a un horario posterior disponible antes de cobrar.',
                ];
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
            if ($exists) {
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

            $fechaProgramada = self::normalizarFechaProgramadaAgenda($detalle['fecha_programada'] ?? null);
            if ($fechaProgramada === null) {
                $fechaProgramada = self::normalizarFechaProgramadaAgenda($detalle['fecha_programada_servicio'] ?? null);
            }
            if ($fechaProgramada === null) {
                $fechaProgramada = self::normalizarFechaProgramadaAgenda($detalle['fecha'] ?? null);
            }
            if ($fechaProgramada === null) {
                $fechaProgramada = $consultaFecha ?: $fechaCotizacion;
            }
            if ($fechaProgramada === null) {
                continue;
            }

            $horaProgramada = self::normalizarHoraProgramadaAgenda($detalle['hora_programada'] ?? null);
            if ($horaProgramada === null) {
                $horaProgramada = self::normalizarHoraProgramadaAgenda($detalle['hora_programada_servicio'] ?? null);
            }
            if ($horaProgramada === null) {
                $horaProgramada = self::normalizarHoraProgramadaAgenda($detalle['hora'] ?? null);
            }
            if ($horaProgramada === null) {
                $horaProgramada = $consultaHora ?: $horaCotizacion;
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
    // Proceso principal de cobro: registra cobro, caja, laboratorio, farmacia, honorarios y atención
    public static function procesarCobro($conn, $data)
    {
        try {
            $usuarioSesionId = (int)($_SESSION['usuario']['id'] ?? 0);
            if ($usuarioSesionId <= 0) {
                throw new \Exception('No autenticado para procesar cobro.');
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

            $detallesOriginales = is_array($data['detalles'] ?? null) ? $data['detalles'] : [];
            $detallesExpandido = self::expandirDetallesPaquete($detallesOriginales);
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

            $reprogramacionHorariaMap = self::normalizarReprogramacionHorariaPayload($data['reprogramacion_horaria'] ?? null);
            if (!empty($reprogramacionHorariaMap)) {
                self::aplicarReprogramacionHorariaEnDetalles($data['detalles'], $reprogramacionHorariaMap);
                self::persistirReprogramacionEnCotizacionDetalle($conn, $data['detalles'], $reprogramacionHorariaMap);
                self::persistirReprogramacionEnAgendaServicios($conn, $data['detalles'], $reprogramacionHorariaMap, (int)$usuarioSesionId);
            }

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

            $data['monto_original'] = $montoOriginal;
            $data['monto_descuento'] = $montoDescuento;
            $data['total'] = $totalCobro;
            $data['cotizacion_ids'] = $cotizacionIdsFlujo;

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

            // Validar que exista una caja abierta antes de cualquier registro
            $fecha_cobro = $data['fecha'] ?? date('Y-m-d');
            $turno_cobro = $data['turno'] ?? null;
            $caja_abierta = CajaModule::obtenerCajaAbierta($conn, $usuarioSesionId, $fecha_cobro, $turno_cobro);
            if (!$caja_abierta || empty($caja_abierta['id'])) {
                throw new \Exception('No hay una caja abierta para tu usuario y fecha/turno actual. Abre tu caja antes de cobrar.');
            }
            $caja_id = $caja_abierta['id'];

            // Registrar cobro principal y detalles
            $cobro_id = self::registrarCobro($conn, $data);
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
                    foreach ($data['detalles'] as $i => $detalleServicio) {
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
                        $tipo_ingreso_detalle = $tipo_ingreso_map_detalle[$detalleServicioKey] ?? 'otros';
                        $area_servicio_detalle = $area_servicio_map_detalle[$detalleServicioKey] ?? ($area_servicio ?: 'Otros servicios');

                        // Asegurar que cada detalle tenga paciente_id
                        if (!isset($detalleServicio['paciente_id']) || $detalleServicio['paciente_id'] === null) {
                            $detalleServicio['paciente_id'] = $data['paciente_id'] ?? null;
                        }

                        // Rehidratar metadata clínica/paquete desde cotizaciones_detalle para que
                        // el cálculo de honorarios respete reglas de campaña en cobros mixtos.
                        $detalleServicio = self::enriquecerDetalleDesdeCotizacionDetalle($conn, $detalleServicio);
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

                            // Registrar ingreso en caja por cada detalle con subtotal ya neto.
                            $monto_detalle = self::toFloatFlexible($detalleServicio['subtotal'] ?? $total_param);
                            $params_individual = [
                                'caja_id' => $caja_id,
                                'tipo_ingreso' => $tipo_ingreso_detalle,
                                'area_servicio' => $area_servicio_detalle,
                                'descripcion_ingreso' => $detalleServicio['descripcion'] ?? $descripcion_ingreso,
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
                                'fecha_liquidacion' => $fecha_liquidacion
                            ];
                            CajaModule::registrarIngreso($conn, $params_individual);
                        } else {
                            throw new \Exception('No se encontró tarifa activa para el servicio y médico seleccionado (servicio_tipo: ' . $servicio_key . ', medico_id: ' . ($medico_id_buscar ?? 'N/A') . ').');
                        }
                    }
                }
                // Eliminado: registro duplicado de ingreso general para consultas médicas
            }

            // Procesos de farmacia
            $servicio_key = $data['servicio_info']['key'] ?? 'consulta';
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

            // ...el bloque de registro de honorarios médicos ya se ejecuta arriba, no repetir aquí...

            // Registro de atención
            $servicio_key = $data['servicio_info']['key'] ?? '';
            if (!in_array($servicio_key, ['consulta', 'ecografia', 'operacion', 'rayosx', 'laboratorio', 'farmacia', 'procedimiento', 'hospitalizacion'], true)) {
                $servicio_key = self::normalizarServicioTipo($data['detalles'][0]['servicio_tipo'] ?? 'consulta');
            }
            if ($data['paciente_id'] && $data['paciente_id'] !== 'null') {
                $ok = AtencionModule::registrarAtencion($conn, $data['paciente_id'], $data['usuario_id'], $servicio_key);
                if (!$ok) {
                    throw new \Exception("Servicio '$servicio_key' no permitido en atenciones. Actualiza el ENUM o revisa el frontend.");
                }
            }

            // Sincronizar cotización en el mismo flujo del cobro para evitar desfaces
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
                    (float)($resumenCotizacion['descuento_aplicado'] ?? 0)
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
        $hasReferenciaOrigen = self::columnExists($conn, 'cobros', 'referencia_origen');
        $hasAtencionSolidaria = self::columnExists($conn, 'cobros', 'atencion_solidaria');
        if ($hasReferenciaOrigen && $hasAtencionSolidaria) {
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
        $stmt->execute();
        $cobro_id = $conn->insert_id;
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
        $stmt_detalle->bind_param("isisssd", $cobro_id, $servicio_tipo, $servicio_id, $descripcion_json, $cantidad, $precio_unitario, $subtotal);
        $stmt_detalle->execute();
        return $cobro_id;
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
