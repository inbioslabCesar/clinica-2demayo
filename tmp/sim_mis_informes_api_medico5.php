<?php
session_start();
$_SESSION['medico_id'] = 5;
$_SESSION['medico'] = ['id' => 5, 'rol' => 'medico', 'nombre' => 'JHONY'];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = [
  'medico_id' => 5,
  'tipo' => 'rx',
  'page' => 1,
  'limit' => 20,
];
ob_start();
include __DIR__ . '/../api_ordenes_imagen.php';
$out = ob_get_clean();
$data = json_decode($out, true);
if (!is_array($data)) {
  echo $out;
  exit;
}
foreach (($data['ordenes'] ?? []) as $o) {
  $pac = trim((string)(($o['paciente']['nombre'] ?? '') . ' ' . ($o['paciente']['apellido'] ?? '')));
  if (stripos($pac, 'BRIANA') !== false || stripos($pac, 'MARIA JUDITA') !== false) {
    echo json_encode([
      'orden_id' => (int)($o['id'] ?? 0),
      'paciente' => $pac,
      'indicaciones' => (string)($o['indicaciones'] ?? ''),
      'agenda_id' => (int)($o['agenda_id'] ?? 0),
      'fecha_programada' => (string)($o['fecha_programada'] ?? ''),
      'hora_programada' => (string)($o['hora_programada'] ?? ''),
      'correlativo_operativo' => (int)($o['correlativo_operativo'] ?? 0)
    ], JSON_UNESCAPED_UNICODE)."\n";
  }
}
?>
