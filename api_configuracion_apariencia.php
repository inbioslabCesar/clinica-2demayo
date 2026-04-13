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

    // Insertar valores por defecto si no existen
    $pdo->exec("INSERT IGNORE INTO config_apariencia (tipo, clave, valor, descripcion, activo, order_index) 
        VALUES 
          ('color', 'color_primario', '#3B82F6', 'Color primario del sistema', 1, 0),
          ('avatar', 'avatar_medico_defecto', '', 'Avatar predefinido para médicos', 0, 1),
          ('avatar', 'avatar_doctora_defecto', '', 'Avatar predefinido para doctoras', 0, 2),
          ('avatar', 'avatar_asistente_defecto', '', 'Avatar predefinido para asistentes', 0, 3)");

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

                // Validar que el archivo sea una imagen
                $validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if (!in_array($file['type'], $validMimes, true)) {
                    echo json_encode([
                        'error' => 'Solo se permiten imágenes (JPG, PNG, WebP, GIF)'
                    ]);
                    http_response_code(400);
                    exit;
                }

                // Crear directorio si no existe
                $uploadDir = __DIR__ . '/uploads/avatars';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0755, true);
                }

                // Generar nombre único para el archivo
                $fileExt = pathinfo($file['name'], PATHINFO_EXTENSION);
                $fileName = 'avatar_' . $avatar_clave . '_' . time() . '.' . $fileExt;
                $filePath = $uploadDir . '/' . $fileName;
                $fileUrl = 'uploads/avatars/' . $fileName;

                // Mover archivo
                if (!move_uploaded_file($file['tmp_name'], $filePath)) {
                    echo json_encode([
                        'error' => 'Error al subir el archivo'
                    ]);
                    http_response_code(500);
                    exit;
                }

                // Guardar en base de datos
                $stmt = $pdo->prepare("
                    INSERT INTO config_apariencia (tipo, clave, valor, descripcion, activo, order_index)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        valor = VALUES(valor),
                        updated_at = CURRENT_TIMESTAMP
                ");

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

                $stmt->execute([
                    'avatar',
                    $avatar_clave,
                    $fileUrl,
                    $descripcion,
                    0, // No activo por defecto
                    $orden
                ]);

                echo json_encode([
                    'success' => true,
                    'message' => 'Avatar subido exitosamente',
                    'data' => [
                        'clave' => $avatar_clave,
                        'url' => $fileUrl,
                        'id' => $pdo->lastInsertId()
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
    // Si hubo cargas en versiones sin índice único, conservar solo el registro más nuevo por clave.
    $pdo->exec("DELETE c1 FROM config_apariencia c1
        INNER JOIN config_apariencia c2
            ON c1.clave = c2.clave
            AND c1.id < c2.id");

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
