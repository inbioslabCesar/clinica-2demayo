
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
    'https://clinica2demayo.com'
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

// Obtener configuración de la clínica
$config_sql = "SELECT * FROM configuracion_clinica LIMIT 1";
$config_result = $conn->query($config_sql);
$clinica_config = $config_result->fetch_assoc() ?: [];

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
$html .= '<style>
body { font-family: Arial, sans-serif; margin: 0; padding: 20px; font-size: 12px; color: #333; }
.header-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 15px; }
.clinica-info { flex: 1; }
.clinica-logo { max-height: 80px; max-width: 120px; margin-right: 15px; float: left; }
.clinica-name { font-size: 18px; font-weight: bold; color: #2c3e50; margin: 0; }
.clinica-details { font-size: 11px; color: #666; margin: 2px 0; }
.report-title { text-align: center; font-size: 18px; font-weight: bold; margin: 20px 0 10px 0; color: #2c3e50; }
.report-subtitle { text-align: right; font-size: 12px; margin-bottom: 5px; }
.patient-section { background: #f8f9fa; padding: 15px; border: 1px solid #ddd; margin: 20px 0; border-radius: 4px; }
.patient-row { display: flex; margin: 4px 0; }
.patient-label { font-weight: bold; width: 130px; color: #444; }
.exam-title { background: #e9ecef; padding: 10px; font-weight: bold; font-size: 14px; margin: 25px 0 15px 0; border-left: 4px solid #007bff; text-align: center; text-transform: uppercase; }
.exam-subtitle { color: #666; font-size: 11px; margin: 5px 0; }
.results-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
.results-table th { background: #f1f3f4; padding: 10px 8px; border: 1px solid #ccc; font-weight: bold; font-size: 11px; text-align: center; }
.results-table td { padding: 8px; border: 1px solid #ccc; font-size: 11px; }
.subtitle-row td { background: #f8f9fa; font-weight: bold; text-align: center; }
body { position: relative; min-height: 100vh; padding-bottom: 120px; }
.footer-section { position: absolute; bottom: 80px; right: 20px; width: 200px; }
.signature-area { text-align: center; width: 150px; border: 1px solid #ddd; padding: 10px; background: white; margin-left: auto; }
.signature-line { border-bottom: 1px solid #333; width: 120px; margin: 20px auto 5px; }
.signature-text { font-size: 10px; margin: 5px 0; }
.page-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 60px; background: white; border-top: 1px solid #ddd; padding: 10px 20px; font-size: 10px; color: #666; }
@media print { body { min-height: 100vh; } .footer-section { position: fixed; bottom: 80px; right: 20px; } .page-footer { position: fixed; bottom: 0; } }
</style>';
$html .= '</head><body>';

// Header similar al modelo INBIOSLAB
$html .= '<div class="header-top">';

// Logo de la clínica en la izquierda
$html .= '<div style="display: flex; align-items: center;">';

// Detectar automáticamente la ruta según el entorno
$isProduction = (
    (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
    (isset($_SERVER['HTTP_HOST']) && strpos($_SERVER['HTTP_HOST'], 'clinica2demayo.com') !== false) ||
    (isset($_SERVER['SERVER_NAME']) && strpos($_SERVER['SERVER_NAME'], 'clinica2demayo.com') !== false) ||
    (isset($_SERVER['HTTP_HOST']) && strpos($_SERVER['HTTP_HOST'], 'hostingersite.com') !== false)
);

// Múltiples rutas posibles para el logo
$logo_paths = [];

// Si hay configuración en la base de datos, intentar esas rutas primero
if (!empty($clinica_config['logo_url'])) {
    $logo_paths[] = __DIR__ . '/' . ltrim($clinica_config['logo_url'], './');
    $logo_paths[] = ltrim($clinica_config['logo_url'], './');
}

// Agregar rutas por defecto según el entorno
if ($isProduction) {
    // Rutas para producción (Hostinger)
    $logo_paths[] = 'uploads/logo_1760763858_7b2d4d55a879.png';  // Logo específico de Hostinger
    $logo_paths[] = '2demayo.svg';                                // Logo SVG en raíz
    $logo_paths[] = __DIR__ . '/uploads/logo_1760763858_7b2d4d55a879.png';
    $logo_paths[] = __DIR__ . '/2demayo.svg';
} else {
    // Rutas para desarrollo
    $logo_paths[] = 'public/2demayo.svg';
    $logo_paths[] = '2demayo.svg';
    $logo_paths[] = __DIR__ . '/public/2demayo.svg';
    $logo_paths[] = __DIR__ . '/2demayo.svg';
}

// Buscar logo en múltiples ubicaciones
$logo_loaded = false;
foreach ($logo_paths as $logo_path) {
    if (file_exists($logo_path)) {
        // Convertir imagen a base64 para que funcione en PDF
        $logo_data = base64_encode(file_get_contents($logo_path));
        $logo_ext = pathinfo($logo_path, PATHINFO_EXTENSION);
        
        // Determinar MIME type correcto
        if ($logo_ext === 'svg') {
            $logo_mime = 'image/svg+xml';
        } elseif ($logo_ext === 'jpg' || $logo_ext === 'jpeg') {
            $logo_mime = 'image/jpeg';
        } elseif ($logo_ext === 'png') {
            $logo_mime = 'image/png';
        } else {
            $logo_mime = 'image/' . $logo_ext;
        }
        
        $html .= '<img src="data:' . $logo_mime . ';base64,' . $logo_data . '" alt="Logo" class="clinica-logo">';
        $logo_loaded = true;
        error_log("Logo de laboratorio cargado desde: " . $logo_path);
        break;
    }
}

if (!$logo_loaded) {
    error_log("Logo de laboratorio no encontrado en ninguna ruta. Directorio actual: " . __DIR__);
    error_log("Rutas intentadas: " . implode(', ', $logo_paths));
    error_log("Entorno detectado: " . ($isProduction ? 'Producción' : 'Desarrollo'));
    error_log("HTTP_HOST: " . ($_SERVER['HTTP_HOST'] ?? 'no definido'));
    error_log("SERVER_NAME: " . ($_SERVER['SERVER_NAME'] ?? 'no definido'));
    error_log("HTTPS: " . (isset($_SERVER['HTTPS']) ? $_SERVER['HTTPS'] : 'no definido'));
}
$html .= '</div>';

// Información de la clínica en la derecha
$html .= '<div style="text-align: right;">';
$html .= '<h1 class="clinica-name">' . h($clinica_config['nombre_clinica'] ?? 'Laboratorio Clínico') . '</h1>';
if (!empty($clinica_config['direccion'])) {
    $html .= '<div class="clinica-details"><strong>Dirección:</strong> ' . h($clinica_config['direccion']) . '</div>';
}
if (!empty($clinica_config['telefono'])) {
    $html .= '<div class="clinica-details"><strong>Teléfono:</strong> ' . h($clinica_config['telefono']) . '</div>';
}
if (!empty($clinica_config['email'])) {
    $html .= '<div class="clinica-details"><strong>Email:</strong> ' . h($clinica_config['email']) . '</div>';
}
$html .= '</div>';

$html .= '</div>'; // fin header-top

// Obtener datos adicionales del paciente si están disponibles
$paciente_dni = '';
$historia_clinica = '';
$fecha_nacimiento = '';
$sexo = '';
$edad = '';
$medico_solicitante = '';
$tipo_solicitud = '';

if (!empty($row['orden_id']) || !empty($row['consulta_id'])) {
    // Intentar obtener más datos del paciente y la orden
    $paciente_sql = "SELECT p.dni, p.historia_clinica, p.fecha_nacimiento, p.sexo, p.edad, p.edad_unidad,
                            o.consulta_id, c.medico_id,
                            CASE 
                                WHEN o.consulta_id IS NOT NULL THEN 'Médico'
                                ELSE 'Particular'
                            END as tipo_solicitud
                     FROM pacientes p 
                     INNER JOIN ordenes_laboratorio o ON p.id = o.paciente_id 
                     LEFT JOIN consultas c ON o.consulta_id = c.id
                     WHERE o.id = ? LIMIT 1";
    
    $orden_id_buscar = !empty($row['orden_id']) ? $row['orden_id'] : 
                      (!empty($row['consulta_id']) ? $row['consulta_id'] : null);
    
    if ($orden_id_buscar) {
        $stmt_pac = $conn->prepare($paciente_sql);
        $stmt_pac->bind_param("i", $orden_id_buscar);
        $stmt_pac->execute();
        $res_pac = $stmt_pac->get_result();
        $pac_data = $res_pac->fetch_assoc();
        $stmt_pac->close();
        
        if ($pac_data) {
            $paciente_dni = $pac_data['dni'] ?? '';
            $historia_clinica = $pac_data['historia_clinica'] ?? '';
            $fecha_nacimiento = $pac_data['fecha_nacimiento'] ?? '';
            $sexo = $pac_data['sexo'] ?? '';
            $edad = $pac_data['edad'] ?? '';
            $edad_unidad = $pac_data['edad_unidad'] ?? 'años';
            $tipo_solicitud = $pac_data['tipo_solicitud'] ?? '';
            
            // Debug temporal - eliminar después
            error_log("Debug datos paciente: " . json_encode($pac_data));
            
            // Si es una solicitud médica, obtener el nombre del médico
            if ($pac_data['medico_id']) {
                $medico_sql = "SELECT CONCAT(nombre, ' ', apellido) as nombre_completo FROM medicos WHERE id = ? LIMIT 1";
                $stmt_med = $conn->prepare($medico_sql);
                $stmt_med->bind_param("i", $pac_data['medico_id']);
                $stmt_med->execute();
                $res_med = $stmt_med->get_result();
                $med_data = $res_med->fetch_assoc();
                $stmt_med->close();
                $medico_solicitante = $med_data['nombre_completo'] ?? '';
            }
        }
    }
}

// Sección de datos del paciente en dos columnas usando tabla
$html .= '<div class="patient-section">';
$html .= '<table style="width: 100%; border: none;">';
$html .= '<tr>';

// Columna izquierda
$html .= '<td style="width: 50%; vertical-align: top; border: none; padding-right: 20px;">';
$html .= '<div class="patient-row"><span class="patient-label">Paciente:</span> <span>' . h($paciente_nombre) . '</span></div>';
if ($paciente_dni) {
    $html .= '<div class="patient-row"><span class="patient-label">DNI:</span> <span>' . h($paciente_dni) . '</span></div>';
}
if ($historia_clinica) {
    $html .= '<div class="patient-row"><span class="patient-label">Historia Clínica:</span> <span>' . h($historia_clinica) . '</span></div>';
}
// Mostrar edad siempre, calculada o como "N/A"
if ($edad) {
    $html .= '<div class="patient-row"><span class="patient-label">Edad:</span> <span>' . h($edad . ' ' . $edad_unidad) . '</span></div>';
} else {
    $html .= '<div class="patient-row"><span class="patient-label">Edad:</span> <span>N/A</span></div>';
}
$html .= '</td>';

// Columna derecha
$html .= '<td style="width: 50%; vertical-align: top; border: none;">';
if ($sexo) {
    $html .= '<div class="patient-row"><span class="patient-label">Sexo:</span> <span>' . h($sexo) . '</span></div>';
}
if ($fecha_nacimiento) {
    $html .= '<div class="patient-row"><span class="patient-label">Fecha Nac.:</span> <span>' . h($fecha_nacimiento) . '</span></div>';
}
$html .= '<div class="patient-row"><span class="patient-label">Fecha Examen:</span> <span>' . h($row['fecha']) . '</span></div>';

// Información de quien solicita el examen
if ($tipo_solicitud) {
    $html .= '<div class="patient-row"><span class="patient-label">Referencia:</span> <span>' . h($tipo_solicitud) . '</span></div>';
    if ($tipo_solicitud === 'Médico' && $medico_solicitante) {
        $html .= '<div class="patient-row"><span class="patient-label">Médico:</span> <span>' . h($medico_solicitante) . '</span></div>';
    }
}
$html .= '</td>';

$html .= '</tr>';
$html .= '</table>';
$html .= '</div>'; // fin patient-section

if (empty($examenes_detalle)) {
    // Si no hay exámenes, mostrar resultado crudo
    $html .= '<div class="exam-title">Resultados</div>';
    $html .= '<pre style="background:#f8f9fa;padding:10px;border:1px solid #ddd;">' . h(json_encode($resultados_map, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) . '</pre>';
} else {
    foreach ($examenes_detalle as $exId => $ex) {
        // Comenzar directamente con la tabla sin información adicional
        if (!empty($ex['valores_referenciales'])) {
            // Tabla de resultados profesional con estilo mejorado
            $html .= '<table class="results-table" style="margin-top: 25px;">';
            $html .= '<thead><tr style="background: linear-gradient(90deg, #e5e7eb 0%, #d1d5db 100%);">';
            $html .= '<th style="padding: 12px 8px; text-align: left; font-weight: bold; font-size: 11px;">Examen / Parámetro</th>';
            $html .= '<th style="padding: 12px 8px; text-align: left; font-weight: bold; font-size: 11px;">Metodología</th>';
            $html .= '<th style="padding: 12px 8px; text-align: left; font-weight: bold; font-size: 11px;">Resultado</th>';
            $html .= '<th style="padding: 12px 8px; text-align: left; font-weight: bold; font-size: 11px;">Unidades</th>';
            $html .= '<th style="padding: 12px 8px; text-align: left; font-weight: bold; font-size: 11px;">Valores de Referencia</th>';
            $html .= '</tr></thead><tbody>';
            
            foreach ($ex['valores_referenciales'] as $param) {
                // Mostrar subtítulos como filas en la tabla (incluyendo el nombre del examen si está configurado)
                $tipo = $param['tipo'] ?? 'Parámetro';
                $nombre_param = $param['nombre'] ?? '';
                
                if (strtolower($tipo) !== 'parámetro') {
                    // Mostrar todos los subtítulos alineados a la izquierda
                    $bgColor = $param['color_fondo'] ?? '#f8f9fa';
                    $textColor = $param['color_texto'] ?? '#000';
                    $fontWeight = $param['negrita'] ? 'bold' : 'normal';
                    $html .= '<tr class="subtitle-row" style="border-bottom: 1px solid #e5e7eb;"><td colspan="5" style="background:' . h($bgColor) . ';color:' . h($textColor) . ';font-weight:' . $fontWeight . ';text-align:left;padding:12px 8px;">' . h($nombre_param) . '</td></tr>';
                    continue;
                }

                $nombre = $param['nombre'] ?? '';
                $metodo = $param['metodologia'] ?? '';
                $unidad = $param['unidad'] ?? '';
                
                // Buscar el valor guardado: llave "{exId}__{nombre}"
                $key = $exId . '__' . $nombre;
                $valor = isset($resultados_map[$key]) ? $resultados_map[$key] : '';

                // Construir referencias legibles en formato de columna
                $refs = '';
                if (!empty($param['referencias']) && is_array($param['referencias'])) {
                    $parts = [];
                    foreach ($param['referencias'] as $r) {
                        if (!empty($r['valor_min']) && !empty($r['valor_max'])) {
                            // Formato en columna con viñetas: • Hombres 13.5-17.5
                            $desc = '';
                            if (!empty($r['desc'])) {
                                // Capitalizar primera letra y convertir el resto a minúsculas para mejor legibilidad
                                $desc = ucfirst(strtolower(trim($r['desc']))) . ' ';
                            }
                            $parts[] = '• ' . $desc . h($r['valor_min']) . '-' . h($r['valor_max']);
                        } elseif (!empty($r['valor'])) {
                            $desc = '';
                            if (!empty($r['desc'])) {
                                $desc = ucfirst(strtolower(trim($r['desc']))) . ' ';
                            }
                            $parts[] = '• ' . $desc . h($r['valor']);
                        }
                    }
                    // Unir con saltos de línea en lugar de comas
                    $refs = implode('<br>', $parts);
                }

                // Aplicar estilos de color y negrita
                $cellStyle = '';
                if (!empty($param['color_fondo']) && $param['color_fondo'] !== '#ffffff') {
                    $cellStyle .= 'background:' . h($param['color_fondo']) . ';';
                }
                if (!empty($param['color_texto']) && $param['color_texto'] !== '#000000') {
                    $cellStyle .= 'color:' . h($param['color_texto']) . ';';
                }
                if (!empty($param['negrita'])) {
                    $cellStyle .= 'font-weight:bold;';
                }

                $html .= '<tr style="border-bottom: 1px solid #e5e7eb;">';
                $html .= '<td style="' . $cellStyle . ' padding: 8px; font-weight: bold;">' . h($nombre) . '</td>';
                $html .= '<td style="' . $cellStyle . ' padding: 8px; text-align: center;">' . h($metodo) . '</td>';
                $html .= '<td style="' . $cellStyle . ' padding: 8px; text-align: center; font-weight: bold; font-size: 12px;">' . h((string)$valor) . '</td>';
                $html .= '<td style="' . $cellStyle . ' padding: 8px; text-align: center;">' . h($unidad) . '</td>';
                $html .= '<td style="' . $cellStyle . ' padding: 8px;">' . $refs . '</td>';
                $html .= '</tr>';
            }
            $html .= '</tbody></table>';
        } else {
            // Examen sin parámetros: intentar mostrar resultado crudo por llave "{exId}" o todo el bloque
            $rawKey = (string)$exId;
            $val = isset($resultados_map[$rawKey]) ? $resultados_map[$rawKey] : null;
            if ($val !== null && $val !== '') {
                $html .= '<div style="margin-top:15px;padding:10px;background:#f8f9fa;border:1px solid #ddd;border-radius:4px;"><strong>Resultado:</strong><div style="margin-top:5px;">' . nl2br(h((string)$val)) . '</div></div>';
            } else {
                $html .= '<div style="margin-top:15px;padding:10px;background:#fff3cd;border:1px solid #ffeaa7;border-radius:4px;color:#856404;text-align:center;">No hay resultados registrados para este examen.</div>';
            }
        }

$html .= '</div>'; // card
    }
}

// Footer con firma en esquina inferior derecha
$html .= '<div class="footer-section">';

// Área de firma (esquina inferior derecha, posición absoluta)
$html .= '<div class="signature-area">';

// Si hay firma digital disponible
if (!empty($clinica_config['firma_url'])) {
    $firma_path = __DIR__ . '/' . ltrim($clinica_config['firma_url'], './');
    if (file_exists($firma_path)) {
        // Convertir firma a base64
        $firma_data = base64_encode(file_get_contents($firma_path));
        $firma_ext = pathinfo($firma_path, PATHINFO_EXTENSION);
        $firma_mime = 'image/' . ($firma_ext === 'jpg' ? 'jpeg' : $firma_ext);
        $html .= '<img src="data:' . $firma_mime . ';base64,' . $firma_data . '" alt="Firma" style="max-height:40px;max-width:100px;margin-bottom:5px;">';
    }
    
    // Información del firmante
    if (!empty($clinica_config['director_nombre']) || !empty($clinica_config['director_cargo'])) {
        $html .= '<div class="signature-line"></div>';
        if (!empty($clinica_config['director_nombre'])) {
            $html .= '<div class="signature-text" style="font-weight:bold;">' . h($clinica_config['director_nombre']) . '</div>';
        }
        if (!empty($clinica_config['director_cargo'])) {
            $html .= '<div class="signature-text">' . h($clinica_config['director_cargo']) . '</div>';
        }
        if (!empty($clinica_config['colegio_profesional'])) {
            $html .= '<div class="signature-text">' . h($clinica_config['colegio_profesional']) . '</div>';
        }
    }
} else {
    // Espacio para firma manual como en el modelo
    $html .= '<div class="signature-line"></div>';
    $html .= '<div class="signature-text">Firma y Sello</div>';
}

$html .= '</div>'; // signature-area
$html .= '</div>'; // footer-section

// Pie de página con información de horarios
$html .= '<div class="page-footer">';
if (!empty($clinica_config['horario_atencion'])) {
    $html .= '<div><strong>Horario de Atención:</strong></div>';
    $html .= '<div>' . nl2br(h($clinica_config['horario_atencion'])) . '</div>';
}
if (!empty($clinica_config['website'])) {
    $html .= '<div><strong>Website:</strong> ' . h($clinica_config['website']) . '</div>';
}
$html .= '</div>';

$html .= '</body></html>';

// Intentar generar PDF si la librería está disponible
$vendor = __DIR__ . '/vendor/autoload.php';
if (file_exists($vendor)) {
    require_once $vendor;
    if (class_exists('\Dompdf\Dompdf')) {
        try {
            $options = new \Dompdf\Options();
            $options->set('isRemoteEnabled', true);
            $options->set('isHtml5ParserEnabled', true);
            $options->set('isPhpEnabled', false);
            
            $dompdf = new \Dompdf\Dompdf($options);
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->loadHtml($html);
            $dompdf->render();
            
            // Forzar descarga con nombre más descriptivo
            $filename = 'resultados_laboratorio_' . ($paciente_nombre ? preg_replace('/[^a-zA-Z0-9]/', '_', $paciente_nombre) . '_' : '') . $row['id'] . '_' . date('Ymd') . '.pdf';
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
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
