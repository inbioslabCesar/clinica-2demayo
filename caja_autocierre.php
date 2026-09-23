<?php

if (!function_exists('caja_auto_columna_existe')) {
    function caja_auto_columna_existe(PDO $pdo, string $columna): bool
    {
        static $cache = [];
        if (array_key_exists($columna, $cache)) {
            return $cache[$columna];
        }
        try {
            $stmt = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cajas' AND column_name = ? LIMIT 1");
            $stmt->execute([$columna]);
            $exists = (bool)$stmt->fetchColumn();
            $cache[$columna] = $exists;
            return $exists;
        } catch (Throwable $e) {
            $cache[$columna] = false;
            return false;
        }
    }
}

if (!function_exists('caja_auto_asegurar_columnas')) {
    function caja_auto_asegurar_columnas(PDO $pdo): void
    {
        $asegurarColumna = static function (string $nombre, string $sqlAlter) use ($pdo): void {
            if (caja_auto_columna_existe($pdo, $nombre)) {
                return;
            }
            try {
                $pdo->exec($sqlAlter);
            } catch (PDOException $e) {
                $msg = strtolower((string)$e->getMessage());
                if (strpos($msg, 'duplicate column name') !== false || strpos($msg, '42s21') !== false) {
                    return;
                }
                throw $e;
            }
        };

        $asegurarColumna('virtual_contado', 'ALTER TABLE cajas ADD COLUMN virtual_contado DECIMAL(10,2) NULL DEFAULT NULL');
        $asegurarColumna('diferencia_virtual', 'ALTER TABLE cajas ADD COLUMN diferencia_virtual DECIMAL(10,2) NULL DEFAULT NULL');
        $asegurarColumna('cierre_automatico', 'ALTER TABLE cajas ADD COLUMN cierre_automatico TINYINT(1) NOT NULL DEFAULT 0');
        $asegurarColumna('cierre_pendiente_cuadre', 'ALTER TABLE cajas ADD COLUMN cierre_pendiente_cuadre TINYINT(1) NOT NULL DEFAULT 0');
    }
}

if (!function_exists('caja_auto_hoy_lima')) {
    function caja_auto_hoy_lima(): string
    {
        return (new DateTime('now', new DateTimeZone('America/Lima')))->format('Y-m-d');
    }
}

