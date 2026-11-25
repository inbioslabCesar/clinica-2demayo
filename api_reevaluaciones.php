<?php
require_once __DIR__ . '/init_api.php';
if (!defined('SKIP_PDO_INIT')) {
    define('SKIP_PDO_INIT', true);
}
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ReevaluacionModule.php';

// Reevaluación: continuación de la misma atención (máx. 7 días). Ver modules/ReevaluacionModule.php.
// Permisos: médico (solo sus reevaluaciones) y administrador/recepción (logística y gestión de contacto).

function rev_api_responder(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$actor = rev_actor();
if ($actor['rol'] === '') {
    rev_api_responder(['success' => false, 'error' => 'No autenticado'], 401);
}
if (!in_array($actor['rol'], ['administrador', 'recepcionista', 'medico'], true)) {
    rev_api_responder(['success' => false, 'error' => 'No autorizado'], 403);
}
if ($actor['rol'] === 'medico' && $actor['medico_id'] <= 0) {
    rev_api_responder(['success' => false, 'error' => 'No autorizado'], 403);
}

if (!rev_disponible($conn)) {
    rev_api_responder([
        'success' => false,
        'disponible' => false,
        'error' => 'La reevaluación aún no está habilitada en esta instalación (falta aplicar el esquema de BD).',
    ], 503);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET') {
        $consultaId = (int)($_GET['consulta_id'] ?? 0);
        $visitaId = (int)($_GET['consulta_visita_id'] ?? 0);

        if ($visitaId > 0) {
            $r = rev_obtener_por_visita($conn, $visitaId);
            if (!$r || ($actor['rol'] === 'medico' && (int)$r['medico_id'] !== $actor['medico_id'])) {
                rev_api_responder(['success' => false, 'error' => 'No hay una reevaluación vigente para esta visita'], 404);
            }
            rev_api_responder(['success' => true, 'reevaluacion' => $r]);
        }

        if ($consultaId > 0) {
            if ($actor['rol'] === 'medico') {
                $consulta = rev_obtener_consulta_base($conn, $consultaId);
                if ((int)$consulta['medico_id'] !== $actor['medico_id']) {
                    rev_api_responder(['success' => false, 'error' => 'No autorizado para esta consulta'], 403);
                }
            }
            rev_api_responder(['success' => true, 'reevaluacion' => rev_obtener_para_hc($conn, $consultaId)]);
        }

        $id = (int)($_GET['id'] ?? 0);
        if ($id > 0 && !empty($_GET['eventos'])) {
            $row = rev_obtener($conn, $id);
            if (!$row || ($actor['rol'] === 'medico' && (int)$row['medico_id'] !== $actor['medico_id'])) {
                rev_api_responder(['success' => false, 'error' => 'Reevaluación no encontrada'], 404);
            }
            $eventos = [];
            $stmt = $conn->prepare('SELECT accion, estado_anterior, estado_nuevo, detalle, usuario_rol, usuario_nombre, creado_en FROM hc_reevaluaciones_eventos WHERE reevaluacion_id = ? ORDER BY id ASC');
            if ($stmt) {
                $stmt->bind_param('i', $id);
                $stmt->execute();
                $res = $stmt->get_result();
                while ($e = $res->fetch_assoc()) {
                    $eventos[] = $e;
                }
                $stmt->close();
            }
            rev_api_responder(['success' => true, 'eventos' => $eventos]);
        }

        $page = max(0, (int)($_GET['page'] ?? 0));
        $perPage = min(100, max(0, (int)($_GET['per_page'] ?? 0)));
        $lista = rev_listar($conn, [
            'abiertas' => (($_GET['abiertas'] ?? '1') !== '0'),
            'medico_id' => $actor['rol'] === 'medico' ? $actor['medico_id'] : (int)($_GET['medico_id'] ?? 0),
            'paciente_id' => (int)($_GET['paciente_id'] ?? 0),
            'estados' => ($_GET['estados'] ?? '') !== '' ? array_values(array_intersect(explode(',', (string)$_GET['estados']), ['pendiente', 'en_espera', 'en_revision'])) : [],
            'estado_gestion' => (string)($_GET['estado_gestion'] ?? ''),
            'busqueda' => (string)($_GET['busqueda'] ?? ''),
            'page' => $page,
            'per_page' => $perPage,
        ]);
        rev_api_responder([
            'success' => true,
            'total' => $lista['total'],
            'items' => array_map(static function ($r) {
                return rev_item_recordatorio($r);
            }, $lista['items']),
        ]);
    }

    if ($method === 'POST') {
        $payload = json_decode(file_get_contents('php://input'), true);
        if (!is_array($payload)) {
            rev_api_responder(['success' => false, 'error' => 'JSON inválido'], 400);
        }
        $accion = strtolower(trim((string)($payload['accion'] ?? '')));
        $id = (int)($payload['id'] ?? 0);
        if ($id <= 0 || $accion === '') {
            rev_api_responder(['success' => false, 'error' => 'Faltan id y accion'], 400);
        }

        $reevaluacion = rev_aplicar_accion($conn, $id, $accion, $payload, $actor);
        $extra = [];
        if (isset($reevaluacion['_extra'])) {
            $extra = (array)$reevaluacion['_extra'];
            unset($reevaluacion['_extra']);
        }
        rev_api_responder(['success' => true, 'reevaluacion' => $reevaluacion] + $extra);
    }

    rev_api_responder(['success' => false, 'error' => 'Método no permitido'], 405);
} catch (RevError $e) {
    rev_api_responder(['success' => false, 'error' => $e->getMessage()], $e->getCode() >= 400 ? $e->getCode() : 400);
} catch (Throwable $e) {
    error_log('api_reevaluaciones: ' . $e->getMessage());
    rev_api_responder(['success' => false, 'error' => 'No se pudo procesar la reevaluación'], 500);
}
