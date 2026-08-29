<?php
require __DIR__ . '/../config.php';
$conn->set_charset('utf8mb4');

$targets = [
  ['cotizacion_id'=>305,'consulta_id'=>113],
  ['cotizacion_id'=>171,'consulta_id'=>66],
];

$inserted=0; $updated=0; $skipped=0; $errors=0;

$conn->begin_transaction();
try {
  foreach($targets as $t){
    $cot=(int)$t['cotizacion_id'];
    $cid=(int)$t['consulta_id'];
    if($cot<=0 || $cid<=0){$skipped++; continue;}

    $q = $conn->query("SELECT c.paciente_id,
                              GROUP_CONCAT(DISTINCT CASE WHEN LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('procedimiento','procedimientos') THEN cd.servicio_id END ORDER BY cd.servicio_id) proc_ids
                       FROM cotizaciones c
                       INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id=c.id
                       WHERE c.id={$cot}
                       GROUP BY c.id, c.paciente_id");
    $row = $q ? $q->fetch_assoc() : null;
    if(!$row){$skipped++; continue;}

    $pac=(int)($row['paciente_id']??0);
    $procRaw=trim((string)($row['proc_ids']??''));
    $procIds=array_values(array_unique(array_filter(array_map('intval', explode(',', $procRaw)), fn($v)=>$v>0)));
    if($pac<=0 || empty($procIds)){ $skipped++; continue; }
    $jsonProc=json_encode($procIds, JSON_UNESCAPED_UNICODE);
    if($jsonProc===false){$jsonProc=json_encode($procIds);}    

    $stmtFind = $conn->prepare("SELECT id, procedimientos_json FROM ordenes_procedimientos WHERE cotizacion_id=? ORDER BY id DESC LIMIT 1");
    if(!$stmtFind){$errors++; continue;}
    $stmtFind->bind_param('i',$cot);
    $stmtFind->execute();
    $exist = $stmtFind->get_result()->fetch_assoc();
    $stmtFind->close();

    if($exist && (int)$exist['id']>0){
      $id=(int)$exist['id'];
      $prev=json_decode((string)($exist['procedimientos_json']??'[]'),true);
      if(!is_array($prev)){$prev=[];}
      $prevIds=array_values(array_unique(array_filter(array_map('intval',$prev), fn($v)=>$v>0)));
      $finalIds=array_values(array_unique(array_merge($prevIds,$procIds)));
      $jsonFinal=json_encode($finalIds, JSON_UNESCAPED_UNICODE);
      if($jsonFinal===false){$jsonFinal=json_encode($finalIds);}      

      $stmtUpd=$conn->prepare("UPDATE ordenes_procedimientos SET procedimientos_json=?, consulta_id=CASE WHEN consulta_id IS NULL OR consulta_id=0 THEN ? ELSE consulta_id END, paciente_id=CASE WHEN paciente_id IS NULL OR paciente_id=0 THEN ? ELSE paciente_id END, updated_at=NOW() WHERE id=?");
      if($stmtUpd){
        $stmtUpd->bind_param('siii',$jsonFinal,$cid,$pac,$id);
        $stmtUpd->execute();
        $stmtUpd->close();
        $updated++;
      } else { $errors++; }
      continue;
    }

    $stmtIns=$conn->prepare("INSERT INTO ordenes_procedimientos (consulta_id, procedimientos_json, estado, paciente_id, cotizacion_id, usuario_id) VALUES (?, ?, 'pendiente', ?, ?, 0)");
    if($stmtIns){
      $stmtIns->bind_param('isii',$cid,$jsonProc,$pac,$cot);
      $stmtIns->execute();
      $stmtIns->close();
      $inserted++;
    } else { $errors++; }

    if($conn->query("SHOW COLUMNS FROM cotizaciones_detalle LIKE 'consulta_id'")->num_rows>0){
      $conn->query("UPDATE cotizaciones_detalle SET consulta_id={$cid} WHERE cotizacion_id={$cot} AND (consulta_id IS NULL OR consulta_id=0) AND LOWER(TRIM(COALESCE(servicio_tipo,''))) IN ('procedimiento','procedimientos')");
    }
  }

  $conn->commit();
} catch (Throwable $e){
  $conn->rollback();
  echo "ERROR: ".$e->getMessage()."\n";
  exit(1);
}

echo "BACKFILL_CONSERVADOR\n";
echo json_encode(['inserted'=>$inserted,'updated'=>$updated,'skipped'=>$skipped,'errors'=>$errors], JSON_UNESCAPED_UNICODE)."\n";

$check=$conn->query("SELECT cotizacion_id,consulta_id,procedimientos_json FROM ordenes_procedimientos WHERE cotizacion_id IN (305,171) ORDER BY cotizacion_id ASC");
while($check && ($r=$check->fetch_assoc())){ echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n"; }
?>
