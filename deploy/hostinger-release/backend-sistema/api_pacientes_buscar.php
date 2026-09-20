<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function pacientes_buscar_ends_with(string $haystack, string $needle): bool {
    if ($needle === '') return true;
    $hayLen = strlen($haystack);
    $needLen = strlen($needle);
    if ($needLen > $hayLen) return false;
    return substr($haystack, -$needLen) === $needle;
}

function pacientes_buscar_cache_dir(): string {
    return __DIR__ . DIRECTORY_SEPARATOR . 'tmp' . DIRECTORY_SEPARATOR . 'api-cache';
}

function pacientes_buscar_cache_file_for_dni(string $dni): string {
    $safe = preg_replace('/[^0-9]/', '', $dni);
    return pacientes_buscar_cache_dir() . DIRECTORY_SEPARATOR . 'reniec_dni_' . $safe . '.json';
}

function pacientes_buscar_cache_read_dni(string $dni, int $ttlSeconds = 86400): ?array {
    $path = pacientes_buscar_cache_file_for_dni($dni);
    if (!is_file($path)) return null;

    $mtime = @filemtime($path);
    if (!is_int($mtime) || $mtime <= 0) return null;
    if ((time() - $mtime) > $ttlSeconds) return null;

    $raw = @file_get_contents($path);
    if (!is_string($raw) || $raw === '') return null;
    $data = json_decode($raw, true);
    if (!is_array($data)) return null;

    return $data;
}

function pacientes_buscar_cache_write_dni(string $dni, array $payload): void {
    $dir = pacientes_buscar_cache_dir();
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    if (!is_dir($dir)) return;

    $path = pacientes_buscar_cache_file_for_dni($dni);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($json) || $json === '') return;
    @file_put_contents($path, $json, LOCK_EX);
}

function pacientes_buscar_resolver_token_externo(): string {
    $candidates = [
        'APISPERU_TOKEN',
        'APIS_PERU_TOKEN',
        'DNIRUC_TOKEN',
    ];

    foreach ($candidates as $key) {
        $value = trim((string)(getenv($key) ?: ($_ENV[$key] ?? '')));
        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function pacientes_buscar_consulta_dni_externa(string $dni): array {
    if (!preg_match('/^\d{8}$/', $dni)) {
        return ['found' => false, 'error' => 'DNI inválido para consulta externa'];
    }

    $token = pacientes_buscar_resolver_token_externo();
    if ($token === '') {
        return ['found' => false, 'error' => 'Token externo no configurado'];
    }

    $cached = pacientes_buscar_cache_read_dni($dni, 86400);
    if (is_array($cached) && !empty($cached['found'])) {
        return $cached;
    }

    $baseUrl = trim((string)(getenv('APISPERU_BASE_URL') ?: ($_ENV['APISPERU_BASE_URL'] ?? 'https://dniruc.apisperu.com/api/v1')));
    if ($baseUrl === '') {
        $baseUrl = 'https://dniruc.apisperu.com/api/v1';
    }
    if (pacientes_buscar_ends_with($baseUrl, '/')) {
        $baseUrl = rtrim($baseUrl, '/');
    }

    $url = $baseUrl . '/dni/' . rawurlencode($dni) . '?token=' . rawurlencode($token);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 4,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_DNS_CACHE_TIMEOUT => 300,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
        ],
    ]);

    if (defined('CURL_IPRESOLVE_V4')) {
        curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    }

    $body = curl_exec($ch);
    $curlErr = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false) {
        return ['found' => false, 'error' => $curlErr !== '' ? $curlErr : 'Error de red en consulta externa'];
    }

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        return ['found' => false, 'error' => 'Respuesta externa inválida'];
    }

    if ($httpCode >= 400) {
        $message = trim((string)($decoded['message'] ?? $decoded['error'] ?? 'Servicio externo no disponible'));
        return ['found' => false, 'error' => $message !== '' ? $message : 'Servicio externo no disponible'];
    }

    $nombres = trim((string)($decoded['nombres'] ?? ''));
    $apellidoPaterno = trim((string)($decoded['apellidoPaterno'] ?? $decoded['apellido_paterno'] ?? ''));
    $apellidoMaterno = trim((string)($decoded['apellidoMaterno'] ?? $decoded['apellido_materno'] ?? ''));
    $apellidos = trim($apellidoPaterno . ' ' . $apellidoMaterno);

    if ($nombres === '' && $apellidos === '') {
        return ['found' => false, 'error' => 'Documento no encontrado en servicio externo'];
    }

    $out = [
        'found' => true,
        'provider' => 'apis_peru',
        'sugerencia' => [
            'tipo_documento' => 'dni',
            'dni' => $dni,
            'nombre' => $nombres,
            'apellido' => $apellidos,
            'nombres' => $nombres,
            'apellido_paterno' => $apellidoPaterno,
            'apellido_materno' => $apellidoMaterno,
            'fuente' => 'apis_peru',
        ],
    ];

    pacientes_buscar_cache_write_dni($dni, $out);
    return $out;
}

