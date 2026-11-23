<?php
// Autenticación del panel Engineer. Independiente de la tabla `usuarios` y de la sesión de la clínica.
//
// Credenciales: un archivo FUERA de public_html (se busca en ../../clinica-config/engineer.php, es decir fuera de
// public_html en Hostinger, y luego en ../clinica-config/engineer.php para desarrollo; o la ruta de la variable de entorno
// ENGINEER_CONFIG_FILE) que devuelve:
//   ['password_hash' => '<password_hash()>', 'totp_secret' => '<base32>']
// Si el archivo no existe el panel está DESACTIVADO (la API responde 404, como si no existiera).
// Se genera con: php scripts/engineer_setup.php   (la contraseña nunca se imprime ni se guarda en claro).
class EngineerAuth {
    public const SESION_TTL = 1800;          // 30 min de inactividad
    public const MAX_FALLOS_IP = 5;          // por IP
    public const MAX_FALLOS_GLOBAL = 30;     // sumando todas las IP, frena ataques distribuidos
    public const VENTANA_SEG = 900;          // 15 min

    /** @return string|null ruta del archivo de configuración o null si no existe */
    public static function rutaConfig(?string $baseDir = null): ?string {
        $forzado = trim((string)(getenv('ENGINEER_CONFIG_FILE') ?: ''));
        if ($forzado !== '') {
            return is_file($forzado) ? $forzado : null;
        }
        $baseDir = $baseDir ?? dirname(__DIR__);
        // Orden de búsqueda: primero FUERA de public_html (en Hostinger la app está en .../public_html/sistema, así que
        // dos niveles arriba es .../domains/<dominio>/clinica-config) y luego un nivel arriba (desarrollo local).
        $candidatas = [
            dirname($baseDir, 2) . DIRECTORY_SEPARATOR . 'clinica-config' . DIRECTORY_SEPARATOR . 'engineer.php',
            dirname($baseDir) . DIRECTORY_SEPARATOR . 'clinica-config' . DIRECTORY_SEPARATOR . 'engineer.php',
        ];
        foreach ($candidatas as $ruta) {
            if (is_file($ruta)) {
                return $ruta;
            }
        }
        return null;
    }

    /** @return array{password_hash:string,totp_secret:string}|null */
    public static function cargarConfig(?string $ruta = null): ?array {
        $ruta = $ruta ?? self::rutaConfig();
        if ($ruta === null || !is_file($ruta)) {
            return null;
        }
        $cfg = (static function (string $f) {
            return require $f;
        })($ruta);
        if (!is_array($cfg) || empty($cfg['password_hash']) || empty($cfg['totp_secret'])) {
            return null;
        }
        return ['password_hash' => (string)$cfg['password_hash'], 'totp_secret' => (string)$cfg['totp_secret']];
    }

    // ---------------- TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) ----------------

