<?php
/**
 * API: Generar PDF de Informe de Imagenología
 * Propósito: Generar PDF que combina texto del informe + imágenes del examen
 * 
 * POST /api_imagenologia_generar_pdf.php
 * Body: { informe_id: 456 }
 */

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/vendor/autoload.php';

use Mpdf\Mpdf;
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;

header('Content-Type: application/json; charset=utf-8');

// Validar autenticación
$usuario = $_SESSION['usuario'] ?? $_SESSION['medico'] ?? null;
$rol = strtolower(trim((string)($usuario['rol'] ?? '')));

if (!$usuario || !in_array($rol, ['medico', 'administrador'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$informeId = (int)($input['informe_id'] ?? 0);

if ($informeId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'informe_id es requerido']);
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Obtener informe
// ═══════════════════════════════════════════════════════════════════════════
$stmt = $mysqli->prepare('
    SELECT ii.*, 
           oi.tipo as tipo_examen, oi.indicaciones,
        p.nombre, p.apellido, p.fecha_nacimiento, p.dni,
           m.nombre as medico_nombre, m.especialidad
    FROM imagenologia_informes ii
    INNER JOIN ordenes_imagen oi ON oi.id = ii.orden_imagen_id
    LEFT JOIN pacientes p ON p.id = ii.paciente_id
    LEFT JOIN medicos m ON m.id = ii.medico_id
    WHERE ii.id = ?
    LIMIT 1
');

$stmt->bind_param('i', $informeId);
$stmt->execute();
$informe = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$informe) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Informe no encontrado']);
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Obtener imágenes de la orden
// ═══════════════════════════════════════════════════════════════════════════
$ordenImagenId = (int)$informe['orden_imagen_id'];
$stmt = $mysqli->prepare('
    SELECT id, nombre_original, archivo_path, tamano, mime_type
    FROM ordenes_imagen_archivos
    WHERE orden_id = ?
    ORDER BY fecha ASC
');

$stmt->bind_param('i', $ordenImagenId);
$stmt->execute();
$archivos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

// ═══════════════════════════════════════════════════════════════════════════
// 3. Decodificar contenido del informe
// ═══════════════════════════════════════════════════════════════════════════
$contenido = $informe['contenido_json'] ? json_decode($informe['contenido_json'], true) : [];

// ═══════════════════════════════════════════════════════════════════════════
// 4. Construir HTML para PDF
// ═══════════════════════════════════════════════════════════════════════════
$pacienteNombre = trim((string)($informe['apellido'] ?? '') . ' ' . (string)($informe['nombre'] ?? ''));
$medicoNombre = (string)($informe['medico_nombre'] ?? 'Dr. [Médico no especificado]');
$especialidad = (string)($informe['especialidad'] ?? '');
$fechaHoy = date('d/m/Y H:i');

$html = '
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 10px;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #0066cc;
            padding-bottom: 10px;
        }
        .header-title {
            font-size: 18px;
            font-weight: bold;
            color: #0066cc;
            margin: 5px 0;
        }
        .header-subtitle {
            font-size: 11px;
            color: #666;
        }
        .patient-info {
            background-color: #f5f5f5;
            padding: 10px;
            margin: 15px 0;
            border-left: 4px solid #0066cc;
            font-size: 11px;
        }
        .exam-header {
            background-color: #e8f0ff;
            padding: 8px;
            margin: 15px 0 10px 0;
            border-left: 4px solid #0066cc;
            font-weight: bold;
            font-size: 12px;
        }
        .section {
            margin: 15px 0;
            page-break-inside: avoid;
        }
        .section-title {
            font-size: 13px;
            font-weight: bold;
            color: #0066cc;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
            margin-bottom: 10px;
            margin-top: 15px;
        }
        .content {
            font-size: 11px;
            line-height: 1.5;
            text-align: justify;
        }
        .images-container {
            margin-top: 20px;
            page-break-inside: avoid;
        }
        .images-title {
            font-size: 13px;
            font-weight: bold;
            color: #0066cc;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
            margin-bottom: 10px;
        }
        .image-item {
            display: inline-block;
            margin: 5px;
            text-align: center;
            vertical-align: top;
            page-break-inside: avoid;
        }
        .image-item img {
            max-width: 220px;
            max-height: 220px;
            border: 1px solid #ddd;
            padding: 2px;
        }
        .image-name {
            font-size: 9px;
            margin-top: 3px;
            color: #666;
            word-break: break-word;
            max-width: 220px;
        }
        .signature-section {
            margin-top: 30px;
            border-top: 1px solid #ccc;
            padding-top: 15px;
            text-align: center;
            font-size: 11px;
        }
        .signature-line {
            margin-top: 20px;
            border-top: 1px solid #333;
            width: 250px;
            margin-left: auto;
            margin-right: auto;
            padding-top: 5px;
        }
        .footer {
            text-align: center;
            font-size: 9px;
            color: #999;
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #ccc;
        }
        .field-label {
            font-weight: bold;
            color: #0066cc;
            display: inline-block;
            width: 150px;
            vertical-align: top;
        }
    </style>
</head>
<body>

<!-- ENCABEZADO -->
<div class="header">
    <div class="header-title">INFORME DE IMAGENOLOGÍA</div>
    <div class="header-subtitle">Clínica 2 de Mayo</div>
    <div class="header-subtitle">Fecha de emisión: ' . htmlspecialchars($fechaHoy) . '</div>
</div>

<!-- INFORMACIÓN DEL PACIENTE -->
<div class="patient-info">
    <div><span class="field-label">Paciente:</span> ' . htmlspecialchars($pacienteNombre) . '</div>
    <div><span class="field-label">DNI:</span> ' . htmlspecialchars($informe['dni'] ?? '') . '</div>
    <div><span class="field-label">Médico:</span> ' . htmlspecialchars($medicoNombre) . ($especialidad ? ' (' . htmlspecialchars($especialidad) . ')' : '') . '</div>
</div>

<!-- ENCABEZADO DEL EXAMEN -->
<div class="exam-header">
    Examen: ' . htmlspecialchars($informe['titulo'] ?? strtoupper($informe['tipo_examen'])) . '
    <br>Indicaciones: ' . htmlspecialchars($informe['indicaciones'] ?? 'No especificadas') . '
</div>

<!-- SECCIONES DEL INFORME -->
<div class="section">';

// Iterar sobre el contenido del informe (hallazgos, conclusión, etc.)
$plantilla = $informe['plantilla_json'] ? json_decode($informe['plantilla_json'], true) : [];
if ($plantilla && isset($plantilla['sections'])) {
    foreach ($plantilla['sections'] as $section) {
        $sectionId = (string)($section['id'] ?? '');
        $sectionNombre = (string)($section['nombre'] ?? $sectionId);
        
        if ($sectionId && isset($contenido[$sectionId])) {
            $html .= '<div class="section-title">' . htmlspecialchars($sectionNombre) . '</div>';
            
            if (is_array($contenido[$sectionId])) {
                foreach ($contenido[$sectionId] as $fieldId => $fieldValue) {
                    if (!empty($fieldValue)) {
                        $html .= '<div class="content">';
                        $html .= '<strong>' . htmlspecialchars($fieldId) . ':</strong> ';
                        $html .= htmlspecialchars($fieldValue);
                        $html .= '</div>';
                    }
                }
            } else {
                $html .= '<div class="content">' . htmlspecialchars($contenido[$sectionId]) . '</div>';
            }
        }
    }
}

$html .= '</div>';

// ═══════════════════════════════════════════════════════════════════════════
// IMÁGENES
// ═══════════════════════════════════════════════════════════════════════════
if (!empty($archivos)) {
    $html .= '<div class="images-container">
        <div class="images-title">Imágenes Diagnósticas</div>';
    
    foreach ($archivos as $archivo) {
        $archivoPath = (string)$archivo['archivo_path'];
        $nombreOriginal = (string)$archivo['nombre_original'];
        $mimeType = (string)($archivo['mime_type'] ?? '');
        
        // Verificar que sea imagen y exista
        if (strpos($mimeType, 'image/') === 0 && is_file($archivoPath)) {
            // Convertir a base64 para incrustar en PDF
            $imageData = base64_encode(file_get_contents($archivoPath));
            $imageSrc = 'data:' . $mimeType . ';base64,' . $imageData;
            
            $html .= '<div class="image-item">
                <img src="' . $imageSrc . '" alt="' . htmlspecialchars($nombreOriginal) . '">
                <div class="image-name">' . htmlspecialchars($nombreOriginal) . '</div>
            </div>';
        }
    }
    
    $html .= '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRMA
// ═══════════════════════════════════════════════════════════════════════════
$html .= '<div class="signature-section">
    <div>Realizado por:</div>
    <div class="signature-line"></div>
    <div>' . htmlspecialchars($medicoNombre) . '</div>
</div>

<!-- PIE DE PÁGINA -->
<div class="footer">
    Documento generado electrónicamente el ' . htmlspecialchars($fechaHoy) . ' | Clínica 2 de Mayo
</div>

</body>
</html>
';

// ═══════════════════════════════════════════════════════════════════════════
// 5. Generar PDF con mPDF
// ═══════════════════════════════════════════════════════════════════════════
try {
    // Crear directorio de salida si no existe
    $uploadDir = __DIR__ . '/uploads/informes_imagenologia';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    
    // Configurar mPDF con fuentes y margen
    $defaultConfig = (new ConfigVariables())->getDefaults();
    $fontDirs = $defaultConfig['fontDir'];
    $defaultFontConfig = (new FontVariables())->getDefaults();
    $fontData = $defaultFontConfig['fontdata'];
    
    $mpdf = new Mpdf([
        'fontDir' => $fontDirs,
        'fontdata' => $fontData,
        'margin_left' => 10,
        'margin_right' => 10,
        'margin_top' => 15,
        'margin_bottom' => 15,
        'encoding' => 'UTF-8',
    ]);
    
    // Escribir HTML
    $mpdf->WriteHTML($html);
    
    // Generar nombre de archivo
    $nombreArchivo = 'informe_imagenologia_' . $informeId . '_' . date('YmdHis') . '.pdf';
    $rutaCompleta = $uploadDir . '/' . $nombreArchivo;
    $rutaRelativa = 'uploads/informes_imagenologia/' . $nombreArchivo;
    
    // Guardar PDF
    $mpdf->Output($rutaCompleta, \Mpdf\Output\Destination::FILE);
    
    // Actualizar BD con ruta del PDF
    $ahora = date('Y-m-d H:i:s');
    $stmt = $mysqli->prepare('
        UPDATE imagenologia_informes 
        SET pdf_path = ?, pdf_generado_at = ?, updated_at = ?
        WHERE id = ?
    ');
    
    $stmt->bind_param('sssi', $rutaRelativa, $ahora, $ahora, $informeId);
    $stmt->execute();
    $stmt->close();
    
    // Registrar en historial
    $stmtHist = $mysqli->prepare('
        INSERT INTO imagenologia_informes_historial (
            informe_id, version, usuario_id, usuario_nombre, tipo_cambio, created_at
        ) SELECT 
            ?, (SELECT MAX(version) + 1 FROM imagenologia_informes_historial WHERE informe_id = ?),
            ?, ?, ?, ?
    ');
    
    if ($stmtHist) {
        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        $usuarioNombre = (string)($_SESSION['usuario']['nombre'] ?? 'Sistema');
        $tipoHist = 'generacion_pdf';
        $stmtHist->bind_param('iiisss', $informeId, $informeId, $usuarioId, $usuarioNombre, $tipoHist, $ahora);
        $stmtHist->execute();
        $stmtHist->close();
    }
    
    echo json_encode([
        'success' => true,
        'pdf_url' => '/' . $rutaRelativa,
        'pdf_path' => $rutaRelativa,
        'mensaje' => 'PDF generado exitosamente'
    ]);
    
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error al generar PDF: ' . $e->getMessage()
    ]);
}
?>
