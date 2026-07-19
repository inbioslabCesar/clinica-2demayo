<?php
/**
 * API: Informes de Imagenología
 * Propósito: CRUD de informes clínicos con trazabilidad completa
 * 
 * GET /api_imagenologia_informes.php?orden_imagen_id=123
 * POST /api_imagenologia_informes.php (crear/guardar)
 * PUT /api_imagenologia_informes.php?id=456 (actualizar)
 */

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

header('Content-Type: application/json; charset=utf-8');

// Validar autenticación y permisos
$usuario = $_SESSION['usuario'] ?? $_SESSION['medico'] ?? null;
$usuarioId = (int)($usuario['id'] ?? 0);
$usuarioNombre = (string)($usuario['nombre'] ?? '');
$rol = strtolower(trim((string)($usuario['rol'] ?? '')));

if (!$usuario || !in_array($rol, ['medico', 'administrador'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function normalizar_clave_informe(string $texto): string {
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

function resolver_clave_seccion(string $keyNormalizada, array $clavesPlantilla): string {
    if ($keyNormalizada === '' || isset($clavesPlantilla[$keyNormalizada])) {
        return $keyNormalizada;
    }

    $bestKey = '';
    $bestDistance = 99;
    foreach (array_keys($clavesPlantilla) as $candidateKey) {
        $distance = levenshtein($keyNormalizada, (string)$candidateKey);
        if ($distance < $bestDistance) {
            $bestDistance = $distance;
            $bestKey = (string)$candidateKey;
        }
    }

    return ($bestKey !== '' && $bestDistance <= 2) ? $bestKey : $keyNormalizada;
}

function sanitizar_contenido_informe(array $contenidoJson, $plantillaJson): array {
    if (!is_array($plantillaJson)) {
        return $contenidoJson;
    }

    $sections = [];
    if (isset($plantillaJson['sections']) && is_array($plantillaJson['sections'])) {
        $sections = $plantillaJson['sections'];
    } elseif (isset($plantillaJson['estructura_json']['sections']) && is_array($plantillaJson['estructura_json']['sections'])) {
        $sections = $plantillaJson['estructura_json']['sections'];
    }

    if (empty($sections)) {
        return $contenidoJson;
    }

    $plantillaPorSeccion = [];
    foreach ($sections as $section) {
        $sid = (string)($section['id'] ?? '');
        if ($sid === '') {
            continue;
        }
        $keys = [];
        foreach ((array)($section['campos'] ?? []) as $campo) {
            $cid = (string)($campo['id'] ?? '');
            if ($cid === '') {
                continue;
            }
            $nk = normalizar_clave_informe($cid);
            if ($nk !== '' && !isset($keys[$nk])) {
                $keys[$nk] = $cid;
            }
        }
        $plantillaPorSeccion[$sid] = $keys;
    }

    foreach ($contenidoJson as $sectionId => $sectionData) {
        if (!is_array($sectionData)) {
            continue;
        }

        $sectionIdStr = (string)$sectionId;
        $clavesPlantilla = $plantillaPorSeccion[$sectionIdStr] ?? [];
        if (empty($clavesPlantilla)) {
            continue;
        }

        $lockedEmpty = [];
        foreach ($sectionData as $rawKey => $rawValue) {
            $rawKeyStr = (string)$rawKey;
            $rawNorm = normalizar_clave_informe($rawKeyStr);
            $resolved = resolver_clave_seccion($rawNorm, $clavesPlantilla);
            if ($resolved === '') {
                continue;
            }
            $valueTrim = trim((string)$rawValue);
            if ($valueTrim === '' && isset($clavesPlantilla[$resolved])) {
                $lockedEmpty[$resolved] = true;
            }
        }

        $nuevoSection = [];
        $metaByResolved = [];
        foreach ($sectionData as $rawKey => $rawValue) {
            $rawKeyStr = (string)$rawKey;
            $rawNorm = normalizar_clave_informe($rawKeyStr);
            $resolved = resolver_clave_seccion($rawNorm, $clavesPlantilla);
            if ($resolved === '') {
                continue;
            }

            if (!isset($clavesPlantilla[$resolved])) {
                $nuevoSection[$rawKeyStr] = $rawValue;
                continue;
            }

            $canonicalKey = (string)$clavesPlantilla[$resolved];
            $valueTrim = trim((string)$rawValue);

            if (isset($lockedEmpty[$resolved])) {
                $nuevoSection[$canonicalKey] = '';
                continue;
            }

            if ($valueTrim === '') {
                if (!isset($nuevoSection[$canonicalKey])) {
                    $nuevoSection[$canonicalKey] = '';
                }
                continue;
            }

            $isExactTemplateKey = ($rawNorm === $resolved);
            $priority = $isExactTemplateKey ? 2 : 1;
            $existingPriority = $metaByResolved[$resolved]['priority'] ?? -1;
            if ($priority >= $existingPriority) {
                $nuevoSection[$canonicalKey] = $valueTrim;
                $metaByResolved[$resolved] = ['priority' => $priority];
            }
        }

        $contenidoJson[$sectionIdStr] = $nuevoSection;
    }

    return $contenidoJson;
}

function resolver_medico_responsable_informe(mysqli $conn, array $orden): int {
    $medicoId = (int)($orden['medico_id'] ?? 0);
    $consultaId = (int)($orden['consulta_id'] ?? 0);
    $cotizacionId = (int)($orden['cotizacion_id'] ?? 0);

    if ($medicoId > 0) {
        return $medicoId;
    }

    if ($cotizacionId > 0) {
        $detalleTokenId = 0;
        $indicaciones = (string)($orden['indicaciones'] ?? '');
        if ($indicaciones !== '' && preg_match('/detalle\s*#\s*(\d+)/i', $indicaciones, $m)) {
            $detalleTokenId = (int)($m[1] ?? 0);
        }

        if ($detalleTokenId > 0) {
            $stmtDet = $conn->prepare('SELECT medico_id, consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND id = ? LIMIT 1');
            if ($stmtDet) {
                $stmtDet->bind_param('ii', $cotizacionId, $detalleTokenId);
                $stmtDet->execute();
                $rowDet = $stmtDet->get_result()->fetch_assoc();
                $stmtDet->close();
                $medicoId = (int)($rowDet['medico_id'] ?? 0);
                if ($consultaId <= 0) {
                    $consultaId = (int)($rowDet['consulta_id'] ?? 0);
                }
            }
        }
    }

    if ($medicoId <= 0 && $consultaId > 0) {
        $stmtCons = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if ($stmtCons) {
            $stmtCons->bind_param('i', $consultaId);
            $stmtCons->execute();
            $rowCons = $stmtCons->get_result()->fetch_assoc();
            $stmtCons->close();
            $medicoId = (int)($rowCons['medico_id'] ?? 0);
        }
    }

    return max(0, $medicoId);
}

function puede_editar_informe_por_orden(mysqli $conn, array $orden, string $rol, int $usuarioId): bool {
    if ($usuarioId <= 0) {
        return false;
    }

    if ($rol === 'administrador') {
        return true;
    }

    if ($rol !== 'medico') {
        return false;
    }

    $medicoResponsableId = resolver_medico_responsable_informe($conn, $orden);

    if ($medicoResponsableId > 0 && $medicoResponsableId === $usuarioId) {
        return true;
    }

    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET: Obtener informe por orden_imagen_id o id
// ═══════════════════════════════════════════════════════════════════════════
if ($method === 'GET') {
    $ordenImagenId = (int)($_GET['orden_imagen_id'] ?? 0);
    $informeId = (int)($_GET['id'] ?? 0);
    
    if ($ordenImagenId > 0) {
        // Obtener por orden_imagen_id
        $stmt = $mysqli->prepare('
            SELECT ii.*,
                   COALESCE(mi.nombre, mo.nombre, mc.nombre) AS medico_nombre,
                   COALESCE(mi.apellido, mo.apellido, mc.apellido) AS medico_apellido,
                   COALESCE(mi.especialidad, mo.especialidad, mc.especialidad) AS medico_especialidad
            FROM imagenologia_informes ii
            LEFT JOIN ordenes_imagen oi ON oi.id = ii.orden_imagen_id
            LEFT JOIN consultas c ON c.id = oi.consulta_id
            LEFT JOIN medicos mi ON mi.id = ii.medico_id
            LEFT JOIN medicos mo ON mo.id = oi.medico_id
            LEFT JOIN medicos mc ON mc.id = c.medico_id
            WHERE orden_imagen_id = ?
            LIMIT 1
        ');
        $stmt->bind_param('i', $ordenImagenId);
    } elseif ($informeId > 0) {
        // Obtener por informe id
        $stmt = $mysqli->prepare('
            SELECT ii.*,
                   COALESCE(mi.nombre, mo.nombre, mc.nombre) AS medico_nombre,
                   COALESCE(mi.apellido, mo.apellido, mc.apellido) AS medico_apellido,
                   COALESCE(mi.especialidad, mo.especialidad, mc.especialidad) AS medico_especialidad
            FROM imagenologia_informes ii
            LEFT JOIN ordenes_imagen oi ON oi.id = ii.orden_imagen_id
            LEFT JOIN consultas c ON c.id = oi.consulta_id
            LEFT JOIN medicos mi ON mi.id = ii.medico_id
            LEFT JOIN medicos mo ON mo.id = oi.medico_id
            LEFT JOIN medicos mc ON mc.id = c.medico_id
            WHERE id = ?
            LIMIT 1
        ');
        $stmt->bind_param('i', $informeId);
    } else {
        echo json_encode(['success' => false, 'error' => 'Se requiere orden_imagen_id o id']);
        exit;
    }
    
    $stmt->execute();
    $result = $stmt->get_result();
    $informe = $result->fetch_assoc();
    $stmt->close();
    
    if ($informe) {
        // Decodificar JSONs
        $informe['contenido_json'] = $informe['contenido_json'] ? json_decode($informe['contenido_json'], true) : [];
        $informe['plantilla_json'] = $informe['plantilla_json'] ? json_decode($informe['plantilla_json'], true) : null;
        $informe['contenido_json'] = sanitizar_contenido_informe((array)$informe['contenido_json'], $informe['plantilla_json']);
        
        echo json_encode(['success' => true, 'informe' => $informe]);
    } else {
        echo json_encode(['success' => true, 'informe' => null]);
    }
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST: Crear o guardar informe
// ═══════════════════════════════════════════════════════════════════════════
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    
    $ordenImagenId = (int)($input['orden_imagen_id'] ?? 0);
    $estado = strtolower(trim((string)($input['estado'] ?? 'borrador')));
    $contenidoJson = isset($input['contenido_json']) ? (is_array($input['contenido_json']) ? $input['contenido_json'] : json_decode($input['contenido_json'], true)) : [];
    $titulo = trim((string)($input['titulo'] ?? ''));
    $plantillaJson = isset($input['plantilla_json']) ? (is_array($input['plantilla_json']) ? $input['plantilla_json'] : json_decode($input['plantilla_json'], true)) : null;
    $contenidoJson = sanitizar_contenido_informe((array)$contenidoJson, $plantillaJson);
    
    if ($ordenImagenId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'orden_imagen_id es requerido']);
        exit;
    }
    
    // Validar que la orden existe
    $stmtOrd = $mysqli->prepare('SELECT id, paciente_id, consulta_id, cotizacion_id, medico_id, solicitado_por, tipo, indicaciones FROM ordenes_imagen WHERE id = ?');
    if (!$stmtOrd) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Error de preparación de query']);
        exit;
    }
    
    $stmtOrd->bind_param('i', $ordenImagenId);
    $stmtOrd->execute();
    $orden = $stmtOrd->get_result()->fetch_assoc();
    $stmtOrd->close();
    
    if (!$orden) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Orden de imagen no encontrada']);
        exit;
    }

    if (!puede_editar_informe_por_orden($mysqli, $orden, $rol, $usuarioId)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'No autorizado. Solo el medico responsable/solicitante o un administrador puede editar el informe.'
        ]);
        exit;
    }
    
    $pacienteId = (int)$orden['paciente_id'];
    $consultaId = (int)$orden['consulta_id'];
    $cotizacionId = (int)($orden['cotizacion_id'] ?? 0);
    $medicoResponsableId = resolver_medico_responsable_informe($mysqli, $orden);

    if ($medicoResponsableId > 0 && (int)($orden['medico_id'] ?? 0) <= 0) {
        $stmtSyncOrden = $mysqli->prepare('UPDATE ordenes_imagen SET medico_id = ? WHERE id = ?');
        if ($stmtSyncOrden) {
            $stmtSyncOrden->bind_param('ii', $medicoResponsableId, $ordenImagenId);
            $stmtSyncOrden->execute();
            $stmtSyncOrden->close();
        }
    }
    
    // Obtener historia_clinica_id si existe
    $historiaCbId = 0;
    if ($consultaId > 0) {
        // La tabla historia_clinica no siempre tiene created_at; usar id DESC como criterio estable.
        $stmtHc = $mysqli->prepare('SELECT id FROM historia_clinica WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
        if ($stmtHc) {
            $stmtHc->bind_param('i', $consultaId);
            $stmtHc->execute();
            $hcRow = $stmtHc->get_result()->fetch_assoc();
            $historiaCbId = $hcRow ? (int)$hcRow['id'] : 0;
            $stmtHc->close();
        }
    }
    
    // Validar estado
    if (!in_array($estado, ['borrador', 'completado', 'archivado'])) {
        $estado = 'borrador';
    }
    
    // Verificar si ya existe informe
    $stmtCheck = $mysqli->prepare('SELECT id FROM imagenologia_informes WHERE orden_imagen_id = ?');
    $stmtCheck->bind_param('i', $ordenImagenId);
    $stmtCheck->execute();
    $existente = $stmtCheck->get_result()->fetch_assoc();
    $stmtCheck->close();
    
    $ahora = date('Y-m-d H:i:s');
    $contenidoJsonStr = json_encode($contenidoJson, JSON_UNESCAPED_UNICODE);
    $plantillaJsonStr = $plantillaJson ? json_encode($plantillaJson, JSON_UNESCAPED_UNICODE) : null;
    
    if ($existente) {
        // ─ UPDATE: Actualizar informe existente ─────────────────────────────
        $informeId = (int)$existente['id'];

        $stmtActual = $mysqli->prepare('SELECT titulo, contenido_json, estado FROM imagenologia_informes WHERE id = ? LIMIT 1');
        $actualTitulo = '';
        $actualContenidoJson = '';
        $actualEstado = '';
        if ($stmtActual) {
            $stmtActual->bind_param('i', $informeId);
            $stmtActual->execute();
            $actualRow = $stmtActual->get_result()->fetch_assoc();
            $stmtActual->close();
            if ($actualRow) {
                $actualTitulo = (string)($actualRow['titulo'] ?? '');
                $actualContenidoJson = (string)($actualRow['contenido_json'] ?? '');
                $actualEstado = (string)($actualRow['estado'] ?? '');
            }
        }

        $nuevoContenidoCanon = json_encode(json_decode((string)$contenidoJsonStr, true), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $actualContenidoCanon = json_encode(json_decode((string)$actualContenidoJson, true), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $sinCambios = (
            trim($actualTitulo) === trim((string)$titulo)
            && trim($actualEstado) === trim((string)$estado)
            && (string)$actualContenidoCanon === (string)$nuevoContenidoCanon
        );

        if ($sinCambios) {
            echo json_encode([
                'success' => true,
                'informe_id' => $informeId,
                'mensaje' => 'Sin cambios para guardar',
                'accion' => 'sin_cambios'
            ]);
            exit;
        }
        
        $stmt = $mysqli->prepare('
            UPDATE imagenologia_informes 
            SET 
                medico_id = ?,
                titulo = ?,
                contenido_json = ?,
                plantilla_json = ?,
                estado = ?,
                fecha_ultima_edicion = ?,
                updated_at = ?
            WHERE id = ?
        ');
        
        $stmt->bind_param('issssssi', $medicoResponsableId, $titulo, $contenidoJsonStr, $plantillaJsonStr, $estado, $ahora, $ahora, $informeId);
        $stmt->execute();
        $stmt->close();
        
        // Registrar en historial
        $tipoRecambio = $estado === 'completado' ? 'cambio_estado' : 'edicion_contenido';
        $stmtHist = $mysqli->prepare('
            INSERT INTO imagenologia_informes_historial (
                informe_id, version, contenido_nuevo, usuario_id, usuario_nombre, tipo_cambio, created_at
            ) SELECT 
                ?, (SELECT COALESCE(MAX(version), 0) + 1 FROM imagenologia_informes_historial WHERE informe_id = ?),
                ?, ?, ?, ?, ?
        ');
        
        if ($stmtHist) {
            $stmtHist->bind_param('iisisss', $informeId, $informeId, $contenidoJsonStr, $usuarioId, $usuarioNombre, $tipoRecambio, $ahora);
            $stmtHist->execute();
            $stmtHist->close();
        }
        
        echo json_encode([
            'success' => true,
            'informe_id' => $informeId,
            'mensaje' => 'Informe actualizado exitosamente',
            'accion' => 'actualizado'
        ]);
        
    } else {
        // ─ INSERT: Crear informe nuevo ─────────────────────────────────────
        $fechaRedaccion = $ahora;
        
        $stmt = $mysqli->prepare('
            INSERT INTO imagenologia_informes (
                orden_imagen_id, cotizacion_id, paciente_id, consulta_id, historia_clinica_id,
                medico_id, titulo, contenido_json, plantilla_json, estado,
                fecha_redaccion, fecha_ultima_edicion, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        
        $stmt->bind_param('iiiiiissssssss',
            $ordenImagenId, $cotizacionId, $pacienteId, $consultaId, $historiaCbId,
            $medicoResponsableId, $titulo, $contenidoJsonStr, $plantillaJsonStr, $estado,
            $fechaRedaccion, $ahora, $ahora, $ahora
        );
        
        $stmt->execute();
        $informeId = (int)$stmt->insert_id;
        $stmt->close();
        
        if ($informeId > 0) {
            // Registrar en historial
            $stmtHist = $mysqli->prepare('
                INSERT INTO imagenologia_informes_historial (
                    informe_id, version, contenido_nuevo, usuario_id, usuario_nombre, tipo_cambio, created_at
                ) VALUES (?, 1, ?, ?, ?, ?, ?)
            ');
            
            if ($stmtHist) {
                $tipoHist = 'redaccion_inicial';
                $stmtHist->bind_param('isssss', $informeId, $contenidoJsonStr, $usuarioId, $usuarioNombre, $tipoHist, $ahora);
                $stmtHist->execute();
                $stmtHist->close();
            }
            
            echo json_encode([
                'success' => true,
                'informe_id' => $informeId,
                'mensaje' => 'Informe creado exitosamente',
                'accion' => 'creado'
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo crear el informe']);
        }
    }
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUT: Actualizar estado o completar informe
// ═══════════════════════════════════════════════════════════════════════════
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $informeId = (int)($_GET['id'] ?? 0);
    
    if ($informeId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id es requerido']);
        exit;
    }

    $stmtOrd = $mysqli->prepare('SELECT oi.id, oi.paciente_id, oi.consulta_id, oi.cotizacion_id, oi.medico_id, oi.solicitado_por, oi.tipo, oi.indicaciones FROM imagenologia_informes ii INNER JOIN ordenes_imagen oi ON oi.id = ii.orden_imagen_id WHERE ii.id = ? LIMIT 1');
    $orden = null;
    if ($stmtOrd) {
        $stmtOrd->bind_param('i', $informeId);
        $stmtOrd->execute();
        $orden = $stmtOrd->get_result()->fetch_assoc();
        $stmtOrd->close();
    }

    if (!$orden) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Informe no encontrado']);
        exit;
    }

    if (!puede_editar_informe_por_orden($mysqli, $orden, $rol, $usuarioId)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'No autorizado. Solo el medico responsable/solicitante o un administrador puede editar el informe.'
        ]);
        exit;
    }
    
    $accion = trim((string)($input['accion'] ?? ''));
    
    if ($accion === 'completar') {
        $ahora = date('Y-m-d H:i:s');
        $estado = 'completado';
        
        $stmt = $mysqli->prepare('
            UPDATE imagenologia_informes 
            SET estado = ?, fecha_ultima_edicion = ?, updated_at = ?
            WHERE id = ?
        ');
        
        $stmt->bind_param('sssi', $estado, $ahora, $ahora, $informeId);
        $stmt->execute();
        $stmt->close();
        
        echo json_encode(['success' => true, 'mensaje' => 'Informe marcado como completado']);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no reconocida']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
?>
