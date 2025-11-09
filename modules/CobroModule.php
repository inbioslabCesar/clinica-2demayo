<?php
// Módulo de Cobros: lógica principal para registrar cobros y detalles
class CobroModule {
    // --- Registrar cobro principal y detalles ---
    public static function registrarCobro($conn, $data) {
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
        $servicio_id = $data['detalles'][0]['servicio_id'];
        $descripcion_json = json_encode($data['detalles']);
        $cantidad = count($data['detalles']);
        $precio_unitario = array_sum(array_map(function($d){return $d['precio_unitario'];}, $data['detalles'])) / max(1, $cantidad);
        $subtotal = array_sum(array_map(function($d){return $d['subtotal'];}, $data['detalles']));
        $stmt_detalle = $conn->prepare("INSERT INTO cobros_detalle (cobro_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt_detalle->bind_param("isisssd", $cobro_id, $servicio_tipo, $servicio_id, $descripcion_json, $cantidad, $precio_unitario, $subtotal);
        $stmt_detalle->execute();
        return $cobro_id;
    }
}
