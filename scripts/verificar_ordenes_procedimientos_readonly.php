<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}

$options = getopt('', ['consulta:', 'procedimiento:', 'cotizacion:']);
$consultaId = (int)($options['consulta'] ?? 0);
$procedimientoId = (int)($options['procedimiento'] ?? 0);
$cotizacionId = (int)($options['cotizacion'] ?? 0);
if ($consultaId <= 0 || $procedimientoId <= 0 || $cotizacionId <= 0) {
    fwrite(STDERR, "Uso: php scripts\\verificar_ordenes_procedimientos_readonly.php --consulta=369 --procedimiento=302 --cotizacion=895\n");
    exit(1);
}

$root = dirname(__DIR__);
require $root . '/config.php';

// Cargar solo definiciones: no ejecutar autenticacion, dispatch ni op_ensure_schema.
$source = file_get_contents($root . '/api_ordenes_procedimientos.php');
$start = strpos($source, "if (!function_exists('op_column_exists'))");
$end = strpos($source, '$method = $_SERVER');
if ($start === false || $end === false || $end <= $start) {
    throw new RuntimeException('No se pudo aislar las funciones del endpoint para la prueba');
}
eval(substr($source, $start, $end - $start));

function verificar(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$conn->begin_transaction(MYSQLI_TRANS_START_READ_ONLY);
try {
    $responses = [];
    foreach ([false, true] as $lite) {
        ob_start();
        try {
            op_listar_ordenes_por_consulta($conn, $consultaId, false, 0, $lite);
            $json = ob_get_contents();
        } finally {
            ob_end_clean();
        }
        $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        verificar(($data['success'] ?? false) === true && is_array($data['ordenes'] ?? null), 'Respuesta invalida');
        $found = false;
        $summary = [];
        $persisted = [];
        foreach ($data['ordenes'] as $order) {
            verificar((int)$order['consulta_id'] === $consultaId, 'Orden de otra consulta');
            verificar(is_array($order['procedimientos'] ?? null), 'Falta el arreglo de procedimientos');
            $ids = array_map('intval', array_column($order['procedimientos'], 'id'));
            verificar(count($ids) === count(array_unique($ids)), 'Procedimientos duplicados dentro de una orden');
            $cid = (int)$order['cotizacion_id'];
            if ($cid === $cotizacionId && in_array($procedimientoId, $ids, true)) {
                $found = true;
            }
            if ((int)$order['id'] > 0) {
                $persisted[$cid] = array_merge($persisted[$cid] ?? [], $ids);
            }
            $summary[] = [(int)$order['id'], $cid, $ids, $order['estado']];
        }
        verificar($found, 'El procedimiento esperado no aparece en la cotizacion y consulta indicadas');

        foreach ($data['ordenes'] as $order) {
            if ((int)$order['id'] >= 0) continue;
            $cid = (int)$order['cotizacion_id'];
            verificar((int)$order['paciente_id'] > 0, 'Recuperacion sin paciente');
            foreach ($order['procedimientos'] as $item) {
                $pid = (int)$item['id'];
                verificar(!in_array($pid, $persisted[$cid] ?? [], true), 'Recuperacion duplicada de una orden persistida');
                $stmt = $conn->prepare(
                    "SELECT 1 FROM cotizaciones_detalle cd
                     JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                     WHERE cd.consulta_id = ? AND cd.cotizacion_id = ? AND cd.servicio_id = ?
                       AND LOWER(TRIM(cd.servicio_tipo)) IN ('procedimiento', 'procedimientos')
                       AND COALESCE(cd.estado_item, 'activo') <> 'eliminado'
                       AND LOWER(TRIM(ct.estado)) NOT IN ('anulado', 'anulada') LIMIT 1"
                );
                $stmt->bind_param('iii', $consultaId, $cid, $pid);
                $stmt->execute();
                verificar($stmt->get_result()->num_rows === 1, 'Recuperacion sin detalle activo de la consulta');
                $stmt->close();
            }
        }
        $responses[] = $summary;
    }
    verificar($responses[0] === $responses[1], 'Las vistas completa y hc_fast difieren');
    echo "OK: procedimiento esperado, aislamiento, sin recuperaciones duplicadas y paridad completa/hc_fast. Solo lectura.\n";
} finally {
    $conn->rollback();
}
