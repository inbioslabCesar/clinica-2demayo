<?php
header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="caratula_paciente.pdf"');

require_once 'config.php';

// Función helper para escapar HTML
function h($str) {
    return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}

if (!isset($_GET['paciente_id'])) {
    die('ID de paciente requerido');
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
    die('Paciente no encontrado');
}

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
    margin-bottom: 15px;
    border-bottom: 2px solid #8b5cf6;
    padding-bottom: 8px;
}

.clinic-title {
    font-size: 26px;
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
    margin-bottom: 12px;
}

.document-title {
    font-size: 16px;
    font-weight: bold;
    color: #4c1d95;
    margin: 12px 0;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 1px;
    border: 2px solid #8b5cf6;
    padding: 10px;
    border-radius: 6px;
    background: linear-gradient(135deg, #f3f0ff 0%, #e8e3ff 100%);
}

.hc-number {
    text-align: center;
    margin: 8px 0 15px 0;
    font-size: 20px;
    color: #5b21b6;
    background: #f3f0ff;
    padding: 10px;
    border-radius: 6px;
    border: 1px solid #8b5cf6;
}

.patient-info {
    background: #f8fafc;
    padding: 20px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    margin: 15px 0;
}

.info-row {
    display: flex;
    margin-bottom: 18px;
    align-items: center;
}

.info-label {
    font-weight: bold;
    color: #374151;
    width: 150px;
    flex-shrink: 0;
    font-size: 20px;
}

.info-value {
    color: #1f2937;
    flex: 1;
    padding: 10px 15px;
    background: white;
    border-radius: 5px;
    border: 1px solid #e5e7eb;
    font-size: 18px;
}
</style>
</head>
<body>
<div class="caratula-container">
    <div class="header">
        <div class="logo-section">';

// Cargar logo si existe
$logo_path = 'public/2demayo.svg';
if (file_exists($logo_path)) {
    $logo_content = file_get_contents($logo_path);
    $logo_base64 = base64_encode($logo_content);
    $html .= '<img src="data:image/svg+xml;base64,' . $logo_base64 . '" alt="Logo" style="width: 60px; height: 60px; margin-right: 12px;">';
}

$html .= '
            <div>
                <h1 class="clinic-title">Clínica 2 de Mayo</h1>
            </div>
        </div>
    </div>

    <div class="document-title">Historia Clínica del Paciente</div>
    
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
    </div>
</div>
</body>
</html>';

// Generar PDF
require_once 'vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;

$options = new Options();
$options->set('isRemoteEnabled', true);
$options->set('isHtml5ParserEnabled', true);

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html);
$dompdf->setPaper('A4', 'portrait');
$dompdf->render();

$dompdf->stream('caratula_paciente_' . $paciente['dni'] . '.pdf', ['Attachment' => true]);
?>
