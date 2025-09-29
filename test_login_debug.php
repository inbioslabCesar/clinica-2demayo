<?php
// test_login_debug.php - Script temporal para debug del login en producción
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

echo json_encode([
    'method' => $_SERVER['REQUEST_METHOD'],
    'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'not set',
    'raw_input' => file_get_contents('php://input'),
    'json_decode' => json_decode(file_get_contents('php://input'), true),
    'get_data' => $_GET,
    'post_data' => $_POST,
    'headers' => getallheaders(),
    'https' => isset($_SERVER['HTTPS']) ? $_SERVER['HTTPS'] : 'not set',
    'server_protocol' => $_SERVER['SERVER_PROTOCOL'] ?? 'not set'
]);
?>