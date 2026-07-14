<?php
require_once __DIR__ . '/../config/db_resolver.php';

function openPdo(): PDO
{
    $runtimeConfig = resolve_db_runtime_config(dirname(__DIR__));
    $host = (string)($runtimeConfig['DB_HOST'] ?? '127.0.0.1');
    $name = (string)($runtimeConfig['DB_NAME'] ?? '');
    $user = (string)($runtimeConfig['DB_USER'] ?? '');
    $pass = (string)($runtimeConfig['DB_PASS'] ?? '');
    $port = isset($runtimeConfig['DB_PORT']) ? (int)$runtimeConfig['DB_PORT'] : 3306;

    if ($name === '') {
        throw new RuntimeException('No se pudo resolver DB_NAME.');
    }

    $dsn = sprintf('mysql:host=%s;dbname=%s;port=%d;charset=utf8mb4', $host, $name, $port);
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '-05:00'");
    return $pdo;
}

function ensureEsColumns(PDO $pdo): void
{
    $checks = [
        'nombre_es' => "ALTER TABLE cie10 ADD COLUMN nombre_es VARCHAR(500) NULL AFTER nombre",
        'categoria_es' => "ALTER TABLE cie10 ADD COLUMN categoria_es VARCHAR(255) NULL AFTER categoria",
        'subcategoria_es' => "ALTER TABLE cie10 ADD COLUMN subcategoria_es VARCHAR(255) NULL AFTER subcategoria",
        'descripcion_es' => "ALTER TABLE cie10 ADD COLUMN descripcion_es TEXT NULL AFTER descripcion",
    ];

    foreach ($checks as $column => $ddl) {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cie10' AND column_name = :column");
        $stmt->execute([':column' => $column]);
        if ((int)$stmt->fetchColumn() === 0) {
            $pdo->exec($ddl);
        }
    }

    $widthMap = [
        'categoria_es' => 255,
        'subcategoria_es' => 255,
    ];
    foreach ($widthMap as $column => $expectedWidth) {
        $stmt = $pdo->prepare("SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cie10' AND column_name = :column");
        $stmt->execute([':column' => $column]);
        $type = (string)$stmt->fetchColumn();
        if (preg_match('/varchar\\((\\d+)\\)/i', $type, $m) === 1 && (int)$m[1] < $expectedWidth) {
            $pdo->exec("ALTER TABLE cie10 MODIFY COLUMN {$column} VARCHAR({$expectedWidth}) NULL");
        }
    }
}

function translateToEs(string $text): string
{
    $text = trim($text);
    if ($text === '') {
        return '';
    }

    $phraseMap = [
        'Diseases of the musculoskeletal system and connective tissue' => 'Enfermedades del sistema osteomuscular y del tejido conjuntivo',
        'Certain infectious and parasitic diseases' => 'Ciertas enfermedades infecciosas y parasitarias',
        'Mental and behavioural disorders' => 'Trastornos mentales y del comportamiento',
        'Diseases of the circulatory system' => 'Enfermedades del sistema circulatorio',
        'Diseases of the respiratory system' => 'Enfermedades del sistema respiratorio',
        'Diseases of the digestive system' => 'Enfermedades del sistema digestivo',
        'Diseases of the genitourinary system' => 'Enfermedades del sistema genitourinario',
        'Diseases of the nervous system' => 'Enfermedades del sistema nervioso',
        'Diseases of the eye and adnexa' => 'Enfermedades del ojo y anexos',
        'Diseases of the ear and mastoid process' => 'Enfermedades del oido y de la apofisis mastoides',
        'Endocrine, nutritional and metabolic diseases' => 'Enfermedades endocrinas, nutricionales y metabolicas',
        'Neoplasms' => 'Neoplasias',
        'Other dorsopathies' => 'Otras dorsopatias',
        'Chapter' => 'Capitulo',
        'Group' => 'Grupo',
        'disorder with' => 'trastorno con',
        'disorder, unspecified' => 'trastorno no especificado',
        'Other cervical disc displacement' => 'Otro desplazamiento de disco cervical',
        'Other cervical disc degeneration' => 'Otra degeneracion de disco cervical',
        'Cervical disc disorder with radiculopathy' => 'Trastorno de disco cervical con radiculopatia',
        'Cervical disc disorder with myelopathy' => 'Trastorno de disco cervical con mielopatia',
        'Cervical disc disorder, unspecified' => 'Trastorno de disco cervical no especificado',
        'Other cervical disc disorders' => 'Otros trastornos de disco cervical',
        'without mention of' => 'sin mencion de',
        'unspecified' => 'no especificado',
    ];

    $wordMap = [
        'disease' => 'enfermedad',
        'diseases' => 'enfermedades',
        'disorder' => 'trastorno',
        'disorders' => 'trastornos',
        'syndrome' => 'sindrome',
        'chronic' => 'cronico',
        'acute' => 'agudo',
        'other' => 'otro',
        'others' => 'otros',
        'with' => 'con',
        'without' => 'sin',
        'and' => 'y',
        'or' => 'o',
        'of' => 'de',
        'the' => '',
        'unspecified' => 'no especificado',
        'injury' => 'lesion',
        'injuries' => 'lesiones',
        'fracture' => 'fractura',
        'sprain' => 'esguince',
        'strain' => 'distension',
        'pain' => 'dolor',
        'failure' => 'insuficiencia',
        'infection' => 'infeccion',
        'infections' => 'infecciones',
        'viral' => 'viral',
        'bacterial' => 'bacteriana',
        'parasitic' => 'parasitarias',
        'malignant' => 'maligno',
        'benign' => 'benigno',
        'primary' => 'primario',
        'secondary' => 'secundario',
        'left' => 'izquierdo',
        'right' => 'derecho',
        'bilateral' => 'bilateral',
        'cervical' => 'cervical',
        'thoracic' => 'toracico',
        'lumbar' => 'lumbar',
        'sacral' => 'sacro',
        'disc' => 'disco',
        'radiculopathy' => 'radiculopatia',
        'myelopathy' => 'mielopatia',
        'displacement' => 'desplazamiento',
        'degeneration' => 'degeneracion',
        'respiratory' => 'respiratorio',
        'circulatory' => 'circulatorio',
        'digestive' => 'digestivo',
        'nervous' => 'nervioso',
        'genitourinary' => 'genitourinario',
        'system' => 'sistema',
        'connective' => 'conjuntivo',
        'tissue' => 'tejido',
    ];

    foreach ($phraseMap as $en => $es) {
        $text = str_ireplace($en, $es, $text);
    }

    foreach ($wordMap as $en => $es) {
        $pattern = '/\\b' . preg_quote($en, '/') . '\\b/i';
        $text = preg_replace($pattern, $es, $text) ?? $text;
    }

    $text = preg_replace('/\\s+/', ' ', $text) ?? $text;
    $text = preg_replace('/\\s+([,;:\|\\)])/', '$1', $text) ?? $text;
    $text = preg_replace('/([\\(\\|])\\s+/', '$1', $text) ?? $text;
    return trim($text);
}

