<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$paciente_id = isset($_GET['paciente_id']) ? intval($_GET['paciente_id']) : 0;
$alcance = isset($_GET['alcance']) ? strtolower(trim((string)$_GET['alcance'])) : '90d';
$parametro = isset($_GET['parametro']) ? trim((string)$_GET['parametro']) : '';
$export = isset($_GET['export']) ? strtolower(trim((string)$_GET['export'])) : '';

if ($paciente_id <= 0) {
    echo json_encode(['success' => false, 'error' => 'Paciente no válido']);
    exit;
}

if (!in_array($alcance, ['30d', '90d', 'all'], true)) {
    $alcance = '90d';
}

function norm_key_cmp($value)
{
    $value = trim((string)$value);
    if ($value === '') return '';
    $value = preg_replace('/\s+/u', ' ', $value);
    if (function_exists('mb_strtolower')) {
        $value = mb_strtolower($value, 'UTF-8');
    } else {
        $value = strtolower($value);
    }
    if (class_exists('Normalizer')) {
        $normalized = Normalizer::normalize($value, Normalizer::FORM_D);
        if ($normalized !== false && $normalized !== null) {
            $value = preg_replace('/\p{Mn}+/u', '', $normalized);
        }
    }
    $value = preg_replace('/[^a-z0-9 ]/u', '', $value);
    return trim($value);
}

function to_nullable_float_cmp($value)
{
    if ($value === null) return null;
    $text = trim((string)$value);
    if ($text === '') return null;

    $text = str_replace(["\xc2\xa0", ' '], '', $text);
    $text = preg_replace('/[^0-9,\.\-]/', '', $text);
    if ($text === '' || $text === '-' || $text === '.' || $text === ',') return null;

    if (strpos($text, ',') !== false && strpos($text, '.') !== false) {
        if (strrpos($text, ',') > strrpos($text, '.')) {
            $text = str_replace('.', '', $text);
            $text = str_replace(',', '.', $text);
        } else {
            $text = str_replace(',', '', $text);
        }
    } elseif (strpos($text, ',') !== false) {
        $text = str_replace(',', '.', $text);
    }

    return is_numeric($text) ? (float)$text : null;
}

function normalize_sex_cmp($value)
{
    $raw = strtolower(trim((string)$value));
    if ($raw === '') return '';
    $raw = str_replace(['á', 'é', 'í', 'ó', 'ú'], ['a', 'e', 'i', 'o', 'u'], $raw);
    if (strpos($raw, 'm') === 0) return 'masculino';
    if (strpos($raw, 'f') === 0) return 'femenino';
    return $raw;
}

function parse_minmax_from_text_cmp($texto)
{
    if (!$texto) return ['min' => null, 'max' => null];
    $s = trim((string)$texto);
    if ($s === '') return ['min' => null, 'max' => null];

    $s = str_replace(',', '.', $s);
    $mRango = [];
    if (preg_match('/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|a|hasta|entre|y)\s*(-?\d+(?:\.\d+)?)/iu', $s, $mRango)) {
        $min = is_numeric($mRango[1]) ? (float)$mRango[1] : null;
        $max = is_numeric($mRango[2]) ? (float)$mRango[2] : null;
        return ['min' => $min, 'max' => $max];
    }

    $min = null;
    $max = null;
    if (preg_match('/(?:>=|≥|desde|mayor\s*a?)\s*(-?\d+(?:\.\d+)?)/iu', $s, $mMin)) {
        $min = is_numeric($mMin[1]) ? (float)$mMin[1] : null;
    }
    if (preg_match('/(?:<=|≤|hasta|menor\s*a?)\s*(-?\d+(?:\.\d+)?)/iu', $s, $mMax)) {
        $max = is_numeric($mMax[1]) ? (float)$mMax[1] : null;
    }

    return ['min' => $min, 'max' => $max];
}

function get_applicable_ref_cmp($refs, $sexoPaciente, $edadPaciente)
{
    if (!is_array($refs) || empty($refs)) return null;

    foreach ($refs as $ref) {
        if (!is_array($ref)) continue;
        $refSexo = normalize_sex_cmp($ref['sexo'] ?? 'cualquiera');
        $edadMin = to_nullable_float_cmp($ref['edad_min'] ?? null);
        $edadMax = to_nullable_float_cmp($ref['edad_max'] ?? null);

        $sexoOk = ($refSexo === '' || $refSexo === 'cualquiera' || $refSexo === $sexoPaciente);
        $edadOk = true;
        if ($edadPaciente !== null) {
            $edadOk = ($edadMin === null || $edadPaciente >= $edadMin) && ($edadMax === null || $edadPaciente <= $edadMax);
        }

        if ($sexoOk && $edadOk) {
            return $ref;
        }
    }

    return isset($refs[0]) && is_array($refs[0]) ? $refs[0] : null;
}

