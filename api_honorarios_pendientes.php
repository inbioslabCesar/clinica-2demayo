
<?php
require_once __DIR__ . '/init_api.php';
require_once "db.php";


$medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
$turno = isset($_GET['turno']) ? $_GET['turno'] : null;
$estado = isset($_GET['estado']) ? $_GET['estado'] : 'pendiente';

$where = "WHERE 1=1";
if ($estado === 'pendiente' || $estado === 'pagado') {
    $where .= " AND estado_pago_medico = '" . $conn->real_escape_string($estado) . "'";
}
if ($medico_id) {
    $where .= " AND medico_id = $medico_id";
}
if ($turno) {
    $where .= " AND turno = '" . $conn->real_escape_string($turno) . "'";
}




$sql = "SELECT h.id, h.medico_id, m.nombre AS medico_nombre, m.apellido AS medico_apellido, h.tipo_servicio, h.paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, h.fecha, h.turno, h.monto_medico, h.estado_pago_medico,
    e.usuario_id AS liquidado_por_id, u.nombre AS liquidado_por_nombre, u.rol AS liquidado_por_rol, e.created_at AS fecha_liquidacion,
    i.usuario_id AS cobrado_por_id, uc.nombre AS cobrado_por_nombre, uc.rol AS cobrado_por_rol
    FROM honorarios_medicos_movimientos h
    LEFT JOIN medicos m ON h.medico_id = m.id
    LEFT JOIN pacientes p ON h.paciente_id = p.id
    LEFT JOIN egresos e ON e.honorario_movimiento_id = h.id AND e.tipo_egreso = 'honorario_medico'
    LEFT JOIN usuarios u ON e.usuario_id = u.id
    LEFT JOIN ingresos_diarios i ON i.honorario_movimiento_id = h.id
    LEFT JOIN usuarios uc ON i.usuario_id = uc.id
    $where
    ORDER BY h.fecha DESC, h.turno";

$result = $conn->query($sql);
$honorarios = [];
while ($row = $result->fetch_assoc()) {
    $honorarios[] = $row;
}

echo json_encode([
    "success" => true,
    "honorarios" => $honorarios
]);
