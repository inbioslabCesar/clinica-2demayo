<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

// Obtener configuración de la clínica
$config_sql = "SELECT * FROM configuracion_clinica LIMIT 1";
$config_result = $conn->query($config_sql);
$clinica_config = $config_result->fetch_assoc() ?: [];

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
if ($id <= 0) {
    http_response_code(400);
    echo 'ID inválido';
    exit;
}

$stmt = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE id = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$res = $stmt->get_result();
$row = $res->fetch_assoc();
$stmt->close();

if (!$row) {
    http_response_code(404);
    echo 'Resultados no encontrados';
    exit;
}

$debugJson = isset($_GET['json']) && $_GET['json'] == '1';
if ($debugJson) {
    header('Content-Type: application/json');
    echo json_encode([
        'id' => $row['id'],
        'consulta_id' => $row['consulta_id'],
        'orden_id' => $row['orden_id'],
        'tipo_examen' => $row['tipo_examen'],
        'resultados' => json_decode($row['resultados'], true),
        'fecha' => $row['fecha']
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$orden = null;
if (!empty($row['orden_id'])) {
    $stmt = $conn->prepare('SELECT * FROM ordenes_laboratorio WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $row['orden_id']);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();
}
if (!$orden && !empty($row['consulta_id'])) {
    $stmt = $conn->prepare('SELECT * FROM ordenes_laboratorio WHERE consulta_id = ? LIMIT 1');
    $stmt->bind_param('i', $row['consulta_id']);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();
}

$paciente_nombre = '';
if (!empty($orden['paciente_id'])) {
    $stmt = $conn->prepare('SELECT nombre, apellido FROM pacientes WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $orden['paciente_id']);
    $stmt->execute();
    $p = $stmt->get_result()->fetch_assoc();
    if ($p) {
        $paciente_nombre = trim(($p['nombre'] ?? '') . ' ' . ($p['apellido'] ?? ''));
    }
    $stmt->close();
} elseif (!empty($row['consulta_id'])) {
    $stmt = $conn->prepare('SELECT p.nombre, p.apellido FROM consultas c JOIN pacientes p ON c.paciente_id = p.id WHERE c.id = ? LIMIT 1');
    $stmt->bind_param('i', $row['consulta_id']);
    $stmt->execute();
    $p = $stmt->get_result()->fetch_assoc();
    if ($p) {
        $paciente_nombre = trim(($p['nombre'] ?? '') . ' ' . ($p['apellido'] ?? ''));
    }
    $stmt->close();
}

$resultados_map = json_decode($row['resultados'], true) ?: [];
$examenes_ids = [];
if ($orden && !empty($orden['examenes'])) {
    $examenes_ids = json_decode($orden['examenes'], true);
    if (!is_array($examenes_ids)) {
        $examenes_ids = [];
    }
}

$examenes_detalle = [];
if (!empty($examenes_ids)) {
    $ids = array_map(function ($it) {
        return is_array($it) && isset($it['id']) ? intval($it['id']) : intval($it);
    }, $examenes_ids);
    $unique = array_values(array_unique(array_filter($ids)));
    if (!empty($unique)) {
        $placeholders = implode(',', array_fill(0, count($unique), '?'));
        $types = str_repeat('i', count($unique));
        $sql = "SELECT * FROM examenes_laboratorio WHERE id IN ($placeholders)";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$unique);
        $stmt->execute();
        $resEx = $stmt->get_result();
        while ($r = $resEx->fetch_assoc()) {
            $r['valores_referenciales'] = !empty($r['valores_referenciales'])
                ? (json_decode($r['valores_referenciales'], true) ?: [])
                : [];
            $examenes_detalle[$r['id']] = $r;
        }
        $stmt->close();
    }
}

function h($s) { return htmlspecialchars($s ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

$toNullableFloat = function ($val) {
    if ($val === null) return null;
    if (is_string($val)) {
        $val = trim($val);
        if ($val === '') return null;
        $val = str_replace(',', '.', $val);
    }
    return is_numeric($val) ? floatval($val) : null;
};

$normalizarSexo = function ($sexoValor) {
    $sx = strtolower(trim((string)$sexoValor));
    if ($sx === 'masculino' || $sx === 'm') return 'M';
    if ($sx === 'femenino' || $sx === 'f') return 'F';
    return '';
};

$getReferenciaAplicada = function (array $referencias, $sexoNorm, $edadNum) use ($toNullableFloat) {
    if (empty($referencias)) return null;
    $candidatas = [];
    foreach ($referencias as $ref) {
        $okSexo = true;
        if (!empty($ref['sexo'])) {
            $sx = strtolower(trim((string)$ref['sexo']));
            if ($sx === 'masculino' || $sx === 'm') $sx = 'M';
            elseif ($sx === 'femenino' || $sx === 'f') $sx = 'F';
            if ($sx === 'M' || $sx === 'F') {
                $okSexo = ($sexoNorm !== '' && $sx === $sexoNorm);
            }
        }

        $okEdad = true;
        $edadMin = $toNullableFloat($ref['edad_min'] ?? null);
        $edadMax = $toNullableFloat($ref['edad_max'] ?? null);
        if ($edadNum !== null) {
            if ($edadMin !== null && $edadNum < $edadMin) $okEdad = false;
            if ($edadMax !== null && $edadNum > $edadMax) $okEdad = false;
        }

        if ($okSexo && $okEdad) {
            $candidatas[] = $ref;
        }
    }
    if (!empty($candidatas)) return $candidatas[0];
    return $referencias[0];
};

$firmante_nombre = trim((string)($clinica_config['director_general'] ?? $clinica_config['director_nombre'] ?? ''));
$firmante_cargo = trim((string)($clinica_config['director_cargo'] ?? ''));
$firmante_colegiatura = trim((string)($clinica_config['colegio_profesional'] ?? ''));
$firmante_firma = '';
$firmanteUsuarioAplicado = false;
$rolesFirmantesLaboratorio = ['laboratorista', 'quimico', 'químico'];

$firmadoPorUsuarioId = isset($row['firmado_por_usuario_id']) ? intval($row['firmado_por_usuario_id']) : 0;
if ($firmadoPorUsuarioId > 0) {
    $stmt_firmante = $conn->prepare('SELECT nombre, rol, profesion, cargo_firma, colegiatura_tipo, colegiatura_numero, firma_reportes FROM usuarios WHERE id = ? LIMIT 1');
    if ($stmt_firmante) {
        $stmt_firmante->bind_param('i', $firmadoPorUsuarioId);
        $stmt_firmante->execute();
        $firmante_usuario = $stmt_firmante->get_result()->fetch_assoc();
        $stmt_firmante->close();

        if ($firmante_usuario) {
            $rolFirmante = strtolower(trim((string)($firmante_usuario['rol'] ?? '')));
            $firmanteEsValido = in_array($rolFirmante, $rolesFirmantesLaboratorio, true);
            if (!$firmanteEsValido) {
                $firmante_usuario = null;
            }
        }

        if ($firmante_usuario) {
            $nombreUsuario = trim((string)($firmante_usuario['nombre'] ?? ''));
            $cargoUsuario = trim((string)($firmante_usuario['cargo_firma'] ?? ''));
            $profesionUsuario = trim((string)($firmante_usuario['profesion'] ?? ''));
            $colegiaturaTipo = trim((string)($firmante_usuario['colegiatura_tipo'] ?? ''));
            $colegiaturaNumero = trim((string)($firmante_usuario['colegiatura_numero'] ?? ''));
            $firmaUsuario = trim((string)($firmante_usuario['firma_reportes'] ?? ''));

            if ($nombreUsuario !== '') {
                $firmante_nombre = $nombreUsuario;
            }
            if ($cargoUsuario !== '') {
                $firmante_cargo = $cargoUsuario;
            } elseif ($profesionUsuario !== '') {
                $firmante_cargo = $profesionUsuario;
            }

            if ($colegiaturaTipo !== '' || $colegiaturaNumero !== '') {
                $firmante_colegiatura = trim($colegiaturaTipo . ' ' . $colegiaturaNumero);
            }

            if ($firmaUsuario !== '' && preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firmaUsuario)) {
                $firmante_firma = $firmaUsuario;
            }

            $firmanteUsuarioAplicado = true;
        }
    }
}

if (!$firmanteUsuarioAplicado) {
    $stmt_fallback_firmante = $conn->prepare(
        "SELECT nombre, profesion, cargo_firma, colegiatura_tipo, colegiatura_numero, firma_reportes
         FROM usuarios
         WHERE rol IN ('laboratorista', 'quimico', 'químico')
         ORDER BY
            CASE WHEN firma_reportes IS NOT NULL AND TRIM(firma_reportes) <> '' THEN 0 ELSE 1 END,
            id ASC
         LIMIT 1"
    );
    if ($stmt_fallback_firmante) {
        $stmt_fallback_firmante->execute();
        $fallback_firmante = $stmt_fallback_firmante->get_result()->fetch_assoc();
        $stmt_fallback_firmante->close();

        if ($fallback_firmante) {
            $nombreFallback = trim((string)($fallback_firmante['nombre'] ?? ''));
            $cargoFallback = trim((string)($fallback_firmante['cargo_firma'] ?? ''));
            $profesionFallback = trim((string)($fallback_firmante['profesion'] ?? ''));
            $colegiaturaTipoFallback = trim((string)($fallback_firmante['colegiatura_tipo'] ?? ''));
            $colegiaturaNumeroFallback = trim((string)($fallback_firmante['colegiatura_numero'] ?? ''));
            $firmaFallback = trim((string)($fallback_firmante['firma_reportes'] ?? ''));

            if ($nombreFallback !== '') {
                $firmante_nombre = $nombreFallback;
            }
            if ($cargoFallback !== '') {
                $firmante_cargo = $cargoFallback;
            } elseif ($profesionFallback !== '') {
                $firmante_cargo = $profesionFallback;
            }
            if ($colegiaturaTipoFallback !== '' || $colegiaturaNumeroFallback !== '') {
                $firmante_colegiatura = trim($colegiaturaTipoFallback . ' ' . $colegiaturaNumeroFallback);
            }
            if ($firmaFallback !== '' && preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firmaFallback)) {
                $firmante_firma = $firmaFallback;
            }
        }
    }
}

if ($firmante_firma === '' && !empty($clinica_config['firma_url'])) {
    $firma_path = __DIR__ . '/' . ltrim($clinica_config['firma_url'], './');
    if (file_exists($firma_path)) {
        $firma_data = base64_encode(file_get_contents($firma_path));
        $firma_ext = strtolower((string)pathinfo($firma_path, PATHINFO_EXTENSION));
        $firma_mime = ($firma_ext === 'jpg' || $firma_ext === 'jpeg') ? 'image/jpeg' : (($firma_ext === 'png') ? 'image/png' : 'image/png');
        $firmante_firma = 'data:' . $firma_mime . ';base64,' . $firma_data;
    }
}
// Datos adicionales de paciente
$paciente_dni = '';
$historia_clinica = '';
$fecha_nacimiento = '';
$sexo = '';
$edad = '';
$edad_unidad = 'años';
$medico_solicitante = '';
$tipo_solicitud = '';

if (!empty($row['orden_id']) || !empty($row['consulta_id'])) {
    $pac_data = null;

    if (!empty($row['orden_id'])) {
        $paciente_sql = "SELECT p.dni, p.historia_clinica, p.fecha_nacimiento, p.sexo, p.edad, p.edad_unidad,
                                o.consulta_id, c.medico_id,
                                CASE WHEN o.consulta_id IS NOT NULL THEN 'Médico' ELSE 'Particular' END as tipo_solicitud
                         FROM pacientes p
                         INNER JOIN ordenes_laboratorio o ON p.id = o.paciente_id
                         LEFT JOIN consultas c ON o.consulta_id = c.id
                         WHERE o.id = ? LIMIT 1";
        $stmt_pac = $conn->prepare($paciente_sql);
        $stmt_pac->bind_param("i", $row['orden_id']);
        $stmt_pac->execute();
        $pac_data = $stmt_pac->get_result()->fetch_assoc();
        $stmt_pac->close();
    }

    if (!$pac_data && !empty($row['consulta_id'])) {
        $paciente_sql = "SELECT p.dni, p.historia_clinica, p.fecha_nacimiento, p.sexo, p.edad, p.edad_unidad,
                                c.id as consulta_id, c.medico_id,
                                'Médico' as tipo_solicitud
                         FROM consultas c
                         INNER JOIN pacientes p ON c.paciente_id = p.id
                         WHERE c.id = ? LIMIT 1";
        $stmt_pac = $conn->prepare($paciente_sql);
        $stmt_pac->bind_param("i", $row['consulta_id']);
        $stmt_pac->execute();
        $pac_data = $stmt_pac->get_result()->fetch_assoc();
        $stmt_pac->close();
    }

    if ($pac_data) {
        $paciente_dni = $pac_data['dni'] ?? '';
        $historia_clinica = $pac_data['historia_clinica'] ?? '';
        $fecha_nacimiento = $pac_data['fecha_nacimiento'] ?? '';
        $sexo = $pac_data['sexo'] ?? '';
        $edad = $pac_data['edad'] ?? '';
        $edad_unidad = $pac_data['edad_unidad'] ?? 'años';
        $tipo_solicitud = $pac_data['tipo_solicitud'] ?? '';

        if (!empty($pac_data['medico_id'])) {
            $medico_sql = "SELECT CONCAT(nombre, ' ', apellido) as nombre_completo FROM medicos WHERE id = ? LIMIT 1";
            $stmt_med = $conn->prepare($medico_sql);
            $stmt_med->bind_param("i", $pac_data['medico_id']);
            $stmt_med->execute();
            $med_data = $stmt_med->get_result()->fetch_assoc();
            $stmt_med->close();
            $medico_solicitante = $med_data['nombre_completo'] ?? '';
        }
    }
}

// Resolver logo
$isProduction = (
    (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
    (isset($_SERVER['HTTP_HOST']) && strpos($_SERVER['HTTP_HOST'], 'clinica2demayo.com') !== false) ||
    (isset($_SERVER['SERVER_NAME']) && strpos($_SERVER['SERVER_NAME'], 'clinica2demayo.com') !== false) ||
    (isset($_SERVER['HTTP_HOST']) && strpos($_SERVER['HTTP_HOST'], 'hostingersite.com') !== false)
);

$logo_paths = [];
$logo_config_value = '';
foreach (['logo_laboratorio_url', 'logo_resultados_laboratorio_url', 'logo_resultados_url', 'logo_url'] as $logo_key) {
    if (!empty($clinica_config[$logo_key])) {
        $logo_config_value = (string)$clinica_config[$logo_key];
        break;
    }
}

if ($logo_config_value !== '') {
    $logo_paths[] = __DIR__ . '/' . ltrim($logo_config_value, './');
    $logo_paths[] = ltrim($logo_config_value, './');
}
if ($isProduction) {
    $logo_paths[] = 'uploads/logo_1760763858_7b2d4d55a879.png';
    $logo_paths[] = '2demayo.svg';
    $logo_paths[] = __DIR__ . '/uploads/logo_1760763858_7b2d4d55a879.png';
    $logo_paths[] = __DIR__ . '/2demayo.svg';
} else {
    $logo_paths[] = 'public/2demayo.svg';
    $logo_paths[] = '2demayo.svg';
    $logo_paths[] = __DIR__ . '/public/2demayo.svg';
    $logo_paths[] = __DIR__ . '/2demayo.svg';
}

$logo_size_pdf = 130;
foreach (['logo_laboratorio_size_pdf', 'logo_resultados_size_pdf', 'logo_size_pdf'] as $logo_size_key) {
    if (isset($clinica_config[$logo_size_key]) && $clinica_config[$logo_size_key] !== null && $clinica_config[$logo_size_key] !== '') {
        $logo_size_pdf = intval($clinica_config[$logo_size_key]);
        break;
    }
}
if ($logo_size_pdf < 40) $logo_size_pdf = 40;
if ($logo_size_pdf > 260) $logo_size_pdf = 260;
$logo_max_height = intval(round($logo_size_pdf * 0.60));
if ($logo_max_height < 30) $logo_max_height = 30;

$logo_html_header = '<div style="display:block;width:' . $logo_size_pdf . 'px;text-align:center;margin:0;font-size:12px;font-weight:bold;color:#2c3e50;line-height:1.2;">'
    . h($clinica_config['nombre_clinica'] ?? 'Mi Clínica')
    . '</div>';
foreach ($logo_paths as $logo_path) {
    if (!file_exists($logo_path)) continue;
    $logo_data = base64_encode(file_get_contents($logo_path));
    $logo_ext = strtolower((string)pathinfo($logo_path, PATHINFO_EXTENSION));
    $logo_mime = 'image/png';
    if ($logo_ext === 'svg') $logo_mime = 'image/svg+xml';
    elseif ($logo_ext === 'jpg' || $logo_ext === 'jpeg') $logo_mime = 'image/jpeg';
    elseif ($logo_ext === 'png') $logo_mime = 'image/png';
    $logo_html_header = '<div style="display:block;width:' . $logo_size_pdf . 'px;text-align:center;margin:0;">'
        . '<img src="data:' . $logo_mime . ';base64,' . $logo_data . '" alt="Logo" style="max-height:' . $logo_max_height . 'px;max-width:' . $logo_size_pdf . 'px;display:block;margin:0 auto;">'
        . '</div>';
    break;
}

// Construir contenido de resultados
$hayFueraRango = false;
$rowsHtml = '';
$examenesImpresos = 0;

if (empty($examenes_detalle)) {
    $rowsHtml .= '<tr><td colspan="5" style="padding:8px;"><pre style="margin:0;white-space:pre-wrap;">' . h(json_encode($resultados_map, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) . '</pre></td></tr>';
} else {
    foreach ($examenes_detalle as $exId => $ex) {
        $imprimirExamen = $resultados_map[$exId . '__imprimir_examen'] ?? 1;
        $imprimirExamenNorm = is_string($imprimirExamen) ? strtolower(trim($imprimirExamen)) : $imprimirExamen;
        if (
            $imprimirExamenNorm === 0 ||
            $imprimirExamenNorm === '0' ||
            $imprimirExamenNorm === false ||
            $imprimirExamenNorm === 'false' ||
            $imprimirExamenNorm === 'no'
        ) {
            continue;
        }

        $examenesImpresos++;

        if (!empty($ex['valores_referenciales'])) {
            foreach ($ex['valores_referenciales'] as $param) {
                $tipo = $param['tipo'] ?? 'Parámetro';
                $tipoNorm = strtolower(trim((string)$tipo));
                $tipoNorm = str_replace(['á','é','í','ó','ú'], ['a','e','i','o','u'], $tipoNorm);
                $nombre_param = $param['nombre'] ?? '';

                if ($tipoNorm === 'titulo' || $tipoNorm === 'subtitulo') {
                    $rowsHtml .= '<tr><td colspan="5" style="background:#edf2f7;color:#1f2937;font-weight:bold;text-align:left;padding:6px 8px;border-top:1px solid #d6deea;">' . h($nombre_param) . '</td></tr>';
                    continue;
                }

                if ($tipoNorm === 'texto largo') {
                    $keyTexto = $exId . '__' . $nombre_param;
                    $valorTexto = isset($resultados_map[$keyTexto]) ? $resultados_map[$keyTexto] : '';
                    $rowsHtml .= '<tr><td colspan="5" style="padding:6px 8px;">'
                        . '<div style="font-weight:bold; margin-bottom:3px;">' . h($nombre_param) . '</div>'
                        . '<div>' . nl2br(h((string)$valorTexto)) . '</div>'
                        . '</td></tr>';
                    continue;
                }

                $nombre = $param['nombre'] ?? '';
                $metodo = $param['metodologia'] ?? '';
                $unidad = $param['unidad'] ?? '';
                $key = $exId . '__' . $nombre;
                $valor = isset($resultados_map[$key]) ? $resultados_map[$key] : '';
                $valorNum = $toNullableFloat($valor);

                $edadPaciente = $toNullableFloat($edad);
                $sexoPaciente = $normalizarSexo($sexo);
                $referenciasLista = (!empty($param['referencias']) && is_array($param['referencias'])) ? $param['referencias'] : [];
                $referenciaAplicada = $getReferenciaAplicada($referenciasLista, $sexoPaciente, $edadPaciente);

                $minRef = $referenciaAplicada ? $toNullableFloat($referenciaAplicada['valor_min'] ?? null) : null;
                $maxRef = $referenciaAplicada ? $toNullableFloat($referenciaAplicada['valor_max'] ?? null) : null;

                if ($minRef === null && $maxRef === null && $referenciaAplicada && !empty($referenciaAplicada['valor'])) {
                    $txt = str_replace(',', '.', (string)$referenciaAplicada['valor']);
                    if (preg_match('/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|a|hasta|entre|y)\s*(-?\d+(?:\.\d+)?)/i', $txt, $mRango)) {
                        $minRef = floatval($mRango[1]);
                        $maxRef = floatval($mRango[2]);
                    }
                }

                $fueraRango = false;
                if ($valor !== '' && $valorNum !== null) {
                    if ($minRef !== null && $valorNum < $minRef) $fueraRango = true;
                    if ($maxRef !== null && $valorNum > $maxRef) $fueraRango = true;
                }

                $valorMostrar = (string)$valor;
                if ($valor !== '' && $valorNum !== null) {
                    if (isset($param['decimales']) && $param['decimales'] !== '' && is_numeric($param['decimales'])) {
                        $valorMostrar = number_format($valorNum, intval($param['decimales']), '.', ',');
                    } elseif (floor($valorNum) == $valorNum) {
                        $valorMostrar = number_format($valorNum, 0, '.', ',');
                    }
                }
                if ($fueraRango && $valorMostrar !== '') {
                    $hayFueraRango = true;
                    $valorMostrar = '* ' . $valorMostrar;
                }

                $refs = '';
                if (!empty($param['referencias']) && is_array($param['referencias'])) {
                    $parts = [];
                    foreach ($param['referencias'] as $r) {
                        if (!empty($r['valor_min']) && !empty($r['valor_max'])) {
                            $parts[] = '• ' . h($r['valor_min']) . '-' . h($r['valor_max']);
                        } elseif (!empty($r['valor'])) {
                            $parts[] = '• ' . h($r['valor']);
                        }
                    }
                    $refs = implode('<br>', $parts);
                }

                $rowsHtml .= '<tr>'
                    . '<td style="padding:5px 7px;font-weight:bold;">' . h($nombre) . '</td>'
                    . '<td style="padding:5px 7px;text-align:center;color:#374151;">' . h($metodo) . '</td>'
                    . '<td style="padding:5px 7px;text-align:center;font-weight:bold;color:#111827;">' . h((string)$valorMostrar) . '</td>'
                    . '<td style="padding:5px 7px;text-align:center;color:#374151;">' . h($unidad) . '</td>'
                    . '<td style="padding:5px 7px;color:#374151;">' . $refs . '</td>'
                    . '</tr>';
            }
        } else {
            $rawKey = (string)$exId;
            $val = isset($resultados_map[$rawKey]) ? $resultados_map[$rawKey] : null;
            $rowsHtml .= '<tr><td colspan="5" style="padding:6px 8px;">'
                . ($val !== null && $val !== '' ? nl2br(h((string)$val)) : 'No hay resultados registrados para este examen.')
                . '</td></tr>';
        }
    }

    if ($examenesImpresos === 0) {
        $rowsHtml .= '<tr><td colspan="5" style="padding:8px;text-align:center;color:#6b7280;">No hay exámenes marcados para imprimir.</td></tr>';
    }
}

$bodyCss = '<style>
body { font-family: dejavusanscondensed, DejaVu Sans, Arial, sans-serif; font-size: 11px; color: #1f2937; }
.results-title { font-family: Courier, "Courier New", monospace; font-size: 13px; font-weight: bold; letter-spacing: 0.2px; color: #1f2937; margin: 8px 0 8px 0; text-transform: uppercase; text-align: center; }
.results-table { width: 100%; border-collapse: collapse; border: 1px solid #d5dbe1; }
.results-table thead { display: table-header-group; }
.results-table th { font-family: Courier, "Courier New", monospace; background: #eaf0f7; color: #111827; border-bottom: 1px solid #d5dbe1; padding: 8px 7px; font-size: 10.6px; text-align: left; letter-spacing: 0.15px; }
.results-table td { font-family: Courier, "Courier New", monospace; border-bottom: 1px solid #e5e7eb; padding: 5px 7px; font-size: 10.8px; vertical-align: top; line-height: 1.15; }
.results-table tr { page-break-inside: avoid; }
.results-table tbody tr:nth-child(even) td { background: #fcfdff; }
</style>';

$bodyHtml = '<div class="results-title">Resultados de laboratorio</div><table class="results-table">'
    . '<thead><tr>'
    . '<th style="width:30%;">Examen / Parámetro</th><th style="width:18%;text-align:center;">Metodología</th><th style="width:14%;text-align:center;">Resultado</th><th style="width:12%;text-align:center;">Unidades</th><th style="width:26%;">Valores de Referencia</th>'
    . '</tr></thead><tbody>'
    . $rowsHtml
    . '</tbody></table>';

// Firma HTML
$signatureHtml = '';
$signatureHtml .= '<div style="display:inline-block;min-width:175px;max-width:210px;text-align:center;">';
if (!empty($firmante_firma) && preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firmante_firma)) {
    $signatureHtml .= '<img src="' . $firmante_firma . '" alt="Firma" style="display:block;max-height:68px;max-width:165px;margin:5px auto -6px auto;">';
}
$signatureHtml .= '<hr style="border:0;border-top:2.2px solid #000;width:172px;margin:0 auto 5px auto;height:0;">';
if ($firmante_nombre !== '') $signatureHtml .= '<div style="font-size:9.2px;font-weight:bold;line-height:1.15;letter-spacing:0.2px;text-transform:uppercase;">' . h($firmante_nombre) . '</div>';
if ($firmante_cargo !== '') $signatureHtml .= '<div style="font-size:8.8px;line-height:1.15;">' . h($firmante_cargo) . '</div>';
if ($firmante_colegiatura !== '') $signatureHtml .= '<div style="font-size:8.8px;line-height:1.15;">' . h($firmante_colegiatura) . '</div>';
$signatureHtml .= '</div>';

// Header mPDF
$headerHtml = '<div style="font-family:dejavusanscondensed, DejaVu Sans, Arial, sans-serif; border-bottom:1px solid #cfd8e3; padding-bottom:6px; margin-bottom:8px;">'
    . '<table width="100%" style="border-collapse:collapse;">'
    . '<tr>'
    . '<td width="45%" style="vertical-align:top;text-align:left;padding-right:0;">' . $logo_html_header . '</td>'
    . '<td width="55%" style="vertical-align:top;text-align:right;font-family:DejaVu Serif, Georgia, serif;">'
    . '<div style="font-family:DejaVu Serif, Georgia, serif;font-size:17px;font-weight:bold;letter-spacing:0.25px;color:#2c3e50;">' . h($clinica_config['nombre_clinica'] ?? 'Laboratorio Clínico') . '</div>'
    . (!empty($clinica_config['direccion']) ? '<div style="font-size:9.8px;color:#475569;letter-spacing:0.1px;"><span style="font-weight:700;">Dirección:</span> ' . h($clinica_config['direccion']) . '</div>' : '')
    . (!empty($clinica_config['telefono']) ? '<div style="font-size:9.8px;color:#475569;letter-spacing:0.1px;"><span style="font-weight:700;">Teléfono:</span> ' . h($clinica_config['telefono']) . '</div>' : '')
    . (!empty($clinica_config['email']) ? '<div style="font-size:9.8px;color:#475569;letter-spacing:0.1px;"><span style="font-weight:700;">Email:</span> ' . h($clinica_config['email']) . '</div>' : '')
    . '</td></tr></table>'
    . '</div>'
    . '<div style="background:#f7fafc; padding:8px 9px; border:1px solid #d7dee8; border-radius:4px; font-size:11.8px;">'
    . '<table width="100%" style="border-collapse:collapse;"><tr>'
    . '<td width="50%" style="vertical-align:top;line-height:1.18;font-size:11.8px;">'
    . '<div style="font-size:11.8px;"><span style="font-weight:600;">Paciente:</span> ' . h($paciente_nombre) . '</div>'
    . ($paciente_dni ? '<div style="font-size:11.8px;"><span style="font-weight:600;">DNI:</span> ' . h($paciente_dni) . '</div>' : '')
    . ($historia_clinica ? '<div style="font-size:11.8px;"><span style="font-weight:600;">Historia Clínica:</span> ' . h($historia_clinica) . '</div>' : '')
    . '<div style="font-size:11.8px;"><span style="font-weight:600;">Edad:</span> ' . h($edad ? ($edad . ' ' . $edad_unidad) : 'N/A') . '</div>'
    . '</td>'
    . '<td width="50%" style="vertical-align:top;line-height:1.17;font-size:11.8px;">'
    . ($sexo ? '<div style="font-size:11.8px;"><span style="font-weight:600;">Sexo:</span> ' . h($sexo) . '</div>' : '')
    . ($fecha_nacimiento ? '<div style="font-size:11.8px;"><span style="font-weight:600;">Fecha Nac.:</span> ' . h($fecha_nacimiento) . '</div>' : '')
    . '<div style="font-size:11.8px;"><span style="font-weight:600;">Fecha Examen:</span> ' . h($row['fecha']) . '</div>'
    . ($tipo_solicitud ? '<div style="font-size:11.8px;"><span style="font-weight:600;">Referencia:</span> ' . h($tipo_solicitud) . '</div>' : '')
    . (($tipo_solicitud === 'Médico' && $medico_solicitante) ? '<div style="font-size:11.8px;"><span style="font-weight:600;">Médico:</span> ' . h($medico_solicitante) . '</div>' : '')
    . '</td></tr></table>'
    . '</div>';

// Footer mPDF
$footerLeftHtml = '';
$footerLeftLineStyle = 'font-size:10.2px;line-height:1.2;color:#334155;';
$horarioRaw = trim((string)($clinica_config['horario_atencion'] ?? ''));
if ($horarioRaw !== '') {
    $footerLeftHtml .= '<div style="' . $footerLeftLineStyle . '"><strong>Horario de Atención:</strong></div>';
    foreach (preg_split('/\r\n|\r|\n/', $horarioRaw) as $lineaHorario) {
        $lineaHorario = trim((string)$lineaHorario);
        if ($lineaHorario !== '') $footerLeftHtml .= '<div style="' . $footerLeftLineStyle . '">' . h($lineaHorario) . '</div>';
    }
}
$websiteRaw = trim((string)($clinica_config['website'] ?? ''));
if ($websiteRaw !== '') $footerLeftHtml .= '<div style="' . $footerLeftLineStyle . '"><strong>Website:</strong> ' . h($websiteRaw) . '</div>';
if ($hayFueraRango) $footerLeftHtml .= '<div style="' . $footerLeftLineStyle . '">* El asterisco indica resultado fuera del rango de referencia.</div>';

$footerHtml = '<div style="font-family:dejavusanscondensed, DejaVu Sans, Arial, sans-serif;font-size:8.6px;color:#4b5563;">'
    . '<table width="100%" style="border-collapse:collapse;">'
    . '<tr>'
    . '<td width="72%" style="height:92px;">&nbsp;</td>'
    . '<td width="28%" style="height:92px;text-align:center;vertical-align:top;"><div style="padding-top:26px;">' . $signatureHtml . '</div></td>'
    . '</tr>'
    . '</table>'
    . '<div style="border-top:1px solid #d1d9e4; margin-top:2px; padding-top:6px;"></div>'
    . '<table width="100%" style="border-collapse:collapse;">'
    . '<tr>'
    . '<td width="72%" style="vertical-align:top;line-height:1.12;">' . $footerLeftHtml . '</td>'
    . '<td width="28%" style="vertical-align:top;">&nbsp;</td>'
    . '</tr>'
    . '</table>'
    . '<div style="margin-top:1px;text-align:right;font-size:7.6px;color:#6b7280;">Página {PAGENO} de {nbpg}</div>'
    . '</div>';

// Intentar generar PDF con mPDF
$autoloadCandidates = [
    __DIR__ . '/vendor/autoload.php',
    dirname(__DIR__) . '/base-php/vendor/autoload.php'
];
foreach ($autoloadCandidates as $autoloadFile) {
    if (file_exists($autoloadFile)) require_once $autoloadFile;
}

// Format: resultados_laboratorio_[nombre_paciente]_[fecha_descarga].pdf
// Example: resultados_laboratorio_Juan_Perez_02-04-2026.pdf
$descarga_fecha = date('d-m-Y');
$filename = 'resultados_laboratorio_' . ($paciente_nombre ? preg_replace('/[^a-zA-Z0-9]/', '_', $paciente_nombre) . '_' : '') . $descarga_fecha . '.pdf';

// Evita fallos de mPDF con reportes grandes (PCRE backtracking/recursion limits).
@ini_set('pcre.backtrack_limit', '10000000');
@ini_set('pcre.recursion_limit', '10000000');

$mpdfTempDir = __DIR__ . '/tmp/mpdf';
if (!is_dir($mpdfTempDir)) {
    @mkdir($mpdfTempDir, 0775, true);
}

if (class_exists('\Mpdf\Mpdf')) {
    try {
        $mpdf = new \Mpdf\Mpdf([
            'mode' => 'utf-8',
            'format' => 'A4',
            'default_font' => 'dejavusanscondensed',
            'margin_left' => 8,
            'margin_right' => 8,
            'margin_top' => 66,
            'margin_bottom' => 54,
            'tempDir' => $mpdfTempDir,
        ]);

        $mpdf->SetHTMLHeader($headerHtml);
        $mpdf->SetHTMLFooter($footerHtml);
        $mpdf->WriteHTML($bodyCss, \Mpdf\HTMLParserMode::HEADER_CSS);
        $mpdf->WriteHTML($bodyHtml, \Mpdf\HTMLParserMode::HTML_BODY);

        $pdfOutput = $mpdf->Output('', 'S');
        if (ob_get_length()) { @ob_end_clean(); }
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($pdfOutput));
        header('Cache-Control: private, max-age=0, must-revalidate');
        header('Pragma: public');
        echo $pdfOutput;
        flush();
        exit;
    } catch (Exception $e) {
        $logDir = __DIR__ . '/tmp';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0775, true);
        }
        @file_put_contents($logDir . '/mpdf_error.log', date('Y-m-d H:i:s') . ' First mPDF error: ' . $e->getMessage() . PHP_EOL, FILE_APPEND);

        // Segundo intento con configuración mínima para evitar fallback HTML por errores de layout/fuente.
        try {
            $mpdf = new \Mpdf\Mpdf([
                'mode' => 'utf-8',
                'format' => 'A4',
                'tempDir' => $mpdfTempDir,
            ]);

            $mpdf->SetHTMLHeader($headerHtml);
            $mpdf->SetHTMLFooter($footerHtml);
            $mpdf->WriteHTML($bodyCss, \Mpdf\HTMLParserMode::HEADER_CSS);
            $mpdf->WriteHTML($bodyHtml, \Mpdf\HTMLParserMode::HTML_BODY);

            $pdfOutput = $mpdf->Output('', 'S');
            if (ob_get_length()) { @ob_end_clean(); }
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($pdfOutput));
            header('Cache-Control: private, max-age=0, must-revalidate');
            header('Pragma: public');
            echo $pdfOutput;
            flush();
            exit;
        } catch (Exception $e2) {
            @file_put_contents($logDir . '/mpdf_error.log', date('Y-m-d H:i:s') . ' Second mPDF error: ' . $e2->getMessage() . PHP_EOL, FILE_APPEND);
            // fallback HTML
        }
    }
}

// Fallback: HTML simple
if (ob_get_length()) { @ob_end_clean(); }
header('Content-Type: text/html; charset=utf-8');
$fallbackCss = '<style>
* { box-sizing: border-box; }
body {
    margin: 0;
    background: #eef2f7;
    color: #1f2937;
    font-family: Arial, sans-serif;
}
.report-page {
    width: 210mm;
    min-height: 297mm;
    margin: 12px auto;
    background: #fff;
    box-shadow: 0 0 0 1px #d8e0ea, 0 12px 28px rgba(15, 23, 42, .12);
    padding: 10mm 9mm;
    display: flex;
    flex-direction: column;
}
.report-content { flex: 1 1 auto; }
.report-footer {
    margin-top: auto;
    flex-shrink: 0;
    page-break-inside: avoid;
}
.report-actions {
    width: 210mm;
    margin: 12px auto 0 auto;
    text-align: right;
}
.print-btn {
    border: 0;
    background: #2563eb;
    color: #fff;
    padding: 8px 14px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
}
.print-btn:hover { background: #1d4ed8; }
@media print {
    @page { size: A4; margin: 8mm; }
    html, body {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        padding: 0;
        background: #fff;
    }
    .report-actions { display: none; }
    .report-page {
        width: 194mm;
        min-height: 281mm;
        margin: 0;
        padding: 0;
        box-shadow: none;
    }
    .report-content {
        flex: 1 1 auto;
        min-height: 0;
    }
    .report-footer {
        margin-top: auto;
    }
}
</style>';

echo '<!doctype html><html><head><meta charset="utf-8"><title>Resultados</title>' . $fallbackCss . '</head><body>'
    . '<div class="report-actions"><button class="print-btn" onclick="window.print()">Imprimir</button></div>'
    . '<div class="report-page">'
    . '<div class="report-content">' . $headerHtml . $bodyCss . $bodyHtml . '</div>'
    . '<div class="report-footer">' . $footerHtml . '</div>'
    . '</div>'
    . '</body></html>';
exit;
