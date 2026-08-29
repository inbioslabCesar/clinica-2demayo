<?php
require __DIR__ . '/../config.php';
$medico_id = 16;
$limite = 10;
$whereMedico = "(
  oi.medico_id = $medico_id
  OR EXISTS (
    SELECT 1 FROM agenda_servicios_cotizacion a
    WHERE a.cotizacion_id = oi.cotizacion_id
      AND a.medico_id = $medico_id
      AND (
        (oi.tipo = 'rx' AND LOWER(TRIM(COALESCE(a.servicio_tipo, ''))) IN ('rayosx', 'rayos_x', 'rayos x', 'rx'))
        OR (oi.tipo = 'ecografia' AND LOWER(TRIM(COALESCE(a.servicio_tipo, ''))) = 'ecografia')
        OR (oi.tipo = 'tomografia' AND LOWER(TRIM(COALESCE(a.servicio_tipo, ''))) = 'tomografia')
      )
  )
)";
$q = $conn->query("SELECT oi.* FROM ordenes_imagen oi WHERE $whereMedico ORDER BY oi.fecha DESC LIMIT $limite");
while($q && ($r=$q->fetch_assoc())) {
  $pid=(int)$r['paciente_id'];
  $p=$conn->query("SELECT nombre,apellido,dni FROM pacientes WHERE id=$pid LIMIT 1")->fetch_assoc();
  echo json_encode([
    'id'=>(int)$r['id'],
    'cotizacion_id'=>(int)$r['cotizacion_id'],
    'paciente'=>trim(($p['nombre']??'').' '.($p['apellido']??'')),
    'dni'=>$p['dni']??'',
    'medico_id'=>(int)$r['medico_id'],
    'tipo'=>$r['tipo'],
    'indicaciones'=>$r['indicaciones'],
    'fecha'=>$r['fecha']
  ], JSON_UNESCAPED_UNICODE)."\n";
}
?>
