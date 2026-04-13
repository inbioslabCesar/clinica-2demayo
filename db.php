<?php
// db.php - conexión centralizada para APIs
require_once __DIR__ . '/config.php';
try {
    $dbPort = defined('DB_PORT') ? (int) DB_PORT : (int) (getenv('DB_PORT') ?: 3306);
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME;
    if ($dbPort > 0) {
        $dsn .= ";port=" . $dbPort;
    }

    $pdo = new PDO(
        $dsn,
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8"
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Error de conexión a la base de datos"]);
    exit;
}

?>
