<?php
// Módulo de Caja: lógica para obtener caja abierta y registrar ingresos
class CajaModule {
    // --- Obtener la caja abierta del usuario ---
    // Obtener la caja abierta del usuario, filtrando por fecha y turno
    public static function obtenerCajaAbierta($conn, $usuario_id, $fecha = null, $turno = null) {
        $query = "SELECT * FROM cajas WHERE estado = 'abierta' AND usuario_id = ?";
        $types = "i";
        $params = [$usuario_id];
        if ($fecha !== null) {
            $query .= " AND DATE(created_at) = ?";
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)";
        $stmt_ingreso = $conn->prepare($sql);
        $stmt_ingreso->bind_param(
            "isssdsisisisiiis",
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
            $params['fecha_liquidacion']
        );
        $result = $stmt_ingreso->execute();
            // ...eliminado log de depuración...
        return $result;
    }
}
