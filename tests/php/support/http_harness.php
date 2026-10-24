<?php
// Ejecuta un endpoint PHP del proyecto en CLI como si fuera una petición HTTP (usuario administrador simulado).
// Uso: php http_harness.php <endpoint.php> <GET|POST> <archivo con JSON (POST) o querystring (GET)>
// Salida: el cuerpo que habría recibido el navegador.
$endpoint = $argv[1] ?? '';
$method = strtoupper($argv[2] ?? 'GET');
$payload = is_file($argv[3] ?? '') ? trim((string)file_get_contents($argv[3])) : '';
$root = dirname(__DIR__, 3);

// POLI_TEST_DB redirige la conexión a una base clon (siempre debe terminar en _test).
$bdPrueba = (string)getenv('POLI_TEST_DB');
if ($bdPrueba !== '') {
    if (substr($bdPrueba, -5) !== '_test') {
        fwrite(STDERR, "POLI_TEST_DB debe terminar en _test\n");
        exit(2);
    }
    define('DB_NAME', $bdPrueba);
}

$body = '';
class HarnessInput {
    public $context;
    private $pos = 0;
    function stream_open($path, $mode, $options, &$opened) { return true; }
    function stream_read($count) { global $body; $chunk = substr($body, $this->pos, $count); $this->pos += strlen($chunk); return $chunk; }
    function stream_eof() { global $body; return $this->pos >= strlen($body); }
    function stream_stat() { return []; }
}

if ($method === 'POST') {
    $body = $payload;
    stream_wrapper_unregister('php');
    stream_wrapper_register('php', 'HarnessInput');
} else {
    parse_str($payload, $_GET);
}

$_SERVER['REQUEST_METHOD'] = $method;
$_SERVER['REQUEST_URI'] = '/' . $endpoint;
$_SERVER['HTTP_ORIGIN'] = 'http://127.0.0.1:5173';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_SERVER['CONTENT_TYPE'] = 'application/json';

$sessionId = 'phptest' . getmypid();
session_id($sessionId);
session_start();
$_SESSION['usuario'] = ['id' => 18, 'rol' => 'administrador', 'usuario' => 'phptest', 'nombre' => 'PHP Test'];
session_write_close();
register_shutdown_function(function () use ($sessionId) {
    @unlink(session_save_path() . '/sess_' . $sessionId);
});

chdir($root);
require $root . '/' . $endpoint;
