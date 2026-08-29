<?php
require __DIR__ . '/../config.php';

$cols = [];
$r = $conn->query("SHOW COLUMNS FROM usuarios");
while($r && ($c=$r->fetch_assoc())) $cols[] = $c['Field'];
echo "USUARIOS_COLS=".json_encode($cols, JSON_UNESCAPED_UNICODE)."\n";

$hasMedicoId = in_array('medico_id', $cols, true);
$sel = "SELECT id, usuario, nombre, rol" . ($hasMedicoId ? ", medico_id" : "") . " FROM usuarios WHERE LOWER(rol)='medico' OR LOWER(nombre) LIKE '%jhony%' ORDER BY id DESC LIMIT 20";
$q = $conn->query($sel);
echo "USUARIOS_MATCH\n";
while($q && ($row=$q->fetch_assoc())) echo json_encode($row, JSON_UNESCAPED_UNICODE)."\n";

$qm = $conn->query("SELECT id, nombre, apellido, CONCAT(TRIM(nombre),' ',TRIM(apellido)) AS full_name FROM medicos WHERE LOWER(CONCAT(TRIM(nombre),' ',TRIM(apellido))) LIKE '%jhony%' ORDER BY id DESC LIMIT 20");
echo "MEDICOS_MATCH\n";
while($qm && ($row=$qm->fetch_assoc())) echo json_encode($row, JSON_UNESCAPED_UNICODE)."\n";
?>
