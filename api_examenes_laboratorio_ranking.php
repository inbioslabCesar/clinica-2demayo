<?php
require_once "db.php";
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');

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
