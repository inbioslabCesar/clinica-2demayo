<?php
require_once __DIR__ . '/../config.php';

if (php_sapi_name() !== 'cli') {
    fwrite(STDERR, "Este script debe ejecutarse por CLI.\n");
    exit(1);
}

$options = getopt('', [
    'base-id:',
    'clones::',
    'patient-id::',
    'out-rate::',
]);

$baseId = isset($options['base-id']) ? (int)$options['base-id'] : 0;
$clones = isset($options['clones']) ? max(1, (int)$options['clones']) : 8;
$patientId = isset($options['patient-id']) ? (int)$options['patient-id'] : 0;
$outRate = isset($options['out-rate']) ? (float)$options['out-rate'] : 0.35;
if ($outRate < 0) $outRate = 0;
if ($outRate > 1) $outRate = 1;

if ($baseId <= 0) {
    fwrite(STDERR, "Uso: php scripts/generar_resultados_masivos_pdf.php --base-id=ID [--clones=8] [--patient-id=1] [--out-rate=0.35]\n");
    exit(1);
}

$toNullableFloat = function ($value) {
    if ($value === null || $value === '') return null;
    if (is_numeric($value)) return (float)$value;
    $s = str_replace(',', '.', trim((string)$value));
    if ($s === '') return null;
    if (preg_match('/-?\d+(?:\.\d+)?/', $s, $m)) {
        $n = (float)$m[0];
        return is_finite($n) ? $n : null;
    }
    return null;
};

$getNumericRange = function ($param) use ($toNullableFloat) {
    $referencias = (isset($param['referencias']) && is_array($param['referencias'])) ? $param['referencias'] : [];
    foreach ($referencias as $ref) {
        if (!is_array($ref)) continue;
        $min = $toNullableFloat($ref['valor_min'] ?? null);
        $max = $toNullableFloat($ref['valor_max'] ?? null);
        if ($min !== null || $max !== null) {
            return [$min, $max];
        }
        $valor = isset($ref['valor']) ? (string)$ref['valor'] : '';
        if ($valor !== '' && preg_match('/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|a|hasta|entre|y)\s*(-?\d+(?:\.\d+)?)/i', str_replace(',', '.', $valor), $m)) {
            return [(float)$m[1], (float)$m[2]];
        }
    }
    return [null, null];
};

$normalizeTipo = function ($tipo) {
    $t = strtolower(trim((string)$tipo));
    $t = str_replace(['á','é','í','ó','ú'], ['a','e','i','o','u'], $t);
    return $t;
};

$baseStmt = $conn->prepare('SELECT * FROM examenes_laboratorio WHERE id = ? LIMIT 1');
$baseStmt->bind_param('i', $baseId);
$baseStmt->execute();
$baseExam = $baseStmt->get_result()->fetch_assoc();
$baseStmt->close();

if (!$baseExam) {
    fwrite(STDERR, "No existe examen base con id {$baseId}.\n");
    exit(1);
}

$baseParams = [];
if (!empty($baseExam['valores_referenciales'])) {
    $decoded = json_decode($baseExam['valores_referenciales'], true);
    if (is_array($decoded)) {
        $baseParams = $decoded;
    }
}

if (empty($baseParams)) {
    fwrite(STDERR, "El examen base no tiene parametros en valores_referenciales.\n");
    exit(1);
}

if ($patientId <= 0) {
    $resP = $conn->query('SELECT id FROM pacientes ORDER BY id ASC LIMIT 1');
    $rowP = $resP ? $resP->fetch_assoc() : null;
    if ($rowP && isset($rowP['id'])) {
        $patientId = (int)$rowP['id'];
    }
}

if ($patientId <= 0) {
    fwrite(STDERR, "No se pudo resolver patient-id. Pasa --patient-id=ID existente.\n");
    exit(1);
}

$tag = 'TESTPDF_' . date('Ymd_His');
$createdExamIds = [];

$insertExamSql = 'INSERT INTO examenes_laboratorio (nombre, categoria, metodologia, valores_referenciales, precio_publico, precio_convenio, tipo_tubo, tipo_frasco, tiempo_resultado, condicion_paciente, preanalitica, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)';
$insertExam = $conn->prepare($insertExamSql);
if (!$insertExam) {
    fwrite(STDERR, "No se pudo preparar insert de examenes: {$conn->error}\n");
    exit(1);
}

$baseNombre = (string)($baseExam['nombre'] ?? ('Examen ' . $baseId));
$categoria = (string)($baseExam['categoria'] ?? '');
$metodologia = (string)($baseExam['metodologia'] ?? '');
$precioPublico = is_numeric($baseExam['precio_publico'] ?? null) ? (float)$baseExam['precio_publico'] : 0.0;
$precioConvenio = is_numeric($baseExam['precio_convenio'] ?? null) ? (float)$baseExam['precio_convenio'] : 0.0;
$tipoTubo = (string)($baseExam['tipo_tubo'] ?? '');
$tipoFrasco = (string)($baseExam['tipo_frasco'] ?? '');
$tiempoResultado = (string)($baseExam['tiempo_resultado'] ?? '');
$condicionPaciente = (string)($baseExam['condicion_paciente'] ?? '');
$preanalitica = (string)($baseExam['preanalitica'] ?? '');

