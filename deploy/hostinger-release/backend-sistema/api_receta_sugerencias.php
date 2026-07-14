<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

function rs_get_int_query($key, $default, $min = 1, $max = 1000) {
    if (!isset($_GET[$key])) return $default;
    $val = filter_var($_GET[$key], FILTER_VALIDATE_INT);
    if ($val === false) return $default;
    if ($val < $min) return $min;
    if ($val > $max) return $max;
    return $val;
}

function rs_lower_trim($value) {
    $txt = trim((string)$value);
    if ($txt === '') return '';
    return function_exists('mb_strtolower') ? mb_strtolower($txt, 'UTF-8') : strtolower($txt);
}

function rs_parse_time_list($raw) {
    $list = [];

    if (is_array($raw)) {
        $base = $raw;
    } else {
        $rawTxt = trim((string)$raw);
        if ($rawTxt === '') return [];

        $decoded = json_decode($rawTxt, true);
        if (is_array($decoded)) {
            $base = $decoded;
        } else {
            $base = preg_split('/\s*,\s*/', $rawTxt);
        }
    }

    foreach ($base as $item) {
        $hora = trim((string)$item);
        if ($hora === '') continue;
        if (!preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $hora)) continue;
        $list[$hora] = true;
    }

    $horas = array_keys($list);
    sort($horas);
    return $horas;
}

function rs_build_frecuencia_texto($tipo, $valor, $horas) {
    if ($tipo === 'intervalo_horas' && (int)$valor > 0) {
        return 'Cada ' . (int)$valor . ' horas';
    }
    if ($tipo === 'veces_dia' && (int)$valor > 0) {
        return (int)$valor . ' veces al dia';
    }
    if ($tipo === 'horarios_fijos' && !empty($horas)) {
        return 'Horarios fijos: ' . implode(', ', $horas);
    }
    return 'Segun indicacion / PRN';
}

function rs_build_duracion_texto($valor, $unidad) {
    $v = max(1, (int)$valor);
    if ($unidad === 'semanas') {
        return $v . ' semana' . ($v === 1 ? '' : 's');
    }
    return $v . ' dia' . ($v === 1 ? '' : 's');
}

function rs_push_counter(&$map, $key, $value) {
    if ($value === null || $value === '') return;
    if (!isset($map[$key])) $map[$key] = [];
    if (!isset($map[$key][$value])) $map[$key][$value] = 0;
    $map[$key][$value]++;
}

function rs_pick_mode($counter) {
    if (!is_array($counter) || empty($counter)) return null;
    arsort($counter);
    foreach ($counter as $value => $count) {
        return $value;
    }
    return null;
}

