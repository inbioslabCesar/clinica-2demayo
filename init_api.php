<?php
// init_api.php

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

if (api_debug_enabled()) {
    set_exception_handler(function (Throwable $e) {
        api_emit_debug_error([
            'success' => false,
            'debug' => true,
            'type' => 'exception',
            'class' => get_class($e),
            'message' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => $e->getTraceAsString(),
        ], 500);
        exit;
    });

    set_error_handler(function ($severity, $message, $file, $line) {
        throw new ErrorException($message, 0, $severity, $file, $line);
    });

    register_shutdown_function(function () {
        $error = error_get_last();
        if (!$error) return;

        $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
        if (!in_array($error['type'] ?? 0, $fatalTypes, true)) return;

        api_emit_debug_error([
            'success' => false,
            'debug' => true,
            'type' => 'fatal',
            'message' => (string)($error['message'] ?? 'Fatal error'),
            'file' => (string)($error['file'] ?? ''),
            'line' => (int)($error['line'] ?? 0),
        ], 500);
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
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');