function build_trend_svg_cmp($serie)
{
    if (!is_array($serie) || empty($serie)) return '';

    $points = [];
    $allValues = [];
    foreach ($serie as $row) {
        $valor = isset($row['valor_num']) ? $row['valor_num'] : null;
        if ($valor === null || !is_numeric($valor)) continue;
        $refMin = (isset($row['ref_min']) && is_numeric($row['ref_min'])) ? (float)$row['ref_min'] : null;
        $refMax = (isset($row['ref_max']) && is_numeric($row['ref_max'])) ? (float)$row['ref_max'] : null;
        $points[] = [
            'valor' => (float)$valor,
            'ref_min' => $refMin,
            'ref_max' => $refMax,
            'label' => isset($row['fecha']) && strtotime((string)$row['fecha']) !== false ? date('d/m', strtotime((string)$row['fecha'])) : ''
        ];
        $allValues[] = (float)$valor;
        if ($refMin !== null) $allValues[] = $refMin;
        if ($refMax !== null) $allValues[] = $refMax;
    }

    if (empty($points) || empty($allValues)) return '';

    $minVal = min($allValues);
    $maxVal = max($allValues);
    if ($minVal === $maxVal) {
        $minVal -= 1;
        $maxVal += 1;
    }

    $width = 760;
    $height = 250;
    $padLeft = 52;
    $padRight = 24;
    $padTop = 18;
    $padBottom = 44;

    $plotW = $width - $padLeft - $padRight;
    $plotH = $height - $padTop - $padBottom;
    $count = count($points);
    $stepX = $count > 1 ? ($plotW / ($count - 1)) : 0;

    $toY = function ($v) use ($minVal, $maxVal, $padTop, $plotH) {
        $ratio = ($v - $minVal) / ($maxVal - $minVal);
        return $padTop + (1 - $ratio) * $plotH;
    };

    $lineVal = [];
    $lineMin = [];
    $lineMax = [];
    $xLabels = [];

    for ($i = 0; $i < $count; $i++) {
        $x = $padLeft + ($stepX * $i);
        $yVal = $toY($points[$i]['valor']);
        $lineVal[] = round($x, 2) . ',' . round($yVal, 2);

        if ($points[$i]['ref_min'] !== null) {
            $lineMin[] = round($x, 2) . ',' . round($toY($points[$i]['ref_min']), 2);
        }
        if ($points[$i]['ref_max'] !== null) {
            $lineMax[] = round($x, 2) . ',' . round($toY($points[$i]['ref_max']), 2);
        }

        if ($i === 0 || $i === $count - 1 || ($count > 6 && $i % (int)max(1, floor($count / 6)) === 0)) {
            $xLabels[] = [
                'x' => round($x, 2),
                'label' => htmlspecialchars((string)$points[$i]['label'], ENT_QUOTES, 'UTF-8')
            ];
        }
    }

    $grid = '';
    for ($g = 0; $g <= 4; $g++) {
        $y = $padTop + ($plotH * $g / 4);
        $val = $maxVal - (($maxVal - $minVal) * $g / 4);
        $grid .= '<line x1="' . $padLeft . '" y1="' . round($y, 2) . '" x2="' . ($width - $padRight) . '" y2="' . round($y, 2) . '" stroke="#e5e7eb" stroke-width="1" />';
        $grid .= '<text x="8" y="' . round($y + 4, 2) . '" font-size="10" fill="#6b7280">' . number_format($val, 2) . '</text>';
    }

    $labelsSvg = '';
    foreach ($xLabels as $lbl) {
        $labelsSvg .= '<text x="' . $lbl['x'] . '" y="' . ($height - 18) . '" text-anchor="middle" font-size="10" fill="#6b7280">' . $lbl['label'] . '</text>';
    }

    $svg = '';
    $svg .= '<svg xmlns="http://www.w3.org/2000/svg" width="' . $width . '" height="' . $height . '">';
    $svg .= '<rect x="0" y="0" width="' . $width . '" height="' . $height . '" fill="#ffffff" />';
    $svg .= $grid;
    $svg .= '<line x1="' . $padLeft . '" y1="' . ($height - $padBottom) . '" x2="' . ($width - $padRight) . '" y2="' . ($height - $padBottom) . '" stroke="#9ca3af" stroke-width="1.2" />';
    $svg .= '<line x1="' . $padLeft . '" y1="' . $padTop . '" x2="' . $padLeft . '" y2="' . ($height - $padBottom) . '" stroke="#9ca3af" stroke-width="1.2" />';

    if (!empty($lineMin)) {
        $svg .= '<polyline points="' . implode(' ', $lineMin) . '" fill="none" stroke="#16a34a" stroke-width="1.6" stroke-dasharray="5,4" />';
    }
    if (!empty($lineMax)) {
        $svg .= '<polyline points="' . implode(' ', $lineMax) . '" fill="none" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="5,4" />';
    }
    $svg .= '<polyline points="' . implode(' ', $lineVal) . '" fill="none" stroke="#2563eb" stroke-width="2.2" />';

    foreach ($lineVal as $point) {
        [$cx, $cy] = explode(',', $point);
        $svg .= '<circle cx="' . $cx . '" cy="' . $cy . '" r="2.3" fill="#2563eb" />';
    }

    $svg .= $labelsSvg;

    $legendY = 14;
    $svg .= '<line x1="' . ($width - 250) . '" y1="' . $legendY . '" x2="' . ($width - 228) . '" y2="' . $legendY . '" stroke="#2563eb" stroke-width="2" />';
    $svg .= '<text x="' . ($width - 224) . '" y="' . ($legendY + 4) . '" font-size="10" fill="#111827">Resultado</text>';
    $svg .= '<line x1="' . ($width - 160) . '" y1="' . $legendY . '" x2="' . ($width - 138) . '" y2="' . $legendY . '" stroke="#16a34a" stroke-width="1.6" stroke-dasharray="5,4" />';
    $svg .= '<text x="' . ($width - 134) . '" y="' . ($legendY + 4) . '" font-size="10" fill="#111827">Ref. min</text>';
    $svg .= '<line x1="' . ($width - 80) . '" y1="' . $legendY . '" x2="' . ($width - 58) . '" y2="' . $legendY . '" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="5,4" />';
    $svg .= '<text x="' . ($width - 54) . '" y="' . ($legendY + 4) . '" font-size="10" fill="#111827">Ref. max</text>';

    $svg .= '</svg>';

    return $svg;
}

