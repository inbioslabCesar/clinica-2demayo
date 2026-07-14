<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

function cc_json_response($statusCode, $payload) {
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cc_require_admin() {
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        cc_json_response(401, [
            'success' => false,
            'error' => 'No autenticado',
        ]);
    }

    $rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
    if ($rol !== 'administrador') {
        cc_json_response(403, [
            'success' => false,
            'error' => 'Solo administradores pueden gestionar continuidad clinica',
        ]);
    }
}

function cc_resolve_session_medico_id() {
    $medicoId = (int)($_SESSION['medico_id'] ?? 0);
    if ($medicoId > 0) {
        return $medicoId;
    }

    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
        $rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
        if ($rol === 'medico') {
            $fromUsuario = (int)($_SESSION['usuario']['medico_id'] ?? ($_SESSION['usuario']['id'] ?? 0));
            if ($fromUsuario > 0) {
                return $fromUsuario;
            }
        }
    }

    return 0;
}

function cc_require_medico_or_admin() {
    if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
        cc_json_response(401, [
            'success' => false,
            'error' => 'No autenticado',
        ]);
    }

    $rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
    if ($rol === 'administrador') {
        return 'administrador';
    }

    $medicoId = cc_resolve_session_medico_id();
    if ($medicoId > 0) {
        return 'medico';
    }

    cc_json_response(403, [
        'success' => false,
        'error' => 'Solo médicos o administradores pueden usar esta acción',
    ]);
}

function cc_read_input() {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        cc_json_response(400, [
            'success' => false,
            'error' => 'JSON invalido en el cuerpo de la solicitud',
        ]);
    }

    return $decoded;
}

