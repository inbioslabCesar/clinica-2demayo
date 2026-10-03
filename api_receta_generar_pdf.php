<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/vendor/autoload.php';

use Mpdf\Mpdf;
use Mpdf\Output\Destination;
use Mpdf\HTMLParserMode;

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

$medResumenBlocks = [];
$medIndicacionBlocks = [];
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

    $medResumenBlocks[] = '<tr>'
        . '<td class="rx-num">' . $idx . '.</td>'
        . '<td class="rx-body">'
        . '<div class="med-name">' . receta_h($nombreMed) . ($codigoMed !== '' ? ' <span class="med-code">(' . receta_h($codigoMed) . ')</span>' : '') . '</div>'
        . '<div class="med-meta">Presentacion: ' . receta_h($metaText !== '' ? $metaText : 'No especificada') . '</div>'
        . '</td>'
        . '<td class="rx-qty">' . receta_h((string)$cantidad) . ' ' . receta_h($unidad) . '</td>'
        . '</tr>';

    $medIndicacionBlocks[] = '<tr>'
        . '<td class="rx-num">' . $idx . '.</td>'
        . '<td class="rx-body">'
        . '<div class="med-name">' . receta_h($nombreMed) . '</div>'
        . '<div class="med-ind">' . nl2br(receta_h($indicacion)) . '</div>'
        . '</td>'
        . '</tr>';

    $idx++;
}

if (empty($medResumenBlocks)) {
    receta_json_error('No hay medicamentos validos para imprimir.');
}

$headerLogo = $logoSrc !== '' ? '<img src="' . receta_h($logoSrc) . '" class="logo" />' : '';
$headerLogoBlock = $headerLogo !== '' ? '<div class="logo-wrap">' . $headerLogo . '</div>' : '';

$registroMedico = 'CMP: ' . receta_h($cmp);
if ($rne !== '') {
    $registroMedico .= '  |  RNE: ' . receta_h($rne);
}

$clinicHeaderHtml = '
<table class="mini-head" width="100%" cellspacing="0" cellpadding="0">
    <tr>
        <td width="64%" class="mini-clinic-wrap">
            <table width="100%" cellspacing="0" cellpadding="0" class="mini-clinic-table">
                <tr>
                    <td width="18%" class="mini-logo">' . $headerLogoBlock . '</td>
                    <td width="82%" class="mini-clinic">
                        <div class="cn">' . receta_h($nombreClinica) . '</div>
                        <div>RUC: ' . receta_h($rucClinica) . '</div>
                        <div>Direccion: ' . receta_h($dirClinica) . '</div>
                        <div>Tel: ' . receta_h($telClinica) . '</div>
                    </td>
                </tr>
            </table>
        </td>
        <td width="36%" class="mini-doctor">
            <div class="mini-doctor-name">' . receta_h($medicoNombre) . '</div>
            <div>' . receta_h($medicoEspecialidad) . '</div>
            <div>' . $registroMedico . '</div>
        </td>
    </tr>
</table>';

$firmaHtml = '';
if ($firmaSrc !== '') {
    $firmaHtml = '<div class="firma-wrap"><img src="' . receta_h($firmaSrc) . '" class="firma" /></div>';
}

