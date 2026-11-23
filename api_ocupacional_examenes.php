<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_ocupacional.php';

function out_exam($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        http_response_code(500);
        echo '{"success":false,"error":"No se pudo serializar respuesta JSON"}';
        exit;
    }
    echo $json;
    exit;
}

function bind_params_dynamic_exam($stmt, $types, $params)
{
    if ($types === '' || empty($params)) {
        return;
    }
    $refs = [];
    foreach ($params as $k => $v) {
        $refs[$k] = &$params[$k];
    }
    array_unshift($refs, $types);
    call_user_func_array([$stmt, 'bind_param'], $refs);
}

function parse_session_permisos_exam()
{
    $raw = $_SESSION['usuario']['permisos'] ?? [];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($raw)) {
        return [];
    }
    return array_values(array_filter(array_map('strval', $raw), fn($v) => trim($v) !== ''));
}

function require_ocup_permiso_exam($permiso)
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_exam(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }

    $permisos = parse_session_permisos_exam();
    if (!in_array('access_salud_ocupacional', $permisos, true) || !in_array($permiso, $permisos, true)) {
        out_exam(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }
}

function normalize_precio_exam($raw)
{
    if ($raw === '' || $raw === null) return 0;
    $value = is_string($raw) ? str_replace(',', '.', trim($raw)) : $raw;
    $precio = (float)$value;
    if (!is_finite($precio) || $precio < 0) {
        return null;
    }
    return round($precio, 2);
}

