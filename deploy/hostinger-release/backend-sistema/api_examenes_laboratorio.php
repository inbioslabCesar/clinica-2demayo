
<?php
require_once __DIR__ . '/init_api.php';
// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';

// --- Lógica principal ---
require_once "config.php";

function decode_valores_referenciales_any($raw) {
    if ($raw === null || $raw === '') return [];

    $value = $raw;
    for ($i = 0; $i < 3; $i++) {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                break;
            }
            $value = $decoded;
            continue;
        }
        break;
    }

    if (!is_array($value)) return [];

    // Compatibilidad: algunos registros antiguos guardaron un solo objeto.
    if (isset($value['nombre']) || isset($value['titulo']) || isset($value['tipo']) || isset($value['referencias'])) {
        return [$value];
    }

    return $value;
}

// Genera un slug estable (codigo_interno) a partir del nombre de un parámetro.
// Solo se usa si el parámetro no trae ya uno; una vez asignado, es inmutable.
function generar_codigo_interno($nombre, $idx) {
    // Normalizar: minúsculas, quitar acentos, reemplazar no-alfanumérico por guión bajo
    $s = mb_strtolower(trim((string)$nombre), 'UTF-8');
    $s = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    $s = preg_replace('/[^a-z0-9]+/', '_', $s);
    $s = trim($s, '_');
    if ($s === '') $s = 'param_' . ($idx + 1);
    return $s;
}

// Helper: normalizar valores_referenciales recibidos desde frontend
function normalize_valores_referenciales($raw) {
    if (!$raw) return json_encode([] , JSON_UNESCAPED_UNICODE);
    $raw = decode_valores_referenciales_any($raw);
    if (!is_array($raw)) return json_encode([], JSON_UNESCAPED_UNICODE);
    $items = [];
    foreach ($raw as $idx => $it) {
        if (!is_array($it)) continue;
        $item = [];
        $item['tipo'] = $it['tipo'] ?? 'Parámetro';
        $item['nombre'] = $it['nombre'] ?? ($it['titulo'] ?? ('Item ' . ($idx + 1)));
        // codigo_interno: preservar si ya existe (inmutable), generar si falta
        $item['codigo_interno'] = (isset($it['codigo_interno']) && trim((string)$it['codigo_interno']) !== '')
            ? trim((string)$it['codigo_interno'])
            : generar_codigo_interno($item['nombre'], $idx);
        $item['metodologia'] = $it['metodologia'] ?? '';
        $item['unidad'] = $it['unidad'] ?? '';
            $item['opciones'] = (isset($it['opciones']) && is_array($it['opciones'])) ? $it['opciones'] : [];        
            $item['texto_por_defecto'] = isset($it['texto_por_defecto']) ? trim((string)$it['texto_por_defecto']) : '';
        $item['referencias'] = [];
        if (isset($it['referencias']) && is_array($it['referencias'])) {
            foreach ($it['referencias'] as $r) {
                if (!is_array($r)) continue;
                $item['referencias'][] = [
                    'valor' => $r['valor'] ?? '',
                    'valor_min' => $r['valor_min'] ?? '',
                    'valor_max' => $r['valor_max'] ?? '',
                    'desc' => $r['desc'] ?? '',
                    'sexo' => $r['sexo'] ?? 'cualquiera',
                    'edad_min' => $r['edad_min'] ?? '',
                    'edad_max' => $r['edad_max'] ?? ''
                ];
            }
        }
        $item['formula'] = $it['formula'] ?? '';
        $item['negrita'] = !empty($it['negrita']) ? true : false;
        $item['cursiva'] = !empty($it['cursiva']) ? true : false;
        $item['alineacion'] = $it['alineacion'] ?? 'left';
        $item['color_texto'] = $it['color_texto'] ?? '#000000';
        $item['color_fondo'] = $it['color_fondo'] ?? '#ffffff';
        $item['decimales'] = (isset($it['decimales']) && $it['decimales'] !== '' && is_numeric($it['decimales'])) ? intval($it['decimales']) : null;
        $item['rows'] = (isset($it['rows']) && $it['rows'] !== '' && is_numeric($it['rows'])) ? intval($it['rows']) : null;
        $item['orden'] = isset($it['orden']) && is_numeric($it['orden']) ? intval($it['orden']) : ($idx + 1);
        $items[] = $item;
    }
    return json_encode($items, JSON_UNESCAPED_UNICODE);
}

