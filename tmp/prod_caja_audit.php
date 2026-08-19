<?php
$cfg = require __DIR__ . '/../config/instances/sistema_olivedrab_chinchilla_903422_hostingersite_com.php';
$mysqli = new mysqli($cfg['DB_HOST'], $cfg['DB_USER'], $cfg['DB_PASS'], $cfg['DB_NAME'], (int)$cfg['DB_PORT']);
if ($mysqli->connect_errno) {
  fwrite(STDERR, "DB connect error: " . $mysqli->connect_error . PHP_EOL);
  exit(1);
}
$mysqli->set_charset('utf8mb4');
$mysqli->query("SET time_zone = '-05:00'");

function q($db, $title, $sql) {
  echo "\n==== {$title} ====\n";
  $res = $db->query($sql);
  if (!$res) { echo "SQL ERROR: {$db->error}\n"; return; }
  if ($res->num_rows === 0) { echo "(sin filas)\n"; return; }
  while ($r = $res->fetch_assoc()) {
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
  }
}

q($mysqli, 'fecha_server', "SELECT NOW() AS ahora_lima, CURDATE() AS fecha_hoy");
q($mysqli, 'cajas_hoy', "SELECT id, usuario_id, fecha, turno, monto_apertura, estado, created_at, updated_at FROM cajas WHERE DATE(fecha)=CURDATE() OR DATE(created_at)=CURDATE() ORDER BY id DESC");
q($mysqli, 'caja_abierta_hoy', "SELECT id, usuario_id, fecha, turno, monto_apertura, estado, created_at FROM cajas WHERE estado='abierta' AND (DATE(fecha)=CURDATE() OR DATE(created_at)=CURDATE()) ORDER BY id DESC");
q($mysqli, 'ingresos_hoy_resumen', "SELECT COUNT(*) total_rows, COALESCE(SUM(total),0) suma_total FROM ingresos_diarios WHERE DATE(fecha)=CURDATE()");
q($mysqli, 'ingresos_hoy_por_tipo', "SELECT tipo_ingreso, COUNT(*) n, COALESCE(SUM(total),0) total FROM ingresos_diarios WHERE DATE(fecha)=CURDATE() GROUP BY tipo_ingreso ORDER BY total DESC");
q($mysqli, 'ingresos_hoy_por_metodo', "SELECT metodo_pago, COUNT(*) n, COALESCE(SUM(total),0) total FROM ingresos_diarios WHERE DATE(fecha)=CURDATE() GROUP BY metodo_pago ORDER BY total DESC");
q($mysqli, 'ingresos_hoy_duplicados_cobro', "SELECT cobro_id, COUNT(*) n, COALESCE(SUM(total),0) total FROM ingresos_diarios WHERE DATE(fecha)=CURDATE() AND cobro_id IS NOT NULL GROUP BY cobro_id HAVING COUNT(*)>1 ORDER BY n DESC, total DESC");
q($mysqli, 'cobros_hoy_resumen', "SELECT COUNT(*) total_cobros, COALESCE(SUM(monto_total),0) suma_cobros FROM cobros WHERE DATE(created_at)=CURDATE() OR DATE(fecha_hora)=CURDATE() OR DATE(fecha_cobro)=CURDATE()");
q($mysqli, 'cobros_hoy_por_metodo', "SELECT tipo_pago, COUNT(*) n, COALESCE(SUM(monto_total),0) total FROM cobros WHERE DATE(created_at)=CURDATE() OR DATE(fecha_hora)=CURDATE() OR DATE(fecha_cobro)=CURDATE() GROUP BY tipo_pago ORDER BY total DESC");
q($mysqli, 'egresos_hoy_resumen', "SELECT COUNT(*) total_rows, COALESCE(SUM(monto),0) suma_total FROM egresos WHERE DATE(fecha_hora)=CURDATE() OR DATE(created_at)=CURDATE()");
q($mysqli, 'egresos_hoy_por_tipo', "SELECT tipo_egreso, COUNT(*) n, COALESCE(SUM(monto),0) total FROM egresos WHERE DATE(fecha_hora)=CURDATE() OR DATE(created_at)=CURDATE() GROUP BY tipo_egreso ORDER BY total DESC");
q($mysqli, 'egresos_hoy_dup_honorario_mov', "SELECT honorario_movimiento_id, COUNT(*) n, COALESCE(SUM(monto),0) total FROM egresos WHERE honorario_movimiento_id IS NOT NULL AND (DATE(fecha_hora)=CURDATE() OR DATE(created_at)=CURDATE()) GROUP BY honorario_movimiento_id HAVING COUNT(*)>1 ORDER BY n DESC, total DESC");
q($mysqli, 'mov_honorarios_pendientes_hoy', "SELECT COUNT(*) n, COALESCE(SUM(monto_medico),0) total FROM honorarios_medicos_movimientos WHERE estado_pago_medico='pendiente' AND DATE(fecha)=CURDATE()");

?>
