<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

$usuario   = $_SESSION['usuario'] ?? null;
$rol       = strtolower(trim((string)($usuario['rol'] ?? '')));
$usuarioId = intval($usuario['id'] ?? 0);

$rolesPermitidos = ['administrador', 'recepcionista', 'laboratorista'];
if (!$usuario || !in_array($rol, $rolesPermitidos)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

// ─── Auto-crear tablas ────────────────────────────────────────────────────────
$conn->query("
    CREATE TABLE IF NOT EXISTS documentos_externos_paciente (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        paciente_id           INT NOT NULL,
        tipo                  VARCHAR(50)  NOT NULL DEFAULT 'laboratorio',
        titulo                VARCHAR(200) NOT NULL DEFAULT '',
        descripcion           TEXT,
        orden_id              INT DEFAULT NULL,
        cobro_id              INT DEFAULT NULL,
        cotizacion_id         INT DEFAULT NULL,
        subido_por_usuario_id INT DEFAULT NULL,
        fecha                 DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dep_paciente (paciente_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

$conn->query("
    CREATE TABLE IF NOT EXISTS documentos_externos_archivos (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        documento_id    INT NOT NULL,
        nombre_original VARCHAR(255) NOT NULL DEFAULT '',
        archivo_path    VARCHAR(500) NOT NULL DEFAULT '',
        tamano          INT DEFAULT 0,
        mime_type       VARCHAR(100) DEFAULT NULL,
        fecha           DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dea_documento (documento_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// Migración: agregar mime_type si la tabla ya existía sin esa columna
$chkCol = $conn->query("SHOW COLUMNS FROM documentos_externos_archivos LIKE 'mime_type'");
if ($chkCol && $chkCol->num_rows === 0) {
    $conn->query("ALTER TABLE documentos_externos_archivos ADD COLUMN mime_type VARCHAR(100) DEFAULT NULL");
}

$chkCotCol = $conn->query("SHOW COLUMNS FROM documentos_externos_paciente LIKE 'cotizacion_id'");
if ($chkCotCol && $chkCotCol->num_rows === 0) {
    $conn->query("ALTER TABLE documentos_externos_paciente ADD COLUMN cotizacion_id INT DEFAULT NULL AFTER cobro_id");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
$uploadDir = __DIR__ . '/uploads/documentos_externos/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$scheme  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$baseUrl = $scheme . '://' . $_SERVER['HTTP_HOST']
         . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';

$method = $_SERVER['REQUEST_METHOD'];

// ─── DESCARGA de archivo externo (antes de setear Content-Type JSON) ──────────
if ($method === 'GET' && ($_GET['action'] ?? '') === 'download') {
    $archivoId = intval($_GET['archivo_id'] ?? 0);
    if ($archivoId <= 0) { http_response_code(400); echo 'ID inválido'; exit; }

    $stmt = $conn->prepare(
        'SELECT dea.*, dep.paciente_id
         FROM documentos_externos_archivos dea
         JOIN documentos_externos_paciente dep ON dep.id = dea.documento_id
         WHERE dea.id = ? LIMIT 1'
    );
    $stmt->bind_param('i', $archivoId);
    $stmt->execute();
    $arch = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$arch || !file_exists($arch['archivo_path'])) {
        http_response_code(404); echo 'Archivo no encontrado'; exit;
    }

    $safeName = preg_replace('/[^a-zA-Z0-9._\- ]/', '_', $arch['nombre_original']);
    $mimeServe = !empty($arch['mime_type']) ? $arch['mime_type'] : 'application/octet-stream';
    header('Content-Type: ' . $mimeServe);
    header('Content-Disposition: inline; filename="' . $safeName . '"');
    header('Content-Length: ' . filesize($arch['archivo_path']));
    header('Cache-Control: private, max-age=3600');
    readfile($arch['archivo_path']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// ─── GET: listar documentos del paciente ─────────────────────────────────────
if ($method === 'GET') {
    $pacienteId = intval($_GET['paciente_id'] ?? 0);
    if ($pacienteId <= 0) {
        echo json_encode(['success' => false, 'error' => 'paciente_id requerido']); exit;
    }

    // Paciente
    $stmtP = $conn->prepare(
        'SELECT id, nombre, apellido, dni, historia_clinica FROM pacientes WHERE id = ? LIMIT 1'
    );
    $stmtP->bind_param('i', $pacienteId);
    $stmtP->execute();
    $paciente = $stmtP->get_result()->fetch_assoc();
    $stmtP->close();
    if (!$paciente) {
        echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']); exit;
    }

    $documentos = [];

    // ── 1. Resultados generados por el sistema ─────────────────────────────
    $stmtOrd = $conn->prepare("
        SELECT
            ol.id          AS orden_id,
            ol.cobro_id,
            ol.cotizacion_id,
            ol.fecha       AS orden_fecha,
            ol.estado      AS orden_estado,
            ol.examenes    AS examenes_json,
            ol.consulta_id
        FROM ordenes_laboratorio ol
        WHERE ol.paciente_id = ?
           OR (
               ol.cotizacion_id IS NOT NULL
               AND ol.cotizacion_id IN (
                   SELECT c2.id
                   FROM cotizaciones c2
                   WHERE c2.paciente_id = ?
               )
           )
           OR EXISTS (
               SELECT 1
               FROM documentos_externos_paciente depx
               WHERE depx.orden_id = ol.id
                 AND depx.paciente_id = ?
           )
        ORDER BY ol.fecha DESC
    ");
    $stmtOrd->bind_param('iii', $pacienteId, $pacienteId, $pacienteId);
    $stmtOrd->execute();
    $ordenes_rows = $stmtOrd->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtOrd->close();

        // Resolver resultados en batch (sin subconsulta correlacionada por fila)
        $ordenIds = [];
        $consultaIds = [];
        foreach ($ordenes_rows as $rowOrd) {
            $oid = intval($rowOrd['orden_id'] ?? 0);
            if ($oid > 0) {
                $ordenIds[] = $oid;
            }
            $cid = intval($rowOrd['consulta_id'] ?? 0);
            if ($cid > 0) {
                $consultaIds[] = $cid;
            }
        }
        $ordenIds = array_values(array_unique($ordenIds));
        $consultaIds = array_values(array_unique($consultaIds));

        $resultadoPorOrden = [];
        $resultadoFallbackPorConsulta = [];
        if (!empty($ordenIds) || !empty($consultaIds)) {
            $conds = [];
            $types = '';
            $params = [];

            if (!empty($ordenIds)) {
                $phOrd = implode(',', array_fill(0, count($ordenIds), '?'));
                $conds[] = "orden_id IN ($phOrd)";
                $types .= str_repeat('i', count($ordenIds));
                $params = array_merge($params, $ordenIds);
            }

            if (!empty($consultaIds)) {
                $phCons = implode(',', array_fill(0, count($consultaIds), '?'));
                $conds[] = "((orden_id IS NULL OR orden_id = 0) AND consulta_id IN ($phCons))";
                $types .= str_repeat('i', count($consultaIds));
                $params = array_merge($params, $consultaIds);
            }

            if (!empty($conds)) {
                $sqlRes = 'SELECT id, orden_id, consulta_id, fecha, tipo_examen FROM resultados_laboratorio WHERE ' . implode(' OR ', $conds) . ' ORDER BY fecha DESC, id DESC';
                $stmtRes = $conn->prepare($sqlRes);
                if ($stmtRes) {
                    $stmtRes->bind_param($types, ...$params);
                    $stmtRes->execute();
                    $rowsRes = $stmtRes->get_result()->fetch_all(MYSQLI_ASSOC);
                    $stmtRes->close();

                    foreach ($rowsRes as $resRow) {
                        $oid = intval($resRow['orden_id'] ?? 0);
                        $cid = intval($resRow['consulta_id'] ?? 0);

                        if ($oid > 0 && !isset($resultadoPorOrden[$oid])) {
                            $resultadoPorOrden[$oid] = $resRow;
                        }

                        if (($oid <= 0) && $cid > 0 && !isset($resultadoFallbackPorConsulta[$cid])) {
                            $resultadoFallbackPorConsulta[$cid] = $resRow;
                        }
                    }
                }
            }
        }

        foreach ($ordenes_rows as &$rowOrd) {
            $oid = intval($rowOrd['orden_id'] ?? 0);
            $cid = intval($rowOrd['consulta_id'] ?? 0);
            $resRow = null;

            if ($oid > 0 && isset($resultadoPorOrden[$oid])) {
                $resRow = $resultadoPorOrden[$oid];
            } elseif ($cid > 0 && isset($resultadoFallbackPorConsulta[$cid])) {
                $resRow = $resultadoFallbackPorConsulta[$cid];
            }

            $rowOrd['resultado_id'] = $resRow ? intval($resRow['id'] ?? 0) : null;
            $rowOrd['resultado_fecha'] = $resRow['fecha'] ?? null;
            $rowOrd['tipo_examen'] = $resRow['tipo_examen'] ?? null;
        }
        unset($rowOrd);

    // Obtener nombres de exámenes en batch
    $allExamIds = [];
    foreach ($ordenes_rows as $row) {
        $raw = json_decode((string)($row['examenes_json'] ?? '[]'), true);
        if (!is_array($raw)) continue;
        foreach ($raw as $ex) {
            $id = is_array($ex) ? intval($ex['id'] ?? 0) : intval($ex);
            if ($id > 0) $allExamIds[] = $id;
        }
    }
    $allExamIds = array_unique($allExamIds);
    $examNombres = [];
    if (!empty($allExamIds)) {
        $placeholders = implode(',', array_fill(0, count($allExamIds), '?'));
        $types = str_repeat('i', count($allExamIds));
        $stmtEx = $conn->prepare("SELECT id, nombre FROM examenes_laboratorio WHERE id IN ($placeholders)");
        $stmtEx->bind_param($types, ...$allExamIds);
        $stmtEx->execute();
        foreach ($stmtEx->get_result()->fetch_all(MYSQLI_ASSOC) as $e) {
            $examNombres[intval($e['id'])] = $e['nombre'];
        }
        $stmtEx->close();
    }

    foreach ($ordenes_rows as $row) {
        $examenes = [];
        $raw = json_decode((string)($row['examenes_json'] ?? '[]'), true);
        if (is_array($raw)) {
            foreach ($raw as $ex) {
                $id = is_array($ex) ? intval($ex['id'] ?? 0) : intval($ex);
                $nombre = is_array($ex) && !empty($ex['nombre'])
                    ? $ex['nombre']
                    : ($examNombres[$id] ?? ('Examen #' . $id));
                if ($id > 0) $examenes[] = $nombre;
            }
        }

        $tieneResultado = !empty($row['resultado_id']);
        $titulo = !empty($row['tipo_examen'])
            ? $row['tipo_examen']
            : (count($examenes) > 0
                ? implode(', ', array_slice($examenes, 0, 3)) . (count($examenes) > 3 ? '...' : '')
                : 'Orden de laboratorio #' . $row['orden_id']);

        $documentos[] = [
            'id'          => 'lab_ord_' . $row['orden_id'],
            'tipo'        => 'laboratorio',
            'origen'      => 'generado',
            'titulo'      => $titulo,
            'descripcion' => null,
            'fecha'       => $row['resultado_fecha'] ?? $row['orden_fecha'],
            'orden_id'      => (int)$row['orden_id'],
            'orden_estado'  => (string)($row['orden_estado'] ?? ''),
            'cobro_id'      => $row['cobro_id'] ? (int)$row['cobro_id'] : null,
            'cotizacion_id' => $row['cotizacion_id'] ? (int)$row['cotizacion_id'] : null,
            'resultado_id'  => $row['resultado_id'] ? (int)$row['resultado_id'] : null,
            'examenes'    => $examenes,
            'estado'      => (strtolower((string)($row['orden_estado'] ?? '')) === 'cancelada')
                ? 'cancelada'
                : ($tieneResultado ? 'disponible' : 'pendiente'),
            'url'         => $tieneResultado
                ? ($baseUrl . 'descargar_resultados_laboratorio.php?id=' . $row['resultado_id'])
                : null,
            'archivos'    => [],
        ];
    }

    // ── 2. Documentos externos subidos ────────────────────────────────────
    $stmtExt = $conn->prepare(
        'SELECT dep.*, COALESCE(dep.cotizacion_id, ol.cotizacion_id) AS cotizacion_resuelta_id
         FROM documentos_externos_paciente dep
         LEFT JOIN ordenes_laboratorio ol ON ol.id = dep.orden_id
         WHERE dep.paciente_id = ? ORDER BY dep.fecha DESC'
    );
    $stmtExt->bind_param('i', $pacienteId);
    $stmtExt->execute();
    $externos = $stmtExt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtExt->close();

    $archivosByDocumento = [];
    if (!empty($externos)) {
        $docIds = array_values(array_unique(array_map(fn($e) => intval($e['id'] ?? 0), $externos)));
        $docIds = array_values(array_filter($docIds, fn($id) => $id > 0));

        if (!empty($docIds)) {
            $placeholders = implode(',', array_fill(0, count($docIds), '?'));
            $types = str_repeat('i', count($docIds));
            $sqlArchivos = "SELECT * FROM documentos_externos_archivos WHERE documento_id IN ($placeholders) ORDER BY documento_id ASC, id ASC";
            $stmtArchivos = $conn->prepare($sqlArchivos);
            if ($stmtArchivos) {
                $stmtArchivos->bind_param($types, ...$docIds);
                $stmtArchivos->execute();
                $allArchivosRows = $stmtArchivos->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtArchivos->close();

                foreach ($allArchivosRows as $a) {
                    $docId = intval($a['documento_id'] ?? 0);
                    if ($docId <= 0) continue;
                    if (!isset($archivosByDocumento[$docId])) {
                        $archivosByDocumento[$docId] = [];
                    }
                    $mt = !empty($a['mime_type']) ? $a['mime_type'] : 'application/octet-stream';
                    $archivosByDocumento[$docId][] = [
                        'id'             => (int)$a['id'],
                        'nombre_original'=> $a['nombre_original'],
                        'tamano'         => (int)$a['tamano'],
                        'fecha'          => $a['fecha'],
                        'mime_type'      => $mt,
                        'es_imagen'      => str_starts_with($mt, 'image/'),
                        'es_dicom'       => $mt === 'application/dicom',
                        'url'            => $baseUrl . 'api_documentos_paciente.php?action=download&archivo_id=' . $a['id'],
                    ];
                }
            }
        }
    }

    foreach ($externos as $ext) {
        $docId = intval($ext['id'] ?? 0);
        $archivos = $archivosByDocumento[$docId] ?? [];

        $documentos[] = [
            'id'           => 'ext_' . $ext['id'],
            'documento_id' => (int)$ext['id'],
            'tipo'         => $ext['tipo'],
            'origen'       => 'externo',
            'titulo'       => $ext['titulo'],
            'descripcion'  => $ext['descripcion'],
            'fecha'        => $ext['fecha'],
            'orden_id'     => $ext['orden_id'] ? (int)$ext['orden_id'] : null,
            'cobro_id'     => $ext['cobro_id'] ? (int)$ext['cobro_id'] : null,
            'cotizacion_id'=> $ext['cotizacion_resuelta_id'] ? (int)$ext['cotizacion_resuelta_id'] : null,
            'examenes'     => [],
            'estado'       => count($archivos) > 0 ? 'disponible' : 'sin_archivos',
            'url'          => null,
            'archivos'     => $archivos,
        ];
    }

    // Ordenar por fecha desc
    usort($documentos, function ($a, $b) {
        return strtotime((string)($b['fecha'] ?? '0')) <=> strtotime((string)($a['fecha'] ?? '0'));
    });

    // Lista de órdenes para el formulario de subida
    $stmtOrdList = $conn->prepare(
        'SELECT id, fecha, examenes, estado, cotizacion_id
         FROM ordenes_laboratorio
         WHERE paciente_id = ?
            OR (
                cotizacion_id IS NOT NULL
                AND cotizacion_id IN (
                    SELECT c2.id FROM cotizaciones c2 WHERE c2.paciente_id = ?
                )
            )
         ORDER BY fecha DESC
         LIMIT 20'
    );
    $stmtOrdList->bind_param('ii', $pacienteId, $pacienteId);
    $stmtOrdList->execute();
    $ordenesList = array_map(function ($o) {
        $ex = json_decode((string)($o['examenes'] ?? '[]'), true);
        $nombres = [];
        if (is_array($ex)) {
            foreach ($ex as $e) {
                $n = trim((string)($e['nombre'] ?? $e['nombre_examen'] ?? ''));
                if ($n !== '') $nombres[] = $n;
            }
        }
        return [
            'id'            => (int)$o['id'],
            'fecha'         => $o['fecha'],
            'estado'        => $o['estado'],
            'cotizacion_id' => $o['cotizacion_id'] ? (int)$o['cotizacion_id'] : null,
            'examenes_count'=> is_array($ex) ? count($ex) : 0,
            'examenes_nombres' => $nombres,
        ];
    }, $stmtOrdList->get_result()->fetch_all(MYSQLI_ASSOC));
    $stmtOrdList->close();

    echo json_encode([
        'success'   => true,
        'paciente'  => $paciente,
        'documentos'=> $documentos,
        'ordenes'   => $ordenesList,
    ]);
    exit;
}

// ─── POST: subir documento(s) externo(s) ─────────────────────────────────────
if ($method === 'POST') {
    $pacienteId  = intval($_POST['paciente_id'] ?? 0);
    $tipo        = trim((string)($_POST['tipo']        ?? 'laboratorio'));
    $titulo      = trim((string)($_POST['titulo']      ?? ''));
    $descripcion = trim((string)($_POST['descripcion'] ?? ''));
    $ordenId     = intval($_POST['orden_id'] ?? 0);
    $cobroId     = intval($_POST['cobro_id'] ?? 0);
    $cotizacionId = intval($_POST['cotizacion_id'] ?? 0);

    if ($pacienteId <= 0 || $titulo === '') {
        echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos: paciente_id y titulo']); exit;
    }
    if (!isset($_FILES['archivos'])) {
        echo json_encode(['success' => false, 'error' => 'No se recibieron archivos']); exit;
    }

    if ($ordenId > 0) {
        $stmtOrden = $conn->prepare('SELECT paciente_id, cotizacion_id FROM ordenes_laboratorio WHERE id = ? LIMIT 1');
        $stmtOrden->bind_param('i', $ordenId);
        $stmtOrden->execute();
        $ordenRow = $stmtOrden->get_result()->fetch_assoc();
        $stmtOrden->close();

        if (!$ordenRow) {
            echo json_encode(['success' => false, 'error' => 'La orden de laboratorio no existe']); exit;
        }

        $pacienteOrden = (int)($ordenRow['paciente_id'] ?? 0);
        $cotizacionOrden = (int)($ordenRow['cotizacion_id'] ?? 0);

        if ($pacienteOrden > 0 && $pacienteOrden !== $pacienteId) {
            echo json_encode(['success' => false, 'error' => 'La orden de laboratorio no pertenece al paciente seleccionado']); exit;
        }

        // Compatibilidad con órdenes antiguas creadas desde consulta con paciente_id nulo.
        if ($pacienteOrden <= 0) {
            $ordenPertenecePaciente = false;
            if ($cotizacionOrden > 0) {
                $stmtCotOrden = $conn->prepare('SELECT id FROM cotizaciones WHERE id = ? AND paciente_id = ? LIMIT 1');
                if ($stmtCotOrden) {
                    $stmtCotOrden->bind_param('ii', $cotizacionOrden, $pacienteId);
                    $stmtCotOrden->execute();
                    $ordenPertenecePaciente = (bool)$stmtCotOrden->get_result()->fetch_assoc();
                    $stmtCotOrden->close();
                }
            }
            if (!$ordenPertenecePaciente) {
                echo json_encode(['success' => false, 'error' => 'La orden de laboratorio no pertenece al paciente seleccionado']); exit;
            }

            $stmtFixOrdenPaciente = $conn->prepare('UPDATE ordenes_laboratorio SET paciente_id = ? WHERE id = ? AND (paciente_id IS NULL OR paciente_id = 0)');
            if ($stmtFixOrdenPaciente) {
                $stmtFixOrdenPaciente->bind_param('ii', $pacienteId, $ordenId);
                $stmtFixOrdenPaciente->execute();
                $stmtFixOrdenPaciente->close();
            }
        }

        if ($cotizacionId > 0 && $cotizacionOrden > 0 && $cotizacionId !== $cotizacionOrden) {
            echo json_encode(['success' => false, 'error' => 'La orden seleccionada no corresponde a la cotización indicada']); exit;
        }
        if ($cotizacionOrden > 0) {
            $cotizacionId = $cotizacionOrden;
        }
    }

    if ($cotizacionId > 0) {
        $stmtCot = $conn->prepare('SELECT id FROM cotizaciones WHERE id = ? AND paciente_id = ? LIMIT 1');
        $stmtCot->bind_param('ii', $cotizacionId, $pacienteId);
        $stmtCot->execute();
        $cotizacionValida = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();

        if (!$cotizacionValida) {
            echo json_encode(['success' => false, 'error' => 'La cotización indicada no pertenece al paciente seleccionado']); exit;
        }
    }

    // Normalizar $_FILES['archivos'] para múltiples archivos
    $files = $_FILES['archivos'];
    if (!is_array($files['name'])) {
        $files = [
            'name'     => [$files['name']],
            'type'     => [$files['type']],
            'tmp_name' => [$files['tmp_name']],
            'error'    => [$files['error']],
            'size'     => [$files['size']],
        ];
    }

    // Validar archivos
    $validIndices = [];
    for ($i = 0; $i < count($files['name']); $i++) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK) continue;
        if ($files['size'][$i] > 25 * 1024 * 1024) {
            echo json_encode(['success' => false, 'error' => 'Archivo demasiado grande (máx 25 MB): ' . $files['name'][$i]]); exit;
        }
        // Verificar MIME real
        $finfo    = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $files['tmp_name'][$i]);
        finfo_close($finfo);
        // DICOM: finfo devuelve application/octet-stream — detectar por extensión
        $extArchivo = strtolower(pathinfo($files['name'][$i], PATHINFO_EXTENSION));
        if ($mimeType === 'application/octet-stream' && $extArchivo === 'dcm') {
            $mimeType = 'application/dicom';
        }
        $mimesPermitidos = [
            'application/pdf',
            'image/jpeg', 'image/png', 'image/webp',
            'image/gif',  'image/bmp', 'image/tiff',
            'application/dicom',
        ];
        if (!in_array($mimeType, $mimesPermitidos)) {
            echo json_encode(['success' => false, 'error' => 'Tipo de archivo no permitido (' . $mimeType . '). Se aceptan: PDF, imágenes (JPG/PNG/WebP/GIF/BMP/TIFF) y DICOM (.dcm). Archivo rechazado: ' . $files['name'][$i]]); exit;
        }
        $validIndices[] = ['index' => $i, 'mime' => $mimeType];
    }

    if (empty($validIndices)) {
        echo json_encode(['success' => false, 'error' => 'No se encontraron archivos PDF válidos']); exit;
    }

    // Crear registro de documento
    $ordenIdVal = $ordenId > 0 ? $ordenId : null;
    $cobroIdVal = $cobroId > 0 ? $cobroId : null;
    $stmtDoc = $conn->prepare(
        'INSERT INTO documentos_externos_paciente
         (paciente_id, tipo, titulo, descripcion, orden_id, cobro_id, cotizacion_id, subido_por_usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmtDoc->bind_param('isssiiii',
        $pacienteId, $tipo, $titulo, $descripcion,
        $ordenIdVal, $cobroIdVal, $cotizacionId, $usuarioId
    );
    if (!$stmtDoc->execute()) {
        echo json_encode(['success' => false, 'error' => 'Error al guardar el registro del documento']); exit;
    }
    $documentoId = (int)$stmtDoc->insert_id;
    $stmtDoc->close();

    // Guardar archivos en disco
    $pacienteDir = $uploadDir . $pacienteId . '/';
    if (!is_dir($pacienteDir)) mkdir($pacienteDir, 0755, true);

    $extMap = [
        'application/pdf'   => 'pdf',
        'image/jpeg'        => 'jpg',
        'image/png'         => 'png',
        'image/webp'        => 'webp',
        'image/gif'         => 'gif',
        'image/bmp'         => 'bmp',
        'image/tiff'        => 'tif',
        'application/dicom' => 'dcm',
    ];

    $archivoSubidos = 0;
    foreach ($validIndices as $vi) {
        $i              = $vi['index'];
        $mimeType       = $vi['mime'];
        $nombreOriginal = basename($files['name'][$i]);
        $tamano         = $files['size'][$i];
        $tmpName        = $files['tmp_name'][$i];
        $fileExt        = $extMap[$mimeType] ?? 'bin';
        $safeName       = date('Ymd_His') . '_d' . $documentoId . '_' . $i . '.' . $fileExt;
        $destPath       = $pacienteDir . $safeName;

        if (!move_uploaded_file($tmpName, $destPath)) continue;

        $stmtArch = $conn->prepare(
            'INSERT INTO documentos_externos_archivos (documento_id, nombre_original, archivo_path, tamano, mime_type) VALUES (?, ?, ?, ?, ?)'
        );
        $stmtArch->bind_param('issis', $documentoId, $nombreOriginal, $destPath, $tamano, $mimeType);
        $stmtArch->execute();
        $stmtArch->close();
        $archivoSubidos++;
    }

    if ($archivoSubidos === 0) {
        $conn->query("DELETE FROM documentos_externos_paciente WHERE id = $documentoId");
        echo json_encode(['success' => false, 'error' => 'No se pudo guardar ningún archivo en el servidor']); exit;
    }

    echo json_encode(['success' => true, 'documento_id' => $documentoId, 'archivos_subidos' => $archivoSubidos]);
    exit;
}

// ─── DELETE: eliminar documento externo ──────────────────────────────────────
if ($method === 'DELETE') {
    $data        = json_decode(file_get_contents('php://input'), true);
    $documentoId = intval($data['documento_id'] ?? 0);
    if ($documentoId <= 0) {
        echo json_encode(['success' => false, 'error' => 'documento_id requerido']); exit;
    }

    $stmtDoc = $conn->prepare('SELECT id, tipo, orden_id, cotizacion_id, subido_por_usuario_id FROM documentos_externos_paciente WHERE id = ? LIMIT 1');
    $stmtDoc->bind_param('i', $documentoId);
    $stmtDoc->execute();
    $docRow = $stmtDoc->get_result()->fetch_assoc();
    $stmtDoc->close();

    if (!$docRow) {
        echo json_encode(['success' => false, 'error' => 'Documento no encontrado']); exit;
    }

    // Administrador: acceso total.
    // Recepción/Laboratorio: puede eliminar si es el autor o si es un documento de laboratorio
    // enlazado a una orden/cotización (flujo compartido cotizaciones <-> panel laboratorio).
    $esAutor = (int)($docRow['subido_por_usuario_id'] ?? 0) === $usuarioId;
    $esDocumentoLaboratorio = strtolower(trim((string)($docRow['tipo'] ?? ''))) === 'laboratorio';
    $estaEnlazadoFlujoLab = (int)($docRow['orden_id'] ?? 0) > 0 || (int)($docRow['cotizacion_id'] ?? 0) > 0;

    if ($rol !== 'administrador') {
        $puedeEliminarPorFlujo = in_array($rol, ['laboratorista', 'recepcionista'], true)
            && $esDocumentoLaboratorio
            && $estaEnlazadoFlujoLab;

        if (!$esAutor && !$puedeEliminarPorFlujo) {
            echo json_encode(['success' => false, 'error' => 'No tienes permiso para eliminar este documento']); exit;
        }
    }

    $stmtA = $conn->prepare('SELECT archivo_path FROM documentos_externos_archivos WHERE documento_id = ?');
    $stmtA->bind_param('i', $documentoId);
    $stmtA->execute();
    $archRows = $stmtA->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtA->close();

    foreach ($archRows as $ar) {
        if (file_exists($ar['archivo_path'])) @unlink($ar['archivo_path']);
    }

    $conn->query("DELETE FROM documentos_externos_archivos WHERE documento_id = $documentoId");
    $conn->query("DELETE FROM documentos_externos_paciente WHERE id = $documentoId");

    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