$css = '
body { font-family: Arial, Helvetica, sans-serif; font-size: 8.8pt; color: #0f172a; }
.sheet { width: 100%; }
.split { width: 100%; border-collapse: collapse; table-layout: fixed; }
.split td { vertical-align: top; }
.col-left { width: 50%; border-right: 1px dashed #c7ceda; padding-right: 4.5mm; }
.col-right { width: 50%; padding-left: 4.5mm; }

.mini-head { border-bottom: 2px solid #2b5db3; margin-bottom: 3px; }
.mini-head td { vertical-align: top; }
.mini-logo { text-align: left; }
.mini-clinic-wrap { padding-right: 4px; }
.mini-clinic-table { border-collapse: collapse; }
.mini-clinic { padding-left: 4px; font-size: 8.4pt; line-height: 1.2; }
.logo-wrap { text-align: left; }
.logo { max-height: 34px; width: auto; }
.cn { font-weight: 700; text-transform: uppercase; font-size: 10.2pt; color: #1f4fb6; }
.mini-doctor { text-align: right; font-size: 7pt; line-height: 1.16; color: #334155; white-space: nowrap; }
.mini-doctor-name { font-weight: 700; font-size: 7.5pt; color: #0f172a; }

.doctor-head { border-bottom: 1px solid #cbd5e1; margin-bottom: 2px; text-align: right; font-size: 8.6pt; }
.doctor-name { font-weight: 700; font-size: 9pt; }

.title-row { border-bottom: 1px solid #d4deee; margin-bottom: 4px; }
.title-row td { padding: 1px 0 2px 0; }
.title { font-weight: 700; font-size: 11.8pt; color: #204daf; }
.datetime { font-size: 7.4pt; color: #64748b; text-align: right; }
.intro { font-size: 7.6pt; color: #64748b; margin: 0 0 4px 0; }

.block { border: 1px solid #d6e4ff; padding: 4px; margin-bottom: 4px; background: #ffffff; }
.block-soft { border: 1px solid #d6e4ff; background: #f8fbff; }
.label { font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #d6e4ff; margin-bottom: 3px; font-size: 8pt; color: #1f4fb6; }
.patient-box { border: 1px solid #cddbf3; background: #ffffff; margin-bottom: 5px; }
.patient-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.patient-table td { padding: 5px 6px; vertical-align: top; }
.patient-row-top td { border-bottom: 1px solid #e1e8f5; }
.patient-row-top-left { width: 68%; font-size: 9.1pt; font-weight: 700; color: #0f172a; }
.patient-row-top-right { width: 32%; text-align: right; font-size: 8.3pt; color: #334155; white-space: nowrap; }
.patient-row-bottom td { font-size: 8pt; color: #64748b; }
.patient-row-bottom-left { width: 50%; text-align: left; }
.patient-row-bottom-right { width: 50%; text-align: right; }

ul.dx { margin: 0; padding-left: 14px; }
ul.dx li { margin: 0; font-size: 7.8pt; line-height: 1.2; }

.med-name { font-weight: 700; font-size: 8.4pt; color: #0f172a; line-height: 1.2; }
.med-code { color: #64748b; font-size: 7.2pt; font-weight: 400; }
.med-meta { color: #475569; font-size: 7.2pt; line-height: 1.22; }
.med-ind { color: #1f2937; font-size: 7.6pt; line-height: 1.26; }

.rx-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 2px; }
.rx-table tr { border-bottom: 1px solid #dbe6f7; }
.rx-table tr:first-child { border-top: 1px solid #dbe6f7; }
.rx-table td { vertical-align: top; padding: 4px 4px; }
.rx-num { width: 16px; text-align: right; color: #2453bb; font-weight: 700; padding-right: 2px; }
.rx-body { width: auto; }
.rx-qty { width: 82px; text-align: right; color: #2453bb; font-weight: 700; white-space: nowrap; }

.reco { margin-top: 4px; border: 1px solid #b7ebc0; background: #f5fff7; padding: 4px; font-size: 7.6pt; line-height: 1.25; }
.warn { margin-top: 4px; border: 1px solid #fecdd3; background: #fff6f7; padding: 4px; font-size: 7.6pt; line-height: 1.25; }

.sign-wrap { margin-top: 7px; }
.sign-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.sign-table td { vertical-align: bottom; }
.sign-main-cell { width: 72%; }
.sign-seal-cell { width: 28%; text-align: right; }
.sign-main-box { width: 58mm; margin: 0 auto 0 0; }
.firma-wrap { text-align: center; line-height: 1; height: 17mm; overflow: hidden; }
.firma { max-height: 15mm; width: auto; display: inline-block; vertical-align: bottom; }
.sign-line { border-top: 1px solid #94a3b8; padding-top: 2px; text-align: center; }
.sign-name { font-size: 7.8pt; font-weight: 700; line-height: 1.1; }
.sign-spec { font-size: 7.4pt; line-height: 1.1; }
.sign-reg { font-size: 7.2pt; line-height: 1.1; }
.firm-label { font-size: 7.2pt; font-weight: 700; color: #334155; margin-top: 1px; }
.seal-box { width: 30mm; height: 15mm; border: 1px dashed #8fb3e8; text-align: center; font-size: 7pt; color: #2b5db3; padding-top: 4.5mm; background: #f8fbff; }
';

$bodyHtml = '
<div class="sheet">
    <table class="split" cellspacing="0" cellpadding="0">
        <tr>
            <td class="col-left" width="50%">
                ' . $clinicHeaderHtml . '
                <div class="patient-box">
                    <table class="patient-table" cellspacing="0" cellpadding="0">
                        <tr class="patient-row-top">
                            <td class="patient-row-top-left">' . receta_h($nombrePaciente) . '</td>
                            <td class="patient-row-top-right">Edad: ' . receta_h($edadTexto) . ' &nbsp;·&nbsp; Sexo: ' . receta_h($sexoPaciente) . '</td>
                        </tr>
                        <tr class="patient-row-bottom">
                            <td class="patient-row-bottom-left"><strong>Fecha:</strong> ' . receta_h(receta_format_fecha_larga($fechaEmision)) . '</td>
                            <td class="patient-row-bottom-right"><strong>DNI:</strong> ' . receta_h($dniPaciente) . '</td>
                        </tr>
                    </table>
                </div>
                <table class="title-row" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td class="title">Rx</td>
                        <td class="datetime"></td>
                    </tr>
                </table>
                ' . $dxHtml . '
                <div class="block">
                    <div class="label">Medicamentos, presentacion y cantidad</div>
                    <table class="rx-table" cellspacing="0" cellpadding="0">
                        ' . implode('', $medResumenBlocks) . '
                    </table>
                </div>
                <div class="sign-wrap">
                    <table class="sign-table" cellspacing="0" cellpadding="0">
                        <tr>
                            <td class="sign-main-cell">
                                <div class="sign-main-box">
                                    ' . $firmaHtml . '
                                    <div class="sign-line">
                                        <div class="sign-name">' . receta_h($medicoNombre) . '</div>
                                        <div class="sign-spec">' . receta_h($medicoEspecialidad) . '</div>
                                        <div class="sign-reg">' . $registroMedico . '</div>
                                        <div class="firm-label">Firma y sello del medico</div>
                                    </div>
                                </div>
                            </td>
                            <td class="sign-seal-cell">
                                <div class="seal-box">SELLO</div>
                            </td>
                        </tr>
                    </table>
                </div>
            </td>
            <td class="col-right" width="50%">
                ' . $clinicHeaderHtml . '
                <table class="title-row" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td class="title">Indicaciones para el paciente</td>
                        <td class="datetime"></td>
                    </tr>
                </table>
                <p class="intro">Siga cuidadosamente cada indicacion. Ante cualquier duda, contacte a su medico.</p>
                <div class="block">
                    <div class="label">Como tomar el tratamiento</div>
                    <table class="rx-table" cellspacing="0" cellpadding="0">
                        ' . implode('', $medIndicacionBlocks) . '
                    </table>
                </div>
                ' . ($recomendaciones !== '' ? '<div class="reco"><strong>Recomendaciones generales:</strong><br>' . nl2br(receta_h($recomendaciones)) . '</div>' : '') . '
                <div class="warn"><strong>Advertencias:</strong> Receta personal e intransferible. Fuera del alcance de ninos.</div>
                <div class="sign-wrap">
                    <table class="sign-table" cellspacing="0" cellpadding="0">
                        <tr>
                            <td class="sign-main-cell">
                                <div class="sign-main-box">
                                    ' . $firmaHtml . '
                                    <div class="sign-line">
                                        <div class="sign-name">' . receta_h($medicoNombre) . '</div>
                                        <div class="sign-spec">' . receta_h($medicoEspecialidad) . '</div>
                                        <div class="sign-reg">' . $registroMedico . '</div>
                                        <div class="firm-label">Firma y sello del medico</div>
                                    </div>
                                </div>
                            </td>
                            <td class="sign-seal-cell">
                                <div class="seal-box">SELLO</div>
                            </td>
                        </tr>
                    </table>
                </div>
            </td>
        </tr>
    </table>
</div>
';

try {
    $mpdf = new Mpdf([
        'mode' => 'utf-8',
                'format' => 'A4-L',
                'margin_left' => 8,
                'margin_right' => 8,
                'margin_top' => 8,
                'margin_bottom' => 8,
    ]);

    $mpdf->SetTitle('Receta Medica');
    $mpdf->WriteHTML($css, HTMLParserMode::HEADER_CSS);
    $mpdf->WriteHTML($bodyHtml, HTMLParserMode::HTML_BODY);

    $pdfBinary = $mpdf->Output('', Destination::STRING_RETURN);
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="receta_medica.pdf"');
    header('Content-Length: ' . strlen($pdfBinary));
    echo $pdfBinary;
    exit;
} catch (Throwable $e) {
    receta_json_error('No se pudo generar el PDF de receta: ' . $e->getMessage(), 500);
}
