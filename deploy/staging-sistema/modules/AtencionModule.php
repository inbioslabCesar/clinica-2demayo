<?php
// Módulo de Atención: lógica para registrar atención del paciente
class AtencionModule {
    public static function registrarAtencion($conn, $paciente_id, $usuario_id, $servicio_key) {
        $servicios_validos = [
            'consulta', 'laboratorio', 'farmacia', 'rayosx', 'ecografia', 'procedimiento',
            'operacion', 'hospitalizacion', 'ocupacional', 'procedimientos',
            'cirugias', 'tratamientos', 'emergencias'
        ];
        if (in_array($servicio_key, $servicios_validos)) {
            $stmt = $conn->prepare("INSERT INTO atenciones (paciente_id, usuario_id, servicio, estado) VALUES (?, ?, ?, 'pendiente')");
            $stmt->bind_param("iis", $paciente_id, $usuario_id, $servicio_key);
            $stmt->execute();
            return true;
        } else {
            return false;
        }
    }
}
