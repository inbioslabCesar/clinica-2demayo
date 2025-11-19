<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php'; 

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

// Validar usuario administrador

$usuario = isset($_SESSION['usuario']) ? $_SESSION['usuario'] : null;
if (!$usuario || $usuario['rol'] !== 'administrador') {
    echo json_encode(["success" => false, "error" => "Solo el administrador puede eliminar honorarios"]);
    exit();
}

// Eliminar movimientos relacionados
try {
    $pdo->beginTransaction();
    // Obtener consulta_id y cobro_id del movimiento de honorario
    $sel = $pdo->prepare("SELECT consulta_id, cobro_id FROM honorarios_medicos_movimientos WHERE id = ? LIMIT 1");
    $sel->execute([$id]);
    $row = $sel->fetch(PDO::FETCH_ASSOC);
    $consulta_id = isset($row['consulta_id']) ? intval($row['consulta_id']) : null;
    $cobro_id = isset($row['cobro_id']) ? intval($row['cobro_id']) : null;

    // Obtener datos ANTES de eliminar el movimiento de ecografía
    $movSel = $pdo->prepare("SELECT paciente_id, fecha, tipo_servicio FROM honorarios_medicos_movimientos WHERE id = ? LIMIT 1");
    $movSel->execute([$id]);
    $movRow = $movSel->fetch(PDO::FETCH_ASSOC);
    error_log("[DEBUG] Entrando a bloque de eliminación de ecografía. movRow=" . json_encode($movRow));
    if ($movRow && $movRow['tipo_servicio'] === 'ecografia') {
        $paciente_id = $movRow['paciente_id'];
        $fecha = $movRow['fecha'];
        error_log("[DEBUG] ELIMINAR ECO paciente_id: $paciente_id, fecha: $fecha, tipo: ecografia, id_movimiento: $id");
        error_log("[DEBUG] SUGERENCIA SQL ATENCIONES: SELECT * FROM atenciones WHERE paciente_id = $paciente_id AND DATE(fecha) = '$fecha' AND servicio = 'ecografia' AND estado = 'pendiente';");
        error_log("[DEBUG] SUGERENCIA SQL INGRESOS_DIARIOS: SELECT * FROM ingresos_diarios WHERE honorario_movimiento_id = $id;");
        // SELECT de depuración antes de eliminar atenciones ecografia
        $selAtEco = $pdo->prepare("SELECT * FROM atenciones WHERE paciente_id = ? AND DATE(fecha) = ? AND servicio = 'ecografia' AND estado = 'pendiente'");
        $selAtEco->execute([$paciente_id, $fecha]);
        $rowsAtEco = $selAtEco->fetchAll(PDO::FETCH_ASSOC);
        error_log("[DEBUG] Registros atenciones ecografia encontrados: " . json_encode($rowsAtEco));
        if (count($rowsAtEco) === 0) {
            error_log("[DEBUG] NO SE ENCONTRARON registros en atenciones para paciente_id=$paciente_id, fecha=$fecha, tipo=ecografia, estado=pendiente");
        }
        $delAtEco = $pdo->prepare("DELETE FROM atenciones WHERE paciente_id = ? AND DATE(fecha) = ? AND servicio = 'ecografia' AND estado = 'pendiente'");
        $delAtEco->execute([$paciente_id, $fecha]);
        // SELECT de depuración antes de eliminar ingresos_diarios ecografia
        error_log("[DEBUG] Valores usados en WHERE ingresos_diarios: honorario_movimiento_id=$id");
        $selIngEco = $pdo->prepare("SELECT * FROM ingresos_diarios WHERE honorario_movimiento_id = ?");
        $selIngEco->execute([$id]);
        $rowsIngEco = $selIngEco->fetchAll(PDO::FETCH_ASSOC);
        error_log("[DEBUG] Registros ingresos_diarios ecografia encontrados: " . json_encode($rowsIngEco));
        if (count($rowsIngEco) === 0) {
            error_log("[DEBUG] NO SE ENCONTRARON registros en ingresos_diarios para honorario_movimiento_id=$id");
        }
        $delIngEco = $pdo->prepare("DELETE FROM ingresos_diarios WHERE honorario_movimiento_id = ?");
        $delIngEco->execute([$id]);
    }
    // Eliminar movimiento de honorario
    $delMov = $pdo->prepare("DELETE FROM honorarios_medicos_movimientos WHERE id = ?");
    $delMov->execute([$id]);

    // Eliminar cobro y detalles si existe
    if ($cobro_id) {
        $delDet = $pdo->prepare("DELETE FROM cobros_detalle WHERE cobro_id = ?");
        $delDet->execute([$cobro_id]);

        $delCobro = $pdo->prepare("DELETE FROM cobros WHERE id = ?");
        $delCobro->execute([$cobro_id]);
    }

    // Eliminar consulta médica si existe
    if ($consulta_id) {
        // Obtener datos ANTES de eliminar la consulta
        $consSel = $pdo->prepare("SELECT paciente_id, fecha FROM consultas WHERE id = ? LIMIT 1");
        $consSel->execute([$consulta_id]);
        $consRow = $consSel->fetch(PDO::FETCH_ASSOC);
        if (!$consRow) {
            error_log("[ERROR] No se encontró la consulta asociada al id $consulta_id. No se eliminarán registros en atenciones ni ingresos_diarios.");
        }
        error_log("[DEBUG] Resultado consulta: " . json_encode($consRow));
        if ($consRow) {
            $paciente_id = $consRow['paciente_id'];
            $fecha = $consRow['fecha'];
            error_log("[DEBUG] SUGERENCIA SQL ATENCIONES: SELECT * FROM atenciones WHERE paciente_id = $paciente_id AND DATE(fecha) = '$fecha' AND servicio = 'consulta';");
            error_log("[DEBUG] SUGERENCIA SQL INGRESOS_DIARIOS: SELECT * FROM ingresos_diarios WHERE paciente_id = $paciente_id AND DATE(fecha_hora) = '$fecha' AND tipo_ingreso = 'consulta';");
            error_log("[DEBUG] Valores usados en WHERE: paciente_id=" . $paciente_id . ", fecha=" . $fecha . ", tipo=consulta");
            // SELECT de depuración antes de eliminar atenciones
            $selAt = $pdo->prepare("SELECT * FROM atenciones WHERE paciente_id = ? AND DATE(fecha) = ? AND servicio = 'consulta'");
            $selAt->execute([$paciente_id, $fecha]);
            $rowsAt = $selAt->fetchAll(PDO::FETCH_ASSOC);
            error_log("[DEBUG] Registros atenciones encontrados: " . json_encode($rowsAt));
            if (count($rowsAt) === 0) {
                error_log("[DEBUG] NO SE ENCONTRARON registros en atenciones para paciente_id=$paciente_id, fecha=$fecha, tipo=consulta");
            }
            $delAt = $pdo->prepare("DELETE FROM atenciones WHERE paciente_id = ? AND DATE(fecha) = ? AND servicio = 'consulta'");
            $delAt->execute([$paciente_id, $fecha]);
            // SELECT de depuración antes de eliminar ingresos_diarios
            error_log("[DEBUG] Valores usados en WHERE ingresos_diarios: paciente_id=$paciente_id, fecha=$fecha, tipo=consulta");
            $selIng = $pdo->prepare("SELECT * FROM ingresos_diarios WHERE paciente_id = ? AND DATE(fecha_hora) = ? AND tipo_ingreso = 'consulta'");
            $selIng->execute([$paciente_id, $fecha]);
            $rowsIng = $selIng->fetchAll(PDO::FETCH_ASSOC);
            error_log("[DEBUG] Registros ingresos_diarios encontrados: " . json_encode($rowsIng));
            if (count($rowsIng) === 0) {
                error_log("[DEBUG] NO SE ENCONTRARON registros en ingresos_diarios para paciente_id=$paciente_id, fecha=$fecha, tipo=consulta");
            }
            $delIng = $pdo->prepare("DELETE FROM ingresos_diarios WHERE paciente_id = ? AND DATE(fecha_hora) = ? AND tipo_ingreso = 'consulta'");
            $delIng->execute([$paciente_id, $fecha]);
        }
        // Eliminar consulta médica después de obtener los datos
        error_log("[DEBUG] Entrando a bloque de eliminación de consulta. consulta_id=$consulta_id");
        $delCons = $pdo->prepare("DELETE FROM consultas WHERE id = ?");
        $delCons->execute([$consulta_id]);
    }
    // Eliminar ingreso diario de ecografia si corresponde
    // Obtener datos ANTES de eliminar el movimiento de ecografía
    $movSel = $pdo->prepare("SELECT paciente_id, fecha, tipo_servicio FROM honorarios_medicos_movimientos WHERE id = ? LIMIT 1");
    $movSel->execute([$id]);
    $movRow = $movSel->fetch(PDO::FETCH_ASSOC);
    error_log("[DEBUG] Entrando a bloque de eliminación de ecografía. movRow=" . json_encode($movRow));
    if ($movRow && $movRow['tipo_servicio'] === 'ecografia') {
        $paciente_id = $movRow['paciente_id'];
        $fecha = $movRow['fecha'];
        error_log("[DEBUG] ELIMINAR ECO paciente_id: $paciente_id, fecha: $fecha, tipo: ecografia");
        error_log("[DEBUG] SUGERENCIA SQL ATENCIONES: SELECT * FROM atenciones WHERE paciente_id = $paciente_id AND DATE(fecha) = '$fecha' AND servicio = 'ecografia';");
        error_log("[DEBUG] SUGERENCIA SQL INGRESOS_DIARIOS: SELECT * FROM ingresos_diarios WHERE paciente_id = $paciente_id AND DATE(fecha_hora) = '$fecha' AND tipo_ingreso = 'ecografia';");
        // SELECT de depuración antes de eliminar atenciones ecografia
        $selAtEco = $pdo->prepare("SELECT * FROM atenciones WHERE paciente_id = ? AND DATE(fecha) = ? AND servicio = 'ecografia'");
        $selAtEco->execute([$paciente_id, $fecha]);
        $rowsAtEco = $selAtEco->fetchAll(PDO::FETCH_ASSOC);
        error_log("[DEBUG] Registros atenciones ecografia encontrados: " . json_encode($rowsAtEco));
        if (count($rowsAtEco) === 0) {
            error_log("[DEBUG] NO SE ENCONTRARON registros en atenciones para paciente_id=$paciente_id, fecha=$fecha, tipo=ecografia");
        }
        $delAtEco = $pdo->prepare("DELETE FROM atenciones WHERE paciente_id = ? AND DATE(fecha) = ? AND servicio = 'ecografia'");
        $delAtEco->execute([$paciente_id, $fecha]);
        // SELECT de depuración antes de eliminar ingresos_diarios ecografia
        error_log("[DEBUG] Valores usados en WHERE ingresos_diarios: paciente_id=$paciente_id, fecha=$fecha, tipo=ecografia");
        $selIngEco = $pdo->prepare("SELECT * FROM ingresos_diarios WHERE paciente_id = ? AND DATE(fecha_hora) = ? AND tipo_ingreso = 'ecografia'");
        $selIngEco->execute([$paciente_id, $fecha]);
        $rowsIngEco = $selIngEco->fetchAll(PDO::FETCH_ASSOC);
        error_log("[DEBUG] Registros ingresos_diarios ecografia encontrados: " . json_encode($rowsIngEco));
        if (count($rowsIngEco) === 0) {
            error_log("[DEBUG] NO SE ENCONTRARON registros en ingresos_diarios para paciente_id=$paciente_id, fecha=$fecha, tipo=ecografia");
        }
        $delIngEco = $pdo->prepare("DELETE FROM ingresos_diarios WHERE paciente_id = ? AND DATE(fecha_hora) = ? AND tipo_ingreso = 'ecografia'");
        $delIngEco->execute([$paciente_id, $fecha]);
    }

    // Actualizar ingresos_diarios (poner honorario_movimiento_id a NULL)
    $updIng = $pdo->prepare("UPDATE ingresos_diarios SET honorario_movimiento_id = NULL WHERE honorario_movimiento_id = ?");
    $updIng->execute([$id]);

    $pdo->commit();
    echo json_encode(["success" => true]);
} catch (Exception $e) {
    $pdo->rollBack();
    echo json_encode(["success" => false, "error" => "Error al eliminar: " . $e->getMessage()]);
}

