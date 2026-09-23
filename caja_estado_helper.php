<?php

function caja_obtener_estado_actual(PDO $pdo, int $usuarioId, ?string $fechaHoy = null): array
{
    $fecha = $fechaHoy ?: date('Y-m-d');

    $stmt = $pdo->prepare(
        "SELECT 
            id,
            fecha,
            estado,
            turno,
            monto_apertura,
            hora_apertura,
            total_efectivo,
            total_tarjetas,
            total_transferencias,
            total_otros,
            observaciones_apertura,
            COALESCE((SELECT SUM(ing.monto) FROM ingresos_diarios ing WHERE ing.caja_id = cajas.id AND LOWER(TRIM(ing.metodo_pago)) = 'efectivo'), 0) AS total_efectivo_rt,
            COALESCE((SELECT SUM(ing.monto) FROM ingresos_diarios ing WHERE ing.caja_id = cajas.id AND LOWER(TRIM(ing.metodo_pago)) = 'tarjeta'), 0) AS total_tarjetas_rt,
            COALESCE((SELECT SUM(ing.monto) FROM ingresos_diarios ing WHERE ing.caja_id = cajas.id AND LOWER(TRIM(ing.metodo_pago)) IN ('transferencia','yape','plin')), 0) AS total_transferencias_rt,
            COALESCE((SELECT SUM(ing.monto) FROM ingresos_diarios ing WHERE ing.caja_id = cajas.id AND LOWER(TRIM(ing.metodo_pago)) NOT IN ('efectivo','tarjeta','transferencia','yape','plin')), 0) AS total_otros_rt
        FROM cajas
        WHERE fecha = ? AND usuario_id = ? AND estado != 'cerrada'
        ORDER BY created_at DESC
        LIMIT 1"
    );

    $stmt->execute([$fecha, $usuarioId]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

    if (!$caja) {
        return [
            'fecha_hoy' => $fecha,
            'estado' => 'cerrada',
            'caja' => null,
            'caja_abierta' => false,
        ];
    }

    $caja['total_efectivo'] = round((float)($caja['total_efectivo_rt'] ?? $caja['total_efectivo'] ?? 0), 2);
    $caja['total_tarjetas'] = round((float)($caja['total_tarjetas_rt'] ?? $caja['total_tarjetas'] ?? 0), 2);
    $caja['total_transferencias'] = round((float)($caja['total_transferencias_rt'] ?? $caja['total_transferencias'] ?? 0), 2);
    $caja['total_otros'] = round((float)($caja['total_otros_rt'] ?? $caja['total_otros'] ?? 0), 2);
    $caja['total_dia'] = round(
        $caja['total_efectivo'] +
        $caja['total_tarjetas'] +
        $caja['total_transferencias'] +
        $caja['total_otros'],
        2
    );

    unset($caja['total_efectivo_rt'], $caja['total_tarjetas_rt'], $caja['total_transferencias_rt'], $caja['total_otros_rt']);

    if (!empty($caja['hora_apertura'])) {
        $hora = strtotime((string)$caja['hora_apertura']);
        if ($hora !== false) {
            $caja['hora_apertura'] = date('H:i', $hora);
        }
    }

    return [
        'fecha_hoy' => $fecha,
        'estado' => 'abierta',
        'caja' => $caja,
        'caja_abierta' => true,
    ];
}
