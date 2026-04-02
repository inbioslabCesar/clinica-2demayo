<?php
require_once __DIR__ . '/init_api.php';
require_once 'config_pdf.php';

function h($str) {
    return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}

function cleanOutputBuffers() {
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
}

function findCaratulaBackgroundPath() {
    $candidates = [
        __DIR__ . '/public/demo-hc.png',
        __DIR__ . '/demo-hc.png',
    ];

    foreach ($candidates as $file) {
        if (is_file($file)) {
            return $file;
        }
    }

    return null;
}

function printable($value, $fallback = '-') {
    $v = trim((string)($value ?? ''));
    return $v === '' ? $fallback : $v;
}

if (!isset($_GET['paciente_id'])) {
    cleanOutputBuffers();
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'ID de paciente requerido']);
    exit;
}

$paciente_id = intval($_GET['paciente_id']);

$sql = "SELECT *, DATE(creado_en) as fecha_hc FROM pacientes WHERE id = ? LIMIT 1";
$stmt = $conn->prepare($sql);
$stmt->bind_param('i', $paciente_id);
$stmt->execute();
$result = $stmt->get_result();
$paciente = $result->fetch_assoc();
$stmt->close();

if (!$paciente) {
    cleanOutputBuffers();
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
    exit;
}

$backgroundImageFile = findCaratulaBackgroundPath();

$hc = h(printable($paciente['historia_clinica'] ?? ('HC' . str_pad((string)$paciente['id'], 4, '0', STR_PAD_LEFT))));
$fechaHc = h(printable($paciente['fecha_hc'] ?? ''));

$apellido = h(printable($paciente['apellido'] ?? ''));
$nombre = h(printable($paciente['nombre'] ?? ''));
$dni = h(printable($paciente['dni'] ?? ''));
$fechaNacimiento = h(printable($paciente['fecha_nacimiento'] ?? ''));
$edad = h(printable($paciente['edad'] ?? ''));
$sexo = h(printable($paciente['sexo'] ?? ''));
$telefono = h(printable($paciente['telefono'] ?? ''));
$direccion = h(printable($paciente['direccion'] ?? ''));
$procedencia = h(printable($paciente['procedencia'] ?? 'No especificado'));

$htmlPdf = <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Caratula - {$apellido}, {$nombre}</title>
<style>
@page { margin: 0; size: A4; }
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    color: #111111;
    font-size: 13px;
}
.sheet {
    width: 172mm;
    margin: 60mm auto 0 auto;
}
.top-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
}
.top-table td {
    border: 1px solid #c4b5fd;
    background: #ede9fe;
    color: #5b21b6;
    font-size: 15px;
    font-weight: bold;
    padding: 8px 10px;
}
.top-table td:first-child {
    width: 62%;
}
.top-table td:last-child {
    width: 38%;
    color: #2563eb;
}
.data-table {
    width: 100%;
    border-collapse: collapse;
}
.label {
    width: 45mm;
    color: #5b21b6;
    font-size: 15px;
    font-weight: bold;
    text-transform: uppercase;
    vertical-align: middle;
    padding: 8px 8px 8px 0;
}
.value {
    background: transparent;
    color: #111111;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 10px;
    vertical-align: middle;
}
</style>
</head>
<body>
<div class="sheet">
  <table class="top-table">
    <tr>
      <td>HC N°: {$hc}</td>
      <td>Fecha: {$fechaHc}</td>
    </tr>
  </table>

  <table class="data-table">
    <tr><td class="label">Apellidos:</td><td class="value">{$apellido}</td></tr>
    <tr><td class="label">Nombres:</td><td class="value">{$nombre}</td></tr>
    <tr><td class="label">DNI:</td><td class="value">{$dni}</td></tr>
    <tr><td class="label">Fecha de Nac.:</td><td class="value">{$fechaNacimiento}</td></tr>
    <tr><td class="label">Edad:</td><td class="value">{$edad} años</td></tr>
    <tr><td class="label">Sexo:</td><td class="value">{$sexo}</td></tr>
    <tr><td class="label">Telefono:</td><td class="value">{$telefono}</td></tr>
    <tr><td class="label">Direccion:</td><td class="value">{$direccion}</td></tr>
    <tr><td class="label">Procedencia:</td><td class="value">{$procedencia}</td></tr>
  </table>
</div>
</body>
</html>
HTML;

