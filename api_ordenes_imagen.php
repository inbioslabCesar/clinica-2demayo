<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

$usuario   = $_SESSION['usuario'] ?? $_SESSION['medico'] ?? null;
$rol       = strtolower(trim((string)($usuario['rol'] ?? '')));
$usuarioId = intval($usuario['id'] ?? 0);

$rolesPermitidos = ['administrador', 'recepcionista', 'laboratorista', 'medico'];
if (!$usuario || !in_array($rol, $rolesPermitidos)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// ─── Auto-crear tablas ────────────────────────────────────────────────────────
$conn->query("
    CREATE TABLE IF NOT EXISTS ordenes_imagen (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        consulta_id    INT NOT NULL,
        paciente_id    INT NOT NULL,
        tipo           VARCHAR(30) NOT NULL DEFAULT 'rx',
        indicaciones   TEXT,
        estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        fecha          DATETIME DEFAULT CURRENT_TIMESTAMP,
        solicitado_por INT DEFAULT NULL,
        cotizacion_id  INT DEFAULT NULL,
        carga_anticipada TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_oi_consulta (consulta_id),
        INDEX idx_oi_paciente (paciente_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// Migraciones para tablas ya existentes
$migrImagen = [
    'cotizacion_id'   => 'ALTER TABLE ordenes_imagen ADD COLUMN cotizacion_id INT DEFAULT NULL',
    'carga_anticipada'=> 'ALTER TABLE ordenes_imagen ADD COLUMN carga_anticipada TINYINT(1) NOT NULL DEFAULT 0',
];
foreach ($migrImagen as $col => $sql) {
    $chk = $conn->query("SHOW COLUMNS FROM ordenes_imagen LIKE '$col'");
    if ($chk && $chk->num_rows === 0) $conn->query($sql);
}

$conn->query("
    CREATE TABLE IF NOT EXISTS ordenes_imagen_archivos (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        orden_id         INT NOT NULL,
        nombre_original  VARCHAR(255) NOT NULL DEFAULT '',
        archivo_path     VARCHAR(500) NOT NULL DEFAULT '',
        tamano           INT DEFAULT 0,
        mime_type        VARCHAR(100) DEFAULT NULL,
        fecha            DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_oia_orden (orden_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// ─── Helper: construir URL base ───────────────────────────────────────────────
function getBaseUrl(): string {
    $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';

    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        $scheme = explode(',', (string)$_SERVER['HTTP_X_FORWARDED_PROTO'])[0];
    }

    $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost');

    // In dev-tunnels/reverse proxies, prefer browser-facing host when backend sees localhost:*.
    if (stripos((string)$host, 'localhost') !== false) {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
        if (!empty($origin)) {
            $originHost = parse_url((string)$origin, PHP_URL_HOST);
            $originPort = parse_url((string)$origin, PHP_URL_PORT);
            if (!empty($originHost)) {
                $host = $originHost . ($originPort ? ':' . $originPort : '');
            }
        }
    }

    $host = trim(explode(',', (string)$host)[0]);
    return $scheme . '://' . $host . '/clinica-2demayo/';
}

// ─── Helper: crear cotización desde orden de imagen ───────────────────────────
if (!function_exists('crearCotizacionImagen')) {
    function crearCotizacionImagen(mysqli $conn, int $pacienteId, int $consultaId, array $detalles, int $usuarioId, string $observaciones, int $medicoId = 0): array {
        $total = 0.0;
        foreach ($detalles as $d) $total += floatval($d['subtotal']);
        $stmt = $conn->prepare(
            'INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, saldo_pendiente, total_pagado, observaciones)
             VALUES (?, ?, ?, \'pendiente\', ?, 0, ?)'
        );
        $stmt->bind_param('iidds', $pacienteId, $usuarioId, $total, $total, $observaciones);
        $stmt->execute();
        $cotizacionId = $conn->insert_id;
        $stmt->close();
        $nroComp = 'Q' . str_pad((string)$cotizacionId, 6, '0', STR_PAD_LEFT);
        $conn->query("UPDATE cotizaciones SET numero_comprobante = '$nroComp' WHERE id = $cotizacionId");
        foreach ($detalles as $d) {
            $servTipo  = $conn->real_escape_string($d['servicio_tipo']);
            $servId    = intval($d['servicio_id']);
            $desc      = $conn->real_escape_string($d['descripcion']);
            $cant      = intval($d['cantidad'] ?? 1);
            $pu        = floatval($d['precio_unitario']);
            $sub       = floatval($d['subtotal']);
            $medIdRow  = ($d['medico_id'] ?? $medicoId) > 0 ? intval($d['medico_id'] ?? $medicoId) : 'NULL';
            $conn->query(
                "INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, consulta_id, medico_id)
                 VALUES ($cotizacionId, '$servTipo', $servId, '$desc', $cant, $pu, $sub, $consultaId, $medIdRow)"
            );
        }
        return ['cotizacion_id' => $cotizacionId, 'numero_comprobante' => $nroComp, 'total' => $total];
    }
}

// ─── Helper: adjuntar archivos a una orden ────────────────────────────────────
function adjuntarArchivos(mysqli $conn, array &$orden): void {
    $oid     = (int)$orden['id'];
    $orden['archivos'] = [];
    $res = $conn->query("SELECT * FROM ordenes_imagen_archivos WHERE orden_id = $oid ORDER BY fecha ASC");
    while ($a = $res->fetch_assoc()) {
        $mt = !empty($a['mime_type']) ? $a['mime_type'] : 'application/octet-stream';
        $orden['archivos'][] = [
            'id'              => (int)$a['id'],
            'nombre_original' => $a['nombre_original'],
            'tamano'          => (int)$a['tamano'],
            'mime_type'       => $mt,
            'es_imagen'       => str_starts_with($mt, 'image/'),
            'es_dicom'        => $mt === 'application/dicom',
            'url'             => '/api_ordenes_imagen.php?action=download&archivo_id=' . $a['id'],
            'fecha'           => $a['fecha'],
        ];
    }
    // Enriquecer con estado de la cotización y nombres de servicios
    $cotizId = (int)($orden['cotizacion_id'] ?? 0);
    if ($cotizId > 0) {
        $cRow = $conn->query("SELECT estado, numero_comprobante, total, saldo_pendiente FROM cotizaciones WHERE id = $cotizId")->fetch_assoc();
        $orden['cotizacion'] = $cRow ?: null;
        $descs = [];
        $dRes = $conn->query("SELECT descripcion FROM cotizaciones_detalle WHERE cotizacion_id = $cotizId ORDER BY id ASC");
        while ($d = $dRes->fetch_assoc()) $descs[] = $d['descripcion'];
        $orden['servicios_nombres'] = $descs;
    } else {
        $orden['cotizacion'] = null;
        $orden['servicios_nombres'] = [];
    }
}

// ─── Download ────────────────────────────────────────────────────────────────
if (isset($_GET['action']) && $_GET['action'] === 'download') {
    $archivo_id = (int)($_GET['archivo_id'] ?? 0);
    if ($archivo_id <= 0) { http_response_code(400); exit; }

    $row = $conn->query("SELECT * FROM ordenes_imagen_archivos WHERE id = $archivo_id")->fetch_assoc();
    if (!$row || !file_exists($row['archivo_path'])) { http_response_code(404); exit; }

    $safeName = preg_replace('/[^a-zA-Z0-9._\- ]/', '_', basename($row['nombre_original']));
    $mimeType = !empty($row['mime_type']) ? $row['mime_type'] : 'application/octet-stream';
    header('Content-Type: ' . $mimeType);
    header('Content-Disposition: inline; filename="' . $safeName . '"');
    header('Content-Length: ' . filesize($row['archivo_path']));
    header('Cache-Control: private, max-age=3600');
    readfile($row['archivo_path']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// ─── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $consulta_id = (int)($_GET['consulta_id'] ?? 0);
    $paciente_id = (int)($_GET['paciente_id'] ?? 0);
    $orden_id    = (int)($_GET['orden_id'] ?? 0);
    $tipo        = trim($_GET['tipo'] ?? '');

    if ($orden_id > 0) {
        // Un solo orden con detalles completos
        $row = $conn->query("SELECT * FROM ordenes_imagen WHERE id = $orden_id")->fetch_assoc();
        if (!$row) { echo json_encode(['success' => false, 'error' => 'Orden no encontrada']); exit; }
        adjuntarArchivos($conn, $row);

        // Info paciente
        $pac = $conn->query("SELECT id, nombre, dni, historia_clinica FROM pacientes WHERE id = " . (int)$row['paciente_id'])->fetch_assoc();
        $row['paciente'] = $pac;

        // Info consulta + médico
        $con = $conn->query("
            SELECT c.id, c.fecha,
                   m.nombre AS med_nombre, m.especialidad
            FROM consultas c
            LEFT JOIN medicos m ON m.id = c.medico_id
            WHERE c.id = " . (int)$row['consulta_id']
        )->fetch_assoc();
        $row['consulta'] = $con;

        echo json_encode(['success' => true, 'orden' => $row]);

    } elseif ($consulta_id > 0) {
        // Todas las órdenes de una consulta
        $res = $conn->query("SELECT * FROM ordenes_imagen WHERE consulta_id = $consulta_id ORDER BY fecha DESC");
        $rows = [];
        while ($r = $res->fetch_assoc()) {
            adjuntarArchivos($conn, $r);
            $rows[] = $r;
        }
        echo json_encode(['success' => true, 'ordenes' => $rows]);

    } elseif ($paciente_id > 0) {
        // Todas las órdenes de un paciente (para ConsumoPaciente)
        $wheresTipo = '';
        if ($tipo && in_array($tipo, ['rx', 'ecografia', 'tomografia', 'todos'])) {
            if ($tipo !== 'todos') {
                $t = $conn->real_escape_string($tipo);
                $wheresTipo = "AND tipo = '$t'";
            }
        }
        $res  = $conn->query("SELECT * FROM ordenes_imagen WHERE paciente_id = $paciente_id $wheresTipo ORDER BY fecha DESC");
        $rows = [];
        while ($r = $res->fetch_assoc()) {
            adjuntarArchivos($conn, $r);
            $rows[] = $r;
        }
        echo json_encode(['success' => true, 'ordenes' => $rows]);

    } else {
        echo json_encode(['success' => false, 'error' => 'Parámetro requerido: orden_id, consulta_id o paciente_id']);
    }
    exit;
}

// ─── POST ─────────────────────────────────────────────────────────────────────
if ($method === 'POST') {
    // Determinar si es upload de archivos o JSON
    $hayArchivos = isset($_FILES['archivos']) && !empty($_FILES['archivos']['name'][0]);

    if ($hayArchivos) {
        // ── Subir archivos ──────────────────────────────────────────────────
        $orden_id = (int)($_POST['orden_id'] ?? 0);
        if ($orden_id <= 0) { echo json_encode(['success' => false, 'error' => 'orden_id requerido']); exit; }

        $orden = $conn->query("SELECT * FROM ordenes_imagen WHERE id = $orden_id")->fetch_assoc();
        if (!$orden) { echo json_encode(['success' => false, 'error' => 'Orden no encontrada']); exit; }

        // ── Verificar permiso de subida: cotización pagada o carga anticipada ───
        $puedeSubir = (intval($orden['carga_anticipada']) === 1);
        if (!$puedeSubir && !empty($orden['cotizacion_id'])) {
            $cotizRow = $conn->query("SELECT estado FROM cotizaciones WHERE id = " . intval($orden['cotizacion_id']))->fetch_assoc();
            if ($cotizRow && in_array($cotizRow['estado'], ['completado', 'pagado'], true)) $puedeSubir = true;
        } elseif (!$puedeSubir && empty($orden['cotizacion_id'])) {
            // Sin cotización → permitir subida sin restricción (orden sin pago asignado)
            $puedeSubir = true;
        }
        if (!$puedeSubir) {
            echo json_encode(['success' => false, 'error' => 'El pago de la cotización es requerido antes de subir archivos. Use "Carga anticipada" para urgencias.', 'requiere_pago' => true]);
            exit;
        }

        $uploadDir = __DIR__ . '/uploads/imagenes_diagnostico/' . $orden['paciente_id'] . '/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $files = $_FILES['archivos'];
        $count = is_array($files['name']) ? count($files['name']) : 0;
        if ($count === 0) { echo json_encode(['success' => false, 'error' => 'Sin archivos']); exit; }

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
        $mimesPermitidos = array_keys($extMap);

        $subidos = 0;
        for ($i = 0; $i < $count; $i++) {
            if ($files['error'][$i] !== UPLOAD_ERR_OK) continue;
            if ($files['size'][$i] > 100 * 1024 * 1024) continue; // 100 MB max

            $finfo    = finfo_open(FILEINFO_MIME_TYPE);
            $mimeType = finfo_file($finfo, $files['tmp_name'][$i]);
            finfo_close($finfo);

            $extArchivo = strtolower(pathinfo($files['name'][$i], PATHINFO_EXTENSION));
            if ($mimeType === 'application/octet-stream' && $extArchivo === 'dcm') {
                $mimeType = 'application/dicom';
            }
            if (!in_array($mimeType, $mimesPermitidos)) continue;

            $fileExt        = $extMap[$mimeType] ?? 'bin';
            $nombreOriginal = basename($files['name'][$i]);
            $tamano         = $files['size'][$i];
            $safeName       = date('Ymd_His') . '_oi' . $orden_id . '_' . $i . '.' . $fileExt;
            $destPath       = $uploadDir . $safeName;

            if (!move_uploaded_file($files['tmp_name'][$i], $destPath)) continue;

            $stmt = $conn->prepare(
                'INSERT INTO ordenes_imagen_archivos (orden_id, nombre_original, archivo_path, tamano, mime_type) VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->bind_param('issis', $orden_id, $nombreOriginal, $destPath, $tamano, $mimeType);
            $stmt->execute();
            $stmt->close();
            $subidos++;
        }

        if ($subidos > 0) {
            $conn->query("UPDATE ordenes_imagen SET estado = 'completado' WHERE id = $orden_id");
        }

        echo json_encode(['success' => true, 'subidos' => $subidos]);

    } else {
        // ── JSON actions ────────────────────────────────────────────────────
        $input  = json_decode(file_get_contents('php://input'), true) ?? [];
        $action = $input['action'] ?? ($_POST['action'] ?? '');

        if ($action === 'crear') {
            $consulta_id    = (int)($input['consulta_id'] ?? 0);
            $paciente_id    = (int)($input['paciente_id'] ?? 0);
            $tipo           = trim($input['tipo'] ?? 'rx');
            $indicaciones   = trim($input['indicaciones'] ?? '');
            $cargaAnticipada = !empty($input['carga_anticipada']) ? 1 : 0;
            // servicios: array of {tarifa_id, descripcion, precio} sent from SolicitudImagenPage
            $servicios      = is_array($input['servicios'] ?? null) ? $input['servicios'] : [];

            if ($consulta_id <= 0 || $paciente_id <= 0) {
                echo json_encode(['success' => false, 'error' => 'consulta_id y paciente_id son requeridos']); exit;
            }
            if (!in_array($tipo, ['rx', 'ecografia', 'tomografia'])) {
                echo json_encode(['success' => false, 'error' => 'Tipo no válido']); exit;
            }

            $tipo_e = $conn->real_escape_string($tipo);
            $ind_e  = $conn->real_escape_string($indicaciones);
            $stmt   = $conn->prepare('INSERT INTO ordenes_imagen (consulta_id, paciente_id, tipo, indicaciones, estado, solicitado_por, carga_anticipada) VALUES (?, ?, ?, ?, \'pendiente\', ?, ?)');
            $stmt->bind_param('iissii', $consulta_id, $paciente_id, $tipo_e, $ind_e, $usuarioId, $cargaAnticipada);
            $stmt->execute();
            $stmt->close();
            $orden_id = $conn->insert_id;

            // Crear cotización si se enviaron servicios con precios
            $cotizData = ['cotizacion_id' => null, 'numero_comprobante' => null, 'total' => 0];
            if (!empty($servicios)) {
                $detallesCotiz = [];
                // Map internal tipo to ENUM-compatible servicio_tipo for cotizaciones_detalle
                $tipoServMap = ['rx' => 'rayosx', 'ecografia' => 'ecografia', 'tomografia' => 'procedimientos'];
                $detalleServTipo = $tipoServMap[$tipo] ?? $tipo;
                foreach ($servicios as $srv) {
                    $precio = floatval($srv['precio'] ?? 0);
                    if ($precio <= 0) continue;
                    $detallesCotiz[] = [
                        'servicio_tipo'   => $detalleServTipo,
                        'servicio_id'     => intval($srv['tarifa_id'] ?? 0),
                        'descripcion'     => trim((string)($srv['descripcion'] ?? 'Servicio')),
                        'cantidad'        => 1,
                        'precio_unitario' => $precio,
                        'subtotal'        => $precio,
                    ];
                }
                if (!empty($detallesCotiz)) {
                    $tipoLabel = ['rx' => 'Rayos X', 'ecografia' => 'Ecografía', 'tomografia' => 'Tomografía'][$tipo] ?? strtoupper($tipo);
                    $obsText   = "Orden de $tipoLabel desde consulta #$consulta_id";
                    // Usar usuario_id = 0 si es médico (su ID viene de tabla medicos, no usuarios)
                    $usuarioIdCotiz = ($rol === 'medico') ? 0 : $usuarioId;
                    $medicoIdCotiz  = ($rol === 'medico') ? $usuarioId : 0;
                    $cotizData = crearCotizacionImagen($conn, $paciente_id, $consulta_id, $detallesCotiz, $usuarioIdCotiz, $obsText, $medicoIdCotiz);
                    $cotizId   = intval($cotizData['cotizacion_id']);
                    $conn->query("UPDATE ordenes_imagen SET cotizacion_id = $cotizId WHERE id = $orden_id");
                }
            }

            echo json_encode([
                'success'            => true,
                'orden_id'           => $orden_id,
                'cotizacion_id'      => $cotizData['cotizacion_id'],
                'numero_comprobante' => $cotizData['numero_comprobante'],
                'total'              => $cotizData['total'],
            ]);

        } elseif ($action === 'crear_desde_cotizacion') {
            $cotizacion_id = (int)($input['cotizacion_id'] ?? 0);
            $paciente_id_input = (int)($input['paciente_id'] ?? 0);
            if ($cotizacion_id <= 0) {
                echo json_encode(['success' => false, 'error' => 'cotizacion_id requerido']);
                exit;
            }

            $cot = $conn->query("SELECT id, paciente_id FROM cotizaciones WHERE id = $cotizacion_id LIMIT 1")->fetch_assoc();
            if (!$cot) {
                echo json_encode(['success' => false, 'error' => 'Cotización no encontrada']);
                exit;
            }

            $paciente_id = (int)($cot['paciente_id'] ?? 0);
            if ($paciente_id <= 0) {
                $paciente_id = $paciente_id_input;
            }
            if ($paciente_id <= 0) {
                echo json_encode(['success' => false, 'error' => 'No se pudo resolver paciente_id']);
                exit;
            }

            $hasEstadoItem = $conn->query("SHOW COLUMNS FROM cotizaciones_detalle LIKE 'estado_item'");
            $whereEstado = ($hasEstadoItem && $hasEstadoItem->num_rows > 0)
                ? " AND estado_item <> 'eliminado'"
                : '';

            $detRes = $conn->query("SELECT servicio_tipo, descripcion FROM cotizaciones_detalle WHERE cotizacion_id = $cotizacion_id" . $whereEstado);
            $tipos = [];
            while ($det = $detRes->fetch_assoc()) {
                $tipoSrv = strtolower(trim((string)($det['servicio_tipo'] ?? '')));
                $desc = strtolower(trim((string)($det['descripcion'] ?? '')));
                $tipoOrden = null;

                if (in_array($tipoSrv, ['rayosx', 'rayos_x', 'rayos x', 'rx'], true)) {
                    $tipoOrden = 'rx';
                } elseif ($tipoSrv === 'ecografia') {
                    $tipoOrden = 'ecografia';
                } elseif ($tipoSrv === 'tomografia') {
                    $tipoOrden = 'tomografia';
                } elseif (in_array($tipoSrv, ['procedimiento', 'procedimientos'], true)) {
                    if (preg_match('/tomograf|\btac\b/u', $desc)) {
                        $tipoOrden = 'tomografia';
                    } elseif (preg_match('/rayos\s*x|\brx\b/u', $desc)) {
                        $tipoOrden = 'rx';
                    } elseif (preg_match('/ecograf/i', $desc)) {
                        $tipoOrden = 'ecografia';
                    }
                }

                if ($tipoOrden) {
                    $tipos[$tipoOrden] = true;
                }
            }

            if (empty($tipos)) {
                echo json_encode(['success' => true, 'creadas' => 0, 'tipos' => []]);
                exit;
            }

            $creadas = 0;
            $tiposCreados = [];
            foreach (array_keys($tipos) as $tipoOrden) {
                $stmtChk = $conn->prepare('SELECT id FROM ordenes_imagen WHERE cotizacion_id = ? AND tipo = ? LIMIT 1');
                if ($stmtChk) {
                    $stmtChk->bind_param('is', $cotizacion_id, $tipoOrden);
                    $stmtChk->execute();
                    $exists = $stmtChk->get_result()->fetch_assoc();
                    $stmtChk->close();
                    if ($exists) {
                        continue;
                    }
                }

                $stmtIns = $conn->prepare("INSERT INTO ordenes_imagen (consulta_id, paciente_id, tipo, indicaciones, estado, solicitado_por, cotizacion_id, carga_anticipada) VALUES (0, ?, ?, ?, 'pendiente', ?, ?, 0)");
                if ($stmtIns) {
                    $indicaciones = 'Orden creada desde cotización #' . $cotizacion_id;
                    $stmtIns->bind_param('issii', $paciente_id, $tipoOrden, $indicaciones, $usuarioId, $cotizacion_id);
                    $stmtIns->execute();
                    $stmtIns->close();
                    $creadas++;
                    $tiposCreados[] = $tipoOrden;
                }
            }

            echo json_encode(['success' => true, 'creadas' => $creadas, 'tipos' => $tiposCreados]);

        } elseif ($action === 'toggle_anticipada') {
            $orden_id = (int)($input['orden_id'] ?? 0);
            $valor    = !empty($input['valor']) ? 1 : 0;
            if ($orden_id > 0) {
                $conn->query("UPDATE ordenes_imagen SET carga_anticipada = $valor WHERE id = $orden_id");
            }
            echo json_encode(['success' => true, 'carga_anticipada' => $valor]);

        } elseif ($action === 'cancelar') {
            $orden_id = (int)($input['orden_id'] ?? 0);
            if ($orden_id > 0) $conn->query("UPDATE ordenes_imagen SET estado = 'cancelado' WHERE id = $orden_id");
            echo json_encode(['success' => true]);

        } elseif ($action === 'eliminar_archivo') {
            $archivo_id = (int)($input['archivo_id'] ?? 0);
            $row = $conn->query("SELECT * FROM ordenes_imagen_archivos WHERE id = $archivo_id")->fetch_assoc();
            if ($row) {
                if (file_exists($row['archivo_path'])) @unlink($row['archivo_path']);
                $conn->query("DELETE FROM ordenes_imagen_archivos WHERE id = $archivo_id");
                $oid = (int)$row['orden_id'];
                $cnt = (int)$conn->query("SELECT COUNT(*) c FROM ordenes_imagen_archivos WHERE orden_id = $oid")->fetch_assoc()['c'];
                if ($cnt === 0) $conn->query("UPDATE ordenes_imagen SET estado = 'pendiente' WHERE id = $oid");
            }
            echo json_encode(['success' => true]);

        } else {
            echo json_encode(['success' => false, 'error' => 'Acción no reconocida: ' . htmlspecialchars($action)]);
        }
    }
    exit;
}

echo json_encode(['success' => false, 'error' => 'Método no soportado']);
