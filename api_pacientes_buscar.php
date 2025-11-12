<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $tipo = $data['tipo'] ?? '';
    $valor = $data['valor'] ?? '';
    $sql = '';
    $params = [];
    $types = '';

    if ($tipo === 'dni') {
        $sql = 'SELECT * FROM pacientes WHERE dni = ?';
        $params[] = $valor;
        $types = 's';
    } elseif ($tipo === 'nombre') {
        // Separar por espacios y buscar cada palabra en nombre o apellido (OR)
        $palabras = preg_split('/\s+/', trim($valor));
        $where = [];
        $types = '';
        foreach ($palabras as $palabra) {
            $where[] = '(nombre LIKE ? OR apellido LIKE ?)';
            $params[] = "%$palabra%";
            $params[] = "%$palabra%";
            $types .= 'ss';
        }
        $sql = 'SELECT * FROM pacientes WHERE ' . implode(' OR ', $where);
    } elseif ($tipo === 'historia') {
        $sql = 'SELECT * FROM pacientes WHERE historia_clinica = ?';
        $params[] = $valor;
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
