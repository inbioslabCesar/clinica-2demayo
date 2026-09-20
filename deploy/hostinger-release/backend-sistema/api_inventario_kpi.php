<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

function inv_kpi_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function inv_kpi_h(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}

function inv_kpi_range(): array
{
    $fechaInicio = trim((string)($_GET['fecha_inicio'] ?? ''));
    $fechaFin = trim((string)($_GET['fecha_fin'] ?? ''));

    if ($fechaInicio === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaInicio)) {
        $fechaInicio = date('Y-m-01');
    }
    if ($fechaFin === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaFin)) {
        $fechaFin = date('Y-m-d');
    }

    if ($fechaInicio > $fechaFin) {
        [$fechaInicio, $fechaFin] = [$fechaFin, $fechaInicio];
    }

    return [$fechaInicio, $fechaFin];
}

function inv_kpi_column_exists(mysqli $conn, string $table, string $column): bool
{
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function inv_kpi_top_desviaciones(mysqli $conn, string $fechaInicio, string $fechaFin): array
{
    $sql = "SELECT
                c.item_id,
                i.codigo AS item_codigo,
                i.nombre AS item_nombre,
                i.unidad_medida,
                COUNT(*) AS pruebas_total,
                IFNULL(SUM(c.cantidad_consumida), 0) AS consumo_real,
                IFNULL(SUM(COALESCE(r.cantidad_por_prueba, 0)), 0) AS consumo_esperado
            FROM inventario_consumos_examen c
            JOIN inventario_items i ON i.id = c.item_id
            LEFT JOIN inventario_examen_recetas r
                ON r.id_examen = c.id_examen
               AND r.item_id = c.item_id
               AND r.activo = 1
            WHERE c.estado = 'aplicado'
              AND c.fecha_hora >= ?
              AND c.fecha_hora <= ?
            GROUP BY c.item_id, i.codigo, i.nombre, i.unidad_medida
            ORDER BY ABS(IFNULL(SUM(c.cantidad_consumida), 0) - IFNULL(SUM(COALESCE(r.cantidad_por_prueba, 0)), 0)) DESC
            LIMIT 10";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('No se pudo preparar top de desviaciones.');
    }

    $desde = $fechaInicio . ' 00:00:00';
    $hasta = $fechaFin . ' 23:59:59';
    $stmt->bind_param('ss', $desde, $hasta);
    $stmt->execute();
    $res = $stmt->get_result();

    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $consumoReal = (float)($row['consumo_real'] ?? 0);
        $consumoEsperado = (float)($row['consumo_esperado'] ?? 0);
        $desviacion = round($consumoReal - $consumoEsperado, 4);
        $desvPct = $consumoEsperado > 0 ? round(($desviacion / $consumoEsperado) * 100, 2) : 0.0;

        $rows[] = [
            'item_id' => (int)($row['item_id'] ?? 0),
            'item_codigo' => (string)($row['item_codigo'] ?? ''),
            'item_nombre' => (string)($row['item_nombre'] ?? ''),
            'unidad_medida' => (string)($row['unidad_medida'] ?? ''),
            'pruebas_total' => (int)($row['pruebas_total'] ?? 0),
            'consumo_esperado' => round($consumoEsperado, 4),
            'consumo_real' => round($consumoReal, 4),
            'desviacion' => $desviacion,
            'desviacion_pct' => $desvPct,
        ];
    }

    $stmt->close();
    return $rows;
}

