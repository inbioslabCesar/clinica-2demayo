<?php
// Módulo de Caja: lógica para obtener caja abierta y registrar ingresos
class CajaModule {
    private static function columnExists($conn, $tableName, $columnName) {
        static $cache = [];
        $key = strtolower(trim((string)$tableName)) . '.' . strtolower(trim((string)$columnName));
        if (isset($cache[$key])) {
            return $cache[$key];
        }

        $sql = "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1";
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            $cache[$key] = false;
            return false;
        }
        $stmt->bind_param('ss', $tableName, $columnName);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res && $res->num_rows > 0;
        $stmt->close();

        $cache[$key] = $exists;
        return $exists;
    }

    private static function resolverColumnaTotalPorMetodo($conn, $metodoPago) {
        $metodo = strtolower(trim((string)$metodoPago));
        if ($metodo === 'efectivo') {
            return 'total_efectivo';
        }
        if ($metodo === 'tarjeta') {
            return 'total_tarjetas';
        }
        if (in_array($metodo, ['transferencia', 'yape', 'plin'], true)) {
            return 'total_transferencias';
        }
        return 'total_otros';
    }

    private static function actualizarTotalesCaja($conn, $cajaId, $monto, $metodoPago) {
        $cajaId = (int)$cajaId;
        $monto = (float)$monto;
        if ($cajaId <= 0 || $monto <= 0) {
            return true;
        }

        $columna = self::resolverColumnaTotalPorMetodo($conn, $metodoPago);
        if (!self::columnExists($conn, 'cajas', $columna)) {
            return true;
        }

        $sql = "UPDATE cajas SET {$columna} = COALESCE({$columna}, 0) + ? WHERE id = ? LIMIT 1";
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('di', $monto, $cajaId);
        $ok = $stmt->execute();
        $stmt->close();
        return $ok;
    }

    // --- Obtener la caja abierta del usuario ---
    // Obtener la caja abierta del usuario, filtrando por fecha y turno
    public static function obtenerCajaAbierta($conn, $usuario_id, $fecha = null, $turno = null) {
        $query = "SELECT * FROM cajas WHERE estado = 'abierta' AND usuario_id = ?";
        $types = "i";
        $params = [$usuario_id];
        if ($fecha !== null) {
            // Usar la columna 'fecha' explícita para evitar desalineaciones por zona horaria
            $query .= " AND fecha = ?";
            $types .= "s";
            $params[] = $fecha;
        }
        if ($turno !== null) {
            $query .= " AND turno = ?";
            $types .= "s";
            $params[] = $turno;
        }
        $query .= " ORDER BY created_at DESC LIMIT 1";
        $stmt_caja = $conn->prepare($query);
        $stmt_caja->bind_param($types, ...$params);
        $stmt_caja->execute();
        $caja_result = $stmt_caja->get_result();
        if ($caja_result->num_rows > 0) {
            return $caja_result->fetch_assoc();
        }
        return null;
    }

    // --- Registrar un ingreso en ingresos_diarios ---
    public static function registrarIngreso($conn, $params) {
        // Logging para depuración de ingresos diarios
            // ...eliminado log de depuración...
        $sql = "INSERT INTO ingresos_diarios (
            caja_id, tipo_ingreso, area, descripcion, monto, metodo_pago, referencia_id, referencia_tabla, paciente_id, paciente_nombre, usuario_id, turno, honorario_movimiento_id, cobrado_por, liquidado_por, fecha_liquidacion, fecha_hora
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))";
        $stmt_ingreso = $conn->prepare($sql);
        $fechaHoraParam = $params['fecha_hora_param'] ?? null;
        $stmt_ingreso->bind_param(
            "isssdsisisisiiiss",
            $params['caja_id'],
            $params['tipo_ingreso'],
            $params['area_servicio'],
            $params['descripcion_ingreso'],
            $params['total_param'],
            $params['metodo_pago'],
            $params['cobro_id'],
            $params['referencia_tabla_param'],
            $params['paciente_id_param'],
            $params['nombre_paciente'],
            $params['usuario_id_param'],
            $params['turno_param'],
            $params['honorario_movimiento_id'],
            $params['cobrado_por'],
            $params['liquidado_por'],
            $params['fecha_liquidacion'],
            $fechaHoraParam
        );
        $result = $stmt_ingreso->execute();
        if ($result) {
            $okTotales = self::actualizarTotalesCaja(
                $conn,
                (int)($params['caja_id'] ?? 0),
                (float)($params['total_param'] ?? 0),
                (string)($params['metodo_pago'] ?? 'otros')
            );
            if (!$okTotales) {
                return false;
            }
        }
            // ...eliminado log de depuración...
        return $result;
    }
}
