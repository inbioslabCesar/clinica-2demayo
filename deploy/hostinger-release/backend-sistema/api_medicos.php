<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function ensure_medico_condiciones_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS medico_condiciones_pago (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    $conn->query($sql);
}

function ensure_medicos_profesional_columns($conn) {
    $checks = [
        'tipo_profesional' => "ALTER TABLE medicos ADD COLUMN tipo_profesional VARCHAR(30) NOT NULL DEFAULT 'medico'",
        'abreviatura_profesional' => "ALTER TABLE medicos ADD COLUMN abreviatura_profesional VARCHAR(20) NOT NULL DEFAULT 'Dr(a).'",
        'colegio_sigla' => "ALTER TABLE medicos ADD COLUMN colegio_sigla VARCHAR(20) NULL",
        'nro_colegiatura' => "ALTER TABLE medicos ADD COLUMN nro_colegiatura VARCHAR(30) NULL",
    ];

    foreach ($checks as $col => $sqlAlter) {
        $exists = $conn->query("SHOW COLUMNS FROM medicos LIKE '{$col}'");
        if ($exists && $exists->num_rows === 0) {
            $conn->query($sqlAlter);
        }
    }
}

function normalizar_tipo_profesional($tipoRaw) {
    $tipo = strtolower(trim((string)$tipoRaw));
    $allowed = ['medico', 'psicologo', 'obstetra', 'odontologo', 'nutricionista', 'enfermeria', 'otro'];
    return in_array($tipo, $allowed, true) ? $tipo : 'medico';
}

function abreviatura_por_tipo($tipoProfesional) {
    $map = [
        'medico' => 'Dr(a).',
        'psicologo' => 'Psic.',
        'obstetra' => 'Obst.',
        'odontologo' => 'Od.',
        'nutricionista' => 'Nut.',
        'enfermeria' => 'Lic.',
        'otro' => 'Prof.',
    ];
    return $map[$tipoProfesional] ?? 'Dr(a).';
}

function normalizar_condiciones_pago($data) {
    $modalidad = ($data['modalidad_pago'] ?? 'acto') === 'hora' ? 'hora' : 'acto';
    $frecuencia = ($data['frecuencia_pago'] ?? 'mensual') === 'quincenal' ? 'quincenal' : 'mensual';
    $permiteAdelanto = !empty($data['permite_adelanto']) ? 1 : 0;
    $montoHora = isset($data['monto_hora']) && $data['monto_hora'] !== '' ? round(floatval($data['monto_hora']), 2) : null;
    $topeAdelanto = isset($data['tope_adelanto_periodo']) && $data['tope_adelanto_periodo'] !== '' ? round(floatval($data['tope_adelanto_periodo']), 2) : null;
    $vigenciaDesde = !empty($data['vigencia_desde']) ? $data['vigencia_desde'] : date('Y-m-d');
    $vigenciaHasta = !empty($data['vigencia_hasta']) ? $data['vigencia_hasta'] : null;

    if ($modalidad === 'hora' && ($montoHora === null || $montoHora <= 0)) {
        return [null, 'Para modalidad por hora debe configurar un monto por hora válido'];
    }
    if ($topeAdelanto !== null && $topeAdelanto < 0) {
        return [null, 'El tope de adelanto no puede ser negativo'];
    }

    return [[
        'modalidad_pago' => $modalidad,
        'monto_hora' => $montoHora,
        'frecuencia_pago' => $frecuencia,
        'permite_adelanto' => $permiteAdelanto,
        'tope_adelanto_periodo' => $topeAdelanto,
        'vigencia_desde' => $vigenciaDesde,
        'vigencia_hasta' => $vigenciaHasta,
        'activo' => 1,
    ], null];
}

