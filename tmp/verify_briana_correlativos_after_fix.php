<?php
require __DIR__ . '/../config.php';
require_once __DIR__ . '/../modules/CorrelativoOperativoModule.php';

function extraerDetalle($txt){ return preg_match('/detalle\s*#\s*(\d+)/i',$txt,$m)?(int)$m[1]:0; }
function extraerUnidad($txt){ return preg_match('/unidad\s*(\d+)\s*\/\s*(\d+)/i',$txt,$m)?(int)$m[1]:0; }

$rows = [];
$q = $conn->query("SELECT id,cotizacion_id,medico_id,tipo,indicaciones FROM ordenes_imagen WHERE id IN (179,180,181,186) ORDER BY id ASC");
while($q && ($r=$q->fetch_assoc())) $rows[]=$r;

$agenda=[];
$qa = $conn->query("SELECT id,cotizacion_id,cotizacion_detalle_id,servicio_tipo,medico_id,fecha_programada,hora_programada,LOWER(TRIM(COALESCE(estado_evento,''))) estado_evento FROM agenda_servicios_cotizacion WHERE cotizacion_id=502 AND LOWER(COALESCE(estado_evento,'')) NOT IN ('cancelado','no_asistio') ORDER BY fecha_programada ASC,hora_programada ASC,id ASC");
while($qa && ($r=$qa->fetch_assoc())) $agenda[]=$r;

$pairs=[];
foreach($agenda as $a){ $pairs[]=['medico_id'=>(int)$a['medico_id'],'fecha'=>$a['fecha_programada']]; }
$maps = correlativo_operativo_rank_maps($conn,$pairs);
$rankByAgendaId = is_array($maps['agenda']??null)?$maps['agenda']:[];

$used=[];
foreach($rows as $o){
  $token = extraerDetalle((string)$o['indicaciones']);
  $unidad = extraerUnidad((string)$o['indicaciones']);
  $match = null;
  $cands = [];
  foreach($agenda as $idx=>$a){ if((int)$a['cotizacion_detalle_id']===$token) $cands[]=['idx'=>$idx,'item'=>$a]; }
  $k='502|'.$token;
  if(!isset($used[$k])) $used[$k]=[];
  if($unidad>0 && $unidad<=count($cands)){
    $t=$cands[$unidad-1]; $match=$t['item']; $used[$k][$t['idx']]=true;
  } else {
    foreach($cands as $c){ if(!isset($used[$k][$c['idx']])){ $match=$c['item']; $used[$k][$c['idx']]=true; break; } }
    if($match===null && !empty($cands)) $match=$cands[0]['item'];
  }
  $agendaId=(int)($match['id']??0);
  $corr=(int)($rankByAgendaId[$agendaId]??0);
  echo json_encode([
    'orden_id'=>(int)$o['id'],
    'indicaciones'=>$o['indicaciones'],
    'agenda_id'=>$agendaId,
    'hora_programada'=>$match['hora_programada']??'',
    'correlativo_operativo'=>$corr
  ], JSON_UNESCAPED_UNICODE)."\n";
}
?>
