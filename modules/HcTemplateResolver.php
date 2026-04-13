<?php

if (!function_exists('hc_table_exists')) {
    function hc_table_exists($conn, $table) {
        static $cache = [];
        $key = "tbl::$table";
        if (isset($cache[$key])) {
            return $cache[$key];
        }

        $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res && $res->num_rows > 0;
        $stmt->close();
        $cache[$key] = $exists;
        return $exists;
    }
}

function hc_slugify_text($value) {
    $value = trim((string)$value);
    if ($value === '') return '';

    $value = strtolower($value);
    $map = [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
        'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u',
        'ä' => 'a', 'ë' => 'e', 'ï' => 'i', 'ö' => 'o', 'ü' => 'u',
        'ñ' => 'n'
    ];
    $value = strtr($value, $map);
    $value = preg_replace('/[^a-z0-9]+/', '_', $value);
    $value = preg_replace('/_+/', '_', $value);
    return trim((string)$value, '_');
}

function hc_specialty_match_key($value) {
    $slug = hc_slugify_text($value);
    if ($slug === '') return '';

    $rules = [
        '/ologia$/' => 'olog',
        '/ologo$/' => 'olog',
        '/ologa$/' => 'olog',
        '/iatria$/' => 'iatr',
        '/iatra$/' => 'iatr',
        '/ismo$/' => 'ism',
        '/ista$/' => 'ist',
        '/ico$/' => 'ic',
        '/ica$/' => 'ic',
    ];

    foreach ($rules as $pattern => $replacement) {
        $reduced = preg_replace($pattern, $replacement, $slug);
        if (is_string($reduced) && $reduced !== $slug && strlen($reduced) >= 5) {
            $slug = $reduced;
            break;
        }
    }

    return $slug;
}

function hc_get_builtin_templates() {
    return [
        'medicina_general' => [
            'id' => 'medicina_general',
            'version' => '2026.04.01',
            'nombre' => 'Medicina General',
            'schema_version' => '2.0',
            'sections' => [
                'anamnesis' => [
                    'tiempo_enfermedad' => '',
                    'forma_inicio' => '',
                    'curso' => '',
                ],
                'antecedentes' => [
                    'antecedentes' => '',
                ],
                'examen_fisico' => [
                    'examen_fisico' => '',
                ],
            ],
        ],
        'ginecologia' => [
            'id' => 'ginecologia',
            'version' => '2026.04.01',
            'nombre' => 'Ginecologia',
            'schema_version' => '2.0',
            'sections' => [
                'anamnesis' => [
                    'tiempo_enfermedad' => '',
                    'forma_inicio' => '',
                    'curso' => '',
                ],
                'gineco_obstetricos' => [
                    'fur' => '',
                    'gestas' => '',
                    'partos' => '',
                    'cesareas' => '',
                ],
                'examen_fisico' => [
                    'examen_fisico' => '',
                ],
            ],
        ],
        'pediatria' => [
            'id' => 'pediatria',
            'version' => '2026.04.01',
            'nombre' => 'Pediatria',
            'schema_version' => '2.0',
            'sections' => [
                'anamnesis' => [
                    'tiempo_enfermedad' => '',
                    'forma_inicio' => '',
                    'curso' => '',
                ],
                'antecedentes' => [
                    'vacunas_completas' => '',
                    'alergias' => '',
                    'antecedentes' => '',
                ],
                'crecimiento' => [
                    'peso' => '',
                    'talla' => '',
                    'imc' => '',
                ],
            ],
        ],
        // Plantilla especial: cuando el admin la guarda en DB, se usa para TODAS las
        // consultas independientemente de la especialidad del medico.
        'default' => [
            'id' => 'default',
            'version' => '2026.04.01',
            'nombre' => 'Por defecto',
            'schema_version' => '2.0',
            'sections' => [
                'anamnesis' => [
                    'tiempo_enfermedad' => '',
                    'forma_inicio' => '',
                    'curso' => '',
                ],
                'antecedentes' => [
                    'antecedentes' => '',
                ],
                'examen_fisico' => [
                    'examen_fisico' => '',
                ],
            ],
        ],
    ];
}

