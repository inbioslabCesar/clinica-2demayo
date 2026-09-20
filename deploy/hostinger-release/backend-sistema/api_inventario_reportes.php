<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

function inv_report_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function inv_report_h(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}

function inv_report_periodo_sql(string $periodo): array
{
    switch ($periodo) {
        case 'mensual':
            return [
                "DATE_FORMAT(c.fecha_hora, '%Y-%m')",
                'Mes',
            ];
        case 'anual':
            return [
                "DATE_FORMAT(c.fecha_hora, '%Y')",
                'Año',
            ];
        case 'diario':
        default:
            return [
                "DATE(c.fecha_hora)",
                'Fecha',
            ];
    }
}

function inv_report_build_rows(mysqli $conn, string $periodo, string $fechaInicio, string $fechaFin, int $itemId, int $examenId): array
{
    [$periodExpr, $periodLabel] = inv_report_periodo_sql($periodo);

    $sql = "SELECT
                {$periodExpr} AS periodo,
                c.item_id,
                c.id_examen,
                i.codigo AS item_codigo,
                i.nombre AS item_nombre,
                i.unidad_medida,
                COALESCE(e.nombre, CONCAT('EXAMEN #', c.id_examen)) AS examen_nombre,
                COUNT(*) AS pruebas_total,
                COUNT(DISTINCT CASE
                    WHEN c.orden_id IS NOT NULL AND c.orden_id > 0 THEN CONCAT('O-', c.orden_id, '-', c.id_examen, '-', c.item_id)
                    ELSE CONCAT('R-', c.id)
                END) AS pruebas_unicas,
                IFNULL(SUM(c.cantidad_consumida), 0) AS consumo_real,
                r.cantidad_por_prueba AS consumo_receta
            FROM inventario_consumos_examen c
            JOIN inventario_items i ON i.id = c.item_id
            LEFT JOIN examenes_laboratorio e ON e.id = c.id_examen
            LEFT JOIN inventario_examen_recetas r
                ON r.id_examen = c.id_examen
               AND r.item_id = c.item_id
               AND r.activo = 1
            WHERE c.estado = 'aplicado'
              AND c.fecha_hora >= ?
              AND c.fecha_hora <= ?";

    $params = [$fechaInicio . ' 00:00:00', $fechaFin . ' 23:59:59'];
    $types = 'ss';

    if ($itemId > 0) {
        $sql .= ' AND c.item_id = ?';
        $params[] = $itemId;
        $types .= 'i';
    }

    if ($examenId > 0) {
        $sql .= ' AND c.id_examen = ?';
        $params[] = $examenId;
        $types .= 'i';
    }

    $sql .= " GROUP BY
                {$periodExpr},
                c.item_id,
                c.id_examen,
                i.codigo,
                i.nombre,
                i.unidad_medida,
                e.nombre,
                r.cantidad_por_prueba
            ORDER BY periodo DESC, i.nombre ASC, examen_nombre ASC";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('No se pudo preparar reporte de inventario.');
    }

    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();

    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $pruebasTotal = intval($row['pruebas_total'] ?? 0);
        $pruebasUnicas = intval($row['pruebas_unicas'] ?? 0);
        $pruebasRepetidas = max(0, $pruebasTotal - $pruebasUnicas);
        $consumoReal = round((float)($row['consumo_real'] ?? 0), 4);
        $consumoReceta = $row['consumo_receta'] !== null ? round((float)$row['consumo_receta'], 4) : 0.0;
        $consumoEsperado = $consumoReceta > 0 ? round($pruebasTotal * $consumoReceta, 4) : 0.0;
        $desviacion = round($consumoReal - $consumoEsperado, 4);
        $desviacionPct = $consumoEsperado > 0 ? round(($desviacion / $consumoEsperado) * 100, 2) : 0.0;

        $rows[] = [
            'periodo' => (string)($row['periodo'] ?? ''),
            'item_id' => intval($row['item_id'] ?? 0),
            'id_examen' => intval($row['id_examen'] ?? 0),
            'item_codigo' => (string)($row['item_codigo'] ?? ''),
            'item_nombre' => (string)($row['item_nombre'] ?? ''),
            'unidad_medida' => (string)($row['unidad_medida'] ?? ''),
            'examen_nombre' => (string)($row['examen_nombre'] ?? ''),
            'pruebas_total' => $pruebasTotal,
            'pruebas_repetidas' => $pruebasRepetidas,
            'consumo_receta' => $consumoReceta,
            'consumo_esperado' => $consumoEsperado,
            'consumo_real' => $consumoReal,
            'desviacion' => $desviacion,
            'desviacion_pct' => $desviacionPct,
        ];
    }

    $stmt->close();

    return [$rows, $periodLabel];
}

function inv_report_export_csv(array $rows, string $periodLabel, string $filename): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $out = fopen('php://output', 'w');
    if (!$out) {
        exit;
    }

    fwrite($out, "\xEF\xBB\xBF");
    fwrite($out, "sep=;\r\n");

    fputcsv($out, [
        $periodLabel,
        'Codigo Reactivo',
        'Reactivo',
        'Examen',
        'Pruebas realizadas',
        'Pruebas repetidas',
        'Consumo receta',
        'Consumo esperado',
        'Consumo real',
        'Desviacion',
        'Desviacion %',
        'Unidad',
    ], ';');

    foreach ($rows as $row) {
        fputcsv($out, [
            $row['periodo'],
            $row['item_codigo'],
            $row['item_nombre'],
            $row['examen_nombre'],
            $row['pruebas_total'],
            $row['pruebas_repetidas'],
            number_format((float)$row['consumo_receta'], 4, '.', ''),
            number_format((float)$row['consumo_esperado'], 4, '.', ''),
            number_format((float)$row['consumo_real'], 4, '.', ''),
            number_format((float)$row['desviacion'], 4, '.', ''),
            number_format((float)$row['desviacion_pct'], 2, '.', ''),
            $row['unidad_medida'],
        ], ';');
    }

    fclose($out);
    exit;
}

