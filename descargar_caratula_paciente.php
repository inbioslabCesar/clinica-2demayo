<?php
require_once __DIR__ . '/init_api.php';
require_once 'config_pdf.php';

// Log de inicio
error_log("Inicio de descarga de carátula - Paciente ID: " . ($_GET['paciente_id'] ?? 'No especificado'));

// Función helper para escapar HTML
function h($str) {
    return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}

if (!isset($_GET['paciente_id'])) {
    error_log("Error: ID de paciente no proporcionado");
    ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'ID de paciente requerido']);
    exit;
}

$paciente_id = intval($_GET['paciente_id']);
error_log("Procesando paciente ID: " . $paciente_id);

// Obtener datos del paciente
$sql = "SELECT *, DATE(creado_en) as fecha_hc FROM pacientes WHERE id = ? LIMIT 1";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $paciente_id);
$stmt->execute();
$result = $stmt->get_result();
$paciente = $result->fetch_assoc();
$stmt->close();

if (!$paciente) {
    error_log("Error: Paciente no encontrado con ID: " . $paciente_id);
    ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
    exit;
}

error_log("Paciente encontrado: " . $paciente['nombre'] . " " . $paciente['apellido']);

// Obtener configuración de la clínica
$config_sql = "SELECT * FROM configuracion_clinica LIMIT 1";
$config_result = $conn->query($config_sql);
$clinica_config = $config_result ? $config_result->fetch_assoc() : [];