function hc_specialty_to_template_id($specialty) {
    $slug = hc_slugify_text($specialty);
    if ($slug === '') return 'medicina_general';

    if (strpos($slug, 'gine') !== false || strpos($slug, 'obste') !== false) {
        return 'ginecologia';
    }
    if (strpos($slug, 'pedia') !== false || strpos($slug, 'neonat') !== false) {
        return 'pediatria';
    }
    return 'medicina_general';
}

function hc_find_template_id_by_specialty($conn, $specialty, $clinicKey = '') {
    $slug = hc_slugify_text($specialty);
    $slugKey = hc_specialty_match_key($specialty);
    if ($slug === '' || !hc_table_exists($conn, 'hc_templates')) {
        return '';
    }

    $hasClinicCol = hc_column_exists_hc_templates($conn, 'clinic_key');
    $sql = 'SELECT template_id, nombre' . ($hasClinicCol ? ', clinic_key' : ', NULL AS clinic_key') . ' FROM hc_templates WHERE activo = 1';

    $stmt = null;
    if ($hasClinicCol && $clinicKey !== '') {
        $sql .= ' AND (clinic_key = ? OR clinic_key IS NULL OR clinic_key = "")';
        $sql .= ' ORDER BY (clinic_key = ?) DESC, id DESC';
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return '';
        }
        $stmt->bind_param('ss', $clinicKey, $clinicKey);
    } else {
        $sql .= ' ORDER BY id DESC';
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return '';
        }
    }

    $stmt->execute();
    $res = $stmt->get_result();

    $bestTemplateId = '';
    $bestScore = -1;

    while ($row = $res->fetch_assoc()) {
        $tplId = trim((string)($row['template_id'] ?? ''));
        if ($tplId === '') {
            continue;
        }

        $tplSlug = hc_slugify_text($tplId);
        $nameSlug = hc_slugify_text($row['nombre'] ?? '');
        $tplKey = hc_specialty_match_key($tplId);
        $nameKey = hc_specialty_match_key($row['nombre'] ?? '');
        $score = 0;

        if ($tplSlug === $slug) {
            $score = 100;
        } elseif ($nameSlug === $slug) {
            $score = 95;
        } elseif ($slugKey !== '' && ($tplKey === $slugKey || $nameKey === $slugKey)) {
            $score = 92;
        } elseif ($nameSlug !== '' && strpos($nameSlug, $slug) !== false) {
            $score = 80;
        } elseif ($tplSlug !== '' && strpos($tplSlug, $slug) !== false) {
            $score = 70;
        }

        if ($score > $bestScore) {
            $bestScore = $score;
            $bestTemplateId = $tplId;
        }
    }

    $stmt->close();
    return $bestScore > 0 ? $bestTemplateId : '';
}

function hc_guess_clinic_key($conn) {
    if (!hc_table_exists($conn, 'configuracion_clinica')) {
        return '';
    }

    $stmt = $conn->prepare('SELECT nombre_clinica FROM configuracion_clinica ORDER BY id ASC LIMIT 1');
    if (!$stmt) {
        return '';
    }
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return hc_slugify_text($row['nombre_clinica'] ?? '');
}

function hc_get_specialty_by_consulta_id($conn, $consultaId) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) {
        return '';
    }

    $stmt = $conn->prepare('SELECT m.especialidad FROM consultas c LEFT JOIN medicos m ON m.id = c.medico_id WHERE c.id = ? LIMIT 1');
    if (!$stmt) {
        return '';
    }
    $stmt->bind_param('i', $consultaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return trim((string)($row['especialidad'] ?? ''));
}

