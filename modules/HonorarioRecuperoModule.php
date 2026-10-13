<?php

// Honorarios ya liquidados al médico cuyo cobro luego se devuelve o anula.
// Se registra un "recupero" por el monto del médico y la siguiente liquidación
// de ese mismo médico lo descuenta (compensación), sin mover efectivo.
class HonorarioRecuperoModule
{
    public static function asegurarEsquema(mysqli $conn): void
    {
        static $listo = false;
        if ($listo) {
            return;
        }
        // CREATE TABLE hace commit implicito en MySQL: solo se ejecuta si la tabla falta.
        // Los endpoints deben invocar este metodo ANTES de abrir su transaccion.
        $existe = $conn->query("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'honorarios_recuperos' LIMIT 1");
        if ($existe && $existe->num_rows > 0) {
            $listo = true;
            return;
        }
        $conn->query("CREATE TABLE IF NOT EXISTS honorarios_recuperos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            honorario_movimiento_id INT NOT NULL,
            medico_id INT NOT NULL,
            cotizacion_id INT NULL,
            cotizacion_detalle_id INT NULL,
            origen_ref VARCHAR(80) NOT NULL,
            monto DECIMAL(10,2) NOT NULL,
            monto_compensado DECIMAL(10,2) NOT NULL DEFAULT 0,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
            motivo VARCHAR(255) NULL,
            creado_por INT NULL,
            creado_en TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            resuelto_en DATETIME NULL,
            compensado_en_honorarios VARCHAR(255) NULL,
            UNIQUE KEY uq_hr_honorario_origen (honorario_movimiento_id, origen_ref),
            KEY idx_hr_medico_estado (medico_id, estado),
            KEY idx_hr_cotizacion (cotizacion_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $listo = true;
    }

    // Registra un recupero si el honorario ya fue liquidado. Devuelve el monto registrado.
    public static function registrarSiLiquidado(
        mysqli $conn,
        int $honorarioId,
        float $montoSolicitado,
        int $cotizacionId,
        ?int $detalleId,
        string $origenRef,
        string $motivo,
        int $usuarioId
    ): float {
        if ($honorarioId <= 0 || $montoSolicitado <= 0) {
            return 0.0;
        }
        self::asegurarEsquema($conn);

        $stmt = $conn->prepare("SELECT medico_id, monto_medico, estado_pago_medico FROM honorarios_medicos_movimientos WHERE id = ? LIMIT 1 FOR UPDATE");
        if (!$stmt) {
            return 0.0;
        }
        $stmt->bind_param('i', $honorarioId);
        $stmt->execute();
        $hm = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$hm || strtolower(trim((string)$hm['estado_pago_medico'])) !== 'pagado') {
            return 0.0;
        }

        $stmtSuma = $conn->prepare("SELECT COALESCE(SUM(monto), 0) AS total FROM honorarios_recuperos WHERE honorario_movimiento_id = ?");
        $stmtSuma->bind_param('i', $honorarioId);
        $stmtSuma->execute();
        $yaRegistrado = (float)($stmtSuma->get_result()->fetch_assoc()['total'] ?? 0);
        $stmtSuma->close();

        $disponible = round((float)$hm['monto_medico'] - $yaRegistrado, 2);
        $monto = round(min($montoSolicitado, $disponible), 2);
        if ($monto <= 0) {
            return 0.0;
        }

        $medicoId = (int)$hm['medico_id'];
        $cotId = $cotizacionId > 0 ? $cotizacionId : null;
        $stmtIns = $conn->prepare("INSERT IGNORE INTO honorarios_recuperos
            (honorario_movimiento_id, medico_id, cotizacion_id, cotizacion_detalle_id, origen_ref, monto, motivo, creado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        if (!$stmtIns) {
            return 0.0;
        }
        $motivoCorto = mb_substr($motivo, 0, 255);
        $uid = $usuarioId > 0 ? $usuarioId : null;
        $stmtIns->bind_param('iiiisdsi', $honorarioId, $medicoId, $cotId, $detalleId, $origenRef, $monto, $motivoCorto, $uid);
        $stmtIns->execute();
        $registrado = $stmtIns->affected_rows > 0;
        $stmtIns->close();

        return $registrado ? $monto : 0.0;
    }

    // Descuenta recuperos pendientes del médico al liquidar un honorario. Devuelve lo compensado.
    public static function compensarEnLiquidacion(mysqli $conn, int $medicoId, float $montoLiquidacion, int $honorarioLiquidadoId): float
    {
        if ($medicoId <= 0 || $montoLiquidacion <= 0) {
            return 0.0;
        }
        self::asegurarEsquema($conn);

        $stmt = $conn->prepare("SELECT id, monto, monto_compensado, compensado_en_honorarios
                                FROM honorarios_recuperos
                                WHERE medico_id = ? AND estado = 'pendiente'
                                ORDER BY id ASC FOR UPDATE");
        if (!$stmt) {
            return 0.0;
        }
        $stmt->bind_param('i', $medicoId);
        $stmt->execute();
        $recuperos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $restante = round($montoLiquidacion, 2);
        $compensado = 0.0;
        foreach ($recuperos as $rec) {
            if ($restante <= 0) {
                break;
            }
            $pendiente = round((float)$rec['monto'] - (float)$rec['monto_compensado'], 2);
            if ($pendiente <= 0) {
                continue;
            }
            $aplicar = round(min($pendiente, $restante), 2);
            $nuevoCompensado = round((float)$rec['monto_compensado'] + $aplicar, 2);
            $completo = $nuevoCompensado >= (float)$rec['monto'];
            $refs = trim((string)($rec['compensado_en_honorarios'] ?? ''));
            $refs = $refs === '' ? (string)$honorarioLiquidadoId : $refs . ',' . $honorarioLiquidadoId;
            $recId = (int)$rec['id'];

            $stmtUp = $conn->prepare("UPDATE honorarios_recuperos
                                      SET monto_compensado = ?,
                                          estado = IF(?, 'compensado', 'pendiente'),
                                          resuelto_en = IF(?, NOW(), NULL),
                                          compensado_en_honorarios = ?
                                      WHERE id = ?");
            $flag = $completo ? 1 : 0;
            $stmtUp->bind_param('diisi', $nuevoCompensado, $flag, $flag, $refs, $recId);
            $stmtUp->execute();
            $stmtUp->close();

            $restante = round($restante - $aplicar, 2);
            $compensado = round($compensado + $aplicar, 2);
        }

        return $compensado;
    }
}
