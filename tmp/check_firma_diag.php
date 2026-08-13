<?php
require __DIR__ . '/../config.php';

$r = $mysqli->query("SHOW COLUMNS FROM medicos LIKE 'firma'");
$c = $r ? $r->fetch_assoc() : null;
echo 'FIRMA_COLUMN=' . json_encode($c, JSON_UNESCAPED_UNICODE) . PHP_EOL;

$q = "SELECT id, nombre, apellido, cmp, CHAR_LENGTH(firma) AS len, LEFT(firma,30) AS pref, RIGHT(firma,30) AS suf FROM medicos WHERE cmp='076278' OR CONCAT(nombre,' ',apellido) LIKE '%Luis Hildemaro%' LIMIT 5";
$rr = $mysqli->query($q);
if ($rr) {
    while ($row = $rr->fetch_assoc()) {
        echo json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL;
    }
}