function hc_column_exists_configuracion($conn, $columnName) {
    static $cache = [];
    $key = "col::configuracion_clinica::$columnName";
    if (isset($cache[$key])) {
        return $cache[$key];
    }

    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $table = 'configuracion_clinica';
    $stmt->bind_param('ss', $table, $columnName);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $stmt->close();
    $cache[$key] = $exists;
    return $exists;
}

function hc_get_template_policy($conn) {
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $cache = [
        'mode' => 'auto',
        'single_template_id' => '',
    ];

    if (!hc_table_exists($conn, 'configuracion_clinica')) {
        return $cache;
    }

    $hasModeCol = hc_column_exists_configuracion($conn, 'hc_template_mode');
    $hasSingleCol = hc_column_exists_configuracion($conn, 'hc_template_single_id');
    if (!$hasModeCol && !$hasSingleCol) {
        return $cache;
    }

    $selectMode = $hasModeCol ? 'hc_template_mode' : 'NULL AS hc_template_mode';
    $selectSingle = $hasSingleCol ? 'hc_template_single_id' : 'NULL AS hc_template_single_id';

    $stmt = $conn->prepare("SELECT $selectMode, $selectSingle FROM configuracion_clinica ORDER BY id ASC LIMIT 1");
    if (!$stmt) {
        return $cache;
    }

    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $mode = strtolower(trim((string)($row['hc_template_mode'] ?? 'auto')));
    if (!in_array($mode, ['auto', 'single'], true)) {
        $mode = 'auto';
    }

    $single = trim((string)($row['hc_template_single_id'] ?? ''));
    $single = hc_slugify_text($single);
    if ($single === '') {
        $single = '';
    }

    $cache = [
        'mode' => $mode,
        'single_template_id' => $single,
    ];

    return $cache;
}

function hc_get_template_from_db($conn, $templateId, $clinicKey, $version = '') {
    if (!hc_table_exists($conn, 'hc_templates')) {
        return null;
    }

    $templateId = trim((string)$templateId);
    if ($templateId === '') {
        return null;
    }

    // Intenta resolver override por clinica primero, luego plantilla global.
    $sql = 'SELECT template_id, version, nombre, schema_version, source, schema_json
            FROM hc_templates
            WHERE template_id = ? AND activo = 1';
    $types = 's';
    $params = [$templateId];

    if ($version !== '') {
        $sql .= ' AND version = ?';
        $types .= 's';
        $params[] = $version;
    }

    $hasClinic = hc_table_exists($conn, 'hc_templates') && hc_column_exists_hc_templates($conn, 'clinic_key');
    if ($hasClinic) {
        $sql .= ' ORDER BY (clinic_key = ?) DESC, (clinic_key IS NULL OR clinic_key = \'\') DESC, id DESC LIMIT 1';
        $types .= 's';
        $params[] = $clinicKey;
    } else {
        $sql .= ' ORDER BY id DESC LIMIT 1';
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return null;
    }

    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        return null;
    }

    $schema = json_decode((string)($row['schema_json'] ?? ''), true);
    if (!is_array($schema)) {
        return null;
    }

    return [
        'id' => (string)($row['template_id'] ?? $templateId),
        'version' => (string)($row['version'] ?? ''),
        'nombre' => (string)($row['nombre'] ?? $templateId),
        'schema_version' => (string)($row['schema_version'] ?? '2.0'),
        'sections' => $schema['sections'] ?? [],
        'source' => (string)($row['source'] ?? 'db'),
    ];
}

function hc_column_exists_hc_templates($conn, $columnName) {
    static $cache = [];
    $key = "col::hc_templates::$columnName";
    if (isset($cache[$key])) {
        return $cache[$key];
    }

    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $table = 'hc_templates';
    $stmt->bind_param('ss', $table, $columnName);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $stmt->close();
    $cache[$key] = $exists;
    return $exists;
}