$stmtPaciente = $conn->prepare('SELECT id, nombre, apellido, dni, sexo, edad FROM pacientes WHERE id = ? LIMIT 1');
$stmtPaciente->bind_param('i', $paciente_id);
$stmtPaciente->execute();
$resPaciente = $stmtPaciente->get_result();
$paciente = $resPaciente->fetch_assoc();
$stmtPaciente->close();

if (!$paciente) {
    echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
    exit;
}

$sexoPaciente = normalize_sex_cmp($paciente['sexo'] ?? '');
$edadPaciente = to_nullable_float_cmp($paciente['edad'] ?? null);

$sqlOrdenes = "SELECT o.id, o.consulta_id, o.examenes, o.fecha
    FROM ordenes_laboratorio o
    LEFT JOIN consultas c ON o.consulta_id = c.id
    WHERE IFNULL(o.paciente_id, c.paciente_id) = ?
      AND o.estado = 'completado'
    ORDER BY o.fecha ASC, o.id ASC";
$stmtOrdenes = $conn->prepare($sqlOrdenes);
$stmtOrdenes->bind_param('i', $paciente_id);
$stmtOrdenes->execute();
$resOrdenes = $stmtOrdenes->get_result();
$ordenes = [];
while ($row = $resOrdenes->fetch_assoc()) {
    $ordenes[] = $row;
}
$stmtOrdenes->close();

if (empty($ordenes)) {
    echo json_encode([
        'success' => true,
        'paciente' => $paciente,
        'parametros_disponibles' => [],
        'parametro_seleccionado' => '',
        'serie' => [],
        'resumen' => null,
        'alertas' => [],
        'alcance' => $alcance
    ]);
    exit;
}

