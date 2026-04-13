<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function columnas_busqueda_pacientes(): string {
    return 'id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, sexo, creado_en';
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