function rs_extract_receta_item($item) {
    if (!is_array($item)) return null;

    $codigo = trim((string)($item['codigo'] ?? $item['medicamento_codigo'] ?? ''));
    $nombre = trim((string)($item['nombre'] ?? $item['medicamento'] ?? $item['medicamento_nombre'] ?? ''));
    if ($codigo === '' && $nombre === '') return null;

    $dosis = trim((string)($item['dosis'] ?? $item['dosis_texto'] ?? ''));
    $frecuenciaTipo = trim((string)($item['frecuencia_tipo'] ?? ''));
    $frecuenciaValor = isset($item['frecuencia_valor']) ? (int)$item['frecuencia_valor'] : 0;
    $frecuenciaHoras = rs_parse_time_list($item['frecuencia_horas'] ?? $item['frecuencia_horas_json'] ?? []);
    $frecuenciaTexto = trim((string)($item['frecuencia'] ?? $item['frecuencia_texto'] ?? ''));

    $duracionValor = isset($item['duracion_valor']) ? (int)$item['duracion_valor'] : 0;
    $duracionUnidad = trim((string)($item['duracion_unidad'] ?? ''));
    $duracionTexto = trim((string)($item['duracion'] ?? $item['duracion_texto'] ?? ''));
    $observaciones = trim((string)($item['observaciones'] ?? $item['indicaciones'] ?? ''));
    $cantidadDispensacion = isset($item['cantidad_dispensacion'])
        ? (int)$item['cantidad_dispensacion']
        : (isset($item['cantidad_dispensar']) ? (int)$item['cantidad_dispensar'] : 0);
    if ($cantidadDispensacion <= 0) {
        $cantidadDispensacion = 1;
    }

    if ($frecuenciaTipo === '') {
        $txt = rs_lower_trim($frecuenciaTexto);
        if ($txt !== '') {
            if (preg_match('/cada\s+(\d+)\s*h/', $txt, $m)) {
                $frecuenciaTipo = 'intervalo_horas';
                $frecuenciaValor = max(1, (int)$m[1]);
            } elseif (preg_match('/(\d+)\s*veces\s*al\s*d[ii]a/', $txt, $m)) {
                $frecuenciaTipo = 'veces_dia';
                $frecuenciaValor = max(1, (int)$m[1]);
            } elseif (strpos($txt, 'prn') !== false || strpos($txt, 'segun') !== false) {
                $frecuenciaTipo = 'prn';
            }
        }
    }

    if ($duracionValor <= 0) {
        if (preg_match('/(\d+)/', $duracionTexto, $m)) {
            $duracionValor = max(1, (int)$m[1]);
        }
    }
    if ($duracionUnidad === '') {
        $durTxt = rs_lower_trim($duracionTexto);
        $duracionUnidad = (strpos($durTxt, 'sem') !== false) ? 'semanas' : 'dias';
    }

    if ($frecuenciaTipo === '') $frecuenciaTipo = 'intervalo_horas';
    if ($frecuenciaTipo !== 'prn' && $frecuenciaValor <= 0 && $frecuenciaTipo !== 'horarios_fijos') {
        $frecuenciaValor = 8;
    }
    if ($duracionValor <= 0) $duracionValor = 5;
    if ($duracionUnidad !== 'semanas') $duracionUnidad = 'dias';

    if ($frecuenciaTexto === '') {
        $frecuenciaTexto = rs_build_frecuencia_texto($frecuenciaTipo, $frecuenciaValor, $frecuenciaHoras);
    }
    if ($duracionTexto === '') {
        $duracionTexto = rs_build_duracion_texto($duracionValor, $duracionUnidad);
    }

    $key = $codigo !== '' ? ('C|' . rs_lower_trim($codigo)) : ('N|' . rs_lower_trim($nombre));

    return [
        'key' => $key,
        'codigo' => $codigo,
        'nombre' => $nombre,
        'dosis' => $dosis,
        'frecuencia_tipo' => $frecuenciaTipo,
        'frecuencia_valor' => $frecuenciaValor > 0 ? $frecuenciaValor : null,
        'frecuencia_horas' => $frecuenciaHoras,
        'frecuencia' => $frecuenciaTexto,
        'duracion_valor' => $duracionValor,
        'duracion_unidad' => $duracionUnidad,
        'duracion' => $duracionTexto,
        'observaciones' => $observaciones,
        'cantidad_dispensacion' => $cantidadDispensacion,
    ];
}