function upsert_condiciones_pago($conn, $medicoId, $condiciones) {
    $stmt = $conn->prepare('SELECT id FROM medico_condiciones_pago WHERE medico_id = ? AND activo = 1 LIMIT 1');
    $stmt->bind_param('i', $medicoId);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($existing) {
        $sql = 'UPDATE medico_condiciones_pago SET modalidad_pago=?, monto_hora=?, frecuencia_pago=?, permite_adelanto=?, tope_adelanto_periodo=?, vigencia_desde=?, vigencia_hasta=?, activo=1 WHERE id=?';
        $stmtUp = $conn->prepare($sql);
        $stmtUp->bind_param(
            'sdsidssi',
            $condiciones['modalidad_pago'],
            $condiciones['monto_hora'],
            $condiciones['frecuencia_pago'],
            $condiciones['permite_adelanto'],
            $condiciones['tope_adelanto_periodo'],
            $condiciones['vigencia_desde'],
            $condiciones['vigencia_hasta'],
            $existing['id']
        );
        $stmtUp->execute();
        $stmtUp->close();
        return;
    }

    $sql = 'INSERT INTO medico_condiciones_pago (medico_id, modalidad_pago, monto_hora, frecuencia_pago, permite_adelanto, tope_adelanto_periodo, vigencia_desde, vigencia_hasta, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)';
    $stmtIn = $conn->prepare($sql);
    $stmtIn->bind_param(
        'isdsidss',
        $medicoId,
        $condiciones['modalidad_pago'],
        $condiciones['monto_hora'],
        $condiciones['frecuencia_pago'],
        $condiciones['permite_adelanto'],
        $condiciones['tope_adelanto_periodo'],
        $condiciones['vigencia_desde'],
        $condiciones['vigencia_hasta']
    );
    $stmtIn->execute();
    $stmtIn->close();
}

