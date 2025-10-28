<?php
// Script para mostrar la fecha y hora real del servidor PHP
header('Content-Type: text/plain');
date_default_timezone_set('America/Lima');
echo "Fecha y hora del servidor: " . date('Y-m-d H:i:s') . "\n";
?>
