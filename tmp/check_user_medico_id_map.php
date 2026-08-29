<?php
require __DIR__ . '/../config.php';
$cols = [];
$r = $conn->query("SHOW COLUMNS FROM usuarios");
while($r && ($row=$r->fetch_assoc())) $cols[] = $row['Field'];
echo "USUARIOS_COLS=".implode(',', $cols)."\n";
$q = $conn->query("SELECT id, usuario, nombre, rol FROM usuarios WHERE LOWER(nombre) LIKE '%jhony%' OR LOWER(nombre) LIKE '%hoyos%' OR LOWER(usuario) LIKE '%jhony%' OR LOWER(usuario) LIKE '%hoyos%' ORDER BY id ASC");
echo "USUARIOS_MATCH\n";
while($q && ($row=$q->fetch_assoc())) echo json_encode($row, JSON_UNESCAPED_UNICODE)."\n";
$q2 = $conn->query("SELECT id, nombre, apellido FROM medicos WHERE LOWER(nombre) LIKE '%jhony%' OR LOWER(apellido) LIKE '%hoyos%' ORDER BY id ASC");
echo "MEDICOS_MATCH\n";
while($q2 && ($row=$q2->fetch_assoc())) echo json_encode($row, JSON_UNESCAPED_UNICODE)."\n";
?>