function table_exists_exam($conn, $table)
{
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

function column_exists_exam($conn, $table, $column)
{
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

function decode_json_any_exam($raw)
{
    if ($raw === null || $raw === '') {
        return [];
    }
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
    if (!is_array($value)) {
        return [];
    }
    if (isset($value['nombre']) || isset($value['tipo']) || isset($value['referencias'])) {
        return [$value];
    }
    return $value;
}

function force_utf8_exam_text($value)
{
    $text = trim((string)$value);
    if ($text === '') {
        return '';
    }

    if (@preg_match('//u', $text) === 1) {
        return $text;
    }

    if (function_exists('mb_convert_encoding')) {
        $converted = @mb_convert_encoding($text, 'UTF-8', 'UTF-8, ISO-8859-1, Windows-1252');
        if (is_string($converted) && $converted !== '') {
            $text = $converted;
        }
    } elseif (function_exists('iconv')) {
        $converted = @iconv('Windows-1252', 'UTF-8//IGNORE', $text);
        if ($converted === false || $converted === '') {
            $converted = @iconv('ISO-8859-1', 'UTF-8//IGNORE', $text);
        }
        if ($converted !== false && $converted !== '') {
            $text = $converted;
        }
    }

    if (@preg_match('//u', $text) !== 1) {
        $text = @utf8_encode($text);
    }

    $text = (string)$text;
    // Elimina soft hyphen y caracteres invisibles que suelen romper inserts UTF-8.
    $text = str_replace("\xC2\xAD", '', $text);
    $text = str_replace("\xAD", '', $text);
    $text = preg_replace('/[\x{200B}\x{FEFF}]/u', '', $text);

    return trim($text);
}

function execute_stmt_exam($stmt, $errorMessage)
{
    try {
        return $stmt->execute();
    } catch (Throwable $e) {
        out_exam(500, ['success' => false, 'error' => $errorMessage]);
    }
    return false;
}

function repair_mojibake_exam_text($value)
{
    $text = force_utf8_exam_text($value);
    if ($text === '') {
        return '';
    }

    if (strpos($text, 'Ã') === false && strpos($text, 'Â') === false && strpos($text, 'â') === false) {
        return $text;
    }

    $repaired = $text;
    if (function_exists('iconv')) {
        for ($i = 0; $i < 2; $i++) {
            $latin = @iconv('UTF-8', 'ISO-8859-1//IGNORE', $repaired);
            if ($latin === false || $latin === '') {
                break;
            }

            $utf8 = @iconv('ISO-8859-1', 'UTF-8//IGNORE', $latin);
            if ($utf8 === false || $utf8 === '' || $utf8 === $repaired) {
                break;
            }

            $repaired = $utf8;
            if (strpos($repaired, 'Ã') === false && strpos($repaired, 'Â') === false && strpos($repaired, 'â') === false) {
                break;
            }
        }
    }

    // Limpia prefijos residuales de conversiones antiguas (ej: "Â").
    $repaired = str_replace(chr(194), '', $repaired);

    // Normalizaciones clinicas frecuentes cuando existe patron degradado "Ã�".
    $semanticMap = [
        'BioquÃ�mica' => 'Bioquímica',
        'UroanÃ�lisis' => 'Uroanálisis',
        'HematologÃ�a' => 'Hematología',
        'InmunologÃ�a' => 'Inmunología',
        'QuÃ�mica' => 'Química',
        'LipÃ�dico' => 'Lipídico',
        'MÃ�S' => 'MÁS',
        'Ã�cido' => 'Ácido',
        'Ã�rico' => 'Úrico',
        'Ã�ricos' => 'Úricos',
    ];
    $repaired = strtr($repaired, $semanticMap);

    return trim($repaired);
}

function normalize_mojibake_recursive_exam($value)
{
    if (is_array($value)) {
        $normalized = [];
        foreach ($value as $k => $v) {
            $normalized[$k] = normalize_mojibake_recursive_exam($v);
        }
        return $normalized;
    }

    if (is_string($value)) {
        return repair_mojibake_exam_text($value);
    }

    return $value;
}

function build_default_codigo_importado_exam($labId)
{
    return 'LAB_' . str_pad((string)((int)$labId), 4, '0', STR_PAD_LEFT);
}

function has_master_grupos_exam($conn)
{
    return table_exists_exam($conn, 'ocupacional_grupos_examenes');
}

function normalize_nombre_grupo_exam($value)
{
    return trim(preg_replace('/\s+/u', ' ', (string)$value));
}

function listar_catalogo_grupos_subgrupos_master_exam($conn)
{
    $grupos = [];
    $subgruposPorGrupo = [];

    $stmtGrupos = $conn->prepare('SELECT id, nombre
                                  FROM ocupacional_grupos_examenes
                                  WHERE parent_id = 0 AND estado = "activo"
                                  ORDER BY orden ASC, nombre ASC, id ASC');
    if ($stmtGrupos) {
        $stmtGrupos->execute();
        $resGrupos = $stmtGrupos->get_result();
        while ($row = $resGrupos->fetch_assoc()) {
            $grupoId = (int)($row['id'] ?? 0);
            $nombre = (string)($row['nombre'] ?? '');
            if ($grupoId <= 0 || $nombre === '') {
                continue;
            }
            $grupos[] = ['id' => $grupoId, 'nombre' => $nombre];
            $subgruposPorGrupo[(string)$grupoId] = [];
        }
        $stmtGrupos->close();
    }

    $stmtSubs = $conn->prepare('SELECT id, nombre, parent_id
                                FROM ocupacional_grupos_examenes
                                WHERE parent_id > 0 AND estado = "activo"
                                ORDER BY parent_id ASC, orden ASC, nombre ASC, id ASC');
    if ($stmtSubs) {
        $stmtSubs->execute();
        $resSubs = $stmtSubs->get_result();
        while ($row = $resSubs->fetch_assoc()) {
            $subId = (int)($row['id'] ?? 0);
            $parentId = (int)($row['parent_id'] ?? 0);
            $nombre = (string)($row['nombre'] ?? '');
            if ($subId <= 0 || $parentId <= 0 || $nombre === '') {
                continue;
            }
            $parentKey = (string)$parentId;
            if (!isset($subgruposPorGrupo[$parentKey])) {
                $subgruposPorGrupo[$parentKey] = [];
            }
            $subgruposPorGrupo[$parentKey][] = ['id' => $subId, 'nombre' => $nombre];
        }
        $stmtSubs->close();
    }

    return [
        'modo' => 'maestro',
        'grupos' => $grupos,
        'subgrupos_por_grupo' => $subgruposPorGrupo,
    ];
}

function listar_catalogo_grupos_subgrupos_exam($conn)
{
    if (has_master_grupos_exam($conn)) {
        return listar_catalogo_grupos_subgrupos_master_exam($conn);
    }

    $grupos = [];
    $subgruposPorGrupo = [];

    $stmtGrupos = $conn->prepare('SELECT DISTINCT TRIM(grupo) AS grupo
                                  FROM ocupacional_examenes_generales
                                  WHERE grupo IS NOT NULL AND TRIM(grupo) <> ""
                                  ORDER BY grupo ASC');
    if ($stmtGrupos) {
        $stmtGrupos->execute();
        $resGrupos = $stmtGrupos->get_result();
        while ($row = $resGrupos->fetch_assoc()) {
            $grupo = (string)($row['grupo'] ?? '');
            if ($grupo !== '') {
                $grupos[] = $grupo;
                $subgruposPorGrupo[$grupo] = [];
            }
        }
        $stmtGrupos->close();
    }

    $stmtSubs = $conn->prepare('SELECT TRIM(grupo) AS grupo, TRIM(subgrupo) AS subgrupo
                                FROM ocupacional_examenes_generales
                                WHERE grupo IS NOT NULL AND TRIM(grupo) <> ""
                                  AND subgrupo IS NOT NULL AND TRIM(subgrupo) <> ""
                                GROUP BY TRIM(grupo), TRIM(subgrupo)
                                ORDER BY TRIM(grupo) ASC, TRIM(subgrupo) ASC');
    if ($stmtSubs) {
        $stmtSubs->execute();
        $resSubs = $stmtSubs->get_result();
        while ($row = $resSubs->fetch_assoc()) {
            $grupo = (string)($row['grupo'] ?? '');
            $subgrupo = (string)($row['subgrupo'] ?? '');
            if ($grupo === '' || $subgrupo === '') {
                continue;
            }
            if (!isset($subgruposPorGrupo[$grupo])) {
                $subgruposPorGrupo[$grupo] = [];
            }
            $subgruposPorGrupo[$grupo][] = $subgrupo;
        }
        $stmtSubs->close();
    }

    foreach ($subgruposPorGrupo as $grupo => $subs) {
        $subgruposPorGrupo[$grupo] = array_values(array_unique($subs));
    }

    return [
        'modo' => 'legacy_texto',
        'grupos' => array_values(array_unique($grupos)),
        'subgrupos_por_grupo' => $subgruposPorGrupo,
    ];
}

function resolve_nombre_grupo_subgrupo_exam($conn, $grupoId, $subgrupoId, $grupoRaw, $subgrupoRaw)
{
    $grupo = normalize_nombre_grupo_exam($grupoRaw);
    $subgrupo = normalize_nombre_grupo_exam($subgrupoRaw);

    if (!has_master_grupos_exam($conn)) {
        return [$grupo, $subgrupo];
    }

    if ($grupoId > 0) {
        $stmtGrupo = $conn->prepare('SELECT id, nombre FROM ocupacional_grupos_examenes WHERE id = ? AND parent_id = 0 AND estado = "activo" LIMIT 1');
        if (!$stmtGrupo) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo validar grupo maestro']);
        }
        $stmtGrupo->bind_param('i', $grupoId);
        $stmtGrupo->execute();
        $rowGrupo = $stmtGrupo->get_result()->fetch_assoc();
        $stmtGrupo->close();
        if (!$rowGrupo) {
            out_exam(422, ['success' => false, 'error' => 'grupo_id invalido o inactivo']);
        }
        $grupo = (string)$rowGrupo['nombre'];
    }

    if ($subgrupoId > 0) {
        if ($grupoId <= 0) {
            out_exam(422, ['success' => false, 'error' => 'subgrupo_id requiere grupo_id']);
        }

        $stmtSub = $conn->prepare('SELECT id, nombre, parent_id
                                   FROM ocupacional_grupos_examenes
                                   WHERE id = ? AND parent_id = ? AND estado = "activo"
                                   LIMIT 1');
        if (!$stmtSub) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo validar subgrupo maestro']);
        }
        $stmtSub->bind_param('ii', $subgrupoId, $grupoId);
        $stmtSub->execute();
        $rowSub = $stmtSub->get_result()->fetch_assoc();
        $stmtSub->close();
        if (!$rowSub) {
            out_exam(422, ['success' => false, 'error' => 'subgrupo_id invalido para el grupo seleccionado']);
        }
        $subgrupo = (string)$rowSub['nombre'];
    }

    return [$grupo, $subgrupo];
}

function obtener_grupo_maestro_exam($conn, $id)
{
    $stmt = $conn->prepare('SELECT id, nombre, parent_id, estado FROM ocupacional_grupos_examenes WHERE id = ? LIMIT 1');
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

if (!table_exists_exam($mysqliOcup, 'ocupacional_examenes_generales')) {
    out_exam(500, [
        'success' => false,
        'error' => 'Falta la tabla ocupacional_examenes_generales. Aplicar sql/2026-06-15_ocupacional_fase2_examenes_generales.sql en la base ocupacional.',
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_ocup_permiso_exam('gestionar_empresas_ocupacional');

    $accion = trim((string)($_GET['accion'] ?? 'listar'));

    if ($accion === 'catalogo_laboratorio_origen') {
        if (!isset($mysqli) || !($mysqli instanceof mysqli)) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo conectar a la base clinica para listar examenes de laboratorio']);
        }
        if (!table_exists_exam($mysqli, 'examenes_laboratorio')) {
            out_exam(422, ['success' => false, 'error' => 'No existe tabla examenes_laboratorio en la base clinica']);
        }

        $q = trim((string)($_GET['q'] ?? ''));
        $page = (int)($_GET['page'] ?? 1);
        $perPage = (int)($_GET['per_page'] ?? 50);
        $page = max(1, $page);
        $perPage = max(1, min($perPage, 300));
        $offset = ($page - 1) * $perPage;

        $where = ['activo = 1'];
        $types = '';
        $params = [];
        if ($q !== '') {
            $tokens = preg_split('/\s+/u', $q, -1, PREG_SPLIT_NO_EMPTY);
            if (!is_array($tokens) || empty($tokens)) {
                $tokens = [$q];
            }

            foreach ($tokens as $token) {
                $term = '%' . $token . '%';
                $where[] = '(nombre LIKE ? OR categoria LIKE ? OR metodologia LIKE ?)';
                $types .= 'sss';
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
            }
        }
        $whereSql = ' WHERE ' . implode(' AND ', $where);

        $stmtCount = $mysqli->prepare('SELECT COUNT(*) AS total FROM examenes_laboratorio' . $whereSql);
        if (!$stmtCount) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo contar examenes de laboratorio']);
        }
        bind_params_dynamic_exam($stmtCount, $types, $params);
        $stmtCount->execute();
        $total = (int)($stmtCount->get_result()->fetch_assoc()['total'] ?? 0);
        $stmtCount->close();

        $hasCurrentVersionId = column_exists_exam($mysqli, 'examenes_laboratorio', 'current_version_id');
        $hasVersionActual = column_exists_exam($mysqli, 'examenes_laboratorio', 'version_actual');
        $sqlRows = 'SELECT id,
                           nombre,
                           categoria,
                           metodologia,
                           valores_referenciales,
                           precio_publico,
                           precio_convenio,
                           tipo_tubo,
                           tipo_frasco,
                           tiempo_resultado,
                           condicion_paciente,
                           preanalitica,'
                           . ($hasCurrentVersionId ? ' current_version_id,' : ' NULL AS current_version_id,')
                           . ($hasVersionActual ? ' version_actual' : ' NULL AS version_actual')
                           . ' FROM examenes_laboratorio'
                           . $whereSql
                           . ' ORDER BY nombre ASC, id ASC LIMIT ? OFFSET ?';
        $stmtRows = $mysqli->prepare($sqlRows);
        if (!$stmtRows) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo listar examenes de laboratorio']);
        }
        $typesRows = $types . 'ii';
        $paramsRows = $params;
        $paramsRows[] = $perPage;
        $paramsRows[] = $offset;
        bind_params_dynamic_exam($stmtRows, $typesRows, $paramsRows);
        $stmtRows->execute();
        $resRows = $stmtRows->get_result();

        $rows = [];
        while ($row = $resRows->fetch_assoc()) {
            $nombre = repair_mojibake_exam_text($row['nombre'] ?? '');
            $categoria = repair_mojibake_exam_text($row['categoria'] ?? '');
            $metodologia = repair_mojibake_exam_text($row['metodologia'] ?? '');
            $tipoTubo = repair_mojibake_exam_text($row['tipo_tubo'] ?? '');
            $tipoFrasco = repair_mojibake_exam_text($row['tipo_frasco'] ?? '');
            $tiempoResultado = repair_mojibake_exam_text($row['tiempo_resultado'] ?? '');
            $condicionPaciente = repair_mojibake_exam_text($row['condicion_paciente'] ?? '');
            $preanalitica = repair_mojibake_exam_text($row['preanalitica'] ?? '');
            $valoresReferenciales = normalize_mojibake_recursive_exam(
                decode_json_any_exam($row['valores_referenciales'] ?? '')
            );
            $rows[] = [
                'id' => (int)($row['id'] ?? 0),
                'nombre' => $nombre,
                'categoria' => $categoria,
                'metodologia' => $metodologia,
                'valores_referenciales' => $valoresReferenciales,
                'precio_publico' => isset($row['precio_publico']) ? (float)$row['precio_publico'] : 0,
                'precio_convenio' => isset($row['precio_convenio']) ? (float)$row['precio_convenio'] : 0,
                'tipo_tubo' => $tipoTubo,
                'tipo_frasco' => $tipoFrasco,
                'tiempo_resultado' => $tiempoResultado,
                'condicion_paciente' => $condicionPaciente,
                'preanalitica' => $preanalitica,
                'current_version_id' => isset($row['current_version_id']) ? (int)$row['current_version_id'] : 0,
                'version_actual' => isset($row['version_actual']) ? (int)$row['version_actual'] : 0,
            ];
        }
        $stmtRows->close();

        out_exam(200, [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => $total > 0 ? (int)ceil($total / $perPage) : 0,
            ],
        ]);
    }

    if ($accion === 'catalogo_grupos') {
        out_exam(200, [
            'success' => true,
            'data' => listar_catalogo_grupos_subgrupos_exam($mysqliOcup),
        ]);
    }

    if ($accion === 'listar_grupos_maestro') {
        if (!has_master_grupos_exam($mysqliOcup)) {
            out_exam(422, ['success' => false, 'error' => 'No existe maestro de grupos. Ejecute migracion 20260724_0011_ocupacional_maestro_grupos_subgrupos.sql']);
        }

        $estado = trim((string)($_GET['estado'] ?? 'activo'));
        $q = trim((string)($_GET['q'] ?? ''));
        $page = (int)($_GET['page'] ?? 1);
        $perPage = (int)($_GET['per_page'] ?? 20);

        if (!in_array($estado, ['activo', 'inactivo', 'todos'], true)) {
            out_exam(422, ['success' => false, 'error' => 'Filtro estado invalido']);
        }

        $page = max(1, $page);
        $perPage = max(1, min($perPage, 200));
        $offset = ($page - 1) * $perPage;

        $where = [];
        $types = '';
        $params = [];

        if ($estado !== 'todos') {
            $where[] = 'g.estado = ?';
            $types .= 's';
            $params[] = $estado;
        }

        if ($q !== '') {
            $where[] = '(g.nombre LIKE ? OR IFNULL(p.nombre, "") LIKE ? OR CASE WHEN g.parent_id = 0 THEN "GRUPO" ELSE "SUB GRUPO" END LIKE ?)';
            $term = '%' . $q . '%';
            $types .= 'sss';
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

        $sqlCount = 'SELECT COUNT(*) AS total
                     FROM ocupacional_grupos_examenes g
                     LEFT JOIN ocupacional_grupos_examenes p ON p.id = g.parent_id'
                    . $whereSql;
        $stmtCount = $mysqliOcup->prepare($sqlCount);
        if (!$stmtCount) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo preparar conteo de grupos']);
        }
        bind_params_dynamic_exam($stmtCount, $types, $params);
        $stmtCount->execute();
        $total = (int)(($stmtCount->get_result()->fetch_assoc()['total'] ?? 0));
        $stmtCount->close();

        $sqlRows = 'SELECT
                        g.id,
                        g.nombre,
                        g.parent_id,
                        g.orden,
                        g.estado,
                        IFNULL(p.nombre, "") AS grupo_padre,
                        CASE WHEN g.parent_id = 0 THEN "GRUPO" ELSE "SUB GRUPO" END AS tipo
                    FROM ocupacional_grupos_examenes g
                    LEFT JOIN ocupacional_grupos_examenes p ON p.id = g.parent_id'
                    . $whereSql
                    . ' ORDER BY g.parent_id ASC, g.orden ASC, g.nombre ASC, g.id DESC LIMIT ? OFFSET ?';
        $stmtRows = $mysqliOcup->prepare($sqlRows);
        if (!$stmtRows) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo preparar listado de grupos']);
        }

        $typesRows = $types . 'ii';
        $paramsRows = $params;
        $paramsRows[] = $perPage;
        $paramsRows[] = $offset;
        bind_params_dynamic_exam($stmtRows, $typesRows, $paramsRows);
        $stmtRows->execute();
        $resRows = $stmtRows->get_result();

        $rows = [];
        while ($r = $resRows->fetch_assoc()) {
            $rows[] = [
                'id' => (int)$r['id'],
                'nombre' => (string)$r['nombre'],
                'parent_id' => (int)$r['parent_id'],
                'orden' => (int)($r['orden'] ?? 0),
                'estado' => (string)($r['estado'] ?? 'activo'),
                'grupo_padre' => (string)($r['grupo_padre'] ?? ''),
                'tipo' => (string)($r['tipo'] ?? ''),
            ];
        }
        $stmtRows->close();

        out_exam(200, [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => $total > 0 ? (int)ceil($total / $perPage) : 0,
            ],
        ]);
    }

    $estado = trim((string)($_GET['estado'] ?? 'activo'));
    $q = trim((string)($_GET['q'] ?? ''));
    $page = (int)($_GET['page'] ?? 1);
    $perPage = (int)($_GET['per_page'] ?? 20);
    $sortByRaw = trim((string)($_GET['sort_by'] ?? 'descripcion'));
    $sortDirRaw = strtolower(trim((string)($_GET['sort_dir'] ?? 'asc')));

    $page = max(1, $page);
    $perPage = max(1, min($perPage, 200));
    $offset = ($page - 1) * $perPage;

    if (!in_array($estado, ['activo', 'inactivo', 'todos'], true)) {
        out_exam(422, ['success' => false, 'error' => 'Filtro estado invalido']);
    }

    $sortMap = [
        'codigo' => 'codigo',
        'descripcion' => 'descripcion',
        'grupo' => 'grupo',
        'precio' => 'precio',
        'created_at' => 'created_at',
    ];
    $sortBy = $sortMap[$sortByRaw] ?? 'descripcion';
    $sortDir = $sortDirRaw === 'desc' ? 'DESC' : 'ASC';

    $where = [];
    $types = '';
    $params = [];

    if ($estado !== 'todos') {
        $where[] = 'estado = ?';
        $types .= 's';
        $params[] = $estado;
    }

    if ($q !== '') {
        $where[] = '(codigo LIKE ? OR descripcion LIKE ? OR grupo LIKE ? OR subgrupo LIKE ?)';
        $term = '%' . $q . '%';
        $types .= 'ssss';
        $params[] = $term;
        $params[] = $term;
        $params[] = $term;
        $params[] = $term;
    }

    $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

    $sqlCount = 'SELECT COUNT(*) AS total FROM ocupacional_examenes_generales' . $whereSql;
    $stmtCount = $mysqliOcup->prepare($sqlCount);
    if (!$stmtCount) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo preparar conteo']);
    }
    bind_params_dynamic_exam($stmtCount, $types, $params);
    $stmtCount->execute();
    $resCount = $stmtCount->get_result();
    $rowCount = $resCount ? $resCount->fetch_assoc() : ['total' => 0];
    $total = (int)($rowCount['total'] ?? 0);
    $stmtCount->close();

    $sql = 'SELECT id, codigo, descripcion, grupo, subgrupo, valores_normales, precio, posicion, estado, created_at, updated_at
            FROM ocupacional_examenes_generales'
            . $whereSql
            . ' ORDER BY ' . $sortBy . ' ' . $sortDir . ', id DESC LIMIT ? OFFSET ?';
    $stmt = $mysqliOcup->prepare($sql);
    if (!$stmt) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo preparar listado']);
    }

    $typesData = $types . 'ii';
    $paramsData = $params;
    $paramsData[] = $perPage;
    $paramsData[] = $offset;
    bind_params_dynamic_exam($stmt, $typesData, $paramsData);
    $stmt->execute();
    $res = $stmt->get_result();

    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $descripcionRow = repair_mojibake_exam_text($row['descripcion'] ?? '');
        $grupoRow = repair_mojibake_exam_text($row['grupo'] ?? '');
        $subgrupoRow = repair_mojibake_exam_text($row['subgrupo'] ?? '');
        $valoresNormalesRow = repair_mojibake_exam_text($row['valores_normales'] ?? '');
        $rows[] = [
            'id' => (int)$row['id'],
            'codigo' => (string)($row['codigo'] ?? ''),
            'descripcion' => $descripcionRow,
            'grupo' => $grupoRow,
            'subgrupo' => $subgrupoRow,
            'valores_normales' => $valoresNormalesRow,
            'precio' => (float)($row['precio'] ?? 0),
            'posicion' => (int)($row['posicion'] ?? 0),
            'estado' => (string)($row['estado'] ?? 'activo'),
            'created_at' => (string)($row['created_at'] ?? ''),
            'updated_at' => (string)($row['updated_at'] ?? ''),
        ];
    }
    $stmt->close();

    out_exam(200, [
        'success' => true,
        'data' => $rows,
        'meta' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $total > 0 ? (int)ceil($total / $perPage) : 0,
            'sort_by' => $sortByRaw,
            'sort_dir' => strtolower($sortDir),
        ],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out_exam(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

require_ocup_permiso_exam('gestionar_empresas_ocupacional');

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$accion = trim((string)($payload['accion'] ?? 'guardar'));
$usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;

if ($accion === 'guardar_grupo_maestro') {
    if (!has_master_grupos_exam($mysqliOcup)) {
        out_exam(422, ['success' => false, 'error' => 'No existe maestro de grupos. Ejecute migracion 20260724_0011_ocupacional_maestro_grupos_subgrupos.sql']);
    }

    $nivel = strtolower(trim((string)($payload['nivel'] ?? 'grupo')));
    $nombre = normalize_nombre_grupo_exam($payload['nombre'] ?? '');
    $parentId = (int)($payload['parent_id'] ?? 0);

    if (!in_array($nivel, ['grupo', 'subgrupo'], true)) {
        out_exam(422, ['success' => false, 'error' => 'nivel invalido']);
    }
    if ($nombre === '') {
        out_exam(422, ['success' => false, 'error' => 'nombre es obligatorio']);
    }

    if ($nivel === 'grupo') {
        $parentId = 0;
    } else {
        if ($parentId <= 0) {
            out_exam(422, ['success' => false, 'error' => 'parent_id es obligatorio para subgrupo']);
        }
        $stmtParent = $mysqliOcup->prepare('SELECT id FROM ocupacional_grupos_examenes WHERE id = ? AND parent_id = 0 AND estado = "activo" LIMIT 1');
        if (!$stmtParent) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo validar grupo padre']);
        }
        $stmtParent->bind_param('i', $parentId);
        $stmtParent->execute();
        $existsParent = (bool)$stmtParent->get_result()->fetch_assoc();
        $stmtParent->close();
        if (!$existsParent) {
            out_exam(422, ['success' => false, 'error' => 'parent_id invalido']);
        }
    }

    $stmtDup = $mysqliOcup->prepare('SELECT id, estado FROM ocupacional_grupos_examenes WHERE parent_id = ? AND UPPER(nombre) = UPPER(?) LIMIT 1');
    if (!$stmtDup) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo validar duplicado de grupo']);
    }
    $stmtDup->bind_param('is', $parentId, $nombre);
    $stmtDup->execute();
    $dup = $stmtDup->get_result()->fetch_assoc();
    $stmtDup->close();

    if ($dup) {
        $dupId = (int)$dup['id'];
        $dupEstado = (string)($dup['estado'] ?? 'activo');
        if ($dupEstado !== 'activo') {
            $stmtReact = $mysqliOcup->prepare('UPDATE ocupacional_grupos_examenes SET estado = "activo", updated_by = ?, updated_at = NOW() WHERE id = ? LIMIT 1');
            if ($stmtReact) {
                $stmtReact->bind_param('ii', $usuarioId, $dupId);
                $stmtReact->execute();
                $stmtReact->close();
            }
        }

        out_exam(200, [
            'success' => true,
            'data' => [
                'id' => $dupId,
                'nombre' => $nombre,
                'parent_id' => $parentId,
                'nivel' => $nivel,
            ],
        ]);
    }

    $stmtIns = $mysqliOcup->prepare('INSERT INTO ocupacional_grupos_examenes (nombre, parent_id, estado, created_by, updated_by) VALUES (?, ?, "activo", ?, ?)');
    if (!$stmtIns) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo registrar grupo maestro']);
    }
    $stmtIns->bind_param('siii', $nombre, $parentId, $usuarioId, $usuarioId);
    if (!$stmtIns->execute()) {
        $stmtIns->close();
        out_exam(500, ['success' => false, 'error' => 'No se pudo guardar grupo maestro']);
    }
    $newId = (int)$stmtIns->insert_id;
    $stmtIns->close();

    out_exam(201, [
        'success' => true,
        'data' => [
            'id' => $newId,
            'nombre' => $nombre,
            'parent_id' => $parentId,
            'nivel' => $nivel,
        ],
    ]);
}

