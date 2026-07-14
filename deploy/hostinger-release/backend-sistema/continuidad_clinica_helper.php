<?php

if (!function_exists('continuidad_table_exists')) {
    function continuidad_table_exists($conn, $tableName)
    {
        static $cache = [];
        $key = strtolower(trim((string)$tableName));
        if ($key === '') {
            return false;
        }
        if (array_key_exists($key, $cache)) {
            return $cache[$key];
        }

        $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
        if (!$stmt) {
            $cache[$key] = false;
            return false;
        }
        $stmt->bind_param('s', $tableName);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = ($res && $res->num_rows > 0);
        $stmt->close();

        $cache[$key] = $exists;
        return $exists;
    }
}

if (!function_exists('continuidad_resolve_access_types_for_mode')) {
    function continuidad_resolve_access_types_for_mode($mode)
    {
        $m = strtolower(trim((string)$mode));
        if ($m === 'write') {
            return ['write', 'full'];
        }
        // Para lectura considerar write como superset operativo.
        return ['read', 'write', 'full'];
    }
}

if (!function_exists('continuidad_get_effective_medico_ids')) {
    function continuidad_get_effective_medico_ids($conn, $targetDoctorId, $mode = 'read', $atDateTime = null)
    {
        $targetDoctorId = (int)$targetDoctorId;
        if ($targetDoctorId <= 0) {
            return [];
        }

        $ids = [$targetDoctorId => true];

        if (!continuidad_table_exists($conn, 'doctor_access_delegations')) {
            return array_map('intval', array_keys($ids));
        }

        $types = continuidad_resolve_access_types_for_mode($mode);
        $at = trim((string)$atDateTime);
        if ($at === '') {
            $at = date('Y-m-d H:i:s');
        }

        $placeholders = implode(', ', array_fill(0, count($types), '?'));
        $sql = 'SELECT source_doctor_id
                FROM doctor_access_delegations
                WHERE target_doctor_id = ?
                  AND status = "active"
                  AND starts_at <= ?
                  AND expires_at >= ?
                  AND access_type IN (' . $placeholders . ')';

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return array_map('intval', array_keys($ids));
        }

        $bindTypes = 'iss' . str_repeat('s', count($types));
        $bindValues = [$targetDoctorId, $at, $at];
        foreach ($types as $t) {
            $bindValues[] = $t;
        }

        $stmt->bind_param($bindTypes, ...$bindValues);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $sourceId = (int)($row['source_doctor_id'] ?? 0);
            if ($sourceId > 0) {
                $ids[$sourceId] = true;
            }
        }
        $stmt->close();

        return array_map('intval', array_keys($ids));
    }
}

if (!function_exists('continuidad_can_access_consulta')) {
    function continuidad_can_access_consulta($conn, $consultaId, $targetDoctorId, $mode = 'read')
    {
        $consultaId = (int)$consultaId;
        $targetDoctorId = (int)$targetDoctorId;
        if ($consultaId <= 0 || $targetDoctorId <= 0) {
            return false;
        }

        $stmt = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $ownerMedicoId = (int)($row['medico_id'] ?? 0);
        if ($ownerMedicoId <= 0) {
            return false;
        }

        $effectiveIds = continuidad_get_effective_medico_ids($conn, $targetDoctorId, $mode);
        return in_array($ownerMedicoId, $effectiveIds, true);
    }
}
