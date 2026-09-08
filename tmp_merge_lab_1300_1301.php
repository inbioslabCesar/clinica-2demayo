<?php
require __DIR__ . '/config.php';

$root = 1300;
$chain = [1300, 1301];
$ids = implode(',', array_map('intval', $chain));

$hasSnapshot = false;
$chk = $mysqli->query("SHOW COLUMNS FROM cotizaciones_detalle LIKE 'snapshot_json'");
if ($chk && $chk->num_rows > 0) {
    $hasSnapshot = true;
}

$hasVersion = false;
$chk2 = $mysqli->query("SHOW COLUMNS FROM cotizaciones_detalle LIKE 'examen_version_id'");
if ($chk2 && $chk2->num_rows > 0) {
    $hasVersion = true;
}

$sql = 'SELECT servicio_id, descripcion'
    . ($hasSnapshot ? ', snapshot_json' : '')
    . ($hasVersion ? ', examen_version_id' : '')
    . " FROM cotizaciones_detalle"
    . " WHERE cotizacion_id IN ({$ids})"
    . "   AND LOWER(TRIM(servicio_tipo)) = 'laboratorio'"
    . "   AND (estado_item IS NULL OR estado_item <> 'eliminado')"
    . ' ORDER BY cotizacion_id ASC, id ASC';

$res = $mysqli->query($sql);
$payloadById = [];
while ($row = $res->fetch_assoc()) {
    $sid = (int)($row['servicio_id'] ?? 0);
    if ($sid <= 0 || isset($payloadById[$sid])) {
        continue;
    }

    $payload = [
        'id' => $sid,
        'descripcion' => (string)($row['descripcion'] ?? ''),
        'nombre' => (string)($row['descripcion'] ?? ''),
    ];

    if ($hasSnapshot && !empty($row['snapshot_json'])) {
        $decoded = json_decode((string)$row['snapshot_json'], true);
        if (is_array($decoded)) {
            $payload['snapshot_json'] = $decoded;
            if (isset($decoded['valores_referenciales']) && is_array($decoded['valores_referenciales'])) {
                $payload['valores_referenciales'] = $decoded['valores_referenciales'];
            }
        }
    }

    $versionId = $hasVersion ? (int)($row['examen_version_id'] ?? 0) : 0;
    if ($versionId > 0) {
        $payload['examen_version_id'] = $versionId;
    }

    $payloadById[$sid] = $payload;
}

if (empty($payloadById)) {
    echo "SIN_PAYLOAD\n";
    exit(1);
}

$json = json_encode(array_values($payloadById), JSON_UNESCAPED_UNICODE);

$stmtRoot = $mysqli->prepare('SELECT id FROM ordenes_laboratorio WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 1');
$stmtRoot->bind_param('i', $root);
$stmtRoot->execute();
$rootRow = $stmtRoot->get_result()->fetch_assoc();
$stmtRoot->close();

if (!$rootRow) {
    echo "NO_ROOT_ORDER\n";
    exit(1);
}

$rootOrderId = (int)$rootRow['id'];
$stmtUp = $mysqli->prepare("UPDATE ordenes_laboratorio SET examenes = ?, estado = 'pendiente' WHERE id = ?");
$stmtUp->bind_param('si', $json, $rootOrderId);
$stmtUp->execute();
$stmtUp->close();

$resDup = $mysqli->query("SELECT id FROM ordenes_laboratorio WHERE cotizacion_id IN ({$ids}) AND id <> {$rootOrderId}");
while ($dup = $resDup->fetch_assoc()) {
    $dupId = (int)($dup['id'] ?? 0);
    if ($dupId <= 0) {
        continue;
    }

    $stmtRes = $mysqli->prepare('SELECT 1 FROM resultados_laboratorio WHERE orden_id = ? LIMIT 1');
    $stmtRes->bind_param('i', $dupId);
    $stmtRes->execute();
    $hasResults = (bool)$stmtRes->get_result()->fetch_row();
    $stmtRes->close();

    if ($hasResults) {
        continue;
    }

    $stmtCan = $mysqli->prepare("UPDATE ordenes_laboratorio SET examenes = '[]', estado = 'cancelada', cotizacion_id = ? WHERE id = ?");
    $stmtCan->bind_param('ii', $root, $dupId);
    $stmtCan->execute();
    $stmtCan->close();
}

echo "OK root_order={$rootOrderId}\n";