function inv_kpi_top_repeticiones(mysqli $conn, string $fechaInicio, string $fechaFin): array
{
    $sql = "SELECT
                c.id_examen,
                COALESCE(e.nombre, CONCAT('EXAMEN #', c.id_examen)) AS examen_nombre,
                COUNT(*) AS pruebas_total,
                COUNT(DISTINCT CASE
                    WHEN c.orden_id IS NOT NULL AND c.orden_id > 0 THEN CONCAT('O-', c.orden_id)
                    ELSE CONCAT('R-', c.id)
                END) AS pruebas_unicas
            FROM inventario_consumos_examen c
            LEFT JOIN examenes_laboratorio e ON e.id = c.id_examen
            WHERE c.estado = 'aplicado'
              AND c.fecha_hora >= ?
              AND c.fecha_hora <= ?
            GROUP BY c.id_examen, e.nombre
            HAVING COUNT(*) > 0
            ORDER BY (COUNT(*) - COUNT(DISTINCT CASE
                    WHEN c.orden_id IS NOT NULL AND c.orden_id > 0 THEN CONCAT('O-', c.orden_id)
                    ELSE CONCAT('R-', c.id)
                END)) DESC, COUNT(*) DESC
            LIMIT 10";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('No se pudo preparar top de repeticiones.');
    }

    $desde = $fechaInicio . ' 00:00:00';
    $hasta = $fechaFin . ' 23:59:59';
    $stmt->bind_param('ss', $desde, $hasta);
    $stmt->execute();
    $res = $stmt->get_result();

    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $total = (int)($row['pruebas_total'] ?? 0);
        $unicas = (int)($row['pruebas_unicas'] ?? 0);
        $repetidas = max(0, $total - $unicas);

        $rows[] = [
            'id_examen' => (int)($row['id_examen'] ?? 0),
            'examen_nombre' => (string)($row['examen_nombre'] ?? ''),
            'pruebas_total' => $total,
            'pruebas_unicas' => $unicas,
            'pruebas_repetidas' => $repetidas,
            'repeticion_pct' => $total > 0 ? round(($repetidas / $total) * 100, 2) : 0.0,
        ];
    }

    $stmt->close();
    return $rows;
}

function inv_kpi_proyeccion_stock(mysqli $conn, string $fechaFin): array
{
    $fin = new DateTimeImmutable($fechaFin);
    $inicio = $fin->modify('-29 days')->format('Y-m-d');

    $sql = "SELECT
                i.id,
                i.codigo,
                i.nombre,
                i.unidad_medida,
                IFNULL(tt.total_transferido, 0) AS total_transferido,
                IFNULL(tc.total_consumido, 0) AS total_consumido,
                IFNULL(td30.total_30d, 0) AS consumo_30d,
                IFNULL(td30.dias_con_consumo, 0) AS dias_con_consumo
            FROM inventario_items i
            LEFT JOIN (
                SELECT td.item_id, SUM(td.cantidad) AS total_transferido
                FROM inventario_transferencias_detalle td
                INNER JOIN inventario_transferencias t ON t.id = td.transferencia_id
                WHERE t.destino = 'laboratorio'
                GROUP BY td.item_id
            ) tt ON tt.item_id = i.id
            LEFT JOIN (
                SELECT c.item_id, SUM(c.cantidad_consumida) AS total_consumido
                FROM inventario_consumos_examen c
                WHERE c.estado = 'aplicado'
                GROUP BY c.item_id
            ) tc ON tc.item_id = i.id
            LEFT JOIN (
                SELECT c.item_id,
                       SUM(c.cantidad_consumida) AS total_30d,
                       COUNT(DISTINCT DATE(c.fecha_hora)) AS dias_con_consumo
                FROM inventario_consumos_examen c
                WHERE c.estado = 'aplicado'
                  AND DATE(c.fecha_hora) >= ?
                  AND DATE(c.fecha_hora) <= ?
                GROUP BY c.item_id
            ) td30 ON td30.item_id = i.id
            WHERE 1=1";

    if (inv_kpi_column_exists($conn, 'inventario_items', 'estado')) {
        $sql .= " AND LOWER(COALESCE(i.estado, '')) = 'activo'";
    }

    $sql .= "
            ORDER BY i.nombre ASC";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('No se pudo preparar proyeccion de consumo.');
    }

    $stmt->bind_param('ss', $inicio, $fechaFin);
    $stmt->execute();
    $res = $stmt->get_result();

    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $transferido = (float)($row['total_transferido'] ?? 0);
        $consumido = (float)($row['total_consumido'] ?? 0);
        $saldo = round($transferido - $consumido, 4);

        $consumo30d = (float)($row['consumo_30d'] ?? 0);
        $diasConConsumo = max(0, (int)($row['dias_con_consumo'] ?? 0));
        $promedioDiario = $diasConConsumo > 0 ? round($consumo30d / $diasConConsumo, 4) : 0.0;

        $proy7 = round($promedioDiario * 7, 4);
        $proy30 = round($promedioDiario * 30, 4);
        $coberturaDias = $promedioDiario > 0 ? round($saldo / $promedioDiario, 2) : null;

        $rows[] = [
            'item_id' => (int)($row['id'] ?? 0),
            'item_codigo' => (string)($row['codigo'] ?? ''),
            'item_nombre' => (string)($row['nombre'] ?? ''),
            'unidad_medida' => (string)($row['unidad_medida'] ?? ''),
            'saldo_actual' => $saldo,
            'consumo_30d' => round($consumo30d, 4),
            'promedio_diario' => $promedioDiario,
            'proyeccion_7d' => $proy7,
            'proyeccion_30d' => $proy30,
            'cobertura_dias' => $coberturaDias,
        ];
    }

    $stmt->close();

    usort($rows, static function ($a, $b) {
        return (float)($b['promedio_diario'] ?? 0) <=> (float)($a['promedio_diario'] ?? 0);
    });

    return array_slice($rows, 0, 15);
}

