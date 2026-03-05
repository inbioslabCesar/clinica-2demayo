<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['usuario']) || !isset($_SESSION['usuario']['id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

$usuarioId = (int)$_SESSION['usuario']['id'];
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $stmt = $mysqli->prepare('SELECT id, usuario, nombre, rol, profesion, firma_reportes, colegiatura_tipo, colegiatura_numero, cargo_firma FROM usuarios WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $usuarioId);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        $stmt->close();

        if (!$row) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Usuario no encontrado']);
            exit;
        }

        echo json_encode(['success' => true, 'data' => $row]);
        exit;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Payload inválido']);
            exit;
        }

        $firmaReportes = array_key_exists('firma_reportes', $data) ? $data['firma_reportes'] : null;
        $colegiaturaTipo = isset($data['colegiatura_tipo']) ? trim((string)$data['colegiatura_tipo']) : null;
        $colegiaturaNumero = isset($data['colegiatura_numero']) ? trim((string)$data['colegiatura_numero']) : null;
        $cargoFirma = isset($data['cargo_firma']) ? trim((string)$data['cargo_firma']) : null;
        $profesion = isset($data['profesion']) ? trim((string)$data['profesion']) : null;

        if (!empty($firmaReportes) && !preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firmaReportes)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Formato de firma inválido. Debe ser PNG o JPEG en base64.']);
            exit;
        }

        $stmt = $mysqli->prepare('UPDATE usuarios SET profesion = COALESCE(?, profesion), firma_reportes = ?, colegiatura_tipo = ?, colegiatura_numero = ?, cargo_firma = ? WHERE id = ?');
        $stmt->bind_param('sssssi', $profesion, $firmaReportes, $colegiaturaTipo, $colegiaturaNumero, $cargoFirma, $usuarioId);
        $ok = $stmt->execute();
        $stmt->close();

        echo json_encode([
            'success' => (bool)$ok,
            'message' => $ok ? 'Firma profesional actualizada correctamente' : 'No se pudo actualizar la firma profesional'
        ]);
        exit;

    case 'DELETE':
        $stmt = $mysqli->prepare('UPDATE usuarios SET firma_reportes = NULL WHERE id = ?');
        $stmt->bind_param('i', $usuarioId);
        $ok = $stmt->execute();
        $stmt->close();

        echo json_encode([
            'success' => (bool)$ok,
            'message' => $ok ? 'Firma eliminada correctamente' : 'No se pudo eliminar la firma'
        ]);
        exit;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        exit;
}
