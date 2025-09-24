
<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'None',
]);
session_start();
// api_ultima_hc.php: Devuelve el último código de historia clínica registrado
// CORS para localhost y producción
$allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
  header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  exit();
}
require_once __DIR__ . '/config.php';
header('Content-Type: application/json');
$res = $conn->query("SELECT historia_clinica FROM pacientes ORDER BY id DESC LIMIT 1");
$row = $res ? $res->fetch_assoc() : null;
echo json_encode([
  'success' => true,
  'ultima_hc' => $row ? $row['historia_clinica'] : null
]);
