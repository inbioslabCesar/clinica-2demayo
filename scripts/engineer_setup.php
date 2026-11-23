<?php
// Configura el acceso del panel Engineer. Solo CLI. Ejecútelo USTED en el servidor o en su PC.
//
//   php scripts/engineer_setup.php --salida=../clinica-config/engineer.php
//
// Pide la contraseña dos veces (no se imprime ni se guarda en claro: solo su hash) y genera el secreto
// para la app de autenticación (Google Authenticator, Authy, etc.). El archivo queda fuera de public_html.
// Si el archivo ya existe se niega a sobrescribirlo salvo con --forzar.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo linea de comandos.');
}
require_once __DIR__ . '/../modules/EngineerAuth.php';

$salida = null;
$forzar = false;
foreach (array_slice($argv, 1) as $a) {
    if (strpos($a, '--salida=') === 0) {
        $salida = substr($a, 9);
    } elseif ($a === '--forzar') {
        $forzar = true;
    } else {
        fwrite(STDERR, "Opcion desconocida: $a\n");
        exit(1);
    }
}
if ($salida === null || $salida === '') {
    fwrite(STDERR, "Uso: php scripts/engineer_setup.php --salida=../clinica-config/engineer.php [--forzar]\n");
    exit(1);
}
if (is_file($salida) && !$forzar) {
    fwrite(STDERR, "Ya existe $salida. Use --forzar para reemplazarlo (invalida el acceso anterior).\n");
    exit(1);
}

function leer_oculto(string $pregunta): string {
    echo $pregunta;
    $esWin = DIRECTORY_SEPARATOR === '\\';
    if ($esWin) {
        $cmd = 'powershell -NoProfile -Command "$p = Read-Host -AsSecureString; '
            . '[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p))"';
        $v = rtrim((string)shell_exec($cmd), "\r\n");
    } else {
        shell_exec('stty -echo');
        $v = rtrim((string)fgets(STDIN), "\r\n");
        shell_exec('stty echo');
        echo "\n";
    }
    return $v;
}

$p1 = leer_oculto('Contrasena del panel (minimo 12 caracteres): ');
$p2 = leer_oculto('Repita la contrasena: ');
if ($p1 !== $p2) {
    fwrite(STDERR, "No coinciden.\n");
    exit(1);
}
if (strlen($p1) < 12) {
    fwrite(STDERR, "Demasiado corta (minimo 12 caracteres).\n");
    exit(1);
}

$secreto = EngineerAuth::base32Encode(random_bytes(20));
$contenido = "<?php\n// Acceso del panel Engineer. NO versionar ni subir a public_html.\nreturn [\n"
    . "    'password_hash' => " . var_export(password_hash($p1, PASSWORD_DEFAULT), true) . ",\n"
    . "    'totp_secret' => " . var_export($secreto, true) . ",\n];\n";

$dir = dirname($salida);
if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
    fwrite(STDERR, "No se pudo crear $dir\n");
    exit(1);
}
if (file_put_contents($salida, $contenido, LOCK_EX) === false) {
    fwrite(STDERR, "No se pudo escribir $salida\n");
    exit(1);
}
@chmod($salida, 0600);

echo "\nArchivo creado: $salida\n";
echo "Agregue este secreto a su app de autenticacion (entrada manual, tipo basado en tiempo):\n";
echo "  $secreto\n";
echo "  otpauth://totp/Engineer?secret=$secreto&issuer=Clinica&digits=6&period=30\n";
echo "Anotelo en un lugar seguro: si lo pierde, hay que volver a ejecutar este script con --forzar.\n";