if ($accion === 'actualizar_grupo_maestro') {
    if (!has_master_grupos_exam($mysqliOcup)) {
        out_exam(422, ['success' => false, 'error' => 'No existe maestro de grupos. Ejecute migracion 20260724_0011_ocupacional_maestro_grupos_subgrupos.sql']);
    }

    $idGrupo = (int)($payload['id'] ?? 0);
    $nivel = strtolower(trim((string)($payload['nivel'] ?? '')));
    $nombre = normalize_nombre_grupo_exam($payload['nombre'] ?? '');
    $parentId = (int)($payload['parent_id'] ?? 0);

    if ($idGrupo <= 0) {
        out_exam(422, ['success' => false, 'error' => 'id es obligatorio']);
    }
    if ($nombre === '') {
        out_exam(422, ['success' => false, 'error' => 'nombre es obligatorio']);
    }

    $actual = obtener_grupo_maestro_exam($mysqliOcup, $idGrupo);
    if (!$actual) {
        out_exam(404, ['success' => false, 'error' => 'Grupo no encontrado']);
    }

    $currentParent = (int)($actual['parent_id'] ?? 0);
    if (!in_array($nivel, ['grupo', 'subgrupo'], true)) {
        $nivel = $currentParent === 0 ? 'grupo' : 'subgrupo';
    }

    $newParent = $nivel === 'grupo' ? 0 : $parentId;
    if ($nivel === 'subgrupo' && $newParent <= 0) {
        out_exam(422, ['success' => false, 'error' => 'parent_id es obligatorio para subgrupo']);
    }
    if ($newParent === $idGrupo) {
        out_exam(422, ['success' => false, 'error' => 'Un grupo no puede depender de si mismo']);
    }

    if ($currentParent === 0 && $newParent > 0) {
        $stmtChildren = $mysqliOcup->prepare('SELECT COUNT(*) AS total FROM ocupacional_grupos_examenes WHERE parent_id = ? AND estado = "activo"');
        if ($stmtChildren) {
            $stmtChildren->bind_param('i', $idGrupo);
            $stmtChildren->execute();
            $childrenTotal = (int)($stmtChildren->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtChildren->close();
            if ($childrenTotal > 0) {
                out_exam(409, [
                    'success' => false,
                    'error' => 'No se puede convertir a subgrupo porque tiene subgrupos activos',
                    'error_code' => 'GRUPO_TIENE_SUBGRUPOS_ACTIVOS',
                    'data' => [
                        'id' => $idGrupo,
                        'subgrupos_activos' => $childrenTotal,
                    ],
                ]);
            }
        }
    }

    if ($newParent > 0) {
        $parentRow = obtener_grupo_maestro_exam($mysqliOcup, $newParent);
        if (!$parentRow || (int)($parentRow['parent_id'] ?? -1) !== 0 || (string)($parentRow['estado'] ?? '') !== 'activo') {
            out_exam(422, ['success' => false, 'error' => 'parent_id invalido']);
        }
    }

    $stmtDup = $mysqliOcup->prepare('SELECT id FROM ocupacional_grupos_examenes WHERE parent_id = ? AND UPPER(nombre) = UPPER(?) AND id <> ? LIMIT 1');
    if (!$stmtDup) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo validar duplicado']);
    }
    $stmtDup->bind_param('isi', $newParent, $nombre, $idGrupo);
    $stmtDup->execute();
    $dup = $stmtDup->get_result()->fetch_assoc();
    $stmtDup->close();
    if ($dup) {
        out_exam(409, [
            'success' => false,
            'error' => 'Ya existe un registro con ese nombre en el mismo nivel',
            'error_code' => 'NOMBRE_DUPLICADO_MISMO_NIVEL',
            'data' => [
                'id_conflicto' => (int)$dup['id'],
                'parent_id' => $newParent,
                'nombre' => $nombre,
            ],
        ]);
    }

    $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_grupos_examenes SET nombre = ?, parent_id = ?, updated_by = ?, updated_at = NOW() WHERE id = ? LIMIT 1');
    if (!$stmtUp) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo actualizar grupo maestro']);
    }
    $stmtUp->bind_param('siii', $nombre, $newParent, $usuarioId, $idGrupo);
    $stmtUp->execute();
    $stmtUp->close();

    out_exam(200, [
        'success' => true,
        'data' => [
            'id' => $idGrupo,
            'nombre' => $nombre,
            'parent_id' => $newParent,
            'nivel' => $nivel,
        ],
    ]);
}

