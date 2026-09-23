<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/vendor/autoload.php';

use Mpdf\Mpdf;
use Mpdf\Output\Destination;

function receta_json_error($message, $status = 400)
{
    http_response_code((int)$status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error' => (string)$message,
    ]);
    exit;
}

function receta_h($value)
{
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES, 'UTF-8');
}

function receta_to_text($value)
{
    return trim((string)($value ?? ''));
}

function receta_array($value)
{
    return is_array($value) ? $value : [];
}

function receta_normalizar_data_image($raw)
{
    $raw = trim((string)$raw);
    if ($raw === '') {
        return '';
    }

    if (!preg_match('/^data:image\/([a-zA-Z0-9.+-]+);base64,(.*)$/s', $raw, $m)) {
        return '';
    }

    $subtype = strtolower(trim((string)$m[1]));
    $base64 = preg_replace('/\s+/', '', (string)$m[2]);
    if ($base64 === '') {
        return '';
    }

    $binary = base64_decode($base64, true);
    if ($binary === false || $binary === '') {
        return '';
    }

    // Determina MIME real segun el binario para cubrir data URIs legacy mal rotuladas.
    $imgInfo = @getimagesizefromstring($binary);
    if (is_array($imgInfo) && !empty($imgInfo['mime'])) {
        $mimeReal = strtolower((string)$imgInfo['mime']);
        if (strpos($mimeReal, 'image/') === 0) {
            $subtype = substr($mimeReal, 6);
        }
    }

    // Normaliza alias comunes para mejorar compatibilidad de render en mPDF.
    if ($subtype === 'jpg') {
        $subtype = 'jpeg';
    }

    $allowed = ['png', 'jpeg', 'gif', 'webp', 'svg+xml'];
    if (!in_array($subtype, $allowed, true)) {
        return '';
    }

    return 'data:image/' . $subtype . ';base64,' . base64_encode($binary);
}

function receta_resolver_logo_src($raw)
{
    $raw = receta_to_text($raw);
    if ($raw === '') {
        return '';
    }

    if (preg_match('/^data:/i', $raw)) {
        return receta_normalizar_data_image($raw);
    }

    if (preg_match('/^https?:\/\//i', $raw)) {
        return $raw;
    }

    $pathCandidate = $raw;
    $urlPath = parse_url($raw, PHP_URL_PATH);
    if (is_string($urlPath) && $urlPath !== '') {
        $pathCandidate = $urlPath;
    }

    $absPath = __DIR__ . DIRECTORY_SEPARATOR . ltrim(str_replace(['/', '\\\\'], DIRECTORY_SEPARATOR, $pathCandidate), DIRECTORY_SEPARATOR);
    if (!is_file($absPath) || !is_readable($absPath)) {
        return '';
    }

    $ext = strtolower(pathinfo($absPath, PATHINFO_EXTENSION));
    $mimeMap = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'svg' => 'image/svg+xml',
    ];
    $mime = $mimeMap[$ext] ?? 'application/octet-stream';
    $bin = @file_get_contents($absPath);
    if ($bin === false) {
        return '';
    }

    return 'data:' . $mime . ';base64,' . base64_encode($bin);
}

function receta_format_fecha_larga($iso)
{
    $ts = strtotime((string)$iso);
    if ($ts === false) {
        $ts = time();
    }
    return date('d/m/Y', $ts);
}

function receta_format_hora($iso)
{
    $ts = strtotime((string)$iso);
    if ($ts === false) {
        $ts = time();
    }
    return date('H:i', $ts);
}

function receta_dx_codigo($dx)
{
    return receta_to_text($dx['codigo'] ?? ($dx['cie10'] ?? ($dx['cie10_codigo'] ?? '')));
}

function receta_dx_nombre($dx)
{
    $nombre = receta_to_text($dx['nombre'] ?? ($dx['diagnostico'] ?? ($dx['cie10_nombre'] ?? '')));
    if ($nombre !== '') {
        return $nombre;
    }
    return receta_to_text($dx['descripcion'] ?? ($dx['cie10_descripcion'] ?? ''));
}

function receta_cantidad($med)
{
    $c = (int)($med['cantidad_dispensacion'] ?? ($med['cantidad_dispensar'] ?? ($med['cantidad_total'] ?? 0)));
    return $c > 0 ? $c : 1;
}

function receta_unidad($med)
{
    $u = receta_to_text($med['unidad_dispensacion'] ?? '');
    return $u !== '' ? $u : 'unidad';
}