function rs_collect_bucket($conn, $sql, $types, $params, $limitTop) {
    $stmt = $conn->prepare($sql);
    if (!$stmt) return [];

    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }

    if (!$stmt->execute()) {
        $stmt->close();
        return [];
    }

    $res = $stmt->get_result();
    $agg = [];

    while ($row = $res->fetch_assoc()) {
        $rawDatos = $row['datos'] ?? '';
        if (!is_string($rawDatos) || trim($rawDatos) === '') continue;

        $parsed = json_decode($rawDatos, true);
        if (!is_array($parsed)) continue;

        $receta = isset($parsed['receta']) && is_array($parsed['receta']) ? $parsed['receta'] : [];
        if (empty($receta)) continue;

        $fechaRef = trim((string)($row['fecha_ref'] ?? ''));

        foreach ($receta as $item) {
            $norm = rs_extract_receta_item($item);
            if (!$norm) continue;

            $k = $norm['key'];
            if (!isset($agg[$k])) {
                $agg[$k] = [
                    'key' => $k,
                    'codigo' => $norm['codigo'],
                    'nombre' => $norm['nombre'],
                    'count' => 0,
                    'last_fecha' => $fechaRef,
                    'mode' => [
                        'dosis' => [],
                        'frecuencia_tipo' => [],
                        'frecuencia_valor' => [],
                        'frecuencia_horas' => [],
                        'duracion_valor' => [],
                        'duracion_unidad' => [],
                        'frecuencia' => [],
                        'duracion' => [],
                        'observaciones' => [],
                        'cantidad_dispensacion' => [],
                    ],
                ];
            }

            $agg[$k]['count']++;
            if ($fechaRef !== '' && strcmp($fechaRef, (string)$agg[$k]['last_fecha']) > 0) {
                $agg[$k]['last_fecha'] = $fechaRef;
            }

            if ($agg[$k]['nombre'] === '' && $norm['nombre'] !== '') {
                $agg[$k]['nombre'] = $norm['nombre'];
            }
            if ($agg[$k]['codigo'] === '' && $norm['codigo'] !== '') {
                $agg[$k]['codigo'] = $norm['codigo'];
            }

            rs_push_counter($agg[$k]['mode'], 'dosis', $norm['dosis']);
            rs_push_counter($agg[$k]['mode'], 'frecuencia_tipo', $norm['frecuencia_tipo']);
            rs_push_counter($agg[$k]['mode'], 'frecuencia_valor', $norm['frecuencia_valor'] !== null ? (string)$norm['frecuencia_valor'] : null);
            rs_push_counter($agg[$k]['mode'], 'frecuencia_horas', !empty($norm['frecuencia_horas']) ? json_encode($norm['frecuencia_horas']) : null);
            rs_push_counter($agg[$k]['mode'], 'duracion_valor', (string)$norm['duracion_valor']);
            rs_push_counter($agg[$k]['mode'], 'duracion_unidad', $norm['duracion_unidad']);
            rs_push_counter($agg[$k]['mode'], 'frecuencia', $norm['frecuencia']);
            rs_push_counter($agg[$k]['mode'], 'duracion', $norm['duracion']);
            rs_push_counter($agg[$k]['mode'], 'observaciones', $norm['observaciones']);
            rs_push_counter($agg[$k]['mode'], 'cantidad_dispensacion', (string)$norm['cantidad_dispensacion']);
        }
    }

    $stmt->close();

    $rows = array_values($agg);
    usort($rows, function ($a, $b) {
        $countDiff = (int)($b['count'] ?? 0) - (int)($a['count'] ?? 0);
        if ($countDiff !== 0) return $countDiff;
        return strcmp((string)($b['last_fecha'] ?? ''), (string)($a['last_fecha'] ?? ''));
    });

    $rows = array_slice($rows, 0, max(1, (int)$limitTop));

    $output = [];
    foreach ($rows as $row) {
        $ft = rs_pick_mode($row['mode']['frecuencia_tipo']);
        if (!$ft) $ft = 'intervalo_horas';

        $fvRaw = rs_pick_mode($row['mode']['frecuencia_valor']);
        $fv = $fvRaw !== null ? (int)$fvRaw : null;

        $fhRaw = rs_pick_mode($row['mode']['frecuencia_horas']);
        $fh = [];
        if (is_string($fhRaw) && $fhRaw !== '') {
            $decoded = json_decode($fhRaw, true);
            if (is_array($decoded)) $fh = rs_parse_time_list($decoded);
        }

        $dvRaw = rs_pick_mode($row['mode']['duracion_valor']);
        $dv = $dvRaw !== null ? max(1, (int)$dvRaw) : 5;

        $du = rs_pick_mode($row['mode']['duracion_unidad']);
        if ($du !== 'semanas') $du = 'dias';

        $freq = rs_pick_mode($row['mode']['frecuencia']);
        if (!is_string($freq) || trim($freq) === '') {
            $freq = rs_build_frecuencia_texto($ft, $fv, $fh);
        }

        $dur = rs_pick_mode($row['mode']['duracion']);
        if (!is_string($dur) || trim($dur) === '') {
            $dur = rs_build_duracion_texto($dv, $du);
        }

        $obs = rs_pick_mode($row['mode']['observaciones']);
        if (!is_string($obs)) {
            $obs = '';
        }

        $cantRaw = rs_pick_mode($row['mode']['cantidad_dispensacion']);
        $cant = $cantRaw !== null ? (int)$cantRaw : 1;
        if ($cant <= 0) $cant = 1;

        $output[] = [
            'codigo' => (string)($row['codigo'] ?? ''),
            'nombre' => (string)($row['nombre'] ?? ''),
            'uso_count' => (int)($row['count'] ?? 0),
            'dosis' => (string)(rs_pick_mode($row['mode']['dosis']) ?? ''),
            'frecuencia_tipo' => $ft,
            'frecuencia_valor' => $fv,
            'frecuencia_horas' => $fh,
            'frecuencia' => $freq,
            'duracion_valor' => $dv,
            'duracion_unidad' => $du,
            'duracion' => $dur,
            'observaciones' => $obs,
            'cantidad_dispensacion' => $cant,
        ];
    }

    return $output;
}

