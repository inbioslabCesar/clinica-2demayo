
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
$res = $conn->query("SELECT historia_clinica FROM pacientes ORDER BY id DESC LIMIT 1");
$row = $res ? $res->fetch_assoc() : null;
echo json_encode([
  'success' => true,
  'ultima_hc' => $row ? $row['historia_clinica'] : null
]);
