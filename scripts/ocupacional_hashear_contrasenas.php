<?php
// Convierte a hash (password_hash) las contraseñas de empresas ocupacionales que siguen en texto plano.
//
//   php scripts/ocupacional_hashear_contrasenas.php            # simulacro: solo cuenta
//   php scripts/ocupacional_hashear_contrasenas.php --aplicar  # aplica (haga respaldo antes)
//
// - Opera sobre la instancia actual (misma conexión que usan las APIs; respeta DB_OCUP_*).
// - Se niega a correr con OCUP_PASSWORDS_VISIBLES=1, porque ese modo necesita el texto plano para mostrarlo al administrador.
// - Nunca imprime contraseñas: solo cantidades por empresa (id y RUC).
// - Idempotente: lo que ya es hash no se toca. Las contraseñas siguen sirviendo (el login verifica hash o texto plano).
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../modules/OcupacionalSecretos.php';

$aplicar = in_array('--aplicar', $argv ?? [], true);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../modules/ModulosInstalacion.php';
if (!ModulosInstalacion::habilitado(isset($mysqli) && $mysqli ? $mysqli : null, 'ocupacional')) {
    fwrite(STDERR, "El módulo 'ocupacional' no está activo en esta instalación. Nada que hacer.\n");
    exit(1);
}

require_once __DIR__ . '/../db_ocupacional.php';

if (OcupacionalSecretos::visibles()) {
    fwrite(STDERR, "OCUP_PASSWORDS_VISIBLES=1: las contraseñas deben quedar en texto plano para mostrarse. Apague el interruptor antes de hashear.\n");
    exit(1);
}

$res = $mysqliOcup->query('SELECT id, ruc, rrhh_password, doctor_password FROM empresas_ocupacionales');
if (!$res) {
    fwrite(STDERR, "No se pudo leer empresas_ocupacionales: " . $mysqliOcup->error . "\n");
    exit(2);
}

$pendientes = 0;
$convertidas = 0;
while ($row = $res->fetch_assoc()) {
    foreach (['rrhh_password', 'doctor_password'] as $campo) {
        $valor = (string) ($row[$campo] ?? '');
        if ($valor === '' || OcupacionalSecretos::esHash($valor)) {
            continue;
        }
        $pendientes++;
        echo ($aplicar ? 'Hasheando' : 'Pendiente') . " {$campo} de la empresa id={$row['id']} RUC={$row['ruc']}\n";
        if ($aplicar) {
            $hash = OcupacionalSecretos::hashear($valor);
            $stmt = $mysqliOcup->prepare("UPDATE empresas_ocupacionales SET {$campo} = ? WHERE id = ? AND {$campo} = ? LIMIT 1");
            $id = (int) $row['id'];
            $stmt->bind_param('sis', $hash, $id, $valor);
            $stmt->execute();
            $convertidas += $stmt->affected_rows > 0 ? 1 : 0;
            $stmt->close();
        }
    }
}
$res->free();

echo $aplicar
    ? "Convertidas: {$convertidas} de {$pendientes}.\n"
    : "Simulacro: {$pendientes} contraseña(s) en texto plano. Use --aplicar para convertirlas (con respaldo previo).\n";
exit(0);
