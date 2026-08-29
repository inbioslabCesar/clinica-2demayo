<?php
require __DIR__ . '/../config.php';
$r = $conn->query("SHOW COLUMNS FROM agenda_servicios_cotizacion");
while($r && ($c=$r->fetch_assoc())) echo $c['Field']."\n";
?>
