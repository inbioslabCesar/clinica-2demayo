<?php
// Módulo de Atención: lógica para registrar atención del paciente
class AtencionModule {
    public static function registrarAtencion($conn, $paciente_id, $usuario_id, $servicio_key, $cobro_id = null) {
        $servicios_validos = [
            'consulta', 'laboratorio', 'farmacia', 'rayosx', 'ecografia', 'procedimiento',
            'operacion', 'hospitalizacion', 'ocupacional', 'procedimientos',
            'cirugias', 'tratamientos', 'emergencias'
        ];
        if (in_array($servicio_key, $servicios_validos)) {
            $cobroIdParam = ($cobro_id !== null && (int)$cobro_id > 0) ? (int)$cobro_id : null;
            $stmt = $conn->prepare("INSERT INTO atenciones (paciente_id, usuario_id, servicio, estado, cobro_id) VALUES (?, ?, ?, 'pendiente', ?)");
            $stmt->bind_param("iisi", $paciente_id, $usuario_id, $servicio_key, $cobroIdParam);
            $stmt->execute();
            return true;
        } else {
            return false;
        }
    }

    /**
     * Anula (no elimina) las atenciones ligadas a un cobro específico.
     * Preferimos siempre `cobro_id`; solo recurrimos al criterio legacy
     * (paciente + fecha + servicio) para filas antiguas sin ese dato, y
     * únicamente cuando hay un único candidato inequívoco, para no anular
     * atenciones de otro cobro del mismo paciente el mismo día.
     *
     * @return int Cantidad de filas anuladas.
     */
    public static function anularAtencionesPorCobro($conn, $cobro_id, $paciente_id = null, $fecha = null, $servicio_key = null) {
        $cobro_id = (int)$cobro_id;
        $anuladas = 0;

        if ($cobro_id > 0) {
            $stmt = $conn->prepare("UPDATE atenciones SET estado = 'cancelada' WHERE cobro_id = ? AND estado <> 'cancelada'");
            $stmt->bind_param("i", $cobro_id);
            $stmt->execute();
            $anuladas += $stmt->affected_rows;
        }

        if ($anuladas === 0 && $paciente_id && $fecha && $servicio_key) {
            // Fallback legacy: solo si hay EXACTAMENTE un candidato pendiente ese día.
            $stmtSel = $conn->prepare(
                "SELECT id FROM atenciones WHERE paciente_id = ? AND DATE(fecha) = ? AND servicio = ? AND estado = 'pendiente' AND cobro_id IS NULL"
            );
            $stmtSel->bind_param("iss", $paciente_id, $fecha, $servicio_key);
            $stmtSel->execute();
            $candidatos = $stmtSel->get_result()->fetch_all(MYSQLI_ASSOC);
            if (count($candidatos) === 1) {
                $idUnico = (int)$candidatos[0]['id'];
                $stmtUpd = $conn->prepare("UPDATE atenciones SET estado = 'cancelada', cobro_id = ? WHERE id = ?");
                $stmtUpd->bind_param("ii", $cobro_id, $idUnico);
                $stmtUpd->execute();
                $anuladas += $stmtUpd->affected_rows;
            }
            // Si hay 0 o más de 1 candidato, no tocamos nada: es más seguro dejar
            // una atención sin anular que anular la de otro cobro por error.
        }

        return $anuladas;
    }
}
