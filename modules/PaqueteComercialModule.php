<?php

class PaqueteComercialModule
{
    public static function snapshot(array $detalle): array
    {
        $raw = $detalle['snapshot_json'] ?? [];
        if (is_string($raw) && trim($raw) !== '') {
            $raw = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        }
        return is_array($raw) ? $raw : [];
    }

    // Snapshot de examen enviado por el cliente (texto JSON o arreglo). El snapshot de un
    // componente de paquete solo trae metadatos comerciales y no describe el examen:
    // en ese caso devuelve null para que se consulte la version vigente del examen.
    public static function snapshotLaboratorioExplicito(array $detalle): ?array
    {
        $raw = $detalle['snapshot_json'] ?? null;
        if (is_string($raw) && trim($raw) !== '') {
            $raw = json_decode($raw, true);
        }
        if (!is_array($raw) || empty($raw)) {
            return null;
        }
        $traeExamen = isset($raw['version_id']) || isset($raw['hash_contenido']) || isset($raw['nombre']);
        if (isset($raw['paquete_modelo_comercial']) && !$traeExamen) {
            return null;
        }
        return $raw;
    }

    public static function esComponente(array $detalle): bool
    {
        return (self::snapshot($detalle)['paquete_modelo_comercial'] ?? '') === 'importe_unico'
            && (self::snapshot($detalle)['paquete_rol'] ?? '') === 'componente';
    }

    public static function esCargo(array $detalle): bool
    {
        return (self::snapshot($detalle)['paquete_modelo_comercial'] ?? '') === 'importe_unico'
            && (self::snapshot($detalle)['paquete_rol'] ?? '') === 'cargo';
    }

    public static function baseReferencia(array $detalle): float
    {
        return self::esComponente($detalle)
            ? (float)(self::snapshot($detalle)['paquete_base_honorario'] ?? 0)
            : (float)($detalle['subtotal'] ?? 0);
    }

    public static function validarOperacionIndividual(array $detalle): void
    {
        if (self::esCargo($detalle) || self::esComponente($detalle)) {
            throw new InvalidArgumentException('El paquete es una sola venta: no se puede retirar, cambiar cantidad o devolver un detalle aislado. Anule el paquete completo.');
        }
    }

