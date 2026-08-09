<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

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
        echo json_encode(['success' => true, 'pacientes' => $pacientes]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
    }
    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