function rs_enrich_with_catalog($conn, $items) {
    if (!is_array($items) || empty($items)) return [];

    $out = [];
    foreach ($items as $item) {
        $codigo = trim((string)($item['codigo'] ?? ''));
        $nombre = trim((string)($item['nombre'] ?? ''));

        $catalog = null;

        if ($codigo !== '') {
            $stmtCode = $conn->prepare('SELECT id, codigo, nombre, presentacion, concentracion, laboratorio, stock, estado FROM medicamentos WHERE codigo = ? ORDER BY id DESC LIMIT 1');
            if ($stmtCode) {
                $stmtCode->bind_param('s', $codigo);
                $stmtCode->execute();
                $catalog = $stmtCode->get_result()->fetch_assoc();
                $stmtCode->close();
            }
        }

        if (!$catalog && $nombre !== '') {
            $stmtName = $conn->prepare('SELECT id, codigo, nombre, presentacion, concentracion, laboratorio, stock, estado FROM medicamentos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1');
            if ($stmtName) {
                $stmtName->bind_param('s', $nombre);
                $stmtName->execute();
                $catalog = $stmtName->get_result()->fetch_assoc();
                $stmtName->close();
            }
        }

        $activo = $catalog ? rs_lower_trim($catalog['estado'] ?? 'activo') === 'activo' : false;

        $out[] = [
            'codigo' => $catalog ? (string)($catalog['codigo'] ?? $codigo) : $codigo,
            'nombre' => $catalog ? (string)($catalog['nombre'] ?? $nombre) : $nombre,
            'presentacion' => $catalog ? (string)($catalog['presentacion'] ?? '') : '',
            'concentracion' => $catalog ? (string)($catalog['concentracion'] ?? '') : '',
            'laboratorio' => $catalog ? (string)($catalog['laboratorio'] ?? '') : '',
            'stock' => $catalog ? (int)($catalog['stock'] ?? 0) : 0,
            'catalogo_id' => $catalog ? (int)($catalog['id'] ?? 0) : 0,
            'en_catalogo' => $catalog ? true : false,
            'activo' => $activo,
            'manual' => $catalog ? false : true,
            'uso_count' => (int)($item['uso_count'] ?? 0),
            'dosis' => (string)($item['dosis'] ?? ''),
            'frecuencia_tipo' => (string)($item['frecuencia_tipo'] ?? 'intervalo_horas'),
            'frecuencia_valor' => isset($item['frecuencia_valor']) ? (int)$item['frecuencia_valor'] : null,
            'frecuencia_horas' => is_array($item['frecuencia_horas'] ?? null) ? $item['frecuencia_horas'] : [],
            'frecuencia' => (string)($item['frecuencia'] ?? ''),
            'duracion_valor' => max(1, (int)($item['duracion_valor'] ?? 5)),
            'duracion_unidad' => (string)(($item['duracion_unidad'] ?? 'dias') === 'semanas' ? 'semanas' : 'dias'),
            'duracion' => (string)($item['duracion'] ?? ''),
            'observaciones' => (string)($item['observaciones'] ?? ''),
            'cantidad_dispensacion' => max(1, (int)($item['cantidad_dispensacion'] ?? 1)),
        ];
    }

    return $out;
}

