<?php
require_once __DIR__ . '/init_api.php';
require_once 'config_pdf.php';

// Log de inicio

// Función helper para escapar HTML
function h($str) {
    return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}

if (!isset($_GET['paciente_id'])) {
    ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'ID de paciente requerido']);
    exit;
}

$paciente_id = intval($_GET['paciente_id']);

// Obtener datos del paciente
$sql = "SELECT *, DATE(creado_en) as fecha_hc FROM pacientes WHERE id = ? LIMIT 1";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $paciente_id);
$stmt->execute();
$result = $stmt->get_result();
$paciente = $result->fetch_assoc();
$stmt->close();

if (!$paciente) {
    ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
    exit;
}


// Obtener configuración de la clínica
$config_sql = "SELECT * FROM configuracion_clinica LIMIT 1";
$config_result = $conn->query($config_sql);
$clinica_config = $config_result ? $config_result->fetch_assoc() : [];

// Generar HTML de la carátula
// Detectar entorno y ruta de imagen
$imgPath = (strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost') !== false)
    ? 'public/cartula-hc.png'
    : '/cartula-hc.png';

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
    padding: 0;
    min-height: 100vh;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    /* Imagen de fondo para la carátula */
    background: url("' . $imgPath . '") no-repeat center center fixed;
    background-size: cover;
}

/* Fondo blanco centrado y con padding */
.caratula-container {
        width: 75%;
        max-width: 620px;
        margin: 150px auto 40px auto;
        background: transparent;
    padding: 40px 40px 40px 40px;
    border-radius: 18px;
    border: none;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    position: relative;
    page-break-inside: avoid;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 600px;
}

    <!-- Sin logo ni título, ya que la carátula de fondo los incluye -->
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
    color: #111111;
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

    <div class="hc-number" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(90deg, #e0e7ff 0%, #f3f0ff 100%);
        border-radius: 10px;
        border: 2px solid #8b5cf6;
        box-shadow: 0 2px 8px rgba(139,92,246,0.08);
        padding: 16px 28px;
        font-size: 20px;
        font-weight: bold;
        color: #5b21b6;
        margin-bottom: 18px;
        letter-spacing: 1px;
    ">
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="background: #ede9fe; padding: 6px 16px; border-radius: 6px; color: #5b21b6; font-size: 19px; font-weight: bold; border: 1px solid #c4b5fd;">HC N°: ' . h($paciente['historia_clinica'] ?? 'HC' . str_pad($paciente['id'], 4, '0', STR_PAD_LEFT)) . '</span>
        </div>
        <div style="background: #ede9fe; padding: 6px 16px; border-radius: 6px; color: #2563eb; font-size: 19px; font-weight: bold; border: 1px solid #c4b5fd;">Fecha: ' . h($paciente['fecha_hc']) . '</div>
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
    
    if (!file_exists(__DIR__ . '/vendor/autoload.php')) {
        
        // Limpiar buffer y devolver HTML como fallback
        ob_end_clean();
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="caratula_paciente_' . $paciente['dni'] . '.html"');
        echo $html;
        exit;
    }
    
    require_once 'vendor/autoload.php';

    // Verificar que dompdf esté disponible
    if (!class_exists('\Dompdf\Dompdf')) {
        
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
    
    
    $dompdf = new \Dompdf\Dompdf($options);
    $dompdf->loadHtml($html);
    $dompdf->setPaper('A4', 'portrait');
    
    $dompdf->render();
    
    // Limpiar cualquier output buffer antes de enviar PDF
    ob_end_clean();
    
    // Configurar headers para PDF
    header('Content-Type: application/pdf');
    header('Content-Length: ' . strlen($dompdf->output()));
    header('Content-Disposition: attachment; filename="caratula_paciente_' . $paciente['dni'] . '.pdf"');
    header('Cache-Control: private, max-age=0, must-revalidate');
    header('Pragma: public');
    
    
    // Enviar el contenido del PDF
    echo $dompdf->output();
    
} catch (Exception $e) {
    
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
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="caratula_paciente_' . ($paciente['dni'] ?? 'unknown') . '.html"');
        echo $html ?? '<h1>Error al generar carátula</h1><p>No se pudo generar el documento PDF.</p>';
    }
}
?>