function inv_kpi_export_csv(array $payload, string $filename): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $out = fopen('php://output', 'w');
    if (!$out) {
        exit;
    }

    fwrite($out, "\xEF\xBB\xBF");
    fwrite($out, "sep=;\r\n");

    fputcsv($out, ['Resumen KPI'], ';');
    fputcsv($out, ['Fecha inicio', $payload['fecha_inicio'] ?? ''], ';');
    fputcsv($out, ['Fecha fin', $payload['fecha_fin'] ?? ''], ';');
    fputcsv($out, ['Items monitoreados', (int)($payload['resumen']['items_monitoreados'] ?? 0)], ';');
    fputcsv($out, ['Items con desviacion', (int)($payload['resumen']['items_con_desviacion'] ?? 0)], ';');
    fputcsv($out, ['Examenes con repeticion', (int)($payload['resumen']['examenes_con_repeticion'] ?? 0)], ';');
    fputcsv($out, ['Alertas activas', (int)($payload['resumen']['alertas_total'] ?? 0)], ';');
    fputcsv($out, [], ';');

    fputcsv($out, ['Top desviaciones por reactivo'], ';');
    fputcsv($out, ['Codigo', 'Reactivo', 'Pruebas', 'Consumo esperado', 'Consumo real', 'Desviacion', 'Desviacion %', 'Unidad'], ';');
    foreach ((array)($payload['top_desviaciones'] ?? []) as $row) {
        fputcsv($out, [
            $row['item_codigo'] ?? '',
            $row['item_nombre'] ?? '',
            (int)($row['pruebas_total'] ?? 0),
            number_format((float)($row['consumo_esperado'] ?? 0), 4, '.', ''),
            number_format((float)($row['consumo_real'] ?? 0), 4, '.', ''),
            number_format((float)($row['desviacion'] ?? 0), 4, '.', ''),
            number_format((float)($row['desviacion_pct'] ?? 0), 2, '.', ''),
            $row['unidad_medida'] ?? '',
        ], ';');
    }
    fputcsv($out, [], ';');

    fputcsv($out, ['Top examenes con repeticiones'], ';');
    fputcsv($out, ['Examen', 'Pruebas totales', 'Pruebas unicas', 'Pruebas repetidas', 'Repeticion %'], ';');
    foreach ((array)($payload['top_repeticiones'] ?? []) as $row) {
        fputcsv($out, [
            $row['examen_nombre'] ?? '',
            (int)($row['pruebas_total'] ?? 0),
            (int)($row['pruebas_unicas'] ?? 0),
            (int)($row['pruebas_repetidas'] ?? 0),
            number_format((float)($row['repeticion_pct'] ?? 0), 2, '.', ''),
        ], ';');
    }
    fputcsv($out, [], ';');

    fputcsv($out, ['Proyeccion de stock'], ';');
    fputcsv($out, ['Codigo', 'Reactivo', 'Saldo actual', 'Promedio diario', 'Proyeccion 7d', 'Proyeccion 30d', 'Cobertura dias', 'Unidad'], ';');
    foreach ((array)($payload['proyeccion_stock'] ?? []) as $row) {
        fputcsv($out, [
            $row['item_codigo'] ?? '',
            $row['item_nombre'] ?? '',
            number_format((float)($row['saldo_actual'] ?? 0), 4, '.', ''),
            number_format((float)($row['promedio_diario'] ?? 0), 4, '.', ''),
            number_format((float)($row['proyeccion_7d'] ?? 0), 4, '.', ''),
            number_format((float)($row['proyeccion_30d'] ?? 0), 4, '.', ''),
            $row['cobertura_dias'] === null ? 'N/A' : number_format((float)$row['cobertura_dias'], 2, '.', ''),
            $row['unidad_medida'] ?? '',
        ], ';');
    }
    fputcsv($out, [], ';');

    fputcsv($out, ['Alertas'], ';');
    fputcsv($out, ['Severidad', 'Tipo', 'Codigo', 'Reactivo', 'Mensaje'], ';');
    foreach ((array)($payload['alertas'] ?? []) as $row) {
        fputcsv($out, [
            $row['severidad'] ?? '',
            $row['tipo'] ?? '',
            $row['item_codigo'] ?? '',
            $row['item_nombre'] ?? '',
            $row['mensaje'] ?? '',
        ], ';');
    }

    fclose($out);
    exit;
}

