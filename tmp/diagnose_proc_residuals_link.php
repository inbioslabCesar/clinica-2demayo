<?php
require __DIR__ . '/../config.php';
$conn->set_charset('utf8mb4');

$sql = "SELECT c.id cotizacion_id, c.paciente_id, DATE(c.fecha) fecha_cot,
               GROUP_CONCAT(DISTINCT CASE WHEN LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('procedimiento','procedimientos') THEN cd.servicio_id END ORDER BY cd.servicio_id) proc_ids,
               MAX(CASE WHEN cd.consulta_id > 0 THEN cd.consulta_id ELSE 0 END) consulta_det,
               MAX(CASE WHEN cd.medico_id > 0 THEN cd.medico_id ELSE 0 END) medico_det
        FROM cotizaciones c
        INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = c.id
        LEFT JOIN ordenes_procedimientos op ON op.cotizacion_id = c.id
        WHERE LOWER(TRIM(COALESCE(c.estado,''))) IN ('pagado','pagada','parcial','control')
        GROUP BY c.id, c.paciente_id, DATE(c.fecha)
        HAVING SUM(CASE WHEN LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('procedimiento','procedimientos') THEN 1 ELSE 0 END) > 0
           AND COUNT(op.id)=0
        ORDER BY c.id DESC";

$res = $conn->query($sql);
if(!$res){ echo "ERR ".$conn->error."\n"; exit(1);} 

$out = [];
while($r = $res->fetch_assoc()){
  $cot = (int)$r['cotizacion_id'];
  $pac = (int)$r['paciente_id'];
  $fec = $r['fecha_cot'];
  $med = (int)$r['medico_det'];
  $consultaDet = (int)$r['consulta_det'];

  $agendaConsulta = 0;
  $agendaN = 0;
  $agendaHas = $conn->query("SHOW TABLES LIKE 'agenda_servicios_cotizacion'");
  if($agendaHas && $agendaHas->num_rows>0){
    $colHas = $conn->query("SHOW COLUMNS FROM agenda_servicios_cotizacion LIKE 'consulta_id'");
    if($colHas && $colHas->num_rows>0){
      $qA = $conn->query("SELECT COUNT(DISTINCT consulta_id) n, MIN(consulta_id) cid FROM agenda_servicios_cotizacion WHERE cotizacion_id={$cot} AND consulta_id>0");
      if($qA){ $ra=$qA->fetch_assoc(); $agendaN=(int)$ra['n']; $agendaConsulta=(int)$ra['cid']; }
    }
  }

  $whereMed = $med>0 ? " AND medico_id={$med}" : "";
  $qC = $conn->query("SELECT COUNT(*) n, MIN(id) cid FROM consultas WHERE paciente_id={$pac} AND DATE(fecha)='".$conn->real_escape_string($fec)."'{$whereMed}");
  $sameDayN=0; $sameDayCid=0;
  if($qC){ $rc=$qC->fetch_assoc(); $sameDayN=(int)$rc['n']; $sameDayCid=(int)$rc['cid']; }

  $rule = 'none';
  $cid = 0;
  if($consultaDet>0){ $rule='detalle'; $cid=$consultaDet; }
  elseif($agendaN===1 && $agendaConsulta>0){ $rule='agenda_unica'; $cid=$agendaConsulta; }
  elseif($sameDayN===1 && $sameDayCid>0){ $rule='consulta_mismo_dia_unica'; $cid=$sameDayCid; }

  $out[] = [
    'cotizacion_id'=>$cot,
    'paciente_id'=>$pac,
    'fecha'=>$fec,
    'medico_det'=>$med,
    'proc_ids'=>$r['proc_ids'],
    'consulta_det'=>$consultaDet,
    'agenda_n'=>$agendaN,
    'agenda_cid'=>$agendaConsulta,
    'same_day_n'=>$sameDayN,
    'same_day_cid'=>$sameDayCid,
    'rule'=>$rule,
    'target_consulta_id'=>$cid
  ];
}

echo "RESIDUALES ".count($out)."\n";
$byRule=[];
foreach($out as $it){$byRule[$it['rule']] = ($byRule[$it['rule']]??0)+1;}
echo json_encode($byRule, JSON_UNESCAPED_UNICODE)."\n";
foreach($out as $it){ echo json_encode($it, JSON_UNESCAPED_UNICODE)."\n"; }
?>