    public static function base32Decode(string $b32): string {
        $alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $b32 = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $b32));
        $bits = '';
        foreach (str_split($b32) as $c) {
            $bits .= str_pad(decbin(strpos($alfabeto, $c)), 5, '0', STR_PAD_LEFT);
        }
        $bin = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $bin .= chr(bindec($byte));
            }
        }
        return $bin;
    }

    public static function base32Encode(string $bin): string {
        $alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $bits = '';
        foreach (str_split($bin) as $c) {
            $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $trozo) {
            $out .= $alfabeto[bindec(str_pad($trozo, 5, '0', STR_PAD_RIGHT))];
        }
        return $out;
    }

    public static function totpCodigo(string $secretoB32, int $contador): string {
        $clave = self::base32Decode($secretoB32);
        $hash = hash_hmac('sha1', pack('J', $contador), $clave, true);
        $offset = ord($hash[19]) & 0x0F;
        $num = ((ord($hash[$offset]) & 0x7F) << 24) | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8) | ord($hash[$offset + 3]);
        return str_pad((string)($num % 1000000), 6, '0', STR_PAD_LEFT);
    }

    /** @return int|null contador (paso de 30 s) que coincide, o null. Tolera ±1 paso por desfase de reloj. */
    public static function totpVerificar(string $secretoB32, string $codigo, ?int $ahora = null): ?int {
        $codigo = preg_replace('/\s+/', '', $codigo);
        if (!preg_match('/^\d{6}$/', $codigo)) {
            return null;
        }
        $paso = intdiv($ahora ?? time(), 30);
        for ($d = -1; $d <= 1; $d++) {
            if (hash_equals(self::totpCodigo($secretoB32, $paso + $d), $codigo)) {
                return $paso + $d;
            }
        }
        return null;
    }

    // ---------------- Límite de intentos (archivos temporales, no requieren BD) ----------------

    /** Carpeta de los archivos de límite de intentos. Solo se cambia en pruebas. */
    public static $dirTemporal = null;

    private static function archivoLimite(string $clave): string {
        $dir = self::$dirTemporal ?? sys_get_temp_dir();
        return rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . 'engineer_rl_' . hash('sha256', $clave) . '.json';
    }

    private static function leerFallos(string $clave, int $ahora): array {
        $f = self::archivoLimite($clave);
        $datos = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
        $lista = is_array($datos) ? $datos : [];
        return array_values(array_filter($lista, static function ($t) use ($ahora) {
            return is_int($t) && $t > $ahora - self::VENTANA_SEG;
        }));
    }

    public static function bloqueado(string $ip, ?int $ahora = null): bool {
        $ahora = $ahora ?? time();
        return count(self::leerFallos('ip:' . $ip, $ahora)) >= self::MAX_FALLOS_IP
            || count(self::leerFallos('global', $ahora)) >= self::MAX_FALLOS_GLOBAL;
    }

    public static function registrarFallo(string $ip, ?int $ahora = null): void {
        $ahora = $ahora ?? time();
        foreach (['ip:' . $ip, 'global'] as $clave) {
            $lista = self::leerFallos($clave, $ahora);
            $lista[] = $ahora;
            @file_put_contents(self::archivoLimite($clave), json_encode($lista), LOCK_EX);
        }
    }

    public static function limpiarFallos(string $ip): void {
        @unlink(self::archivoLimite('ip:' . $ip));
    }

    /** Evita reutilizar el mismo código TOTP (replay): solo se acepta un contador mayor al último usado. */
    public static function totpYaUsado(int $contador): bool {
        $f = self::archivoLimite('totp_ultimo');
        $ultimo = is_file($f) ? (int)@file_get_contents($f) : 0;
        return $contador <= $ultimo;
    }

    public static function totpMarcarUsado(int $contador): void {
        @file_put_contents(self::archivoLimite('totp_ultimo'), (string)$contador, LOCK_EX);
    }

    // ---------------- Login ----------------

    /**
     * @return array{ok:bool,codigo:string}  codigo: ok | bloqueado | invalido | desactivado
     * No distingue qué factor falló (contraseña o código) para no dar pistas.
     */
    public static function intentarLogin(string $password, string $codigoTotp, string $ip, ?array $cfg = null, ?int $ahora = null): array {
        $cfg = $cfg ?? self::cargarConfig();
        if ($cfg === null) {
            return ['ok' => false, 'codigo' => 'desactivado'];
        }
        if (self::bloqueado($ip, $ahora)) {
            return ['ok' => false, 'codigo' => 'bloqueado'];
        }

        $okPass = password_verify($password, $cfg['password_hash']);
        $contador = self::totpVerificar($cfg['totp_secret'], $codigoTotp, $ahora);
        $okTotp = $contador !== null && !self::totpYaUsado($contador);

        if (!($okPass && $okTotp)) {
            self::registrarFallo($ip, $ahora);
            return ['ok' => false, 'codigo' => 'invalido'];
        }

        self::totpMarcarUsado($contador);
        self::limpiarFallos($ip);
        return ['ok' => true, 'codigo' => 'ok'];
    }

    // ---------------- Sesión del panel ----------------

    public static function iniciarSesion(): string {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }
        $_SESSION['engineer'] = ['ts' => time(), 'csrf' => bin2hex(random_bytes(32))];
        return $_SESSION['engineer']['csrf'];
    }

    public static function cerrarSesion(): void {
        unset($_SESSION['engineer']);
    }

    /** Sesión vigente (renueva la inactividad). */
    public static function sesionActiva(?int $ahora = null): bool {
        $ahora = $ahora ?? time();
        $s = $_SESSION['engineer'] ?? null;
        if (!is_array($s) || empty($s['ts']) || empty($s['csrf'])) {
            return false;
        }
        if ($ahora - (int)$s['ts'] > self::SESION_TTL) {
            unset($_SESSION['engineer']);
            return false;
        }
        $_SESSION['engineer']['ts'] = $ahora;
        return true;
    }

    public static function csrfValido(string $enviado): bool {
        $esperado = (string)($_SESSION['engineer']['csrf'] ?? '');
        return $esperado !== '' && $enviado !== '' && hash_equals($esperado, $enviado);
    }
}