for ($i = 1; $i <= $clones; $i++) {
    $nombre = "[{$tag}] {$baseNombre} #{$i}";
    $valoresJson = json_encode($baseParams, JSON_UNESCAPED_UNICODE);
    $insertExam->bind_param(
        'ssssddsssss',
        $nombre,
        $categoria,
        $metodologia,
        $valoresJson,
        $precioPublico,
        $precioConvenio,
        $tipoTubo,
        $tipoFrasco,
        $tiempoResultado,
        $condicionPaciente,
        $preanalitica
    );
    if (!$insertExam->execute()) {
        fwrite(STDERR, "Fallo insert examen clon {$i}: {$insertExam->error}\n");
        $insertExam->close();
        exit(1);
    }
    $createdExamIds[] = (int)$conn->insert_id;
}
$insertExam->close();

$examenesJson = json_encode($createdExamIds);
$insertOrden = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, paciente_id) VALUES (NULL, ?, ?)');
if (!$insertOrden) {
    fwrite(STDERR, "No se pudo preparar insert de orden: {$conn->error}\n");
    exit(1);
}
$insertOrden->bind_param('si', $examenesJson, $patientId);
if (!$insertOrden->execute()) {
    fwrite(STDERR, "Fallo insert orden: {$insertOrden->error}\n");
    $insertOrden->close();
    exit(1);
}
$orderId = (int)$conn->insert_id;
$insertOrden->close();

$resultadosMap = [];
$tipoExamen = "PRUEBA MASIVA {$tag}";

foreach ($createdExamIds as $exId) {
    foreach ($baseParams as $param) {
        if (!is_array($param)) continue;
        $tipo = $normalizeTipo($param['tipo'] ?? 'parámetro');
        $nombreParam = trim((string)($param['nombre'] ?? ''));
        if ($nombreParam === '') continue;

        if ($tipo === 'titulo' || $tipo === 'subtitulo') {
            continue;
        }

        if ($tipo === 'texto largo') {
            $resultadosMap[$exId . '__' . $nombreParam] = "Texto de prueba {$tag} para {$nombreParam}";
            continue;
        }

        if ($tipo === 'campo') {
            $resultadosMap[$exId . '__' . $nombreParam] = "Campo prueba {$tag}";
            continue;
        }

        [$minRef, $maxRef] = $getNumericRange($param);
        $decimales = (isset($param['decimales']) && is_numeric($param['decimales'])) ? (int)$param['decimales'] : 1;
        if ($decimales < 0) $decimales = 0;
        if ($decimales > 4) $decimales = 4;

        $fuera = (mt_rand(0, 1000) / 1000) < $outRate;
        $valorNum = null;

        if ($minRef !== null || $maxRef !== null) {
            $min = $minRef !== null ? $minRef : ($maxRef - 5);
            $max = $maxRef !== null ? $maxRef : ($minRef + 5);
            if ($max < $min) {
                $tmp = $max;
                $max = $min;
                $min = $tmp;
            }

            if ($fuera) {
                if (mt_rand(0, 1) === 0) {
                    $valorNum = $min - mt_rand(10, 40) / 10;
                } else {
                    $valorNum = $max + mt_rand(10, 40) / 10;
                }
            } else {
                $valorNum = $min + (mt_rand(0, 1000) / 1000) * max(0.1, ($max - $min));
            }
        } else {
            $valorNum = mt_rand(10, 500) / 10;
        }

        $resultadosMap[$exId . '__' . $nombreParam] = number_format((float)$valorNum, $decimales, '.', '');
    }
}

$insertResultado = $conn->prepare('INSERT INTO resultados_laboratorio (orden_id, tipo_examen, resultados, firmado_por_usuario_id) VALUES (?, ?, ?, NULL)');
if (!$insertResultado) {
    fwrite(STDERR, "No se pudo preparar insert de resultados: {$conn->error}\n");
    exit(1);
}
$resultadosJson = json_encode($resultadosMap, JSON_UNESCAPED_UNICODE);
$insertResultado->bind_param('iss', $orderId, $tipoExamen, $resultadosJson);
if (!$insertResultado->execute()) {
    fwrite(STDERR, "Fallo insert resultados: {$insertResultado->error}\n");
    $insertResultado->close();
    exit(1);
}
$resultadoId = (int)$conn->insert_id;
$insertResultado->close();

$updateOrden = $conn->prepare('UPDATE ordenes_laboratorio SET estado = "completado" WHERE id = ?');
if ($updateOrden) {
    $updateOrden->bind_param('i', $orderId);
    $updateOrden->execute();
    $updateOrden->close();
}

echo "OK\n";
echo "TAG: {$tag}\n";
echo "Examenes clonados: " . count($createdExamIds) . "\n";
echo "Orden ID: {$orderId}\n";
echo "Resultado ID: {$resultadoId}\n";
echo "PDF URL: descargar_resultados_laboratorio.php?id={$resultadoId}\n";
echo "Limpieza sugerida:\n";
echo "DELETE FROM resultados_laboratorio WHERE id = {$resultadoId};\n";
echo "DELETE FROM ordenes_laboratorio WHERE id = {$orderId};\n";
echo "DELETE FROM examenes_laboratorio WHERE nombre LIKE '[{$tag}]%';\n";
