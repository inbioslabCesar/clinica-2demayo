<?php
require "config.php";
$items = [];

// 1. Contrato activo con evento pendiente/confirmado
$sql1 = "SELECT cp.id as contrato_id, cp.paciente_id, ac.id as evento_id, ac.estado_evento 
         FROM contratos_paciente cp 
         JOIN agenda_contrato ac ON cp.id = ac.contrato_paciente_id 
         WHERE cp.estado = \"activo\" AND ac.estado_evento IN (\"pendiente\", \"confirmado\") 
         LIMIT 1";
$res1 = $conn->query($sql1);
$items["activo"] = ($res1 && $res1->num_rows > 0) ? $res1->fetch_assoc() : null;

// 2. Contrato cerrado
$sql2 = "SELECT cp.id as contrato_id_cerrado, ac.id as evento_id_cerrado
         FROM contratos_paciente cp 
         JOIN agenda_contrato ac ON cp.id = ac.contrato_paciente_id 
         WHERE cp.estado = \"cerrado\" 
         LIMIT 1";
$res2 = $conn->query($sql2);
$items["cerrado"] = ($res2 && $res2->num_rows > 0) ? $res2->fetch_assoc() : null;

echo json_encode($items);
?>
