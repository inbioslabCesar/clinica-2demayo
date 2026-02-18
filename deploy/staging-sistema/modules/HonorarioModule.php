<?php
// Módulo de Honorarios: lógica para registrar movimiento de honorarios médicos
class HonorarioModule {
    public static function registrarMovimiento($conn, $detalleConsulta, $tarifa, $servicio_key, $metodo_pago, $cobro_id) {
            // LOG de depuración para paciente_id
            // ...eliminado log de depuración...
        // Determinar tipo de precio
        $tipo_precio = 'particular';
        if ($metodo_pago === 'seguro') {
            $tipo_precio = 'seguro';
        } elseif ($metodo_pago === 'convenio') {
            $tipo_precio = 'convenio';
        }
        $precio_key = 'precio_' . $tipo_precio;
        if (!isset($tarifa[$precio_key])) {
            return [
                'success' => false,
                'error' => 'Error: No se encontró el precio correspondiente en la tarifa (' . $precio_key . ')'
            ];
        }
        $tarifa_total = floatval($tarifa[$precio_key]);
        // Validar medico_id
        if (empty($detalleConsulta['medico_id'])) {
            return [
                'success' => false,
                'error' => "Error: El medico_id no puede ser nulo o vacío"
            ];
        }
        // Calcular honorarios
        $monto_medico = null;
        $monto_clinica = null;
        $porcentaje_aplicado_medico = null;
        $porcentaje_aplicado_clinica = null;
        if (!empty($tarifa['monto_medico'])) {
            $monto_medico = floatval($tarifa['monto_medico']);
            $porcentaje_aplicado_medico = 0;
        } elseif (!empty($tarifa['porcentaje_medico'])) {
            $monto_medico = round($tarifa_total * floatval($tarifa['porcentaje_medico']) / 100, 2);
            $porcentaje_aplicado_medico = floatval($tarifa['porcentaje_medico']);
        } else {
            $porcentaje_aplicado_medico = 0;
        }
        if (!empty($tarifa['monto_clinica'])) {
            $monto_clinica = floatval($tarifa['monto_clinica']);
            $porcentaje_aplicado_clinica = 0;
        } elseif (!empty($tarifa['porcentaje_clinica'])) {
            $monto_clinica = round($tarifa_total * floatval($tarifa['porcentaje_clinica']) / 100, 2);
            $porcentaje_aplicado_clinica = floatval($tarifa['porcentaje_clinica']);
        } else {
            $porcentaje_aplicado_clinica = 0;
        }
        $consulta_id = isset($detalleConsulta['consulta_id']) ? $detalleConsulta['consulta_id'] : null;
        $paciente_id = isset($detalleConsulta['paciente_id']) ? $detalleConsulta['paciente_id'] : null;
        $medico_id = isset($detalleConsulta['medico_id']) ? $detalleConsulta['medico_id'] : ($tarifa['medico_id'] ?? null);
        $stmt_honorario = $conn->prepare("INSERT INTO honorarios_medicos_movimientos (
            consulta_id, medico_id, paciente_id, tarifa_id, tipo_precio, fecha, hora, tipo_servicio, descripcion, tarifa_total,
            monto_clinica, monto_medico, porcentaje_aplicado_clinica, porcentaje_aplicado_medico, estado_pago_medico, metodo_pago_medico, created_at, cobro_id
        ) VALUES (?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, NOW(), ?)");
        $stmt_honorario->bind_param(
            "iiiisssdddddsi",
            $consulta_id,
            $medico_id,
            $paciente_id,
            $tarifa['id'],
            $tipo_precio,
            $servicio_key,
            $tarifa['descripcion'],
            $tarifa_total,
            $monto_clinica,
            $monto_medico,
            $porcentaje_aplicado_clinica,
            $porcentaje_aplicado_medico,
            $metodo_pago,
            $cobro_id
        );
        $stmt_honorario->execute();
        return $conn->insert_id;
    }
}
