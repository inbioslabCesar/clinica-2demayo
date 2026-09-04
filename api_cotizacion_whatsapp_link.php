<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

function ws_table_exists(mysqli $conn, string $table): bool
{
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function ws_ensure_share_table(mysqli $conn): void
{
    if (!ws_table_exists($conn, 'cotizacion_pdf_share_tokens')) {
        $conn->query("CREATE TABLE cotizacion_pdf_share_tokens (
            id INT NOT NULL AUTO_INCREMENT,
            cotizacion_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            max_uses INT NOT NULL DEFAULT 20,
            used_count INT NOT NULL DEFAULT 0,
            last_used_at DATETIME NULL,
            revoked_at DATETIME NULL,
            created_by_user_id INT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_token_hash (token_hash),
            KEY idx_cotizacion_id (cotizacion_id),
            KEY idx_expires_at (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }
}

function ws_base_url(): string
{
    $envCandidates = [
        getenv('APP_PUBLIC_BASE_URL') ?: '',
        getenv('SYSTEM_PUBLIC_URL') ?: '',
        getenv('APP_URL') ?: '',
    ];
    foreach ($envCandidates as $raw) {
        $url = trim((string)$raw);
        if ($url !== '' && preg_match('#^https?://#i', $url)) {
            return rtrim($url, '/');
        }
    }

    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $proto = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $proto === 'https';
    $scheme = $isHttps ? 'https' : 'http';

    // Si la app corre bajo subruta (ej. /sistema), conservarla en los links compartidos.
    $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    $basePath = str_replace('\\', '/', (string)dirname($scriptName));
    if ($basePath === '.' || $basePath === '/' || $basePath === '\\') {
        $basePath = '';
    } else {
        $basePath = '/' . trim($basePath, '/');
    }

    return $scheme . '://' . $host . $basePath;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

$raw = json_decode(file_get_contents('php://input'), true);
$cotizacionId = (int)($raw['cotizacion_id'] ?? 0);
$maxUses = (int)($raw['max_uses'] ?? 20);
$ttlHours = (int)($raw['ttl_hours'] ?? 24);

if ($cotizacionId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'cotizacion_id requerido']);
    exit;
}

$maxUses = max(1, min(100, $maxUses));
$ttlHours = max(1, min(168, $ttlHours));

$stmtCot = $conn->prepare('SELECT id FROM cotizaciones WHERE id = ? LIMIT 1');
if (!$stmtCot) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo validar cotizacion']);
    exit;
}
$stmtCot->bind_param('i', $cotizacionId);
$stmtCot->execute();
$cotRow = $stmtCot->get_result()->fetch_assoc();
$stmtCot->close();

if (!$cotRow) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Cotizacion no encontrada']);
    exit;
}

ws_ensure_share_table($conn);

$token = bin2hex(random_bytes(24));
$tokenHash = hash('sha256', $token);
$expiresAt = date('Y-m-d H:i:s', time() + ($ttlHours * 3600));
$createdBy = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : 0;
$createdBy = $createdBy > 0 ? $createdBy : null;

$stmtIns = $conn->prepare('INSERT INTO cotizacion_pdf_share_tokens (cotizacion_id, token_hash, expires_at, max_uses, created_by_user_id) VALUES (?, ?, ?, ?, ?)');
if (!$stmtIns) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo crear enlace de comparticion']);
    exit;
}
$stmtIns->bind_param('issii', $cotizacionId, $tokenHash, $expiresAt, $maxUses, $createdBy);
$okIns = $stmtIns->execute();
$stmtIns->close();

if (!$okIns) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo guardar token de comparticion']);
    exit;
}

$base = rtrim(ws_base_url(), '/');
$pdfUrl = $base . '/api_cotizacion_ticket_pdf.php?share_token=' . urlencode($token);
$pdfUrlFallback = $pdfUrl;

echo json_encode([
    'success' => true,
    'cotizacion_id' => $cotizacionId,
    'pdf_url' => $pdfUrl,
    'pdf_url_fallback' => $pdfUrlFallback,
    'share_token' => $token,
    'expires_at' => $expiresAt,
    'max_uses' => $maxUses,
]);
