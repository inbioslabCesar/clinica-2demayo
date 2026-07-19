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
$usuarioId = (int)($usuario['id'] ?? 0);
$usuarioNombre = trim((string)($usuario['nombre'] ?? 'Sistema'));
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
// 0. Obtener configuración de clínica
// ═══════════════════════════════════════════════════════════════════════════
$nombreClinica = 'Clínica';
$direccion = '';
$telefono = '';
$email = '';
$ruc = '';
$website = '';
$logoUrl = '';

$stmtConfig = $mysqli->prepare('SELECT nombre_clinica, direccion, telefono, email, ruc, website, logo_url FROM configuracion_clinica LIMIT 1');
if ($stmtConfig) {
    $stmtConfig->execute();
    $configRow = $stmtConfig->get_result()->fetch_assoc();
    $stmtConfig->close();
    if ($configRow) {
        $nombreClinica = trim((string)($configRow['nombre_clinica'] ?? 'Clínica'));
        $direccion = trim((string)($configRow['direccion'] ?? ''));
        $telefono = trim((string)($configRow['telefono'] ?? ''));
        $email = trim((string)($configRow['email'] ?? ''));
        $ruc = trim((string)($configRow['ruc'] ?? ''));
        $website = trim((string)($configRow['website'] ?? ''));
        $logoUrl = trim((string)($configRow['logo_url'] ?? ''));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Obtener informe
// ═══════════════════════════════════════════════════════════════════════════
$stmt = $mysqli->prepare('
    SELECT ii.*, 
              oi.tipo as tipo_examen, oi.indicaciones, oi.medico_id AS orden_medico_id,
        p.nombre, p.apellido, p.fecha_nacimiento, p.dni,
           mi.nombre as medico_nombre,
           mi.apellido as medico_apellido,
           mi.especialidad as especialidad,
           mi.abreviatura_profesional as abreviatura_profesional,
           mi.colegio_sigla as colegio_sigla,
           mi.nro_colegiatura as nro_colegiatura,
           mi.cmp as cmp,
           mi.rne as rne,
           mi.firma as firma
    FROM imagenologia_informes ii
    INNER JOIN ordenes_imagen oi ON oi.id = ii.orden_imagen_id
    LEFT JOIN pacientes p ON p.id = ii.paciente_id
    LEFT JOIN medicos mi ON mi.id = ii.medico_id
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

function normalizar_clave_pdf(string $texto): string {
    $texto = trim(mb_strtolower($texto, 'UTF-8'));
    $map = [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
        'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u',
        'ä' => 'a', 'ë' => 'e', 'ï' => 'i', 'ö' => 'o', 'ü' => 'u',
        'ñ' => 'n'
    ];
    $texto = strtr($texto, $map);
    $texto = preg_replace('/\?+/', '', $texto);
    $texto = preg_replace('/[^a-z0-9]+/u', '', $texto);
    return (string)$texto;
}

function ruta_imagen_para_mpdf(string $archivoPath): string {
    $normalizada = str_replace('\\', '/', trim($archivoPath));
    if ($normalizada === '') {
        return '';
    }

    // mPDF procesa mejor imágenes locales usando file:// que un blob base64 enorme en HTML.
    if (preg_match('/^[a-zA-Z]:\//', $normalizada)) {
        return 'file:///' . str_replace(' ', '%20', $normalizada);
    }
    if (strpos($normalizada, '/') === 0) {
        return 'file://' . str_replace(' ', '%20', $normalizada);
    }

    return str_replace(' ', '%20', $normalizada);
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
    $nombrePaciente = trim((string)($informe['nombre'] ?? ''));
    $apellidoPaciente = trim((string)($informe['apellido'] ?? ''));
    $paciente = trim($nombrePaciente . ' ' . $apellidoPaciente);

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

// ═══════════════════════════════════════════════════════════════════════════
// 4. Construir HTML para PDF
// ═══════════════════════════════════════════════════════════════════════════
$pacienteNombre = trim((string)($informe['apellido'] ?? '') . ' ' . (string)($informe['nombre'] ?? ''));
$medicoNombreBase = trim(((string)($informe['medico_nombre'] ?? '')) . ' ' . ((string)($informe['medico_apellido'] ?? '')));
$abreviaturaProfesional = trim((string)($informe['abreviatura_profesional'] ?? ''));
$medicoNombre = trim(($abreviaturaProfesional !== '' ? ($abreviaturaProfesional . ' ') : '') . $medicoNombreBase);
if ($medicoNombre === '') {
    $medicoNombre = 'Dr. [Médico no especificado]';
}
$especialidad = (string)($informe['especialidad'] ?? '');
$colegiaturaSigla = trim((string)($informe['colegio_sigla'] ?? ''));
$colegiaturaNumero = trim((string)($informe['nro_colegiatura'] ?? ''));
$cmp = trim((string)($informe['cmp'] ?? ''));
$rne = trim((string)($informe['rne'] ?? ''));
$firmaMedico = trim((string)($informe['firma'] ?? ''));
$fechaHoy = date('d/m/Y H:i');

$colegiaturaPartes = [];
if ($colegiaturaSigla !== '' && $colegiaturaNumero !== '') {
    $colegiaturaPartes[] = $colegiaturaSigla . ': ' . $colegiaturaNumero;
} elseif ($cmp !== '') {
    $colegiaturaPartes[] = 'CMP: ' . $cmp;
}
if ($rne !== '') {
    $colegiaturaPartes[] = 'RNE: ' . $rne;
}
$colegiaturaTexto = implode(' - ', $colegiaturaPartes);

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
            margin-bottom: 6px;
        }
        .field-row {
            margin-bottom: 8px;
        }
        .field-name {
            font-weight: bold;
            color: #1f2937;
            display: block;
            margin-bottom: 2px;
        }
        .images-container {
            margin-top: 20px;
            page-break-inside: auto;
        }
        .images-title {
            font-size: 13px;
            font-weight: bold;
            color: #0066cc;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
            margin-bottom: 10px;
        }
        .images-grid {
            width: 100%;
            border-collapse: separate;
            border-spacing: 5px 6px;
            table-layout: fixed;
        }
        .images-grid tr {
            page-break-inside: avoid;
        }
        .image-cell {
            width: 50%;
            vertical-align: top;
            page-break-inside: avoid;
        }
        .image-box {
            border: 1px solid #d9d9d9;
            background: #fafafa;
            padding: 4px;
            height: 170px;
            text-align: center;
            vertical-align: middle;
        }
        .image-box-inner {
            width: 100%;
            height: 150px;
            position: relative;
            text-align: center;
        }
        .image-box-inner img {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            display: inline-block;
        }
        .image-name {
            font-size: 7px;
            margin-top: 1px;
            color: #666;
            word-break: break-word;
            line-height: 1.1;
            max-height: 10px;
            overflow: hidden;
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
        .signature-image {
            max-width: 180px;
            max-height: 70px;
            margin: 0 auto 8px auto;
            display: block;
            object-fit: contain;
        }
        .signature-meta {
            font-size: 10px;
            color: #666;
            margin-top: 4px;
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
<table style="width: 100%; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #0066cc;">
    <tr>
        <!-- Columna 1: Logo -->
        <td style="width: 20%; text-align: center; vertical-align: middle;">
            ' . (!empty($logoUrl) ? '<img src="' . htmlspecialchars($logoUrl) . '" style="max-width: 100px; max-height: 100px; object-fit: contain;">' : '') . '
        </td>
        
        <!-- Columna 2: Datos de clínica -->
        <td style="width: 60%; text-align: center; vertical-align: middle; padding: 0 15px;">
            <div style="font-size: 20px; font-weight: bold; color: #0066cc; margin-bottom: 8px;">' . htmlspecialchars($nombreClinica) . '</div>
            
            <table style="width: 100%; margin: 0 auto;">
                <tr>
                    <td style="text-align: center; padding: 2px 0; font-size: 9px; color: #333;">
                        ' . ($direccion ? '<div>' . htmlspecialchars($direccion) . '</div>' : '') . '
                    </td>
                </tr>
                <tr>
                    <td style="text-align: center; padding: 2px 0; font-size: 9px; color: #333;">
                        ' . ($telefono ? 'Teléfono: ' . htmlspecialchars($telefono) : '') . '
                        ' . ($email && $telefono ? ' | ' : '') . '
                        ' . ($email ? 'Email: ' . htmlspecialchars($email) : '') . '
                    </td>
                </tr>
                <tr>
                    <td style="text-align: center; padding: 2px 0; font-size: 9px; color: #333;">
                        ' . ($website ? 'Web: ' . htmlspecialchars($website) : '') . '
                        ' . ($ruc && $website ? ' | ' : '') . '
                        ' . ($ruc ? 'RUC: ' . htmlspecialchars($ruc) : '') . '
                    </td>
                </tr>
            </table>
        </td>
        
        <!-- Columna 3: Título del informe -->
        <td style="width: 20%; text-align: right; vertical-align: middle;">
            <div style="font-size: 13px; font-weight: bold; color: #0066cc; line-height: 1.3;">
                INFORME DE<br>IMAGENOLOGÍA
            </div>
            <div style="font-size: 8px; color: #666; margin-top: 5px;">
                ' . htmlspecialchars($fechaHoy) . '
            </div>
        </td>
    </tr>
</table>

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
$plantillaSections = [];
if (isset($plantilla['sections']) && is_array($plantilla['sections'])) {
    $plantillaSections = $plantilla['sections'];
} elseif (isset($plantilla['estructura_json']['sections']) && is_array($plantilla['estructura_json']['sections'])) {
    $plantillaSections = $plantilla['estructura_json']['sections'];
}

if (!empty($plantillaSections)) {
    foreach ($plantillaSections as $section) {
        $sectionId = (string)($section['id'] ?? '');
        $sectionNombre = (string)($section['nombre'] ?? $sectionId);
        if ($sectionId) {
            $sectionContenido = (isset($contenido[$sectionId]) && is_array($contenido[$sectionId]))
                ? (array)$contenido[$sectionId]
                : [];
            $html .= '<div class="section-title">' . htmlspecialchars($sectionNombre) . '</div>';

            if (is_array($sectionContenido)) {
                $labelMap = [];
                foreach ((array)($section['campos'] ?? []) as $campo) {
                    $campoId = (string)($campo['id'] ?? '');
                    $campoLabel = (string)($campo['label'] ?? $campoId);
                    if ($campoId !== '') {
                        $labelMap[normalizar_clave_pdf($campoId)] = $campoLabel;
                    }
                    if ($campoLabel !== '') {
                        $labelMap[normalizar_clave_pdf($campoLabel)] = $campoLabel;
                    }
                }

                $camposRender = [];
                $ordenCampos = [];
                $templateKeys = array_keys($labelMap);
                $emptyLockedKeys = [];

                foreach ($sectionContenido as $fieldId => $fieldValue) {
                    $fieldIdRaw = (string)$fieldId;
                    if (strpos($fieldIdRaw, '?') !== false) {
                        continue;
                    }
                    $fieldKey = normalizar_clave_pdf($fieldIdRaw);
                    $resolvedKey = $fieldKey;

                    if ($resolvedKey !== '' && !isset($labelMap[$resolvedKey]) && !empty($templateKeys)) {
                        $bestKey = '';
                        $bestDistance = 99;
                        foreach ($templateKeys as $candidateKey) {
                            $distance = levenshtein($resolvedKey, (string)$candidateKey);
                            if ($distance < $bestDistance) {
                                $bestDistance = $distance;
                                $bestKey = (string)$candidateKey;
                            }
                        }
                        if ($bestKey !== '' && $bestDistance <= 2) {
                            $resolvedKey = $bestKey;
                        }
                    }

                    if (isset($labelMap[$resolvedKey]) && trim((string)$fieldValue) === '') {
                        $emptyLockedKeys[$resolvedKey] = true;
                    }
                }

                foreach ($sectionContenido as $fieldId => $fieldValue) {
                    if ($fieldValue === null || $fieldValue === '') {
                        continue;
                    }

                    $fieldIdRaw = (string)$fieldId;
                    if (strpos($fieldIdRaw, '?') !== false) {
                        continue;
                    }
                    $fieldValueRaw = trim((string)$fieldValue);
                    if ($fieldValueRaw === '') {
                        continue;
                    }

                    $fieldKey = normalizar_clave_pdf($fieldIdRaw);
                    $resolvedKey = $fieldKey;

                    // Si la clave no existe en plantilla, buscar la más cercana para absorber mojibake (ej: ri??ones -> rinones).
                    if ($resolvedKey !== '' && !isset($labelMap[$resolvedKey]) && !empty($templateKeys)) {
                        $bestKey = '';
                        $bestDistance = 99;
                        foreach ($templateKeys as $candidateKey) {
                            $distance = levenshtein($resolvedKey, (string)$candidateKey);
                            if ($distance < $bestDistance) {
                                $bestDistance = $distance;
                                $bestKey = (string)$candidateKey;
                            }
                        }
                        if ($bestKey !== '' && $bestDistance <= 2) {
                            $resolvedKey = $bestKey;
                        }
                    }

                    $fieldLabel = $labelMap[$resolvedKey]
                        ?? ucwords(str_replace('_', ' ', preg_replace('/\?+/', '', $fieldIdRaw)));
                    $dedupeKey = $resolvedKey !== '' ? $resolvedKey : normalizar_clave_pdf($fieldLabel);
                    if ($dedupeKey === '') {
                        $dedupeKey = md5($fieldIdRaw);
                    }

                    // Si el usuario dejó vacío el campo canónico, no mostrar valores heredados de aliases viejos.
                    if (isset($emptyLockedKeys[$dedupeKey])) {
                        continue;
                    }

                    if (!isset($camposRender[$dedupeKey])) {
                        $camposRender[$dedupeKey] = [
                            'label' => $fieldLabel,
                            'values' => []
                        ];
                        $ordenCampos[] = $dedupeKey;
                    }

                    if (!in_array($fieldValueRaw, $camposRender[$dedupeKey]['values'], true)) {
                        $camposRender[$dedupeKey]['values'][] = $fieldValueRaw;
                    }
                }

                // Completar campos vacios con valor_base definido en la plantilla
                foreach ((array)($section['campos'] ?? []) as $campoTpl) {
                    $campoTplId = (string)($campoTpl['id'] ?? '');
                    if ($campoTplId === '') {
                        continue;
                    }
                    $campoTplLabel = (string)($campoTpl['label'] ?? $campoTplId);
                    $campoTplKey = normalizar_clave_pdf($campoTplId);
                    if ($campoTplKey === '') {
                        $campoTplKey = normalizar_clave_pdf($campoTplLabel);
                    }
                    if ($campoTplKey === '') {
                        continue;
                    }

                    if (isset($camposRender[$campoTplKey])) {
                        continue;
                    }

                    $usarFallback = array_key_exists('usar_valor_base_si_vacio', (array)$campoTpl)
                        ? (bool)$campoTpl['usar_valor_base_si_vacio']
                        : true;
                    $valorBase = trim((string)($campoTpl['valor_base'] ?? ''));
                    if (!$usarFallback || $valorBase === '') {
                        continue;
                    }

                    $camposRender[$campoTplKey] = [
                        'label' => $campoTplLabel,
                        'values' => [$valorBase]
                    ];
                    $ordenCampos[] = $campoTplKey;
                }

                foreach ($ordenCampos as $campoKey) {
                    $fieldLabel = (string)$camposRender[$campoKey]['label'];
                    $fieldValueText = implode("\n", (array)$camposRender[$campoKey]['values']);
                    $html .= '<div class="field-row">';
                    $html .= '<span class="field-name">' . htmlspecialchars($fieldLabel) . '</span>';
                    $html .= '<div class="content">' . nl2br(htmlspecialchars($fieldValueText)) . '</div>';
                    $html .= '</div>';
                }
            } else {
                $html .= '<div class="content">' . nl2br(htmlspecialchars((string)$contenido[$sectionId])) . '</div>';
            }
        }
    }
} else {
    foreach ($contenido as $sectionKey => $sectionData) {
        $html .= '<div class="section-title">' . htmlspecialchars(ucwords(str_replace('_', ' ', (string)$sectionKey))) . '</div>';
        if (is_array($sectionData)) {
            foreach ($sectionData as $fieldId => $fieldValue) {
                if ($fieldValue === null || $fieldValue === '') continue;
                $html .= '<div class="field-row">';
                $html .= '<span class="field-name">' . htmlspecialchars(ucwords(str_replace('_', ' ', (string)$fieldId))) . '</span>';
                $html .= '<div class="content">' . nl2br(htmlspecialchars((string)$fieldValue)) . '</div>';
                $html .= '</div>';
            }
        } elseif ($sectionData !== null && $sectionData !== '') {
            $html .= '<div class="content">' . nl2br(htmlspecialchars((string)$sectionData)) . '</div>';
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

    $imagenesValidas = [];
    foreach ($archivos as $archivo) {
        $archivoPath = (string)$archivo['archivo_path'];
        $nombreOriginal = (string)$archivo['nombre_original'];
        $mimeType = (string)($archivo['mime_type'] ?? '');
        
        // Verificar que sea imagen y exista
        if (strpos($mimeType, 'image/') === 0 && is_file($archivoPath)) {
            $imageSrc = ruta_imagen_para_mpdf($archivoPath);
            if ($imageSrc === '') {
                continue;
            }

            $imagenesValidas[] = [
                'src' => $imageSrc,
                'nombre' => $nombreOriginal,
            ];
        }
    }

    if (!empty($imagenesValidas)) {
        $html .= '<table class="images-grid">';

        foreach ($imagenesValidas as $i => $img) {
            if ($i % 2 === 0) {
                $html .= '<tr>';
            }

            $indice = $i + 1;
            $html .= '<td class="image-cell">
                <div class="image-box">
                    <div class="image-box-inner">
                        <img src="' . htmlspecialchars($img['src']) . '" alt="' . htmlspecialchars($img['nombre']) . '">
                    </div>
                    <div class="image-name">Imagen ' . $indice . '</div>
                </div>
            </td>';

            if ($i % 2 === 1) {
                $html .= '</tr>';
            }
        }

        if (count($imagenesValidas) % 2 === 1) {
            $html .= '<td class="image-cell"></td></tr>';
        }

        $html .= '</table>';
    }
    
    $html .= '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRMA
// ═══════════════════════════════════════════════════════════════════════════
$html .= '<div class="signature-section">
    <div>Realizado por:</div>';

if ($firmaMedico !== '' && preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firmaMedico)) {
    $html .= '<img class="signature-image" src="' . $firmaMedico . '" alt="Firma del médico">';
} else {
    $html .= '<div class="signature-line"></div>';
}

$html .= '<div>' . htmlspecialchars($medicoNombre) . '</div>';

if ($especialidad !== '') {
    $html .= '<div class="signature-meta">' . htmlspecialchars($especialidad) . '</div>';
}
if ($colegiaturaTexto !== '') {
    $html .= '<div class="signature-meta">' . htmlspecialchars($colegiaturaTexto) . '</div>';
}

$html .= '</div>

<!-- PIE DE PÁGINA -->
<div class="footer" style="border-top: 2px solid #0066cc; padding-top: 10px; margin-top: 20px;">
    <div style="font-size: 9px; color: #333; margin-bottom: 4px; font-weight: bold;">
        ' . htmlspecialchars($nombreClinica) . '
    </div>
    <div style="font-size: 8px; color: #666; margin-bottom: 2px;">
        ' . ($direccion ? htmlspecialchars($direccion) . ' | ' : '') .
        ($telefono ? htmlspecialchars($telefono) . ' | ' : '') .
        ($email ? htmlspecialchars($email) . ' | ' : '') .
        ($website ? htmlspecialchars($website) : '') . '
    </div>
    <div style="font-size: 8px; color: #999;">
        Documento generado electrónicamente el ' . htmlspecialchars($fechaHoy) . ' | RUC: ' . htmlspecialchars($ruc) . '
    </div>
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
    $nombreDescarga = construir_nombre_pdf_imagenologia($informe);
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
            ?, (SELECT COALESCE(MAX(version), 0) + 1 FROM imagenologia_informes_historial WHERE informe_id = ?),
            ?, ?, ?, ?
    ');
    
    if ($stmtHist) {
        $tipoHist = 'generacion_pdf';
        $stmtHist->bind_param('iiisss', $informeId, $informeId, $usuarioId, $usuarioNombre, $tipoHist, $ahora);
        $stmtHist->execute();
        $stmtHist->close();
    }
    
    echo json_encode([
        'success' => true,
        'pdf_url' => '/' . $rutaRelativa,
        'pdf_path' => $rutaRelativa,
        'pdf_filename' => $nombreDescarga,
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
