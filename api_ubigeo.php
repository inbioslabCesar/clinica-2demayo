<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';
ModulosInstalacion::exigir($mysqli ?? ($pdo ?? null), 'ocupacional');

function ubigeo_out(int $status, array $payload): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function ubigeo_table_exists($conn, string $table): bool
{
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    ubigeo_out(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
    ubigeo_out(401, ['success' => false, 'error' => 'No autenticado']);
}

$tipo = strtolower(trim((string)($_GET['tipo'] ?? 'departamentos')));

if (!ubigeo_table_exists($conn, 'departamento') || !ubigeo_table_exists($conn, 'provincia') || !ubigeo_table_exists($conn, 'distrito')) {
    ubigeo_out(409, [
        'success' => false,
        'error' => 'Catalogo ubigeo no disponible. Ejecutar sql/2026-11-22/007_ubigeo_schema.sql y 008_ubigeo_data.sql',
    ]);
}

if ($tipo === 'departamentos') {
    $res = $conn->query('SELECT id, nombre FROM departamento ORDER BY nombre ASC');
    $rows = [];
    while ($res && ($row = $res->fetch_assoc())) {
        $rows[] = [
            'id' => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }
    ubigeo_out(200, ['success' => true, 'data' => $rows]);
}

if ($tipo === 'provincias') {
    $departamentoId = (int)($_GET['departamento_id'] ?? 0);
    if ($departamentoId <= 0) {
        ubigeo_out(422, ['success' => false, 'error' => 'departamento_id es obligatorio']);
    }
    $stmt = $conn->prepare('SELECT id, nombre FROM provincia WHERE departamento = ? ORDER BY nombre ASC');
    if (!$stmt) {
        ubigeo_out(500, ['success' => false, 'error' => 'No se pudo consultar provincias']);
    }
    $stmt->bind_param('i', $departamentoId);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($res && ($row = $res->fetch_assoc())) {
        $rows[] = [
            'id' => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }
    $stmt->close();
    ubigeo_out(200, ['success' => true, 'data' => $rows]);
}

if ($tipo === 'distritos') {
    $provinciaId = (int)($_GET['provincia_id'] ?? 0);
    if ($provinciaId <= 0) {
        ubigeo_out(422, ['success' => false, 'error' => 'provincia_id es obligatorio']);
    }
    $stmt = $conn->prepare('SELECT id, nombre FROM distrito WHERE provincia = ? ORDER BY nombre ASC');
    if (!$stmt) {
        ubigeo_out(500, ['success' => false, 'error' => 'No se pudo consultar distritos']);
    }
    $stmt->bind_param('i', $provinciaId);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($res && ($row = $res->fetch_assoc())) {
        $rows[] = [
            'id' => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }
    $stmt->close();
    ubigeo_out(200, ['success' => true, 'data' => $rows]);
}

ubigeo_out(422, ['success' => false, 'error' => 'tipo invalido. Use: departamentos, provincias o distritos']);