function el_table_exists($conn, $table) {
    $table = trim((string)$table);
    if ($table === '') return false;
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $ok = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $ok;
}

function el_column_exists($conn, $table, $column) {
    $table = trim((string)$table);
    $column = trim((string)$column);
    if ($table === '' || $column === '') return false;
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
    if (!$stmt) return false;
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $ok = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $ok;
}

function el_get_user_id_from_session() {
    if (isset($_SESSION['usuario']) && isset($_SESSION['usuario']['id'])) {
        return (int)$_SESSION['usuario']['id'];
    }
    if (isset($_SESSION['usuario_id'])) {
        return (int)$_SESSION['usuario_id'];
    }
    return 0;
}

function el_snapshot_hash($snapshot) {
    $payload = [
        'nombre' => (string)($snapshot['nombre'] ?? ''),
        'categoria' => (string)($snapshot['categoria'] ?? ''),
        'metodologia' => (string)($snapshot['metodologia'] ?? ''),
        'valores_referenciales' => (string)($snapshot['valores_referenciales'] ?? ''),
        'precio_publico' => (string)($snapshot['precio_publico'] ?? ''),
        'precio_convenio' => (string)($snapshot['precio_convenio'] ?? ''),
        'tipo_tubo' => (string)($snapshot['tipo_tubo'] ?? ''),
        'tipo_frasco' => (string)($snapshot['tipo_frasco'] ?? ''),
        'tiempo_resultado' => (string)($snapshot['tiempo_resultado'] ?? ''),
        'condicion_paciente' => (string)($snapshot['condicion_paciente'] ?? ''),
        'preanalitica' => (string)($snapshot['preanalitica'] ?? ''),
    ];
    return hash('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function el_create_exam_version($conn, $examenId, $snapshot, $usuarioId = 0, $origen = 'edicion', $impacto = 'administrativo') {
    $examenId = (int)$examenId;
    if ($examenId <= 0) return 0;
    if (!el_table_exists($conn, 'examenes_laboratorio_versiones')) return 0;

    $hash = el_snapshot_hash($snapshot);

    $stmtDup = $conn->prepare("SELECT id, version_num FROM examenes_laboratorio_versiones WHERE examen_id = ? AND hash_contenido = ? LIMIT 1");
    if ($stmtDup) {
        $stmtDup->bind_param('is', $examenId, $hash);
        $stmtDup->execute();
        $dup = $stmtDup->get_result()->fetch_assoc();
        $stmtDup->close();
        if ($dup) {
            if (el_column_exists($conn, 'examenes_laboratorio', 'current_version_id')) {
                $vid = (int)($dup['id'] ?? 0);
                $vnum = (int)($dup['version_num'] ?? 1);
                $stmtUp = $conn->prepare("UPDATE examenes_laboratorio SET current_version_id = ?, version_actual = ? WHERE id = ?");
                if ($stmtUp) {
                    $stmtUp->bind_param('iii', $vid, $vnum, $examenId);
                    $stmtUp->execute();
                    $stmtUp->close();
                }
            }
            return (int)($dup['id'] ?? 0);
        }
    }

    $stmtMax = $conn->prepare("SELECT COALESCE(MAX(version_num), 0) AS max_ver FROM examenes_laboratorio_versiones WHERE examen_id = ?");
    $nextVersion = 1;
    if ($stmtMax) {
        $stmtMax->bind_param('i', $examenId);
        $stmtMax->execute();
        $rowMax = $stmtMax->get_result()->fetch_assoc();
        $stmtMax->close();
        $nextVersion = ((int)($rowMax['max_ver'] ?? 0)) + 1;
    }

    $stmtIns = $conn->prepare(
        "INSERT INTO examenes_laboratorio_versiones
         (examen_id, version_num, hash_contenido, nombre_snapshot, categoria_snapshot, metodologia_snapshot, valores_referenciales_snapshot,
          precio_publico_snapshot, precio_convenio_snapshot, tipo_tubo_snapshot, tipo_frasco_snapshot, tiempo_resultado_snapshot,
          condicion_paciente_snapshot, preanalitica_snapshot, impacto_cambio, origen, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    if (!$stmtIns) return 0;

    $nombre = (string)($snapshot['nombre'] ?? '');
    $categoria = (string)($snapshot['categoria'] ?? '');
    $metodologia = (string)($snapshot['metodologia'] ?? '');
    $valoresRef = (string)($snapshot['valores_referenciales'] ?? '[]');
    $precioPub = ($snapshot['precio_publico'] !== '' && $snapshot['precio_publico'] !== null) ? (float)$snapshot['precio_publico'] : null;
    $precioConv = ($snapshot['precio_convenio'] !== '' && $snapshot['precio_convenio'] !== null) ? (float)$snapshot['precio_convenio'] : null;
    $tipoTubo = (string)($snapshot['tipo_tubo'] ?? '');
    $tipoFrasco = (string)($snapshot['tipo_frasco'] ?? '');
    $tiempo = (string)($snapshot['tiempo_resultado'] ?? '');
    $condicion = (string)($snapshot['condicion_paciente'] ?? '');
    $preanalitica = (string)($snapshot['preanalitica'] ?? '');
    $impacto = ($impacto === 'clinico') ? 'clinico' : 'administrativo';
    $origen = in_array($origen, ['alta', 'edicion', 'migracion', 'manual'], true) ? $origen : 'edicion';
    $uid = $usuarioId > 0 ? $usuarioId : null;

    $stmtIns->bind_param(
        'iisssssddsssssssi',
        $examenId,
        $nextVersion,
        $hash,
        $nombre,
        $categoria,
        $metodologia,
        $valoresRef,
        $precioPub,
        $precioConv,
        $tipoTubo,
        $tipoFrasco,
        $tiempo,
        $condicion,
        $preanalitica,
        $impacto,
        $origen,
        $uid
    );
    $ok = $stmtIns->execute();
    $versionId = $ok ? (int)$conn->insert_id : 0;
    $stmtIns->close();

    if ($versionId > 0 && el_column_exists($conn, 'examenes_laboratorio', 'current_version_id')) {
        $stmtUp = $conn->prepare("UPDATE examenes_laboratorio SET current_version_id = ?, version_actual = ? WHERE id = ?");
        if ($stmtUp) {
            $stmtUp->bind_param('iii', $versionId, $nextVersion, $examenId);
            $stmtUp->execute();
            $stmtUp->close();
        }
    }

    return $versionId;
}

function el_detect_changed_fields($before, $after) {
    $keys = [
        'nombre',
        'categoria',
        'metodologia',
        'valores_referenciales',
        'precio_publico',
        'precio_convenio',
        'tipo_tubo',
        'tipo_frasco',
        'tiempo_resultado',
        'condicion_paciente',
        'preanalitica',
        'activo',
    ];
    $changed = [];
    foreach ($keys as $k) {
        $b = isset($before[$k]) ? (string)$before[$k] : '';
        $a = isset($after[$k]) ? (string)$after[$k] : '';
        if ($a !== $b) {
            $changed[] = $k;
        }
    }
    return $changed;
}

function el_detect_impacto($changedFields) {
    $clinicos = [
        'metodologia',
        'valores_referenciales',
        'condicion_paciente',
        'tiempo_resultado',
        'tipo_tubo',
        'tipo_frasco',
        'preanalitica',
    ];
    foreach ((array)$changedFields as $f) {
        if (in_array($f, $clinicos, true)) {
            return 'clinico';
        }
    }
    return 'administrativo';
}

function el_insert_auditoria_cambio($conn, $examenId, $versionAnteriorId, $versionNuevaId, $tipoCambio, $impacto, $campos, $usuarioId = 0, $motivo = null) {
    if (!el_table_exists($conn, 'cambios_examen_auditoria')) return;
    $examenId = (int)$examenId;
    if ($examenId <= 0) return;

    $stmt = $conn->prepare(
        "INSERT INTO cambios_examen_auditoria
         (examen_id, version_anterior_id, version_nueva_id, tipo_cambio, impacto, campos_cambiados_json, motivo, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    if (!$stmt) return;

    $verAnt = $versionAnteriorId > 0 ? (int)$versionAnteriorId : null;
    $verNue = $versionNuevaId > 0 ? (int)$versionNuevaId : null;
    $tipo = in_array($tipoCambio, ['alta', 'edicion', 'inactivacion', 'reactivacion'], true) ? $tipoCambio : 'edicion';
    $impacto = ($impacto === 'clinico') ? 'clinico' : 'administrativo';
    $camposJson = json_encode(array_values((array)$campos), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $uid = $usuarioId > 0 ? $usuarioId : null;

    $stmt->bind_param('iiissssi', $examenId, $verAnt, $verNue, $tipo, $impacto, $camposJson, $motivo, $uid);
    $stmt->execute();
    $stmt->close();
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit();
}

switch ($method) {
    case 'GET':
        // Listar todos los exámenes activos
        $sql = "SELECT * FROM examenes_laboratorio WHERE activo = 1 ORDER BY nombre";
        $result = $conn->query($sql);
        $examenes = [];
        while ($row = $result->fetch_assoc()) {
            // Decodificar y normalizar el campo JSON si existe
            $raw = [];
            if (isset($row['valores_referenciales']) && $row['valores_referenciales']) {
                $raw = decode_valores_referenciales_any($row['valores_referenciales']);
            }
            // Normalización robusta: garantizar nombre/tipo y estructura de referencias
            $items = [];
            foreach ($raw as $idx => $it) {
                if (!is_array($it)) continue;
                $item = [];
                $item['tipo'] = isset($it['tipo']) && $it['tipo'] !== '' ? $it['tipo'] : 'Parámetro';
                // Preferir nombre explícito; si falta, usar 'titulo'; si sigue faltando y es único parámetro, usar nombre del examen
                $fallbackNombre = 'Item ' . ($idx + 1);
                if (count($raw) === 1 && !empty($row['nombre'])) { $fallbackNombre = $row['nombre']; }
                $item['nombre'] = isset($it['nombre']) && trim($it['nombre']) !== ''
                    ? $it['nombre']
                    : (isset($it['titulo']) && trim($it['titulo']) !== '' ? $it['titulo'] : $fallbackNombre);
                $item['codigo_interno'] = (isset($it['codigo_interno']) && trim((string)$it['codigo_interno']) !== '')
                    ? trim((string)$it['codigo_interno'])
                    : generar_codigo_interno($item['nombre'], $idx);
                $item['metodologia'] = isset($it['metodologia']) ? $it['metodologia'] : '';
                $item['unidad'] = isset($it['unidad']) ? $it['unidad'] : '';
                $item['opciones'] = (isset($it['opciones']) && is_array($it['opciones'])) ? $it['opciones'] : [];
                $item['texto_por_defecto'] = isset($it['texto_por_defecto']) ? trim((string)$it['texto_por_defecto']) : '';
                $item['referencias'] = [];
                if (isset($it['referencias']) && is_array($it['referencias'])) {
                    foreach ($it['referencias'] as $r) {
                        if (!is_array($r)) continue;
                        $item['referencias'][] = [
                            'valor' => $r['valor'] ?? '',
                            'valor_min' => $r['valor_min'] ?? '',
                            'valor_max' => $r['valor_max'] ?? '',
                            'desc' => $r['desc'] ?? '',
                            'sexo' => $r['sexo'] ?? 'cualquiera',
                            'edad_min' => $r['edad_min'] ?? '',
                            'edad_max' => $r['edad_max'] ?? ''
                        ];
                    }
                }
                // Compatibilidad con esquemas antiguos (min/max)
                if (!empty($it['min']) || !empty($it['max'])) {
                    $item['referencias'][] = [
                        'valor' => '',
                        'valor_min' => $it['min'] ?? '',
                        'valor_max' => $it['max'] ?? '',
                        'desc' => 'Rango'
                    ];
                }
                $item['formula'] = isset($it['formula']) ? $it['formula'] : '';
                $item['negrita'] = !empty($it['negrita']) ? true : false;
                $item['cursiva'] = !empty($it['cursiva']) ? true : false;
                $item['alineacion'] = isset($it['alineacion']) ? $it['alineacion'] : 'left';
                $item['color_texto'] = isset($it['color_texto']) ? $it['color_texto'] : '#000000';
                $item['color_fondo'] = isset($it['color_fondo']) ? $it['color_fondo'] : '#ffffff';
                $item['decimales'] = (isset($it['decimales']) && $it['decimales'] !== '' && is_numeric($it['decimales'])) ? intval($it['decimales']) : null;
                $item['rows'] = (isset($it['rows']) && $it['rows'] !== '' && is_numeric($it['rows'])) ? intval($it['rows']) : null;
                $item['orden'] = (isset($it['orden']) && is_numeric($it['orden'])) ? intval($it['orden']) : ($idx + 1);
                $items[] = $item;
            }
            $row['valores_referenciales'] = $items;
            $examenes[] = $row;
        }
        echo json_encode(["success" => true, "examenes" => $examenes]);
        break;
    case 'POST':
        // Crear nuevo examen
        $data = json_decode(file_get_contents('php://input'), true);
        $nombre = $data['nombre'] ?? null;
        // Validaciones básicas
        if (!$nombre || trim($nombre) === '') {
            echo json_encode(["success" => false, "error" => "El campo 'nombre' es obligatorio"]);
            break;
        }
        $categoria = $data['categoria'] ?? null;
        $metodologia = $data['metodologia'] ?? null;
    $valores_referenciales = normalize_valores_referenciales($data['valores_referenciales'] ?? null);
        $precio_publico = $data['precio_publico'] !== "" ? $data['precio_publico'] : null;
        $precio_convenio = $data['precio_convenio'] !== "" ? $data['precio_convenio'] : null;
        $tipo_tubo = $data['tipo_tubo'] ?? null;
        $tipo_frasco = $data['tipo_frasco'] ?? null;
        $tiempo_resultado = $data['tiempo_resultado'] ?? null;
        $condicion_paciente = $data['condicion_paciente'] ?? null;
        $preanalitica = $data['preanalitica'] ?? null;
        $stmt = $conn->prepare("INSERT INTO examenes_laboratorio (nombre, categoria, metodologia, valores_referenciales, precio_publico, precio_convenio, tipo_tubo, tipo_frasco, tiempo_resultado, condicion_paciente, preanalitica, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
        $stmt->bind_param(
            "ssssddsssss",
            $nombre,
            $categoria,
            $metodologia,
            $valores_referenciales,
            $precio_publico,
            $precio_convenio,
            $tipo_tubo,
            $tipo_frasco,
            $tiempo_resultado,
            $condicion_paciente,
            $preanalitica
        );
        $ok = $stmt->execute();
        if ($ok) {
            $nuevoId = (int)$conn->insert_id;
            $uid = el_get_user_id_from_session();
            $snapshot = [
                'nombre' => $nombre,
                'categoria' => $categoria,
                'metodologia' => $metodologia,
                'valores_referenciales' => $valores_referenciales,
                'precio_publico' => $precio_publico,
                'precio_convenio' => $precio_convenio,
                'tipo_tubo' => $tipo_tubo,
                'tipo_frasco' => $tipo_frasco,
                'tiempo_resultado' => $tiempo_resultado,
                'condicion_paciente' => $condicion_paciente,
                'preanalitica' => $preanalitica,
            ];
            $versionId = el_create_exam_version($conn, $nuevoId, $snapshot, $uid, 'alta', 'administrativo');
            el_insert_auditoria_cambio($conn, $nuevoId, 0, $versionId, 'alta', 'administrativo', ['alta_inicial'], $uid, 'Creacion de examen');
            echo json_encode(["success" => true]);
        }
        else echo json_encode(["success" => false, "error" => $stmt->error ?? 'Error al guardar']);
        break;
    case 'PUT':
        // Actualizar examen
        $data = json_decode(file_get_contents('php://input'), true);
        $nombre = $data['nombre'] ?? null;
        // Validaciones básicas
        if (!$nombre || trim($nombre) === '') {
            echo json_encode(["success" => false, "error" => "El campo 'nombre' es obligatorio"]);
            break;
        }
        $categoria = $data['categoria'] ?? null;
        $metodologia = $data['metodologia'] ?? null;
    $valores_referenciales = normalize_valores_referenciales($data['valores_referenciales'] ?? null);
        $precio_publico = $data['precio_publico'] !== "" ? $data['precio_publico'] : null;
        $precio_convenio = $data['precio_convenio'] !== "" ? $data['precio_convenio'] : null;
        $tipo_tubo = $data['tipo_tubo'] ?? null;
        $tipo_frasco = $data['tipo_frasco'] ?? null;
        $tiempo_resultado = $data['tiempo_resultado'] ?? null;
        $condicion_paciente = $data['condicion_paciente'] ?? null;
        $preanalitica = $data['preanalitica'] ?? null;
        $id = $data['id'];
        $stmtPrev = $conn->prepare("SELECT * FROM examenes_laboratorio WHERE id = ? LIMIT 1");
        $prev = null;
        if ($stmtPrev) {
            $stmtPrev->bind_param('i', $id);
            $stmtPrev->execute();
            $prev = $stmtPrev->get_result()->fetch_assoc();
            $stmtPrev->close();
        }

        $stmt = $conn->prepare("UPDATE examenes_laboratorio SET nombre=?, categoria=?, metodologia=?, valores_referenciales=?, precio_publico=?, precio_convenio=?, tipo_tubo=?, tipo_frasco=?, tiempo_resultado=?, condicion_paciente=?, preanalitica=? WHERE id=?");
        $stmt->bind_param(
            "ssssddsssssi",
            $nombre,
            $categoria,
            $metodologia,
            $valores_referenciales,
            $precio_publico,
            $precio_convenio,
            $tipo_tubo,
            $tipo_frasco,
            $tiempo_resultado,
            $condicion_paciente,
            $preanalitica,
            $id
        );
    $ok = $stmt->execute();
    if ($ok) {
        $uid = el_get_user_id_from_session();
        $stmtNew = $conn->prepare("SELECT * FROM examenes_laboratorio WHERE id = ? LIMIT 1");
        $nuevo = null;
        if ($stmtNew) {
            $stmtNew->bind_param('i', $id);
            $stmtNew->execute();
            $nuevo = $stmtNew->get_result()->fetch_assoc();
            $stmtNew->close();
        }
        $campos = el_detect_changed_fields((array)$prev, (array)$nuevo);
        if (!empty($campos) && $nuevo) {
            $impacto = el_detect_impacto($campos);
            $snapshot = [
                'nombre' => $nuevo['nombre'] ?? $nombre,
                'categoria' => $nuevo['categoria'] ?? $categoria,
                'metodologia' => $nuevo['metodologia'] ?? $metodologia,
                'valores_referenciales' => $nuevo['valores_referenciales'] ?? $valores_referenciales,
                'precio_publico' => $nuevo['precio_publico'] ?? $precio_publico,
                'precio_convenio' => $nuevo['precio_convenio'] ?? $precio_convenio,
                'tipo_tubo' => $nuevo['tipo_tubo'] ?? $tipo_tubo,
                'tipo_frasco' => $nuevo['tipo_frasco'] ?? $tipo_frasco,
                'tiempo_resultado' => $nuevo['tiempo_resultado'] ?? $tiempo_resultado,
                'condicion_paciente' => $nuevo['condicion_paciente'] ?? $condicion_paciente,
                'preanalitica' => $nuevo['preanalitica'] ?? $preanalitica,
            ];
            $versionAnteriorId = isset($prev['current_version_id']) ? (int)$prev['current_version_id'] : 0;
            $versionNuevaId = el_create_exam_version($conn, $id, $snapshot, $uid, 'edicion', $impacto);
            $tipoCambio = 'edicion';
            if (in_array('activo', $campos, true)) {
                $activoAntes = (int)($prev['activo'] ?? 1);
                $activoNuevo = (int)($nuevo['activo'] ?? 1);
                if ($activoAntes === 1 && $activoNuevo === 0) {
                    $tipoCambio = 'inactivacion';
                } elseif ($activoAntes === 0 && $activoNuevo === 1) {
                    $tipoCambio = 'reactivacion';
                }
            }
            el_insert_auditoria_cambio($conn, $id, $versionAnteriorId, $versionNuevaId, $tipoCambio, $impacto, $campos, $uid, 'Actualizacion de examen');
        }
        echo json_encode(["success" => true]);
    }
    else echo json_encode(["success" => false, "error" => $stmt->error ?? 'Error al actualizar']);
        break;
    case 'DELETE':
        // Eliminar (desactivar) examen
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $conn->prepare("UPDATE examenes_laboratorio SET activo=0 WHERE id=?");
            $stmt->bind_param("i", $id);
            $ok = $stmt->execute();
            echo json_encode(["success" => $ok]);
        } else {
            echo json_encode(["success" => false, "error" => "ID requerido"]);
        }
        break;
    default:
        echo json_encode(["success" => false, "error" => "Método no soportado"]);
}
$conn->close();
