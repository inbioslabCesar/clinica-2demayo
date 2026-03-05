<?php

class InventarioLaboratorioModule
{
    public static function tablasDisponibles($conn): bool
    {
        $required = [
            'inventario_examen_recetas',
            'inventario_consumos_examen',
            'inventario_transferencias',
            'inventario_transferencias_detalle',
        ];

        $placeholders = implode(',', array_fill(0, count($required), '?'));
        $sql = "SELECT COUNT(*) AS total
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME IN ($placeholders)";

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return false;
        }

        $types = str_repeat('s', count($required));
        $stmt->bind_param($types, ...$required);
        $stmt->execute();
        $result = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        return intval($result['total'] ?? 0) === count($required);
    }

    public static function aplicarConsumoPorResultado($conn, int $ordenId, ?int $usuarioId = null): array
    {
        $resumen = [
            'aplicados' => 0,
            'pendientes' => 0,
            'detalles' => [],
            'saltado' => false,
        ];

        if ($ordenId <= 0) {
            $resumen['saltado'] = true;
            $resumen['detalles'][] = 'Orden inválida para aplicar consumo.';
            return $resumen;
        }

        if (!self::tablasDisponibles($conn)) {
            $resumen['saltado'] = true;
            $resumen['detalles'][] = 'Tablas de inventario interno no disponibles.';
            return $resumen;
        }

        $stmtOrden = $conn->prepare("SELECT id, cobro_id, consulta_id, paciente_id, examenes FROM ordenes_laboratorio WHERE id = ? LIMIT 1");
        $stmtOrden->bind_param('i', $ordenId);
        $stmtOrden->execute();
        $orden = $stmtOrden->get_result()->fetch_assoc();
        $stmtOrden->close();

        if (!$orden) {
            $resumen['saltado'] = true;
            $resumen['detalles'][] = 'No se encontró la orden para aplicar consumo.';
            return $resumen;
        }

        $examenesIds = json_decode((string)($orden['examenes'] ?? '[]'), true);
        if (!is_array($examenesIds) || empty($examenesIds)) {
            $resumen['saltado'] = true;
            return $resumen;
        }

        $factores = self::obtenerFactoresPorExamen($conn, intval($orden['cobro_id'] ?? 0), $examenesIds);

        $stmtRecetas = $conn->prepare("SELECT item_id, cantidad_por_prueba FROM inventario_examen_recetas WHERE id_examen = ? AND activo = 1");
        $stmtYaConsumido = $conn->prepare("SELECT COUNT(*) AS total FROM inventario_consumos_examen WHERE orden_id = ? AND id_examen = ? AND item_id = ? AND origen_evento = 'resultado'");
        $stmtTransferido = $conn->prepare("SELECT IFNULL(SUM(td.cantidad),0) AS total_transferido
            FROM inventario_transferencias_detalle td
            JOIN inventario_transferencias t ON t.id = td.transferencia_id
            WHERE td.item_id = ? AND t.destino = 'laboratorio'");
        $stmtConsumido = $conn->prepare("SELECT IFNULL(SUM(cantidad_consumida),0) AS total_consumido
            FROM inventario_consumos_examen
            WHERE item_id = ? AND estado = 'aplicado'");
        $stmtItem = $conn->prepare("SELECT codigo, nombre, unidad_medida FROM inventario_items WHERE id = ? LIMIT 1");
        $stmtInsert = $conn->prepare("INSERT INTO inventario_consumos_examen
            (orden_id, cobro_id, consulta_id, paciente_id, id_examen, item_id, cantidad_consumida, origen_evento, estado, usuario_id, observacion, fecha_hora)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'resultado', 'aplicado', ?, ?, NOW())");

        foreach ($examenesIds as $examenIdRaw) {
            $examenId = intval($examenIdRaw);
            if ($examenId <= 0) {
                continue;
            }

            $factorCantidad = (float)($factores[$examenId] ?? 1);
            if ($factorCantidad <= 0) {
                $factorCantidad = 1;
            }

            $stmtRecetas->bind_param('i', $examenId);
            $stmtRecetas->execute();
            $recetas = $stmtRecetas->get_result()->fetch_all(MYSQLI_ASSOC);
            if (empty($recetas)) {
                continue;
            }

            foreach ($recetas as $receta) {
                $itemId = intval($receta['item_id'] ?? 0);
                $cantidadBase = (float)($receta['cantidad_por_prueba'] ?? 0);
                if ($itemId <= 0 || $cantidadBase <= 0) {
                    continue;
                }

                $cantidadNecesaria = round($cantidadBase * $factorCantidad, 4);
                if ($cantidadNecesaria <= 0) {
                    continue;
                }

                $stmtYaConsumido->bind_param('iii', $ordenId, $examenId, $itemId);
                $stmtYaConsumido->execute();
                $yaConsumido = intval($stmtYaConsumido->get_result()->fetch_assoc()['total'] ?? 0) > 0;
                if ($yaConsumido) {
                    continue;
                }

                $stmtTransferido->bind_param('i', $itemId);
                $stmtTransferido->execute();
                $transferido = (float)($stmtTransferido->get_result()->fetch_assoc()['total_transferido'] ?? 0);

                $stmtConsumido->bind_param('i', $itemId);
                $stmtConsumido->execute();
                $consumido = (float)($stmtConsumido->get_result()->fetch_assoc()['total_consumido'] ?? 0);

                $saldoInterno = round($transferido - $consumido, 4);
                if ($saldoInterno + 0.0001 < $cantidadNecesaria) {
                    $stmtItem->bind_param('i', $itemId);
                    $stmtItem->execute();
                    $item = $stmtItem->get_result()->fetch_assoc();

                    $nombreItem = trim(((string)($item['codigo'] ?? '')) . ' ' . ((string)($item['nombre'] ?? '')));
                    $unidad = (string)($item['unidad_medida'] ?? 'unid');
                    $resumen['pendientes']++;
                    $resumen['detalles'][] = 'Stock interno insuficiente para ' . $nombreItem . ' (' . number_format($cantidadNecesaria, 4) . ' ' . $unidad . ' requeridos, ' . number_format($saldoInterno, 4) . ' disponibles).';
                    continue;
                }

                $cobroId = isset($orden['cobro_id']) ? intval($orden['cobro_id']) : null;
                $consultaId = isset($orden['consulta_id']) ? intval($orden['consulta_id']) : null;
                $pacienteId = isset($orden['paciente_id']) ? intval($orden['paciente_id']) : null;
                $obs = 'Consumo automático por resultado. Orden ID: ' . $ordenId . ', Examen ID: ' . $examenId;
                $usuario = $usuarioId && $usuarioId > 0 ? $usuarioId : null;

                $stmtInsert->bind_param(
                    'iiiiiidis',
                    $ordenId,
                    $cobroId,
                    $consultaId,
                    $pacienteId,
                    $examenId,
                    $itemId,
                    $cantidadNecesaria,
                    $usuario,
                    $obs
                );
                $stmtInsert->execute();
                $resumen['aplicados']++;
            }
        }

        $stmtRecetas->close();
        $stmtYaConsumido->close();
        $stmtTransferido->close();
        $stmtConsumido->close();
        $stmtItem->close();
        $stmtInsert->close();

        return $resumen;
    }

    private static function obtenerFactoresPorExamen($conn, int $cobroId, array $examenesIds): array
    {
        $factores = [];
        foreach ($examenesIds as $examId) {
            $examId = intval($examId);
            if ($examId > 0) {
                $factores[$examId] = 1.0;
            }
        }

        if ($cobroId <= 0) {
            return $factores;
        }

        $stmtDetalle = $conn->prepare("SELECT descripcion FROM cobros_detalle WHERE cobro_id = ? AND servicio_tipo = 'laboratorio' LIMIT 1");
        $stmtDetalle->bind_param('i', $cobroId);
        $stmtDetalle->execute();
        $row = $stmtDetalle->get_result()->fetch_assoc();
        $stmtDetalle->close();

        if (!$row || empty($row['descripcion'])) {
            return $factores;
        }

        $detalles = json_decode((string)$row['descripcion'], true);
        if (!is_array($detalles)) {
            return $factores;
        }

        foreach ($detalles as $detalle) {
            if (!is_array($detalle)) {
                continue;
            }
            $servicioId = intval($detalle['servicio_id'] ?? 0);
            if ($servicioId <= 0) {
                continue;
            }
            $cantidad = (float)($detalle['cantidad'] ?? 1);
            if ($cantidad <= 0) {
                $cantidad = 1;
            }
            if (!isset($factores[$servicioId])) {
                continue;
            }
            $factores[$servicioId] = $cantidad;
        }

        return $factores;
    }
}
