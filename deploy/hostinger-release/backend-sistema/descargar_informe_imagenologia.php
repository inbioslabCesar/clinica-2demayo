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
$stmt = $mysqli->prepare('
    SELECT ii.pdf_path, ii.created_at, ii.updated_at, ii.titulo, oi.tipo AS tipo_examen, p.nombre, p.apellido
    FROM imagenologia_informes ii
    INNER JOIN ordenes_imagen oi ON oi.id = ii.orden_imagen_id
    LEFT JOIN pacientes p ON p.id = ii.paciente_id
    WHERE ii.id = ?
');
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

function normalizar_texto_archivo_pdf(string $texto): string {
    $texto = trim(mb_strtolower($texto, 'UTF-8'));
    $map = [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
        'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u',
        'ä' => 'a', 'ë' => 'e', 'ï' => 'i', 'ö' => 'o', 'ü' => 'u',
        'ñ' => 'n'
    ];
    $texto = strtr($texto, $map);
    $texto = preg_replace('/[^a-z0-9]+/u', '_', $texto);
    $texto = preg_replace('/_+/', '_', $texto);
    return trim((string)$texto, '_');
}

function construir_nombre_pdf_imagenologia(array $informe): string {
    $paciente = trim((string)($informe['nombre'] ?? '')) . ' ' . trim((string)($informe['apellido'] ?? ''));
    $paciente = trim($paciente);

    $servicioBase = trim((string)($informe['titulo'] ?? ''));
    if ($servicioBase === '') {
        $servicioBase = trim((string)($informe['tipo_examen'] ?? 'Imagenologia'));
    }

    $fechaBase = trim((string)($informe['created_at'] ?? $informe['updated_at'] ?? ''));
    $fechaArchivo = date('Ymd');
    if ($fechaBase !== '') {
        $fechaTimestamp = strtotime($fechaBase);
        if ($fechaTimestamp !== false) {
            $fechaArchivo = date('Ymd', $fechaTimestamp);
        }
    }

    $partes = [];
    if ($paciente !== '') {
        $partes[] = normalizar_texto_archivo_pdf($paciente);
    }
    if ($servicioBase !== '') {
        $partes[] = normalizar_texto_archivo_pdf($servicioBase);
    }
    $partes[] = $fechaArchivo;

    $nombre = implode('_', array_filter($partes, static fn($valor) => $valor !== ''));
    return ($nombre !== '' ? $nombre : 'informe_imagenologia') . '.pdf';
}

$nombreDescarga = construir_nombre_pdf_imagenologia($informe);

// Servir descarga del PDF
header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $nombreDescarga . '"');
header('Content-Length: ' . filesize($pdfPath));
header('Cache-Control: no-cache, no-store, must-revalidate');

readfile($pdfPath);
?>
