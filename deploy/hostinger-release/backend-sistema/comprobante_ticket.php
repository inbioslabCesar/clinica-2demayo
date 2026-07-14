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

$nombre_clinica = 'MI CLINICA';
$logo_url = '';
$slogan = '';
$slogan_color = '';
$nombre_color = '';
$direccion = '';
$telefono = '';
$celular = '';
$ruc = '';
$email = '';
try {
    $stmtCfg = $pdo->prepare("SELECT nombre_clinica, logo_url, slogan, slogan_color, nombre_color, direccion, telefono, celular, ruc, email FROM configuracion_clinica WHERE id = 1 LIMIT 1");
    $stmtCfg->execute();
    $cfg = $stmtCfg->fetch(PDO::FETCH_ASSOC);
    if ($cfg) {
        if (!empty($cfg['nombre_clinica'])) {
            $nombre_clinica = strtoupper(trim($cfg['nombre_clinica']));
        }
        if (!empty($cfg['logo_url'])) {
            $rawLogo = trim($cfg['logo_url']);
            if (preg_match('/^(https?:\/\/|data:|blob:)/i', $rawLogo)) {
                $logo_url = $rawLogo;
            } else {
                $logo_url = '/' . ltrim($rawLogo, '/');
            }
        }
        $slogan = trim($cfg['slogan'] ?? '');
        $slogan_color = trim($cfg['slogan_color'] ?? '');
        $nombre_color = trim($cfg['nombre_color'] ?? '');
        $direccion = trim($cfg['direccion'] ?? '');
        $telefono = trim($cfg['telefono'] ?? '');
        $celular = trim($cfg['celular'] ?? '');
        $ruc = trim($cfg['ruc'] ?? '');
        $email = trim($cfg['email'] ?? '');
    }
} catch (Exception $e) {
    // fallback defaults
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
        .clinic-logo { display: block; height: 56px; max-width: 180px; object-fit: contain; margin: 0 auto 6px auto; }
        .clinic-name { text-align: center; font-size: 1.05em; font-weight: bold; margin-bottom: 8px; }
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
    <?php if (!empty($logo_url)): ?>
        <img src="<?php echo htmlspecialchars($logo_url); ?>" alt="Logo clinica" class="clinic-logo">
    <?php endif; ?>
    <div class="clinic-name"<?php if (!empty($nombre_color)): ?> style="color:<?php echo htmlspecialchars($nombre_color); ?>"<?php endif; ?>><?php echo htmlspecialchars($nombre_clinica); ?></div>
    <?php if (!empty($slogan)): ?>
        <div style="text-align:center;font-style:italic;font-size:0.85em;margin-bottom:6px;<?php if (!empty($slogan_color)) echo 'color:'.htmlspecialchars($slogan_color).';'; ?>"><?php echo htmlspecialchars($slogan); ?></div>
    <?php endif; ?>
    <?php if (!empty($direccion)): ?>
        <div style="text-align:center;font-size:0.85em;"><?php echo htmlspecialchars($direccion); ?></div>
    <?php endif; ?>
    <?php if (!empty($telefono)): ?>
        <div style="text-align:center;font-size:0.85em;">Tel: <?php echo htmlspecialchars($telefono); ?></div>
    <?php endif; ?>
    <?php if (!empty($celular)): ?>
        <div style="text-align:center;font-size:0.85em;">Cel: <?php echo htmlspecialchars($celular); ?></div>
    <?php endif; ?>
    <?php if (!empty($ruc)): ?>
        <div style="text-align:center;font-size:0.85em;">RUC: <?php echo htmlspecialchars($ruc); ?></div>
    <?php endif; ?>
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
