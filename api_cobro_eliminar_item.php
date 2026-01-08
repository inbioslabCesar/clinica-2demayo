<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

$usuario = $_SESSION['usuario'] ?? null;
$rol = $usuario['rol'] ?? '';
if (!$usuario || !in_array($rol, ['administrador', 'recepcionista'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$cobro_id = isset($input['cobro_id']) ? intval($input['cobro_id']) : 0;
$servicio_tipo = $input['servicio_tipo'] ?? '';
$item = $input['item'] ?? null;
$motivo = isset($input['motivo']) ? trim((string)$input['motivo']) : '';
// Asegurar usuario_id disponible para logs
$usuario_id = intval($usuario['id'] ?? ($_SESSION['usuario']['id'] ?? 0));

function normalize_text($s) {
    $s = (string)$s;
    $s = trim($s);
    $s = mb_strtolower($s, 'UTF-8');
    $s = preg_replace('/\s+/u', ' ', $s);
    return $s;
}

if ($cobro_id <= 0 || empty($servicio_tipo) || !is_array($item)) {
    echo json_encode(['success' => false, 'error' => 'Parámetros inválidos']);
    exit;
}

try {
    // Bloquear eliminaciones si la caja está cerrada para el usuario en el día actual
    $usuario_id = intval($usuario['id'] ?? 0);
    $fecha_hoy = date('Y-m-d');
    $stmtCaja = $pdo->prepare("SELECT id, estado FROM cajas WHERE fecha = ? AND usuario_id = ? AND estado != 'cerrada' ORDER BY created_at DESC LIMIT 1");
    $stmtCaja->execute([$fecha_hoy, $usuario_id]);
    $caja = $stmtCaja->fetch(PDO::FETCH_ASSOC);
    if (!$caja) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'La caja está cerrada. No se permite eliminar consumos.', 'estado_caja' => 'cerrada']);
        exit;
    }

    // Auditoría: se asume que la tabla log_eliminaciones ya existe en el esquema.

    $pdo->beginTransaction();

    // Obtener datos de cobro y paciente para observaciones
    $stmtCobro = $pdo->prepare("SELECT c.id, c.total, c.paciente_id, p.nombre, p.apellido, p.dni, p.historia_clinica FROM cobros c LEFT JOIN pacientes p ON c.paciente_id = p.id WHERE c.id = ? LIMIT 1");
    $stmtCobro->execute([$cobro_id]);
    $cobro = $stmtCobro->fetch(PDO::FETCH_ASSOC);
    if (!$cobro) {
        throw new Exception('Cobro no encontrado');
    }

    $paciente_nombre = trim(($cobro['nombre'] ?? '') . ' ' . ($cobro['apellido'] ?? ''));
    $paciente_dni = $cobro['dni'] ?? '';
    $paciente_hc = $cobro['historia_clinica'] ?? '';

    // Obtener detalle del servicio (JSON de líneas)
    $stmtDet = $pdo->prepare("SELECT id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal FROM cobros_detalle WHERE cobro_id = ? AND servicio_tipo = ? LIMIT 1 FOR UPDATE");
    $stmtDet->execute([$cobro_id, $servicio_tipo]);
    $detalle = $stmtDet->fetch(PDO::FETCH_ASSOC);
    $detalles = null;
    if ($detalle) {
        $detalles = json_decode($detalle['descripcion'], true);
    }
    // Fallback: si no se encontró por servicio_tipo, buscar en todos los detalles del cobro al ítem coincidente
    if (!$detalle || !is_array($detalles)) {
        error_log("[DEBUG] api_cobro_eliminar_item.php: fallback search en todos los cobros_detalle para cobro_id={$cobro_id}");
        $stmtAll = $pdo->prepare("SELECT id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal FROM cobros_detalle WHERE cobro_id = ? FOR UPDATE");
        $stmtAll->execute([$cobro_id]);
        $rows = $stmtAll->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $arr = json_decode($row['descripcion'], true);
            if (!is_array($arr)) continue;
            foreach ($arr as $d) {
                $itemServicioId = isset($item['servicio_id']) && is_numeric($item['servicio_id']) ? intval($item['servicio_id']) : 0;
                $dServicioId = isset($d['servicio_id']) && is_numeric($d['servicio_id']) ? intval($d['servicio_id']) : 0;
                $okServicio = ($itemServicioId > 0) ? ($dServicioId === $itemServicioId) : true;
                $okCant = isset($item['cantidad']) ? (intval($d['cantidad'] ?? 0) === intval($item['cantidad'] ?? 0)) : true;

                $dDescNorm = normalize_text($d['descripcion'] ?? '');
                $itemDescNorm = normalize_text($item['descripcion'] ?? '');
                $okDesc = true;
                if ($itemDescNorm !== '') {
                    // Aceptar igualdad o contención para tolerar tildes/variantes
                    $okDesc = ($dDescNorm === $itemDescNorm) || (strpos($dDescNorm, $itemDescNorm) !== false) || (strpos($itemDescNorm, $dDescNorm) !== false);
                }
                $subD = isset($d['subtotal']) ? floatval($d['subtotal']) : null;
                $subI = isset($item['subtotal']) ? floatval($item['subtotal']) : null;
                $okSub = ($subD === null || $subI === null) ? true : (abs($subD - $subI) < 0.01);
                if ($okServicio && $okDesc && $okCant && $okSub) {
                    $detalle = $row;
                    $servicio_tipo = $row['servicio_tipo'];
                    $detalles = $arr;
                    error_log("[DEBUG] api_cobro_eliminar_item.php: matched detalle id={$row['id']} by fallback for cobro_id={$cobro_id}");
                    break 2;
                }
            }
        }
    }
    if (!$detalle || !is_array($detalles)) {
        error_log("[WARN] api_cobro_eliminar_item.php: no se encontró detalle para cobro_id={$cobro_id}, item=".json_encode($item));
        throw new Exception('Detalle del cobro no encontrado para el ítem/servicio indicado');
    }

    // Buscar el índice del ítem a eliminar con coincidencia fuerte
    $cantidad_eliminar = intval($item['cantidad_eliminar'] ?? 0);
    if ($cantidad_eliminar < 0) $cantidad_eliminar = 0;

    // Modo eliminación parcial SOLO para farmacia: permite reducir cantidades sin depender de coincidencia exacta
    if ($servicio_tipo === 'farmacia' && $cantidad_eliminar > 0) {
        $medId = intval($item['servicio_id'] ?? 0);
        if ($medId <= 0) {
            throw new Exception('servicio_id inválido para eliminación parcial');
        }
        $descWanted = (string)($item['descripcion'] ?? '');
        if ($descWanted === '') {
            throw new Exception('descripcion requerida para eliminación parcial');
        }
        $descWantedLc = mb_strtolower($descWanted, 'UTF-8');
        $esCajaWanted = strpos($descWantedLc, '(caja)') !== false;

        // Obtener medicamento para unidades_por_caja
        $stmtMed = $pdo->prepare('SELECT stock, unidades_por_caja, nombre FROM medicamentos WHERE id = ? LIMIT 1');
        $stmtMed->execute([$medId]);
        $med = $stmtMed->fetch(PDO::FETCH_ASSOC);
        if (!$med) {
            throw new Exception('Medicamento no encontrado para reposición');
        }
        $unidCaja = intval($med['unidades_por_caja'] ?? 1);
        $unidCaja = max(1, $unidCaja);

        $restante = $cantidad_eliminar;
        $montoEliminar = 0.0;
        $cantUnidadesTotal = 0;

        // Recorrer detalles y reducir en múltiples líneas si es necesario
        for ($idx = 0; $idx < count($detalles) && $restante > 0; $idx++) {
            $d = $detalles[$idx];
            if (intval($d['servicio_id'] ?? 0) !== $medId) continue;
            $dDesc = (string)($d['descripcion'] ?? '');
            if ($dDesc === '') continue;
            $dDescLc = mb_strtolower($dDesc, 'UTF-8');
            $esCajaLinea = strpos($dDescLc, '(caja)') !== false;
            if ($esCajaLinea !== $esCajaWanted) continue;
            // Para farmacia se asume precio_unitario es por unidad
            $precio_unitario = floatval($d['precio_unitario'] ?? 0);
            if ($precio_unitario <= 0) {
                // Fallback: intentar estimar desde subtotal/cantidad
                $cantLineaTmp = max(1, intval($d['cantidad'] ?? 1));
                $subTmp = floatval($d['subtotal'] ?? 0);
                $factorTmp = $esCajaLinea ? $unidCaja : 1;
                $precio_unitario = $factorTmp > 0 ? ($subTmp / ($cantLineaTmp * $factorTmp)) : 0;
            }
            $cantLinea = intval($d['cantidad'] ?? 0);
            if ($cantLinea <= 0) continue;

            $quitar = min($restante, $cantLinea);
            $factor = $esCajaLinea ? $unidCaja : 1;
            $montoEliminar += $precio_unitario * $factor * $quitar;
            $cantUnidadesTotal += $quitar * $factor;

            $cantLineaNueva = $cantLinea - $quitar;
            if ($cantLineaNueva <= 0) {
                array_splice($detalles, $idx, 1);
                $idx--; // ajustar índice tras splice
            } else {
                $detalles[$idx]['cantidad'] = $cantLineaNueva;
                $detalles[$idx]['subtotal'] = $precio_unitario * $factor * $cantLineaNueva;
                $detalles[$idx]['precio_unitario'] = $precio_unitario;
            }

            $restante -= $quitar;
        }

        if ($restante > 0) {
            throw new Exception('No hay cantidad suficiente para eliminar en el detalle');
        }

        // Reponer stock
        if ($cantUnidadesTotal > 0) {
            $stmtUpd = $pdo->prepare('UPDATE medicamentos SET stock = stock + ? WHERE id = ?');
            $stmtUpd->execute([$cantUnidadesTotal, $medId]);

            $tipoMov = $esCajaWanted ? 'devolucion_caja' : 'devolucion_unidad';
            $observaciones = 'Devolución por eliminación (parcial) - Cobro #' . $cobro_id . ' - Paciente: ' . $paciente_nombre . ' (DNI: ' . $paciente_dni . ', HC: ' . $paciente_hc . ')';
            $usuario_id = $_SESSION['usuario']['id'] ?? ($usuario['id'] ?? 0);
            $stmtMov = $pdo->prepare('INSERT INTO movimientos_medicamento (medicamento_id, tipo_movimiento, cantidad, observaciones, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW())');
            $stmtMov->execute([$medId, $tipoMov, $cantUnidadesTotal, $observaciones, $usuario_id]);
        }

        // Persistir cobros_detalle (actualizar o eliminar bloque)
        if (count($detalles) > 0) {
            $nuevoSubtotal = 0.0;
            $acumPrecio = 0.0;
            foreach ($detalles as $d2) {
                $nuevoSubtotal += floatval($d2['subtotal'] ?? 0);
                $acumPrecio += floatval($d2['precio_unitario'] ?? 0);
            }
            $n = max(1, count($detalles));
            $nuevoPrecioUnit = $acumPrecio / $n;
            $nuevaDescripcion = json_encode($detalles, JSON_UNESCAPED_UNICODE);
            $stmtUpdDet = $pdo->prepare('UPDATE cobros_detalle SET descripcion = ?, cantidad = ?, precio_unitario = ?, subtotal = ? WHERE id = ?');
            $stmtUpdDet->execute([$nuevaDescripcion, $n, $nuevoPrecioUnit, $nuevoSubtotal, $detalle['id']]);
        } else {
            $stmtDelDet = $pdo->prepare('DELETE FROM cobros_detalle WHERE id = ?');
            $stmtDelDet->execute([$detalle['id']]);
        }

        $nuevoTotal = max(0, floatval($cobro['total']) - $montoEliminar);
        $stmtUpdCobro = $pdo->prepare('UPDATE cobros SET total = ? WHERE id = ?');
        $stmtUpdCobro->execute([$nuevoTotal, $cobro_id]);

        // Ingresos diarios: intentar ajustar monto en vez de borrar si existe un registro candidato
        $tipoIngresoMap = [
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
        $tipoIngreso = $tipoIngresoMap[$servicio_tipo] ?? $servicio_tipo;
        $stmtIngSel = $pdo->prepare("SELECT id, descripcion, monto FROM ingresos_diarios WHERE referencia_id = ? AND referencia_tabla = 'cobros' AND tipo_ingreso = ? ORDER BY id DESC");
        $stmtIngSel->execute([$cobro_id, $tipoIngreso]);
        $ingresos = $stmtIngSel->fetchAll(PDO::FETCH_ASSOC);
        $candidatoId = null;
        foreach ($ingresos as $ing) {
            $descOk = stripos((string)$ing['descripcion'], (string)$descWanted) !== false;
            if ($descOk) { $candidatoId = intval($ing['id']); break; }
        }
        if ($candidatoId === null && count($ingresos) > 0) $candidatoId = intval($ingresos[0]['id']);
        $ingresoEliminado = false;
        if ($candidatoId !== null && $montoEliminar > 0) {
            foreach ($ingresos as $ing) {
                if (intval($ing['id']) !== $candidatoId) continue;
                $montoActual = floatval($ing['monto'] ?? 0);
                $montoNuevo = $montoActual - $montoEliminar;
                if ($montoNuevo > 0.01) {
                    $stmtIngUpd = $pdo->prepare('UPDATE ingresos_diarios SET monto = ? WHERE id = ?');
                    $stmtIngUpd->execute([$montoNuevo, $candidatoId]);
                } else {
                    $stmtIngDel = $pdo->prepare('DELETE FROM ingresos_diarios WHERE id = ?');
                    $stmtIngDel->execute([$candidatoId]);
                    $ingresoEliminado = true;
                }
                break;
            }
        }

        // Auditoría
        $stmtLog = $pdo->prepare('INSERT INTO log_eliminaciones (cobro_id, cobros_detalle_id, servicio_tipo, item_json, monto, usuario_id, paciente_id, caja_id, motivo, fecha_hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
        $stmtLog->execute([
            $cobro_id,
            intval($detalle['id'] ?? 0) ?: null,
            $servicio_tipo,
            json_encode(['servicio_id' => $medId, 'descripcion' => $descWanted, 'cantidad_eliminar' => $cantidad_eliminar], JSON_UNESCAPED_UNICODE),
            $montoEliminar,
            $usuario_id,
            intval($cobro['paciente_id'] ?? 0) ?: null,
            intval($caja['id'] ?? 0) ?: null,
            $motivo
        ]);

        $pdo->commit();
        echo json_encode([
            'success' => true,
            'cobro_id' => $cobro_id,
            'servicio_tipo' => $servicio_tipo,
            'monto_eliminado' => $montoEliminar,
            'nuevo_total' => $nuevoTotal,
            'honorario_eliminado' => false,
            'ingreso_eliminado' => $ingresoEliminado
        ]);
        exit;
    }

    // Modo eliminación exacta (comportamiento original)
    $matchIndex = -1;
    foreach ($detalles as $idx => $d) {
        $itemServicioId = isset($item['servicio_id']) && is_numeric($item['servicio_id']) ? intval($item['servicio_id']) : 0;
        $dServicioId = isset($d['servicio_id']) && is_numeric($d['servicio_id']) ? intval($d['servicio_id']) : 0;
        $okServicio = ($itemServicioId > 0) ? ($dServicioId === $itemServicioId) : true;

        $okCant = isset($item['cantidad']) ? (intval($d['cantidad'] ?? 0) === intval($item['cantidad'] ?? 0)) : true;

        $dDescNorm = normalize_text($d['descripcion'] ?? '');
        $itemDescNorm = normalize_text($item['descripcion'] ?? '');
        $okDesc = true;
        if ($itemDescNorm !== '') {
            $okDesc = ($dDescNorm === $itemDescNorm) || (strpos($dDescNorm, $itemDescNorm) !== false) || (strpos($itemDescNorm, $dDescNorm) !== false);
        }
        // Comparación tolerante de subtotal
        $subD = isset($d['subtotal']) ? floatval($d['subtotal']) : null;
        $subI = isset($item['subtotal']) ? floatval($item['subtotal']) : null;
        $okSub = ($subD === null || $subI === null) ? true : (abs($subD - $subI) < 0.01);
        if ($okServicio && $okDesc && $okCant && $okSub) {
            $matchIndex = $idx;
            break;
        }
    }

    // Si el match falló y el request incluye 'cantidad', reintentar ignorando cantidad
    // (para tolerar discrepancias cuando el JSON en BD no coincide exactamente con lo enviado).
    if ($matchIndex === -1 && isset($item['cantidad'])) {
        error_log("[DEBUG] api_cobro_eliminar_item.php: reintentando match ignorando cantidad para cobro_id={$cobro_id}");
        foreach ($detalles as $idx => $d) {
            $itemServicioId = isset($item['servicio_id']) && is_numeric($item['servicio_id']) ? intval($item['servicio_id']) : 0;
            $dServicioId = isset($d['servicio_id']) && is_numeric($d['servicio_id']) ? intval($d['servicio_id']) : 0;
            $okServicio = ($itemServicioId > 0) ? ($dServicioId === $itemServicioId) : true;

            $dDescNorm = normalize_text($d['descripcion'] ?? '');
            $itemDescNorm = normalize_text($item['descripcion'] ?? '');
            $okDesc = true;
            if ($itemDescNorm !== '') {
                $okDesc = ($dDescNorm === $itemDescNorm) || (strpos($dDescNorm, $itemDescNorm) !== false) || (strpos($itemDescNorm, $dDescNorm) !== false);
            }

            $subD = isset($d['subtotal']) ? floatval($d['subtotal']) : null;
            $subI = isset($item['subtotal']) ? floatval($item['subtotal']) : null;
            $okSub = ($subD === null || $subI === null) ? true : (abs($subD - $subI) < 0.01);

            if ($okServicio && $okDesc && $okSub) {
                $matchIndex = $idx;
                error_log("[DEBUG] api_cobro_eliminar_item.php: match found ignorando cantidad en index={$idx} for cobro_id={$cobro_id}");
                break;
            }
        }
    }

    // Si no se encontró con match estricto/tolerante por descripción/subtotal, intentar match relajado por servicio_id (y cantidad si existe)
    if ($matchIndex === -1) {
        error_log("[DEBUG] api_cobro_eliminar_item.php: intentando match relajado por servicio_id para cobro_id={$cobro_id}");
        $itemServicioId = isset($item['servicio_id']) && is_numeric($item['servicio_id']) ? intval($item['servicio_id']) : 0;
        $itemCantidad = isset($item['cantidad']) ? intval($item['cantidad']) : null;
        if ($itemServicioId > 0) {
            foreach ($detalles as $idx => $d) {
                $dServicioId = isset($d['servicio_id']) && is_numeric($d['servicio_id']) ? intval($d['servicio_id']) : 0;
                if ($dServicioId !== $itemServicioId) continue;
                if ($itemCantidad !== null && intval($d['cantidad'] ?? 0) !== $itemCantidad) continue;
                $matchIndex = $idx;
                break;
            }

            // Si aún no hay match y había cantidad, reintentar sin cantidad
            if ($matchIndex === -1 && $itemCantidad !== null) {
                error_log("[DEBUG] api_cobro_eliminar_item.php: reintentando servicio_id sin cantidad para cobro_id={$cobro_id}, servicio_id={$itemServicioId}");
                foreach ($detalles as $idx => $d) {
                    $dServicioId = isset($d['servicio_id']) && is_numeric($d['servicio_id']) ? intval($d['servicio_id']) : 0;
                    if ($dServicioId !== $itemServicioId) continue;
                    $matchIndex = $idx;
                    error_log("[DEBUG] api_cobro_eliminar_item.php: matched by servicio_id at index={$idx} for cobro_id={$cobro_id}");
                    break;
                }
            }
        }
    }

    if ($matchIndex === -1) {
        error_log("[WARN] api_cobro_eliminar_item.php: No se encontró el ítem a eliminar en el detalle para cobro_id={$cobro_id}. item=".json_encode($item)." detalles=".json_encode($detalles));
        throw new Exception('No se encontró el ítem a eliminar en el detalle');
    }

    $itemEliminar = $detalles[$matchIndex];
    $montoEliminar = floatval($itemEliminar['subtotal'] ?? 0);

    // Tabla de auditoría ya garantizada antes de la transacción

    // Reposición de stock solo para farmacia
    if ($servicio_tipo === 'farmacia') {
        $medId = intval($itemEliminar['servicio_id'] ?? 0);
        if ($medId > 0) {
            // Leer unidades_por_caja
            $stmtMed = $pdo->prepare('SELECT stock, unidades_por_caja, nombre FROM medicamentos WHERE id = ? LIMIT 1');
            $stmtMed->execute([$medId]);
            $med = $stmtMed->fetch(PDO::FETCH_ASSOC);
            if (!$med) {
                throw new Exception('Medicamento no encontrado para reposición');
            }
            $unidCaja = intval($med['unidades_por_caja'] ?? 1);
            $esCaja = strpos((string)($itemEliminar['descripcion'] ?? ''), '(Caja)') !== false;
            $cantUnidades = intval($itemEliminar['cantidad'] ?? 0) * ($esCaja ? max(1, $unidCaja) : 1);

            // Actualizar stock
            $stmtUpd = $pdo->prepare('UPDATE medicamentos SET stock = stock + ? WHERE id = ?');
            $stmtUpd->execute([$cantUnidades, $medId]);

            // Registrar movimiento de devolución
            $tipoMov = $esCaja ? 'devolucion_caja' : 'devolucion_unidad';
            $observaciones = 'Devolución por eliminación de ítem - Cobro #' . $cobro_id . ' - Paciente: ' . $paciente_nombre . ' (DNI: ' . $paciente_dni . ', HC: ' . $paciente_hc . ')';
            $usuario_id = $_SESSION['usuario']['id'] ?? ($usuario['id'] ?? 0);
            $stmtMov = $pdo->prepare('INSERT INTO movimientos_medicamento (medicamento_id, tipo_movimiento, cantidad, observaciones, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW())');
            $stmtMov->execute([$medId, $tipoMov, $cantUnidades, $observaciones, $usuario_id]);
        }
    }

    // Quitar elemento del array
    array_splice($detalles, $matchIndex, 1);

    if (count($detalles) > 0) {
        $nuevoSubtotal = 0.0;
        $acumPrecio = 0.0;
        foreach ($detalles as $d) {
            $nuevoSubtotal += floatval($d['subtotal'] ?? 0);
            $acumPrecio += floatval($d['precio_unitario'] ?? 0);
        }
        $n = max(1, count($detalles));
        $nuevoPrecioUnit = $acumPrecio / $n;
        $nuevaDescripcion = json_encode($detalles, JSON_UNESCAPED_UNICODE);
        $stmtUpdDet = $pdo->prepare('UPDATE cobros_detalle SET descripcion = ?, cantidad = ?, precio_unitario = ?, subtotal = ? WHERE id = ?');
        $stmtUpdDet->execute([$nuevaDescripcion, $n, $nuevoPrecioUnit, $nuevoSubtotal, $detalle['id']]);
    } else {
        // Sin líneas: eliminar detalle
        $stmtDelDet = $pdo->prepare('DELETE FROM cobros_detalle WHERE id = ?');
        $stmtDelDet->execute([$detalle['id']]);
    }

    // Actualizar total del cobro (no dejar negativo)
    $nuevoTotal = max(0, floatval($cobro['total']) - $montoEliminar);
    $stmtUpdCobro = $pdo->prepare('UPDATE cobros SET total = ? WHERE id = ?');
    $stmtUpdCobro->execute([$nuevoTotal, $cobro_id]);

    // Eliminar movimientos financieros asociados para servicios no farmacia
    $honorarioEliminado = false;
    $ingresoEliminado = false;
    if ($servicio_tipo !== 'farmacia') {
        // Intentar localizar el movimiento de honorario relacionado
        $where = 'cobro_id = ? AND tipo_servicio = ?';
        $params = [$cobro_id, $servicio_tipo];
        if (!empty($item['servicio_id']) && is_numeric($item['servicio_id'])) {
            $where .= ' AND tarifa_id = ?';
            $params[] = intval($item['servicio_id']);
        } elseif (!empty($item['descripcion'])) {
            $where .= ' AND descripcion = ?';
            $params[] = (string)$item['descripcion'];
        } elseif (!empty($itemEliminar['descripcion'])) {
            $where .= ' AND descripcion = ?';
            $params[] = (string)$itemEliminar['descripcion'];
        }
        $sqlHM = 'SELECT id FROM honorarios_medicos_movimientos WHERE ' . $where . ' ORDER BY id DESC LIMIT 1';
        $stmtHM = $pdo->prepare($sqlHM);
        $stmtHM->execute($params);
        $hm = $stmtHM->fetch(PDO::FETCH_ASSOC);
        if ($hm && !empty($hm['id'])) {
            // Eliminar ingresos diarios vinculados
            $stmtIng = $pdo->prepare('DELETE FROM ingresos_diarios WHERE honorario_movimiento_id = ?');
            $stmtIng->execute([$hm['id']]);
            $ingresoEliminado = true;
            // Eliminar honorario
            $stmtDelHM = $pdo->prepare('DELETE FROM honorarios_medicos_movimientos WHERE id = ?');
            $stmtDelHM->execute([$hm['id']]);
            $honorarioEliminado = true;
        }

        // Si es laboratorio derivado, eliminar movimiento de referencia
        if ($servicio_tipo === 'laboratorio' && !empty($item['derivado']) && !empty($item['servicio_id'])) {
            $stmtLabRef = $pdo->prepare('DELETE FROM laboratorio_referencia_movimientos WHERE cobro_id = ? AND examen_id = ?');
            $stmtLabRef->execute([$cobro_id, intval($item['servicio_id'])]);
        }
    }

    // Eliminar ingreso diario por referencia del cobro y tipo de servicio (aplica para TODOS los servicios)
    $tipoIngresoMap = [
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
    $tipoIngreso = $tipoIngresoMap[$servicio_tipo] ?? $servicio_tipo;
    // Buscar candidatos en ingresos_diarios por referencia_id (cobro), referencia_tabla='cobros' y tipo_ingreso
    $stmtIngSel = $pdo->prepare("SELECT id, descripcion, monto FROM ingresos_diarios WHERE referencia_id = ? AND referencia_tabla = 'cobros' AND tipo_ingreso = ? ORDER BY id DESC");
    $stmtIngSel->execute([$cobro_id, $tipoIngreso]);
    $ingresos = $stmtIngSel->fetchAll(PDO::FETCH_ASSOC);
    $candidatoId = null;
    foreach ($ingresos as $ing) {
        $descOk = false;
        if (!empty($item['descripcion'])) {
            $descOk = trim((string)$ing['descripcion']) === trim((string)$item['descripcion']);
            // También considerar prefijo "Cobro automático - "
            if (!$descOk && stripos((string)$ing['descripcion'], (string)$item['descripcion']) !== false) {
                $descOk = true;
            }
        }
        $montoOk = false;
        if (isset($item['subtotal'])) {
            $montoOk = abs(floatval($ing['monto']) - floatval($item['subtotal'])) < 0.01;
        }
        if ($descOk || $montoOk) {
            $candidatoId = intval($ing['id']);
            break;
        }
    }
    // Si no hay coincidencia fuerte, como fallback eliminar el último ingreso del tipo para ese cobro
    if ($candidatoId === null && count($ingresos) > 0) {
        $candidatoId = intval($ingresos[0]['id']);
    }
    if ($candidatoId !== null) {
        $stmtIngDel = $pdo->prepare('DELETE FROM ingresos_diarios WHERE id = ?');
        $stmtIngDel->execute([$candidatoId]);
        $ingresoEliminado = true;
    }

    // Registrar auditoría de eliminación
    $stmtLog = $pdo->prepare('INSERT INTO log_eliminaciones (cobro_id, cobros_detalle_id, servicio_tipo, item_json, monto, usuario_id, paciente_id, caja_id, motivo, fecha_hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
    $stmtLog->execute([
        $cobro_id,
        intval($detalle['id'] ?? 0) ?: null,
        $servicio_tipo,
        json_encode($itemEliminar, JSON_UNESCAPED_UNICODE),
        $montoEliminar,
        $usuario_id,
        intval($cobro['paciente_id'] ?? 0) ?: null,
        intval($caja['id'] ?? 0) ?: null,
        $motivo
    ]);

    $pdo->commit();
    echo json_encode([
        'success' => true,
        'cobro_id' => $cobro_id,
        'servicio_tipo' => $servicio_tipo,
        'monto_eliminado' => $montoEliminar,
        'nuevo_total' => $nuevoTotal,
        'honorario_eliminado' => $honorarioEliminado,
        'ingreso_eliminado' => $ingresoEliminado
    ]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
