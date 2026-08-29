<?php
session_start();
$_SESSION['medico_id'] = 5;
$_SESSION['medico'] = ['id'=>5,'rol'=>'medico','nombre'=>'JHONY'];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = ['medico_id'=>5,'tipo'=>'rx','page'=>1,'limit'=>20];
ob_start();
include __DIR__ . '/../api_ordenes_imagen.php';
$out = ob_get_clean();
$data = json_decode($out, true);
if(!is_array($data)){ echo $out; exit; }
foreach(($data['ordenes'] ?? []) as $o){
  $p = $o['paciente'] ?? [];
  $nombre = trim((string)(($p['nombre'] ?? '') . ' ' . ($p['apellido'] ?? '')));
  if (stripos($nombre, 'LUCERO') === false) continue;
  echo json_encode([
    'orden_id'=>(int)($o['id']??0),
    'cotizacion_id'=>(int)($o['cotizacion_id']??0),
    'indicaciones'=>(string)($o['indicaciones']??''),
    'fecha_creacion'=>(string)($o['fecha']??''),
    'fecha_programada'=>(string)($o['fecha_programada']??''),
    'hora_programada'=>(string)($o['hora_programada']??''),
    'correlativo'=>(int)($o['correlativo_operativo']??0),
    'estado_evento'=>(string)($o['estado_evento_agenda']??''),
    'estado_cot'=>(string)(($o['cotizacion']['estado']??'')),
  ], JSON_UNESCAPED_UNICODE)."\n";
}
?>
