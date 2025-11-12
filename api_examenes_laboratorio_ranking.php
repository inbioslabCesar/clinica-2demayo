<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';

// Ranking de exámenes más solicitados
$sql = "SELECT el.id, el.nombre, el.categoria, COUNT(ol.id) AS veces_solicitado
    FROM examenes_laboratorio el
    LEFT JOIN ordenes_laboratorio ol ON FIND_IN_SET(el.id, ol.examenes) > 0
    WHERE el.activo = 1
    GROUP BY el.id, el.nombre, el.categoria
    ORDER BY veces_solicitado DESC, el.nombre ASC
    LIMIT 100";
$res = $conn->query($sql);
$ranking = [];
while ($row = $res->fetch_assoc()) {
    $ranking[] = $row;
}
echo json_encode(["success" => true, "ranking" => $ranking]);
?>