if ($accion === 'eliminar_grupo_maestro') {
    if (!has_master_grupos_exam($mysqliOcup)) {
        out_exam(422, ['success' => false, 'error' => 'No existe maestro de grupos. Ejecute migracion 20260724_0011_ocupacional_maestro_grupos_subgrupos.sql']);
    }

    $idGrupo = (int)($payload['id'] ?? 0);
    if ($idGrupo <= 0) {
        out_exam(422, ['success' => false, 'error' => 'id es obligatorio']);
    }

    $row = obtener_grupo_maestro_exam($mysqliOcup, $idGrupo);
    if (!$row) {
        out_exam(404, ['success' => false, 'error' => 'Grupo no encontrado']);
    }

    $nombre = (string)$row['nombre'];
    $parent = (int)($row['parent_id'] ?? 0);

    if ($parent === 0) {
        $stmtChildren = $mysqliOcup->prepare('SELECT COUNT(*) AS total FROM ocupacional_grupos_examenes WHERE parent_id = ? AND estado = "activo"');
        if ($stmtChildren) {
            $stmtChildren->bind_param('i', $idGrupo);
            $stmtChildren->execute();
            $childrenTotal = (int)($stmtChildren->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtChildren->close();
            if ($childrenTotal > 0) {
                out_exam(409, [
                    'success' => false,
                    'error' => 'No se puede inactivar: el grupo tiene subgrupos activos',
                    'error_code' => 'GRUPO_TIENE_SUBGRUPOS_ACTIVOS',
                    'data' => [
                        'id' => $idGrupo,
                        'subgrupos_activos' => $childrenTotal,
                    ],
                ]);
            }
        }

        $stmtUso = $mysqliOcup->prepare('SELECT COUNT(*) AS total FROM ocupacional_examenes_generales WHERE UPPER(TRIM(grupo)) = UPPER(?)');
        if ($stmtUso) {
            $stmtUso->bind_param('s', $nombre);
            $stmtUso->execute();
            $usoTotal = (int)($stmtUso->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtUso->close();
            if ($usoTotal > 0) {
                out_exam(409, [
                    'success' => false,
                    'error' => 'No se puede inactivar: el grupo esta usado en examenes',
                    'error_code' => 'GRUPO_EN_USO',
                    'data' => [
                        'id' => $idGrupo,
                        'examenes_relacionados' => $usoTotal,
                    ],
                ]);
            }
        }
    } else {
        $parentRow = obtener_grupo_maestro_exam($mysqliOcup, $parent);
        $nombreParent = (string)($parentRow['nombre'] ?? '');

        if ($nombreParent !== '') {
            $stmtUsoSub = $mysqliOcup->prepare('SELECT COUNT(*) AS total
                                                FROM ocupacional_examenes_generales
                                                WHERE UPPER(TRIM(grupo)) = UPPER(?)
                                                  AND UPPER(TRIM(subgrupo)) = UPPER(?)');
            if ($stmtUsoSub) {
                $stmtUsoSub->bind_param('ss', $nombreParent, $nombre);
                $stmtUsoSub->execute();
                $usoTotal = (int)($stmtUsoSub->get_result()->fetch_assoc()['total'] ?? 0);
                $stmtUsoSub->close();
                if ($usoTotal > 0) {
                    out_exam(409, [
                        'success' => false,
                        'error' => 'No se puede inactivar: el subgrupo esta usado en examenes',
                        'error_code' => 'SUBGRUPO_EN_USO',
                        'data' => [
                            'id' => $idGrupo,
                            'examenes_relacionados' => $usoTotal,
                        ],
                    ]);
                }
            }
        }
    }

    $stmtInac = $mysqliOcup->prepare('UPDATE ocupacional_grupos_examenes SET estado = "inactivo", updated_by = ?, updated_at = NOW() WHERE id = ? LIMIT 1');
    if (!$stmtInac) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo inactivar grupo maestro']);
    }
    $stmtInac->bind_param('ii', $usuarioId, $idGrupo);
    $stmtInac->execute();
    $stmtInac->close();

    out_exam(200, ['success' => true, 'message' => 'Registro inactivado']);
}

if ($accion === 'importar_desde_laboratorio') {
    if (!isset($mysqli) || !($mysqli instanceof mysqli)) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo conectar a la base clinica para importar examen']);
    }
    if (!table_exists_exam($mysqli, 'examenes_laboratorio')) {
        out_exam(422, ['success' => false, 'error' => 'No existe tabla examenes_laboratorio en la base clinica']);
    }

    $requiredCols = [
        'origen_datos',
        'laboratorio_examen_id',
        'laboratorio_version_id',
        'laboratorio_snapshot_json',
    ];
    foreach ($requiredCols as $colName) {
        if (!column_exists_exam($mysqliOcup, 'ocupacional_examenes_generales', $colName)) {
            out_exam(500, ['success' => false, 'error' => 'Falta columna ' . $colName . ' en ocupacional_examenes_generales. Aplicar migracion de acople laboratorio.']);
        }
    }

    $labId = (int)($payload['laboratorio_examen_id'] ?? 0);
    if ($labId <= 0) {
        out_exam(422, ['success' => false, 'error' => 'laboratorio_examen_id es obligatorio']);
    }

    $grupoId = (int)($payload['grupo_id'] ?? 0);
    $subgrupoId = (int)($payload['subgrupo_id'] ?? 0);
    $grupoRaw = trim((string)($payload['grupo'] ?? 'LABORATORIO'));
    $subgrupoRaw = trim((string)($payload['subgrupo'] ?? ''));

    $codigoInput = strtoupper(force_utf8_exam_text($payload['codigo'] ?? ''));
    $codigo = $codigoInput !== '' ? $codigoInput : build_default_codigo_importado_exam($labId);
    $precioInput = normalize_precio_exam($payload['precio'] ?? null);
    $posicion = isset($payload['posicion']) ? max(0, (int)$payload['posicion']) : 0;

    $stmtLab = $mysqli->prepare('SELECT id, nombre, categoria, metodologia, valores_referenciales,
                                        precio_publico, precio_convenio, tipo_tubo, tipo_frasco,
                                        tiempo_resultado, condicion_paciente, preanalitica,
                                        activo
                                 FROM examenes_laboratorio
                                 WHERE id = ? LIMIT 1');
    if (!$stmtLab) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo consultar examen de laboratorio']);
    }
    $stmtLab->bind_param('i', $labId);
    $stmtLab->execute();
    $lab = $stmtLab->get_result()->fetch_assoc();
    $stmtLab->close();

    if (!$lab || (int)($lab['activo'] ?? 0) !== 1) {
        out_exam(404, ['success' => false, 'error' => 'Examen de laboratorio no encontrado o inactivo']);
    }

    $labNombre = repair_mojibake_exam_text($lab['nombre'] ?? '');
    $labCategoria = repair_mojibake_exam_text($lab['categoria'] ?? '');
    $labMetodologia = repair_mojibake_exam_text($lab['metodologia'] ?? '');
    $labTipoTubo = repair_mojibake_exam_text($lab['tipo_tubo'] ?? '');
    $labTipoFrasco = repair_mojibake_exam_text($lab['tipo_frasco'] ?? '');
    $labTiempoResultado = repair_mojibake_exam_text($lab['tiempo_resultado'] ?? '');
    $labCondicionPaciente = repair_mojibake_exam_text($lab['condicion_paciente'] ?? '');
    $labPreanalitica = repair_mojibake_exam_text($lab['preanalitica'] ?? '');

    [$grupo, $subgrupo] = resolve_nombre_grupo_subgrupo_exam($mysqliOcup, $grupoId, $subgrupoId, $grupoRaw, $subgrupoRaw);
    $grupo = repair_mojibake_exam_text($grupo);
    $subgrupo = repair_mojibake_exam_text($subgrupo);
    if ($subgrupo === '') {
        $subgrupo = repair_mojibake_exam_text($labCategoria);
    }

    $versionId = 0;
    if (table_exists_exam($mysqli, 'examenes_laboratorio_versiones')) {
        $stmtVersion = $mysqli->prepare('SELECT id
                                         FROM examenes_laboratorio_versiones
                                         WHERE examen_id = ?
                                         ORDER BY version_num DESC, id DESC
                                         LIMIT 1');
        if ($stmtVersion) {
            $stmtVersion->bind_param('i', $labId);
            $stmtVersion->execute();
            $versionId = (int)($stmtVersion->get_result()->fetch_assoc()['id'] ?? 0);
            $stmtVersion->close();
        }
    }

    $valoresReferenciales = normalize_mojibake_recursive_exam(
        decode_json_any_exam($lab['valores_referenciales'] ?? '')
    );
    $snapshot = [
        'origen' => 'laboratorio_moderno',
        'laboratorio_examen_id' => $labId,
        'laboratorio_version_id' => $versionId,
        'nombre' => $labNombre,
        'categoria' => $labCategoria,
        'metodologia' => $labMetodologia,
        'valores_referenciales' => $valoresReferenciales,
        'precio_publico' => isset($lab['precio_publico']) ? (float)$lab['precio_publico'] : 0,
        'precio_convenio' => isset($lab['precio_convenio']) ? (float)$lab['precio_convenio'] : 0,
        'tipo_tubo' => $labTipoTubo,
        'tipo_frasco' => $labTipoFrasco,
        'tiempo_resultado' => $labTiempoResultado,
        'condicion_paciente' => $labCondicionPaciente,
        'preanalitica' => $labPreanalitica,
        'imported_at' => date('c'),
    ];
    $snapshotJson = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $descripcion = repair_mojibake_exam_text($labNombre);
    $valoresNormales = repair_mojibake_exam_text($labMetodologia);
    if ($valoresNormales === '') {
        $valoresNormales = 'Importado desde laboratorio moderno';
    }
    $precio = $precioInput;
    if ($precio === null) {
        $precio = (float)($lab['precio_publico'] ?? 0);
    }

    $stmtByLab = $mysqliOcup->prepare('SELECT id, codigo
                                       FROM ocupacional_examenes_generales
                                       WHERE laboratorio_examen_id = ?
                                       LIMIT 1');
    if (!$stmtByLab) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo validar vinculacion ocupacional del examen']);
    }
    $stmtByLab->bind_param('i', $labId);
    $stmtByLab->execute();
    $ocupActual = $stmtByLab->get_result()->fetch_assoc();
    $stmtByLab->close();

    if (!$ocupActual) {
        $stmtDupCod = $mysqliOcup->prepare('SELECT id FROM ocupacional_examenes_generales WHERE codigo = ? LIMIT 1');
        if ($stmtDupCod) {
            $stmtDupCod->bind_param('s', $codigo);
            $stmtDupCod->execute();
            $dupCod = $stmtDupCod->get_result()->fetch_assoc();
            $stmtDupCod->close();
            if ($dupCod) {
                $codigo = build_default_codigo_importado_exam($labId) . '_' . (string)$labId;
            }
        }

        $stmtInsLab = $mysqliOcup->prepare('INSERT INTO ocupacional_examenes_generales
                                             (codigo, descripcion, grupo, subgrupo, valores_normales, precio, posicion, estado,
                                              origen_datos, laboratorio_examen_id, laboratorio_version_id, laboratorio_snapshot_json,
                                              created_by, updated_by)
                                             VALUES (?, ?, ?, ?, ?, ?, ?, "activo", "importado_lab", ?, ?, ?, ?, ?)');
        if (!$stmtInsLab) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo insertar examen ocupacional importado']);
        }
        $stmtInsLab->bind_param('sssssdiiisii', $codigo, $descripcion, $grupo, $subgrupo, $valoresNormales, $precio, $posicion, $labId, $versionId, $snapshotJson, $usuarioId, $usuarioId);
        if (!execute_stmt_exam($stmtInsLab, 'No se pudo guardar examen ocupacional importado')) {
            $stmtInsLab->close();
            out_exam(500, ['success' => false, 'error' => 'No se pudo guardar examen ocupacional importado']);
        }
        $newId = (int)$stmtInsLab->insert_id;
        $stmtInsLab->close();

        out_exam(201, [
            'success' => true,
            'data' => [
                'id' => $newId,
                'codigo' => $codigo,
                'descripcion' => $descripcion,
                'origen_datos' => 'importado_lab',
                'laboratorio_examen_id' => $labId,
                'laboratorio_version_id' => $versionId,
                'accion' => 'creado',
            ],
        ]);
    }

    $ocupId = (int)($ocupActual['id'] ?? 0);
    $stmtUpLab = $mysqliOcup->prepare('UPDATE ocupacional_examenes_generales
                                       SET codigo = ?,
                                           descripcion = ?,
                                           grupo = ?,
                                           subgrupo = ?,
                                           valores_normales = ?,
                                           precio = ?,
                                           posicion = ?,
                                           origen_datos = "importado_lab",
                                           laboratorio_examen_id = ?,
                                           laboratorio_version_id = ?,
                                           laboratorio_snapshot_json = ?,
                                           updated_by = ?,
                                           updated_at = NOW()
                                       WHERE id = ?
                                       LIMIT 1');
    if (!$stmtUpLab) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo actualizar examen ocupacional importado']);
    }
    $stmtUpLab->bind_param('sssssdiiisii', $codigo, $descripcion, $grupo, $subgrupo, $valoresNormales, $precio, $posicion, $labId, $versionId, $snapshotJson, $usuarioId, $ocupId);
    execute_stmt_exam($stmtUpLab, 'No se pudo actualizar examen ocupacional importado');
    $stmtUpLab->close();

    out_exam(200, [
        'success' => true,
        'data' => [
            'id' => $ocupId,
            'codigo' => $codigo,
            'descripcion' => $descripcion,
            'origen_datos' => 'importado_lab',
            'laboratorio_examen_id' => $labId,
            'laboratorio_version_id' => $versionId,
            'accion' => 'actualizado',
        ],
    ]);
}

if ($accion === 'inactivar') {
    $id = (int)($payload['id'] ?? 0);
    if ($id <= 0) {
        out_exam(422, ['success' => false, 'error' => 'id es obligatorio para inactivar']);
    }

    if (table_exists_exam($mysqliOcup, 'ocupacional_catalogo_empresas')) {
        $stmtUso = $mysqliOcup->prepare('SELECT COUNT(*) AS total,
                                                COUNT(DISTINCT empresa_id) AS empresas
                                         FROM ocupacional_catalogo_empresas
                                         WHERE examen_id = ? AND estado = "activo"');
        if (!$stmtUso) {
            out_exam(500, ['success' => false, 'error' => 'No se pudo validar uso del examen en empresas']);
        }
        $stmtUso->bind_param('i', $id);
        $stmtUso->execute();
        $uso = $stmtUso->get_result()->fetch_assoc();
        $stmtUso->close();
        $asignacionesActivas = (int)($uso['total'] ?? 0);
        if ($asignacionesActivas > 0) {
            $empresasRelacionadas = (int)($uso['empresas'] ?? 0);
            out_exam(409, [
                'success' => false,
                'error' => 'No se puede inactivar: el examen sigue activo en ' . $empresasRelacionadas . ' empresa(s). Desactivelo primero en Catalogo por Empresa',
                'error_code' => 'EXAMEN_ASIGNADO_EMPRESAS',
                'data' => [
                    'id' => $id,
                    'asignaciones_activas' => $asignacionesActivas,
                    'empresas_relacionadas' => $empresasRelacionadas,
                ],
            ]);
        }
    }

    $stmtInactivar = $mysqliOcup->prepare('UPDATE ocupacional_examenes_generales SET estado = "inactivo", updated_by = ?, updated_at = NOW() WHERE id = ? AND estado <> "inactivo" LIMIT 1');
    if (!$stmtInactivar) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo preparar la inactivacion']);
    }

    $stmtInactivar->bind_param('ii', $usuarioId, $id);
    $stmtInactivar->execute();
    $affected = (int)$stmtInactivar->affected_rows;
    $stmtInactivar->close();

    if ($affected <= 0) {
        out_exam(404, ['success' => false, 'error' => 'Examen no encontrado o ya inactivo']);
    }

    out_exam(200, ['success' => true, 'message' => 'Examen inactivado']);
}

$id = (int)($payload['id'] ?? 0);
$codigo = strtoupper(force_utf8_exam_text($payload['codigo'] ?? ''));
$descripcion = repair_mojibake_exam_text($payload['descripcion'] ?? '');
$grupoId = (int)($payload['grupo_id'] ?? 0);
$subgrupoId = (int)($payload['subgrupo_id'] ?? 0);
$grupo = repair_mojibake_exam_text($payload['grupo'] ?? '');
$subgrupo = repair_mojibake_exam_text($payload['subgrupo'] ?? '');
$valoresNormales = repair_mojibake_exam_text($payload['valores_normales'] ?? '');
$precio = normalize_precio_exam($payload['precio'] ?? 0);
$posicion = isset($payload['posicion']) ? (int)$payload['posicion'] : 0;

[$grupo, $subgrupo] = resolve_nombre_grupo_subgrupo_exam($mysqliOcup, $grupoId, $subgrupoId, $grupo, $subgrupo);
$grupo = repair_mojibake_exam_text($grupo);
$subgrupo = repair_mojibake_exam_text($subgrupo);

if ($codigo === '') {
    out_exam(422, ['success' => false, 'error' => 'codigo es obligatorio']);
}
if ($descripcion === '') {
    out_exam(422, ['success' => false, 'error' => 'descripcion es obligatoria']);
}
if ($precio === null) {
    out_exam(422, ['success' => false, 'error' => 'precio invalido']);
}
if ($posicion < 0) {
    out_exam(422, ['success' => false, 'error' => 'posicion invalida']);
}

if ($id > 0) {
    $stmtDup = $mysqliOcup->prepare('SELECT id FROM ocupacional_examenes_generales WHERE codigo = ? AND id <> ? LIMIT 1');
    if (!$stmtDup) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo validar codigo']);
    }
    $stmtDup->bind_param('si', $codigo, $id);
    $stmtDup->execute();
    $dup = $stmtDup->get_result()->fetch_assoc();
    $stmtDup->close();
    if ($dup) {
        out_exam(409, ['success' => false, 'error' => 'Ya existe un examen con este codigo']);
    }

    $stmt = $mysqliOcup->prepare('UPDATE ocupacional_examenes_generales SET codigo = ?, descripcion = ?, grupo = ?, subgrupo = ?, valores_normales = ?, precio = ?, posicion = ?, updated_by = ?, updated_at = NOW() WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_exam(500, ['success' => false, 'error' => 'No se pudo preparar actualizacion']);
    }
    $stmt->bind_param('sssssdiii', $codigo, $descripcion, $grupo, $subgrupo, $valoresNormales, $precio, $posicion, $usuarioId, $id);
    execute_stmt_exam($stmt, 'No se pudo actualizar el examen');
    $affected = (int)$stmt->affected_rows;
    $stmt->close();

    if ($affected <= 0) {
        $stmtCheck = $mysqliOcup->prepare('SELECT id FROM ocupacional_examenes_generales WHERE id = ? LIMIT 1');
        if ($stmtCheck) {
            $stmtCheck->bind_param('i', $id);
            $stmtCheck->execute();
            $exists = (bool)$stmtCheck->get_result()->fetch_assoc();
            $stmtCheck->close();
            if (!$exists) {
                out_exam(404, ['success' => false, 'error' => 'Examen no encontrado']);
            }
        }
    }

    out_exam(200, [
        'success' => true,
        'data' => [
            'id' => $id,
            'codigo' => $codigo,
            'descripcion' => $descripcion,
        ],
    ]);
}

$stmtDup = $mysqliOcup->prepare('SELECT id FROM ocupacional_examenes_generales WHERE codigo = ? LIMIT 1');
if (!$stmtDup) {
    out_exam(500, ['success' => false, 'error' => 'No se pudo validar codigo']);
}
$stmtDup->bind_param('s', $codigo);
$stmtDup->execute();
$dup = $stmtDup->get_result()->fetch_assoc();
$stmtDup->close();
if ($dup) {
    out_exam(409, ['success' => false, 'error' => 'Ya existe un examen con este codigo']);
}

$stmt = $mysqliOcup->prepare('INSERT INTO ocupacional_examenes_generales (codigo, descripcion, grupo, subgrupo, valores_normales, precio, posicion, estado, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, "activo", ?, ?)');
if (!$stmt) {
    out_exam(500, ['success' => false, 'error' => 'No se pudo preparar insercion']);
}
$stmt->bind_param('sssssdiii', $codigo, $descripcion, $grupo, $subgrupo, $valoresNormales, $precio, $posicion, $usuarioId, $usuarioId);

if (!execute_stmt_exam($stmt, 'No se pudo registrar el examen')) {
    $stmt->close();
    out_exam(500, ['success' => false, 'error' => 'No se pudo registrar el examen']);
}

$newId = (int)$stmt->insert_id;
$stmt->close();

out_exam(201, [
    'success' => true,
    'data' => [
        'id' => $newId,
        'codigo' => $codigo,
        'descripcion' => $descripcion,
        'estado' => 'activo',
    ],
]);
