<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

// Verificar que el usuario esté autenticado
if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    echo json_encode(['error' => 'No autorizado']);
    http_response_code(401);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// Para operaciones de escritura, verificar que sea administrador
if ($method !== 'GET') {
    if (!isset($_SESSION['usuario']) || !isset($_SESSION['usuario']['id'])) {
        echo json_encode(['error' => 'No autorizado']);
        http_response_code(401);
        exit;
    }

    $usuario_rol = trim((string)($_SESSION['usuario']['rol'] ?? ''));
    if ($usuario_rol !== 'administrador') {
        echo json_encode([
            'error' => 'Acceso denegado. Solo administradores pueden modificar la configuración de apariencia.',
            'user_role' => $usuario_rol
        ]);
        http_response_code(403);
        exit;
    }
}

try {
    // Asegurar que la tabla existe
    $pdo->exec("CREATE TABLE IF NOT EXISTS config_apariencia (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL DEFAULT 'avatar',
        clave VARCHAR(100) NOT NULL UNIQUE,
        valor TEXT NOT NULL,
        descripcion VARCHAR(255) NULL,
        activo BOOLEAN DEFAULT 0,
        order_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_config_tipo_clave (tipo, clave),
        KEY idx_config_activo (activo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Reparar datos legacy y reforzar unicidad por clave.
    normalizarConfigApariencia($pdo);

    switch ($method) {
        case 'GET':
            // Obtener configuración actual de apariencia
            $stmt = $pdo->query("
                SELECT 
                    id,
                    tipo,
                    clave,
                    valor,
                    descripcion,
                    activo,
                    order_index,
                    created_at,
                    updated_at
                FROM config_apariencia
                ORDER BY tipo, order_index ASC
            ");
            $configs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Organizar por tipo
            $result = [
                'avatares' => [],
                'color_primario' => '#3B82F6',
                'avatar_activo' => null
            ];

            foreach ($configs as $config) {
                if ($config['tipo'] === 'color') {
                    if ($config['clave'] === 'color_primario') {
                        $result['color_primario'] = $config['valor'];
                    }
                } elseif ($config['tipo'] === 'avatar') {
                    $result['avatares'][] = [
                        'id' => $config['id'],
                        'clave' => $config['clave'],
                        'valor' => $config['valor'],
                        'descripcion' => $config['descripcion'],
                        'activo' => (bool)$config['activo'],
                        'orden' => $config['order_index']
                    ];
                    if ((bool)$config['activo'] && $config['valor'] !== '') {
                        $result['avatar_activo'] = [
                            'id' => $config['id'],
                            'url' => $config['valor'],
                            'clave' => $config['clave']
                        ];
                    }
                }
            }

            echo json_encode([
                'success' => true,
                'data' => $result
            ]);
            break;

        case 'POST':
            // Manejar actualización de color
            if (isset($_POST['action']) && $_POST['action'] === 'update_color') {
                $color = trim((string)($_POST['color'] ?? ''));
                
                // Validar formato hexadecimal
                if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) {
                    echo json_encode([
                        'error' => 'Formato de color inválido. Debe ser hexadecimal (ej: #FF5733)'
                    ]);
                    http_response_code(400);
                    exit;
                }

                $stmt = $pdo->prepare("
                    UPDATE config_apariencia 
                    SET valor = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE clave = 'color_primario'
                ");
                $stmt->execute([$color]);

                echo json_encode([
                    'success' => true,
                    'message' => 'Color actualizado exitosamente',
                    'color' => $color
                ]);
                break;
            }

            // Manejar subida de avatares
            if (isset($_FILES['avatar']) && isset($_POST['avatar_clave'])) {
                $avatar_clave = trim((string)($_POST['avatar_clave']));
                $file = $_FILES['avatar'];

                // Validar errores en upload
                if ($file['error'] !== UPLOAD_ERR_OK) {
                    $errorMsgs = [
                        UPLOAD_ERR_INI_SIZE => 'Archivo mayor al límite ini_set',
                        UPLOAD_ERR_FORM_SIZE => 'Archivo mayor al límite del formulario',
                        UPLOAD_ERR_PARTIAL => 'Archivo parcialmente subido',
                        UPLOAD_ERR_NO_FILE => 'No se subió archivo',
                        UPLOAD_ERR_NO_TMP_DIR => 'Carpeta temporal no disponible',
                        UPLOAD_ERR_CANT_WRITE => 'No se puede escribir en carpeta temporal',
                    ];
                    echo json_encode([
                        'error' => 'Error en upload: ' . ($errorMsgs[$file['error']] ?? 'Error desconocido')
                    ]);
                    http_response_code(400);
                    exit;
                }

                // Validar que el archivo sea una imagen
                $validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if (!in_array($file['type'], $validMimes, true)) {
                    echo json_encode([
                        'error' => 'Solo se permiten imágenes (JPG, PNG, WebP, GIF). Tipo enviado: ' . $file['type']
                    ]);
                    http_response_code(400);
                    exit;
                }

                // Validar que sea un archivo real (no directorio, etc)
                if (!is_uploaded_file($file['tmp_name'])) {
                    echo json_encode([
                        'error' => 'Archivo no válido o no se subió correctamente'
                    ]);
                    http_response_code(400);
                    exit;
                }

                // Crear directorio si no existe
                $uploadDir = __DIR__ . '/uploads/avatars';
                if (!is_dir($uploadDir)) {
                    if (!@mkdir($uploadDir, 0755, true)) {
                        $error = error_get_last();
                        echo json_encode([
                            'error' => 'No se puede crear carpeta de upload. Verifica permisos. Detalles: ' . ($error['message'] ?? 'sin detalles')
                        ]);
                        http_response_code(500);
                        exit;
                    }
                }

                // Validar permiso de escritura
                if (!is_writable($uploadDir)) {
                    echo json_encode([
                        'error' => 'La carpeta de upload no tiene permisos de escritura. Ruta: ' . $uploadDir
                    ]);
                    http_response_code(500);
                    exit;
                }

                // Generar nombre único para el archivo
                $fileExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                $fileName = 'avatar_' . $avatar_clave . '_' . time() . '.' . $fileExt;
                $filePath = $uploadDir . '/' . $fileName;
                $fileUrl = 'uploads/avatars/' . $fileName;

                // Mover archivo
                if (!move_uploaded_file($file['tmp_name'], $filePath)) {
                    $error = error_get_last();
                    echo json_encode([
                        'error' => 'Error al mover archivo a: ' . $filePath . '. Detalles: ' . ($error['message'] ?? 'sin detalles')
                    ]);
                    http_response_code(500);
                    exit;
                }

                // Cambiar permisos del archivo
                @chmod($filePath, 0644);

                // Guardar en base de datos
                $descripcion = match($avatar_clave) {
                    'avatar_medico_defecto' => 'Avatar para médicos',
                    'avatar_doctora_defecto' => 'Avatar para doctoras',
                    'avatar_asistente_defecto' => 'Avatar para asistentes',
                    default => 'Avatar personalizado'
                };

                $orden = match($avatar_clave) {
                    'avatar_medico_defecto' => 1,
                    'avatar_doctora_defecto' => 2,
                    'avatar_asistente_defecto' => 3,
                    default => 0
                };

                try {
                    $stmt = $pdo->prepare("
                        UPDATE config_apariencia
                        SET tipo = 'avatar', valor = ?, descripcion = ?, order_index = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE clave = ?
                    ");
                    $stmt->execute([$fileUrl, $descripcion, $orden, $avatar_clave]);

                    if ($stmt->rowCount() === 0) {
                        insertConfigApariencia($pdo, [
                            'tipo' => 'avatar',
                            'clave' => $avatar_clave,
                            'valor' => $fileUrl,
                            'descripcion' => $descripcion,
                            'activo' => 0,
                            'order_index' => $orden,
                        ]);
                    }
                } catch (Exception $e) {
                    // Eliminar archivo si hubo error en BD
                    if (file_exists($filePath)) {
                        unlink($filePath);
                    }
                    echo json_encode([
                        'error' => 'Error al guardar en BD: ' . $e->getMessage()
                    ]);
                    http_response_code(500);
                    exit;
                }

                $avatarIdStmt = $pdo->prepare("SELECT id FROM config_apariencia WHERE clave = ? LIMIT 1");
                $avatarIdStmt->execute([$avatar_clave]);
                $avatarId = (int)($avatarIdStmt->fetchColumn() ?: 0);

                echo json_encode([
                    'success' => true,
                    'message' => 'Avatar subido exitosamente',
                    'data' => [
                        'clave' => $avatar_clave,
                        'url' => $fileUrl,
                        'id' => $avatarId
                    ]
                ]);
                break;
            }

            // Manejar activación de avatar
            if (isset($_POST['action']) && $_POST['action'] === 'activate_avatar') {
                $avatar_id = (int)($_POST['avatar_id'] ?? 0);
                
                if ($avatar_id <= 0) {
                    echo json_encode(['error' => 'ID de avatar inválido']);
                    http_response_code(400);
                    exit;
                }

                // Desactivar todos los avatares
                $pdo->exec("UPDATE config_apariencia SET activo = 0 WHERE tipo = 'avatar'");

                // Activar el seleccionado
                $stmt = $pdo->prepare("
                    UPDATE config_apariencia 
                    SET activo = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND tipo = 'avatar'
                ");
                $stmt->execute([$avatar_id]);

                if ($stmt->rowCount() === 0) {
                    echo json_encode(['error' => 'Avatar no encontrado o inválido']);
                    http_response_code(400);
                    exit;
                }

                echo json_encode([
                    'success' => true,
                    'message' => 'Avatar activado exitosamente'
                ]);
                break;
            }

            // Manejar eliminación de avatar
            if (isset($_POST['action']) && $_POST['action'] === 'delete_avatar') {
                $avatar_id = (int)($_POST['avatar_id'] ?? 0);
                
                if ($avatar_id <= 0) {
                    echo json_encode(['error' => 'ID de avatar inválido']);
                    http_response_code(400);
                    exit;
                }

                // Obtener el archivo para eliminarlo
                $stmt = $pdo->prepare("SELECT valor FROM config_apariencia WHERE id = ? AND tipo = 'avatar'");
                $stmt->execute([$avatar_id]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($result && $result['valor']) {
                    $filePath = __DIR__ . '/' . $result['valor'];
                    if (file_exists($filePath)) {
                        unlink($filePath);
                    }
                }

                // Eliminar de la BD
                $stmt = $pdo->prepare("DELETE FROM config_apariencia WHERE id = ?");
                $stmt->execute([$avatar_id]);

                echo json_encode([
                    'success' => true,
                    'message' => 'Avatar eliminado exitosamente'
                ]);
                break;
            }

            echo json_encode(['error' => 'Acción no especificada']);
            http_response_code(400);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Método no permitido']);
            break;
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Error interno del servidor',
        'message' => $e->getMessage()
    ]);
}

function normalizarConfigApariencia(PDO $pdo): void
{
    $defaults = [
        ['tipo' => 'color', 'clave' => 'color_primario', 'valor' => '#3B82F6', 'descripcion' => 'Color primario del sistema', 'activo' => 1, 'order_index' => 0],
        ['tipo' => 'avatar', 'clave' => 'avatar_medico_defecto', 'valor' => '', 'descripcion' => 'Avatar predefinido para médicos', 'activo' => 0, 'order_index' => 1],
        ['tipo' => 'avatar', 'clave' => 'avatar_doctora_defecto', 'valor' => '', 'descripcion' => 'Avatar predefinido para doctoras', 'activo' => 0, 'order_index' => 2],
        ['tipo' => 'avatar', 'clave' => 'avatar_asistente_defecto', 'valor' => '', 'descripcion' => 'Avatar predefinido para asistentes', 'activo' => 0, 'order_index' => 3],
    ];

    // Si hubo cargas en versiones sin índice único, conservar solo el registro más nuevo por clave.
    $pdo->exec("DELETE c1 FROM config_apariencia c1
        INNER JOIN config_apariencia c2
            ON c1.clave = c2.clave
            AND c1.id < c2.id");

    foreach ($defaults as $default) {
        $stmt = $pdo->prepare("SELECT id, tipo, valor, descripcion, activo, order_index FROM config_apariencia WHERE clave = ? LIMIT 1");
        $stmt->execute([$default['clave']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            insertConfigApariencia($pdo, [
                'tipo' => $default['tipo'],
                'clave' => $default['clave'],
                'valor' => $default['valor'],
                'descripcion' => $default['descripcion'],
                'activo' => $default['activo'],
                'order_index' => $default['order_index'],
            ]);
            continue;
        }

        $tipoActual = (string)($row['tipo'] ?? '');
        $valorActual = (string)($row['valor'] ?? '');
        $descripcionActual = (string)($row['descripcion'] ?? '');
        $activoActual = (int)($row['activo'] ?? 0);
        $ordenActual = (int)($row['order_index'] ?? 0);
        $updates = [];
        $params = [];

        if ($tipoActual !== $default['tipo']) {
            $updates[] = 'tipo = ?';
            $params[] = $default['tipo'];
        }
        if ($descripcionActual === '') {
            $updates[] = 'descripcion = ?';
            $params[] = $default['descripcion'];
        }
        if ($ordenActual !== (int)$default['order_index']) {
            $updates[] = 'order_index = ?';
            $params[] = $default['order_index'];
        }
        if ($default['clave'] === 'color_primario' && $activoActual !== 1) {
            $updates[] = 'activo = 1';
        }

        if ($default['clave'] === 'color_primario' && !preg_match('/^#[0-9A-Fa-f]{6}$/', $valorActual)) {
            if (preg_match('/uploads\/avatars\/(avatar_(avatar_[a-z_]+)_\d+\.[a-z0-9]+)$/i', $valorActual, $matches)) {
                $avatarClave = $matches[2];
                $repair = $pdo->prepare("UPDATE config_apariencia SET tipo = 'avatar', valor = ?, updated_at = CURRENT_TIMESTAMP WHERE clave = ?");
                $repair->execute([$valorActual, $avatarClave]);
            }
            $updates[] = 'valor = ?';
            $params[] = $default['valor'];
        }

        if (!empty($updates)) {
            $params[] = $default['clave'];
            $updateStmt = $pdo->prepare('UPDATE config_apariencia SET ' . implode(', ', $updates) . ', updated_at = CURRENT_TIMESTAMP WHERE clave = ?');
            $updateStmt->execute($params);
        }
    }

    // Garantizar solo un avatar activo.
    $activoIdStmt = $pdo->query("SELECT id FROM config_apariencia WHERE tipo = 'avatar' AND activo = 1 ORDER BY updated_at DESC, id DESC LIMIT 1");
    $activoId = (int)($activoIdStmt->fetchColumn() ?: 0);
    $pdo->exec("UPDATE config_apariencia SET activo = 0 WHERE tipo = 'avatar'");
    if ($activoId > 0) {
        $stmt = $pdo->prepare("UPDATE config_apariencia SET activo = 1 WHERE id = ? AND tipo = 'avatar'");
        $stmt->execute([$activoId]);
    }

    // Intentar crear índice único si aún no existe.
    $indexStmt = $pdo->query("SHOW INDEX FROM config_apariencia WHERE Key_name = 'uq_config_apariencia_clave'");
    $indexExists = (bool)$indexStmt->fetch(PDO::FETCH_ASSOC);
    if (!$indexExists) {
        $pdo->exec("ALTER TABLE config_apariencia ADD UNIQUE KEY uq_config_apariencia_clave (clave)");
    }
}

function insertConfigApariencia(PDO $pdo, array $data): void
{
    try {
        $stmt = $pdo->prepare("INSERT INTO config_apariencia (tipo, clave, valor, descripcion, activo, order_index) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $data['tipo'],
            $data['clave'],
            $data['valor'],
            $data['descripcion'],
            $data['activo'],
            $data['order_index'],
        ]);
        return;
    } catch (PDOException $e) {
        $message = $e->getMessage();
        $duplicateZeroPrimary = str_contains($message, "Duplicate entry '0' for key 'PRIMARY'");
        $missingIdDefault = str_contains($message, "Field 'id' doesn't have a default value");
        if (!$duplicateZeroPrimary && !$missingIdDefault) {
            throw $e;
        }
    }

    $nextId = (int)($pdo->query("SELECT COALESCE(MAX(id), 0) + 1 FROM config_apariencia")->fetchColumn() ?: 1);
    $stmt = $pdo->prepare("INSERT INTO config_apariencia (id, tipo, clave, valor, descripcion, activo, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $nextId,
        $data['tipo'],
        $data['clave'],
        $data['valor'],
        $data['descripcion'],
        $data['activo'],
        $data['order_index'],
    ]);
}
