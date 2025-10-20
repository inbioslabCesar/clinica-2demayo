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
