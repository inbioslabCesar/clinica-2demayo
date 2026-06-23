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

// ═══════════════════════════════════════════════════════════════════════════
// GET: Obtener informe por orden_imagen_id o id
// ═══════════════════════════════════════════════════════════════════════════
if ($method === 'GET') {
    $ordenImagenId = (int)($_GET['orden_imagen_id'] ?? 0);
    $informeId = (int)($_GET['id'] ?? 0);
    
    if ($ordenImagenId > 0) {
        // Obtener por orden_imagen_id
        $stmt = $mysqli->prepare('
            SELECT * FROM imagenologia_informes 
            WHERE orden_imagen_id = ?
            LIMIT 1
        ');
        $stmt->bind_param('i', $ordenImagenId);
    } elseif ($informeId > 0) {
        // Obtener por informe id
        $stmt = $mysqli->prepare('
            SELECT * FROM imagenologia_informes 
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
    
    if ($ordenImagenId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'orden_imagen_id es requerido']);
        exit;
    }
    
    // Validar que la orden existe
    $stmtOrd = $mysqli->prepare('SELECT id, paciente_id, consulta_id, cotizacion_id, tipo FROM ordenes_imagen WHERE id = ?');
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
    
    $pacienteId = (int)$orden['paciente_id'];
    $consultaId = (int)$orden['consulta_id'];
    $cotizacionId = (int)($orden['cotizacion_id'] ?? 0);
    
    // Obtener historia_clinica_id si existe
    $historiaCbId = 0;
    if ($consultaId > 0) {
        $stmtHc = $mysqli->prepare('SELECT id FROM historia_clinica WHERE consulta_id = ? ORDER BY created_at DESC LIMIT 1');
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
        
        $stmt = $mysqli->prepare('
            UPDATE imagenologia_informes 
            SET 
                titulo = ?,
                contenido_json = ?,
                plantilla_json = ?,
                estado = ?,
                fecha_ultima_edicion = ?,
                updated_at = ?
            WHERE id = ?
        ');
        
        $stmt->bind_param('ssssssi', $titulo, $contenidoJsonStr, $plantillaJsonStr, $estado, $ahora, $ahora, $informeId);
        $stmt->execute();
        $stmt->close();
        
        // Registrar en historial
        $tipoRecambio = $estado === 'completado' ? 'cambio_estado' : 'edicion_contenido';
        $stmtHist = $mysqli->prepare('
            INSERT INTO imagenologia_informes_historial (
                informe_id, version, contenido_nuevo, usuario_id, usuario_nombre, tipo_cambio, created_at
            ) SELECT 
                ?, (SELECT MAX(version) + 1 FROM imagenologia_informes_historial WHERE informe_id = ?),
                ?, ?, ?, ?, ?
        ');
        
        if ($stmtHist) {
            $stmtHist->bind_param('iissss', $informeId, $informeId, $contenidoJsonStr, $usuarioId, $usuarioNombre, $tipoRecambio, $ahora);
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
        
        $stmt->bind_param('iiiiiiisssiss',
            $ordenImagenId, $cotizacionId, $pacienteId, $consultaId, $historiaCbId,
            $usuarioId, $titulo, $contenidoJsonStr, $plantillaJsonStr, $estado,
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