function hc_resolve_template($conn, $options = []) {
    $templateIdExplicit = trim((string)($options['template_id'] ?? ''));
    $version = trim((string)($options['version'] ?? ''));
    $consultaId = (int)($options['consulta_id'] ?? 0);
    $especialidad = trim((string)($options['especialidad'] ?? ''));
    $clinicKey = trim((string)($options['clinic_key'] ?? ''));

    if ($clinicKey === '') {
        $clinicKey = hc_guess_clinic_key($conn);
    }

    $source = 'fallback';
    $resolvedBy = 'default';
    $detectedEspecialidad = $especialidad;
    $templateId = $templateIdExplicit;
    $policy = hc_get_template_policy($conn);

    if ($templateId !== '') {
        $resolvedBy = 'explicit_template_id';
    } else {
        // Modo clinica: una sola plantilla para todas las HC.
        if (($policy['mode'] ?? 'auto') === 'single') {
            $forcedTemplateId = trim((string)($policy['single_template_id'] ?? ''));
            if ($forcedTemplateId !== '') {
                $templateId = $forcedTemplateId;
                $resolvedBy = 'clinic_single_template';
            }
        }

        if ($templateId !== '') {
            // Ya se forzo por modo single.
        } else {
        // Prioridad en modo auto: especialidad primero, luego plantilla default de clinica.
        if ($detectedEspecialidad === '' && $consultaId > 0) {
            $detectedEspecialidad = hc_get_specialty_by_consulta_id($conn, $consultaId);
            if ($detectedEspecialidad !== '') {
                $resolvedBy = 'consulta_especialidad';
            }
        }
        $templateId = hc_find_template_id_by_specialty($conn, $detectedEspecialidad, $clinicKey);
        if ($templateId === '') {
            $templateId = hc_specialty_to_template_id($detectedEspecialidad);
        }
        if ($resolvedBy === 'default' && $detectedEspecialidad !== '') {
            $resolvedBy = 'especialidad';
        }
        }
    }

    $dbTemplate = hc_get_template_from_db($conn, $templateId, $clinicKey, $version);
    if (is_array($dbTemplate)) {
        $dbTemplate['source'] = ($dbTemplate['source'] ?? 'db') === 'db' ? 'clinica_override' : $dbTemplate['source'];
        return [
            'success' => true,
            'template' => $dbTemplate,
            'resolution' => [
                'resolved_by' => $resolvedBy,
                'clinic_key' => $clinicKey,
                'especialidad_detectada' => $detectedEspecialidad,
                'policy_mode' => ($policy['mode'] ?? 'auto'),
                'policy_single_template_id' => ($policy['single_template_id'] ?? ''),
            ],
        ];
    }

    // Fallback 1: plantilla default de clinica cuando no se encontro la de especialidad.
    if ($templateIdExplicit === '' && ($policy['mode'] ?? 'auto') !== 'single') {
        $clinicDefaultTpl = hc_get_template_from_db($conn, 'default', $clinicKey, '');
        if (is_array($clinicDefaultTpl)) {
            $clinicDefaultTpl['source'] = 'clinica_default';
            return [
                'success' => true,
                'template' => $clinicDefaultTpl,
                'resolution' => [
                    'resolved_by' => 'clinica_default_fallback',
                    'clinic_key' => $clinicKey,
                    'especialidad_detectada' => $detectedEspecialidad,
                    'policy_mode' => ($policy['mode'] ?? 'auto'),
                    'policy_single_template_id' => ($policy['single_template_id'] ?? ''),
                ],
            ];
        }
    }

    $builtins = hc_get_builtin_templates();
    if (!isset($builtins[$templateId])) {
        $templateId = 'medicina_general';
    }

    $tpl = $builtins[$templateId];
    $tpl['source'] = 'builtin';

    return [
        'success' => true,
        'template' => $tpl,
        'resolution' => [
            'resolved_by' => $resolvedBy,
            'clinic_key' => $clinicKey,
            'especialidad_detectada' => $detectedEspecialidad,
            'policy_mode' => ($policy['mode'] ?? 'auto'),
            'policy_single_template_id' => ($policy['single_template_id'] ?? ''),
        ],
    ];
}
