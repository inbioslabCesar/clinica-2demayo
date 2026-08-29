<?php
require __DIR__ . '/../config.php';
$medicoId = 5;

echo "RESUMEN\n";
$sqlResumen = "SELECT oi.tipo,
COUNT(*) total,
SUM(CASE WHEN c.id IS NOT NULL AND LOWER(TRIM(COALESCE(c.estado,''))) IN ('anulada','cancelada') THEN 1 ELSE 0 END) en_cot_anulada,
SUM(CASE WHEN c.id IS NOT NULL AND LOWER(TRIM(COALESCE(c.estado,''))) NOT IN ('anulada','cancelada') THEN 1 ELSE 0 END) en_cot_vigente,
SUM(CASE WHEN oi.cotizacion_id IS NULL OR oi.cotizacion_id<=0 THEN 1 ELSE 0 END) sin_cotizacion
FROM ordenes_imagen oi
LEFT JOIN cotizaciones c ON c.id = oi.cotizacion_id
WHERE oi.medico_id = $medicoId
GROUP BY oi.tipo
ORDER BY oi.tipo";
$r = $conn->query($sqlResumen);
while($r && ($row=$r->fetch_assoc())) echo json_encode($row, JSON_UNESCAPED_UNICODE)."\n";

echo "\nNO_RX_ANULADA\n";
$sqlNoRxAnulada = "SELECT oi.id, oi.tipo, oi.cotizacion_id, c.estado cot_estado, oi.indicaciones, oi.fecha
FROM ordenes_imagen oi
INNER JOIN cotizaciones c ON c.id = oi.cotizacion_id
WHERE oi.medico_id = $medicoId
AND oi.tipo IN ('ecografia','tomografia')
AND LOWER(TRIM(COALESCE(c.estado,''))) IN ('anulada','cancelada')
ORDER BY oi.fecha DESC, oi.id DESC";
$r2 = $conn->query($sqlNoRxAnulada);
$cnt2=0;
while($r2 && ($row=$r2->fetch_assoc())){ $cnt2++; echo json_encode($row, JSON_UNESCAPED_UNICODE)."\n"; }
if($cnt2===0) echo "(sin filas)\n";

echo "\nNO_RX_SIN_AGENDA_TOKEN\n";
$sqlNoRx = "SELECT oi.id, oi.tipo, oi.cotizacion_id, oi.indicaciones, oi.fecha,
                    c.estado cot_estado
             FROM ordenes_imagen oi
             LEFT JOIN cotizaciones c ON c.id = oi.cotizacion_id
             WHERE oi.medico_id = $medicoId
               AND oi.tipo IN ('ecografia','tomografia')
             ORDER BY oi.id DESC";
$r3 = $conn->query($sqlNoRx);
$cnt3 = 0;
while($r3 && ($row=$r3->fetch_assoc())) {
    $cid = (int)$row['cotizacion_id'];
    $ind = (string)$row['indicaciones'];
    $token = 0;
    if (preg_match('/detalle\s*#\s*(\d+)/i', $ind, $m)) $token = (int)$m[1];
    $ok = false;
    if ($cid > 0 && $token > 0) {
        $stmt = $conn->prepare("SELECT id FROM agenda_servicios_cotizacion WHERE cotizacion_id=? AND cotizacion_detalle_id=? AND medico_id=? LIMIT 1");
        if ($stmt) {
            $stmt->bind_param('iii', $cid, $token, $medicoId);
            $stmt->execute();
            $rr = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $ok = (bool)$rr;
        }
    }
    if (!$ok) {
        $cnt3++;
        echo json_encode([
            'id' => (int)$row['id'],
            'tipo' => $row['tipo'],
            'cotizacion_id' => $cid,
            'cot_estado' => $row['cot_estado'],
            'detalle_token' => $token,
            'indicaciones' => $ind,
            'fecha' => $row['fecha']
        ], JSON_UNESCAPED_UNICODE)."\n";
    }
}
if ($cnt3===0) echo "(sin filas)\n";

?>