function inv_kpi_export_pdf(array $payload): void
{
    $autoloadCandidates = [
        __DIR__ . '/vendor/autoload.php',
        dirname(__DIR__) . '/base-php/vendor/autoload.php',
    ];

    foreach ($autoloadCandidates as $autoloadFile) {
        if (file_exists($autoloadFile)) {
            require_once $autoloadFile;
            break;
        }
    }

    if (!class_exists('\\Mpdf\\Mpdf')) {
        inv_kpi_json(['success' => false, 'error' => 'mPDF no disponible para exportar PDF.'], 500);
    }

    $css = '<style>
        body { font-family: dejavusans, DejaVu Sans, Arial, sans-serif; font-size: 9px; color: #111827; }
        h1 { font-size: 13px; margin: 0 0 6px 0; }
        h2 { font-size: 11px; margin: 10px 0 4px 0; }
        .meta { margin-bottom: 8px; color: #374151; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 4px; text-align: left; }
        td { border: 1px solid #e5e7eb; padding: 4px; }
        .num { text-align: right; }
        .pill { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 8px; }
        .alta { background: #fee2e2; color: #991b1b; }
        .media { background: #fef3c7; color: #92400e; }
    </style>';

    $html = '<h1>Dashboard Ejecutivo Inventario Laboratorio</h1>';
    $html .= '<div class="meta">Rango: ' . inv_kpi_h((string)($payload['fecha_inicio'] ?? '')) . ' a ' . inv_kpi_h((string)($payload['fecha_fin'] ?? '')) . '</div>';

    $resumen = (array)($payload['resumen'] ?? []);
    $html .= '<table><thead><tr><th>Items monitoreados</th><th>Items con desviacion</th><th>Examenes con repeticion</th><th>Alertas activas</th></tr></thead><tbody><tr>'
        . '<td class="num">' . (int)($resumen['items_monitoreados'] ?? 0) . '</td>'
        . '<td class="num">' . (int)($resumen['items_con_desviacion'] ?? 0) . '</td>'
        . '<td class="num">' . (int)($resumen['examenes_con_repeticion'] ?? 0) . '</td>'
        . '<td class="num">' . (int)($resumen['alertas_total'] ?? 0) . '</td>'
        . '</tr></tbody></table>';

    $html .= '<h2>Top desviaciones por reactivo</h2><table><thead><tr><th>Reactivo</th><th class="num">Esperado</th><th class="num">Real</th><th class="num">Desviacion</th></tr></thead><tbody>';
    $rowsDesv = (array)($payload['top_desviaciones'] ?? []);
    if (empty($rowsDesv)) {
        $html .= '<tr><td colspan="4">Sin datos</td></tr>';
    } else {
        foreach ($rowsDesv as $row) {
            $reactivo = trim(((string)($row['item_codigo'] ?? '') !== '' ? $row['item_codigo'] . ' ' : '') . (string)($row['item_nombre'] ?? ''));
            $html .= '<tr>'
                . '<td>' . inv_kpi_h($reactivo) . '</td>'
                . '<td class="num">' . number_format((float)($row['consumo_esperado'] ?? 0), 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)($row['consumo_real'] ?? 0), 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)($row['desviacion'] ?? 0), 4, '.', '') . ' (' . number_format((float)($row['desviacion_pct'] ?? 0), 2, '.', '') . '%)</td>'
                . '</tr>';
        }
    }
    $html .= '</tbody></table>';

    $html .= '<h2>Top examenes con repeticiones</h2><table><thead><tr><th>Examen</th><th class="num">Total</th><th class="num">Repetidas</th><th class="num">%</th></tr></thead><tbody>';
    $rowsRep = (array)($payload['top_repeticiones'] ?? []);
    if (empty($rowsRep)) {
        $html .= '<tr><td colspan="4">Sin datos</td></tr>';
    } else {
        foreach ($rowsRep as $row) {
            $html .= '<tr>'
                . '<td>' . inv_kpi_h((string)($row['examen_nombre'] ?? '')) . '</td>'
                . '<td class="num">' . (int)($row['pruebas_total'] ?? 0) . '</td>'
                . '<td class="num">' . (int)($row['pruebas_repetidas'] ?? 0) . '</td>'
                . '<td class="num">' . number_format((float)($row['repeticion_pct'] ?? 0), 2, '.', '') . '%</td>'
                . '</tr>';
        }
    }
    $html .= '</tbody></table>';

    $html .= '<h2>Proyeccion y cobertura</h2><table><thead><tr><th>Reactivo</th><th class="num">Saldo</th><th class="num">Prom/dia</th><th class="num">Proy 7d</th><th class="num">Proy 30d</th><th class="num">Cobertura</th></tr></thead><tbody>';
    $rowsProy = (array)($payload['proyeccion_stock'] ?? []);
    if (empty($rowsProy)) {
        $html .= '<tr><td colspan="6">Sin datos</td></tr>';
    } else {
        foreach ($rowsProy as $row) {
            $reactivo = trim(((string)($row['item_codigo'] ?? '') !== '' ? $row['item_codigo'] . ' ' : '') . (string)($row['item_nombre'] ?? ''));
            $cobertura = $row['cobertura_dias'] === null ? 'N/A' : number_format((float)$row['cobertura_dias'], 2, '.', '') . ' d';
            $html .= '<tr>'
                . '<td>' . inv_kpi_h($reactivo) . '</td>'
                . '<td class="num">' . number_format((float)($row['saldo_actual'] ?? 0), 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)($row['promedio_diario'] ?? 0), 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)($row['proyeccion_7d'] ?? 0), 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)($row['proyeccion_30d'] ?? 0), 4, '.', '') . '</td>'
                . '<td class="num">' . inv_kpi_h($cobertura) . '</td>'
                . '</tr>';
        }
    }
    $html .= '</tbody></table>';

    $html .= '<h2>Alertas</h2><table><thead><tr><th>Severidad</th><th>Tipo</th><th>Reactivo</th><th>Mensaje</th></tr></thead><tbody>';
    $rowsAlertas = (array)($payload['alertas'] ?? []);
    if (empty($rowsAlertas)) {
        $html .= '<tr><td colspan="4">Sin alertas con los umbrales actuales.</td></tr>';
    } else {
        foreach ($rowsAlertas as $row) {
            $sev = (string)($row['severidad'] ?? 'media');
            $sevClass = $sev === 'alta' ? 'alta' : 'media';
            $reactivo = trim(((string)($row['item_codigo'] ?? '') !== '' ? $row['item_codigo'] . ' ' : '') . (string)($row['item_nombre'] ?? ''));
            $html .= '<tr>'
                . '<td><span class="pill ' . inv_kpi_h($sevClass) . '">' . inv_kpi_h(strtoupper($sev)) . '</span></td>'
                . '<td>' . inv_kpi_h((string)($row['tipo'] ?? '')) . '</td>'
                . '<td>' . inv_kpi_h($reactivo) . '</td>'
                . '<td>' . inv_kpi_h((string)($row['mensaje'] ?? '')) . '</td>'
                . '</tr>';
        }
    }
    $html .= '</tbody></table>';

    $mpdf = new \Mpdf\Mpdf([
        'mode' => 'utf-8',
        'format' => 'A4-L',
        'margin_left' => 8,
        'margin_right' => 8,
        'margin_top' => 10,
        'margin_bottom' => 10,
    ]);

    $mpdf->WriteHTML($css, \Mpdf\HTMLParserMode::HEADER_CSS);
    $mpdf->WriteHTML($html, \Mpdf\HTMLParserMode::HTML_BODY);

    if (ob_get_length()) {
        @ob_end_clean();
    }

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="kpi_inventario_laboratorio_' . date('Ymd_His') . '.pdf"');
    echo $mpdf->Output('', 'S');
    exit;
}