$cutoffTs = null;
if ($alcance !== 'all') {
    $dias = $alcance === '30d' ? 30 : 90;
    $tmp = strtotime('-' . $dias . ' days');
    if ($tmp !== false) $cutoffTs = $tmp;
}

$cacheExamenes = [];
$parametrosDisponibles = [];
$seriesPorParametro = [];

foreach ($ordenes as $orden) {
    $fechaBase = trim((string)($orden['fecha'] ?? ''));
    if ($fechaBase === '') continue;

    $fechaTs = strtotime($fechaBase);
    if ($cutoffTs !== null && $fechaTs !== false && $fechaTs < $cutoffTs) {
        continue;
    }

    $stmtResultado = null;
    if (!empty($orden['consulta_id'])) {
        $stmtResultado = $conn->prepare('SELECT resultados, fecha FROM resultados_laboratorio WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
        $stmtResultado->bind_param('i', $orden['consulta_id']);
    } else {
        $stmtResultado = $conn->prepare('SELECT resultados, fecha FROM resultados_laboratorio WHERE orden_id = ? ORDER BY id DESC LIMIT 1');
        $stmtResultado->bind_param('i', $orden['id']);
    }

    $stmtResultado->execute();
    $resultadoRow = $stmtResultado->get_result()->fetch_assoc();
    $stmtResultado->close();

    if (!$resultadoRow || empty($resultadoRow['resultados'])) {
        continue;
    }

    $resultados = json_decode((string)$resultadoRow['resultados'], true);
    if (!is_array($resultados)) continue;

    $examenesIds = json_decode((string)($orden['examenes'] ?? '[]'), true);
    if (!is_array($examenesIds) || empty($examenesIds)) continue;

    $fechaEvento = trim((string)($resultadoRow['fecha'] ?? ''));
    if ($fechaEvento === '') $fechaEvento = $fechaBase;

    foreach ($examenesIds as $examIdRaw) {
        $examId = intval($examIdRaw);
        if ($examId <= 0) continue;

        if (!isset($cacheExamenes[$examId])) {
            $stmtEx = $conn->prepare('SELECT id, nombre, valores_referenciales FROM examenes_laboratorio WHERE id = ? LIMIT 1');
            $stmtEx->bind_param('i', $examId);
            $stmtEx->execute();
            $exData = $stmtEx->get_result()->fetch_assoc();
            $stmtEx->close();

            if ($exData) {
                $items = json_decode((string)($exData['valores_referenciales'] ?? '[]'), true);
                $exData['valores_referenciales'] = is_array($items) ? $items : [];
                $cacheExamenes[$examId] = $exData;
            } else {
                $cacheExamenes[$examId] = null;
            }
        }

        $examen = $cacheExamenes[$examId];
        if (!$examen) continue;

        $nombreExamen = trim((string)($examen['nombre'] ?? ('Examen ' . $examId)));
        $items = is_array($examen['valores_referenciales']) ? $examen['valores_referenciales'] : [];

        foreach ($items as $idx => $param) {
            if (!is_array($param)) continue;
            $tipo = strtolower(trim((string)($param['tipo'] ?? 'Parámetro')));
            if (!in_array($tipo, ['parámetro', 'parametro'], true)) continue;

            $nombreParametro = trim((string)($param['nombre'] ?? ''));
            if ($nombreParametro === '') {
                $nombreParametro = (count($items) === 1) ? $nombreExamen : ('Item ' . ($idx + 1));
            }

            $keyStable = 'exam_' . $examId . '|param_' . norm_key_cmp($nombreExamen) . '_' . norm_key_cmp($nombreParametro);
            $resultadoKey = $examId . '__' . $nombreParametro;
            $valorRaw = '';
            if (array_key_exists($resultadoKey, $resultados)) {
                $valorRaw = (string)$resultados[$resultadoKey];
            } elseif (array_key_exists($nombreParametro, $resultados)) {
                $valorRaw = (string)$resultados[$nombreParametro];
            }

            $valorNum = to_nullable_float_cmp($valorRaw);

            $referenciaAplicada = get_applicable_ref_cmp($param['referencias'] ?? [], $sexoPaciente, $edadPaciente);
            $refText = trim((string)($referenciaAplicada['valor'] ?? ''));
            $refMin = to_nullable_float_cmp($referenciaAplicada['valor_min'] ?? null);
            $refMax = to_nullable_float_cmp($referenciaAplicada['valor_max'] ?? null);

            if ($refMin === null && $refMax === null && $refText !== '') {
                $parsed = parse_minmax_from_text_cmp($refText);
                $refMin = $parsed['min'];
                $refMax = $parsed['max'];
            }

            $dentro = null;
            if ($valorNum !== null && ($refMin !== null || $refMax !== null)) {
                $dentro = true;
                if ($refMin !== null && $valorNum < $refMin) $dentro = false;
                if ($refMax !== null && $valorNum > $refMax) $dentro = false;
            }

            if (!isset($parametrosDisponibles[$keyStable])) {
                $parametrosDisponibles[$keyStable] = [
                    'llave' => $keyStable,
                    'examen' => $nombreExamen,
                    'parametro' => $nombreParametro,
                ];
            }

            if (!isset($seriesPorParametro[$keyStable])) {
                $seriesPorParametro[$keyStable] = [];
            }

            $seriesPorParametro[$keyStable][] = [
                'fecha' => $fechaEvento,
                'fecha_label' => ($fechaEvento !== '' && strtotime($fechaEvento) !== false) ? date('d/m/Y H:i', strtotime($fechaEvento)) : '-',
                'examen' => $nombreExamen,
                'parametro' => $nombreParametro,
                'valor_raw' => $valorRaw,
                'valor_num' => $valorNum,
                'unidad' => trim((string)($param['unidad'] ?? '')),
                'metodologia' => trim((string)($param['metodologia'] ?? '')),
                'referencia' => $refText,
                'ref_min' => $refMin,
                'ref_max' => $refMax,
                'dentro_rango' => $dentro,
            ];
        }
    }
}

$parametros = array_values($parametrosDisponibles);
usort($parametros, function ($a, $b) {
    $c1 = strcasecmp((string)$a['examen'], (string)$b['examen']);
    if ($c1 !== 0) return $c1;
    return strcasecmp((string)$a['parametro'], (string)$b['parametro']);
});

$selectedKey = $parametro;
if ($selectedKey === '' || !isset($seriesPorParametro[$selectedKey])) {
    $selectedKey = '';
    $bestTs = 0;
    foreach ($seriesPorParametro as $key => $serieTmp) {
        if (!is_array($serieTmp)) continue;
        foreach ($serieTmp as $p) {
            $ts = strtotime((string)($p['fecha'] ?? ''));
            if ($ts !== false && $ts >= $bestTs) {
                $bestTs = $ts;
                $selectedKey = $key;
            }
        }
    }
}
if ($selectedKey === '' && !empty($parametros)) {
    $selectedKey = (string)$parametros[0]['llave'];
}

$serie = isset($seriesPorParametro[$selectedKey]) && is_array($seriesPorParametro[$selectedKey]) ? $seriesPorParametro[$selectedKey] : [];
usort($serie, function ($a, $b) {
    return strcmp((string)$a['fecha'], (string)$b['fecha']);
});

$ultimoNumerico = null;
$anteriorNumerico = null;
for ($i = count($serie) - 1; $i >= 0; $i--) {
    if (isset($serie[$i]['valor_num']) && $serie[$i]['valor_num'] !== null) {
        if ($ultimoNumerico === null) {
            $ultimoNumerico = $serie[$i];
        } elseif ($anteriorNumerico === null) {
            $anteriorNumerico = $serie[$i];
            break;
        }
    }
}

$deltaAbs = null;
$deltaPct = null;
$tendencia = 'Sin datos';
if ($ultimoNumerico !== null && $anteriorNumerico !== null) {
    $deltaAbs = (float)$ultimoNumerico['valor_num'] - (float)$anteriorNumerico['valor_num'];
    if ((float)$anteriorNumerico['valor_num'] !== 0.0) {
        $deltaPct = ($deltaAbs / (float)$anteriorNumerico['valor_num']) * 100;
    }
    if ($deltaAbs > 0) $tendencia = 'Subiendo';
    elseif ($deltaAbs < 0) $tendencia = 'Bajando';
    else $tendencia = 'Estable';
}

$alertas = [];
if ($ultimoNumerico !== null) {
    if (array_key_exists('dentro_rango', $ultimoNumerico) && $ultimoNumerico['dentro_rango'] === false) {
        $alertas[] = 'El último resultado está fuera de rango de referencia.';
    }
    if ($anteriorNumerico !== null && $anteriorNumerico['dentro_rango'] === true && $ultimoNumerico['dentro_rango'] === false) {
        $alertas[] = 'Hubo cruce de rango: pasó de dentro de rango a fuera de rango.';
    }
    if ($deltaPct !== null && abs($deltaPct) > 20) {
        $alertas[] = 'Se detecta cambio brusco mayor al 20% respecto al control anterior.';
    }
}

if (in_array($export, ['excel', 'pdf'], true)) {
    $selectedMeta = null;
    foreach ($parametros as $opt) {
        if (($opt['llave'] ?? '') === $selectedKey) {
            $selectedMeta = $opt;
            break;
        }
    }

    $nombrePacientePlano = trim((string)(($paciente['nombre'] ?? '') . ' ' . ($paciente['apellido'] ?? '')));
    if ($nombrePacientePlano === '') {
        $nombrePacientePlano = 'paciente_' . (int)$paciente_id;
    }
    $slugPaciente = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '_', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nombrePacientePlano)));
    $slugPaciente = trim((string)$slugPaciente, '_');
    if ($slugPaciente === '') {
        $slugPaciente = 'paciente_' . (int)$paciente_id;
    }

    $tituloParametro = $selectedMeta ? (($selectedMeta['examen'] ?? 'Examen') . ' · ' . ($selectedMeta['parametro'] ?? 'Parámetro')) : 'Parámetro';

    $htmlExport = '';
    $htmlExport .= '<h2>Comparación de Resultados de Laboratorio</h2>';
    $htmlExport .= '<p><strong>Paciente:</strong> ' . htmlspecialchars($nombrePacientePlano, ENT_QUOTES, 'UTF-8') . ' | <strong>DNI:</strong> ' . htmlspecialchars((string)($paciente['dni'] ?? ''), ENT_QUOTES, 'UTF-8') . '</p>';
    $htmlExport .= '<p><strong>Parámetro:</strong> ' . htmlspecialchars($tituloParametro, ENT_QUOTES, 'UTF-8') . '</p>';
    $htmlExport .= '<p><strong>Tendencia:</strong> ' . htmlspecialchars($tendencia, ENT_QUOTES, 'UTF-8') . '</p>';
    $htmlExport .= '<table border="1" cellpadding="6" cellspacing="0" width="100%" style="border-collapse:collapse; margin-bottom:12px;">';
    $htmlExport .= '<tr><th align="left">Último valor</th><th align="left">Anterior</th><th align="left">Diferencia</th><th align="left">Variación (%)</th></tr>';
    $htmlExport .= '<tr>';
    $htmlExport .= '<td>' . htmlspecialchars($ultimoNumerico ? ((string)$ultimoNumerico['valor_raw'] . (($ultimoNumerico['unidad'] ?? '') !== '' ? ' ' . $ultimoNumerico['unidad'] : '')) : 'Sin dato', ENT_QUOTES, 'UTF-8') . '</td>';
    $htmlExport .= '<td>' . htmlspecialchars($anteriorNumerico ? ((string)$anteriorNumerico['valor_raw'] . (($anteriorNumerico['unidad'] ?? '') !== '' ? ' ' . $anteriorNumerico['unidad'] : '')) : 'Sin dato', ENT_QUOTES, 'UTF-8') . '</td>';
    $htmlExport .= '<td>' . htmlspecialchars($deltaAbs !== null ? number_format($deltaAbs, 2) : 'Sin dato', ENT_QUOTES, 'UTF-8') . '</td>';
    $htmlExport .= '<td>' . htmlspecialchars($deltaPct !== null ? number_format($deltaPct, 2) . '%' : 'Sin dato', ENT_QUOTES, 'UTF-8') . '</td>';
    $htmlExport .= '</tr>';
    $htmlExport .= '</table>';

    if (!empty($alertas)) {
        $htmlExport .= '<p><strong>Alertas:</strong></p><ul>';
        foreach ($alertas as $a) {
            $htmlExport .= '<li>' . htmlspecialchars((string)$a, ENT_QUOTES, 'UTF-8') . '</li>';
        }
        $htmlExport .= '</ul>';
    }

    $svgChart = build_trend_svg_cmp($serie);
    if ($svgChart !== '') {
        $htmlExport .= '<h3 style="margin:10px 0 6px 0;">Tendencia del parámetro</h3>';
        $htmlExport .= '<div style="border:1px solid #e5e7eb; padding:6px; margin-bottom:12px;">' . $svgChart . '</div>';
    }

    $htmlExport .= '<table border="1" cellpadding="6" cellspacing="0" width="100%" style="border-collapse:collapse;">';
    $htmlExport .= '<thead><tr><th>Fecha</th><th>Examen</th><th>Parámetro</th><th>Resultado</th><th>Unidad</th><th>Referencia</th><th>Metodología</th><th>Estado</th></tr></thead><tbody>';
    if (empty($serie)) {
        $htmlExport .= '<tr><td colspan="8" align="center">No hay datos para el parámetro seleccionado.</td></tr>';
    } else {
        foreach ($serie as $r) {
            $estadoTxt = 'Sin evaluar';
            if (($r['dentro_rango'] ?? null) === true) {
                $estadoTxt = 'Dentro de rango';
            } elseif (($r['dentro_rango'] ?? null) === false) {
                $estadoTxt = 'Fuera de rango';
            }

            $htmlExport .= '<tr>';
            $htmlExport .= '<td>' . htmlspecialchars((string)($r['fecha_label'] ?? '-'), ENT_QUOTES, 'UTF-8') . '</td>';
            $htmlExport .= '<td>' . htmlspecialchars((string)($r['examen'] ?? '-'), ENT_QUOTES, 'UTF-8') . '</td>';
            $htmlExport .= '<td>' . htmlspecialchars((string)($r['parametro'] ?? '-'), ENT_QUOTES, 'UTF-8') . '</td>';
            $htmlExport .= '<td>' . htmlspecialchars((string)((($r['valor_raw'] ?? '') !== '') ? $r['valor_raw'] : '-'), ENT_QUOTES, 'UTF-8') . '</td>';
            $htmlExport .= '<td>' . htmlspecialchars((string)((($r['unidad'] ?? '') !== '') ? $r['unidad'] : '-'), ENT_QUOTES, 'UTF-8') . '</td>';
            $htmlExport .= '<td>' . htmlspecialchars((string)((($r['referencia'] ?? '') !== '') ? $r['referencia'] : '-'), ENT_QUOTES, 'UTF-8') . '</td>';
            $htmlExport .= '<td>' . htmlspecialchars((string)((($r['metodologia'] ?? '') !== '') ? $r['metodologia'] : '-'), ENT_QUOTES, 'UTF-8') . '</td>';
            $htmlExport .= '<td>' . htmlspecialchars($estadoTxt, ENT_QUOTES, 'UTF-8') . '</td>';
            $htmlExport .= '</tr>';
        }
    }
    $htmlExport .= '</tbody></table>';

    if ($export === 'excel') {
        $filename = 'comparacion_laboratorio_' . $slugPaciente . '_' . date('Ymd_His') . '.xls';
        header('Content-Type: application/vnd.ms-excel; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');
        echo '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">';
        echo $htmlExport;
        exit;
    }

    if ($export === 'pdf') {
        try {
            require_once __DIR__ . '/vendor/autoload.php';
            $mpdf = new \Mpdf\Mpdf([
                'mode' => 'utf-8',
                'format' => 'A4',
                'margin_left' => 10,
                'margin_right' => 10,
                'margin_top' => 12,
                'margin_bottom' => 12,
            ]);
            $mpdf->WriteHTML($htmlExport);
            // Format: comparacion_laboratorio_[nombre_paciente]_[fecha_descarga_con_hora].pdf
            // Example: comparacion_laboratorio_Juan_Perez_02-04-2026_14-35-20.pdf
            $descarga_fecha = date('d-m-Y_H-i-s');
            $filename = 'comparacion_laboratorio_' . $slugPaciente . '_' . $descarga_fecha . '.pdf';
            $mpdf->Output($filename, \Mpdf\Output\Destination::DOWNLOAD);
            exit;
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo generar PDF: ' . $e->getMessage()]);
            exit;
        }
    }
}

echo json_encode([
    'success' => true,
    'paciente' => $paciente,
    'parametros_disponibles' => $parametros,
    'parametro_seleccionado' => $selectedKey,
    'serie' => $serie,
    'resumen' => [
        'ultimo' => $ultimoNumerico,
        'anterior' => $anteriorNumerico,
        'delta_abs' => $deltaAbs,
        'delta_pct' => $deltaPct,
        'tendencia' => $tendencia,
        'registros' => count($serie)
    ],
    'alertas' => $alertas,
    'alcance' => $alcance
]);