function receta_indicacion($med)
{
    $obs = receta_to_text($med['observaciones'] ?? '');
    if ($obs !== '') {
        return $obs;
    }

    $parts = [];
    foreach (['dosis', 'frecuencia', 'duracion'] as $k) {
        $v = receta_to_text($med[$k] ?? '');
        if ($v !== '') {
            $parts[] = $v;
        }
    }

    return !empty($parts) ? implode(' | ', $parts) : 'Sin indicaciones';
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'POST') {
    receta_json_error('Metodo no permitido', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    receta_json_error('Payload invalido');
}

$paciente = is_array($input['paciente'] ?? null) ? $input['paciente'] : [];
$medicoInfo = is_array($input['medicoInfo'] ?? null) ? $input['medicoInfo'] : [];
$config = is_array($input['configuracionClinica'] ?? null) ? $input['configuracionClinica'] : [];
$medicamentos = receta_array($input['medicamentos'] ?? []);
$diagnosticos = receta_array($input['diagnosticos'] ?? []);
$recomendaciones = receta_to_text($input['recomendaciones'] ?? '');
$fechaEmision = receta_to_text($input['fecha_emision'] ?? date('c'));

if (empty($medicamentos)) {
    receta_json_error('No hay medicamentos para imprimir.');
}

$nombrePaciente = trim(receta_to_text($paciente['nombre'] ?? ($paciente['nombres'] ?? '')) . ' ' . receta_to_text($paciente['apellido'] ?? ($paciente['apellidos'] ?? '')));
if ($nombrePaciente === '') {
    $nombrePaciente = 'Paciente';
}
$dniPaciente = receta_to_text($paciente['dni'] ?? '-');
$edadPaciente = receta_to_text($paciente['edad'] ?? '');
$edadUnidad = receta_to_text($paciente['edad_unidad'] ?? '');
$sexoPaciente = receta_to_text($paciente['sexo'] ?? '-');
$edadTexto = trim($edadPaciente . ($edadUnidad !== '' ? (' ' . $edadUnidad) : ''));
if ($edadTexto === '') {
    $edadTexto = '-';
}

$nombreClinica = receta_to_text($config['nombre_clinica'] ?? 'Mi Clinica');
$rucClinica = receta_to_text($config['ruc'] ?? '-');
$dirClinica = receta_to_text($config['direccion'] ?? '-');
$telClinica = receta_to_text($config['telefono'] ?? '-');
$logoSrc = receta_resolver_logo_src($config['logo_url'] ?? '');

$medicoNombre = trim(receta_to_text($medicoInfo['abreviatura_profesional'] ?? '') . ' ' . receta_to_text(($medicoInfo['nombre'] ?? '') . ' ' . ($medicoInfo['apellido'] ?? '')));
if ($medicoNombre === '') {
    $medicoNombre = receta_to_text($medicoInfo['nombre'] ?? 'Profesional');
}
$medicoEspecialidad = receta_to_text($medicoInfo['especialidad'] ?? '-');
$cmp = receta_to_text($medicoInfo['cmp'] ?? $medicoInfo['nro_colegiatura'] ?? '-');
$rne = receta_to_text($medicoInfo['rne'] ?? '');
$firmaSrc = receta_resolver_logo_src($medicoInfo['firma'] ?? '');

$dxHtml = '';
if (!empty($diagnosticos)) {
    $dxItems = [];
    foreach ($diagnosticos as $dx) {
        if (!is_array($dx)) {
            continue;
        }
        $codigo = receta_dx_codigo($dx);
        $nombre = receta_dx_nombre($dx);
        if ($codigo === '' && $nombre === '') {
            continue;
        }
        $dxItems[] = '<li><strong>' . receta_h($codigo) . '</strong>' . ($codigo !== '' && $nombre !== '' ? ' - ' : '') . receta_h($nombre) . '</li>';
    }
    if (!empty($dxItems)) {
        $dxHtml = '<div class="block"><div class="label">Diagnostico</div><ul class="dx">' . implode('', $dxItems) . '</ul></div>';
    }
}

$medBlocks = [];
$idx = 1;
foreach ($medicamentos as $med) {
    if (!is_array($med)) {
        continue;
    }

    $nombreMed = receta_to_text($med['nombre'] ?? 'Medicamento');
    if ($nombreMed === '') {
        $nombreMed = 'Medicamento';
    }

    $codigoMed = receta_to_text($med['codigo'] ?? '');
    $presentacion = receta_to_text($med['presentacion'] ?? '');
    $concentracion = receta_to_text($med['concentracion'] ?? '');
    $laboratorio = receta_to_text($med['laboratorio'] ?? '');

    $meta = [];
    foreach ([$presentacion, $concentracion, $laboratorio] as $part) {
        if ($part !== '') {
            $meta[] = $part;
        }
    }

    $indicacion = receta_indicacion($med);
    $cantidad = receta_cantidad($med);
    $unidad = receta_unidad($med);

    $metaText = !empty($meta) ? implode(' - ', $meta) : '';

    $medBlocks[] = '<div class="rx-item">'
        . '<table class="rx-head" width="100%" cellspacing="0" cellpadding="0"><tr>'
        . '<td class="rx-main-cell">'
        . '<span class="rx-num">' . $idx . '.</span>'
        . '<span class="rx-med-name">' . receta_h($nombreMed) . '</span>'
        . ($codigoMed !== '' ? ' <span class="code">(' . receta_h($codigoMed) . ')</span>' : '')
        . ($metaText !== '' ? ' <span class="rx-meta-inline">- ' . receta_h($metaText) . '</span>' : '')
        . '</td>'
        . '<td class="rx-qty-cell"><strong>Cant.:</strong> ' . receta_h((string)$cantidad) . ' ' . receta_h($unidad) . '</td>'
        . '</tr></table>'
        . '<div class="rx-ind"><strong>Indicaciones:</strong> ' . nl2br(receta_h($indicacion)) . '</div>'
        . '</div>';

    $idx++;
}

if (empty($medBlocks)) {
    receta_json_error('No hay medicamentos validos para imprimir.');
}

$headerLogo = $logoSrc !== '' ? '<img src="' . receta_h($logoSrc) . '" class="logo" />' : '';
$headerLogoBlock = $headerLogo !== '' ? '<div class="logo-wrap">' . $headerLogo . '</div>' : '';
$headerHtml = '
<table class="header" width="100%" cellspacing="0" cellpadding="0">
  <tr>
    <td width="60%">
            <table class="clinic-grid" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                    <td class="clinic-logo" width="22%" align="left">' . $headerLogoBlock . '</td>
                    <td class="clinic-data" width="78%">
                        <div class="cn">' . receta_h($nombreClinica) . '</div>
                        <div>RUC: ' . receta_h($rucClinica) . '</div>
                        <div>Direccion: ' . receta_h($dirClinica) . '</div>
                        <div>Tel: ' . receta_h($telClinica) . '</div>
                    </td>
                </tr>
            </table>
    </td>
    <td width="40%" align="right">
      <div class="doc">' . receta_h($medicoNombre) . '</div>
      <div>' . receta_h($medicoEspecialidad) . '</div>
      <div>CMP: ' . receta_h($cmp) . '</div>'
      . ($rne !== '' ? '<div>RNE: ' . receta_h($rne) . '</div>' : '') . '
    </td>
  </tr>
</table>
<table class="title-row" width="100%" cellspacing="0" cellpadding="0">
    <tr>
        <td width="55%" class="title">RECETA MEDICA</td>
        <td width="45%" class="datetime" align="right">Fecha: ' . receta_h(receta_format_fecha_larga($fechaEmision)) . ' &nbsp; Hora: ' . receta_h(receta_format_hora($fechaEmision)) . '</td>
    </tr>
</table>
<div class="patient-row">Paciente: ' . receta_h($nombrePaciente) . ' &nbsp;|&nbsp; DNI: ' . receta_h($dniPaciente) . ' &nbsp;|&nbsp; Edad: ' . receta_h($edadTexto) . ' &nbsp;|&nbsp; Sexo: ' . receta_h($sexoPaciente) . '</div>
';

$firmaHtml = '';
if ($firmaSrc !== '') {
    $firmaHtml = '<div class="firma-wrap"><img src="' . receta_h($firmaSrc) . '" class="firma" /></div>';
}

$registroMedico = 'CMP: ' . receta_h($cmp);
if ($rne !== '') {
    $registroMedico .= '  |  RNE: ' . receta_h($rne);
}

$bodyHtml = '
<html>
<head>
<style>
body { font-family: sans-serif; font-size: 8.6pt; color: #111827; }
.block { border: 1px solid #111827; padding: 3px; margin-bottom: 3px; }
.label { font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #d1d5db; margin-bottom: 2px; font-size: 7.7pt; }
ul.dx { margin: 0; padding-left: 14px; }
ul.dx li { margin: 0; font-size: 7.8pt; }
.rx-list { margin-top: 2px; }
.rx-item { border: 1px solid #111827; padding: 2px 3px; margin-bottom: 3px; page-break-inside: avoid; }
.rx-head { margin-top: 0; }
.rx-head td { vertical-align: top; line-height: 1.02; }
.rx-main-cell { width: 78%; }
.rx-num { display: inline-block; min-width: 16px; font-weight: 700; }
.rx-med-name { font-weight: 700; text-transform: uppercase; font-size: 7.6pt; }
.code { font-weight: 400; color: #475569; font-size: 6.9pt; }
.rx-meta-inline { font-size: 6.9pt; color: #334155; }
.rx-qty-cell { width: 22%; font-size: 7pt; text-align: right; white-space: nowrap; }
.rx-ind { font-size: 7.3pt; margin-top: 1px; line-height: 1.05; }
.warn { margin-top: 4px; border: 1px solid #fca5a5; background: #fff1f2; padding: 3px; font-size: 7.4pt; }
.reco { margin-top: 4px; border: 1px solid #fcd34d; background: #fffbeb; padding: 3px; font-size: 7.4pt; }
.sign { margin-top: 6px; }
.sign-box { width: 210px; margin: 0 0 0 auto; text-align: center; }
.firma-wrap { margin-bottom: -3px; text-align: center; line-height: 1; }
.firma { max-height: 58px; width: auto; display: inline-block; }
.sign-line { display: block; width: 100%; margin: 0; border-top: 1px solid #111827; padding-top: 1px; text-align: center; }
.sign-name { font-size: 7.8pt; font-weight: 700; line-height: 1.05; }
.sign-spec { font-size: 7.6pt; line-height: 1.05; }
.sign-reg { font-size: 7.4pt; line-height: 1.05; }
.header { font-size: 8.5pt; }
.clinic-grid td { vertical-align: top; }
.clinic-data { padding-left: 6px; }
.clinic-logo { text-align: left; }
.logo-wrap { text-align: left; }
.logo { max-height: 46px; width: auto; }
.cn { font-weight: 700; text-transform: uppercase; font-size: 8.6pt; margin-bottom: 1px; }
.doc { font-weight: 700; font-size: 8.5pt; }
.title-row { border-top: 1px solid #111827; border-bottom: 1px solid #111827; margin-top: 4px; }
.title-row td { padding: 2px 0; line-height: 1.02; }
.title { font-weight: 700; font-size: 9pt; }
.datetime { font-size: 7.4pt; color: #334155; }
.patient-row { border-bottom: 1px solid #111827; padding: 2px 0; margin-bottom: 3px; font-size: 7.6pt; line-height: 1.02; }
</style>
</head>
<body>
' . $dxHtml . '
<div class="rx-list">
    ' . implode('', $medBlocks) . '
</div>
' . ($recomendaciones !== '' ? '<div class="reco"><strong>Recomendaciones:</strong><br>' . nl2br(receta_h($recomendaciones)) . '</div>' : '') . '
<div class="warn"><strong>Advertencias:</strong> Receta personal e intransferible. Fuera del alcance de ninos.</div>
<div class="sign">'
    . '<div class="sign-box">'
  . $firmaHtml
  . '<div class="sign-line">'
    . '<div class="sign-name">' . receta_h($medicoNombre) . '</div>'
    . '<div class="sign-spec">' . receta_h($medicoEspecialidad) . '</div>'
    . '<div class="sign-reg">' . $registroMedico . '</div>'
    . '</div>'
    . '</div></div>
</body>
</html>';

try {
    $mpdf = new Mpdf([
        'mode' => 'utf-8',
        'format' => 'A4',
        'margin_left' => 10,
        'margin_right' => 10,
        'margin_top' => 40,
        'margin_bottom' => 12,
    ]);

    $mpdf->SetTitle('Receta Medica');
    $mpdf->SetHTMLHeader($headerHtml);
    $mpdf->SetHTMLFooter('<div style="text-align:right;font-size:8pt;color:#475569;">{PAGENO}/{nbpg}</div>');
    $mpdf->WriteHTML($bodyHtml);

    $pdfBinary = $mpdf->Output('', Destination::STRING_RETURN);
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="receta_medica.pdf"');
    header('Content-Length: ' . strlen($pdfBinary));
    echo $pdfBinary;
    exit;
} catch (Throwable $e) {
    receta_json_error('No se pudo generar el PDF de receta: ' . $e->getMessage(), 500);
}