try {
    [$fechaInicio, $fechaFin] = inv_kpi_range();
    $umbralDesviacionPct = isset($_GET['umbral_desviacion_pct']) ? (float)$_GET['umbral_desviacion_pct'] : 20.0;
    $umbralDiasStock = isset($_GET['umbral_dias_stock']) ? (float)$_GET['umbral_dias_stock'] : 7.0;
    $formato = strtolower(trim((string)($_GET['formato'] ?? 'json')));

    if ($umbralDesviacionPct < 0) {
        $umbralDesviacionPct = 0;
    }
    if ($umbralDiasStock < 0) {
        $umbralDiasStock = 0;
    }

    $topDesviaciones = inv_kpi_top_desviaciones($conn, $fechaInicio, $fechaFin);
    $topRepeticiones = inv_kpi_top_repeticiones($conn, $fechaInicio, $fechaFin);
    $proyeccionStock = inv_kpi_proyeccion_stock($conn, $fechaFin);

    $alertas = [];

    foreach ($topDesviaciones as $row) {
        if (abs((float)$row['desviacion_pct']) >= $umbralDesviacionPct && (float)$row['consumo_esperado'] > 0) {
            $alertas[] = [
                'tipo' => 'desviacion_consumo',
                'severidad' => abs((float)$row['desviacion_pct']) >= ($umbralDesviacionPct * 2) ? 'alta' : 'media',
                'item_id' => (int)$row['item_id'],
                'item_codigo' => (string)$row['item_codigo'],
                'item_nombre' => (string)$row['item_nombre'],
                'mensaje' => 'Desviacion de consumo de ' . number_format((float)$row['desviacion_pct'], 2) . ' % en ' . trim(($row['item_codigo'] ? $row['item_codigo'] . ' ' : '') . $row['item_nombre']),
            ];
        }
    }

    foreach ($proyeccionStock as $row) {
        $cobertura = $row['cobertura_dias'];
        if ($cobertura !== null && $cobertura < $umbralDiasStock) {
            $alertas[] = [
                'tipo' => 'riesgo_quiebre_stock',
                'severidad' => $cobertura < max(1.0, $umbralDiasStock / 2) ? 'alta' : 'media',
                'item_id' => (int)$row['item_id'],
                'item_codigo' => (string)$row['item_codigo'],
                'item_nombre' => (string)$row['item_nombre'],
                'mensaje' => 'Riesgo de quiebre en ' . trim(($row['item_codigo'] ? $row['item_codigo'] . ' ' : '') . $row['item_nombre']) . ': cobertura estimada ' . number_format((float)$cobertura, 2) . ' dias',
            ];
        }
    }

    usort($alertas, static function ($a, $b) {
        $sev = ['alta' => 2, 'media' => 1, 'baja' => 0];
        return ($sev[$b['severidad']] ?? 0) <=> ($sev[$a['severidad']] ?? 0);
    });

    $resumen = [
        'items_monitoreados' => count($proyeccionStock),
        'items_con_desviacion' => count(array_filter($topDesviaciones, static fn($r) => (float)($r['consumo_esperado'] ?? 0) > 0)),
        'examenes_con_repeticion' => count(array_filter($topRepeticiones, static fn($r) => (int)($r['pruebas_repetidas'] ?? 0) > 0)),
        'alertas_total' => count($alertas),
    ];

    $payload = [
        'success' => true,
        'fecha_inicio' => $fechaInicio,
        'fecha_fin' => $fechaFin,
        'umbrales' => [
            'desviacion_pct' => $umbralDesviacionPct,
            'dias_stock' => $umbralDiasStock,
        ],
        'resumen' => $resumen,
        'top_desviaciones' => $topDesviaciones,
        'top_repeticiones' => $topRepeticiones,
        'proyeccion_stock' => $proyeccionStock,
        'alertas' => $alertas,
    ];

    if ($formato === 'excel' || $formato === 'csv') {
        $filename = 'kpi_inventario_laboratorio_' . date('Ymd_His') . '.csv';
        inv_kpi_export_csv($payload, $filename);
    }

    if ($formato === 'pdf') {
        inv_kpi_export_pdf($payload);
    }

    inv_kpi_json($payload);
} catch (Throwable $e) {
    inv_kpi_json(['success' => false, 'error' => 'Error interno: ' . $e->getMessage()], 500);
}
