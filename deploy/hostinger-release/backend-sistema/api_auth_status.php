<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function auth_status_normalizar_permisos($raw) {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $raw = $decoded;
        } else {
            $raw = explode(',', $raw);
        }
    }
    if (!is_array($raw)) {
        return [];
    }

    $clean = [];
    foreach ($raw as $item) {
        $key = trim((string)$item);
        if ($key !== '') {
            $clean[$key] = true;
        }
    }
    return array_keys($clean);
}

function auth_status_hidratar_medico($mysqli, int $medicoId): ?array {
    if ($medicoId <= 0 || !($mysqli instanceof mysqli)) {
        return null;
    }

    $stmt = $mysqli->prepare('SELECT id, nombre, apellido, especialidad, email, cmp, rne, firma FROM medicos WHERE id = ? LIMIT 1');
    if (!$stmt) {
        return null;
    }

    $stmt->bind_param('i', $medicoId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return null;
    }

    $row['rol'] = 'medico';
    $row['permisos'] = [];
    return $row;
}

try {
    // Priorizar la sesion de medico para evitar cruces por colision de ID con tabla usuarios.
    if (isset($_SESSION['medico_id'])) {
        $medicoId = (int)($_SESSION['medico_id'] ?? 0);
        $medicoSesion = isset($_SESSION['medico']) && is_array($_SESSION['medico'])
            ? $_SESSION['medico']
            : null;

        $medicoHidratado = auth_status_hidratar_medico(isset($mysqli) ? $mysqli : null, $medicoId);
        if ($medicoHidratado) {
            $_SESSION['medico'] = $medicoHidratado;
            unset($_SESSION['usuario']);
            $medicoSesion = $medicoHidratado;
        }

        if ($medicoSesion) {
            echo json_encode([
                'success' => true,
                'authenticated' => true,
                'usuario_id' => (int)($medicoSesion['id'] ?? $medicoId),
                'nombre' => $medicoSesion['nombre'] ?? '',
                'rol' => 'medico',
                'usuario' => $medicoSesion['email'] ?? '',
                'permisos' => [],
                'tipo' => 'medico',
                'medico' => $medicoSesion,
            ]);
            exit;
        }

        // Sesion de medico inconsistente: limpiar para no autenticar contra un estado corrupto.
        unset($_SESSION['medico_id'], $_SESSION['medico']);
    }

    // Verificar si hay usuario autenticado
    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
        $usuarioSesion = $_SESSION['usuario'];
        $usuarioId = (int)($usuarioSesion['id'] ?? 0);

        // Autocorregir sesión con datos vigentes del usuario en BD (nombre, rol, permisos).
        if ($usuarioId > 0 && isset($mysqli) && $mysqli instanceof mysqli) {
            $stmt = $mysqli->prepare('SELECT id, usuario, nombre, rol, permisos FROM usuarios WHERE id = ? LIMIT 1');
            if ($stmt) {
                $stmt->bind_param('i', $usuarioId);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();

                if ($row) {
                    $row['permisos'] = auth_status_normalizar_permisos($row['permisos'] ?? []);
                    $_SESSION['usuario'] = $row;
                    $usuarioSesion = $row;
                }
            }
        }

        unset($_SESSION['medico_id'], $_SESSION['medico']);

        // Usuario normal autenticado (estructura existente)
        echo json_encode([
            'success' => true,
            'authenticated' => true,
            'usuario_id' => $usuarioSesion['id'] ?? null,
            'nombre' => $usuarioSesion['nombre'] ?? '',
            'rol' => $usuarioSesion['rol'] ?? '',
            'usuario' => $usuarioSesion['usuario'] ?? '',
            'permisos' => $usuarioSesion['permisos'] ?? [],
            'tipo' => 'usuario'
        ]);
    } else {
        // No autenticado
        echo json_encode([
            'success' => false,
            'authenticated' => false,
            'error' => 'Usuario no autenticado'
        ]);
    }
} catch (Exception $e) {
    error_log("Error en api_auth_status.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'authenticated' => false,
        'error' => 'Error interno del servidor'
    ]);
}
?>