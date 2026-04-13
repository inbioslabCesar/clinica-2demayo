<?php
// Módulo de Cobros: lógica principal para registrar cobros y detalles
class CobroModule
{
    private static function cargarDetallesCobros($conn, $cobroIds)
    {
        $cobroIds = array_values(array_unique(array_filter(array_map('intval', $cobroIds), fn($id) => $id > 0)));
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

    private static function resolverCotizacionIdDesdeCobro($data)
    {
        $id = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
        if ($id > 0) {
            return $id;
        }

        if (!isset($data['detalles']) || !is_array($data['detalles'])) {
            return 0;
        }

        foreach ($data['detalles'] as $detalle) {
            $detalleId = isset($detalle['cotizacion_id']) ? (int)$detalle['cotizacion_id'] : 0;
            if ($detalleId > 0) {
                return $detalleId;
            }
        }

        return 0;
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

            $cotizacionId = isset($data['cotizacion_id']) ? (int)$data['cotizacion_id'] : 0;
            if ($cotizacionId <= 0 && isset($data['detalles']) && is_array($data['detalles'])) {
                foreach ($data['detalles'] as $det) {
                    $detCot = isset($det['cotizacion_id']) ? (int)$det['cotizacion_id'] : 0;
                    if ($detCot > 0) {
                        $cotizacionId = $detCot;
                        break;
                    }
                }
            }

            // Resolver paciente_id desde cotización si no viene en los datos
            $pacienteId = isset($data['paciente_id']) ? (int)$data['paciente_id'] : 0;
            if (($pacienteId <= 0 || $pacienteId === null) && $cotizacionId > 0 && self::tableExists($conn, 'cotizaciones')) {
                $stmtPaciente = $conn->prepare("SELECT paciente_id FROM cotizaciones WHERE id = ? LIMIT 1");
                if ($stmtPaciente) {
                    $stmtPaciente->bind_param("i", $cotizacionId);
                    $stmtPaciente->execute();
                    $rowPaciente = $stmtPaciente->get_result()->fetch_assoc();
                    $stmtPaciente->close();
                    
                    if ($rowPaciente && isset($rowPaciente['paciente_id'])) {
                        $pacienteIdResuelto = (int)$rowPaciente['paciente_id'];
                        if ($pacienteIdResuelto > 0) {
                            $data['paciente_id'] = $pacienteIdResuelto;
                        }
                    }
                }
            }

            if ($cotizacionId > 0 && self::tableExists($conn, 'cotizaciones') && self::columnExists($conn, 'cotizaciones', 'fecha_vencimiento')) {
                $stmtV = $conn->prepare("SELECT estado, fecha_vencimiento FROM cotizaciones WHERE id = ? LIMIT 1");
                if ($stmtV) {
                    $stmtV->bind_param("i", $cotizacionId);
                    $stmtV->execute();
                    $rowV = $stmtV->get_result()->fetch_assoc();
                    $stmtV->close();

                    if ($rowV) {
                        $estadoCot = strtolower(trim((string)($rowV['estado'] ?? '')));
                        $fechaVenc = trim((string)($rowV['fecha_vencimiento'] ?? ''));
                        if ($fechaVenc !== '' && in_array($estadoCot, ['pendiente', 'parcial'], true)) {
                            $tsVence = strtotime($fechaVenc);
                            if ($tsVence !== false && time() > $tsVence) {
                                throw new \Exception('La cotización está vencida y no puede cobrarse. Solicita una recotización.');
                            }
                        }
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

            // Caja ya validada arriba; usar datos para registrar ingreso

            $cotizacionIdFlujo = self::resolverCotizacionIdDesdeCobro($data);
            $usarHonorarioDiferido = $cotizacionIdFlujo > 0;

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
                if (in_array($servicio_key, ['consulta', 'ecografia', 'operacion', 'rayosx', 'laboratorio', 'farmacia', 'procedimiento']) && !empty($data['detalles'])) {
                    foreach ($data['detalles'] as $i => $detalleServicio) {
                        $detalleServicioKeyRaw = strtolower(trim((string)($detalleServicio['servicio_tipo'] ?? $servicio_key)));
                        $detalleServicioKey = $detalleServicioKeyRaw;
                        if ($detalleServicioKey === 'rayos_x' || $detalleServicioKey === 'rayos x') $detalleServicioKey = 'rayosx';
                        if ($detalleServicioKey === 'rx') $detalleServicioKey = 'rayosx';
                        if ($detalleServicioKey === 'operaciones') $detalleServicioKey = 'operacion';
                        if ($detalleServicioKey === 'procedimientos') $detalleServicioKey = 'procedimiento';
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
                        $tarifa = null;
                        if ($detalleServicioKey === 'laboratorio') {
                            $examen_id = $detalleServicio['servicio_id'] ?? null;
                            if ($examen_id) {
                                $stmt_examen = $conn->prepare("SELECT * FROM examenes_laboratorio WHERE id = ? AND activo = 1 LIMIT 1");
                                $stmt_examen->bind_param("i", $examen_id);
                                $stmt_examen->execute();
                                $tarifa = $stmt_examen->get_result()->fetch_assoc();
                                if (!$tarifa) {
                                    throw new \Exception('No se encontró examen activo para el servicio seleccionado (id: ' . $examen_id . ').');
                                }
                            } else {
                                throw new \Exception('No se envió examen_id para laboratorio.');
                            }
                        } else if ($detalleServicioKey === 'farmacia') {
                            $medicamento_id = $detalleServicio['servicio_id'] ?? null;
                            if ($medicamento_id) {
                                $stmt_medicamento = $conn->prepare("SELECT * FROM medicamentos WHERE id = ? AND estado = 'activo' LIMIT 1");
                                $stmt_medicamento->bind_param("i", $medicamento_id);
                                $stmt_medicamento->execute();
                                $tarifa = $stmt_medicamento->get_result()->fetch_assoc();
                                if (!$tarifa) {
                                    throw new \Exception('No se encontró medicamento activo para el servicio seleccionado (id: ' . $medicamento_id . ').');
                                }
                            } else {
                                throw new \Exception('No se envió medicamento_id para farmacia.');
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
                                            $cotizacionIdFlujo,
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
                                        $mov_id = intval($movimientoHonorario);
                                        if ($mov_id <= 0) {
                                            throw new \Exception('No se pudo registrar el movimiento de honorario médico.');
                                        }
                                        $data['detalles'][$i]['honorario_movimiento_id'] = $mov_id; // Guardar el id retornado
                                        $honorario_movimiento_id = $mov_id; // Actualizar honorario_movimiento_id
                                    }
                                }
                            }

                            // Registrar ingreso en caja por cada detalle
                            // Aplicar descuento proporcional si existe
                            $monto_detalle = $detalleServicio['subtotal'] ?? $total_param;
                            $monto_original = $data['monto_original'] ?? null;
                            $monto_descuento = $data['monto_descuento'] ?? 0;
                            if ($monto_original && $monto_descuento > 0 && $monto_original > 0) {
                                $proporcion = $monto_detalle / $monto_original;
                                $monto_detalle = $monto_detalle - ($monto_descuento * $proporcion);
                            }
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
                        $cotizacionId
                    );
                }
            }

            // ...el bloque de registro de honorarios médicos ya se ejecuta arriba, no repetir aquí...

            // Registro de atención
            if ($data['paciente_id'] && $data['paciente_id'] !== 'null') {
                $ok = AtencionModule::registrarAtencion($conn, $data['paciente_id'], $data['usuario_id'], $servicio_key);
                if (!$ok) {
                    throw new \Exception("Servicio '$servicio_key' no permitido en atenciones. Actualiza el ENUM o revisa el frontend.");
                }
            }

            // Sincronizar cotización en el mismo flujo del cobro para evitar desfaces
            $cotizacionIdSync = $cotizacionIdFlujo;
            if ($cotizacionIdSync > 0) {
                self::sincronizarAbonoCotizacionDesdeCobro(
                    $conn,
                    $cotizacionIdSync,
                    $cobro_id,
                    (float)($data['total'] ?? 0),
                    (int)($data['usuario_id'] ?? 0),
                    (float)($data['monto_descuento'] ?? 0)
                );

                if (self::cotizacionEstaPagada($conn, $cotizacionIdSync)) {
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
        if (!$data['paciente_id'] || $data['paciente_id'] === 'null') {
            $nombre_paciente = trim((string)($data['paciente_nombre'] ?? '')) ?: 'Cliente particular';
            $dni_paciente = $data['paciente_dni'] ?? '';
            $observaciones = "Cliente no registrado: $nombre_paciente (DNI: $dni_paciente). " . $observaciones;
        }
        $paciente_id_param = ($data['paciente_id'] && $data['paciente_id'] !== 'null') ? $data['paciente_id'] : null;
    $usuario_id_param = (int)($_SESSION['usuario']['id'] ?? ($data['usuario_id'] ?? 0));
        $total_param = $data['total'];
        $tipo_pago_param = $data['tipo_pago'];
        $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones) VALUES (?, ?, ?, ?, 'pagado', ?)");
        $stmt->bind_param("iidss", $paciente_id_param, $usuario_id_param, $total_param, $tipo_pago_param, $observaciones);
        $stmt->execute();
        $cobro_id = $conn->insert_id;
        // Insertar detalles del cobro
        $servicio_tipo = $data['detalles'][0]['servicio_tipo'];
        $servicio_id = $data['detalles'][0]['tarifa_id'] ?? ($data['detalles'][0]['servicio_id'] ?? null);
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