if (!function_exists('caja_auto_cerrar_vencidas')) {
    function caja_auto_cerrar_vencidas(PDO $pdo): array
    {
        caja_auto_asegurar_columnas($pdo);

        $hoyLima = caja_auto_hoy_lima();
        $stmt = $pdo->prepare(
            'SELECT id, usuario_id, fecha, monto_apertura
             FROM cajas
             WHERE estado = "abierta" AND DATE(fecha) < ?
             ORDER BY fecha ASC, id ASC'
        );
        $stmt->execute([$hoyLima]);
        $cajas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$cajas) {
            return ['procesadas' => 0, 'ids' => []];
        }

        $idsCerradas = [];
        foreach ($cajas as $caja) {
            $cajaId = (int)($caja['id'] ?? 0);
            if ($cajaId <= 0) {
                continue;
            }

            $totalesPago = [
                'efectivo' => 0.0,
                'yape' => 0.0,
                'plin' => 0.0,
                'tarjeta' => 0.0,
                'transferencia' => 0.0,
            ];

            $stmtIngresos = $pdo->prepare('SELECT metodo_pago, COALESCE(SUM(monto), 0) AS total FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
            $stmtIngresos->execute([$cajaId]);
            foreach ($stmtIngresos->fetchAll(PDO::FETCH_ASSOC) as $ingreso) {
                $metodo = strtolower(trim((string)($ingreso['metodo_pago'] ?? '')));
                if (array_key_exists($metodo, $totalesPago)) {
                    $totalesPago[$metodo] = (float)($ingreso['total'] ?? 0);
                }
            }

            $stmtFuente = $pdo->query("SHOW COLUMNS FROM egresos LIKE 'fuente_fondos'");
            $usaFuenteFondos = $stmtFuente && $stmtFuente->fetch(PDO::FETCH_ASSOC);
            $sqlEgresoMetodo = $usaFuenteFondos
                ? "SELECT metodo_pago, COALESCE(fuente_fondos, 'clinica') AS fuente_fondos, COALESCE(SUM(monto), 0) AS total FROM egresos WHERE caja_id = ? GROUP BY metodo_pago, COALESCE(fuente_fondos, 'clinica')"
                : "SELECT metodo_pago, 'clinica' AS fuente_fondos, COALESCE(SUM(monto), 0) AS total FROM egresos WHERE caja_id = ? GROUP BY metodo_pago";
            $stmtEgresoMetodo = $pdo->prepare($sqlEgresoMetodo);
            $stmtEgresoMetodo->execute([$cajaId]);

            $egresosPorMetodo = ['efectivo' => 0.0, 'yape' => 0.0, 'plin' => 0.0, 'tarjeta' => 0.0, 'transferencia' => 0.0];
            foreach ($stmtEgresoMetodo->fetchAll(PDO::FETCH_ASSOC) as $egreso) {
                $fuente = strtolower(trim((string)($egreso['fuente_fondos'] ?? 'clinica')));
                if ($fuente !== 'clinica') {
                    continue;
                }
                $metodo = strtolower(trim((string)($egreso['metodo_pago'] ?? 'efectivo')));
                if (array_key_exists($metodo, $egresosPorMetodo)) {
                    $egresosPorMetodo[$metodo] += (float)($egreso['total'] ?? 0);
                }
            }

            $stmtHonor = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM egresos WHERE caja_id = ? AND tipo_egreso = "honorario_medico"');
            $stmtHonor->execute([$cajaId]);
            $egresoHonorarios = (float)$stmtHonor->fetchColumn();

            $stmtLab = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
            $stmtLab->execute([$cajaId]);
            $egresoLabRef = (float)$stmtLab->fetchColumn();

            $stmtOperativo = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM egresos WHERE caja_id = ? AND tipo_egreso NOT IN ("honorario_medico", "laboratorio")');
            $stmtOperativo->execute([$cajaId]);
            $egresoOperativo = (float)$stmtOperativo->fetchColumn();

            $totalEgresos = $egresoHonorarios + $egresoLabRef + $egresoOperativo;
            $ingresoTotalDia = $totalesPago['efectivo'] + $totalesPago['yape'] + $totalesPago['plin'] + $totalesPago['tarjeta'] + $totalesPago['transferencia'];
            $gananciaDia = $ingresoTotalDia - $totalEgresos;
            $montoApertura = (float)($caja['monto_apertura'] ?? 0);
            $efectivoEsperado = $montoApertura + $totalesPago['efectivo'] - $egresosPorMetodo['efectivo'] - $egresoLabRef;
            $virtualCobrado = $totalesPago['yape'] + $totalesPago['plin'] + $totalesPago['tarjeta'] + $totalesPago['transferencia'];
            $egresosVirtualesClinica = $egresosPorMetodo['yape'] + $egresosPorMetodo['plin'] + $egresosPorMetodo['tarjeta'] + $egresosPorMetodo['transferencia'];
            $virtualEsperado = $virtualCobrado - $egresosVirtualesClinica;

            $motivoAuto = sprintf(
                'AUTOCIERRE 24H %s (pendiente cuadre real). Efectivo esperado: %.2f | Virtual esperado: %.2f',
                $hoyLima,
                $efectivoEsperado,
                $virtualEsperado
            );

            $stmtCerrar = $pdo->prepare(
                'UPDATE cajas
                 SET estado = "cerrada",
                     hora_cierre = NOW(),
                     observaciones_cierre = CONCAT_WS(" | ", NULLIF(TRIM(observaciones_cierre), ""), ?),
                     monto_cierre = NULL,
                     monto_contado = NULL,
                     diferencia = NULL,
                     total_efectivo = ?,
                     total_yape = ?,
                     total_plin = ?,
                     total_tarjetas = ?,
                     total_transferencias = ?,
                     egreso_honorarios = ?,
                     egreso_lab_ref = ?,
                     egreso_operativo = ?,
                     egreso_electronico = ?,
                     total_egresos = ?,
                     ganancia_dia = ?,
                     virtual_contado = NULL,
                     diferencia_virtual = NULL,
                     cierre_automatico = 1,
                     cierre_pendiente_cuadre = 1
                 WHERE id = ? AND estado = "abierta"'
            );

            $stmtCerrar->execute([
                $motivoAuto,
                $totalesPago['efectivo'],
                $totalesPago['yape'],
                $totalesPago['plin'],
                $totalesPago['tarjeta'],
                $totalesPago['transferencia'],
                $egresoHonorarios,
                $egresoLabRef,
                $egresoOperativo,
                $egresosVirtualesClinica,
                $totalEgresos,
                $gananciaDia,
                $cajaId,
            ]);

            if ($stmtCerrar->rowCount() > 0) {
                $idsCerradas[] = $cajaId;
            }
        }

        return [
            'procesadas' => count($idsCerradas),
            'ids' => $idsCerradas,
        ];
    }
}
