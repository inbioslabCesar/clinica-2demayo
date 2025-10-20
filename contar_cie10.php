<?php
require_once 'config.php';

// Contar total
$result = $mysqli->query('SELECT COUNT(*) as total FROM cie10');
$row = $result->fetch_assoc();
echo "Total códigos CIE10: " . $row['total'] . "\n\n";

// Contar por categoría
$result = $mysqli->query('SELECT categoria, COUNT(*) as count FROM cie10 GROUP BY categoria ORDER BY count DESC');
echo "Códigos por especialidad:\n";
while($row = $result->fetch_assoc()) {
    echo "• " . $row['categoria'] . ": " . $row['count'] . " códigos\n";
}

$mysqli->close();
?>