<?php
require_once __DIR__ . '/../config/db_resolver.php';

function cie10DecodeValue(?string $value): string
{
    $value = $value ?? '';
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    return trim(mb_convert_encoding($value, 'UTF-8', 'ISO-8859-1'));
}

function cie10OpenPdo(): PDO
{
    $runtimeConfig = resolve_db_runtime_config(dirname(__DIR__));
    $host = (string)($runtimeConfig['DB_HOST'] ?? '127.0.0.1');
    $name = (string)($runtimeConfig['DB_NAME'] ?? '');
    $user = (string)($runtimeConfig['DB_USER'] ?? '');
    $pass = (string)($runtimeConfig['DB_PASS'] ?? '');
    $port = isset($runtimeConfig['DB_PORT']) ? (int)$runtimeConfig['DB_PORT'] : 3306;

    if ($name === '') {
        throw new RuntimeException('No se pudo resolver DB_NAME para la sincronizacion de CIE10.');
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

function cie10EnsureTable(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS cie10 (
            id INT AUTO_INCREMENT PRIMARY KEY,
            codigo VARCHAR(10) NOT NULL UNIQUE,
            nombre VARCHAR(500) NOT NULL,
            categoria VARCHAR(100),
            subcategoria VARCHAR(255),
            descripcion TEXT,
            activo TINYINT(1) DEFAULT 1,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_codigo (codigo),
            INDEX idx_nombre (nombre),
            INDEX idx_categoria (categoria),
            FULLTEXT(nombre, descripcion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $columnType = $pdo->query("SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cie10' AND column_name = 'subcategoria'")->fetchColumn();
    if (is_string($columnType) && preg_match('/varchar\((\d+)\)/i', $columnType, $matches) === 1 && (int)$matches[1] < 255) {
        $pdo->exec('ALTER TABLE cie10 MODIFY COLUMN subcategoria VARCHAR(255) NULL');
    }
}

function cie10LoadChapters(string $filePath): array
{
    $chapters = [];
    $handle = fopen($filePath, 'rb');
    if ($handle === false) {
        throw new RuntimeException('No se pudo abrir el archivo de capitulos: ' . $filePath);
    }

    while (($row = fgetcsv($handle, 0, ';')) !== false) {
        if (!isset($row[0], $row[1])) {
            continue;
        }
        $chapterNum = cie10DecodeValue($row[0]);
        $chapterTitle = cie10DecodeValue($row[1]);
        if ($chapterNum === '') {
            continue;
        }
        $chapters[$chapterNum] = $chapterTitle !== '' ? $chapterTitle : 'Sin categoria';
    }

    fclose($handle);
    return $chapters;
}

function cie10LoadGroups(string $filePath): array
{
    $groups = [];
    $handle = fopen($filePath, 'rb');
    if ($handle === false) {
        throw new RuntimeException('No se pudo abrir el archivo de grupos: ' . $filePath);
    }

    while (($row = fgetcsv($handle, 0, ';')) !== false) {
        if (!isset($row[0], $row[1], $row[3])) {
            continue;
        }
        $from = cie10DecodeValue($row[0]);
        $to = cie10DecodeValue($row[1]);
        $title = cie10DecodeValue($row[3]);
        if ($from === '' || $to === '') {
            continue;
        }
        $groups[] = [
            'from' => $from,
            'to' => $to,
            'title' => $title !== '' ? $title : 'Sin subcategoria',
        ];
    }

    fclose($handle);
    return $groups;
}

function cie10FindGroupTitle(array $groups, string $codigo): string
{
    $prefix = substr(str_replace('.', '', $codigo), 0, 3);
    foreach ($groups as $group) {
        if ($prefix >= $group['from'] && $prefix <= $group['to']) {
            return $group['title'];
        }
    }

    return 'Sin subcategoria';
}

function cie10LoadOfficialCatalog(string $codesPath, array $chapters, array $groups): array
{
    $catalog = [];
    $handle = fopen($codesPath, 'rb');
    if ($handle === false) {
        throw new RuntimeException('No se pudo abrir el archivo de codigos: ' . $codesPath);
    }

    while (($row = fgetcsv($handle, 0, ';')) !== false) {
        if (count($row) < 11) {
            continue;
        }

        $tipo = cie10DecodeValue($row[1] ?? '');
        $codigo = cie10DecodeValue($row[6] ?? '');
        if ($tipo !== 'T' || $codigo === '' || strpos($codigo, '-') !== false) {
            continue;
        }

        $chapterNum = cie10DecodeValue($row[3] ?? '');
        $groupNum = cie10DecodeValue($row[4] ?? '');
        $nombre = cie10DecodeValue($row[10] ?? '');
        if ($nombre === '') {
            $nombre = cie10DecodeValue($row[8] ?? '');
        }
        if ($nombre === '') {
            $nombre = cie10DecodeValue($row[9] ?? '');
        }
        if ($nombre === '') {
            $nombre = $codigo;
        }

        $categoria = $chapters[$chapterNum] ?? 'Sin categoria';
        $subcategoria = cie10FindGroupTitle($groups, $codigo);
        $descripcion = 'OMS ICD-10 2019 | Capitulo ' . $chapterNum;
        if ($groupNum !== '') {
            $descripcion .= ' | Grupo ' . $groupNum;
        }

        $catalog[$codigo] = [
            'codigo' => $codigo,
            'nombre' => $nombre,
            'categoria' => $categoria,
            'subcategoria' => $subcategoria,
            'descripcion' => $descripcion,
        ];
    }

    fclose($handle);

    ksort($catalog);
    return array_values($catalog);
}

function cie10BackupTable(PDO $pdo): void
{
    $pdo->exec('DROP TABLE IF EXISTS cie10_backup_sync');
    $pdo->exec('CREATE TABLE cie10_backup_sync LIKE cie10');
    $pdo->exec('TRUNCATE TABLE cie10_backup_sync');
    $pdo->exec('INSERT INTO cie10_backup_sync SELECT * FROM cie10');
}

try {
    $baseDir = realpath(__DIR__ . '/../data/cie10/icd102019enMeta');
    if ($baseDir === false) {
        throw new RuntimeException('No se encontro la carpeta fuente data/cie10/icd102019enMeta.');
    }

    $chaptersPath = $baseDir . DIRECTORY_SEPARATOR . 'icd102019syst_chapters.txt';
    $groupsPath = $baseDir . DIRECTORY_SEPARATOR . 'icd102019syst_groups.txt';
    $codesPath = $baseDir . DIRECTORY_SEPARATOR . 'icd102019syst_codes.txt';

    foreach ([$chaptersPath, $groupsPath, $codesPath] as $requiredFile) {
        if (!is_file($requiredFile)) {
            throw new RuntimeException('Falta el archivo fuente requerido: ' . $requiredFile);
        }
    }

    $chapters = cie10LoadChapters($chaptersPath);
    $groups = cie10LoadGroups($groupsPath);
    $catalog = cie10LoadOfficialCatalog($codesPath, $chapters, $groups);

    if (empty($catalog)) {
        throw new RuntimeException('La fuente oficial no devolvio codigos CIE10.');
    }

    $pdo = cie10OpenPdo();
    cie10EnsureTable($pdo);

    $dbName = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    $beforeCount = (int)$pdo->query('SELECT COUNT(*) FROM cie10')->fetchColumn();

    cie10BackupTable($pdo);
    $pdo->beginTransaction();
    $pdo->exec('UPDATE cie10 SET activo = 0');

    $stmt = $pdo->prepare(
        'INSERT INTO cie10 (codigo, nombre, categoria, subcategoria, descripcion, activo)
         VALUES (:codigo, :nombre, :categoria, :subcategoria, :descripcion, 1)
         ON DUPLICATE KEY UPDATE
            nombre = VALUES(nombre),
            categoria = VALUES(categoria),
            subcategoria = VALUES(subcategoria),
            descripcion = VALUES(descripcion),
            activo = 1,
            actualizado_en = CURRENT_TIMESTAMP'
    );

    $upserts = 0;
    foreach ($catalog as $row) {
        $stmt->execute([
            ':codigo' => $row['codigo'],
            ':nombre' => $row['nombre'],
            ':categoria' => $row['categoria'],
            ':subcategoria' => $row['subcategoria'],
            ':descripcion' => $row['descripcion'],
        ]);
        $upserts++;
    }

    $pdo->commit();

    $afterCount = (int)$pdo->query('SELECT COUNT(*) FROM cie10')->fetchColumn();
    $activeCount = (int)$pdo->query('SELECT COUNT(*) FROM cie10 WHERE activo = 1')->fetchColumn();

    echo 'Base: ' . $dbName . PHP_EOL;
    echo 'Antes: ' . $beforeCount . PHP_EOL;
    echo 'Catalogo oficial: ' . count($catalog) . PHP_EOL;
    echo 'Upserts ejecutados: ' . $upserts . PHP_EOL;
    echo 'Despues: ' . $afterCount . PHP_EOL;
    echo 'Activos: ' . $activeCount . PHP_EOL;
    echo 'Backup: cie10_backup_sync' . PHP_EOL;
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Error sincronizando CIE10: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}