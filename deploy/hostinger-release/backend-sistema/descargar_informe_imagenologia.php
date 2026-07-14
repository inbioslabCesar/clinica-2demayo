<?php
/**
 * Script: Descargar PDF de Informe de Imagenología
 * Propósito: Servir descarga del PDF generado
 * 
 * GET /descargar_informe_imagenologia.php?informe_id=456
 */

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

// Validar autenticación
$usuario = $_SESSION['usuario'] ?? $_SESSION['medico'] ?? null;
$rol = strtolower(trim((string)($usuario['rol'] ?? '')));

if (!$usuario || !in_array($rol, ['medico', 'administrador', 'recepcionista'])) {
    http_response_code(403);
    die('Acceso denegado');
}

$informeId = (int)($_GET['informe_id'] ?? 0);

if ($informeId <= 0) {
    http_response_code(400);
    die('informe_id es requerido');
}

// Obtener ruta del PDF
$stmt = $mysqli->prepare('SELECT pdf_path FROM imagenologia_informes WHERE id = ?');
$stmt->bind_param('i', $informeId);
$stmt->execute();
$result = $stmt->get_result();
$informe = $result->fetch_assoc();
$stmt->close();

if (!$informe || empty($informe['pdf_path'])) {
    http_response_code(404);
    die('PDF no encontrado');
}

$pdfPath = __DIR__ . '/' . $informe['pdf_path'];

if (!is_file($pdfPath)) {
    http_response_code(404);
    die('Archivo no existe');
}

// Servir descarga del PDF
header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . basename($pdfPath) . '"');
header('Content-Length: ' . filesize($pdfPath));
header('Cache-Control: no-cache, no-store, must-revalidate');

readfile($pdfPath);
?>
