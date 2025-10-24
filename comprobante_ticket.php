<?php
// comprobante_ticket.php: Comprobante tipo ticket para ingresos diarios
if (!isset($_GET['ingreso_id']) || !is_numeric($_GET['ingreso_id'])) {
    echo '<h2>Ingreso no especificado</h2>';
    exit;
}
$ingreso_id = intval($_GET['ingreso_id']);
require_once __DIR__.'/config.php';
// Consultar ingreso
// La tabla usuarios solo tiene 'nombre', no 'apellido'
$stmt = $pdo->prepare("SELECT i.*, u.nombre as usuario_nombre FROM ingresos_diarios i LEFT JOIN usuarios u ON i.usuario_id = u.id WHERE i.id = ? LIMIT 1");
$stmt->execute([$ingreso_id]);
$ingreso = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$ingreso) {
    echo '<h2>Ingreso no encontrado</h2>';
    exit;
}
// Formato tipo ticket
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Ticket de Ingreso</title>
    <style>
        body { font-family: monospace, Arial, sans-serif; background: #fff; color: #222; }
        .ticket { max-width: 340px; margin: 30px auto; border: 1px solid #ccc; border-radius: 8px; padding: 18px; box-shadow: 0 2px 8px #eee; }
        h2 { color: #2563eb; font-size: 1.2em; text-align: center; margin-bottom: 10px; }
        .datos { font-size: 0.95em; margin-bottom: 10px; }
        .linea { border-bottom: 1px dashed #bbb; margin: 8px 0; }
        .total { text-align: right; font-size: 1.1em; font-weight: bold; color: #008000; margin-top: 10px; }
        .print-btn { margin-top: 18px; padding: 8px 18px; background: #2563eb; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%; }
        .print-btn:hover { background: #1d4ed8; }
        .label { font-weight: bold; }
    </style>
</head>
<body>
<div class="ticket">
    <h2>Ticket de Ingreso</h2>
    <div class="datos">
        <div><span class="label">Fecha:</span> <?php echo htmlspecialchars($ingreso['fecha_hora']); ?></div>
    <div><span class="label">Usuario:</span> <?php echo htmlspecialchars($ingreso['usuario_nombre']); ?></div>
        <div><span class="label">Paciente:</span> <?php echo htmlspecialchars($ingreso['paciente_nombre']); ?></div>
        <div><span class="label">Área/Servicio:</span> <?php echo htmlspecialchars($ingreso['area']); ?></div>
        <div><span class="label">Descripción:</span> <?php echo htmlspecialchars($ingreso['descripcion']); ?></div>
        <div><span class="label">Método de Pago:</span> <?php echo htmlspecialchars($ingreso['metodo_pago']); ?></div>
        <div class="linea"></div>
        <div class="total">Total: S/ <?php echo number_format($ingreso['monto'], 2); ?></div>
    </div>
    <button class="print-btn" onclick="window.print()">Imprimir</button>
</div>
</body>
</html>
