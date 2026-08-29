<?php
require __DIR__ . '/../config.php';
for ($cid = 500; $cid <= 502; $cid++) {
    $r1 = $conn->query("SELECT COUNT(*) AS c FROM agenda_servicios_cotizacion WHERE cotizacion_id=" . $cid);
    $row1 = $r1 ? $r1->fetch_assoc() : ['c' => 0];
    $a = (int)($row1['c'] ?? 0);
    $r2 = $conn->query("SELECT COUNT(*) AS c FROM ordenes_imagen WHERE cotizacion_id=" . $cid);
    $row2 = $r2 ? $r2->fetch_assoc() : ['c' => 0];
    $o = (int)($row2['c'] ?? 0);
    echo "cotizacion {$cid} agenda={$a} ordenes_imagen={$o}\n";
}
?>
