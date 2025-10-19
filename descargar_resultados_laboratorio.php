
<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
]);
session_start();
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
if ($id <= 0) {
    http_response_code(400);
    echo 'ID inválido';
    exit;
}

$stmt = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE id = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$res = $stmt->get_result();
$row = $res->fetch_assoc();
$stmt->close();

if (!$row) {
    http_response_code(404);
    echo 'Resultados no encontrados';
    exit;
}
// Soporte para debug: ?json=1 devuelve la fila tal cual
$debugJson = isset($_GET['json']) && $_GET['json'] == '1';
if ($debugJson) {
    header('Content-Type: application/json');
    echo json_encode([
        'id' => $row['id'],
        'consulta_id' => $row['consulta_id'],
        'orden_id' => $row['orden_id'],
        'tipo_examen' => $row['tipo_examen'],
        'resultados' => json_decode($row['resultados'], true),
        'fecha' => $row['fecha']
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Obtener el orden asociado (puede venir por orden_id o consulta_id)
$orden = null;
if (!empty($row['orden_id'])) {
    $stmt = $conn->prepare('SELECT * FROM ordenes_laboratorio WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $row['orden_id']);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();
}
if (!$orden && !empty($row['consulta_id'])) {
    $stmt = $conn->prepare('SELECT * FROM ordenes_laboratorio WHERE consulta_id = ? LIMIT 1');
    $stmt->bind_param('i', $row['consulta_id']);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();
}

// Cargar paciente y datos básicos si están disponibles
$paciente_nombre = '';
if (!empty($orden['paciente_id'])) {
    $stmt = $conn->prepare('SELECT nombre, apellido FROM pacientes WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $orden['paciente_id']);
    $stmt->execute();
    $p = $stmt->get_result()->fetch_assoc();
    if ($p) $paciente_nombre = trim(($p['nombre'] ?? '') . ' ' . ($p['apellido'] ?? ''));
    $stmt->close();
} else if (!empty($row['consulta_id'])) {
    $stmt = $conn->prepare('SELECT p.nombre, p.apellido FROM consultas c JOIN pacientes p ON c.paciente_id = p.id WHERE c.id = ? LIMIT 1');
    $stmt->bind_param('i', $row['consulta_id']);
    $stmt->execute();
    $p = $stmt->get_result()->fetch_assoc();
    if ($p) $paciente_nombre = trim(($p['nombre'] ?? '') . ' ' . ($p['apellido'] ?? ''));
    $stmt->close();
}

// Decodificar resultados y examenes
$resultados_map = json_decode($row['resultados'], true) ?: [];
$examenes_ids = [];
if ($orden && !empty($orden['examenes'])) {
    $examenes_ids = json_decode($orden['examenes'], true);
    if (!is_array($examenes_ids)) $examenes_ids = [];
}

// Cargar detalles de exámenes solicitados
$examenes_detalle = [];
if (!empty($examenes_ids)) {
    // Normalizar array de IDs (puede venir como objetos)
    $ids = array_map(function($it){ return is_array($it) && isset($it['id']) ? intval($it['id']) : intval($it); }, $examenes_ids);
    $unique = array_values(array_unique(array_filter($ids)));
    if (!empty($unique)) {
        $placeholders = implode(',', array_fill(0, count($unique), '?'));
        // Preparar dinámicamente
        $types = str_repeat('i', count($unique));
        $sql = "SELECT * FROM examenes_laboratorio WHERE id IN ($placeholders)";
        $stmt = $conn->prepare($sql);
        // bind_param with dynamic args
        $stmt->bind_param($types, ...$unique);
        $stmt->execute();
        $resEx = $stmt->get_result();
        while ($r = $resEx->fetch_assoc()) {
            if (isset($r['valores_referenciales']) && $r['valores_referenciales']) {
                $r['valores_referenciales'] = json_decode($r['valores_referenciales'], true) ?: [];
            } else {
                $r['valores_referenciales'] = [];
            }
            $examenes_detalle[$r['id']] = $r;
        }
        $stmt->close();
    }
}

// Helper de escape
function h($s) { return htmlspecialchars($s ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

// Construir HTML del reporte
$html = '<!doctype html><html><head><meta charset="utf-8"><title>Resultados de Laboratorio</title>';
$html .= '<style>body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:20px} .header{display:flex;justify-content:space-between;align-items:center} .card{border-radius:6px;padding:12px;margin:12px 0;border:1px solid #e5e7eb} table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:8px;border:1px solid #e5e7eb;text-align:left;font-size:13px} th{background:#f3f4f6;font-weight:700} .subtitle{background:#f9fafb;padding:8px;border-radius:4px;margin-top:8px;font-weight:700} .param-name{font-weight:600} .badge{display:inline-block;padding:4px 8px;border-radius:12px;font-size:12px;background:#eef2ff;color:#3730a3}</style>';
$html .= '</head><body>';
$html .= '<div class="header"><div><h2>Laboratorio - Resultados</h2><div style="color:#6b7280">Fecha: ' . h($row['fecha']) . '</div></div>';
if ($paciente_nombre) $html .= '<div style="text-align:right"><strong>Paciente</strong><div>' . h($paciente_nombre) . '</div></div>';
$html .= '</div>';

if (empty($examenes_detalle)) {
    // Si no hay exámenes, mostrar resultado crudo
    $html .= '<div class="card"><h3>Resultados</h3><pre>' . h(json_encode($resultados_map, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) . '</pre></div>';
} else {
    foreach ($examenes_detalle as $exId => $ex) {
        $html .= '<div class="card">';
        $html .= '<div style="display:flex;justify-content:space-between;align-items:center">';
        $html .= '<div><h3>' . h($ex['nombre']) . '</h3><div style="color:#6b7280">' . h($ex['metodologia'] ?? '') . '</div></div>';
        $html .= '<div><span class="badge">Examen ID: ' . h($exId) . '</span></div>';
        $html .= '</div>';

        if (!empty($ex['valores_referenciales'])) {
            $html .= '<table><thead><tr><th>Parámetro</th><th>Metodología</th><th>Resultado</th><th>Unidades</th><th>Valores de Referencia</th></tr></thead><tbody>';
            foreach ($ex['valores_referenciales'] as $param) {
                // Mostrar subtítulos si el item es de tipo distinto
                $tipo = $param['tipo'] ?? 'Parámetro';
                if (strtolower($tipo) !== 'parámetro') {
                    $html .= '<tr><td colspan="5" style="background:' . h($param['color_fondo'] ?? '#fff') . ';color:' . h($param['color_texto'] ?? '#000') . ';font-weight:' . ($param['negrita'] ? '700' : '400') . '">' . h($param['nombre'] ?? '') . '</td></tr>';
                    continue;
                }

                $nombre = $param['nombre'] ?? '';
                $metodo = $param['metodologia'] ?? '';
                $unidad = $param['unidad'] ?? '';
                // Buscar el valor guardado: llave "{exId}__{nombre}"
                $key = $exId . '__' . $nombre;
                $valor = isset($resultados_map[$key]) ? $resultados_map[$key] : '';

                // Construir referencias legibles
                $refs = '';
                if (!empty($param['referencias']) && is_array($param['referencias'])) {
                    $parts = [];
                    foreach ($param['referencias'] as $r) {
                        $parts[] = trim(($r['valor'] ?? '') . ' ' . ($r['desc'] ?? '') . ($r['valor_min'] || $r['valor_max'] ? (' (' . ($r['valor_min'] ?? '') . ' - ' . ($r['valor_max'] ?? '') . ')') : ''));
                    }
                    $refs = h(implode(', ', $parts));
                }

                $styleCell = 'background:' . h($param['color_fondo'] ?? '#fff') . ';color:' . h($param['color_texto'] ?? '#000') . ';';
                $fontWeight = $param['negrita'] ? 'font-weight:700;' : '';

                $html .= '<tr>';
                $html .= '<td style="' . $styleCell . $fontWeight . '"><span class="param-name">' . h($nombre) . '</span></td>';
                $html .= '<td style="' . $styleCell . $fontWeight . '">' . h($metodo) . '</td>';
                $html .= '<td style="' . $styleCell . $fontWeight . '">' . h((string)$valor) . '</td>';
                $html .= '<td style="' . $styleCell . $fontWeight . '">' . h($unidad) . '</td>';
                $html .= '<td style="' . $styleCell . $fontWeight . '">' . $refs . '</td>';
                $html .= '</tr>';
            }
            $html .= '</tbody></table>';
        } else {
            // Examen sin parámetros: intentar mostrar resultado crudo por llave "{exId}" o todo el bloque
            $rawKey = (string)$exId;
            $val = isset($resultados_map[$rawKey]) ? $resultados_map[$rawKey] : null;
            if ($val !== null && $val !== '') {
                $html .= '<div style="margin-top:8px"><strong>Resultado:</strong><div>' . nl2br(h((string)$val)) . '</div></div>';
            } else {
                $html .= '<div style="margin-top:8px;color:#6b7280">No hay resultados ingresados para este examen.</div>';
            }
        }

        $html .= '</div>'; // card
    }
}

$html .= '<div style="margin-top:18px;color:#9ca3af;font-size:12px">Documento generado desde 2demayo</div>';
$html .= '</body></html>';

// Intentar generar PDF si la librería está disponible
$vendor = __DIR__ . '/vendor/autoload.php';
if (file_exists($vendor)) {
    require_once $vendor;
    if (class_exists('\Dompdf\Dompdf')) {
        try {
            $dompdf = new \Dompdf\Dompdf();
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->loadHtml($html);
            $dompdf->render();
            // Forzar descarga
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="resultados_laboratorio_' . $row['id'] . '.pdf"');
            echo $dompdf->output();
            exit;
        } catch (Exception $e) {
            // Si dompdf falla, caeremos al fallback HTML
            error_log('dompdf error: ' . $e->getMessage());
        }
    }
}

// Fallback: devolver HTML imprimible
header('Content-Type: text/html; charset=utf-8');
echo $html;
exit;
