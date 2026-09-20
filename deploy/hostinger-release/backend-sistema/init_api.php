<?php
// init_api.php

if (!ob_get_level()) {
    ob_start(function ($buffer) {
        static $bomStripped = false;
        if (!$bomStripped) {
            $buffer = preg_replace('/^\xEF\xBB\xBF/', '', $buffer);
            $bomStripped = true;
        }
        return $buffer;
    });
}

if (!function_exists('api_debug_enabled')) {
    function api_debug_enabled(): bool
    {
        static $enabled = null;
        if ($enabled !== null) {
            return $enabled;
        }

        $queryDebug = isset($_GET['__debug']) && (string)$_GET['__debug'] === '1';
        $envDebug = trim((string)(getenv('APP_DEBUG_VISUAL') ?: '')) === '1';
        $enabled = $queryDebug || $envDebug;
        return $enabled;
    }
}

if (!function_exists('api_emit_debug_error')) {
    function api_emit_debug_error(array $payload, int $status = 500): void
    {
        if (headers_sent()) {
            echo "\n" . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }

        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

if (!function_exists('api_request_id')) {
    function api_request_id(): string
    {
        static $requestId = null;
        if ($requestId !== null) {
            return $requestId;
        }

        $headerId = trim((string)($_SERVER['HTTP_X_REQUEST_ID'] ?? ''));
        if ($headerId !== '') {
            $requestId = substr(preg_replace('/[^A-Za-z0-9._\-]/', '', $headerId), 0, 64);
            if ($requestId !== '') {
                return $requestId;
            }
        }

        try {
            $requestId = bin2hex(random_bytes(8));
        } catch (Throwable $e) {
            $requestId = substr(sha1(uniqid('', true)), 0, 16);
        }

        return $requestId;
    }
}

if (!function_exists('api_emit_error')) {
    function api_emit_error(string $message, int $status = 500, array $extra = []): void
    {
        $payload = array_merge([
            'success' => false,
            'error' => $message,
            'request_id' => api_request_id(),
        ], $extra);

        if (headers_sent()) {
            echo "\n" . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }

        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Request-Id: ' . api_request_id());
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

if (!function_exists('api_log_server_error')) {
    function api_log_server_error(string $kind, string $message, string $file = '', int $line = 0): void
    {
        $rid = api_request_id();
        $path = (string)($_SERVER['REQUEST_URI'] ?? '');
        $method = (string)($_SERVER['REQUEST_METHOD'] ?? '');
        $originFile = $file !== '' ? $file : 'unknown';
        $originLine = $line > 0 ? (string)$line : '0';
        error_log(sprintf('[API_ERROR][%s][rid:%s][%s %s] %s @ %s:%s', $kind, $rid, $method, $path, $message, $originFile, $originLine));
    }
}

if (!defined('API_GLOBAL_ERROR_HANDLERS_REGISTERED')) {
    define('API_GLOBAL_ERROR_HANDLERS_REGISTERED', true);

    set_exception_handler(function (Throwable $e) {
        api_log_server_error('exception', $e->getMessage(), $e->getFile(), (int)$e->getLine());

        if (api_debug_enabled()) {
            api_emit_debug_error([
                'success' => false,
                'debug' => true,
                'type' => 'exception',
                'class' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
                'request_id' => api_request_id(),
            ], 500);
            exit;
        }

        api_emit_error('Error interno del servidor', 500);
        exit;
    });

    set_error_handler(function ($severity, $message, $file, $line) {
        if (!(error_reporting() & $severity)) {
            return false;
        }
        throw new ErrorException($message, 0, $severity, $file, $line);
    });

    register_shutdown_function(function () {
        $error = error_get_last();
        if (!$error) {
            return;
        }

        $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
        if (!in_array($error['type'] ?? 0, $fatalTypes, true)) {
            return;
        }

        api_log_server_error(
            'fatal',
            (string)($error['message'] ?? 'Fatal error'),
            (string)($error['file'] ?? ''),
            (int)($error['line'] ?? 0)
        );

        if (api_debug_enabled()) {
            api_emit_debug_error([
                'success' => false,
                'debug' => true,
                'type' => 'fatal',
                'message' => (string)($error['message'] ?? 'Fatal error'),
                'file' => (string)($error['file'] ?? ''),
                'line' => (int)($error['line'] ?? 0),
                'request_id' => api_request_id(),
            ], 500);
            return;
        }

        api_emit_error('Error interno del servidor', 500);
    });
}

// Zona horaria
date_default_timezone_set('America/Lima');

// Sesion adaptable por host actual
$requestHost = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost';
$requestHost = preg_replace('/:\\d+$/', '', strtolower((string)$requestHost));
$isLocalHost = ($requestHost === 'localhost' || $requestHost === '127.0.0.1');
$forwardedProto = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https';

// Usar cookie host-only (sin domain explícito) evita conflictos de sesión en proxys/túneles.
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isLocalHost ? false : $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// CORS adaptable
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176',
    'http://localhost',
    'http://127.0.0.1',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];

// Permite el origin actual del host para despliegues por instancia/subdominio
$currentOrigin = ($isHttps ? 'https://' : 'http://') . $requestHost;
if (!in_array($currentOrigin, $allowedOrigins, true)) {
    $allowedOrigins[] = $currentOrigin;
}

// Si la API vive en sistema.<dominio>, permitir también landing en <dominio> y www.<dominio>
if (strpos($requestHost, 'sistema.') === 0) {
    $baseHost = preg_replace('/^sistema\./', '', $requestHost, 1);
    if ($baseHost !== '') {
        $rootOrigin = ($isHttps ? 'https://' : 'http://') . $baseHost;
        $wwwOrigin = ($isHttps ? 'https://' : 'http://') . 'www.' . $baseHost;

        if (!in_array($rootOrigin, $allowedOrigins, true)) {
            $allowedOrigins[] = $rootOrigin;
        }
        if (!in_array($wwwOrigin, $allowedOrigins, true)) {
            $allowedOrigins[] = $wwwOrigin;
        }
    }
}

// Origins extra opcionales via .env: CORS_ALLOWED_ORIGINS="https://a.com,https://b.com"
$extraOrigins = trim((string)(getenv('CORS_ALLOWED_ORIGINS') ?: ''));
if ($extraOrigins !== '') {
    foreach (explode(',', $extraOrigins) as $originItem) {
        $originItem = trim($originItem);
        if ($originItem !== '' && !in_array($originItem, $allowedOrigins, true)) {
            $allowedOrigins[] = $originItem;
        }
    }
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('X-Request-Id: ' . api_request_id());
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');