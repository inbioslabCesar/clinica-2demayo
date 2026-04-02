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

$normalizeLogoSize = function ($value) {
    if ($value === null || $value === '') return null;
    if (!is_numeric($value)) return null;
    $n = intval($value);
    if ($n < 40) $n = 40;
    if ($n > 260) $n = 260;
    return $n;
};

try {
    $stmtHasColumn = $pdo->query("SHOW COLUMNS FROM configuracion_clinica LIKE 'logo_laboratorio_url'");
    $tieneLogoLaboratorio = (bool)$stmtHasColumn->fetch(PDO::FETCH_ASSOC);

    if (!$tieneLogoLaboratorio) {
        // Mantener separados ambos logos: crear columna dedicada para laboratorio.
        $pdo->exec("ALTER TABLE configuracion_clinica ADD COLUMN logo_laboratorio_url VARCHAR(255) NULL AFTER logo_url");
        $stmtHasColumn = $pdo->query("SHOW COLUMNS FROM configuracion_clinica LIKE 'logo_laboratorio_url'");
        $tieneLogoLaboratorio = (bool)$stmtHasColumn->fetch(PDO::FETCH_ASSOC);
        if (!$tieneLogoLaboratorio) {
            throw new Exception('No se pudo habilitar logo_laboratorio_url');
        }
    }

    $stmtHasSizeColumn = $pdo->query("SHOW COLUMNS FROM configuracion_clinica LIKE 'logo_laboratorio_size_pdf'");
    $tieneLogoSizePdf = (bool)$stmtHasSizeColumn->fetch(PDO::FETCH_ASSOC);
    if (!$tieneLogoSizePdf) {
        $pdo->exec("ALTER TABLE configuracion_clinica ADD COLUMN logo_laboratorio_size_pdf INT NULL AFTER logo_laboratorio_url");
        $stmtHasSizeColumn = $pdo->query("SHOW COLUMNS FROM configuracion_clinica LIKE 'logo_laboratorio_size_pdf'");
        $tieneLogoSizePdf = (bool)$stmtHasSizeColumn->fetch(PDO::FETCH_ASSOC);
        if (!$tieneLogoSizePdf) {
            throw new Exception('No se pudo habilitar logo_laboratorio_size_pdf');
        }
    }

    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT NULLIF(logo_laboratorio_url, '') AS logo, logo_laboratorio_size_pdf FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'logo_url' => $row['logo'] ?? null,
            'logo_size_pdf' => isset($row['logo_laboratorio_size_pdf']) && $row['logo_laboratorio_size_pdf'] !== null
                ? intval($row['logo_laboratorio_size_pdf'])
                : null,
            'source' => 'logo_laboratorio_url'
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
    $hasLogoSizeInput = is_array($input) && array_key_exists('logo_size_pdf', $input);
    $logoSizePdf = $hasLogoSizeInput ? $normalizeLogoSize($input['logo_size_pdf']) : null;

    $stmtId = $pdo->query("SELECT id, logo_laboratorio_size_pdf FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
    $rowId = $stmtId->fetch(PDO::FETCH_ASSOC);

    if (!$rowId) {
        echo json_encode(['success' => false, 'error' => 'No existe configuración clínica']);
        http_response_code(400);
        exit;
    }

    if (!$hasLogoSizeInput) {
        $logoSizePdf = isset($rowId['logo_laboratorio_size_pdf']) && $rowId['logo_laboratorio_size_pdf'] !== null
            ? intval($rowId['logo_laboratorio_size_pdf'])
            : null;
    }

    $stmtUpdate = $pdo->prepare("UPDATE configuracion_clinica SET logo_laboratorio_url = ?, logo_laboratorio_size_pdf = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $stmtUpdate->execute([$logoPath, $logoSizePdf, (int)$rowId['id']]);

    echo json_encode([
        'success' => true,
        'message' => 'Logo de laboratorio actualizado',
        'logo_url' => $logoPath,
        'logo_size_pdf' => $logoSizePdf,
        'source' => 'logo_laboratorio_url'
    ]);
} catch (Exception $e) {
    error_log('api_logo_laboratorio.php error: ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Error interno del servidor']);
    http_response_code(500);
}
