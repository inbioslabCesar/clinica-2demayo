<?php

if (!function_exists('db_load_env_file')) {
    function db_load_env_file($filePath)
    {
        if (!is_file($filePath)) {
            return;
        }

        $lines = @file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0) {
                continue;
            }

            $parts = explode('=', $line, 2);
            if (count($parts) !== 2) {
                continue;
            }

            $key = trim($parts[0]);
            $value = trim($parts[1]);
            $value = trim($value, "\"'");
            if ($key === '') {
                continue;
            }

            if (getenv($key) === false) {
                putenv($key . '=' . $value);
            }

            if (!isset($_ENV[$key])) {
                $_ENV[$key] = $value;
            }
        }
    }
}

if (!function_exists('db_host_to_instance_key')) {
    function db_host_to_instance_key($host)
    {
        $host = strtolower(trim((string)$host));
        if ($host === '') {
            return 'default';
        }

        $host = preg_replace('/:\\d+$/', '', $host);
        $host = preg_replace('/[^a-z0-9]+/', '_', $host);
        $host = trim((string)$host, '_');
        return $host !== '' ? $host : 'default';
    }
}

if (!function_exists('db_read_instance_config')) {
    function db_read_instance_config($filePath)
    {
        if (!is_file($filePath)) {
            return [];
        }

        $data = require $filePath;
        return is_array($data) ? $data : [];
    }
}

if (!function_exists('resolve_db_runtime_config')) {
    function resolve_db_runtime_config($baseDir)
    {
        $baseDir = rtrim((string)$baseDir, DIRECTORY_SEPARATOR);

        db_load_env_file($baseDir . DIRECTORY_SEPARATOR . '.env');
        db_load_env_file($baseDir . DIRECTORY_SEPARATOR . '.env.local');

        $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost';
        $instanceFromHost = db_host_to_instance_key($host);
        $instanceFromEnv = trim((string)(getenv('CLINICA_INSTANCE') ?: ''));
        $instance = $instanceFromEnv !== '' ? db_host_to_instance_key($instanceFromEnv) : $instanceFromHost;

        $candidateFiles = [];

        $forcedConfigFile = trim((string)(getenv('CLINICA_CONFIG_FILE') ?: ''));
        if ($forcedConfigFile !== '') {
            $candidateFiles[] = $forcedConfigFile;
        }

        $candidateFiles[] = $baseDir . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'instance.local.php';
        $candidateFiles[] = $baseDir . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'instances' . DIRECTORY_SEPARATOR . $instance . '.php';
        $candidateFiles[] = dirname($baseDir) . DIRECTORY_SEPARATOR . 'clinica-config' . DIRECTORY_SEPARATOR . $instance . '.php';

        $config = [];
        $loadedFile = '';
        foreach ($candidateFiles as $file) {
            $data = db_read_instance_config($file);
            if (!empty($data)) {
                $config = array_merge($config, $data);
                $loadedFile = $file;
                break;
            }
        }

        $envMap = [
            'DB_HOST' => getenv('DB_HOST') ?: null,
            'DB_NAME' => getenv('DB_NAME') ?: null,
            'DB_USER' => getenv('DB_USER') ?: null,
            'DB_PASS' => getenv('DB_PASS') ?: null,
            'APP_ENV' => getenv('APP_ENV') ?: null,
        ];

        foreach ($envMap as $key => $value) {
            if ($value !== null && $value !== '') {
                $config[$key] = $value;
            }
        }

        if (empty($config['DB_HOST']) || empty($config['DB_NAME']) || empty($config['DB_USER'])) {
            $localHost = strpos((string)$host, 'localhost') !== false || strpos((string)$host, '127.0.0.1') !== false;
            if ($localHost) {
                $config['DB_HOST'] = $config['DB_HOST'] ?? 'localhost';
                $config['DB_NAME'] = $config['DB_NAME'] ?? 'poli2demayo';
                $config['DB_USER'] = $config['DB_USER'] ?? 'root';
                $config['DB_PASS'] = $config['DB_PASS'] ?? '';
            } else {
                $config['DB_HOST'] = $config['DB_HOST'] ?? 'localhost';
                $config['DB_NAME'] = $config['DB_NAME'] ?? 'u330560936_bd2DeMayo';
                $config['DB_USER'] = $config['DB_USER'] ?? 'u330560936_user2DeMayo';
                $config['DB_PASS'] = $config['DB_PASS'] ?? '2025-10-20Clinica2demayo';
            }
        }

        $appEnv = strtolower(trim((string)($config['APP_ENV'] ?? '')));
        if ($appEnv === '') {
            $isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on';
            $isLocal = strpos((string)$host, 'localhost') !== false || strpos((string)$host, '127.0.0.1') !== false;
            $config['APP_ENV'] = ($isHttps && !$isLocal) ? 'production' : ($isLocal ? 'development' : 'production');
        }

        $config['_meta'] = [
            'instance' => $instance,
            'host' => (string)$host,
            'loaded_file' => $loadedFile,
        ];

        return $config;
    }
}