    public static function validarAnulacionCotizacion(mysqli $conn, int $cotizacionId, array $detalles): void
    {
        $grupos = [];
        foreach ($detalles as $detalle) {
            $snapshot = self::snapshot($detalle);
            if (($snapshot['paquete_modelo_comercial'] ?? '') === 'importe_unico') {
                $grupos[$snapshot['paquete_grupo']] = true;
            }
        }
        foreach (array_keys($grupos) as $grupo) {
            $stmt = $conn->prepare("SELECT cd.id FROM cotizaciones_detalle cd
                INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                WHERE cd.cotizacion_id <> ?
                  AND LOWER(TRIM(ct.estado)) NOT IN ('anulado', 'anulada')
                  AND COALESCE(cd.estado_item, 'activo') <> 'eliminado'
                  AND JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(cd.snapshot_json) THEN cd.snapshot_json ELSE '{}' END, '$.paquete_grupo')) = ?
                LIMIT 1");
            $stmt->bind_param('is', $cotizacionId, $grupo);
            $stmt->execute();
            $parcial = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($parcial) {
                throw new InvalidArgumentException('El paquete incluye servicios de otra cotizacion: requiere anulacion conjunta y conciliacion de los importes reconocidos, no una anulacion parcial.');
            }
        }
    }

    // Monto fijo o porcentaje definido en el propio paquete (no el honorario normal del tarifario).
    private static function tieneHonorarioExplicito(array $componente): bool
    {
        $regla = $componente['honorario_regla'] ?? null;
        return is_array($regla)
            && in_array($regla['modo_honorario'] ?? '', ['monto_fijo_medico_paquete', 'porcentaje_medico_paquete'], true);
    }

    public static function honorario(array $componente, array $tarifa): float
    {
        $cantidad = max(1, (int)($componente['cantidad'] ?? 1));
        $regla = $componente['honorario_regla'] ?? [];
        $modo = $regla['modo_honorario'] ?? 'usar_configuracion_medico';
        if ($modo === 'monto_fijo_medico_paquete') {
            return round(max(0, (float)($regla['monto_fijo_medico'] ?? 0)) * $cantidad, 2);
        }
        if ($modo === 'porcentaje_medico_paquete') {
            $base = (float)($componente['subtotal_referencial'] ?? 0);
            return round($base * min(100, max(0, (float)($regla['porcentaje_medico'] ?? 0))) / 100, 2);
        }
        if (!empty($tarifa['monto_medico'])) {
            return round(max(0, (float)$tarifa['monto_medico']) * $cantidad, 2);
        }
        return round(max(0, (float)($tarifa['precio_particular'] ?? 0)) * $cantidad
            * min(100, max(0, (float)($tarifa['porcentaje_medico'] ?? 0))) / 100, 2);
    }

    public static function expandir(array $detalles, callable $normalizarTipo, callable $resolverTarifa): array
    {
        $out = [];
        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) continue;
            $tipo = $normalizarTipo($detalle['servicio_tipo'] ?? $detalle['source_type'] ?? '');
            $componentes = $detalle['componentes'] ?? $detalle['paquete_items'] ?? $detalle['items_paquete'] ?? null;
            $esPaquete = in_array($tipo, ['paquete', 'perfil'], true) || !empty($detalle['es_paquete']) || !empty($detalle['es_perfil']);
            if (!$esPaquete || !is_array($componentes)) {
                $detalle['servicio_tipo'] = $tipo;
                $out[] = $detalle;
                continue;
            }
            if (empty($componentes)) {
                throw new InvalidArgumentException('El paquete necesita componentes clinicos');
            }
            if (!in_array($tipo, ['paquete', 'perfil'], true)) $tipo = !empty($detalle['es_perfil']) ? 'perfil' : 'paquete';
            $cantidadPaquete = max(1, (int)($detalle['cantidad'] ?? 1));
            $total = round((float)($detalle['subtotal'] ?? ((float)($detalle['precio_unitario'] ?? 0) * $cantidadPaquete)), 2);
            if ($total <= 0) {
                throw new InvalidArgumentException('El paquete necesita un precio global mayor a cero');
            }
            $grupo = bin2hex(random_bytes(12));
            $meta = [
                'paquete_modelo_comercial' => 'importe_unico',
                'paquete_grupo' => $grupo,
                'paquete_id' => (int)($detalle['paquete_id'] ?? $detalle['servicio_id'] ?? 0),
                'paquete_codigo' => (string)($detalle['paquete_codigo'] ?? ''),
                'paquete_tipo' => $tipo,
                'paquete_nombre' => (string)($detalle['descripcion'] ?? ''),
                'paquete_total' => $total,
                'paquete_cantidad' => $cantidadPaquete,
            ];
            $items = [];
            $totalHonorarios = 0.0;
            $honorariosFijos = 0.0;
            $ultimoHonorario = null;
            foreach ($componentes as $comp) {
                $itemTipo = $normalizarTipo($comp['servicio_tipo'] ?? $comp['source_type'] ?? '');
                if (in_array($itemTipo, ['paquete', 'perfil'], true)) {
                    throw new InvalidArgumentException('No se permiten paquetes anidados');
                }
                $cantidad = max(1, (int)($comp['cantidad'] ?? 1));
                $comp['servicio_tipo'] = $itemTipo;
                $comp['servicio_id'] = (int)($comp['servicio_id'] ?? $comp['source_id'] ?? 0);
                $comp['descripcion'] = (string)($comp['descripcion'] ?? $comp['descripcion_snapshot'] ?? '');
                $comp['cantidad'] = $cantidad * $cantidadPaquete;
                $comp['subtotal_referencial'] = round((float)($comp['precio_lista_snapshot'] ?? $comp['precio_unitario'] ?? 0) * $comp['cantidad'], 2);
                $tarifa = in_array($itemTipo, ['consulta', 'ecografia', 'rayosx', 'procedimiento', 'operacion'], true)
                    ? $resolverTarifa($comp) : [];
                if ($comp['servicio_id'] <= 0 && !empty($tarifa['id'])) $comp['servicio_id'] = (int)$tarifa['id'];
                $monto = empty($tarifa) ? 0.0 : self::honorario($comp, $tarifa);
                $totalHonorarios += $monto;
                if (!empty($tarifa) && self::tieneHonorarioExplicito($comp)) $honorariosFijos += $monto;
                if (!empty($tarifa)) $ultimoHonorario = count($items);
                $comp['precio_unitario'] = 0;
                $comp['subtotal'] = 0;
                $comp['subtotal_original'] = 0;
                $comp['fecha_programada'] = $detalle['fecha_programada'] ?? $comp['fecha_programada'] ?? null;
                $comp['hora_programada'] = $detalle['hora_programada'] ?? $comp['hora_programada'] ?? null;
                $comp = array_merge($comp, $meta);
                $comp['snapshot_json'] = array_merge(self::snapshot($comp), $meta, [
                    'paquete_rol' => 'componente',
                    'honorario_regla' => $comp['honorario_regla'] ?? [],
                    'paquete_base_honorario' => $comp['subtotal_referencial'],
                    'paquete_honorario_medico' => $monto,
                    'paquete_honorario_clinica' => 0,
                ]);
                $items[] = $comp;
            }
            // Un monto fijo o porcentaje escrito en el paquete que ya supera el precio es un error de
            // configuracion. El honorario normal del medico (tarifario) puede superarlo: la clinica lo absorbe.
            if (round($honorariosFijos, 2) > $total) {
                throw new InvalidArgumentException(
                    'Los honorarios fijos del paquete (S/ ' . number_format($honorariosFijos, 2, '.', '')
                    . ') superan su precio global (S/ ' . number_format($total, 2, '.', '')
                    . '). Reduzca el monto del medico o suba el precio del paquete.'
                );
            }
            $objetivoClinica = $detalle['paquete_monto_clinica_fijo'] ?? null;
            if ($objetivoClinica !== null && $objetivoClinica !== ''
                && abs(round($total - $totalHonorarios, 2) - round((float)$objetivoClinica * $cantidadPaquete, 2)) > 0.009) {
                throw new InvalidArgumentException('El remanente del paquete no coincide con el monto objetivo de la clinica');
            }
            if ($ultimoHonorario !== null) {
                // El remanente se contabiliza una sola vez; no es un precio de venta del componente.
                // Si el honorario supera el precio, la clinica queda en 0 y el deficit se registra aparte.
                $remanente = round($total - $totalHonorarios, 2);
                $items[$ultimoHonorario]['snapshot_json']['paquete_honorario_clinica'] = max(0.0, $remanente);
                $items[$ultimoHonorario]['snapshot_json']['paquete_clinica_absorbe'] = $remanente < 0 ? round(-$remanente, 2) : 0.0;
                $items[$ultimoHonorario]['snapshot_json']['paquete_portador_remanente'] = 1;
            }
            $cargo = array_merge($detalle, $meta);
            unset($cargo['componentes'], $cargo['paquete_items'], $cargo['items_paquete']);
            $cargo['servicio_tipo'] = $tipo;
            $cargo['servicio_id'] = $meta['paquete_id'];
            $cargo['medico_id'] = null;
            $cargo['precio_unitario'] = round($total / $cantidadPaquete, 2);
            $cargo['subtotal'] = $total;
            $cargo['snapshot_json'] = array_merge($meta, [
                'paquete_rol' => 'cargo',
                'paquete_componentes' => $items,
            ]);
            $out[] = $cargo;
            foreach ($items as $item) $out[] = $item;
        }
        return $out;
    }

    public static function tarifa(mysqli $conn, array $item): array
    {
        $id = (int)$item['servicio_id'];
        if ($id > 0) {
            $stmt = $conn->prepare('SELECT * FROM tarifas WHERE id = ? AND activo = 1');
            $stmt->bind_param('i', $id);
        } else {
            $tipo = $item['servicio_tipo'];
            $descripcion = trim((string)$item['descripcion']);
            $stmt = $conn->prepare('SELECT * FROM tarifas WHERE servicio_tipo = ? AND descripcion = ? AND activo = 1 ORDER BY id DESC LIMIT 2');
            $stmt->bind_param('ss', $tipo, $descripcion);
        }
        $stmt->execute();
        $resultado = $stmt->get_result();
        if ($resultado->num_rows > 1) throw new RuntimeException('Tarifa ambigua para el componente; seleccione un servicio del tarifario');
        $row = $resultado->fetch_assoc();
        $stmt->close();
        if (!$row) throw new RuntimeException('No existe tarifa activa para el componente del paquete: ' . $id);
        return $row;
    }

    public static function completarComponentesCobro(mysqli $conn, array $detalles): array
    {
        $presentes = [];
        foreach ($detalles as $detalle) {
            $id = (int)($detalle['cotizacion_detalle_id'] ?? $detalle['detalle_id'] ?? 0);
            if ($id > 0) $presentes[$id] = true;
        }
        $out = $detalles;
        foreach ($detalles as $cargo) {
            if (!self::esCargo($cargo)) continue;
            $snapshot = self::snapshot($cargo);
            $cotizacionIds = [(int)($cargo['cotizacion_id'] ?? 0)];
            foreach ($snapshot['paquete_origenes_reconocidos'] ?? [] as $origen) {
                $cotizacionIds[] = (int)$origen['cotizacion_id'];
            }
            $cotizacionIds = array_values(array_unique(array_filter($cotizacionIds)));
            if (empty($cotizacionIds)) continue;
            $ph = implode(',', array_fill(0, count($cotizacionIds), '?'));
            $stmt = $conn->prepare("SELECT * FROM cotizaciones_detalle WHERE cotizacion_id IN ($ph) AND COALESCE(estado_item, 'activo') <> 'eliminado'");
            $stmt->bind_param(str_repeat('i', count($cotizacionIds)), ...$cotizacionIds);
            $stmt->execute();
            $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
            foreach ($rows as $row) {
                if (!self::esComponente($row)) continue;
                if (self::snapshot($row)['paquete_grupo'] !== $snapshot['paquete_grupo']) continue;
                $id = (int)$row['id'];
                if (isset($presentes[$id])) continue;
                $row['cotizacion_detalle_id'] = $id;
                $row['detalle_id'] = $id;
                $row['precio_unitario'] = 0;
                $row['subtotal'] = 0;
                $row['subtotal_original'] = 0;
                $row['_paquete_solo_honorario'] = 1;
                $out[] = $row;
                $presentes[$id] = true;
            }
        }
        return $out;
    }

    public static function aplicarDescuentos(array $detalles, ?mysqli $conn = null, bool $renunciarHonorarios = false): array
    {
        $originales = $detalles;
        $porGrupo = [];
        foreach ($detalles as $detalle) {
            if (!self::esCargo($detalle)) continue;
            $grupo = self::snapshot($detalle)['paquete_grupo'];
            $porGrupo[$grupo] = ($porGrupo[$grupo] ?? 0) + (float)($detalle['descuento_item'] ?? 0);
        }
        foreach ($porGrupo as $grupo => $descuento) {
            if ($descuento <= 0) continue;
            $renunciado = 0.0;
            if ($renunciarHonorarios) {
                foreach ($detalles as &$detalle) {
                    $snapshot = self::snapshot($detalle);
                    if (($snapshot['paquete_grupo'] ?? '') !== $grupo || !self::esComponente($detalle)) continue;
                    $renunciado += (float)$snapshot['paquete_honorario_medico'];
                    $snapshot['paquete_honorario_medico'] = 0;
                    $snapshot['paquete_renuncia_honorario_medico'] = true;
                    $detalle['snapshot_json'] = $snapshot;
                }
                unset($detalle);
            }
            $aplicado = false;
            foreach ($detalles as &$detalle) {
                $snapshot = self::snapshot($detalle);
                if (($snapshot['paquete_grupo'] ?? '') !== $grupo || empty($snapshot['paquete_portador_remanente'])) continue;
                $remanente = (float)$snapshot['paquete_honorario_clinica'] + $renunciado;
                if ($descuento > $remanente + 0.009) {
                    throw new InvalidArgumentException('El descuento del paquete supera el remanente de la clinica; no se pueden reducir honorarios fijos implicitamente');
                }
                $snapshot['paquete_honorario_clinica'] = round($remanente - $descuento, 2);
                $detalle['snapshot_json'] = $snapshot;
                $aplicado = true;
                break;
            }
            unset($detalle);
            if (!$aplicado) {
                // Sin participacion medica, todo el cargo es ingreso de la clinica.
                foreach ($detalles as $detalle) {
                    $snapshot = self::snapshot($detalle);
                    if (($snapshot['paquete_grupo'] ?? '') === $grupo && self::esComponente($detalle)
                        && (float)$snapshot['paquete_honorario_medico'] > 0) {
                        throw new RuntimeException('Falta el remanente del paquete para aplicar el descuento');
                    }
                }
            }
        }
        if ($conn) {
            foreach ($detalles as $index => $detalle) {
                $snapshot = self::snapshot($detalle);
                if ($snapshot === self::snapshot($originales[$index])) continue;
                $id = (int)($detalle['cotizacion_detalle_id'] ?? $detalle['detalle_id'] ?? 0);
                if ($id <= 0) continue;
                $json = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                $stmt = $conn->prepare('UPDATE cotizaciones_detalle SET snapshot_json = ? WHERE id = ?');
                $stmt->bind_param('si', $json, $id);
                $stmt->execute();
                $stmt->close();
            }
        }
        return $detalles;
    }
}