function inv_report_export_pdf(array $rows, string $periodo, string $periodLabel, string $fechaInicio, string $fechaFin): void
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
        inv_report_json(['success' => false, 'error' => 'mPDF no disponible para exportar PDF.'], 500);
    }

    $titulo = 'Reporte de consumo de reactivos - ' . strtoupper($periodo);

    $css = '<style>
        body { font-family: dejavusans, DejaVu Sans, Arial, sans-serif; font-size: 10px; color: #111827; }
        h1 { font-size: 14px; margin: 0 0 8px 0; }
        .meta { margin-bottom: 10px; color: #374151; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 4px; font-size: 9px; text-align: left; }
        td { border: 1px solid #e5e7eb; padding: 4px; font-size: 9px; }
        .num { text-align: right; }
    </style>';

    $html = '<h1>' . inv_report_h($titulo) . '</h1>'
        . '<div class="meta">Rango: ' . inv_report_h($fechaInicio) . ' a ' . inv_report_h($fechaFin) . '</div>'
        . '<table><thead><tr>'
        . '<th>' . inv_report_h($periodLabel) . '</th>'
        . '<th>Reactivo</th>'
        . '<th>Examen</th>'
        . '<th class="num">Pruebas</th>'
        . '<th class="num">Repetidas</th>'
        . '<th class="num">Cons. Receta</th>'
        . '<th class="num">Cons. Esperado</th>'
        . '<th class="num">Cons. Real</th>'
        . '<th class="num">Desv.</th>'
        . '<th class="num">Desv. %</th>'
        . '</tr></thead><tbody>';

    if (empty($rows)) {
        $html .= '<tr><td colspan="10">Sin datos para el rango seleccionado.</td></tr>';
    } else {
        foreach ($rows as $row) {
            $reactivo = trim(($row['item_codigo'] !== '' ? $row['item_codigo'] . ' ' : '') . $row['item_nombre']);
            $html .= '<tr>'
                . '<td>' . inv_report_h((string)$row['periodo']) . '</td>'
                . '<td>' . inv_report_h($reactivo) . '</td>'
                . '<td>' . inv_report_h((string)$row['examen_nombre']) . '</td>'
                . '<td class="num">' . intval($row['pruebas_total']) . '</td>'
                . '<td class="num">' . intval($row['pruebas_repetidas']) . '</td>'
                . '<td class="num">' . number_format((float)$row['consumo_receta'], 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)$row['consumo_esperado'], 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)$row['consumo_real'], 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)$row['desviacion'], 4, '.', '') . '</td>'
                . '<td class="num">' . number_format((float)$row['desviacion_pct'], 2, '.', '') . '</td>'
                . '</tr>';
        }
    }

    $html .= '</tbody></table>';

    $filename = 'reporte_consumo_reactivos_' . $periodo . '_' . date('Ymd_His') . '.pdf';

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
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo $mpdf->Output('', 'S');
    exit;
}

try {
    $periodo = strtolower(trim((string)($_GET['periodo'] ?? 'diario')));
    if (!in_array($periodo, ['diario', 'mensual', 'anual'], true)) {
        $periodo = 'diario';
    }

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

    $itemId = isset($_GET['item_id']) ? intval($_GET['item_id']) : 0;
    $examenId = isset($_GET['examen_id']) ? intval($_GET['examen_id']) : 0;
    $formato = strtolower(trim((string)($_GET['formato'] ?? 'json')));

    [$rows, $periodLabel] = inv_report_build_rows($conn, $periodo, $fechaInicio, $fechaFin, $itemId, $examenId);

    $resumen = [
        'filas' => count($rows),
        'pruebas_total' => 0,
        'pruebas_repetidas' => 0,
        'consumo_esperado_total' => 0,
        'consumo_real_total' => 0,
        'desviacion_total' => 0,
    ];

    foreach ($rows as $row) {
        $resumen['pruebas_total'] += intval($row['pruebas_total']);
        $resumen['pruebas_repetidas'] += intval($row['pruebas_repetidas']);
        $resumen['consumo_esperado_total'] += (float)$row['consumo_esperado'];
        $resumen['consumo_real_total'] += (float)$row['consumo_real'];
        $resumen['desviacion_total'] += (float)$row['desviacion'];
    }

    $resumen['consumo_esperado_total'] = round($resumen['consumo_esperado_total'], 4);
    $resumen['consumo_real_total'] = round($resumen['consumo_real_total'], 4);
    $resumen['desviacion_total'] = round($resumen['desviacion_total'], 4);

    if ($formato === 'excel' || $formato === 'csv') {
        $filename = 'reporte_consumo_reactivos_' . $periodo . '_' . date('Ymd_His') . '.csv';
        inv_report_export_csv($rows, $periodLabel, $filename);
    }

    if ($formato === 'pdf') {
        inv_report_export_pdf($rows, $periodo, $periodLabel, $fechaInicio, $fechaFin);
    }

    inv_report_json([
        'success' => true,
        'periodo' => $periodo,
        'periodo_label' => $periodLabel,
        'fecha_inicio' => $fechaInicio,
        'fecha_fin' => $fechaFin,
        'resumen' => $resumen,
        'rows' => $rows,
    ]);
} catch (Throwable $e) {
    inv_report_json(['success' => false, 'error' => 'Error interno: ' . $e->getMessage()], 500);
}
