<?php
require __DIR__ . '/../config.php';
$medicoId = 5;

echo "COLUMNAS_HONORARIOS\n";
$c = $conn->query("SHOW COLUMNS FROM honorarios_medicos_movimientos");
while($c && ($r=$c->fetch_assoc())) echo ($r['Field'] ?? '')."\n";

echo "\nULTIMOS_20_MOVIMIENTOS\n";
$q3 = $conn->query("SELECT id, fecha, consulta_id, tipo_servicio, estado_pago_medico, monto_medico, detalle_honorario
FROM honorarios_medicos_movimientos
WHERE medico_id = $medicoId
ORDER BY id DESC
LIMIT 20");
while($q3 && ($r=$q3->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

$_GET = ['medico_id' => (string)$medicoId];
ob_start();
include __DIR__ . '/../api_medico_cuenta_corriente.php';
$out = ob_get_clean();
$data = json_decode($out, true);
echo "\nAPI_RESUMEN\n";
echo json_encode($data['resumen'] ?? null, JSON_UNESCAPED_UNICODE)."\n";
?>
