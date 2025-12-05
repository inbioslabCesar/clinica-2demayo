<?php
// Módulo de Cobros: lógica principal para registrar cobros y detalles
class CobroModule
{
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
            foreach ($cobros as &$cobro) {
                $stmt_detalle = $conn->prepare("SELECT * FROM cobros_detalle WHERE cobro_id = ?");
                $stmt_detalle->bind_param("i", $cobro['id']);
                $stmt_detalle->execute();
                $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
                $cobro['detalles'] = $detalles;
            }
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
                $stmt_detalle = $conn->prepare("SELECT * FROM cobros_detalle WHERE cobro_id = ?");
                $stmt_detalle->bind_param("i", $cobro['id']);
                $stmt_detalle->execute();
                $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
                $cobro['detalles'] = $detalles;
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
        foreach ($cobros as &$cobro) {
            $stmt_detalle = $conn->prepare("SELECT * FROM cobros_detalle WHERE cobro_id = ?");
            $stmt_detalle->bind_param("i", $cobro['id']);
            $stmt_detalle->execute();
            $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
            $cobro['detalles'] = $detalles;
        }
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
                                $usuario_actual = $_SESSION['usuario_id'] ?? 1;
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
            // Registrar cobro principal y detalles
            $cobro_id = self::registrarCobro($conn, $data);
            // Registrar descuento aplicado si corresponde
            self::registrarDescuento($conn, $data, $cobro_id);

            // Obtener caja abierta y registrar ingreso
            $fecha_cobro = $data['fecha'] ?? date('Y-m-d');
            $turno_cobro = $data['turno'] ?? null;
            $caja_abierta = CajaModule::obtenerCajaAbierta($conn, $data['usuario_id'], $fecha_cobro, $turno_cobro);
            $caja_id = $caja_abierta['id'] ?? null;

            // Registrar movimientos de laboratorio de referencia
            foreach ($data['detalles'] as $detalle) {
                if (!empty($detalle['derivado']) && $detalle['derivado'] === true) {
                    $usuario_caja = $caja_abierta['usuario_id'] ?? $data['usuario_id'];
                    $turno_caja = $caja_abierta['turno'] ?? ($data['turno'] ?? null);
                    LaboratorioModule::registrarMovimientoReferencia($conn, $cobro_id, $detalle, $caja_id, $data['paciente_id'], $usuario_caja, $turno_caja);
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
                        // Asegurar que cada detalle tenga paciente_id
                        if (!isset($detalleServicio['paciente_id']) || $detalleServicio['paciente_id'] === null) {
                            $detalleServicio['paciente_id'] = $data['paciente_id'] ?? null;
                        }
                        $tarifa = null;
                        if ($servicio_key === 'laboratorio') {
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
                        } else if ($servicio_key === 'farmacia') {
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
                            if ($servicio_key === 'rayosx') {
                                // Eliminado log de depuración rayosx
                            }
                            if ($tarifa_id) {
                                // Validar existencia del tarifa_id en tarifas
                                $stmt_check = $conn->prepare("SELECT COUNT(*) as total FROM tarifas WHERE id = ?");
                                $stmt_check->bind_param("i", $tarifa_id);
                                $stmt_check->execute();
                                $total_tarifa = $stmt_check->get_result()->fetch_assoc()['total'];
                                if ($total_tarifa == 0) {
                                    throw new \Exception('El tarifa_id enviado (' . $tarifa_id . ') no existe en la tabla tarifas. Verifica la selección en el frontend/API.');
                                }
                                $stmt_tarifa = $conn->prepare("SELECT * FROM tarifas WHERE id = ? AND activo = 1 LIMIT 1");
                                $stmt_tarifa->bind_param("i", $tarifa_id);
                                $stmt_tarifa->execute();
                                $tarifa = $stmt_tarifa->get_result()->fetch_assoc();
                                if (!$tarifa) {
                                    throw new \Exception('No se encontró tarifa activa para el servicio seleccionado (id: ' . $tarifa_id . ').');
                                }
                            } else {
                                $medico_id_buscar = isset($detalleServicio['medico_id']) ? $detalleServicio['medico_id'] : null;
                                if ($medico_id_buscar) {
                                    $stmt_tarifa_tipo = $conn->prepare("SELECT * FROM tarifas WHERE servicio_tipo = ? AND medico_id = ? AND activo = 1 LIMIT 1");
                                    $stmt_tarifa_tipo->bind_param("si", $servicio_key, $medico_id_buscar);
                                    $stmt_tarifa_tipo->execute();
                                    $tarifa = $stmt_tarifa_tipo->get_result()->fetch_assoc();
                                } else {
                                    $stmt_tarifa_tipo = $conn->prepare("SELECT * FROM tarifas WHERE servicio_tipo = ? AND activo = 1 LIMIT 1");
                                    $stmt_tarifa_tipo->bind_param("s", $servicio_key);
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
                            $mov_id = HonorarioModule::registrarMovimiento($conn, $detalleServicio, $tarifa, $servicio_key, $metodo_pago, $cobro_id);
                            $data['detalles'][$i]['honorario_movimiento_id'] = $mov_id; // Guardar el id retornado
                            $honorario_movimiento_id = $mov_id; // Actualizar honorario_movimiento_id
                            // Registrar ingreso en caja por cada honorario
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
                                'tipo_ingreso' => $tipo_ingreso,
                                'area_servicio' => $area_servicio,
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
                                'cobrado_por' => ($_SESSION['usuario_id'] ?? $usuario_id_param),
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
            if ($servicio_key === 'farmacia') {
                foreach ($data['detalles'] as $detalle) {
                    FarmaciaModule::procesarVenta(
                        $conn,
                        $detalle,
                        $cobro_id,
                        $nombre_paciente,
                        $dni_paciente,
                        $hc_paciente,
                        $data['usuario_id']
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
        if ((!$data['paciente_id'] || $data['paciente_id'] === 'null') &&
            (empty($data['paciente_nombre']) || empty($data['paciente_dni']))
        ) {
            return ['success' => false, 'error' => 'Para pacientes no registrados se requiere nombre y DNI'];
        }
        return ['success' => true];
    }
    // --- Registrar cobro principal y detalles ---
    public static function registrarCobro($conn, $data)
    {
        $observaciones = $data['observaciones'] ?? '';
        if (!$data['paciente_id'] || $data['paciente_id'] === 'null') {
            $nombre_paciente = $data['paciente_nombre'] ?? 'Cliente no registrado';
            $dni_paciente = $data['paciente_dni'] ?? '';
            $observaciones = "Cliente no registrado: $nombre_paciente (DNI: $dni_paciente). " . $observaciones;
        }
        $paciente_id_param = ($data['paciente_id'] && $data['paciente_id'] !== 'null') ? $data['paciente_id'] : null;
        $usuario_id_param = $data['usuario_id'];
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
                file_put_contents(__DIR__ . '/debug_descuento_servicio.txt',
                    'detalles: ' . var_export($data['detalles'], true) . "\n" .
                    'servicio_tipo: ' . var_export($data['detalles'][0]['servicio_tipo'] ?? null, true) . "\n",
                    FILE_APPEND
                );
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