// Generar HTML de la carátula
$html = '<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Carátula - ' . h($paciente['apellido'] . ', ' . $paciente['nombre']) . '</title>
<style>
@page { margin: 8mm; size: A4; }
body { 
    font-family: Arial, sans-serif; 
    margin: 0; 
    padding: 5px; 
    background: linear-gradient(135deg, #f3f0ff 0%, #e8e3ff 100%);
    min-height: 100vh;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: flex-start;
}

.caratula-container {
    width: 100%;
    max-width: 90%;
    margin: 0 auto;
    background: white;
    padding: 15px;
    border-radius: 8px;
    border: 3px solid #8b5cf6;
    box-shadow: 
        0 0 0 6px #dc143c,
        0 0 0 12px #00bfff,
        0 4px 15px rgba(139, 92, 246, 0.15);
    position: relative;
    height: auto;
    page-break-inside: avoid;
    box-sizing: border-box;
}

.header {
    text-align: center;
    margin-bottom: 10px;
    border-bottom: 2px solid #8b5cf6;
    padding-bottom: 6px;
}

.clinic-title {
    font-size: 24px;
    font-weight: bold;
    color: #5b21b6;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.logo-section {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
}

.hc-number {
    text-align: center;
    margin: 6px 0 12px 0;
    font-size: 18px;
    color: #5b21b6;
    background: #f3f0ff;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #8b5cf6;
}

.patient-info {
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    padding: 18px;
    border-radius: 10px;
    border: 2px solid #8b5cf6;
    margin: 15px 0;
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
}

.info-row {
    display: flex;
    margin-bottom: 15px;
    align-items: center;
}

.info-label {
    font-weight: bold;
    color: #5b21b6;
    width: 140px;
    flex-shrink: 0;
    font-size: 19px;
    font-family: Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.info-value {
    color: #2563eb;
    flex: 1;
    padding: 10px 14px;
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    border-radius: 5px;
    border: 2px solid #e2e8f0;
    font-size: 17px;
    font-weight: 600;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 4px rgba(139, 92, 246, 0.1);
}
</style>
</head>
<body>
<div class="caratula-container">
    <div class="header">
        <div class="logo-section">';

// Cargar logo si existe - Detectar automáticamente la ruta según el entorno
$isProduction = (
    (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
    (isset($_SERVER['HTTP_HOST']) && strpos($_SERVER['HTTP_HOST'], 'clinica2demayo.com') !== false) ||
    (isset($_SERVER['SERVER_NAME']) && strpos($_SERVER['SERVER_NAME'], 'clinica2demayo.com') !== false) ||
    (isset($_SERVER['HTTP_HOST']) && strpos($_SERVER['HTTP_HOST'], 'hostingersite.com') !== false)
);

// Rutas según el entorno
$logo_paths = [
    $isProduction ? '2demayo.svg' : 'public/2demayo.svg',  // Primera opción según entorno
    '2demayo.svg',                                          // Fallback para producción
    'public/2demayo.svg',                                   // Fallback para desarrollo
    __DIR__ . '/2demayo.svg',                              // Ruta absoluta producción
    __DIR__ . '/public/2demayo.svg'                        // Ruta absoluta desarrollo
];

$logo_loaded = false;
foreach ($logo_paths as $logo_path) {
    if (file_exists($logo_path)) {
        $logo_content = file_get_contents($logo_path);
        $logo_base64 = base64_encode($logo_content);
        $html .= '<img src="data:image/svg+xml;base64,' . $logo_base64 . '" alt="Logo" style="width: 60px; height: 60px; margin-right: 12px;">';
        $logo_loaded = true;
        error_log("Logo cargado desde: " . $logo_path);
        break;
    }
}

if (!$logo_loaded) {
    error_log("Logo no encontrado en ninguna ruta. Directorio actual: " . __DIR__);
    error_log("Rutas intentadas: " . implode(', ', $logo_paths));
}

$html .= '
            <div>
                <h1 class="clinic-title">Clínica 2 de Mayo</h1>
            </div>
        </div>
    </div>

    <div class="hc-number">
        <strong>HC N°: ' . h($paciente['historia_clinica'] ?? 'HC' . str_pad($paciente['id'], 4, '0', STR_PAD_LEFT)) . '</strong>
        <span style="margin-left: 30px;">
            <strong>Fecha: ' . h($paciente['fecha_hc']) . '</strong>
        </span>
    </div>

    <div class="patient-info">
        <div class="info-row">
            <div class="info-label">Apellidos:</div>
            <div class="info-value">' . h($paciente['apellido']) . '</div>
        </div>
        
        <div class="info-row">
            <div class="info-label">Nombres:</div>
            <div class="info-value">' . h($paciente['nombre']) . '</div>
        </div>
        
        <div class="info-row">
            <div class="info-label">DNI:</div>
            <div class="info-value">' . h($paciente['dni']) . '</div>
        </div>
        
        <div class="info-row">
            <div class="info-label">Fecha de Nac.:</div>
            <div class="info-value">' . h($paciente['fecha_nacimiento']) . '</div>
        </div>
        
        <div class="info-row">
            <div class="info-label">Edad:</div>
            <div class="info-value">' . h($paciente['edad']) . ' años</div>
        </div>
        
        <div class="info-row">
            <div class="info-label">Sexo:</div>
            <div class="info-value">' . h($paciente['sexo']) . '</div>
        </div>
        
        <div class="info-row">
            <div class="info-label">Teléfono:</div>
            <div class="info-value">' . h($paciente['telefono']) . '</div>
        </div>
        
        <div class="info-row">
            <div class="info-label">Dirección:</div>
            <div class="info-value">' . h($paciente['direccion']) . '</div>
        </div>
        
        <div class="info-row">
            <div class="info-label">Procedencia:</div>
            <div class="info-value">' . h($paciente['procedencia'] ?? 'No especificado') . '</div>
        </div>
    </div>
</div>
</body>
</html>';

// Generar PDF
try {
    error_log("Intentando cargar autoload.php desde: " . __DIR__ . '/vendor/autoload.php');
    
    if (!file_exists(__DIR__ . '/vendor/autoload.php')) {
        error_log("Error: vendor/autoload.php no encontrado en: " . __DIR__);
        
        // Limpiar buffer y devolver HTML como fallback
        ob_end_clean();
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="caratula_paciente_' . $paciente['dni'] . '.html"');
        echo $html;
        exit;
    }
    
    require_once 'vendor/autoload.php';
    error_log("Autoload cargado correctamente");

    // Verificar que dompdf esté disponible
    if (!class_exists('\Dompdf\Dompdf')) {
        error_log("Error: Clase Dompdf no encontrada");
        
        // Fallback a HTML
        ob_end_clean();
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="caratula_paciente_' . $paciente['dni'] . '.html"');
        echo $html;
        exit;
    }

    $options = new \Dompdf\Options();
    $options->set('isRemoteEnabled', true);
    $options->set('isHtml5ParserEnabled', true);
    $options->set('defaultFont', 'Arial');
    $options->set('isPhpEnabled', false);
    $options->set('chroot', realpath(__DIR__));
    
    error_log("Iniciando generación de PDF");
    
    $dompdf = new \Dompdf\Dompdf($options);
    $dompdf->loadHtml($html);
    $dompdf->setPaper('A4', 'portrait');
    
    error_log("Renderizando PDF");
    $dompdf->render();
    
    // Limpiar cualquier output buffer antes de enviar PDF
    ob_end_clean();
    
    // Configurar headers para PDF
    header('Content-Type: application/pdf');
    header('Content-Length: ' . strlen($dompdf->output()));
    header('Content-Disposition: attachment; filename="caratula_paciente_' . $paciente['dni'] . '.pdf"');
    header('Cache-Control: private, max-age=0, must-revalidate');
    header('Pragma: public');
    
    error_log("Enviando PDF: caratula_paciente_" . $paciente['dni'] . ".pdf");
    
    // Enviar el contenido del PDF
    echo $dompdf->output();
    error_log("PDF enviado correctamente");
    
} catch (Exception $e) {
    error_log("Error en generación de PDF: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    error_log("Servidor: " . ($_SERVER['HTTP_HOST'] ?? 'unknown'));
    error_log("Directorio actual: " . __DIR__);
    error_log("¿Existe vendor/autoload.php?: " . (file_exists(__DIR__ . '/vendor/autoload.php') ? 'SÍ' : 'NO'));
    
    // Limpiar buffer y mostrar error
    ob_end_clean();
    
    // En desarrollo, mostrar más detalles del error
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
            'current_dir' => __DIR__
        ]);
    } else {
        // En producción, ofrecer fallback HTML
        error_log("Ofreciendo fallback HTML en producción");
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="caratula_paciente_' . ($paciente['dni'] ?? 'unknown') . '.html"');
        echo $html ?? '<h1>Error al generar carátula</h1><p>No se pudo generar el documento PDF.</p>';
    }
}
?>