$htmlOverlayMpdf = <<<HTML
<table style="width:100%; table-layout:fixed; border-collapse:collapse; margin-bottom:26px;">
    <tr>
    <td style="width:62%; border:1px solid #c4b5fd; background:#ede9fe; color:#5b21b6; font-size:18px; font-weight:bold; padding:12px 10px;">HC N°: {$hc}</td>
    <td style="width:38%; border:1px solid #c4b5fd; background:#ede9fe; color:#2563eb; font-size:18px; font-weight:bold; padding:12px 10px;">Fecha: {$fechaHc}</td>
    </tr>
</table>
<table style="width:100%; table-layout:fixed; border-collapse:collapse;">
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">Apellidos:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$apellido}</td></tr>
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">Nombres:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$nombre}</td></tr>
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">DNI:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$dni}</td></tr>
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">Fecha de Nac.:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$fechaNacimiento}</td></tr>
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">Edad:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$edad} años</td></tr>
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">Sexo:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$sexo}</td></tr>
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">Telefono:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$telefono}</td></tr>
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">Direccion:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$direccion}</td></tr>
    <tr><td style="width:42mm; color:#5b21b6; font-size:18px; font-weight:bold; text-transform:uppercase; vertical-align:middle; padding:16px 8px 16px 0;">Procedencia:</td><td style="background:transparent; color:#111111; font-size:16px; line-height:1.32; font-weight:600; padding:16px 10px; vertical-align:middle; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">{$procedencia}</td></tr>
</table>
HTML;

try {
    if (!file_exists(__DIR__ . '/vendor/autoload.php')) {
        cleanOutputBuffers();
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="caratula_paciente_' . $dni . '.html"');
        echo $htmlPdf;
        exit;
    }

    require_once __DIR__ . '/vendor/autoload.php';

    $pdfOutput = null;

    if (class_exists('\\Mpdf\\Mpdf')) {
        $mpdf = new \Mpdf\Mpdf([
            'format' => 'A4',
            'orientation' => 'P',
            'margin_left' => 0,
            'margin_right' => 0,
            'margin_top' => 0,
            'margin_bottom' => 0,
            'tempDir' => sys_get_temp_dir(),
        ]);

        $mpdf->SetAutoPageBreak(false, 0);
        $mpdf->AddPage();

        if (!empty($backgroundImageFile) && is_file($backgroundImageFile)) {
            $mpdf->Image($backgroundImageFile, 0, 0, 210, 297, 'png');
        }

        $overlayX = 24;
        $overlayY = 68;
        $overlayW = 156;
        $overlayH = 210;

        if (method_exists($mpdf, 'WriteFixedPosHTML')) {
            $mpdf->WriteFixedPosHTML($htmlOverlayMpdf, $overlayX, $overlayY, $overlayW, $overlayH, 'auto');
        } else {
            $mpdf->SetXY($overlayX, $overlayY);
            $mpdf->WriteHTML($htmlOverlayMpdf);
        }
        $pdfOutput = $mpdf->Output('', 'S');
    } elseif (class_exists('\\Dompdf\\Dompdf')) {
        $options = new \Dompdf\Options();
        $options->set('isRemoteEnabled', true);
        $options->set('isHtml5ParserEnabled', true);
        $options->set('defaultFont', 'Arial');

        $dompdf = new \Dompdf\Dompdf($options);
        $dompdf->loadHtml($htmlPdf);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();
        $pdfOutput = $dompdf->output();
    }

    if ($pdfOutput === null) {
        cleanOutputBuffers();
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="caratula_paciente_' . $dni . '.html"');
        echo $htmlPdf;
        exit;
    }

    cleanOutputBuffers();
    header('Content-Type: application/pdf');
    header('Content-Length: ' . strlen($pdfOutput));
    header('Content-Disposition: attachment; filename="caratula_paciente_' . $dni . '.pdf"');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Cache-Control: post-check=0, pre-check=0', false);
    header('Pragma: no-cache');
    header('Expires: 0');
    echo $pdfOutput;
} catch (Exception $e) {
    cleanOutputBuffers();

    $isLocal = in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost', '127.0.0.1']) ||
        strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost:') === 0;

    if ($isLocal) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Error al generar PDF',
            'details' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'autoload_exists' => file_exists(__DIR__ . '/vendor/autoload.php'),
            'current_dir' => __DIR__,
        ]);
    } else {
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="caratula_paciente_' . $dni . '.html"');
        echo $htmlPdf;
    }
}
?>
