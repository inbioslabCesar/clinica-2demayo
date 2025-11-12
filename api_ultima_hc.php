
<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
]);
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'domain' => '.clinica2demayo.com',
  'secure' => true,
  'httponly' => true,
  'samesite' => 'Lax',
]);
session_start();
// api_ultima_hc.php: Devuelve el último código de historia clínica registrado
// CORS para localhost y producción
$allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'https://clinica2demayo.com',
  'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
  header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
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