try {
    $pdo = openPdo();
    ensureEsColumns($pdo);

    $dbName = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();

    $stmtSelect = $pdo->query(
        "SELECT id, codigo, nombre, categoria, subcategoria, descripcion, nombre_es, categoria_es, subcategoria_es, descripcion_es
         FROM cie10
         WHERE activo = 1"
    );

    $rows = $stmtSelect->fetchAll();
    $toUpdate = [];

    foreach ($rows as $row) {
        $nombreEs = trim((string)($row['nombre_es'] ?? ''));
        $categoriaEs = trim((string)($row['categoria_es'] ?? ''));
        $subcategoriaEs = trim((string)($row['subcategoria_es'] ?? ''));
        $descripcionEs = trim((string)($row['descripcion_es'] ?? ''));

        $newNombreEs = ($nombreEs === '' || strcasecmp($nombreEs, (string)$row['nombre']) === 0)
            ? translateToEs((string)$row['nombre'])
            : $nombreEs;
        $newCategoriaEs = ($categoriaEs === '' || strcasecmp($categoriaEs, (string)$row['categoria']) === 0)
            ? translateToEs((string)$row['categoria'])
            : $categoriaEs;
        $newSubcategoriaEs = ($subcategoriaEs === '' || strcasecmp($subcategoriaEs, (string)$row['subcategoria']) === 0)
            ? translateToEs((string)$row['subcategoria'])
            : $subcategoriaEs;
        $newDescripcionEs = ($descripcionEs === '' || strcasecmp($descripcionEs, (string)$row['descripcion']) === 0)
            ? translateToEs((string)$row['descripcion'])
            : $descripcionEs;

        if (
            $newNombreEs !== $nombreEs ||
            $newCategoriaEs !== $categoriaEs ||
            $newSubcategoriaEs !== $subcategoriaEs ||
            $newDescripcionEs !== $descripcionEs
        ) {
            $toUpdate[] = [
                'id' => (int)$row['id'],
                'nombre_es' => $newNombreEs,
                'categoria_es' => $newCategoriaEs,
                'subcategoria_es' => $newSubcategoriaEs,
                'descripcion_es' => $newDescripcionEs,
            ];
        }
    }

    $pdo->beginTransaction();
    $stmtUpdate = $pdo->prepare(
        'UPDATE cie10
         SET nombre_es = :nombre_es,
             categoria_es = :categoria_es,
             subcategoria_es = :subcategoria_es,
             descripcion_es = :descripcion_es
         WHERE id = :id'
    );

    foreach ($toUpdate as $u) {
        $stmtUpdate->execute([
            ':id' => $u['id'],
            ':nombre_es' => $u['nombre_es'],
            ':categoria_es' => $u['categoria_es'],
            ':subcategoria_es' => $u['subcategoria_es'],
            ':descripcion_es' => $u['descripcion_es'],
        ]);
    }
    $pdo->commit();

    $countEs = (int)$pdo->query("SELECT COUNT(*) FROM cie10 WHERE activo = 1 AND COALESCE(NULLIF(nombre_es, ''), '') <> ''")->fetchColumn();
    $countDistinct = (int)$pdo->query("SELECT COUNT(*) FROM cie10 WHERE activo = 1 AND COALESCE(NULLIF(nombre_es, ''), '') <> '' AND nombre_es <> nombre")->fetchColumn();

    echo 'Base: ' . $dbName . PHP_EOL;
    echo 'Filas activas: ' . count($rows) . PHP_EOL;
    echo 'Filas actualizadas: ' . count($toUpdate) . PHP_EOL;
    echo 'Con nombre_es: ' . $countEs . PHP_EOL;
    echo 'Con nombre_es distinto a EN: ' . $countDistinct . PHP_EOL;
    echo 'Completado: traduccion automatica masiva ES aplicada.' . PHP_EOL;
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Error en traduccion masiva CIE10 ES: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
