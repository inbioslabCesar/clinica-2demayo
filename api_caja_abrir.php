<?php
require_once __DIR__ . '/init_api.php';

require_once 'db.php';

function normalizar_turno($turno)
{
    $map = [
        'maÃ±ana' => 'mañana',
        'maã±ana' => 'mañana',
    ];
    $normalizado = strtr((string)$turno, $map);
    $t = strtolower(trim($normalizado));
    if ($t === 'manana' || $t === 'mañana') {
        return 'manana';
    }
    if ($t === 'tarde' || $t === 'noche') {
        return $t;
    }
    return '';
}

function resolver_turno_para_db($pdo, $turnoCanonico)
{
    $turnoCanonico = strtolower(trim((string)$turnoCanonico));
    if (!in_array($turnoCanonico, ['manana', 'tarde', 'noche'], true)) {
        return '';
    }

    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM cajas LIKE 'turno'");
        $col = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        $columnType = strtolower(trim((string)($col['Type'] ?? '')));
        if ($columnType !== '' && strpos($columnType, 'enum(') === 0) {
            preg_match_all("/'([^']+)'/", $columnType, $matches);
            $enumValues = $matches[1] ?? [];
            if (!empty($enumValues)) {
                $candidatos = [
                    'manana' => ['manana', 'mañana'],
                    'tarde' => ['tarde'],
                    'noche' => ['noche'],
                ][$turnoCanonico];

                foreach ($candidatos as $cand) {
                    if (in_array(strtolower($cand), $enumValues, true)) {
                        return $cand;
                    }
                }

                // Si no hubo match exacto, devolver el valor canónico y dejar que BD valide.
                return $turnoCanonico;
            }
        }
    } catch (Throwable $e) {
        // Fallback silencioso al valor canónico cuando no se puede leer metadata.
    }

    return $turnoCanonico;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
        exit;
    }


    $usuario_id = $_SESSION['usuario']['id'];
    $fecha_hoy = date('Y-m-d');
    $hora_actual = date('H:i:s');
    $input = json_decode(file_get_contents('php://input'), true);
    $monto_apertura = floatval($input['monto_apertura'] ?? 0);
    $observaciones = trim($input['observaciones'] ?? '');
    $turno = normalizar_turno($input['turno'] ?? '');
    $turnoDb = resolver_turno_para_db($pdo, $turno);
    $traspasoId = (int)($input['traspaso_id'] ?? 0);

    if ($traspasoId > 0) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS caja_traspasos (
            id INT AUTO_INCREMENT PRIMARY KEY, caja_origen_id INT NOT NULL, caja_destino_id INT NULL,
            usuario_entrega_id INT NOT NULL, usuario_recibe_id INT NOT NULL, monto DECIMAL(12,2) NOT NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente', observaciones TEXT NULL,
            fecha_entrega DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, fecha_recepcion DATETIME NULL,
            INDEX idx_ct_destino (usuario_recibe_id, estado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $stmtTraspaso = $pdo->prepare("SELECT id, monto FROM caja_traspasos WHERE id = ? AND usuario_recibe_id = ? AND estado = 'pendiente' LIMIT 1");
        $stmtTraspaso->execute([$traspasoId, $usuario_id]);
        $traspaso = $stmtTraspaso->fetch(PDO::FETCH_ASSOC);
        if (!$traspaso) {
            echo json_encode(['success' => false, 'error' => 'El traspaso seleccionado no esta disponible']);
            exit;
        }
        $monto_apertura = (float)$traspaso['monto'];
        $observaciones = trim(($observaciones ? $observaciones . ' | ' : '') . 'Fondo recibido por traspaso #' . $traspasoId);
    }

    // Validaciones
    if ($monto_apertura < 0) {
        echo json_encode(['success' => false, 'error' => 'El monto de apertura no puede ser negativo']);
        exit;
    }
    if ($turno === '') {
        echo json_encode(['success' => false, 'error' => 'Turno inválido. Use mañana, tarde o noche']);
        exit;
    }
    if ($turnoDb === '') {
        echo json_encode(['success' => false, 'error' => 'No se pudo resolver el turno para esta base de datos']);
        exit;
    }

    // Crear nueva caja (sin restricción por fecha ni hora)
    $stmt = $pdo->prepare("
        INSERT INTO cajas (
            fecha, 
            usuario_id, 
            estado, 
            monto_apertura, 
            hora_apertura, 
            observaciones_apertura,
            turno,
            total_efectivo,
            total_tarjetas,
            total_transferencias,
            total_otros
        ) VALUES (?, ?, 'abierta', ?, ?, ?, ?, 0.00, 0.00, 0.00, 0.00)
    ");

    $stmt->execute([
        $fecha_hoy,
        $usuario_id,
        $monto_apertura,
        $hora_actual,
        $observaciones,
        $turnoDb
    ]);

    $caja_id = $pdo->lastInsertId();

    if ($traspasoId > 0) {
        $stmtRecibir = $pdo->prepare("UPDATE caja_traspasos SET caja_destino_id = ?, estado = 'recibido', fecha_recepcion = NOW() WHERE id = ? AND usuario_recibe_id = ? AND estado = 'pendiente'");
        $stmtRecibir->execute([$caja_id, $traspasoId, $usuario_id]);
    }

    // Obtener información del usuario para el log
    $stmt = $pdo->prepare("SELECT nombre FROM usuarios WHERE id = ?");
    $stmt->execute([$usuario_id]);
    $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

    // Log de la acción
    error_log("Caja abierta - ID: $caja_id, Usuario: {$usuario['nombre']}, Monto: $monto_apertura");

    echo json_encode([
        'success' => true,
        'message' => 'Caja abierta exitosamente',
        'caja_id' => $caja_id,
        'fecha' => $fecha_hoy,
        'hora_apertura' => date('H:i', strtotime($hora_actual)),
        'monto_apertura' => $monto_apertura
    ]);

} catch (Exception $e) {
    error_log("Error en api_caja_abrir.php: " . $e->getMessage());
    
    // Manejo específico de error de restricción única
    if (strpos($e->getMessage(), 'Duplicate entry') !== false && strpos($e->getMessage(), 'unique_fecha_usuario') !== false) {
        echo json_encode([
            'success' => false,
            'error' => 'Ya existe una caja para este usuario en la fecha actual. Para abrir una nueva caja, primero debe cerrar o reabrir la caja existente.'
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'error' => 'Error interno del servidor: ' . $e->getMessage()
        ]);
    }
}
?>