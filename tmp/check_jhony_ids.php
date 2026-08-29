<?php
require __DIR__ . '/../config.php';
$rows = $conn->query("SELECT id, nombre, apellido FROM medicos WHERE LOWER(CONCAT(nombre,' ',apellido)) LIKE '%jhony%' OR LOWER(CONCAT(nombre,' ',apellido)) LIKE '%hoyos%' ORDER BY id ASC");
echo "MEDICOS_MATCH\n";
while($rows && ($r=$rows->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
$rows2 = $conn->query("SELECT id, nombre, rol, medico_id FROM usuarios WHERE LOWER(nombre) LIKE '%jhony%' OR LOWER(nombre) LIKE '%hoyos%' ORDER BY id ASC");
echo "USUARIOS_MATCH\n";
while($rows2 && ($r=$rows2->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