ensure_medico_condiciones_table($conn);
ensure_medicos_profesional_columns($conn);

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Listar médicos
        $sql = "SELECT m.*, c.modalidad_pago, c.monto_hora, c.frecuencia_pago, c.permite_adelanto,
                       c.tope_adelanto_periodo, c.vigencia_desde, c.vigencia_hasta
                FROM medicos m
                LEFT JOIN medico_condiciones_pago c ON c.medico_id = m.id AND c.activo = 1";
        $res = $conn->query($sql);
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            if (!isset($row['modalidad_pago']) || !$row['modalidad_pago']) {
                $row['modalidad_pago'] = 'acto';
            }
            if (!isset($row['frecuencia_pago']) || !$row['frecuencia_pago']) {
                $row['frecuencia_pago'] = 'mensual';
            }
            $row['tipo_profesional'] = $row['tipo_profesional'] ?? 'medico';
            if (!isset($row['abreviatura_profesional']) || trim((string)$row['abreviatura_profesional']) === '') {
                $row['abreviatura_profesional'] = abreviatura_por_tipo($row['tipo_profesional']);
            }
            if (!isset($row['nro_colegiatura']) || trim((string)$row['nro_colegiatura']) === '') {
                $row['nro_colegiatura'] = $row['cmp'] ?? '';
            }
            if (!isset($row['colegio_sigla']) || trim((string)$row['colegio_sigla']) === '') {
                $row['colegio_sigla'] = ($row['tipo_profesional'] ?? 'medico') === 'medico' ? 'CMP' : '';
            }
            $row['permite_adelanto'] = intval($row['permite_adelanto'] ?? 0);
            $rows[] = $row;
        }
        echo json_encode(['success' => true, 'medicos' => $rows]);
        exit;
    case 'POST':
        // Crear médico
        $data = json_decode(file_get_contents('php://input'), true);
        $nombre = $data['nombre'] ?? null;
        $apellido = $data['apellido'] ?? null;
        $especialidad = $data['especialidad'] ?? null;
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        $cmp = $data['cmp'] ?? null;
        $rne = $data['rne'] ?? null;
        $firma = $data['firma'] ?? null;
        $tipo_profesional = normalizar_tipo_profesional($data['tipo_profesional'] ?? 'medico');
        $abreviatura_profesional = trim((string)($data['abreviatura_profesional'] ?? ''));
        $colegio_sigla = strtoupper(trim((string)($data['colegio_sigla'] ?? '')));
        $nro_colegiatura = trim((string)($data['nro_colegiatura'] ?? ''));

        if ($cmp === null) $cmp = '';
        $cmp = trim((string)$cmp);
        if ($cmp === '' && $nro_colegiatura !== '') $cmp = $nro_colegiatura;
        if ($nro_colegiatura === '' && $cmp !== '') $nro_colegiatura = $cmp;
        if ($abreviatura_profesional === '') {
            $abreviatura_profesional = abreviatura_por_tipo($tipo_profesional);
        }
        if ($colegio_sigla === '') {
            $colegio_sigla = $tipo_profesional === 'medico' ? 'CMP' : '';
        }
        
        if (!$nombre || !$apellido || !$especialidad || !$email || !$password) {
            echo json_encode(['success' => false, 'error' => 'Nombre, apellido, especialidad, email y contraseña son requeridos']);
            exit;
        }

        if ($tipo_profesional === 'medico' && $cmp === '') {
            echo json_encode(['success' => false, 'error' => 'Para tipo profesional médico, el CMP es obligatorio']);
            exit;
        }
        
        // Validar formato CMP
        if (!empty($cmp) && !preg_match('/^[A-Za-z0-9]{1,20}$/', $cmp)) {
            echo json_encode(['success' => false, 'error' => 'Formato de CMP inválido. Solo letras y números, máximo 20 caracteres.']);
            exit;
        }

        if (!empty($colegio_sigla) && !preg_match('/^[A-Za-z0-9\.\-]{1,20}$/', $colegio_sigla)) {
            echo json_encode(['success' => false, 'error' => 'Formato de sigla de colegio inválido']);
            exit;
        }

        if (!empty($nro_colegiatura) && !preg_match('/^[A-Za-z0-9\-]{1,30}$/', $nro_colegiatura)) {
            echo json_encode(['success' => false, 'error' => 'Formato de número de colegiatura inválido']);
            exit;
        }

        if (!preg_match('/^[A-Za-z\(\)\.\s]{1,20}$/', $abreviatura_profesional)) {
            echo json_encode(['success' => false, 'error' => 'Formato de abreviatura inválido']);
            exit;
        }
        
        // Validar formato RNE si está presente
        if (!empty($rne) && !preg_match('/^[A-Za-z0-9]{1,20}$/', $rne)) {
            echo json_encode(['success' => false, 'error' => 'Formato de RNE inválido. Solo letras y números, máximo 20 caracteres.']);
            exit;
        }
        
        // Validar firma si está presente
        if (!empty($firma) && !preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firma)) {
            echo json_encode(['success' => false, 'error' => 'Formato de firma inválido. Debe ser PNG o JPEG en base64.']);
            exit;
        }

        [$condicionesPago, $errorCondiciones] = normalizar_condiciones_pago($data);
        if ($errorCondiciones) {
            echo json_encode(['success' => false, 'error' => $errorCondiciones]);
            exit;
        }
        
        $password_hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $conn->prepare('INSERT INTO medicos (nombre, apellido, especialidad, email, password, cmp, rne, firma, tipo_profesional, abreviatura_profesional, colegio_sigla, nro_colegiatura) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('ssssssssssss', $nombre, $apellido, $especialidad, $email, $password_hash, $cmp, $rne, $firma, $tipo_profesional, $abreviatura_profesional, $colegio_sigla, $nro_colegiatura);
        $ok = $stmt->execute();
        $newId = $ok ? intval($stmt->insert_id) : null;
        $stmt->close();

        if ($ok && $newId) {
            upsert_condiciones_pago($conn, $newId, $condicionesPago);
        }

        echo json_encode(['success' => $ok, 'id' => $newId]);
        exit;
    case 'PUT':
        // Editar médico
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $nombre = $data['nombre'] ?? null;
        $apellido = $data['apellido'] ?? null;
        $especialidad = $data['especialidad'] ?? null;
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        $cmp = $data['cmp'] ?? null;
        $rne = $data['rne'] ?? null;
        $firma = $data['firma'] ?? null;
        $tipo_profesional = normalizar_tipo_profesional($data['tipo_profesional'] ?? 'medico');
        $abreviatura_profesional = trim((string)($data['abreviatura_profesional'] ?? ''));
        $colegio_sigla = strtoupper(trim((string)($data['colegio_sigla'] ?? '')));
        $nro_colegiatura = trim((string)($data['nro_colegiatura'] ?? ''));

        if ($cmp === null) $cmp = '';
        $cmp = trim((string)$cmp);
        if ($cmp === '' && $nro_colegiatura !== '') $cmp = $nro_colegiatura;
        if ($nro_colegiatura === '' && $cmp !== '') $nro_colegiatura = $cmp;
        if ($abreviatura_profesional === '') {
            $abreviatura_profesional = abreviatura_por_tipo($tipo_profesional);
        }
        if ($colegio_sigla === '') {
            $colegio_sigla = $tipo_profesional === 'medico' ? 'CMP' : '';
        }
        
        if (!$id || !$nombre || !$apellido || !$especialidad || !$email) {
            echo json_encode(['success' => false, 'error' => 'ID, nombre, apellido, especialidad y email son requeridos']);
            exit;
        }

        if ($tipo_profesional === 'medico' && $cmp === '') {
            echo json_encode(['success' => false, 'error' => 'Para tipo profesional médico, el CMP es obligatorio']);
            exit;
        }
        
        // Validar formato CMP
        if (!empty($cmp) && !preg_match('/^[A-Za-z0-9]{1,20}$/', $cmp)) {
            echo json_encode(['success' => false, 'error' => 'Formato de CMP inválido. Solo letras y números, máximo 20 caracteres.']);
            exit;
        }

        if (!empty($colegio_sigla) && !preg_match('/^[A-Za-z0-9\.\-]{1,20}$/', $colegio_sigla)) {
            echo json_encode(['success' => false, 'error' => 'Formato de sigla de colegio inválido']);
            exit;
        }

        if (!empty($nro_colegiatura) && !preg_match('/^[A-Za-z0-9\-]{1,30}$/', $nro_colegiatura)) {
            echo json_encode(['success' => false, 'error' => 'Formato de número de colegiatura inválido']);
            exit;
        }

        if (!preg_match('/^[A-Za-z\(\)\.\s]{1,20}$/', $abreviatura_profesional)) {
            echo json_encode(['success' => false, 'error' => 'Formato de abreviatura inválido']);
            exit;
        }
        
        // Validar formato RNE si está presente
        if (!empty($rne) && !preg_match('/^[A-Za-z0-9]{1,20}$/', $rne)) {
            echo json_encode(['success' => false, 'error' => 'Formato de RNE inválido. Solo letras y números, máximo 20 caracteres.']);
            exit;
        }
        
        // Validar firma si está presente
        if (!empty($firma) && !preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firma)) {
            echo json_encode(['success' => false, 'error' => 'Formato de firma inválido. Debe ser PNG o JPEG en base64.']);
            exit;
        }

        [$condicionesPago, $errorCondiciones] = normalizar_condiciones_pago($data);
        if ($errorCondiciones) {
            echo json_encode(['success' => false, 'error' => $errorCondiciones]);
            exit;
        }
        
        if (!empty($password)) {
            $password_hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $conn->prepare('UPDATE medicos SET nombre=?, apellido=?, especialidad=?, email=?, password=?, cmp=?, rne=?, firma=?, tipo_profesional=?, abreviatura_profesional=?, colegio_sigla=?, nro_colegiatura=? WHERE id=?');
            $stmt->bind_param('ssssssssssssi', $nombre, $apellido, $especialidad, $email, $password_hash, $cmp, $rne, $firma, $tipo_profesional, $abreviatura_profesional, $colegio_sigla, $nro_colegiatura, $id);
        } else {
            $stmt = $conn->prepare('UPDATE medicos SET nombre=?, apellido=?, especialidad=?, email=?, cmp=?, rne=?, firma=?, tipo_profesional=?, abreviatura_profesional=?, colegio_sigla=?, nro_colegiatura=? WHERE id=?');
            $stmt->bind_param('sssssssssssi', $nombre, $apellido, $especialidad, $email, $cmp, $rne, $firma, $tipo_profesional, $abreviatura_profesional, $colegio_sigla, $nro_colegiatura, $id);
        }
        $ok = $stmt->execute();
        $stmt->close();

        if ($ok) {
            upsert_condiciones_pago($conn, intval($id), $condicionesPago);
        }

        echo json_encode(['success' => $ok]);
        exit;
    case 'DELETE':
        // Eliminar médico
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'ID requerido']);
            exit;
        }
        $stmtCleanup = $conn->prepare('DELETE FROM medico_condiciones_pago WHERE medico_id=?');
        $stmtCleanup->bind_param('i', $id);
        $stmtCleanup->execute();
        $stmtCleanup->close();

        $stmt = $conn->prepare('DELETE FROM medicos WHERE id=?');
        $stmt->bind_param('i', $id);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok]);
        $stmt->close();
        exit;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