function pacientes_buscar_table_exists($conn, string $table): bool {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function pacientes_buscar_column_exists($conn, string $table, string $column): bool {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function columnas_busqueda_pacientes(): string {
    global $conn;
    $hasGrupo = pacientes_buscar_column_exists($conn, 'pacientes', 'grupo_sanguineo');
    $hasRh = pacientes_buscar_column_exists($conn, 'pacientes', 'factor_rh');

    return 'id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, sexo, '
        . ($hasGrupo ? 'grupo_sanguineo' : 'NULL AS grupo_sanguineo') . ', '
        . ($hasRh ? 'factor_rh' : 'NULL AS factor_rh') . ', creado_en';
}

function cargar_acompanantes_busqueda($conn, array $pacientes): array {
    if (!$pacientes || !pacientes_buscar_table_exists($conn, 'pacientes_acompanantes')) {
        foreach ($pacientes as &$p) {
            $p['acompanantes'] = [];
        }
        unset($p);
        return $pacientes;
    }

    $ids = [];
    foreach ($pacientes as $p) {
        $id = (int)($p['id'] ?? 0);
        if ($id > 0) $ids[] = $id;
    }
    if (!$ids) {
        foreach ($pacientes as &$p) {
            $p['acompanantes'] = [];
        }
        unset($p);
        return $pacientes;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $sql = "SELECT id, paciente_id, nombre_completo, parentesco, telefono, es_principal, creado_en FROM pacientes_acompanantes WHERE paciente_id IN ($placeholders) ORDER BY paciente_id ASC, es_principal DESC, id ASC";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        foreach ($pacientes as &$p) {
            $p['acompanantes'] = [];
        }
        unset($p);
        return $pacientes;
    }

    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $res = $stmt->get_result();

    $map = [];
    while ($row = $res->fetch_assoc()) {
        $pid = (int)$row['paciente_id'];
        if (!isset($map[$pid])) $map[$pid] = [];
        if (count($map[$pid]) < 2) {
            $map[$pid][] = $row;
        }
    }
    $stmt->close();

    foreach ($pacientes as &$p) {
        $pid = (int)($p['id'] ?? 0);
        $p['acompanantes'] = $map[$pid] ?? [];
    }
    unset($p);
    return $pacientes;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $tipo = $data['tipo'] ?? '';
    $valor = trim((string)($data['valor'] ?? ''));
    $sql = '';
    $params = [];
    $types = '';
    $select = columnas_busqueda_pacientes();

    if ($valor === '') {
        echo json_encode(['success' => false, 'error' => 'Valor de búsqueda requerido']);
        exit;
    }

    if ($tipo === 'dni') {
        $sql = "SELECT $select FROM pacientes WHERE dni = ? LIMIT 5";
        $params[] = $valor;
        $types = 's';
    } elseif ($tipo === 'carnet_extranjeria') {
        $sql = "SELECT $select FROM pacientes WHERE dni = ? LIMIT 5";
        $params[] = $valor;
        $types = 's';
    } elseif ($tipo === 'nombre') {
        $valorUpper = strtoupper($valor);
        if (preg_match('/^HC\d+$/i', $valorUpper)) {
            $sql = "SELECT $select FROM pacientes WHERE historia_clinica = ? LIMIT 5";
            $params[] = $valorUpper;
            $types = 's';
        } elseif (preg_match('/^\d+$/', $valor)) {
            if (strlen($valor) >= 8) {
                $sql = "SELECT $select FROM pacientes WHERE dni = ? LIMIT 5";
                $params[] = $valor;
                $types = 's';
            } else {
                $sql = "SELECT $select FROM pacientes WHERE dni LIKE ? OR historia_clinica LIKE ? ORDER BY id DESC LIMIT 20";
                $params[] = "{$valor}%";
                $params[] = "HC{$valor}%";
                $types = 'ss';
            }
        } else {
        // Separar por espacios y buscar cada palabra en nombre o apellido (OR)
            $palabras = preg_split('/\s+/', $valor);
            $where = [];
            $types = '';
            foreach ($palabras as $palabra) {
                $palabra = trim($palabra);
                if ($palabra === '') continue;
                $where[] = '(nombre LIKE ? OR apellido LIKE ?)';
                $params[] = "%$palabra%";
                $params[] = "%$palabra%";
                $types .= 'ss';
            }
            if (!$where) {
                echo json_encode(['success' => false, 'error' => 'Valor de búsqueda requerido']);
                exit;
            }
            $sql = "SELECT $select FROM pacientes WHERE " . implode(' OR ', $where) . ' ORDER BY id DESC LIMIT 20';
        }
    } elseif ($tipo === 'historia') {
        $sql = "SELECT $select FROM pacientes WHERE historia_clinica = ? LIMIT 5";
        $params[] = strtoupper($valor);
        $types = 's';
    } else {
        echo json_encode(['success' => false, 'error' => 'Tipo de búsqueda inválido']);
        exit;
    }

    $stmt = $conn->prepare($sql);
    if ($types) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $pacientes = $res->fetch_all(MYSQLI_ASSOC);
    $pacientes = cargar_acompanantes_busqueda($conn, $pacientes);
    if ($pacientes && count($pacientes) > 0) {
        echo json_encode([
            'success' => true,
            'pacientes' => $pacientes,
            'fuente' => 'local',
        ]);
    } else {
        $consultaExterna = null;
        if ($tipo === 'dni' && preg_match('/^\d{8}$/', $valor)) {
            $consultaExterna = pacientes_buscar_consulta_dni_externa($valor);
        }

        $payload = [
            'success' => false,
            'error' => 'Paciente no encontrado',
            'fuente' => 'none',
        ];

        if (is_array($consultaExterna) && !empty($consultaExterna['found'])) {
            $payload['fuente'] = 'externa';
            $payload['sugerencia_externa'] = $consultaExterna['sugerencia'];
            $payload['proveedor_externo'] = $consultaExterna['provider'] ?? 'apis_peru';
            $payload['error'] = 'Paciente no encontrado en base local, pero existe en consulta externa';
        } elseif (is_array($consultaExterna) && !empty($consultaExterna['error'])) {
            $payload['detalle_externo'] = (string)$consultaExterna['error'];
        }

        echo json_encode($payload);
    }
    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
