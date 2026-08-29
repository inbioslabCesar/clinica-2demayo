<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/vendor/autoload.php';

use Mpdf\Mpdf;

function fail_plain($message, $status = 400)
{
    http_response_code((int)$status);
    header('Content-Type: text/plain; charset=utf-8');
    echo (string)$message;
    exit;
}

function table_exists_local($conn, $table)
{
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function column_exists_local($conn, $table, $column)
{
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function h($value)
{
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES, 'UTF-8');
}

function format_dt_es($raw)
{
    $raw = trim((string)$raw);
    if ($raw === '') return '-';
    $ts = strtotime($raw);
    if ($ts === false) return $raw;
    return date('d/m/Y, g:i:s a', $ts);
}

function format_date_es($raw)
{
    $raw = trim((string)$raw);
    if ($raw === '') return '-';
    $ts = strtotime($raw);
    if ($ts === false) return $raw;
    return date('d/m/Y', $ts);
}

function to_money($value)
{
    return 'S/ ' . number_format((float)$value, 2, '.', '');
}

function format_role($roleRaw)
{
    $role = strtolower(trim((string)$roleRaw));
    if ($role === '') return '';
    if ($role === 'admin' || $role === 'administrador') return 'Admin';
    if (strpos($role, 'recep') !== false) return 'Recepcion';
    if (strpos($role, 'caja') !== false || strpos($role, 'cajero') !== false) return 'Caja';
    if (strpos($role, 'medico') !== false) return 'Medico';
    return ucfirst($role);
}

function servicio_label($tipo)
{
    $k = strtolower(trim((string)$tipo));
    $map = [
        'consulta' => 'Consulta',
        'laboratorio' => 'Laboratorio',
        'farmacia' => 'Farmacia',
        'rayosx' => 'Rayos X',
        'rayos_x' => 'Rayos X',
        'rayos x' => 'Rayos X',
        'ecografia' => 'Ecografia',
        'procedimiento' => 'Procedimiento',
        'procedimientos' => 'Procedimientos',
        'operacion' => 'Operacion',
        'operaciones' => 'Operaciones',
        'hospitalizacion' => 'Hospitalizacion',
        'imagenologia' => 'Imagenologia',
        'imagen' => 'Imagen',
        'tomografia' => 'Tomografia',
    ];
    return $map[$k] ?? ($k !== '' ? ucfirst($k) : 'Servicio');
}

function resolve_logo_src($rawLogo)
{
    $rawLogo = trim((string)$rawLogo);
    if ($rawLogo === '') return '';

    if (preg_match('/^data:/i', $rawLogo)) {
        return $rawLogo;
    }

    if (preg_match('/^https?:\/\//i', $rawLogo)) {
        return $rawLogo;
    }

    $pathCandidate = $rawLogo;
    $urlPath = parse_url($rawLogo, PHP_URL_PATH);
    if (is_string($urlPath) && $urlPath !== '') {
        $pathCandidate = $urlPath;
    }

    $abs = __DIR__ . DIRECTORY_SEPARATOR . ltrim(str_replace(['/', '\\\\'], DIRECTORY_SEPARATOR, $pathCandidate), DIRECTORY_SEPARATOR);
    if (is_file($abs)) {
        $real = realpath($abs);
        if ($real !== false) {
            return 'file:///' . str_replace('\\', '/', $real);
        }
    }

    if (strpos($rawLogo, '/') === 0) {
        $abs2 = __DIR__ . DIRECTORY_SEPARATOR . ltrim($rawLogo, '/');
        if (is_file($abs2)) {
            $real2 = realpath($abs2);
            if ($real2 !== false) {
                return 'file:///' . str_replace('\\', '/', $real2);
            }
        }
    }

    return $rawLogo;
}

$cotizacionId = isset($_GET['cotizacion_id']) ? (int)$_GET['cotizacion_id'] : 0;
if ($cotizacionId <= 0) {
    fail_plain('Cotizacion no valida.', 400);
}

$sqlCot = "SELECT c.id, c.fecha, c.estado, c.total, c.total_pagado, c.saldo_pendiente,
                  c.numero_comprobante, c.observaciones,
                  p.id AS paciente_id, p.nombre, p.apellido, p.dni, p.historia_clinica, p.telefono,
                  COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
                  COALESCE(u.rol, '') AS usuario_rol
           FROM cotizaciones c
           LEFT JOIN pacientes p ON p.id = c.paciente_id
           LEFT JOIN usuarios u ON u.id = c.usuario_id
           WHERE c.id = ?
           LIMIT 1";
$stmtCot = $conn->prepare($sqlCot);
if (!$stmtCot) {
    fail_plain('No se pudo preparar la consulta de cotizacion.', 500);
}
$stmtCot->bind_param('i', $cotizacionId);
$stmtCot->execute();
$cot = $stmtCot->get_result()->fetch_assoc();
$stmtCot->close();

if (!$cot) {
    fail_plain('Cotizacion no encontrada.', 404);
}

$hasEstadoItem = column_exists_local($conn, 'cotizaciones_detalle', 'estado_item');
$hasFechaProgramada = column_exists_local($conn, 'cotizaciones_detalle', 'fecha_programada');
$hasHoraProgramada = column_exists_local($conn, 'cotizaciones_detalle', 'hora_programada');
$hasEsExterno = column_exists_local($conn, 'cotizaciones_detalle', 'es_externo');
$hasConsultaId = column_exists_local($conn, 'cotizaciones_detalle', 'consulta_id');
$hasMedicoId = column_exists_local($conn, 'cotizaciones_detalle', 'medico_id');
$whereDetalleActivo = $hasEstadoItem ? " AND cd.estado_item <> 'eliminado'" : '';

$selectFechaProgramada = $hasFechaProgramada ? 'cd.fecha_programada' : 'NULL AS fecha_programada';
$selectHoraProgramada = $hasHoraProgramada ? 'cd.hora_programada' : 'NULL AS hora_programada';
$selectEsExterno = $hasEsExterno ? 'cd.es_externo' : '0 AS es_externo';
$joinConsultas = $hasConsultaId ? 'LEFT JOIN consultas con ON con.id = cd.consulta_id' : '';
$joinMedicosConsulta = $hasConsultaId ? 'LEFT JOIN medicos mc ON mc.id = con.medico_id' : '';
$joinMedicosDetalle = $hasMedicoId ? 'LEFT JOIN medicos m ON m.id = cd.medico_id' : '';
$selectCorrelativo = $hasConsultaId ? 'COALESCE(con.correlativo_dia_medico, 0) AS correlativo_dia_medico' : '0 AS correlativo_dia_medico';
$selectFechaConsulta = $hasConsultaId ? 'con.fecha AS fecha_consulta' : 'NULL AS fecha_consulta';
$selectHoraConsulta = $hasConsultaId ? 'con.hora AS hora_consulta' : 'NULL AS hora_consulta';
$selectConsultaId = $hasConsultaId ? 'cd.consulta_id' : 'NULL AS consulta_id';
$selectMedicoNombre = trim(($joinMedicosConsulta !== '' || $joinMedicosDetalle !== '')) !== ''
    ? "TRIM(CONCAT(COALESCE(mc.nombre, m.nombre, ''), ' ', COALESCE(mc.apellido, m.apellido, ''))) AS medico_nombre"
    : "'' AS medico_nombre";

$sqlDet = "SELECT cd.id, cd.servicio_tipo, cd.descripcion, cd.cantidad, cd.subtotal,
                  cd.precio_unitario, {$selectFechaProgramada}, {$selectHoraProgramada}, {$selectEsExterno},
                  {$selectConsultaId}, {$selectCorrelativo}, {$selectFechaConsulta}, {$selectHoraConsulta},
                  {$selectMedicoNombre}
           FROM cotizaciones_detalle cd
           {$joinConsultas}
           {$joinMedicosConsulta}
           {$joinMedicosDetalle}
           WHERE cd.cotizacion_id = ?{$whereDetalleActivo}
           ORDER BY cd.id ASC";
$stmtDet = $conn->prepare($sqlDet);
if (!$stmtDet) {
    fail_plain('No se pudo preparar la consulta de detalles.', 500);
}
$stmtDet->bind_param('i', $cotizacionId);
$stmtDet->execute();
$detalles = $stmtDet->get_result()->fetch_all(MYSQLI_ASSOC);
$stmtDet->close();

$pagos = [];
if (table_exists_local($conn, 'cotizacion_movimientos')) {
    $hasMetodoPago = table_exists_local($conn, 'cobros') && column_exists_local($conn, 'cobros', 'tipo_pago');
    $joinCobro = $hasMetodoPago ? ' LEFT JOIN cobros cob ON cob.id = cm.cobro_id ' : '';
    $selectMetodo = $hasMetodoPago ? ', COALESCE(cob.tipo_pago, "") AS metodo_pago' : ', "" AS metodo_pago';

    $sqlPag = "SELECT cm.created_at, cm.tipo_movimiento, cm.monto, cm.saldo_nuevo, cm.descripcion,
                      COALESCE(u.nombre, 'Sistema') AS usuario_nombre{$selectMetodo}
               FROM cotizacion_movimientos cm
               LEFT JOIN usuarios u ON u.id = cm.usuario_id
               {$joinCobro}
               WHERE cm.cotizacion_id = ?
                 AND cm.tipo_movimiento IN ('abono','devolucion')
               ORDER BY cm.created_at ASC, cm.id ASC";
    $stmtPag = $conn->prepare($sqlPag);
    if ($stmtPag) {
        $stmtPag->bind_param('i', $cotizacionId);
        $stmtPag->execute();
        $pagos = $stmtPag->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmtPag->close();
    }
}

$brand = [
    'nombre_clinica' => 'MI CLINICA',
    'logo_url' => '',
    'slogan' => '',
    'slogan_color' => '',
    'nombre_color' => '',
    'direccion' => '',
    'telefono' => '',
    'celular' => '',
    'ruc' => '',
    'email' => '',
];

if (table_exists_local($conn, 'configuracion_clinica')) {
    $cfgRes = $conn->query("SELECT nombre_clinica, logo_url, slogan, slogan_color, nombre_color, direccion, telefono, celular, ruc, email FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
    if ($cfgRes && $cfgRes->num_rows > 0) {
        $cfg = $cfgRes->fetch_assoc();
        if (is_array($cfg)) {
            $brand = array_merge($brand, $cfg);
        }
    }
}

$logoSrc = resolve_logo_src((string)($brand['logo_url'] ?? ''));
$nombreClinica = strtoupper(trim((string)($brand['nombre_clinica'] ?? 'MI CLINICA')));

$usuarioRolFmt = format_role($cot['usuario_rol'] ?? '');
$usuarioLabel = trim((string)($cot['usuario_nombre'] ?? 'Sistema'));
if ($usuarioRolFmt !== '') {
    $usuarioLabel .= ' (' . $usuarioRolFmt . ')';
}

$nombrePaciente = trim((string)($cot['nombre'] ?? '') . ' ' . (string)($cot['apellido'] ?? ''));
if ($nombrePaciente === '') {
    $nombrePaciente = 'Paciente #' . (int)($cot['paciente_id'] ?? 0);
}

$totalBruto = 0.0;
foreach ($detalles as $d) {
    $totalBruto += (float)($d['subtotal'] ?? 0);
}
$descuento = max(0, $totalBruto - (float)($cot['total'] ?? 0));

$correlativoDia = 0;
$fechaCorrelativo = '';
$horaCorrelativo = '';
foreach ($detalles as $d) {
    $corr = (int)($d['correlativo_dia_medico'] ?? 0);
    if ($corr > 0) {
        $correlativoDia = $corr;
        $fechaCorrelativo = trim((string)($d['fecha_consulta'] ?? ''));
        $horaCorrelativo = trim((string)($d['hora_consulta'] ?? ''));
        break;
    }
}

$detRows = '';
if (count($detalles) > 0) {
    foreach ($detalles as $d) {
        $serv = servicio_label($d['servicio_tipo'] ?? '');
        $desc = trim((string)($d['descripcion'] ?? 'Servicio'));
        $cant = (float)($d['cantidad'] ?? 1);
        $subtotal = (float)($d['subtotal'] ?? 0);
        $medico = trim((string)($d['medico_nombre'] ?? ''));
        $esExterno = (int)($d['es_externo'] ?? 0) === 1;
        $programacion = '';
        $fechaProg = trim((string)($d['fecha_programada'] ?? ''));
        $horaProg = trim((string)($d['hora_programada'] ?? ''));
        if ($fechaProg !== '' || $horaProg !== '') {
            $programacion = ' | ' . trim((format_date_es($fechaProg) !== '-' ? format_date_es($fechaProg) : '') . ' ' . ($horaProg !== '' ? substr($horaProg, 0, 5) : ''));
        }

        $detRows .= '<tr>'
            . '<td class="td">' . h($serv) . '</td>'
            . '<td class="td">' . h($desc)
            . ($medico !== '' ? '<div class="sub">Medico: ' . h($medico) . '</div>' : '')
            . ($programacion !== '' ? '<div class="sub">Prog.: ' . h($programacion) . '</div>' : '')
            . ($esExterno ? '<div class="tag">Externo / no cobrable</div>' : '')
            . '</td>'
            . '<td class="td right">' . h(rtrim(rtrim(number_format($cant, 2, '.', ''), '0'), '.')) . '</td>'
            . '<td class="td right">' . h(to_money($subtotal)) . '</td>'
            . '</tr>';
    }
} else {
    $detRows = '<tr><td class="td" colspan="4">Sin items activos</td></tr>';
}

$pagosHtml = '';
if (count($pagos) > 0) {
    $pagosHtml .= '<div class="section-title">Historial de pagos</div>';
    foreach ($pagos as $p) {
        $tipoMov = strtolower(trim((string)($p['tipo_movimiento'] ?? 'abono'))) === 'devolucion' ? 'Descuento' : 'Abono';
        $metodo = trim((string)($p['metodo_pago'] ?? ''));
        if ($metodo === '') $metodo = '-';
        $pagosHtml .= '<div class="pay-line">'
            . h(format_dt_es($p['created_at'] ?? ''))
            . ' | ' . h($tipoMov) . ' ' . h(to_money($p['monto'] ?? 0))
            . ' | ' . h($metodo)
            . ' | Saldo ' . h(to_money($p['saldo_nuevo'] ?? 0))
            . '</div>';
    }
}

$contactoLinea = [];
if (trim((string)($brand['telefono'] ?? '')) !== '') $contactoLinea[] = 'Tel: ' . h($brand['telefono']);
if (trim((string)($brand['celular'] ?? '')) !== '') $contactoLinea[] = 'Cel: ' . h($brand['celular']);
$contactoText = implode(' | ', $contactoLinea);

$html = '
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: DejaVu Sans, Arial, sans-serif; color: #111827; font-size: 10pt; }
.ticket-wrap { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
.center { text-align: center; }
.logo { max-height: 58px; max-width: 180px; margin: 0 auto 6px auto; display: block; object-fit: contain; }
.clinic { font-weight: 800; font-size: 13pt; margin: 2px 0; }
.line { margin: 1px 0; font-size: 9pt; }
.hr { border: 0; border-top: 1px dashed #6b7280; margin: 8px 0; }
.title { text-align: center; font-weight: 800; text-transform: uppercase; margin: 6px 0; letter-spacing: .4px; }
.meta { margin: 2px 0; font-size: 9.6pt; }
.section-title { margin: 8px 0 4px; font-weight: 800; text-transform: uppercase; font-size: 9.8pt; }
.table { width: 100%; border-collapse: collapse; }
.th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 5px; font-weight: 800; font-size: 9pt; text-align: left; }
.td { border: 1px solid #e5e7eb; padding: 5px; font-size: 9pt; vertical-align: top; }
.right { text-align: right; }
.sub { color: #4b5563; font-size: 8.3pt; margin-top: 1px; }
.tag { color: #334155; font-size: 8pt; margin-top: 2px; }
.sum-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 9.6pt; }
.sum-strong { font-weight: 800; }
.pay-line { font-size: 8.8pt; margin: 1px 0; word-break: break-word; }
.note { text-align: center; margin-top: 6px; font-size: 9pt; }
</style>
</head>
<body>
  <div class="ticket-wrap">
    <div class="center">'
      . ($logoSrc !== '' ? '<img class="logo" src="' . h($logoSrc) . '" alt="Logo" />' : '')
      . '<div class="clinic"' . (trim((string)($brand['nombre_color'] ?? '')) !== '' ? ' style="color:' . h($brand['nombre_color']) . ';"' : '') . '>' . h($nombreClinica) . '</div>'
      . (trim((string)($brand['slogan'] ?? '')) !== '' ? '<div class="line" style="font-style:italic;' . (trim((string)($brand['slogan_color'] ?? '')) !== '' ? 'color:' . h($brand['slogan_color']) . ';' : '') . '">' . h($brand['slogan']) . '</div>' : '')
      . (trim((string)($brand['direccion'] ?? '')) !== '' ? '<div class="line">' . h($brand['direccion']) . '</div>' : '')
      . ($contactoText !== '' ? '<div class="line">' . $contactoText . '</div>' : '')
      . (trim((string)($brand['email'] ?? '')) !== '' ? '<div class="line">' . h($brand['email']) . '</div>' : '')
      . (trim((string)($brand['ruc'] ?? '')) !== '' ? '<div class="line">RUC: ' . h($brand['ruc']) . '</div>' : '')
    . '</div>

    <div class="title">Comprobante de cotizacion</div>
    <hr class="hr" />

    <div class="meta"><strong>Nro:</strong> ' . h((string)($cot['numero_comprobante'] ?? ('Q' . str_pad((string)$cotizacionId, 6, '0', STR_PAD_LEFT)))) . '</div>
    <div class="meta"><strong>Cotizacion:</strong> #' . (int)$cotizacionId . '</div>
    <div class="meta"><strong>Fecha:</strong> ' . h(format_dt_es($cot['fecha'] ?? '')) . '</div>
    <div class="meta"><strong>Paciente:</strong> ' . h($nombrePaciente) . '</div>
    <div class="meta"><strong>DNI:</strong> ' . h($cot['dni'] ?? '-') . '</div>
    <div class="meta"><strong>H.C.:</strong> ' . h($cot['historia_clinica'] ?? '-') . '</div>
    <div class="meta"><strong>Cotizado por:</strong> ' . h($usuarioLabel) . '</div>
    ' . ($correlativoDia > 0 ? '<div class="meta"><strong>Correlativo del dia:</strong> N° ' . h($correlativoDia) . '</div>' : '') . '
    ' . ($correlativoDia > 0 && ($fechaCorrelativo !== '' || $horaCorrelativo !== '')
        ? '<div class="meta"><strong>Atencion:</strong> ' . h(format_date_es($fechaCorrelativo)) . ($horaCorrelativo !== '' ? ' ' . h(substr($horaCorrelativo, 0, 5)) : '') . '</div>'
        : '') . '

    <hr class="hr" />
    <div class="section-title">Detalle</div>
    <table class="table">
      <thead>
        <tr>
          <th class="th" style="width:18%;">Servicio</th>
          <th class="th">Descripcion</th>
          <th class="th right" style="width:10%;">Cant.</th>
          <th class="th right" style="width:20%;">Subtotal</th>
        </tr>
      </thead>
      <tbody>' . $detRows . '</tbody>
    </table>

    <hr class="hr" />
    <div class="sum-row"><span>Total bruto</span><span class="sum-strong">' . h(to_money($totalBruto)) . '</span></div>'
    . ($descuento > 0 ? '<div class="sum-row"><span>Descuento</span><span class="sum-strong">-' . h(to_money($descuento)) . '</span></div>' : '')
    . '<div class="sum-row"><span class="sum-strong">Total neto</span><span class="sum-strong">' . h(to_money($cot['total'] ?? 0)) . '</span></div>
    <div class="sum-row"><span>Pagado</span><span>' . h(to_money($cot['total_pagado'] ?? 0)) . '</span></div>
    <div class="sum-row"><span>Saldo</span><span>' . h(to_money($cot['saldo_pendiente'] ?? 0)) . '</span></div>

    ' . ($pagosHtml !== '' ? '<hr class="hr" />' . $pagosHtml : '') . '

    <hr class="hr" />
    <div class="note">Gracias por su preferencia</div>
    <div class="note" style="margin-top:2px;">Conserve este ticket</div>
  </div>
</body>
</html>';

$filenameBase = trim((string)($cot['numero_comprobante'] ?? ''));
if ($filenameBase === '') {
    $filenameBase = 'Q' . str_pad((string)$cotizacionId, 6, '0', STR_PAD_LEFT);
}
$filename = 'Ticket_Cotizacion_' . preg_replace('/[^A-Za-z0-9_\-]/', '', $filenameBase) . '.pdf';

$mpdf = new Mpdf([
    'mode' => 'utf-8',
    'format' => 'A5',
    'margin_left' => 8,
    'margin_right' => 8,
    'margin_top' => 8,
    'margin_bottom' => 8,
]);
$mpdf->SetTitle('Ticket Cotizacion ' . $filenameBase);
$mpdf->WriteHTML($html);
$mpdf->Output($filename, 'D');
exit;