function cc_parse_datetime($value, $fieldName) {
    $raw = trim((string)$value);
    if ($raw === '') {
        cc_json_response(400, [
            'success' => false,
            'error' => "El campo {$fieldName} es obligatorio",
        ]);
    }

    $formats = ['Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d'];
    foreach ($formats as $fmt) {
        $dt = DateTime::createFromFormat($fmt, $raw);
        $errors = DateTime::getLastErrors();
        if ($dt instanceof DateTime && ($errors['warning_count'] ?? 0) === 0 && ($errors['error_count'] ?? 0) === 0) {
            if ($fmt === 'Y-m-d') {
                $dt->setTime(0, 0, 0);
            }
            return $dt;
        }
    }

    cc_json_response(400, [
        'success' => false,
        'error' => "Formato invalido para {$fieldName}. Use YYYY-MM-DD o YYYY-MM-DD HH:MM[:SS]",
    ]);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = strtolower(trim((string)($_GET['action'] ?? '')));
$input = ($method === 'POST' || $method === 'PUT' || $method === 'PATCH' || $method === 'DELETE') ? cc_read_input() : [];
$adminId = (int)($_SESSION['usuario']['id'] ?? 0);
$sessionMedicoId = cc_resolve_session_medico_id();

if ($action === '') {
    cc_json_response(400, [
        'success' => false,
        'error' => 'Accion requerida. Use ?action=create_delegation|revoke_delegation|list_delegations|search_delegated_patients|validate_patient_access',
    ]);
}

$adminActions = ['create_delegation', 'revoke_delegation', 'list_delegations'];
$medicoActions = ['search_delegated_patients', 'validate_patient_access'];

if (in_array($action, $adminActions, true)) {
    cc_require_admin();
} elseif (in_array($action, $medicoActions, true)) {
    cc_require_medico_or_admin();
} else {
    cc_json_response(400, [
        'success' => false,
        'error' => 'Accion no soportada',
    ]);
}

switch ($action) {
    case 'create_delegation':
        if ($method !== 'POST') {
            cc_json_response(405, [
                'success' => false,
                'error' => 'Metodo no permitido. Use POST para create_delegation',
            ]);
        }

        $sourceDoctorId = (int)($input['source_doctor_id'] ?? 0);
        $targetDoctorId = (int)($input['target_doctor_id'] ?? 0);
        $accessType = strtolower(trim((string)($input['access_type'] ?? 'read')));
        $reason = trim((string)($input['reason'] ?? ''));

        if ($sourceDoctorId <= 0 || $targetDoctorId <= 0) {
            cc_json_response(400, [
                'success' => false,
                'error' => 'source_doctor_id y target_doctor_id deben ser mayores a 0',
            ]);
        }

        if ($sourceDoctorId === $targetDoctorId) {
            cc_json_response(400, [
                'success' => false,
                'error' => 'El medico origen y el medico suplente no pueden ser el mismo',
            ]);
        }

        $allowedAccessTypes = ['read', 'write', 'full'];
        if (!in_array($accessType, $allowedAccessTypes, true)) {
            cc_json_response(400, [
                'success' => false,
                'error' => 'access_type invalido. Valores permitidos: read, write, full',
            ]);
        }

        $startsAt = cc_parse_datetime($input['starts_at'] ?? '', 'starts_at');
        $expiresAt = cc_parse_datetime($input['expires_at'] ?? '', 'expires_at');

        if ($expiresAt <= $startsAt) {
            cc_json_response(400, [
                'success' => false,
                'error' => 'expires_at debe ser mayor que starts_at',
            ]);
        }

        if ($adminId <= 0) {
            cc_json_response(400, [
                'success' => false,
                'error' => 'No se pudo resolver el administrador que otorga la suplencia',
            ]);
        }

        // Validar que los medicos existan antes de registrar la suplencia.
        $stmtDoctors = $conn->prepare('SELECT id FROM medicos WHERE id IN (?, ?)');
        if (!$stmtDoctors) {
            cc_json_response(500, ['success' => false, 'error' => 'No se pudo preparar validacion de medicos']);
        }
        $stmtDoctors->bind_param('ii', $sourceDoctorId, $targetDoctorId);
        $stmtDoctors->execute();
        $rsDoctors = $stmtDoctors->get_result();
        $doctorCount = $rsDoctors ? $rsDoctors->num_rows : 0;
        $stmtDoctors->close();

        if ($doctorCount < 2) {
            cc_json_response(404, [
                'success' => false,
                'error' => 'Uno o ambos medicos no existen',
            ]);
        }

        $startsAtSql = $startsAt->format('Y-m-d H:i:s');
        $expiresAtSql = $expiresAt->format('Y-m-d H:i:s');
        $reasonSql = ($reason === '') ? null : mb_substr($reason, 0, 500);

        $stmt = $conn->prepare('INSERT INTO doctor_access_delegations (source_doctor_id, target_doctor_id, access_type, status, starts_at, expires_at, granted_by, reason) VALUES (?, ?, ?, "active", ?, ?, ?, ?)');
        if (!$stmt) {
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo preparar el registro de suplencia',
            ]);
        }

        $stmt->bind_param('iisssis', $sourceDoctorId, $targetDoctorId, $accessType, $startsAtSql, $expiresAtSql, $adminId, $reasonSql);
        if (!$stmt->execute()) {
            $stmt->close();
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo registrar la suplencia',
            ]);
        }

        $delegationId = (int)$stmt->insert_id;
        $stmt->close();

        cc_json_response(201, [
            'success' => true,
            'message' => 'Suplencia registrada correctamente',
            'data' => [
                'id' => $delegationId,
                'source_doctor_id' => $sourceDoctorId,
                'target_doctor_id' => $targetDoctorId,
                'access_type' => $accessType,
                'status' => 'active',
                'starts_at' => $startsAtSql,
                'expires_at' => $expiresAtSql,
                'granted_by' => $adminId,
                'reason' => $reasonSql,
            ],
        ]);
        break;

    case 'revoke_delegation':
        if ($method !== 'POST') {
            cc_json_response(405, [
                'success' => false,
                'error' => 'Metodo no permitido. Use POST para revoke_delegation',
            ]);
        }

        $delegationId = (int)($input['delegation_id'] ?? ($input['id'] ?? ($_GET['id'] ?? 0)));
        if ($delegationId <= 0) {
            cc_json_response(400, [
                'success' => false,
                'error' => 'delegation_id es obligatorio',
            ]);
        }

        $stmt = $conn->prepare('UPDATE doctor_access_delegations SET status = "revoked" WHERE id = ? AND status <> "revoked"');
        if (!$stmt) {
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo preparar la revocacion',
            ]);
        }

        $stmt->bind_param('i', $delegationId);
        if (!$stmt->execute()) {
            $stmt->close();
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo revocar la suplencia',
            ]);
        }

        $affected = (int)$stmt->affected_rows;
        $stmt->close();

        if ($affected <= 0) {
            cc_json_response(404, [
                'success' => false,
                'error' => 'No se encontro suplencia activa para revocar',
            ]);
        }

        cc_json_response(200, [
            'success' => true,
            'message' => 'Suplencia revocada correctamente',
            'data' => [
                'id' => $delegationId,
                'status' => 'revoked',
            ],
        ]);
        break;

    case 'list_delegations':
        if ($method !== 'GET') {
            cc_json_response(405, [
                'success' => false,
                'error' => 'Metodo no permitido. Use GET para list_delegations',
            ]);
        }

        $status = strtolower(trim((string)($_GET['status'] ?? '')));
        $doctorId = (int)($_GET['doctor_id'] ?? 0);
        $limit = (int)($_GET['limit'] ?? 200);
        if ($limit <= 0) {
            $limit = 200;
        }
        if ($limit > 1000) {
            $limit = 1000;
        }

        $allowedStatus = ['active', 'suspended', 'expired', 'revoked'];
        $where = [];
        $types = '';
        $params = [];

        if ($status !== '') {
            if (!in_array($status, $allowedStatus, true)) {
                cc_json_response(400, [
                    'success' => false,
                    'error' => 'status invalido. Valores permitidos: active, suspended, expired, revoked',
                ]);
            }
            $where[] = 'status = ?';
            $types .= 's';
            $params[] = $status;
        }

        if ($doctorId > 0) {
            $where[] = '(source_doctor_id = ? OR target_doctor_id = ?)';
            $types .= 'ii';
            $params[] = $doctorId;
            $params[] = $doctorId;
        }

        $sql = 'SELECT id, source_doctor_id, target_doctor_id, access_type, status, starts_at, expires_at, granted_by, reason, created_at FROM doctor_access_delegations';
        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY id DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo preparar el listado de suplencias',
            ]);
        }

        $stmt->bind_param($types, ...$params);
        if (!$stmt->execute()) {
            $stmt->close();
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo obtener el listado de suplencias',
            ]);
        }

        $result = $stmt->get_result();
        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = [
                'id' => (int)($row['id'] ?? 0),
                'source_doctor_id' => (int)($row['source_doctor_id'] ?? 0),
                'target_doctor_id' => (int)($row['target_doctor_id'] ?? 0),
                'access_type' => (string)($row['access_type'] ?? ''),
                'status' => (string)($row['status'] ?? ''),
                'starts_at' => (string)($row['starts_at'] ?? ''),
                'expires_at' => (string)($row['expires_at'] ?? ''),
                'granted_by' => (int)($row['granted_by'] ?? 0),
                'reason' => (string)($row['reason'] ?? ''),
                'created_at' => (string)($row['created_at'] ?? ''),
            ];
        }
        $stmt->close();

        cc_json_response(200, [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'count' => count($rows),
                'limit' => $limit,
                'status_filter' => ($status !== '' ? $status : null),
                'doctor_filter' => ($doctorId > 0 ? $doctorId : null),
            ],
        ]);
        break;

    case 'search_delegated_patients':
        if ($method !== 'GET') {
            cc_json_response(405, [
                'success' => false,
                'error' => 'Metodo no permitido. Use GET para search_delegated_patients',
            ]);
        }

        if ($sessionMedicoId <= 0) {
            cc_json_response(403, [
                'success' => false,
                'error' => 'Solo médicos pueden buscar pacientes por suplencia',
            ]);
        }

        $q = trim((string)($_GET['q'] ?? ''));
        $limit = (int)($_GET['limit'] ?? 10);
        if ($limit <= 0) {
            $limit = 10;
        }
        if ($limit > 30) {
            $limit = 30;
        }

        if (mb_strlen($q) < 3) {
            cc_json_response(200, [
                'success' => true,
                'data' => [],
                'meta' => [
                    'query' => $q,
                    'count' => 0,
                    'limit' => $limit,
                ],
            ]);
        }

        $like = '%' . $q . '%';
        $sql = 'SELECT
                    p.id AS paciente_id,
                    p.nombre AS paciente_nombre,
                    p.apellido AS paciente_apellido,
                    p.dni AS paciente_dni,
                    p.historia_clinica AS historia_clinica,
                    c.id AS consulta_id,
                    d.id AS delegation_id,
                    d.source_doctor_id,
                    d.access_type,
                    d.expires_at,
                    m.nombre AS source_nombre,
                    m.apellido AS source_apellido,
                    m.especialidad AS source_especialidad
                FROM doctor_access_delegations d
                INNER JOIN consultas c ON c.medico_id = d.source_doctor_id
                INNER JOIN pacientes p ON p.id = c.paciente_id
                INNER JOIN medicos m ON m.id = d.source_doctor_id
                WHERE d.target_doctor_id = ?
                  AND d.status = "active"
                  AND d.starts_at <= NOW()
                  AND d.expires_at >= NOW()
                  AND (
                    p.nombre LIKE ?
                    OR p.apellido LIKE ?
                    OR CONCAT(TRIM(p.nombre), " ", TRIM(p.apellido)) LIKE ?
                    OR p.dni LIKE ?
                    OR p.historia_clinica LIKE ?
                  )
                ORDER BY c.id DESC
                LIMIT ?';

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo preparar la búsqueda de pacientes por suplencia',
            ]);
        }

        $stmt->bind_param('isssssi', $sessionMedicoId, $like, $like, $like, $like, $like, $limit);
        if (!$stmt->execute()) {
            $stmt->close();
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo ejecutar la búsqueda de pacientes por suplencia',
            ]);
        }

        $res = $stmt->get_result();
        $rows = [];
        $seen = [];
        while ($row = $res->fetch_assoc()) {
            $key = (int)($row['paciente_id'] ?? 0) . '|' . (int)($row['source_doctor_id'] ?? 0);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            $rows[] = [
                'paciente_id' => (int)($row['paciente_id'] ?? 0),
                'paciente_nombre' => trim((string)($row['paciente_nombre'] ?? '')),
                'paciente_apellido' => trim((string)($row['paciente_apellido'] ?? '')),
                'paciente_dni' => trim((string)($row['paciente_dni'] ?? '')),
                'historia_clinica' => trim((string)($row['historia_clinica'] ?? '')),
                'consulta_id' => (int)($row['consulta_id'] ?? 0),
                'delegation_id' => (int)($row['delegation_id'] ?? 0),
                'source_doctor_id' => (int)($row['source_doctor_id'] ?? 0),
                'source_doctor_nombre' => trim((string)($row['source_nombre'] ?? '')),
                'source_doctor_apellido' => trim((string)($row['source_apellido'] ?? '')),
                'source_doctor_especialidad' => trim((string)($row['source_especialidad'] ?? '')),
                'access_type' => trim((string)($row['access_type'] ?? '')),
                'expires_at' => trim((string)($row['expires_at'] ?? '')),
            ];
        }
        $stmt->close();

        cc_json_response(200, [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'query' => $q,
                'count' => count($rows),
                'limit' => $limit,
            ],
        ]);
        break;

    case 'validate_patient_access':
        if ($method !== 'GET' && $method !== 'POST') {
            cc_json_response(405, [
                'success' => false,
                'error' => 'Metodo no permitido. Use GET o POST para validate_patient_access',
            ]);
        }

        if ($sessionMedicoId <= 0) {
            cc_json_response(403, [
                'success' => false,
                'error' => 'Solo médicos pueden validar acceso por suplencia',
            ]);
        }

        $sourceData = ($method === 'POST') ? $input : $_GET;
        $pacienteId = (int)($sourceData['paciente_id'] ?? 0);
        $mode = strtolower(trim((string)($sourceData['mode'] ?? 'read')));

        if ($pacienteId <= 0) {
            cc_json_response(400, [
                'success' => false,
                'error' => 'paciente_id es obligatorio',
            ]);
        }

        if (!in_array($mode, ['read', 'write'], true)) {
            cc_json_response(400, [
                'success' => false,
                'error' => 'mode invalido. Valores permitidos: read, write',
            ]);
        }

        $allowedAccess = ($mode === 'write') ? ['write', 'full'] : ['read', 'write', 'full'];
        $placeholders = implode(', ', array_fill(0, count($allowedAccess), '?'));

        $sql = 'SELECT
                    c.id AS consulta_id,
                    c.medico_id AS source_doctor_id,
                    p.id AS paciente_id,
                    p.nombre AS paciente_nombre,
                    p.apellido AS paciente_apellido,
                    p.dni AS paciente_dni,
                    p.historia_clinica AS historia_clinica,
                    d.id AS delegation_id,
                    d.access_type,
                    d.starts_at,
                    d.expires_at,
                    m.nombre AS source_nombre,
                    m.apellido AS source_apellido,
                    m.especialidad AS source_especialidad
                FROM consultas c
                INNER JOIN pacientes p ON p.id = c.paciente_id
                INNER JOIN doctor_access_delegations d
                    ON d.source_doctor_id = c.medico_id
                   AND d.target_doctor_id = ?
                   AND d.status = "active"
                   AND d.starts_at <= NOW()
                   AND d.expires_at >= NOW()
                INNER JOIN medicos m ON m.id = c.medico_id
                WHERE c.paciente_id = ?
                  AND d.access_type IN (' . $placeholders . ')
                ORDER BY c.id DESC
                LIMIT 1';

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo preparar la validación de acceso por paciente',
            ]);
        }

        $bindTypes = 'ii' . str_repeat('s', count($allowedAccess));
        $bindValues = [$sessionMedicoId, $pacienteId];
        foreach ($allowedAccess as $acc) {
            $bindValues[] = $acc;
        }

        $stmt->bind_param($bindTypes, ...$bindValues);
        if (!$stmt->execute()) {
            $stmt->close();
            cc_json_response(500, [
                'success' => false,
                'error' => 'No se pudo ejecutar la validación de acceso por paciente',
            ]);
        }

        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            cc_json_response(403, [
                'success' => false,
                'authorized' => false,
                'error' => 'Acceso denegado para este paciente: no existe suplencia activa y vigente',
            ]);
        }

        cc_json_response(200, [
            'success' => true,
            'authorized' => true,
            'data' => [
                'paciente_id' => (int)($row['paciente_id'] ?? 0),
                'paciente_nombre' => trim((string)($row['paciente_nombre'] ?? '')),
                'paciente_apellido' => trim((string)($row['paciente_apellido'] ?? '')),
                'paciente_dni' => trim((string)($row['paciente_dni'] ?? '')),
                'historia_clinica' => trim((string)($row['historia_clinica'] ?? '')),
                'consulta_id' => (int)($row['consulta_id'] ?? 0),
                'source_doctor_id' => (int)($row['source_doctor_id'] ?? 0),
                'source_doctor_nombre' => trim((string)($row['source_nombre'] ?? '')),
                'source_doctor_apellido' => trim((string)($row['source_apellido'] ?? '')),
                'source_doctor_especialidad' => trim((string)($row['source_especialidad'] ?? '')),
                'delegation_id' => (int)($row['delegation_id'] ?? 0),
                'access_type' => trim((string)($row['access_type'] ?? '')),
                'starts_at' => trim((string)($row['starts_at'] ?? '')),
                'expires_at' => trim((string)($row['expires_at'] ?? '')),
                'mode' => $mode,
            ],
        ]);
        break;

    default:
        cc_json_response(400, [
            'success' => false,
            'error' => 'Accion no soportada',
        ]);
}
