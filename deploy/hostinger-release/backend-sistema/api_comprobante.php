<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__.'/config.php';

// Comprobante de cobro
if (!isset($_GET['cobro_id']) || !is_numeric($_GET['cobro_id'])) {
    echo '<h2>Cobro no especificado</h2>';
    exit;
}
$cobro_id = intval($_GET['cobro_id']);
// Consulta el cobro principal
$stmt = $pdo->prepare("SELECT c.*, p.nombre, p.apellido, p.dni FROM cobros c JOIN pacientes p ON c.paciente_id = p.id WHERE c.id = ? LIMIT 1");
$stmt->execute([$cobro_id]);
$cobro = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$cobro) {
    echo '<h2>Cobro no encontrado</h2>';
    exit;
}
// Consulta los detalles (JSON)
$stmt = $pdo->prepare("SELECT servicio_tipo, descripcion, cantidad, precio_unitario, subtotal FROM cobros_detalle WHERE cobro_id = ? LIMIT 1");
$stmt->execute([$cobro_id]);
$detalle = $stmt->fetch(PDO::FETCH_ASSOC);
$detalles = json_decode($detalle['descripcion'], true);

// Obtener configuración de la clínica
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
        if (!empty($cfg['nombre_clinica'])) $nombre_clinica = strtoupper(trim($cfg['nombre_clinica']));
        if (!empty($cfg['logo_url'])) {
            $rawLogo = trim($cfg['logo_url']);
            $logo_url = preg_match('/^(https?:\/\/|data:|blob:)/i', $rawLogo) ? $rawLogo : '/' . ltrim($rawLogo, '/');
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
// HTML comprobante
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Comprobante de Cobro</title>
    <style>
        body { font-family: Arial, sans-serif; background: #fff; color: #222; }
        .comprobante { max-width: 500px; margin: 40px auto; border: 1px solid #ccc; border-radius: 8px; padding: 24px; box-shadow: 0 2px 8px #eee; }
        h2 { color: #4B0082; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f3eaff; }
        .total { text-align: right; font-size: 1.2em; font-weight: bold; color: #008000; margin-top: 16px; }
        .datos { margin-bottom: 12px; }
        .print-btn { margin-top: 18px; padding: 8px 18px; background: #4B0082; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
        .print-btn:hover { background: #6a1b9a; }
    </style>
</head>
<body>
<div class="comprobante">
    <?php if (!empty($logo_url)): ?>
        <div style="text-align:center;margin-bottom:8px;"><img src="<?php echo htmlspecialchars($logo_url); ?>" alt="Logo" style="height:56px;max-width:180px;object-fit:contain;" /></div>
    <?php endif; ?>
    <h2<?php if (!empty($nombre_color)) echo ' style="color:'.htmlspecialchars($nombre_color).'"'; ?>><?php echo htmlspecialchars($nombre_clinica); ?></h2>
    <?php if (!empty($slogan)): ?>
        <p style="text-align:center;font-style:italic;margin:0 0 8px;<?php if (!empty($slogan_color)) echo 'color:'.htmlspecialchars($slogan_color).';'; ?>"><?php echo htmlspecialchars($slogan); ?></p>
    <?php endif; ?>
    <?php if (!empty($direccion)): ?>
        <p style="text-align:center;font-size:0.9em;margin:2px 0;"><?php echo htmlspecialchars($direccion); ?></p>
    <?php endif; ?>
    <?php if (!empty($telefono)): ?>
        <p style="text-align:center;font-size:0.9em;margin:2px 0;">Tel: <?php echo htmlspecialchars($telefono); ?></p>
    <?php endif; ?>
    <?php if (!empty($celular)): ?>
        <p style="text-align:center;font-size:0.9em;margin:2px 0;">Cel: <?php echo htmlspecialchars($celular); ?></p>
    <?php endif; ?>
    <?php if (!empty($ruc)): ?>
        <p style="text-align:center;font-size:0.9em;margin:2px 0;">RUC: <?php echo htmlspecialchars($ruc); ?></p>
    <?php endif; ?>
    <hr>
    <h3 style="text-align:center;">Comprobante de Cobro</h3>
    <div class="datos">
        <strong>Paciente:</strong> <?php echo htmlspecialchars($cobro['nombre'].' '.$cobro['apellido']); ?><br>
        <strong>DNI:</strong> <?php echo htmlspecialchars($cobro['dni']); ?><br>
        <strong>Fecha:</strong> <?php echo htmlspecialchars($cobro['fecha_cobro']); ?><br>
        <strong>Tipo de pago:</strong> <?php echo htmlspecialchars($cobro['tipo_pago']); ?><br>
        <strong>Estado:</strong> <?php echo htmlspecialchars($cobro['estado']); ?><br>
    </div>
    <table>
        <thead>
            <tr>
                <th>Servicio</th>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Precio Unitario</th>
                <th>Subtotal</th>
            </tr>
        </thead>
        <tbody>
        <?php foreach ($detalles as $d): ?>
            <tr>
                <td><?php echo htmlspecialchars($d['servicio_tipo'] ?? $detalle['servicio_tipo']); ?></td>
                <td><?php echo htmlspecialchars($d['descripcion']); ?></td>
                <td><?php echo htmlspecialchars($d['cantidad']); ?></td>
                <td><?php echo number_format($d['precio_unitario'], 2); ?></td>
                <td><?php echo number_format($d['subtotal'], 2); ?></td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <div class="total">Total: S/ <?php echo number_format($cobro['total'], 2); ?></div>
    <button class="print-btn" onclick="window.print()">Imprimir</button>
</div>
</body>
</html>
