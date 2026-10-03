<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/CotizacionSyncService.php';
require_once __DIR__ . '/modules/AtencionModule.php';

// Solo permitir método POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "error" => "Método no permitido"]);
    exit();
}

// Leer datos JSON
$input = json_decode(file_get_contents('php://input'), true);
$id = isset($input['id']) ? intval($input['id']) : 0;
if (!$id) {
    echo json_encode(["success" => false, "error" => "ID de honorario no recibido"]);
    exit();
}
$motivo = trim((string)($input['motivo'] ?? ''));
if ($motivo === '') {
    echo json_encode(["success" => false, "error" => "Debes indicar el motivo de la anulación"]);
    exit();
}

// Validar usuario administrador
$usuario = isset($_SESSION['usuario']) ? $_SESSION['usuario'] : null;
if (!$usuario || $usuario['rol'] !== 'administrador') {
    echo json_encode(["success" => false, "error" => "Solo el administrador puede anular honorarios"]);
    exit();
}
$usuarioId = (int)($usuario['id'] ?? 0);

// Anulación (no eliminación física): esto preserva el rastro contable del
// cobro/ingreso de caja y el historial clínico de la consulta, en lugar de
// borrarlos como hacía la versión anterior de este endpoint.
//
// Nota: todo el flujo usa mysqli ($conn), la misma conexión que usan
// CotizacionSyncService y AtencionModule. No mezclar aquí con $pdo: son
// conexiones distintas y una transacción en una no protege escrituras
// hechas en la otra.
try {
    $conn->begin_transaction();

    $sel = $conn->prepare(
        "SELECT id, consulta_id, cobro_id, paciente_id, fecha, tipo_servicio, estado_pago_medico
         FROM honorarios_medicos_movimientos WHERE id = ? LIMIT 1 FOR UPDATE"
    );
    $sel->bind_param('i', $id);
    $sel->execute();
    $honorario = $sel->get_result()->fetch_assoc();

    if (!$honorario) {
        $conn->rollback();
        echo json_encode(["success" => false, "error" => "No se encontró el honorario indicado"]);
        exit();
    }
    if (($honorario['estado_pago_medico'] ?? '') === 'cancelado') {
        $conn->rollback();
        echo json_encode(["success" => false, "error" => "Este honorario ya había sido anulado anteriormente"]);
        exit();
    }
    if (($honorario['estado_pago_medico'] ?? '') === 'pagado') {
        // Este endpoint solo revierte el cobro/caja/cotización, no el pago ya
        // entregado al médico (registrado en `egresos`). Anularlo aquí dejaría
        // ese egreso sin reversar: dinero que salió de caja sin contraparte.
        $conn->rollback();
        echo json_encode(["success" => false, "error" => "Este honorario ya fue liquidado al médico. Debes revertir primero ese pago antes de poder anularlo."]);
        exit();
    }

    $consultaId = intval($honorario['consulta_id'] ?? 0) ?: null;
    $cobroId = intval($honorario['cobro_id'] ?? 0) ?: null;
    $pacienteId = intval($honorario['paciente_id'] ?? 0) ?: null;
    $fecha = $honorario['fecha'] ?? null;
    $tipoServicio = (string)($honorario['tipo_servicio'] ?? '');

    $reversa = ['cobro_afectado' => false, 'reversas_ingreso' => 0, 'stock_restaurado' => 0];
    if ($cobroId) {
        $reversa = CotizacionSyncService::reversarCobroPorId($conn, $cobroId, $usuarioId, $motivo, $id);
    }

    if ($consultaId) {
        $stmtCons = $conn->prepare("UPDATE consultas SET estado = 'cancelada' WHERE id = ? AND estado <> 'cancelada'");
        $stmtCons->bind_param('i', $consultaId);
        $stmtCons->execute();
    }

    $atencionesAnuladas = AtencionModule::anularAtencionesPorCobro($conn, $cobroId, $pacienteId, $fecha, $tipoServicio);

    $stmtHon = $conn->prepare(
        "UPDATE honorarios_medicos_movimientos
         SET estado_pago_medico = 'cancelado',
             observaciones = CONCAT(COALESCE(observaciones, ''), ' | ANULADO: ', ?)
         WHERE id = ?"
    );
    $stmtHon->bind_param('si', $motivo, $id);
    $stmtHon->execute();

    $conn->commit();
    echo json_encode([
        "success" => true,
        "cobro_anulado" => (bool)($reversa['cobro_afectado'] ?? false),
        "reversas_ingreso" => (int)($reversa['reversas_ingreso'] ?? 0),
        "stock_restaurado" => (int)($reversa['stock_restaurado'] ?? 0),
        "cotizaciones_afectadas" => (int)($reversa['cotizaciones_afectadas'] ?? 0),
        "consulta_anulada" => (bool)$consultaId,
        "atenciones_anuladas" => (int)$atencionesAnuladas,
    ]);
} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["success" => false, "error" => "Error al anular: " . $e->getMessage()]);
}
