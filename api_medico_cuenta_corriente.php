<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function horas_disponibilidad_sql(): string {
    return "CASE
        WHEN TIME_TO_SEC(hora_fin) > TIME_TO_SEC(hora_inicio)
            THEN (TIME_TO_SEC(hora_fin) - TIME_TO_SEC(hora_inicio)) / 3600.0
        ELSE 0
    END";
}

function ensure_medico_finanzas_tables($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS medico_condiciones_pago (
        id INT AUTO_INCREMENT PRIMARY KEY,
        medico_id INT NOT NULL,
        modalidad_pago ENUM('acto','hora') NOT NULL DEFAULT 'acto',
        monto_hora DECIMAL(10,2) DEFAULT NULL,
        frecuencia_pago ENUM('quincenal','mensual') NOT NULL DEFAULT 'mensual',
        permite_adelanto TINYINT(1) NOT NULL DEFAULT 0,
        tope_adelanto_periodo DECIMAL(10,2) DEFAULT NULL,
        vigencia_desde DATE NOT NULL DEFAULT (CURDATE()),
        vigencia_hasta DATE DEFAULT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_medico_activo (medico_id, activo),
        KEY idx_medico (medico_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $conn->query("CREATE TABLE IF NOT EXISTS medico_adelantos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        medico_id INT NOT NULL,
        fecha DATE NOT NULL,
        monto DECIMAL(10,2) NOT NULL,
        motivo VARCHAR(255) DEFAULT NULL,
        observaciones TEXT DEFAULT NULL,
        usuario_id INT DEFAULT NULL,
        estado ENUM('activo','anulado') NOT NULL DEFAULT 'activo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_medico_fecha (medico_id, fecha),
        KEY idx_estado (estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function get_periodo_actual($frecuencia) {
    $today = new DateTime('now', new DateTimeZone('America/Lima'));
    $anio = intval($today->format('Y'));
    $mes = intval($today->format('m'));
    $dia = intval($today->format('d'));

    if ($frecuencia === 'quincenal') {
        if ($dia <= 15) {
            $inicio = sprintf('%04d-%02d-01', $anio, $mes);
            $fin = sprintf('%04d-%02d-15', $anio, $mes);
        } else {
            $inicio = sprintf('%04d-%02d-16', $anio, $mes);
            $ultimoDia = intval($today->format('t'));
            $fin = sprintf('%04d-%02d-%02d', $anio, $mes, $ultimoDia);
        }
        return [$inicio, $fin];
    }

    $inicio = sprintf('%04d-%02d-01', $anio, $mes);
    $ultimoDia = intval($today->format('t'));
    $fin = sprintf('%04d-%02d-%02d', $anio, $mes, $ultimoDia);
    return [$inicio, $fin];
}

function get_user_role() {
    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
        return $_SESSION['usuario']['rol'] ?? '';
    }
    if (isset($_SESSION['medico_id'])) {
        return 'medico';
    }
    return '';
}

function ensure_authenticated() {
    if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }
}

ensure_medico_finanzas_tables($conn);
ensure_authenticated();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $medicoId = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : 0;
    if ($medicoId <= 0) {
        echo json_encode(['success' => false, 'error' => 'medico_id requerido']);
        exit;
    }

    $usuarioSesion = $_SESSION['usuario'] ?? null;
    $rolSesion = is_array($usuarioSesion) ? ($usuarioSesion['rol'] ?? '') : '';
    $esSesionMedico = ($rolSesion === 'medico') || (!isset($_SESSION['usuario']) && isset($_SESSION['medico_id']));

    if ($esSesionMedico) {
        $medicoSesionId = intval($usuarioSesion['id'] ?? ($_SESSION['medico_id'] ?? 0));
        if ($medicoSesionId > 0 && $medicoSesionId !== $medicoId) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado para consultar otro médico']);
            exit;
        }
    }

    $stmtMed = $conn->prepare('SELECT id, nombre, apellido, especialidad FROM medicos WHERE id = ? LIMIT 1');
    $stmtMed->bind_param('i', $medicoId);
    $stmtMed->execute();
    $medico = $stmtMed->get_result()->fetch_assoc();
    $stmtMed->close();

    if (!$medico) {
        echo json_encode(['success' => false, 'error' => 'Médico no encontrado']);
        exit;
    }

    $stmtCond = $conn->prepare("SELECT modalidad_pago, monto_hora, frecuencia_pago, permite_adelanto, tope_adelanto_periodo, vigencia_desde, vigencia_hasta
                                FROM medico_condiciones_pago
                                WHERE medico_id = ? AND activo = 1
                                ORDER BY updated_at DESC
                                LIMIT 1");
    $stmtCond->bind_param('i', $medicoId);
    $stmtCond->execute();
    $condiciones = $stmtCond->get_result()->fetch_assoc();
    $stmtCond->close();

    if (!$condiciones) {
        $condiciones = [
            'modalidad_pago' => 'acto',
            'monto_hora' => null,
            'frecuencia_pago' => 'mensual',
            'permite_adelanto' => 0,
            'tope_adelanto_periodo' => null,
            'vigencia_desde' => date('Y-m-d'),
            'vigencia_hasta' => null,
        ];
    }

    [$periodoInicio, $periodoFin] = get_periodo_actual($condiciones['frecuencia_pago'] === 'quincenal' ? 'quincenal' : 'mensual');

    $esModalidadHora = ($condiciones['modalidad_pago'] === 'hora') && (floatval($condiciones['monto_hora'] ?? 0) > 0);
    $today = (new DateTime('now', new DateTimeZone('America/Lima')))->format('Y-m-d');

    // — Devengado por hora (desde disponibilidad_medicos) —
    $horasTotalHistorico    = 0.0;
    $horasPeriodoHastaHoy   = 0.0;
    $devengadoHoraTotal     = 0.0;
    $devengadoHoraPeriodo   = 0.0;

    if ($esModalidadHora) {
        $horasExpr = horas_disponibilidad_sql();
        // Total histórico (sin límite de periodo, solo hasta hoy)
        $stmtHT = $conn->prepare(
            "SELECT COALESCE(SUM($horasExpr), 0) AS horas
             FROM disponibilidad_medicos
             WHERE medico_id = ? AND fecha <= ?"
        );
        $stmtHT->bind_param('is', $medicoId, $today);
        $stmtHT->execute();
        $horasTotalHistorico = floatval($stmtHT->get_result()->fetch_assoc()['horas'] ?? 0);
        $stmtHT->close();

        // Del periodo actual hasta hoy
        $stmtHP = $conn->prepare(
            "SELECT COALESCE(SUM($horasExpr), 0) AS horas
             FROM disponibilidad_medicos
             WHERE medico_id = ? AND fecha >= ? AND fecha <= ?"
        );
        $periodoHastaHoy = min($periodoFin, $today);
        $stmtHP->bind_param('iss', $medicoId, $periodoInicio, $periodoHastaHoy);
        $stmtHP->execute();
        $horasPeriodoHastaHoy = floatval($stmtHP->get_result()->fetch_assoc()['horas'] ?? 0);
        $stmtHP->close();

        $montoHora = floatval($condiciones['monto_hora']);
        $devengadoHoraTotal   = round($horasTotalHistorico * $montoHora, 2);
        $devengadoHoraPeriodo = round($horasPeriodoHastaHoy * $montoHora, 2);
    }

    // — Honorarios por acto (honorarios_medicos_movimientos) —
    $stmtPen = $conn->prepare("SELECT COALESCE(SUM(monto_medico), 0) AS total
                               FROM honorarios_medicos_movimientos
                               WHERE medico_id = ? AND estado_pago_medico = 'pendiente'");
    $stmtPen->bind_param('i', $medicoId);
    $stmtPen->execute();
    $pendienteActoTotal = floatval(($stmtPen->get_result()->fetch_assoc()['total'] ?? 0));
    $stmtPen->close();

    $stmtPenPer = $conn->prepare("SELECT COALESCE(SUM(monto_medico), 0) AS total
                                  FROM honorarios_medicos_movimientos
                                  WHERE medico_id = ? AND estado_pago_medico = 'pendiente' AND fecha BETWEEN ? AND ?");
    $stmtPenPer->bind_param('iss', $medicoId, $periodoInicio, $periodoFin);
    $stmtPenPer->execute();
    $pendienteActoPeriodo = floatval(($stmtPenPer->get_result()->fetch_assoc()['total'] ?? 0));
    $stmtPenPer->close();

    // Pendiente total = devengado hora (si aplica) + honorarios por acto
    $pendienteTotal  = $esModalidadHora ? ($devengadoHoraTotal  + $pendienteActoTotal)  : $pendienteActoTotal;
    $pendientePeriodo= $esModalidadHora ? ($devengadoHoraPeriodo + $pendienteActoPeriodo): $pendienteActoPeriodo;

    // — Adelantos —
    $stmtAde = $conn->prepare("SELECT COALESCE(SUM(monto), 0) AS total
                               FROM medico_adelantos
                               WHERE medico_id = ? AND estado = 'activo'");
    $stmtAde->bind_param('i', $medicoId);
    $stmtAde->execute();
    $adelantosActivos = floatval(($stmtAde->get_result()->fetch_assoc()['total'] ?? 0));
    $stmtAde->close();

    $stmtAdePer = $conn->prepare("SELECT COALESCE(SUM(monto), 0) AS total
                                  FROM medico_adelantos
                                  WHERE medico_id = ? AND estado = 'activo' AND fecha BETWEEN ? AND ?");
    $stmtAdePer->bind_param('iss', $medicoId, $periodoInicio, $periodoFin);
    $stmtAdePer->execute();
    $adelantosPeriodo = floatval(($stmtAdePer->get_result()->fetch_assoc()['total'] ?? 0));
    $stmtAdePer->close();

    $deudaNeta       = round($pendienteTotal   - $adelantosActivos,   2);
    $deudaNetaPeriodo= round($pendientePeriodo - $adelantosPeriodo,   2);

    // Máximo adelanto disponible hoy (para UI)
    $disponibleParaAdelanto = max(0, round($pendientePeriodo - $adelantosPeriodo, 2));

    // — Bloques de disponibilidad del periodo actual (para mostrar en UI) —
    $bloquesDisponibilidad = [];
    if ($esModalidadHora) {
        $stmtBloq = $conn->prepare(
            "SELECT fecha, hora_inicio, hora_fin,
                    ROUND($horasExpr, 2) AS horas
             FROM disponibilidad_medicos
             WHERE medico_id = ? AND fecha BETWEEN ? AND ?
             ORDER BY fecha ASC"
        );
        $stmtBloq->bind_param('iss', $medicoId, $periodoInicio, $periodoFin);
        $stmtBloq->execute();
        $rsBloq = $stmtBloq->get_result();
        while ($b = $rsBloq->fetch_assoc()) {
            $b['ya_pasado'] = ($b['fecha'] <= $today);
            $bloquesDisponibilidad[] = $b;
        }
        $stmtBloq->close();
    }

    // — Lista de adelantos —
    $stmtMov = $conn->prepare("SELECT id, fecha, monto, motivo, estado, created_at
                               FROM medico_adelantos
                               WHERE medico_id = ?
                               ORDER BY fecha DESC, id DESC
                               LIMIT 100");
    $stmtMov->bind_param('i', $medicoId);
    $stmtMov->execute();
    $rsMov = $stmtMov->get_result();
    $adelantos = [];
    while ($r = $rsMov->fetch_assoc()) {
        $adelantos[] = $r;
    }
    $stmtMov->close();

    echo json_encode([
        'success' => true,
        'medico' => $medico,
        'condiciones_pago' => $condiciones,
        'periodo_actual' => [
            'inicio' => $periodoInicio,
            'fin' => $periodoFin,
            'hoy' => $today,
        ],
        'resumen' => [
            // Modalidad hora
            'modalidad_hora'                => $esModalidadHora,
            'horas_trabajadas_total'        => round($horasTotalHistorico, 2),
            'horas_trabajadas_periodo'      => round($horasPeriodoHastaHoy, 2),
            'devengado_hora_total'          => $devengadoHoraTotal,
            'devengado_hora_periodo'        => $devengadoHoraPeriodo,
            // Honorarios por acto (siempre presente)
            'pendiente_honorarios_acto_total'   => round($pendienteActoTotal, 2),
            'pendiente_honorarios_acto_periodo' => round($pendienteActoPeriodo, 2),
            // Totales combinados
            'pendiente_honorarios_total'    => round($pendienteTotal, 2),
            'adelantos_activos_total'       => round($adelantosActivos, 2),
            'deuda_neta_total'              => $deudaNeta,
            'saldo_a_favor_clinica_total'   => $deudaNeta < 0 ? abs($deudaNeta) : 0,
            'pendiente_honorarios_periodo'  => round($pendientePeriodo, 2),
            'adelantos_periodo'             => round($adelantosPeriodo, 2),
            'deuda_neta_periodo'            => $deudaNetaPeriodo,
            'saldo_a_favor_clinica_periodo' => $deudaNetaPeriodo < 0 ? abs($deudaNetaPeriodo) : 0,
            // Tope para adelanto
            'disponible_para_adelanto'      => $disponibleParaAdelanto,
        ],
        'bloques_disponibilidad' => $bloquesDisponibilidad,
        'adelantos' => $adelantos,
    ]);
    exit;
}

if ($method === 'POST') {
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Operación permitida solo para usuarios internos']);
        exit;
    }

    $rol = get_user_role();
    if ($rol !== 'administrador' && $rol !== 'recepcionista') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'No autorizado para registrar adelantos']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $accion = $data['accion'] ?? 'registrar_adelanto';

    if ($accion === 'anular_adelanto') {
        if ($rol !== 'administrador') {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Solo administrador puede anular adelantos']);
            exit;
        }
        $id = intval($data['id'] ?? 0);
        if ($id <= 0) {
            echo json_encode(['success' => false, 'error' => 'id requerido']);
            exit;
        }
        $stmt = $conn->prepare("UPDATE medico_adelantos SET estado = 'anulado' WHERE id = ?");
        $stmt->bind_param('i', $id);
        $ok = $stmt->execute();
        $stmt->close();
        echo json_encode(['success' => $ok]);
        exit;
    }

    $medicoId = intval($data['medico_id'] ?? 0);
    $monto = isset($data['monto']) ? round(floatval($data['monto']), 2) : 0;
    $fecha = !empty($data['fecha']) ? $data['fecha'] : date('Y-m-d');
    $motivo = trim((string)($data['motivo'] ?? 'Adelanto de honorarios'));
    $observaciones = trim((string)($data['observaciones'] ?? ''));

    if ($medicoId <= 0 || $monto <= 0) {
        echo json_encode(['success' => false, 'error' => 'medico_id y monto son requeridos']);
        exit;
    }

    $stmtCond = $conn->prepare("SELECT frecuencia_pago, permite_adelanto, tope_adelanto_periodo
                                FROM medico_condiciones_pago
                                WHERE medico_id = ? AND activo = 1
                                ORDER BY updated_at DESC LIMIT 1");
    $stmtCond->bind_param('i', $medicoId);
    $stmtCond->execute();
    $cond = $stmtCond->get_result()->fetch_assoc();
    $stmtCond->close();

    if (!$cond) {
        echo json_encode(['success' => false, 'error' => 'Debe configurar condiciones de pago del médico antes de registrar adelantos']);
        exit;
    }

    if (intval($cond['permite_adelanto'] ?? 0) !== 1) {
        echo json_encode(['success' => false, 'error' => 'Este médico no tiene habilitado adelantos']);
        exit;
    }

    [$periodoInicio, $periodoFin] = get_periodo_actual(($cond['frecuencia_pago'] ?? 'mensual') === 'quincenal' ? 'quincenal' : 'mensual');

    $stmtSum = $conn->prepare("SELECT COALESCE(SUM(monto), 0) AS total
                               FROM medico_adelantos
                               WHERE medico_id = ? AND estado = 'activo' AND fecha BETWEEN ? AND ?");
    $stmtSum->bind_param('iss', $medicoId, $periodoInicio, $periodoFin);
    $stmtSum->execute();
    $adelantosPeriodo = floatval(($stmtSum->get_result()->fetch_assoc()['total'] ?? 0));
    $stmtSum->close();

    $tope = isset($cond['tope_adelanto_periodo']) ? floatval($cond['tope_adelanto_periodo']) : 0;
    if ($tope > 0 && ($adelantosPeriodo + $monto) > $tope) {
        echo json_encode([
            'success' => false,
            'error' => 'El adelanto supera el tope configurado para el periodo',
            'detalle' => [
                'tope_periodo' => round($tope, 2),
                'adelantos_periodo_actual' => round($adelantosPeriodo, 2),
                'monto_intentado' => round($monto, 2),
            ]
        ]);
        exit;
    }

    // — Validar contra devengado acumulado para médicos por hora —
    $condFullStmt = $conn->prepare("SELECT modalidad_pago, monto_hora, frecuencia_pago FROM medico_condiciones_pago WHERE medico_id = ? AND activo = 1 LIMIT 1");
    $condFullStmt->bind_param('i', $medicoId);
    $condFullStmt->execute();
    $condFull = $condFullStmt->get_result()->fetch_assoc();
    $condFullStmt->close();

    if (($condFull['modalidad_pago'] ?? 'acto') === 'hora') {
        $horasExpr = horas_disponibilidad_sql();
        $montoHora = floatval($condFull['monto_hora'] ?? 0);
        $todayStr  = (new DateTime('now', new DateTimeZone('America/Lima')))->format('Y-m-d');
        $stmtHoras = $conn->prepare(
            "SELECT COALESCE(SUM($horasExpr), 0) AS horas
             FROM disponibilidad_medicos WHERE medico_id = ? AND fecha >= ? AND fecha <= ?"
        );
        $stmtHoras->bind_param('iss', $medicoId, $periodoInicio, $todayStr);
        $stmtHoras->execute();
        $horasHasta = floatval($stmtHoras->get_result()->fetch_assoc()['horas'] ?? 0);
        $stmtHoras->close();

        $devengadoHastaHoy = round($horasHasta * $montoHora, 2);
        $disponibleHoy = max(0, $devengadoHastaHoy - $adelantosPeriodo);

        if ($monto > $disponibleHoy) {
            echo json_encode([
                'success' => false,
                'error' => 'El adelanto supera el monto devengado hasta hoy',
                'detalle' => [
                    'devengado_hasta_hoy' => $devengadoHastaHoy,
                    'adelantos_ya_dados'  => round($adelantosPeriodo, 2),
                    'disponible_adelanto' => $disponibleHoy,
                    'monto_intentado'     => round($monto, 2),
                ]
            ]);
            exit;
        }
    }

    // — Obtener nombre del médico para el egreso —
    $stmtNomMed = $conn->prepare('SELECT CONCAT(nombre, " ", apellido) AS nombre_completo FROM medicos WHERE id = ? LIMIT 1');
    $stmtNomMed->bind_param('i', $medicoId);
    $stmtNomMed->execute();
    $nombreMedico = $stmtNomMed->get_result()->fetch_assoc()['nombre_completo'] ?? "Médico #$medicoId";
    $stmtNomMed->close();

    $usuarioId   = intval($_SESSION['usuario']['id'] ?? 0);
    $stmtIn = $conn->prepare("INSERT INTO medico_adelantos (medico_id, fecha, monto, motivo, observaciones, usuario_id, estado)
                              VALUES (?, ?, ?, ?, ?, ?, 'activo')");
    $stmtIn->bind_param('isdssi', $medicoId, $fecha, $monto, $motivo, $observaciones, $usuarioId);
    $ok = $stmtIn->execute();
    $newId = $ok ? intval($stmtIn->insert_id) : 0;
    $stmtIn->close();

    // — Registrar como egreso —
    if ($ok) {
        $turno       = $_SESSION['usuario']['turno'] ?? 'mañana';
        $responsable = $_SESSION['usuario']['nombre'] ?? '';
        $descEgreso  = "Adelanto de honorarios - $nombreMedico";
        $conceptoEgreso = $motivo ?: "Adelanto honorarios";

        // Buscar caja abierta del usuario en el día
        $stmtCaja = $pdo->prepare('SELECT id FROM cajas WHERE DATE(fecha) = ? AND usuario_id = ? AND estado = "abierta" ORDER BY hora_apertura ASC LIMIT 1');
        $stmtCaja->execute([$fecha, $usuarioId]);
        $cajaRow = $stmtCaja->fetch(PDO::FETCH_ASSOC);
        $cajaId = $cajaRow ? intval($cajaRow['id']) : null;

        $horaEgreso = (new DateTime('now', new DateTimeZone('America/Lima')))->format('H:i:s');
        $stmtEgreso = $pdo->prepare(
            "INSERT INTO egresos (fecha, tipo, tipo_egreso, categoria, descripcion, concepto, monto, metodo_pago,
                                  usuario_id, turno, estado, caja_id, observaciones, hora, responsable)
             VALUES (?, 'administrativo', 'honorario_medico', 'Adelanto Médico', ?, ?, ?, 'efectivo',
                     ?, ?, 'pagado', ?, ?, ?, ?)"
        );
        $stmtEgreso->execute([
            $fecha,
            $descEgreso,
            $conceptoEgreso,
            round($monto, 2),
            $usuarioId,
            $turno,
            $cajaId,
            $observaciones,
            $horaEgreso,
            $responsable,
        ]);
        $egresoId = intval($pdo->lastInsertId());
    }

    echo json_encode(['success' => $ok, 'id' => $newId, 'egreso_id' => $egresoId ?? null]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