$consultaId = rs_get_int_query('consulta_id', 0, 0, 1000000000);
$limit = rs_get_int_query('limit', 10, 3, 30);
$sample = rs_get_int_query('sample', 300, 50, 2000);

$medicoId = 0;
$especialidad = '';

if ($consultaId > 0) {
    $stmtCtx = $conn->prepare('SELECT c.medico_id, COALESCE(m.especialidad, "") AS especialidad FROM consultas c LEFT JOIN medicos m ON m.id = c.medico_id WHERE c.id = ? LIMIT 1');
    if ($stmtCtx) {
        $stmtCtx->bind_param('i', $consultaId);
        $stmtCtx->execute();
        $ctx = $stmtCtx->get_result()->fetch_assoc();
        $stmtCtx->close();
        $medicoId = (int)($ctx['medico_id'] ?? 0);
        $especialidad = trim((string)($ctx['especialidad'] ?? ''));
    }
}

$sqlBase = 'SELECT hc.datos, CONCAT(COALESCE(c.fecha, ""), " ", COALESCE(c.hora, "")) AS fecha_ref
            FROM historia_clinica hc
            INNER JOIN consultas c ON c.id = hc.consulta_id';

$bucketMedico = [];
if ($medicoId > 0) {
    $sqlMed = $sqlBase . ' WHERE c.medico_id = ? ORDER BY hc.id DESC LIMIT ?';
    $bucketMedico = rs_collect_bucket($conn, $sqlMed, 'ii', [$medicoId, $sample], $limit);
}

$bucketEspecialidad = [];
if ($especialidad !== '') {
    $espNorm = rs_lower_trim($especialidad);
    $sqlEsp = $sqlBase . ' INNER JOIN medicos m2 ON m2.id = c.medico_id WHERE LOWER(TRIM(COALESCE(m2.especialidad, ""))) = ? ORDER BY hc.id DESC LIMIT ?';
    $bucketEspecialidad = rs_collect_bucket($conn, $sqlEsp, 'si', [$espNorm, $sample], $limit);
}

$sqlGen = $sqlBase . ' ORDER BY hc.id DESC LIMIT ?';
$bucketGeneral = rs_collect_bucket($conn, $sqlGen, 'i', [$sample], $limit);

$bucketMedico = rs_enrich_with_catalog($conn, $bucketMedico);
$bucketEspecialidad = rs_enrich_with_catalog($conn, $bucketEspecialidad);
$bucketGeneral = rs_enrich_with_catalog($conn, $bucketGeneral);

echo json_encode([
    'success' => true,
    'contexto' => [
        'consulta_id' => $consultaId,
        'medico_id' => $medicoId,
        'especialidad' => $especialidad,
    ],
    'sugerencias' => [
        'medico' => $bucketMedico,
        'especialidad' => $bucketEspecialidad,
        'general' => $bucketGeneral,
    ],
]);
