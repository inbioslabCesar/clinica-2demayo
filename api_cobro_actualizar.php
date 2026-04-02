<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/modules/CajaModule.php';
require_once __DIR__ . '/modules/HonorarioModule.php';
require_once __DIR__ . '/modules/FarmaciaModule.php';
require_once __DIR__ . '/modules/LaboratorioModule.php';

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$cobro_id = $body['cobro_id'] ?? null;
$servicio_tipo = strtolower(trim($body['servicio_tipo'] ?? ''));
$items = $body['items'] ?? [];

function table_exists_sync($conn, $tableName) {
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    if (!$stmt) return false;
    $stmt->bind_param('s', $tableName);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function column_exists_sync($conn, $tableName, $columnName) {
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
    if (!$stmt) return false;
    $stmt->bind_param('ss', $tableName, $columnName);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

// Log minimal incoming payload info to help debug failed requests from the UI
if (is_array($body)) {
    $countItems = is_array($items) ? count($items) : 0;
    $replaceFlag = !empty($body['replace']) ? 'true' : 'false';
    error_log("[DEBUG] api_cobro_actualizar.php received: cobro_id={$cobro_id}, servicio_tipo={$servicio_tipo}, items_count={$countItems}, replace={$replaceFlag}");
} else {
    error_log("[WARN] api_cobro_actualizar.php: body not JSON or empty");
}

if (!$cobro_id || !$servicio_tipo || !is_array($items) || count($items) === 0) {
    echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
    exit;
}

// Obtener cobro actual
$stmt_c = $conn->prepare("SELECT c.*, p.id as paciente_id, p.nombre, p.apellido, p.dni, p.historia_clinica FROM cobros c LEFT JOIN pacientes p ON c.paciente_id = p.id WHERE c.id = ? LIMIT 1");
$stmt_c->bind_param('i', $cobro_id);
$stmt_c->execute();
$cobro = $stmt_c->get_result()->fetch_assoc();
if (!$cobro) {
    echo json_encode(['success' => false, 'error' => 'Cobro no encontrado']);
    exit;
}

$usuario_id = $_SESSION['usuario']['id'] ?? ($cobro['usuario_id'] ?? null);
if (!$usuario_id) {
    echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
    exit;
}

// Caja guard: requerir caja abierta
$fecha_cobro = date('Y-m-d');
$turno_cobro = null;
$caja_abierta = CajaModule::obtenerCajaAbierta($conn, $usuario_id, $fecha_cobro, $turno_cobro);
if (!$caja_abierta || empty($caja_abierta['id'])) {
    echo json_encode(['success' => false, 'error' => 'No hay caja abierta. Abre caja para actualizar este cobro.']);
    exit;
}
$caja_id = $caja_abierta['id'];

$conn->begin_transaction();
try {
    // 1) Registrar honorarios y caja por cada item agregado
    $tipo_ingreso_map = [
        'farmacia' => 'farmacia',
        'laboratorio' => 'laboratorio',
        'consulta' => 'consulta',
        'ecografia' => 'ecografia',
        'rayosx' => 'rayosx',
        'procedimiento' => 'procedimiento',
        'operacion' => 'operaciones',
        'cirugia' => 'operaciones'
    ];
    $tipo_ingreso = $tipo_ingreso_map[$servicio_tipo] ?? 'otros';
    $area_servicio = ucfirst($servicio_tipo);

    $metodo_pago_map = [
        'efectivo' => 'efectivo',
        'tarjeta' => 'tarjeta',
        'transferencia' => 'transferencia',
        'yape' => 'yape',
        'plin' => 'plin',
        'seguro' => 'otros'
    ];
    $metodo_pago = $metodo_pago_map[$cobro['tipo_pago']] ?? 'otros';
    $nombre_paciente = trim(($cobro['nombre'] ?? '') . ' ' . ($cobro['apellido'] ?? ''));
    $paciente_id = $cobro['paciente_id'] ?? null;
    $dni_paciente = $cobro['dni'] ?? '';
    $hc_paciente = $cobro['historia_clinica'] ?? '';

    $total_agregado = 0.0;

    foreach ($items as $detalleServicio) {
        $cantidad = (int)($detalleServicio['cantidad'] ?? 1);
        $precio_unitario = (float)($detalleServicio['precio_unitario'] ?? 0);
        $subtotal_item = (float)($detalleServicio['subtotal'] ?? ($precio_unitario * $cantidad));
        $total_agregado += $subtotal_item;

        // Registrar honorarios si aplica
        if (in_array($servicio_tipo, ['consulta', 'ecografia', 'rayosx', 'operacion', 'laboratorio', 'procedimiento'])) {
            // Intentar recuperar tarifa si viene servicio_id
            $tarifa = null;
            if ($servicio_tipo === 'laboratorio') {
                $examen_id = $detalleServicio['servicio_id'] ?? null;
                if ($examen_id) {
                    $stmt_ex = $conn->prepare("SELECT * FROM examenes_laboratorio WHERE id = ? AND activo = 1 LIMIT 1");
                    $stmt_ex->bind_param('i', $examen_id);
                    $stmt_ex->execute();
                    $tarifa = $stmt_ex->get_result()->fetch_assoc();
                }
            } else if ($servicio_tipo === 'procedimiento') {
                $tarifa_id = $detalleServicio['servicio_id'] ?? null;
                if ($tarifa_id) {
                    $stmt_tar = $conn->prepare("SELECT * FROM tarifas WHERE id = ? AND activo = 1 LIMIT 1");
                    $stmt_tar->bind_param('i', $tarifa_id);
                    $stmt_tar->execute();
                    $tarifa = $stmt_tar->get_result()->fetch_assoc();
                }
            } else {
                $tarifa_id = $detalleServicio['servicio_id'] ?? null;
                if ($tarifa_id) {
                    $stmt_tar = $conn->prepare("SELECT * FROM tarifas WHERE id = ? AND activo = 1 LIMIT 1");
                    $stmt_tar->bind_param('i', $tarifa_id);
                    $stmt_tar->execute();
                    $tarifa = $stmt_tar->get_result()->fetch_assoc();
                }
            }
            $mov_id = HonorarioModule::registrarMovimiento($conn, $detalleServicio, $tarifa, $servicio_tipo, $metodo_pago, $cobro_id);

            // Registrar ingreso individual en caja
            $params_individual = [
                'caja_id' => $caja_id,
                'tipo_ingreso' => $tipo_ingreso,
                'area_servicio' => $area_servicio,
                'descripcion_ingreso' => $detalleServicio['descripcion'] ?? ($servicio_tipo . ' agregado'),
                'total_param' => $subtotal_item,
                'metodo_pago' => $metodo_pago,
                'cobro_id' => $cobro_id,
                'referencia_tabla_param' => 'cobros',
                'paciente_id_param' => $paciente_id,
                'nombre_paciente' => $nombre_paciente,
                'usuario_id_param' => $usuario_id,
                'turno_param' => ($caja_abierta['turno'] ?? null),
                'honorario_movimiento_id' => $mov_id,
                'cobrado_por' => ($_SESSION['usuario']['id'] ?? $usuario_id)
            ];
            CajaModule::registrarIngreso($conn, $params_individual);
        }

        // Laboratorio de referencia si aplica
        if ($servicio_tipo === 'laboratorio' && !empty($detalleServicio['derivado'])) {
            LaboratorioModule::registrarMovimientoReferencia(
                $conn,
                $cobro_id,
                $detalleServicio,
                $caja_id,
                $paciente_id,
                $usuario_id,
                ($caja_abierta['turno'] ?? null)
            );
        }

        // Farmacia: procesar venta
        if ($servicio_tipo === 'farmacia') {
            FarmaciaModule::procesarVenta(
                $conn,
                $detalleServicio,
                $cobro_id,
                $nombre_paciente,
                $dni_paciente,
                $hc_paciente,
                $usuario_id
            );
        }
    }

    // 2) Actualizar cobros_detalle: crear/actualizar bloque del servicio
    $stmt_cd = $conn->prepare("SELECT * FROM cobros_detalle WHERE cobro_id = ? AND servicio_tipo = ? LIMIT 1");
    $stmt_cd->bind_param('is', $cobro_id, $servicio_tipo);
    $stmt_cd->execute();
    $detalle_row = $stmt_cd->get_result()->fetch_assoc();

    if ($detalle_row) {
        // Combinar el bloque existente con los items enviados, pero
        // añadiendo sólo ítems nuevos (evitar duplicados/reemplazos).
        // Esto permite que la actualización agregue exámenes/productos
        // seleccionados sin borrar los que ya estaban, y evita reinsertar
        // duplicados cuando el cliente reenvía ítems.
        $existing = [];
        if (!empty($detalle_row['descripcion'])) {
            $decoded = json_decode($detalle_row['descripcion'], true);
            if (is_array($decoded)) $existing = $decoded;
        }

        // Función local para normalizar texto (similar al backend)
        $normalize = function($s) {
            $s = (string)$s;
            $s = trim($s);
            $s = mb_strtolower($s, 'UTF-8');
            $s = preg_replace('/\s+/u', ' ', $s);
            return $s;
        };

        // Añadir sólo ítems que no estén ya presentes en $existing
        foreach ($items as $newItem) {
            $found = false;
            $newServicioId = isset($newItem['servicio_id']) && is_numeric($newItem['servicio_id']) ? intval($newItem['servicio_id']) : 0;
            $newDesc = isset($newItem['descripcion']) ? $normalize($newItem['descripcion']) : '';
            $newSub = isset($newItem['subtotal']) ? floatval($newItem['subtotal']) : null;

            foreach ($existing as $ex) {
                $exServicioId = isset($ex['servicio_id']) && is_numeric($ex['servicio_id']) ? intval($ex['servicio_id']) : 0;
                $exDesc = isset($ex['descripcion']) ? $normalize($ex['descripcion']) : '';
                $exSub = isset($ex['subtotal']) ? floatval($ex['subtotal']) : null;

                $sameServicio = ($newServicioId > 0 && $exServicioId > 0) ? ($newServicioId === $exServicioId) : true;
                $descMatch = true;
                if ($newDesc !== '') {
                    $descMatch = ($exDesc === $newDesc) || (strpos($exDesc, $newDesc) !== false) || (strpos($newDesc, $exDesc) !== false);
                }
                $subMatch = ($newSub === null || $exSub === null) ? true : (abs($newSub - $exSub) < 0.01);

                if ($sameServicio && $descMatch && $subMatch) { $found = true; break; }
            }

            if (!$found) {
                $existing[] = $newItem;
            }
        }

        $merged = $existing;
        $cantidad = count($merged);
        $precio_promedio = 0.0;
        $suma = 0.0;
        foreach ($merged as $it) {
            $c = (int)($it['cantidad'] ?? 1);
            $pu = (float)($it['precio_unitario'] ?? 0);
            $sub = (float)($it['subtotal'] ?? ($pu * $c));
            $suma += $sub;
            $precio_promedio += $pu;
        }
        $precio_promedio = $cantidad > 0 ? ($precio_promedio / $cantidad) : 0.0;
        $json = json_encode($merged);
        $stmt_up = $conn->prepare("UPDATE cobros_detalle SET descripcion = ?, cantidad = ?, precio_unitario = ?, subtotal = ? WHERE id = ?");
        $stmt_up->bind_param('siddi', $json, $cantidad, $precio_promedio, $suma, $detalle_row['id']);
        $stmt_up->execute();
    } else {
        // crear nuevo bloque para este servicio
        $cantidad = count($items);
        $precio_promedio = 0.0;
        $suma = 0.0;
        foreach ($items as $it) {
            $c = (int)($it['cantidad'] ?? 1);
            $pu = (float)($it['precio_unitario'] ?? 0);
            $sub = (float)($it['subtotal'] ?? ($pu * $c));
            $suma += $sub;
            $precio_promedio += $pu;
        }
        $precio_promedio = $cantidad > 0 ? ($precio_promedio / $cantidad) : 0.0;
        $servicio_id = $items[0]['tarifa_id'] ?? ($items[0]['servicio_id'] ?? null);
        $json = json_encode($items);
        $stmt_ins = $conn->prepare("INSERT INTO cobros_detalle (cobro_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt_ins->bind_param('isisssd', $cobro_id, $servicio_tipo, $servicio_id, $json, $cantidad, $precio_promedio, $suma);
        $stmt_ins->execute();
    }

    // 3) Actualizar total del cobro
    $nuevo_total = (float)$cobro['total'] + (float)$total_agregado;
    $stmt_up_c = $conn->prepare("UPDATE cobros SET total = ? WHERE id = ?");
    $stmt_up_c->bind_param('di', $nuevo_total, $cobro_id);
    $stmt_up_c->execute();

    // 4) Si el cobro pertenece a una cotización, sincronizar total/saldo/estado
    // para reflejar correctamente ampliaciones posteriores al pago.
    $cotizacion_id = isset($body['cotizacion_id']) ? (int)$body['cotizacion_id'] : 0;
    if ($cotizacion_id <= 0 && !empty($items)) {
        foreach ($items as $it) {
            $cid = isset($it['cotizacion_id']) ? (int)$it['cotizacion_id'] : 0;
            if ($cid > 0) {
                $cotizacion_id = $cid;
                break;
            }
        }
    }

    if ($cotizacion_id <= 0 && table_exists_sync($conn, 'cotizacion_movimientos')) {
        $stmt_cm = $conn->prepare("SELECT cotizacion_id FROM cotizacion_movimientos WHERE cobro_id = ? AND cotizacion_id IS NOT NULL ORDER BY id DESC LIMIT 1");
        if ($stmt_cm) {
            $stmt_cm->bind_param('i', $cobro_id);
            $stmt_cm->execute();
            $mov = $stmt_cm->get_result()->fetch_assoc();
            $cotizacion_id = isset($mov['cotizacion_id']) ? (int)$mov['cotizacion_id'] : 0;
        }
    }

    if ($cotizacion_id > 0 && $total_agregado > 0) {
        $stmt_cot = $conn->prepare("SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE");
        if ($stmt_cot) {
            $stmt_cot->bind_param('i', $cotizacion_id);
            $stmt_cot->execute();
            $cot = $stmt_cot->get_result()->fetch_assoc();

            if ($cot) {
                $nuevo_total_cot = (float)($cot['total'] ?? 0) + (float)$total_agregado;

                if (column_exists_sync($conn, 'cotizaciones', 'total_pagado') && column_exists_sync($conn, 'cotizaciones', 'saldo_pendiente')) {
                    $pagado = (float)($cot['total_pagado'] ?? 0);
                    $nuevo_saldo = max(0, $nuevo_total_cot - $pagado);
                    $nuevo_estado = ($nuevo_saldo <= 0.00001)
                        ? 'pagado'
                        : ($pagado > 0 ? 'parcial' : 'pendiente');

                    if (column_exists_sync($conn, 'cotizaciones', 'version_actual')) {
                        $stmt_up_cot = $conn->prepare("UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ?, version_actual = version_actual + 1, updated_at = NOW() WHERE id = ?");
                        $stmt_up_cot->bind_param('ddsi', $nuevo_total_cot, $nuevo_saldo, $nuevo_estado, $cotizacion_id);
                    } else {
                        $stmt_up_cot = $conn->prepare("UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ? WHERE id = ?");
                        $stmt_up_cot->bind_param('ddsi', $nuevo_total_cot, $nuevo_saldo, $nuevo_estado, $cotizacion_id);
                    }
                } else {
                    $stmt_up_cot = $conn->prepare("UPDATE cotizaciones SET total = ? WHERE id = ?");
                    $stmt_up_cot->bind_param('di', $nuevo_total_cot, $cotizacion_id);
                }

                if ($stmt_up_cot) {
                    $stmt_up_cot->execute();
                }

                // También agregar al detalle de cotización los ítems nuevos evitando duplicados
                // para mantener consistente la edición posterior.
                if (table_exists_sync($conn, 'cotizaciones_detalle')) {
                    $stmt_det_cot = $conn->prepare("SELECT servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal FROM cotizaciones_detalle WHERE cotizacion_id = ?");
                    $existingCot = [];
                    if ($stmt_det_cot) {
                        $stmt_det_cot->bind_param('i', $cotizacion_id);
                        $stmt_det_cot->execute();
                        $res_det = $stmt_det_cot->get_result();
                        while ($row = $res_det->fetch_assoc()) {
                            $existingCot[] = $row;
                        }
                    }

                    $normalize = function($s) {
                        $s = (string)$s;
                        $s = trim($s);
                        $s = mb_strtolower($s, 'UTF-8');
                        $s = preg_replace('/\s+/u', ' ', $s);
                        return $s;
                    };

                    $hasEstadoItem = column_exists_sync($conn, 'cotizaciones_detalle', 'estado_item');
                    foreach ($items as $it) {
                        $newServicioId = isset($it['servicio_id']) && is_numeric($it['servicio_id']) ? (int)$it['servicio_id'] : 0;
                        $newDesc = $normalize($it['descripcion'] ?? '');
                        $newSub = isset($it['subtotal']) ? (float)$it['subtotal'] : null;
                        $newTipo = $servicio_tipo;

                        $exists = false;
                        foreach ($existingCot as $ex) {
                            $exTipo = strtolower(trim((string)($ex['servicio_tipo'] ?? '')));
                            if ($exTipo !== $newTipo) continue;

                            $exServicioId = isset($ex['servicio_id']) && is_numeric($ex['servicio_id']) ? (int)$ex['servicio_id'] : 0;
                            $exDesc = $normalize($ex['descripcion'] ?? '');
                            $exSub = isset($ex['subtotal']) ? (float)$ex['subtotal'] : null;

                            $sameServicio = ($newServicioId > 0 && $exServicioId > 0) ? ($newServicioId === $exServicioId) : true;
                            $descMatch = ($newDesc === '') ? true : (($exDesc === $newDesc) || (strpos($exDesc, $newDesc) !== false) || (strpos($newDesc, $exDesc) !== false));
                            $subMatch = ($newSub === null || $exSub === null) ? true : (abs($newSub - $exSub) < 0.01);

                            if ($sameServicio && $descMatch && $subMatch) {
                                $exists = true;
                                break;
                            }
                        }

                        if (!$exists) {
                            $servicio_id_ins = isset($it['servicio_id']) && is_numeric($it['servicio_id']) ? (int)$it['servicio_id'] : null;
                            $descripcion_ins = (string)($it['descripcion'] ?? ($servicio_tipo . ' agregado'));
                            $cantidad_ins = isset($it['cantidad']) ? (int)$it['cantidad'] : 1;
                            $precio_unitario_ins = isset($it['precio_unitario']) ? (float)$it['precio_unitario'] : 0;
                            $subtotal_ins = isset($it['subtotal']) ? (float)$it['subtotal'] : ($precio_unitario_ins * $cantidad_ins);

                            if ($hasEstadoItem) {
                                $stmt_ins_cot = $conn->prepare("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, estado_item, version_item, editado_por, editado_en, motivo_edicion) VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', 1, ?, NOW(), ?)");
                                $motivo = 'Ampliación desde consumo/cobro';
                                $stmt_ins_cot->bind_param('isisiddis', $cotizacion_id, $servicio_tipo, $servicio_id_ins, $descripcion_ins, $cantidad_ins, $precio_unitario_ins, $subtotal_ins, $usuario_id, $motivo);
                            } else {
                                $stmt_ins_cot = $conn->prepare("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
                                $stmt_ins_cot->bind_param('isisidd', $cotizacion_id, $servicio_tipo, $servicio_id_ins, $descripcion_ins, $cantidad_ins, $precio_unitario_ins, $subtotal_ins);
                            }

                            if ($stmt_ins_cot) {
                                $stmt_ins_cot->execute();
                                $existingCot[] = [
                                    'servicio_tipo' => $servicio_tipo,
                                    'servicio_id' => $servicio_id_ins,
                                    'descripcion' => $descripcion_ins,
                                    'cantidad' => $cantidad_ins,
                                    'precio_unitario' => $precio_unitario_ins,
                                    'subtotal' => $subtotal_ins
                                ];
                            }
                        }
                    }
                }
            }
        }
    }

    $conn->commit();
    echo json_encode([
        'success' => true,
        'message' => 'Cobro actualizado',
        'total_agregado' => $total_agregado,
        'nuevo_total' => $nuevo_total,
        'cotizacion_id' => ($cotizacion_id > 0 ? $cotizacion_id : null)
    ]);
} catch (\Exception $e) {
    $conn->rollback();
    echo json_encode(['success' => false, 'error' => 'Error al actualizar: ' . $e->getMessage()]);
}
