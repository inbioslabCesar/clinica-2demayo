<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['usuario']) || !isset($_SESSION['usuario']['rol'])) {
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    http_response_code(401);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
$rolesPermitidos = ['administrador', 'laboratorista', 'quimico', 'químico'];

if (!in_array($rol, $rolesPermitidos, true)) {
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    http_response_code(403);
    exit;
}

$normalizeLogoPath = function ($value) {
    $raw = trim((string)$value);
    if ($raw === '') return null;

    $raw = str_replace('\\', '/', $raw);
    if (preg_match('~(?:^|/)(uploads/[^?#\s]+)$~i', $raw, $m) && !empty($m[1])) {
        $raw = $m[1];
    } else {
        $raw = preg_replace('#^\./#', '', $raw);
        $raw = ltrim($raw, '/');
    }

    return $raw !== '' ? $raw : null;
};

try {
    $stmtHasColumn = $pdo->query("SHOW COLUMNS FROM configuracion_clinica LIKE 'logo_laboratorio_url'");
    $tieneLogoLaboratorio = (bool)$stmtHasColumn->fetch(PDO::FETCH_ASSOC);

    if ($method === 'GET') {
        $selectLogo = $tieneLogoLaboratorio
            ? "COALESCE(NULLIF(logo_laboratorio_url, ''), NULLIF(logo_url, '')) AS logo"
            : "NULLIF(logo_url, '') AS logo";

        $stmt = $pdo->query("SELECT {$selectLogo} FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'logo_url' => $row['logo'] ?? null,
            'source' => $tieneLogoLaboratorio ? 'logo_laboratorio_url' : 'logo_url'
        ]);
        exit;
    }

    if ($method !== 'POST') {
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        http_response_code(405);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $logoPath = $normalizeLogoPath($input['logo_url'] ?? '');

    $stmtId = $pdo->query("SELECT id FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
    $rowId = $stmtId->fetch(PDO::FETCH_ASSOC);

    if (!$rowId) {
        echo json_encode(['success' => false, 'error' => 'No existe configuración clínica']);
        http_response_code(400);
        exit;
    }

    $campo = $tieneLogoLaboratorio ? 'logo_laboratorio_url' : 'logo_url';
    $stmtUpdate = $pdo->prepare("UPDATE configuracion_clinica SET {$campo} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $stmtUpdate->execute([$logoPath, (int)$rowId['id']]);

    echo json_encode([
        'success' => true,
        'message' => 'Logo de laboratorio actualizado',
        'logo_url' => $logoPath,
        'source' => $campo
    ]);
} catch (Exception $e) {
    error_log('api_logo_laboratorio.php error: ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Error interno del servidor']);
    http_response_code(500);
}
