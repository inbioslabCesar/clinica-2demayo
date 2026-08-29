<?php
require __DIR__ . '/../config.php';
$medico_id = 5;
$whereCotizacionVigente = " AND (
  oi.cotizacion_id IS NULL
  OR oi.cotizacion_id <= 0
  OR EXISTS (
    SELECT 1 FROM cotizaciones c
    WHERE c.id = oi.cotizacion_id
      AND LOWER(TRIM(COALESCE(c.estado,''))) NOT IN ('anulada','cancelada')
  )
)";
$whereMedico = "(
  oi.medico_id = $medico_id
  OR EXISTS (
    SELECT 1 FROM agenda_servicios_cotizacion a
    WHERE a.cotizacion_id = oi.cotizacion_id
      AND a.medico_id = $medico_id
      AND (oi.tipo='rx' AND LOWER(TRIM(COALESCE(a.servicio_tipo,''))) IN ('rayosx','rayos_x','rayos x','rx'))
  )
) AND oi.tipo='rx' $whereCotizacionVigente";
$q = $conn->query("SELECT oi.id,oi.cotizacion_id,oi.indicaciones,oi.fecha FROM ordenes_imagen oi WHERE $whereMedico ORDER BY oi.fecha DESC, oi.id DESC LIMIT 20");
while($q && ($r=$q->fetch_assoc())) {
  $pid = 0;
  $qp = $conn->query("SELECT paciente_id FROM ordenes_imagen WHERE id=".(int)$r['id']);
  if($qp && ($rp=$qp->fetch_assoc())) $pid=(int)$rp['paciente_id'];
  $p = $conn->query("SELECT nombre,apellido FROM pacientes WHERE id=$pid LIMIT 1")->fetch_assoc();
  $nom = trim((string)(($p['nombre']??'').' '.($p['apellido']??'')));
  if (stripos($nom, 'LUCERO') !== false) {
    echo json_encode(['id'=>(int)$r['id'],'cotizacion_id'=>(int)$r['cotizacion_id'],'paciente'=>$nom,'indicaciones'=>$r['indicaciones'],'fecha'=>$r['fecha']], JSON_UNESCAPED_UNICODE)."\n";
  }
}
?>
