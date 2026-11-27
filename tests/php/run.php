<?php
// Runner mínimo de pruebas PHP (sin dependencias).
//   php tests/php/run.php          -> pruebas unitarias (sin BD)
//   php tests/php/run.php --db     -> además, pruebas contra la BD de desarrollo (crean y borran sus propios datos)
$root = dirname(__DIR__, 2);
$conBd = in_array('--db', $argv, true) || getenv('RUN_DB_TESTS') === '1';
$marcador = 'PHPTEST_DELETE_ME';

$pruebas = [];
function prueba(string $nombre, callable $fn, bool $requiereBd = false): void {
    global $pruebas;
    $pruebas[] = [$nombre, $fn, $requiereBd];
}
function iguales($esperado, $actual, string $msg = ''): void {
    if ($esperado !== $actual) {
        throw new RuntimeException(($msg !== '' ? $msg . ' - ' : '') . 'esperado ' . var_export($esperado, true) . ', obtenido ' . var_export($actual, true));
    }
}
function verdadero($cond, string $msg = 'se esperaba true'): void {
    if (!$cond) throw new RuntimeException($msg);
}

require_once $root . '/modules/AgendaMedicoRegla.php';
require_once $root . '/modules/EpisodioAtencionModule.php';
require_once $root . '/modules/ConsultaClinicaModule.php';
require_once $root . '/modules/ModulosInstalacion.php';
require_once $root . '/modules/EngineerAuth.php';
require_once $root . '/modules/OcupacionalSecretos.php';
require_once $root . '/modules/OcupacionalSesion.php';
require_once $root . '/modules/LimiteIntentos.php';
require_once $root . '/modules/PermisoAnulacion.php';
require_once $root . '/modules/PortalPaciente.php';
require_once $root . '/modules/RecetaProtocolos.php';
require_once $root . '/modules/SeguimientoClinico.php';
require_once $root . '/modules/LicenciaSistema.php';

function licFila(array $extra = []): array {
    return $extra + ['activa' => 1, 'proximo_vencimiento' => '2026-12-31', 'dias_aviso' => 10, 'dias_gracia' => 5, 'prorroga_hasta' => null];
}

prueba('suscripción: al día, aviso, vence hoy, vencida y bloqueada según los días configurados', function () {
    $est = static fn(array $f, string $hoy) => LicenciaSistema::calcularEstado($f, $hoy)['estado'];
    iguales('al_dia', $est(licFila(), '2026-12-20'));
    iguales('aviso', $est(licFila(), '2026-12-21'), 'a 10 días ya avisa');
    iguales('aviso', $est(licFila(), '2026-12-31'), 'el día del vencimiento aún es aviso');
    iguales('vencida', $est(licFila(), '2027-01-01'));
    iguales('vencida', $est(licFila(), '2027-01-05'), 'último día de gracia');
    iguales('bloqueada', $est(licFila(), '2027-01-06'));
    $e = LicenciaSistema::calcularEstado(licFila(), '2026-12-21');
    iguales(10, $e['dias_restantes']);
    iguales('2027-01-05', $e['fecha_limite']);
    iguales(true, LicenciaSistema::calcularEstado(licFila(), '2027-02-01')['bloquea']);
});

prueba('suscripción: la caché de 60 s evita lecturas, se renueva al vencer, conserva el valor ante un error y se puede invalidar', function () {
    $arch = sys_get_temp_dir() . '/lic_test_' . getmypid() . '.json';
    LicenciaSistema::$archivoCache = $arch;
    @unlink($arch);
    $llamadas = 0;
    $fila = licFila();
    $lector = function () use (&$llamadas, $fila) { $llamadas++; return $fila; };
    iguales('2026-12-31', LicenciaSistema::filaConCache($lector, 1000)['proximo_vencimiento']);
    LicenciaSistema::filaConCache($lector, 1030);
    iguales(1, $llamadas, 'dentro de los 60 s no vuelve a leer la BD');
    LicenciaSistema::filaConCache($lector, 1061);
    iguales(2, $llamadas, 'vencida la caché vuelve a leer');
    $falla = function () use (&$llamadas) { $llamadas++; throw new RuntimeException('sin conexion'); };
    iguales('2026-12-31', LicenciaSistema::filaConCache($falla, 1200)['proximo_vencimiento'], 'ante un error conserva el valor anterior');
    iguales(3, $llamadas);
    LicenciaSistema::filaConCache($falla, 1201);
    iguales(3, $llamadas, 'el error también se cachea: no reintenta en cada petición');
    LicenciaSistema::invalidarCache();
    LicenciaSistema::filaConCache($lector, 1202);
    iguales(4, $llamadas, 'invalidar fuerza una lectura nueva');
    @unlink($arch);
    iguales(null, LicenciaSistema::filaConCache(function () { throw new RuntimeException('x'); }, 5000), 'sin caché previa y con error: falla seguro (null)');
    @unlink($arch);
    @unlink($arch . '.lock');
    LicenciaSistema::$archivoCache = null;
});

prueba('suscripción: desactivada, sin fecha o sin fila nunca avisa ni bloquea; la prórroga extiende el uso', function () {
    iguales('desactivada', LicenciaSistema::calcularEstado(null, '2030-01-01')['estado']);
    iguales('desactivada', LicenciaSistema::calcularEstado(licFila(['activa' => 0]), '2030-01-01')['estado']);
    iguales('desactivada', LicenciaSistema::calcularEstado(licFila(['proximo_vencimiento' => null]), '2030-01-01')['estado']);
    iguales(false, LicenciaSistema::calcularEstado(licFila(['dias_gracia' => 0, 'prorroga_hasta' => '2027-01-10']), '2027-01-10')['bloquea']);
    iguales(true, LicenciaSistema::calcularEstado(licFila(['dias_gracia' => 0, 'prorroga_hasta' => '2027-01-10']), '2027-01-11')['bloquea']);
});

prueba('suscripción: el día de pago 31 cae en el último día de los meses cortos y luego vuelve al 31', function () {
    iguales('2027-02-28', LicenciaSistema::siguienteVencimiento('2027-01-31', 31, 'mensual'));
    iguales('2028-02-29', LicenciaSistema::siguienteVencimiento('2028-01-31', 31, 'mensual'), 'bisiesto');
    iguales('2027-03-31', LicenciaSistema::siguienteVencimiento('2027-02-28', 31, 'mensual'));
    iguales('2027-01-31', LicenciaSistema::siguienteVencimiento('2026-12-31', 31, 'mensual'), 'cambio de año');
    iguales('2027-03-15', LicenciaSistema::siguienteVencimiento('2026-12-15', 15, 'trimestral'));
    iguales('2027-12-31', LicenciaSistema::siguienteVencimiento('2026-12-31', 31, 'anual'));
});

prueba('suscripción: cada rol ve solo lo que le corresponde y nunca datos de pago ajenos', function () {
    $fila = licFila(['monto' => '150.00', 'metodos_pago' => json_encode([['tipo' => 'yape', 'numero' => '999111222']])]);
    $aviso = '2026-12-25';
    iguales(true, LicenciaSistema::vistaPara($fila, 'administrador', $aviso)['mostrar']);
    iguales(false, LicenciaSistema::vistaPara($fila, 'administrador', '2026-11-01')['mostrar'], 'al día: nadie ve nada');
    iguales(false, LicenciaSistema::vistaPara(null, 'administrador', $aviso)['mostrar'], 'sin configurar: nadie ve nada');
    iguales(false, LicenciaSistema::vistaPara($fila, 'recepcionista', $aviso)['mostrar'], 'recepción no ve el aviso previo');
    iguales(false, LicenciaSistema::vistaPara($fila, 'medico', $aviso)['mostrar']);
    iguales(true, LicenciaSistema::vistaPara($fila, 'recepcionista', '2027-01-02')['detalle_pago']);
    $med = LicenciaSistema::vistaPara($fila, 'medico', '2027-02-01');
    iguales(true, $med['bloqueado']);
    iguales(false, $med['detalle_pago']);
    verdadero(!isset($med['metodos_pago']) && !isset($med['monto']), 'un médico no recibe cuentas ni monto');
    $adm = LicenciaSistema::vistaPara($fila, 'administrador', '2027-02-01');
    iguales('999111222', $adm['metodos_pago'][0]['numero']);
});

prueba('suscripción: validación de la configuración', function () {
    $ok = ['activa' => 1, 'monto' => '99.5', 'dia_pago' => 31, 'proximo_vencimiento' => '2026-12-31', 'periodicidad' => 'mensual',
        'metodos_pago' => [['tipo' => 'yape', 'numero' => '999'], ['tipo' => 'plin']]];
    $v = LicenciaSistema::validar($ok);
    iguales('99.50', $v['monto']);
    iguales(1, count(json_decode($v['metodos_pago'], true)), 'un método totalmente vacío se descarta');
    foreach ([['dia_pago' => 32], ['dia_pago' => 0], ['proximo_vencimiento' => '2026-02-30'], ['proximo_vencimiento' => ''],
        ['dias_gracia' => 61], ['dias_aviso' => -1], ['periodicidad' => 'semanal'], ['monto' => '-5'], ['contacto_whatsapp' => 'abc'],
        ['metodos_pago' => [['tipo' => 'cripto', 'numero' => '1']]]] as $malo) {
        try {
            LicenciaSistema::validar($malo + $ok);
            throw new RuntimeException('debió rechazar ' . json_encode($malo));
        } catch (InvalidArgumentException $e) {
        }
    }
    iguales(null, LicenciaSistema::validar(['activa' => 0, 'dia_pago' => 1, 'proximo_vencimiento' => ''] )['proximo_vencimiento'], 'desactivada no exige fecha');
});

prueba('anular/eliminar: administrador sí; recepcionista solo con el privilegio; otros roles no', function () {
    $clave = PermisoAnulacion::CLAVE;
    iguales(true, PermisoAnulacion::permitido(['rol' => 'administrador']));
    iguales(false, PermisoAnulacion::permitido(['rol' => 'recepcionista', 'permisos' => ['ver_cotizaciones']]));
    iguales(false, PermisoAnulacion::permitido(['rol' => 'recepcionista', 'permisos' => []]));
    iguales(true, PermisoAnulacion::permitido(['rol' => 'recepcionista', 'permisos' => [$clave]]));
    iguales(true, PermisoAnulacion::permitido(['rol' => 'recepcionista', 'permisos' => json_encode([$clave])]));
    iguales(false, PermisoAnulacion::permitido(['rol' => 'medico', 'permisos' => [$clave]]));
    iguales(false, PermisoAnulacion::permitido(['rol' => 'laboratorista']));
    $_SESSION = [];
    iguales(false, PermisoAnulacion::permitido());
});

prueba('portal del paciente: estado de un resultado según modo, retención y deuda', function () {
    $auto = PortalPaciente::MODO_AUTOMATICO;
    $manual = PortalPaciente::MODO_MANUAL;
    iguales('disponible', PortalPaciente::decidirEstado($auto, null, 0.0, true), 'automático sin deuda');
    iguales('en_revision', PortalPaciente::decidirEstado($auto, 'retenido', 0.0, true), 'retenido por el personal');
    iguales('en_revision', PortalPaciente::decidirEstado($manual, null, 0.0, true), 'manual sin liberar');
    iguales('disponible', PortalPaciente::decidirEstado($manual, 'liberado', 0.0, true), 'manual liberado');
    iguales('pendiente_pago', PortalPaciente::decidirEstado($auto, null, 25.5, true), 'deuda bloquea');
    iguales('pendiente_pago', PortalPaciente::decidirEstado($manual, 'liberado', 25.5, true), 'liberar no salta la deuda');
    iguales('disponible', PortalPaciente::decidirEstado($auto, null, 25.5, false), 'sin bloqueo por deuda configurado');
    iguales('disponible', PortalPaciente::decidirEstado($auto, 'liberado', 0.004, true), 'centavos de redondeo no cuentan');
    iguales('en_revision', PortalPaciente::decidirEstado($auto, 'retenido', 25.5, true), 'la retención se muestra primero');
});

prueba('portal del paciente: PIN, documento y permiso del personal', function () {
    for ($i = 0; $i < 50; $i++) {
        verdadero(PortalPaciente::pinValido(PortalPaciente::generarPin()), 'el PIN generado siempre tiene 6 dígitos');
    }
    foreach (['12345', '1234567', 'abcdef', '12 345', ''] as $malo) {
        iguales(false, PortalPaciente::pinValido($malo), "PIN inválido '$malo'");
    }
    iguales('12345678', PortalPaciente::normalizarDocumento(' 12345678 '));
    iguales('ABC12345', PortalPaciente::normalizarDocumento('abc-123 45'));
    iguales('', PortalPaciente::normalizarDocumento('1234'), 'muy corto');
    iguales('', PortalPaciente::normalizarDocumento('PENDIENTE_COMPLETAR'), 'dato pendiente de completar no es un documento');
    iguales(true, PortalPaciente::staffPermitido(['rol' => 'administrador']));
    iguales(true, PortalPaciente::staffPermitido(['rol' => 'recepcionista', 'permisos' => [PortalPaciente::PERMISO]]));
    iguales(true, PortalPaciente::staffPermitido(['rol' => 'recepcionista', 'permisos' => json_encode([PortalPaciente::PERMISO])]));
    iguales(false, PortalPaciente::staffPermitido(['rol' => 'recepcionista', 'permisos' => ['ver_pacientes']]));
    iguales(false, PortalPaciente::staffPermitido(['rol' => 'laboratorista', 'permisos' => [PortalPaciente::PERMISO]]));
    iguales(false, PortalPaciente::staffPermitido(null));
});

prueba('protocolos de receta: los compartidos los edita cualquier médico; eliminar y cambiar el alcance solo el autor o el administrador', function () {
    $medA = ['admin' => false, 'gestiona' => true, 'medico_id' => 7, 'usuario_id' => 0];
    $medB = ['admin' => false, 'gestiona' => true, 'medico_id' => 9, 'usuario_id' => 0];
    $admin = ['admin' => true, 'gestiona' => true, 'medico_id' => 0, 'usuario_id' => 1];
    $recep = ['admin' => false, 'gestiona' => false, 'medico_id' => 0, 'usuario_id' => 5];

    $personal = ['medico_id' => 7, 'especialidad' => 'Cardiología'];
    iguales(true, RecetaProtocolos::puedeEditar($personal, $medA), 'dueño edita el personal');
    iguales(false, RecetaProtocolos::puedeEditar($personal, $medB), 'otro médico no edita un personal');
    iguales(true, RecetaProtocolos::puedeEditar($personal, $admin));
    iguales(true, RecetaProtocolos::puedeEliminar($personal, $medA));
    iguales(false, RecetaProtocolos::puedeEliminar($personal, $medB));

    $compartido = ['medico_id' => null, 'especialidad' => '', 'autor_medico_id' => 7];
    iguales('general', RecetaProtocolos::alcance(null, ''));
    iguales('especialidad', RecetaProtocolos::alcance(null, 'Pediatría'));
    iguales(true, RecetaProtocolos::puedeEditar($compartido, $medB), 'cualquier médico edita un compartido');
    iguales(true, RecetaProtocolos::puedeEliminar($compartido, $medA), 'el autor elimina');
    iguales(false, RecetaProtocolos::puedeEliminar($compartido, $medB), 'otro médico no elimina un compartido');
    iguales(false, RecetaProtocolos::puedeCambiarAlcance($compartido, $medB), 'otro médico no cambia quién lo ve');
    iguales(true, RecetaProtocolos::puedeEliminar($compartido, $admin));

    $antiguo = ['medico_id' => null, 'especialidad' => 'Pediatría', 'creado_por' => 0];
    iguales(false, RecetaProtocolos::puedeEliminar($antiguo, $medA), 'sin autor registrado solo el administrador elimina');
    iguales(true, RecetaProtocolos::puedeEliminar($antiguo, $admin));

    iguales(false, RecetaProtocolos::puedeEditar($compartido, $recep), 'otros roles solo consultan');
    iguales(false, RecetaProtocolos::puedeEliminar($personal, $recep));

    iguales(true, RecetaProtocolos::visibleEn($personal, 7, 'cardiología'));
    iguales(false, RecetaProtocolos::visibleEn($personal, 9, 'cardiología'));
    iguales(true, RecetaProtocolos::visibleEn($antiguo, 9, 'pediatría'), 'misma especialidad');
    iguales(false, RecetaProtocolos::visibleEn($antiguo, 9, 'cardiología'), 'otra especialidad');
    iguales(true, RecetaProtocolos::visibleEn($compartido, 9, 'cardiología'), 'general: todos');
});

prueba('protocolos de receta: alcance por defecto y limpieza de items conservan el orden', function () {
    iguales('medico', RecetaProtocolos::normalizarAlcance('cualquiera'));
    iguales('general', RecetaProtocolos::normalizarAlcance(' GENERAL '));
    $items = RecetaProtocolos::limpiarItems([['nombre' => 'B'], 'x', ['nombre' => ' '], ['nombre' => 'A'], ['otro' => 1]]);
    iguales(['B', 'A'], array_column($items, 'nombre'), 'orden recibido, sin items inválidos');
    $muchos = array_fill(0, 100, ['nombre' => 'X']);
    iguales(RecetaProtocolos::MAX_ITEMS, count(RecetaProtocolos::limpiarItems($muchos)));
    iguales([], RecetaProtocolos::limpiarItems('no es arreglo'));
});

prueba('seguimiento clínico: actor, búsqueda y paginación se interpretan con reglas estrictas', function () {
    $med = SeguimientoClinico::actorDesdeSesion(['medico_id' => 7, 'medico' => ['nombre' => 'Ana', 'apellido' => 'Paz']]);
    iguales(['medico', false, 7, 'Ana Paz'], [$med['rol'], $med['admin'], $med['medico_id'], $med['nombre']], 'login de médico');
    $adm = SeguimientoClinico::actorDesdeSesion(['usuario' => ['rol' => 'administrador', 'id' => 3, 'nombre' => 'Admin']]);
    iguales([true, 0, 3], [$adm['admin'], $adm['medico_id'], $adm['usuario_id']]);
    $usrMed = SeguimientoClinico::actorDesdeSesion(['usuario' => ['rol' => 'medico', 'id' => 9, 'medico_id' => 5]]);
    iguales(5, $usrMed['medico_id'], 'usuario con rol médico');
    iguales(null, SeguimientoClinico::actorDesdeSesion(['usuario' => ['rol' => 'recepcionista', 'id' => 1]]), 'recepción no entra');
    iguales(null, SeguimientoClinico::actorDesdeSesion([]));

    iguales(['dni', '12345678'], array_values(SeguimientoClinico::normalizarBusqueda(' 12345678 ')));
    iguales(null, SeguimientoClinico::normalizarBusqueda('123'), 'dígitos insuficientes');
    iguales(null, SeguimientoClinico::normalizarBusqueda('ab'), 'texto insuficiente');
    iguales(['texto', 'maria perez'], array_values(SeguimientoClinico::normalizarBusqueda("maria   perez")), 'espacios repetidos');
    iguales(null, SeguimientoClinico::normalizarBusqueda('   '));

    iguales([1, 10, 0], array_values(SeguimientoClinico::paginar(0, 0)), 'por defecto');
    iguales([3, 20, 40], array_values(SeguimientoClinico::paginar(3, 500)), 'tope de 20 por página');
    iguales(10, SeguimientoClinico::paginar(1, -5)['por_pagina']);
});

prueba('seguimiento clínico: resumen de diagnóstico, receta y resultados de laboratorio', function () {
    $dx = SeguimientoClinico::resumenDiagnostico(['diagnosticos' => [
        ['codigo' => 'A1', 'nombre' => 'Presuntivo uno', 'tipo' => 'presuntivo'],
        ['codigo' => 'B2', 'nombre' => 'Definitivo dos', 'tipo' => 'Definitivo'],
    ]]);
    iguales(['B2', 2], [$dx['principal']['codigo'], $dx['total']], 'prefiere el definitivo');
    iguales('Solo uno', SeguimientoClinico::resumenDiagnostico(['diagnosticos' => [['nombre' => 'Solo uno']]])['principal']['nombre']);
    iguales('Resistencia a la insulina', SeguimientoClinico::resumenDiagnostico(['diagnosticos' => [], 'diagnostico' => ' Resistencia a la insulina '])['principal']['nombre'], 'plantilla con texto libre');
    iguales([null, 0], array_values(SeguimientoClinico::resumenDiagnostico(null)));
    iguales(2, SeguimientoClinico::contarReceta(['receta' => [['nombre' => 'A'], ['nombre' => ' '], ['nombre' => 'B'], 'x']]));
    iguales(0, SeguimientoClinico::contarReceta(['receta' => 'texto']));

    $examenes = [['id' => 10, 'nombre' => 'GLUCOSA', 'valores_referenciales' => [
        ['tipo' => 'Parámetro', 'nombre' => 'GLUCOSA ', 'codigo_interno' => 'glucosa', 'unidad' => 'mg/dl', 'referencias' => [['valor' => '70-115']]],
        ['tipo' => 'Parámetro', 'nombre' => 'SIN VALOR', 'codigo_interno' => 'sv'],
        ['tipo' => 'Sección', 'nombre' => 'ENCABEZADO'],
    ]]];
    $res = SeguimientoClinico::resultadosLaboratorio($examenes, ['10__imprimir_examen' => 1, '10__GLUCOSA ' => '100', '10__glucosa' => '100', '10__SIN VALOR' => '']);
    iguales(1, count($res[0]['parametros']), 'omite parámetros sin valor, secciones y claves de formato');
    iguales(['GLUCOSA', '100', 'mg/dl', '70-115'], array_values($res[0]['parametros'][0]));
    $porCodigo = SeguimientoClinico::resultadosLaboratorio($examenes, ['10__glucosa' => '95']);
    iguales('95', $porCodigo[0]['parametros'][0]['valor'], 'usa el código interno si falta el nombre');
});

prueba('seguimiento clínico (BD): busca en toda la clínica, historial ligero y paginado, detalle completo y registro de acceso', function () {
    global $mysqli, $marcador;
    $medicoId = (int)($mysqli->query('SELECT id FROM medicos ORDER BY id LIMIT 1')->fetch_assoc()['id'] ?? 0);
    verdadero($medicoId > 0, 'se necesita al menos un médico en la BD de pruebas');
    $dni = 'T9999947';
    $mysqli->query("DELETE FROM pacientes WHERE dni = '$dni'");
    $mysqli->query("INSERT INTO pacientes (nombre, apellido, historia_clinica, dni, sexo) VALUES ('SEGUIMIENTO', 'PHPTEST', 'HCSEGPHP1', '$dni', 'F')");
    $pacienteId = (int)$mysqli->insert_id;
    $ids = [];
    try {
        $datos1 = json_encode(['diagnosticos' => [['codigo' => 'N95.2', 'nombre' => 'Vaginitis atrófica', 'tipo' => 'definitivo']], 'receta' => [['nombre' => 'FENAZOPIRIDINA'], ['nombre' => 'IBUPROFENO']], 'recomendaciones' => 'Reposo', 'plantilla_libre' => 'Texto propio de la especialidad'], JSON_UNESCAPED_UNICODE);
        foreach ([['2026-01-10', 'completada'], ['2026-02-10', 'completada'], ['2026-03-10', 'cancelada'], ['2026-04-10', 'pendiente']] as [$f, $est]) {
            $mysqli->query("INSERT INTO consultas (paciente_id, medico_id, fecha, hora, estado) VALUES ($pacienteId, $medicoId, '$f', '09:00:00', '$est')");
            $ids[$f] = (int)$mysqli->insert_id;
        }
        $st = $mysqli->prepare('INSERT INTO historia_clinica (consulta_id, paciente_id, datos) VALUES (?, ?, ?)');
        $st->bind_param('iis', $ids['2026-02-10'], $pacienteId, $datos1);
        $st->execute();
        $examenes = json_encode([['id' => 10, 'nombre' => 'GLUCOSA', 'valores_referenciales' => [['tipo' => 'Parámetro', 'nombre' => 'GLUCOSA ', 'codigo_interno' => 'glucosa', 'unidad' => 'mg/dl']]]]);
        $mysqli->query("INSERT INTO ordenes_laboratorio (consulta_id, paciente_id, examenes, fecha, estado) VALUES ({$ids['2026-02-10']}, $pacienteId, '" . $mysqli->real_escape_string($examenes) . "', NOW(), 'completado')");
        $ordenId = (int)$mysqli->insert_id;
        $mysqli->query("INSERT INTO resultados_laboratorio (consulta_id, orden_id, tipo_examen, resultados, fecha) VALUES ({$ids['2026-02-10']}, $ordenId, 'varios', '{\"10__GLUCOSA \":\"101\"}', NOW())");

        // Búsqueda en toda la clínica (sin relación previa con el médico), por DNI exacto, prefijo y nombre.
        iguales($pacienteId, SeguimientoClinico::buscarPacientes($mysqli, $dni)[0]['id'], 'por DNI exacto');
        verdadero(in_array($pacienteId, array_column(SeguimientoClinico::buscarPacientes($mysqli, 'T99999'), 'id'), true), 'por prefijo de DNI');
        verdadero(in_array($pacienteId, array_column(SeguimientoClinico::buscarPacientes($mysqli, 'seguimiento phptest'), 'id'), true), 'por nombre y apellido');
        iguales([], SeguimientoClinico::buscarPacientes($mysqli, 'ab'), 'consulta muy corta no busca');
        iguales([], SeguimientoClinico::buscarPacientes($mysqli, '%%%%'), 'los comodines se escapan');

        // Historial ligero: más reciente primero, sin canceladas, paginado, sin el contenido de la HC.
        $h = SeguimientoClinico::historial($mysqli, $pacienteId, 1, 2, $medicoId);
        iguales(3, $h['total'], 'no cuenta la cancelada');
        iguales([$ids['2026-04-10'], $ids['2026-02-10']], array_column($h['items'], 'consulta_id'), 'orden cronológico inverso, página 1');
        $h2 = SeguimientoClinico::historial($mysqli, $pacienteId, 2, 2, $medicoId);
        iguales([$ids['2026-01-10']], array_column($h2['items'], 'consulta_id'), 'página 2');
        $conHc = $h['items'][1];
        iguales(['N95.2', true, 2, 1, true], [$conHc['diagnostico_principal']['codigo'], $conHc['tiene_hc'], $conHc['recetas'], $conHc['laboratorio'], $conHc['es_mia']]);
        verdadero(!array_key_exists('datos', $conHc) && !array_key_exists('hc_datos', $conHc), 'la línea de tiempo no trae la HC completa');
        iguales(false, SeguimientoClinico::historial($mysqli, $pacienteId, 1, 5, $medicoId + 9999)['items'][0]['es_mia'], 'es_mia solo para el médico de la consulta');

        // Detalle completo bajo demanda: se entrega TODO lo guardado, incluidas claves propias de la plantilla.
        $d = SeguimientoClinico::detalleConsulta($mysqli, $ids['2026-02-10']);
        iguales('Texto propio de la especialidad', $d['historia_clinica']['datos']['plantilla_libre']);
        iguales(2, count($d['historia_clinica']['datos']['receta']));
        iguales('101', $d['laboratorio'][0]['resultados'][0]['parametros'][0]['valor'], 'resultado de laboratorio legible');
        iguales(null, SeguimientoClinico::detalleConsulta($mysqli, 999999999), 'consulta inexistente');
        iguales(null, SeguimientoClinico::detalleConsulta($mysqli, $ids['2026-04-10'])['historia_clinica'], 'consulta sin HC');

        // Registro de acceso: queda constancia de quién abrió qué.
        $actor = ['rol' => 'medico', 'admin' => false, 'medico_id' => $medicoId, 'usuario_id' => 0, 'nombre' => 'Médico de prueba'];
        verdadero(SeguimientoClinico::registrarAcceso($mysqli, $actor, $pacienteId, $ids['2026-02-10'], 'detalle', '127.0.0.1'), 'se registra el acceso');
        $a = $mysqli->query("SELECT rol, medico_id, usuario_id, paciente_id, consulta_id, accion FROM seguimiento_clinico_accesos WHERE paciente_id = $pacienteId ORDER BY id DESC LIMIT 1")->fetch_assoc();
        iguales(['medico', $medicoId, null, $pacienteId, $ids['2026-02-10'], 'detalle'], [$a['rol'], (int)$a['medico_id'], $a['usuario_id'], (int)$a['paciente_id'], (int)$a['consulta_id'], $a['accion']]);
    } finally {
        $mysqli->query("DELETE FROM seguimiento_clinico_accesos WHERE paciente_id = $pacienteId");
        $mysqli->query("DELETE FROM resultados_laboratorio WHERE consulta_id IN (" . (implode(',', $ids) ?: '0') . ")");
        $mysqli->query("DELETE FROM ordenes_laboratorio WHERE paciente_id = $pacienteId");
        $mysqli->query("DELETE FROM historia_clinica WHERE paciente_id = $pacienteId");
        $mysqli->query("DELETE FROM consultas WHERE paciente_id = $pacienteId");
        $mysqli->query("DELETE FROM pacientes WHERE id = $pacienteId");
    }
}, true);

prueba('seguimiento clínico: la solicitud de generar consulta se valida de forma estricta', function () {
    $ahora = new DateTimeImmutable('2026-11-26 10:30:00', new DateTimeZone('America/Lima'));
    $base = ['paciente_id' => 5, 'fecha' => '2026-12-01', 'hora' => '09:20', 'modo' => 'con_cobro', 'client_request_id' => 'seg-abc12345'];
    $r = SeguimientoClinico::validarSolicitud($base, $ahora);
    iguales(true, $r['ok']);
    iguales(['09:20:00', null], [$r['datos']['hora'], $r['datos']['motivo']], 'normaliza la hora y no pide motivo con cobro');

    $falla = function (array $cambios, string $esperado) use ($base, $ahora) {
        $r = SeguimientoClinico::validarSolicitud($cambios + $base, $ahora);
        iguales(false, $r['ok'], $esperado);
        verdadero(stripos($r['error'], $esperado) !== false, "mensaje '{$r['error']}' debía mencionar '$esperado'");
    };
    $falla(['paciente_id' => 0], 'paciente');
    $falla(['fecha' => '2026-02-30'], 'fecha');
    $falla(['fecha' => '2026-11-25'], 'pasó');
    $falla(['fecha' => '2026-11-26', 'hora' => '09:00'], 'pasó');
    iguales(true, SeguimientoClinico::validarSolicitud(['fecha' => '2026-11-26', 'hora' => '11:00'] + $base, $ahora)['ok'], 'hoy con hora futura sí');
    $falla(['hora' => '24:00'], 'hora');
    $falla(['modo' => 'gratis'], 'cobro');
    $falla(['client_request_id' => 'corto'], 'identificador');
    $falla(['client_request_id' => 'seg abc 12345'], 'identificador');

    $sin = ['modo' => 'sin_cobro'] + $base;
    $falla(['modo' => 'sin_cobro', 'motivo' => ''], 'motivo');
    $falla(['modo' => 'sin_cobro', 'motivo' => 'corto'], 'motivo');
    $falla(['modo' => 'sin_cobro', 'motivo' => str_repeat('x', 300)], 'largo');
    $ok = SeguimientoClinico::validarSolicitud(['motivo' => "  Control   posquirúrgico del paciente  "] + $sin, $ahora);
    iguales([true, 'Control posquirúrgico del paciente'], [$ok['ok'], $ok['datos']['motivo']], 'motivo normalizado');
});

prueba('seguimiento clínico (BD): genera consulta con cobro o sin cobro en una sola operación, sin honorarios y sin duplicar', function () {
    global $mysqli;
    $mysqli->query("DELETE FROM medicos WHERE email = 'phptest.seguimiento@test.local'");
    $mysqli->query("INSERT INTO medicos (nombre, apellido, especialidad, email, password, rol) VALUES ('SEGUIMIENTO', 'PHPTEST', 'EspPhpTest', 'phptest.seguimiento@test.local', 'x', 'medico')");
    $medicoId = (int)$mysqli->insert_id;
    $dni = 'T9999948';
    $mysqli->query("DELETE FROM pacientes WHERE dni = '$dni'");
    $mysqli->query("INSERT INTO pacientes (nombre, apellido, historia_clinica, dni, sexo) VALUES ('GENERAR', 'PHPTEST', 'HCSEGPHP2', '$dni', 'M')");
    $pacienteId = (int)$mysqli->insert_id;
    $fecha = '2027-03-15';
    $tarifaId = 0;
    try {
        $mysqli->query("INSERT INTO disponibilidad_medicos (medico_id, fecha, dia_semana, hora_inicio, hora_fin) VALUES ($medicoId, '$fecha', 'lunes', '08:00:00', '09:00:00')");
        $mysqli->query("INSERT INTO tarifas (servicio_tipo, servicio_id, descripcion, precio_particular, precio_seguro, precio_convenio, activo, medico_id, porcentaje_medico, porcentaje_clinica, monto_medico, monto_clinica) VALUES ('consulta', 0, 'Consulta PHPTEST', 80.00, 80.00, 80.00, 1, $medicoId, 50, 50, 0, 0)");
        $tarifaId = (int)$mysqli->insert_id;
        $actor = ['rol' => 'medico', 'admin' => false, 'medico_id' => $medicoId, 'usuario_id' => 0, 'nombre' => 'Seguimiento Phptest'];
        $honorarios = function () use ($mysqli, $medicoId) {
            $a = (int)$mysqli->query("SELECT COUNT(*) n FROM honorarios_por_cobrar WHERE medico_id = $medicoId")->fetch_assoc()['n'];
            $b = (int)$mysqli->query("SELECT COUNT(*) n FROM honorarios_medicos_movimientos WHERE medico_id = $medicoId")->fetch_assoc()['n'];
            return $a + $b;
        };
        $datos = fn(array $c) => SeguimientoClinico::validarSolicitud($c + ['paciente_id' => $pacienteId, 'fecha' => $fecha, 'hora' => '08:00', 'modo' => 'con_cobro', 'client_request_id' => 'seg-con-cobro-1'], new DateTimeImmutable('2026-11-26', new DateTimeZone('America/Lima')))['datos'];

        // Con cobro: consulta falta_cancelar + cotización pendiente con la tarifa del médico, enlazadas por el detalle.
        $r = SeguimientoClinico::generarConsulta($mysqli, $actor, $datos([]), '127.0.0.1');
        iguales(201, $r['http'], json_encode($r['payload']));
        $p = $r['payload'];
        iguales(['con_cobro', 'pendiente', false], [$p['modo'], $p['estado_cotizacion'], $p['reutilizado']]);
        $c = $mysqli->query("SELECT estado, origen_creacion, tipo_consulta, es_control, medico_id FROM consultas WHERE id = {$p['consulta_id']}")->fetch_assoc();
        iguales(['seguimiento_clinico', 'programada', '0', $medicoId], [$c['origen_creacion'], $c['tipo_consulta'], (string)$c['es_control'], (int)$c['medico_id']]);
        verdadero(in_array($c['estado'], ['falta_cancelar', 'pendiente'], true), 'consulta pendiente de pago');
        $ct = $mysqli->query("SELECT total, total_pagado, saldo_pendiente, estado, usuario_id FROM cotizaciones WHERE id = {$p['cotizacion_id']}")->fetch_assoc();
        iguales([80.0, 0.0, 80.0, 'pendiente', 0], [(float)$ct['total'], (float)$ct['total_pagado'], (float)$ct['saldo_pendiente'], $ct['estado'], (int)$ct['usuario_id']]);
        $d = $mysqli->query("SELECT servicio_tipo, medico_id, consulta_id, subtotal FROM cotizaciones_detalle WHERE cotizacion_id = {$p['cotizacion_id']}")->fetch_assoc();
        iguales(['consulta', $medicoId, $p['consulta_id'], 80.0], [$d['servicio_tipo'], (int)$d['medico_id'], (int)$d['consulta_id'], (float)$d['subtotal']]);
        iguales(false, SeguimientoClinico::cotizacionEsExonerada($mysqli, $p['cotizacion_id']), 'con cobro no es exonerada');
        iguales(0, $honorarios(), 'agendar no crea honorarios: nacen al cobrar');

        // Reintento / doble clic con el mismo identificador: devuelve lo creado, no duplica.
        $conteo = fn() => (int)$mysqli->query("SELECT COUNT(*) n FROM consultas WHERE medico_id = $medicoId")->fetch_assoc()['n'] . '/' . (int)$mysqli->query("SELECT COUNT(*) n FROM seguimiento_clinico_consultas WHERE medico_id = $medicoId")->fetch_assoc()['n'];
        $antes = $conteo();
        $r2 = SeguimientoClinico::generarConsulta($mysqli, $actor, $datos([]), '127.0.0.1');
        iguales([200, true, $p['consulta_id'], $p['cotizacion_id']], [$r2['http'], $r2['payload']['reutilizado'], $r2['payload']['consulta_id'], $r2['payload']['cotizacion_id']]);
        iguales($antes, $conteo(), 'sin filas nuevas');

        // Mismo horario con otra solicitud: conflicto; no deja consulta ni cotización a medias.
        $cotAntes = (int)$mysqli->query("SELECT COUNT(*) n FROM cotizaciones WHERE paciente_id = $pacienteId")->fetch_assoc()['n'];
        $r3 = SeguimientoClinico::generarConsulta($mysqli, $actor, $datos(['client_request_id' => 'seg-choque-0001']), '127.0.0.1');
        iguales([409, false], [$r3['http'], $r3['payload']['success']]);
        verdadero(stripos($r3['payload']['error'], 'consulta pendiente') !== false, $r3['payload']['error']);
        iguales($cotAntes, (int)$mysqli->query("SELECT COUNT(*) n FROM cotizaciones WHERE paciente_id = $pacienteId")->fetch_assoc()['n'], 'el conflicto no crea cotización');
        iguales($antes, $conteo(), 'el conflicto no crea consulta');

        // Fuera de la disponibilidad del médico.
        $r4 = SeguimientoClinico::generarConsulta($mysqli, $actor, $datos(['hora' => '15:00', 'client_request_id' => 'seg-fuera-0001']), '127.0.0.1');
        iguales(409, $r4['http']);
        verdadero(stripos($r4['payload']['error'], 'disponibilidad') !== false, $r4['payload']['error']);

        // Sin cobro: cotización EXONERADA de 0 con motivo; ni cobro ni honorario.
        $r5 = SeguimientoClinico::generarConsulta($mysqli, $actor, $datos(['hora' => '08:20', 'modo' => 'sin_cobro', 'motivo' => 'Control posquirúrgico sin costo', 'client_request_id' => 'seg-sin-cobro-1']), '127.0.0.1');
        iguales(201, $r5['http'], json_encode($r5['payload']));
        iguales(['sin_cobro', 'exonerada', 'pendiente'], [$r5['payload']['modo'], $r5['payload']['estado_cotizacion'], $r5['payload']['estado_consulta']]);
        $ct5 = $mysqli->query("SELECT total, saldo_pendiente, estado, observaciones FROM cotizaciones WHERE id = {$r5['payload']['cotizacion_id']}")->fetch_assoc();
        iguales([0.0, 0.0, 'pagado'], [(float)$ct5['total'], (float)$ct5['saldo_pendiente'], $ct5['estado']], 'se guarda como pagado de 0; "exonerada" se deriva al leer');
        verdadero(strpos($ct5['observaciones'], 'Control posquirúrgico sin costo') !== false, 'el motivo queda en la cotización');
        $aud = $mysqli->query("SELECT modo, motivo, medico_id, creado_por_nombre FROM seguimiento_clinico_consultas WHERE consulta_id = {$r5['payload']['consulta_id']}")->fetch_assoc();
        iguales(['sin_cobro', 'Control posquirúrgico sin costo', $medicoId, 'Seguimiento Phptest'], [$aud['modo'], $aud['motivo'], (int)$aud['medico_id'], $aud['creado_por_nombre']], 'auditoría con motivo y responsable');
        iguales(true, SeguimientoClinico::cotizacionEsExonerada($mysqli, $r5['payload']['cotizacion_id']), 'se reconoce como exonerada');
        $filas = [['cotizacion_id' => $r5['payload']['cotizacion_id'], 'cotizacion_estado' => 'pagado'], ['cotizacion_id' => $p['cotizacion_id'], 'cotizacion_estado' => 'pendiente'], ['cotizacion_id' => null, 'cotizacion_estado' => null]];
        SeguimientoClinico::marcarFilasExoneradas($mysqli, $filas);
        iguales(['exonerada', 'pendiente', null], array_column($filas, 'cotizacion_estado'), 'las listas muestran exonerada solo donde corresponde');
        iguales(0, (int)$mysqli->query("SELECT COUNT(*) n FROM cobros WHERE paciente_id = $pacienteId")->fetch_assoc()['n'], 'no hay cobro');
        iguales(0, $honorarios(), 'sin cobro no genera honorarios');

        // Solo un médico puede generar.
        $admin = ['rol' => 'administrador', 'admin' => true, 'medico_id' => 0, 'usuario_id' => 1, 'nombre' => 'Admin'];
        iguales(403, SeguimientoClinico::generarConsulta($mysqli, $admin, $datos(['client_request_id' => 'seg-admin-0001']), '127.0.0.1')['http']);
        iguales(404, SeguimientoClinico::generarConsulta($mysqli, $actor, $datos(['paciente_id' => 999999999, 'client_request_id' => 'seg-nopac-0001']), '127.0.0.1')['http']);
    } finally {
        $cotIds = [];
        $rs = $mysqli->query("SELECT id FROM cotizaciones WHERE paciente_id = $pacienteId");
        while ($row = $rs->fetch_assoc()) $cotIds[] = (int)$row['id'];
        if ($cotIds) {
            $in = implode(',', $cotIds);
            $mysqli->query("DELETE FROM cotizaciones_detalle WHERE cotizacion_id IN ($in)");
            $mysqli->query("DELETE FROM cotizaciones WHERE id IN ($in)");
        }
        $mysqli->query("DELETE FROM seguimiento_clinico_consultas WHERE medico_id = $medicoId");
        $mysqli->query("DELETE FROM seguimiento_clinico_accesos WHERE paciente_id = $pacienteId");
        $mysqli->query("DELETE FROM consultas WHERE paciente_id = $pacienteId");
        $mysqli->query("DELETE FROM disponibilidad_medicos WHERE medico_id = $medicoId");
        if ($tarifaId > 0) $mysqli->query("DELETE FROM tarifas WHERE id = $tarifaId");
        $mysqli->query("DELETE FROM pacientes WHERE id = $pacienteId");
        $mysqli->query("DELETE FROM medicos WHERE id = $medicoId");
    }
}, true);

prueba('portal del paciente: solo se entregan PDF dentro de uploads/informes_imagenologia', function () {
    global $root;
    iguales(null, PortalPaciente::rutaPdfImagenologia('../config.php'), 'no sale de la carpeta');
    iguales(null, PortalPaciente::rutaPdfImagenologia('uploads/informes_imagenologia/../../config.php'));
    iguales(null, PortalPaciente::rutaPdfImagenologia('uploads/informes_imagenologia/no_existe_phptest.pdf'));
    $dir = $root . '/uploads/informes_imagenologia';
    $creada = !is_dir($dir);
    if ($creada) mkdir($dir, 0775, true);
    $archivo = $dir . '/phptest_portal.pdf';
    $otro = $dir . '/phptest_portal.txt';
    file_put_contents($archivo, '%PDF-1.4');
    file_put_contents($otro, 'x');
    try {
        verdadero(PortalPaciente::rutaPdfImagenologia('uploads/informes_imagenologia/phptest_portal.pdf') !== null, 'un PDF de la carpeta sí');
        iguales(null, PortalPaciente::rutaPdfImagenologia('uploads/informes_imagenologia/phptest_portal.txt'), 'solo PDF');
    } finally {
        @unlink($archivo);
        @unlink($otro);
        if ($creada) @rmdir($dir);
    }
});

/* ───────── Unitarias: regla "qué servicios ocupan al médico" ───────── */

prueba('los servicios que realiza el médico ocupan su horario', function () {
    $tipos = agenda_tipos_servicio_ocupan_medico();
    foreach (['consulta', 'ecografia', 'rayosx', 'rx', 'procedimiento', 'operacion', 'cirugia'] as $t) {
        verdadero(in_array($t, $tipos, true), "$t debería ocupar al médico");
    }
});

prueba('laboratorio, farmacia y líneas de paquete no ocupan al médico', function () {
    $tipos = agenda_tipos_servicio_ocupan_medico();
    foreach (['laboratorio', 'farmacia', 'paquete', 'perfil', 'otros'] as $t) {
        verdadero(!in_array($t, $tipos, true), "$t no debería ocupar al médico");
    }
});

prueba('el fragmento SQL respeta el alias de tabla', function () {
    verdadero(strpos(agenda_sql_servicio_ocupa_medico('a'), 'a.servicio_tipo') !== false);
    $sinAlias = agenda_sql_servicio_ocupa_medico('');
    verdadero(strpos($sinAlias, 'servicio_tipo') !== false && strpos($sinAlias, '.servicio_tipo') === false);
    verdadero(strpos(agenda_sql_evento_ocupa_medico('a'), 'a.estado_evento') !== false);
    verdadero(strpos(agenda_sql_consulta_ocupa_medico('c'), 'c.estado') !== false);
});

prueba('estados que liberan el turno: cancelado/anulado/completado/atendido no ocupan', function () {
    foreach (['cancelada', 'anulada', 'completada'] as $e) {
        verdadero(in_array($e, agenda_estados_consulta_liberan(), true), "consulta $e libera");
    }
    foreach (['cancelado', 'no_asistio', 'anulada', 'completado', 'atendido'] as $e) {
        verdadero(in_array($e, agenda_estados_evento_liberan(), true), "evento $e libera");
    }
    foreach (['pendiente', 'confirmado'] as $e) {
        verdadero(!in_array($e, agenda_estados_evento_liberan(), true), "evento $e ocupa");
    }
    foreach (['pendiente', 'falta_cancelar'] as $e) {
        verdadero(!in_array($e, agenda_estados_consulta_liberan(), true), "consulta $e ocupa");
    }
});

/* ───────── Unitarias: módulos y licencias por instalación ───────── */

prueba('módulo apagado o sin fila no está activo', function () {
    iguales(false, ModulosInstalacion::estadoEfectivo(['habilitado' => 0, 'estado' => 'activo'])['activo']);
    iguales('apagado', ModulosInstalacion::estadoEfectivo(['habilitado' => 0])['estado']);
    iguales(false, ModulosInstalacion::estadoEfectivo([])['activo']);
});

prueba('módulo habilitado sin fecha_fin está activo', function () {
    $e = ModulosInstalacion::estadoEfectivo(['habilitado' => 1, 'estado' => 'activo', 'fecha_fin' => null], '2026-11-22');
    iguales(true, $e['activo']);
    iguales('activo', $e['estado']);
});

prueba('licencia vencida entra en gracia y luego se suspende', function () {
    $fila = ['habilitado' => 1, 'estado' => 'activo', 'fecha_fin' => '2026-11-10'];
    iguales('activo', ModulosInstalacion::estadoEfectivo($fila, '2026-11-10')['estado'], 'el último día aún está vigente');
    $gracia = ModulosInstalacion::estadoEfectivo($fila, '2026-11-17');
    iguales('gracia', $gracia['estado']);
    iguales(true, $gracia['activo']);
    $susp = ModulosInstalacion::estadoEfectivo($fila, '2026-11-18');
    iguales('suspendido', $susp['estado']);
    iguales(false, $susp['activo']);
});

prueba('estado suspendido manual apaga el módulo aunque esté habilitado', function () {
    iguales(false, ModulosInstalacion::estadoEfectivo(['habilitado' => 1, 'estado' => 'suspendido'])['activo']);
});

prueba('tabla vacía o fila de clínico ausente: clínico siempre activo, el resto apagado', function () {
    $m = ModulosInstalacion::completarMapa([], '2026-11-22');
    iguales(true, $m['clinico']['activo'], 'tabla creada sin filas (p. ej. por la herramienta de esquema)');
    iguales(false, $m['ocupacional']['activo']);
    iguales(false, $m['portal_empresas']['activo']);
    $conClinicoApagado = ModulosInstalacion::completarMapa(['clinico' => ['habilitado' => 0, 'estado' => 'suspendido']], '2026-11-22');
    iguales(true, $conClinicoApagado['clinico']['activo'], 'ni siquiera una fila manipulada apaga el clínico');
    $conOcup = ModulosInstalacion::completarMapa(['ocupacional' => ['habilitado' => 1, 'estado' => 'activo', 'fecha_fin' => null]], '2026-11-22');
    iguales(true, $conOcup['ocupacional']['activo']);
    iguales(false, $conOcup['portal_empresas']['activo'], 'un módulo sin fila sigue apagado');
});

prueba('seguimiento_clínico: módulo registrado, apagado por defecto, configurable desde el Engineer y con falla segura', function () {
    verdadero(in_array('seguimiento_clinico', ModulosInstalacion::MODULOS, true), 'registrado en la lista de módulos');
    $vacio = ModulosInstalacion::completarMapa([], '2026-11-26');
    iguales(false, $vacio['seguimiento_clinico']['activo'], 'sin fila nace apagado (una clínica sin el módulo no cambia)');
    iguales('apagado', $vacio['seguimiento_clinico']['estado']);
    $on = ModulosInstalacion::completarMapa(['seguimiento_clinico' => ['habilitado' => 1, 'estado' => 'activo', 'fecha_fin' => null]], '2026-11-26');
    iguales(true, $on['seguimiento_clinico']['activo']);
    iguales(false, $on['ocupacional']['activo'], 'activarlo no abre otros módulos');
    $vencido = ModulosInstalacion::completarMapa(['seguimiento_clinico' => ['habilitado' => 1, 'estado' => 'activo', 'fecha_fin' => '2026-11-01']], '2026-11-26');
    iguales(false, $vencido['seguimiento_clinico']['activo'], 'vencido y fuera de gracia se suspende como los demás');
    $ok = ModulosInstalacion::validarCambio('seguimiento_clinico', ['habilitado' => 1, 'estado' => 'activo', 'plan' => 'mensual', 'precio' => '90']);
    iguales(1, $ok['habilitado']);
    ModulosInstalacion::reiniciarCache();
    iguales(false, ModulosInstalacion::habilitado(null, 'seguimiento_clinico'), 'sin conexión o sin tabla queda apagado');
    ModulosInstalacion::reiniciarCache();
});

prueba('sin conexión o sin tabla solo el módulo clínico queda activo', function () {
    ModulosInstalacion::reiniciarCache();
    $mapa = ModulosInstalacion::mapa(null, '2026-11-22');
    iguales(true, $mapa['clinico']['activo']);
    iguales(false, $mapa['ocupacional']['activo']);
    iguales(false, $mapa['portal_empresas']['activo']);
    iguales(false, ModulosInstalacion::habilitado(null, 'modulo_inexistente'));
    ModulosInstalacion::reiniciarCache();
});

/* ───────── Unitarias: panel Engineer (TOTP, login, límites, validación) ───────── */

function engineerTmp(): string {
    $d = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'engineer_test_' . bin2hex(random_bytes(4));
    mkdir($d);
    EngineerAuth::$dirTemporal = $d;
    return $d;
}
function engineerLimpiar(string $d): void {
    foreach (glob($d . DIRECTORY_SEPARATOR . '*') ?: [] as $f) { @unlink($f); }
    @rmdir($d);
    EngineerAuth::$dirTemporal = null;
}
function engineerCfg(string $pass = 'clave-de-prueba-123'): array {
    return ['password_hash' => password_hash($pass, PASSWORD_DEFAULT), 'totp_secret' => EngineerAuth::base32Encode('12345678901234567890')];
}

prueba('TOTP: vector oficial de RFC 6238 y base32', function () {
    iguales('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', EngineerAuth::base32Encode('12345678901234567890'));
    iguales('12345678901234567890', EngineerAuth::base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'));
    $s = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    iguales('287082', EngineerAuth::totpCodigo($s, intdiv(59, 30)));
    iguales('081804', EngineerAuth::totpCodigo($s, intdiv(1111111109, 30)));
    iguales('050471', EngineerAuth::totpCodigo($s, intdiv(1111111111, 30)));
});

prueba('TOTP: acepta ±1 paso, rechaza lo demás y formatos inválidos', function () {
    $s = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    $t = 1111111109;
    $cod = EngineerAuth::totpCodigo($s, intdiv($t, 30));
    iguales(intdiv($t, 30), EngineerAuth::totpVerificar($s, $cod, $t));
    iguales(intdiv($t, 30), EngineerAuth::totpVerificar($s, substr($cod, 0, 3) . ' ' . substr($cod, 3), $t), 'tolera espacios');
    iguales(intdiv($t, 30), EngineerAuth::totpVerificar($s, $cod, $t + 30), 'un paso después aún vale');
    iguales(null, EngineerAuth::totpVerificar($s, $cod, $t + 120), 'dos minutos después no vale');
    iguales(null, EngineerAuth::totpVerificar($s, '12345', $t));
    iguales(null, EngineerAuth::totpVerificar($s, 'abcdef', $t));
    iguales(null, EngineerAuth::totpVerificar($s, '', $t));
});

prueba('login: requiere contraseña Y código; no distingue cuál falló', function () {
    $d = engineerTmp();
    $cfg = engineerCfg();
    $t = 1700000000;
    $bueno = EngineerAuth::totpCodigo($cfg['totp_secret'], intdiv($t, 30));
    $malaPass = EngineerAuth::intentarLogin('otra-clave', $bueno, '10.0.0.1', $cfg, $t);
    $malCodigo = EngineerAuth::intentarLogin('clave-de-prueba-123', '000000', '10.0.0.2', $cfg, $t);
    iguales(['ok' => false, 'codigo' => 'invalido'], $malaPass);
    iguales($malaPass, $malCodigo, 'mismo mensaje para ambos fallos');
    iguales(['ok' => true, 'codigo' => 'ok'], EngineerAuth::intentarLogin('clave-de-prueba-123', $bueno, '10.0.0.3', $cfg, $t));
    engineerLimpiar($d);
});

prueba('login: un código TOTP ya usado no se puede reutilizar (replay)', function () {
    $d = engineerTmp();
    $cfg = engineerCfg();
    $t = 1700000000;
    $cod = EngineerAuth::totpCodigo($cfg['totp_secret'], intdiv($t, 30));
    iguales(true, EngineerAuth::intentarLogin('clave-de-prueba-123', $cod, '10.0.0.1', $cfg, $t)['ok']);
    iguales(false, EngineerAuth::intentarLogin('clave-de-prueba-123', $cod, '10.0.0.1', $cfg, $t)['ok'], 'segundo uso del mismo código');
    engineerLimpiar($d);
});

prueba('login: bloquea tras 5 fallos por IP y no afecta a otra IP', function () {
    $d = engineerTmp();
    $cfg = engineerCfg();
    $t = 1700000000;
    for ($i = 0; $i < EngineerAuth::MAX_FALLOS_IP; $i++) {
        iguales('invalido', EngineerAuth::intentarLogin('mala', '000000', '10.9.9.9', $cfg, $t)['codigo']);
    }
    iguales('bloqueado', EngineerAuth::intentarLogin('mala', '000000', '10.9.9.9', $cfg, $t)['codigo']);
    $bueno = EngineerAuth::totpCodigo($cfg['totp_secret'], intdiv($t, 30));
    iguales('bloqueado', EngineerAuth::intentarLogin('clave-de-prueba-123', $bueno, '10.9.9.9', $cfg, $t)['codigo'], 'ni con credenciales correctas');
    iguales('ok', EngineerAuth::intentarLogin('clave-de-prueba-123', $bueno, '10.1.1.1', $cfg, $t)['codigo'], 'otra IP sigue pudiendo');
    iguales('invalido', EngineerAuth::intentarLogin('mala', '000000', '10.9.9.9', $cfg, $t + EngineerAuth::VENTANA_SEG + 1)['codigo'], 'pasada la ventana se libera');
    engineerLimpiar($d);
});

prueba('login: el límite global frena ataques desde muchas IP', function () {
    $d = engineerTmp();
    $cfg = engineerCfg();
    $t = 1700000000;
    for ($i = 0; $i < EngineerAuth::MAX_FALLOS_GLOBAL; $i++) {
        EngineerAuth::intentarLogin('mala', '000000', '172.16.0.' . ($i + 1), $cfg, $t);
    }
    iguales('bloqueado', EngineerAuth::intentarLogin('mala', '000000', '172.16.9.9', $cfg, $t)['codigo']);
    engineerLimpiar($d);
});

prueba('login: sin configuración el panel está desactivado', function () {
    // Aislar del acceso Engineer real que pueda existir en esta máquina (../clinica-config/engineer.php).
    $previo = getenv('ENGINEER_CONFIG_FILE');
    putenv('ENGINEER_CONFIG_FILE=' . sys_get_temp_dir() . '/no-existe-engineer.php');
    try {
        iguales('desactivado', EngineerAuth::intentarLogin('x', '000000', '10.0.0.1', null, 1700000000)['codigo'] ?? 'desactivado');
    } finally {
        putenv($previo === false ? 'ENGINEER_CONFIG_FILE' : 'ENGINEER_CONFIG_FILE=' . $previo);
    }
    iguales(null, EngineerAuth::cargarConfig(sys_get_temp_dir() . '/no-existe-engineer.php'));
});

prueba('panel Engineer: la configuración se busca primero fuera de public_html y luego un nivel arriba', function () {
    $previo = getenv('ENGINEER_CONFIG_FILE');
    putenv('ENGINEER_CONFIG_FILE');
    $raiz = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'eng_ruta_' . bin2hex(random_bytes(4));
    $app = $raiz . '/domains/x.com/public_html/sistema';
    mkdir($app, 0777, true);
    try {
        iguales(null, EngineerAuth::rutaConfig($app), 'sin archivo no hay ruta');
        mkdir($raiz . '/domains/x.com/public_html/clinica-config', 0777, true);
        file_put_contents($raiz . '/domains/x.com/public_html/clinica-config/engineer.php', '<?php return [];');
        verdadero(str_contains((string)EngineerAuth::rutaConfig($app), 'public_html' . DIRECTORY_SEPARATOR . 'clinica-config'), 'un nivel arriba (desarrollo)');
        mkdir($raiz . '/domains/x.com/clinica-config', 0777, true);
        file_put_contents($raiz . '/domains/x.com/clinica-config/engineer.php', '<?php return [];');
        $ruta = (string)EngineerAuth::rutaConfig($app);
        verdadero(!str_contains($ruta, 'public_html' . DIRECTORY_SEPARATOR . 'clinica-config'), 'si existe fuera de public_html, manda ese');
        verdadero(str_ends_with($ruta, 'x.com' . DIRECTORY_SEPARATOR . 'clinica-config' . DIRECTORY_SEPARATOR . 'engineer.php'));
    } finally {
        if ($previo !== false) { putenv('ENGINEER_CONFIG_FILE=' . $previo); }
        foreach ([$raiz . '/domains/x.com/clinica-config/engineer.php', $raiz . '/domains/x.com/public_html/clinica-config/engineer.php'] as $f) { @unlink($f); }
        foreach ([$raiz . '/domains/x.com/clinica-config', $raiz . '/domains/x.com/public_html/clinica-config', $app, $raiz . '/domains/x.com/public_html', $raiz . '/domains/x.com', $raiz . '/domains', $raiz] as $d) { @rmdir($d); }
    }
});

prueba('sesión del panel: caduca por inactividad y valida CSRF', function () {
    $_SESSION = [];
    iguales(false, EngineerAuth::sesionActiva(1000));
    $_SESSION['engineer'] = ['ts' => 1000, 'csrf' => str_repeat('a', 64)];
    iguales(true, EngineerAuth::sesionActiva(1000 + EngineerAuth::SESION_TTL - 1));
    iguales(true, EngineerAuth::csrfValido(str_repeat('a', 64)));
    iguales(false, EngineerAuth::csrfValido(str_repeat('b', 64)));
    iguales(false, EngineerAuth::csrfValido(''));
    iguales(false, EngineerAuth::sesionActiva(1000 + (EngineerAuth::SESION_TTL - 1) + EngineerAuth::SESION_TTL + 1));
    iguales(false, isset($_SESSION['engineer']), 'se elimina al caducar');
    $_SESSION = [];
});

prueba('validar cambio de módulo: acepta lo correcto y rechaza lo peligroso', function () {
    $ok = ModulosInstalacion::validarCambio('ocupacional', ['habilitado' => 1, 'estado' => 'activo', 'plan' => 'mensual', 'precio' => '150.5', 'moneda' => 'pen', 'fecha_inicio' => '2026-12-01', 'fecha_fin' => '2027-01-01', 'notas' => 'ok']);
    iguales(1, $ok['habilitado']);
    iguales(150.5, $ok['precio']);
    iguales('PEN', $ok['moneda']);
    iguales(null, ModulosInstalacion::validarCambio('portal_empresas', [])['plan']);
    $debeFallar = function (string $mod, array $datos, string $msg) {
        try { ModulosInstalacion::validarCambio($mod, $datos); } catch (InvalidArgumentException $e) { return; }
        throw new RuntimeException("debía rechazar: $msg");
    };
    $debeFallar('clinico', ['habilitado' => 0], 'apagar el módulo clínico');
    $debeFallar('inventado', ['habilitado' => 1], 'módulo desconocido');
    $debeFallar('ocupacional', ['estado' => 'raro'], 'estado inválido');
    $debeFallar('ocupacional', ['fecha_fin' => '2026-02-31'], 'fecha imposible');
    $debeFallar('ocupacional', ['fecha_inicio' => '2026-05-01', 'fecha_fin' => '2026-04-01'], 'fin anterior al inicio');
    $debeFallar('ocupacional', ['precio' => '-5'], 'precio negativo');
    $debeFallar('ocupacional', ['precio' => 'abc'], 'precio no numérico');
    $debeFallar('ocupacional', ['moneda' => 'SOLES'], 'moneda inválida');
    $debeFallar('ocupacional', ['notas' => str_repeat('x', 256)], 'notas demasiado largas');
});

/* ───────── Unitarias: contraseñas de empresas ocupacionales y límite de intentos ───────── */

prueba('secretos ocupacionales: hashea, verifica hash y acepta texto plano heredado', function () {
    $h = OcupacionalSecretos::hashear('Empresa#2026');
    verdadero(OcupacionalSecretos::esHash($h));
    verdadero($h !== 'Empresa#2026');
    verdadero(OcupacionalSecretos::verificar('Empresa#2026', $h));
    verdadero(!OcupacionalSecretos::verificar('otra', $h));
    verdadero(!OcupacionalSecretos::esHash('Empresa#2026'), 'un texto plano no es hash');
    verdadero(OcupacionalSecretos::verificar('clave-vieja', 'clave-vieja'), 'heredada en texto plano sigue valiendo');
    verdadero(!OcupacionalSecretos::verificar('clave-vieja', 'clave-vieja '), 'sin tolerancia a diferencias');
});

prueba('secretos ocupacionales: vacíos nunca autentican', function () {
    verdadero(!OcupacionalSecretos::verificar('', ''));
    verdadero(!OcupacionalSecretos::verificar('x', ''));
    verdadero(!OcupacionalSecretos::verificar('', 'x'));
    verdadero(!OcupacionalSecretos::requiereActualizar(''));
});

prueba('secretos ocupacionales: el texto plano se actualiza a hash y el hash vigente no', function () {
    verdadero(OcupacionalSecretos::requiereActualizar('texto-plano'));
    verdadero(!OcupacionalSecretos::requiereActualizar(OcupacionalSecretos::hashear('algo-seguro-1')));
});

prueba('secretos ocupacionales: al editar, vacío conserva la actual y un valor nuevo se hashea', function () {
    $actual = OcupacionalSecretos::hashear('vigente-123');
    iguales($actual, OcupacionalSecretos::valorParaGuardar('', $actual));
    iguales($actual, OcupacionalSecretos::valorParaGuardar('   ', $actual), 'espacios cuentan como vacío');
    $nuevo = OcupacionalSecretos::valorParaGuardar(' nueva-clave-9 ', $actual);
    verdadero($nuevo !== $actual && OcupacionalSecretos::esHash($nuevo));
    verdadero(OcupacionalSecretos::verificar('nueva-clave-9', $nuevo), 'se recorta antes de hashear');
    verdadero(OcupacionalSecretos::esHash(OcupacionalSecretos::valorParaGuardar('primera-vez', '')), 'alta nueva');
    iguales('', OcupacionalSecretos::valorParaGuardar('', ''), 'sin contraseña definida sigue vacía');
});

prueba('secretos ocupacionales: modo visibles guarda texto plano, no convierte a hash y solo lo muestra a administradores', function () {
    iguales('clave-1', OcupacionalSecretos::valorParaGuardar(' clave-1 ', '', true));
    iguales('vieja', OcupacionalSecretos::valorParaGuardar('', 'vieja', true), 'vacío conserva');
    verdadero(!OcupacionalSecretos::requiereActualizar('texto-plano', true), 'en modo visibles no se convierte a hash');
    iguales('clave-1', OcupacionalSecretos::paraMostrar('clave-1', true, true));
    iguales('', OcupacionalSecretos::paraMostrar('clave-1', false, true), 'no administrador no la ve');
    iguales('', OcupacionalSecretos::paraMostrar('clave-1', true, false), 'modo seguro nunca la devuelve');
    iguales('', OcupacionalSecretos::paraMostrar(OcupacionalSecretos::hashear('x-clave-9'), true, true), 'un hash no se muestra');
    verdadero(!OcupacionalSecretos::visibles(), 'por defecto es modo seguro');
});

prueba('sesion ocupacional: el medico (sesion separada) se ve como usuario de rol medico sin escribir en $_SESSION', function () {
    $antes = $_SESSION ?? null;
    $_SESSION = ['medico_id' => 7, 'medico' => ['id' => 7, 'nombre' => 'Ana', 'apellido' => 'Paz', 'email' => 'ana@x.pe']];
    $u = OcupacionalSesion::usuario();
    iguales('medico', $u['rol']);
    iguales(7, $u['id']);
    iguales(7, $u['medico_id']);
    iguales([], $u['permisos']);
    verdadero(!isset($_SESSION['usuario']), 'no debe crear $_SESSION[usuario]');
    $_SESSION = ['usuario' => ['id' => 3, 'rol' => 'administrador'], 'medico_id' => 7, 'medico' => ['id' => 7]];
    iguales('administrador', OcupacionalSesion::usuario()['rol'], 'si hay usuario, manda el usuario');
    $_SESSION = [];
    iguales(null, OcupacionalSesion::usuario());
    $_SESSION = ['medico_id' => 7];
    iguales(null, OcupacionalSesion::usuario(), 'medico_id sin datos de medico no autentica');
    if ($antes === null) { unset($_SESSION); } else { $_SESSION = $antes; }
});

prueba('límite de intentos: bloquea al llegar al máximo, por clave, y se libera pasada la ventana', function () {
    $d = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'limite_test_' . bin2hex(random_bytes(4));
    mkdir($d);
    LimiteIntentos::$dirTemporal = $d;
    $t = 1700000000;
    for ($i = 0; $i < 3; $i++) {
        verdadero(!LimiteIntentos::bloqueado('portal', ['ip:1.1.1.1', 'cuenta:a'], 3, $t), "aún no bloquea ($i)");
        LimiteIntentos::registrarFallo('portal', ['ip:1.1.1.1', 'cuenta:a'], $t);
    }
    verdadero(LimiteIntentos::bloqueado('portal', ['ip:1.1.1.1'], 3, $t), 'bloquea por IP');
    verdadero(LimiteIntentos::bloqueado('portal', ['ip:9.9.9.9', 'cuenta:a'], 3, $t), 'bloquea por cuenta aunque cambie la IP');
    verdadero(!LimiteIntentos::bloqueado('portal', ['ip:9.9.9.9', 'cuenta:b'], 3, $t), 'otra IP y otra cuenta no');
    verdadero(!LimiteIntentos::bloqueado('otro_espacio', ['ip:1.1.1.1'], 3, $t), 'los espacios no se mezclan');
    verdadero(!LimiteIntentos::bloqueado('portal', ['ip:1.1.1.1'], 3, $t + LimiteIntentos::VENTANA_SEG + 1), 'se libera pasada la ventana');
    LimiteIntentos::limpiar('portal', 'cuenta:a');
    verdadero(!LimiteIntentos::bloqueado('portal', ['cuenta:a'], 3, $t), 'limpiar tras un acceso correcto');
    foreach (glob($d . DIRECTORY_SEPARATOR . '*') ?: [] as $f) { @unlink($f); }
    @rmdir($d);
    LimiteIntentos::$dirTemporal = null;
});

/* ───────── Con BD: ejecuta el SQL real y los endpoints ───────── */

function ejecutarApi(string $endpoint, string $metodo, string $payload): array {
    global $root;
    $tmp = tempnam(sys_get_temp_dir(), 'pt');
    file_put_contents($tmp, $payload);
    $cmd = [PHP_BINARY, $root . '/tests/php/support/http_harness.php', $endpoint, $metodo, $tmp];
    $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $salida = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);
    @unlink($tmp);
    return json_decode(trim($salida), true) ?: ['_raw' => $salida];
}

function ejecutarApiEnParalelo(string $endpoint, string $payload, int $n): array {
    global $root;
    $procesos = [];
    for ($i = 0; $i < $n; $i++) {
        $tmp = tempnam(sys_get_temp_dir(), 'pt');
        file_put_contents($tmp, $payload);
        $cmd = [PHP_BINARY, $root . '/tests/php/support/http_harness.php', $endpoint, 'POST', $tmp];
        $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $procesos[] = [$proc, $pipes, $tmp];
    }
    $respuestas = [];
    foreach ($procesos as [$proc, $pipes, $tmp]) {
        $respuestas[] = json_decode(trim(stream_get_contents($pipes[1])), true) ?: [];
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        @unlink($tmp);
    }
    return $respuestas;
}

function payloadCotizacion(string $clientRequestId): string {
    global $marcador;
    return json_encode([
        'client_request_id' => $clientRequestId,
        'paciente_id' => 0,
        'paciente_nombre' => 'PHPTEST',
        'modo_cotizacion' => 'informativa',
        'solo_ticket' => 1,
        'total' => 10,
        'fecha_ref' => date('Y-m-d'),
        'observaciones' => $marcador,
        'detalles' => [['servicio_tipo' => 'procedimiento', 'servicio_id' => 999999, 'descripcion' => 'PHPTEST', 'cantidad' => 1, 'precio_unitario' => 10, 'subtotal' => 10]],
    ]);
}

function limpiarDatosDePrueba($mysqli): void {
    global $marcador;
    $like = "'%" . $mysqli->real_escape_string($marcador) . "%'";
    $ids = [];
    $r = $mysqli->query("SELECT id FROM cotizaciones WHERE observaciones LIKE $like");
    while ($row = $r->fetch_assoc()) $ids[] = (int)$row['id'];
    if (!$ids) return;
    $in = implode(',', $ids);
    $t = $mysqli->query("SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'cotizacion_id'");
    while ($row = $t->fetch_assoc()) {
        $mysqli->query("DELETE FROM `{$row['TABLE_NAME']}` WHERE cotizacion_id IN ($in)");
    }
    $mysqli->query("DELETE FROM cotizaciones WHERE id IN ($in) AND observaciones LIKE $like");
}

prueba('el fragmento SQL filtra filas reales de agenda por tipo de servicio', function () {
    global $mysqli;
    $tipos = ['consulta', 'ecografia', 'rayosx', 'procedimiento', 'operacion', 'laboratorio', 'paquete', 'farmacia'];
    $union = implode(' UNION ALL ', array_map(fn($t) => "SELECT '$t' AS servicio_tipo", $tipos));
    $r = $mysqli->query("SELECT a.servicio_tipo FROM ($union) a WHERE " . agenda_sql_servicio_ocupa_medico('a') . ' ORDER BY a.servicio_tipo');
    $obtenidos = array_column($r->fetch_all(MYSQLI_ASSOC), 'servicio_tipo');
    iguales(['consulta', 'ecografia', 'operacion', 'procedimiento', 'rayosx'], $obtenidos);
}, true);

prueba('los filtros de estado en SQL real dejan solo consultas y eventos activos', function () {
    global $mysqli;
    $uniones = fn(array $v, string $col) => implode(' UNION ALL ', array_map(fn($x) => "SELECT '$x' AS $col", $v));
    $c = $mysqli->query('SELECT estado FROM (' . $uniones(['pendiente', 'falta_cancelar', 'cancelada', 'anulada', 'completada'], 'estado') . ') c WHERE ' . agenda_sql_consulta_ocupa_medico('c') . ' ORDER BY estado');
    iguales(['falta_cancelar', 'pendiente'], array_column($c->fetch_all(MYSQLI_ASSOC), 'estado'));
    $e = $mysqli->query('SELECT estado_evento FROM (' . $uniones(['pendiente', 'confirmado', 'atendido', 'cancelado', 'no_asistio', 'anulada'], 'estado_evento') . ') a WHERE ' . agenda_sql_evento_ocupa_medico('a') . ' ORDER BY estado_evento');
    iguales(['confirmado', 'pendiente'], array_column($e->fetch_all(MYSQLI_ASSOC), 'estado_evento'));
}, true);

prueba('cotización: el mismo client_request_id devuelve la misma cotización', function () {
    global $mysqli;
    $id = 'phptest:' . bin2hex(random_bytes(8));
    $a = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion($id));
    $b = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion($id));
    verdadero(($a['success'] ?? false) === true, 'primer envío: ' . json_encode($a));
    iguales(false, $a['duplicate'], 'el primer envío no es duplicado');
    iguales($a['cotizacion_id'], $b['cotizacion_id'], 'misma cotización');
    iguales(true, $b['duplicate'], 'el segundo envío se marca duplicado');
    $n = (int)$mysqli->query("SELECT COUNT(*) c FROM cotizaciones WHERE client_request_id = '$id'")->fetch_assoc()['c'];
    iguales(1, $n, 'solo una fila en BD');
}, true);

prueba('cotización: distintos client_request_id crean cotizaciones distintas', function () {
    $a = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion('phptest:' . bin2hex(random_bytes(8))));
    $b = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion('phptest:' . bin2hex(random_bytes(8))));
    verdadero(($a['success'] ?? false) && ($b['success'] ?? false), 'ambas se registran');
    verdadero($a['cotizacion_id'] !== $b['cotizacion_id'], 'ids distintos');
}, true);

prueba('cotización: 4 envíos simultáneos con el mismo id crean una sola cotización', function () {
    global $mysqli;
    $id = 'phptest:' . bin2hex(random_bytes(8));
    $respuestas = ejecutarApiEnParalelo('api_cotizaciones.php', payloadCotizacion($id), 4);
    $ids = array_unique(array_map(fn($r) => $r['cotizacion_id'] ?? null, $respuestas));
    iguales(1, count($ids), 'todas apuntan a la misma cotización: ' . json_encode($respuestas));
    $creadas = count(array_filter($respuestas, fn($r) => ($r['duplicate'] ?? true) === false));
    iguales(1, $creadas, 'solo una la crea');
    $n = (int)$mysqli->query("SELECT COUNT(*) c FROM cotizaciones WHERE client_request_id = '$id'")->fetch_assoc()['c'];
    iguales(1, $n, 'solo una fila en BD');
}, true);

prueba('cotización: client_request_id inválido no bloquea el registro', function () {
    $a = ejecutarApi('api_cotizaciones.php', 'POST', payloadCotizacion('id con espacios y !!'));
    verdadero(($a['success'] ?? false) === true, json_encode($a));
}, true);

prueba('episodio: la consulta de una adenda adopta los servicios huérfanos de la cotización base', function () {
    global $mysqli, $marcador;
    $consultaId = (int)($mysqli->query('SELECT id FROM consultas ORDER BY id DESC LIMIT 1')->fetch_assoc()['id'] ?? 0);
    verdadero($consultaId > 0, 'se necesita una consulta existente como referencia');
    $obs = $mysqli->real_escape_string($marcador);

    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (0, 18, 100, 'pagado', '$obs')");
    $baseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES (0, 18, 50, 'pagado', '$obs', $baseId, 1)");
    $adendaId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES ($baseId, 'ecografia', 'PHPTEST eco', 1, 90, 90), ($baseId, 'laboratorio', 'PHPTEST lab', 1, 10, 10), ($baseId, 'farmacia', 'PHPTEST farm', 1, 5, 5)");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, consulta_id) VALUES ($adendaId, 'consulta', 'PHPTEST consulta', 1, 50, 50, $consultaId)");
    $mysqli->query("INSERT INTO bloques_atencion (paciente_id, consulta_origen_id, fecha_base) VALUES (0, NULL, CURDATE())");
    $bloqueId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO bloques_atencion_cotizaciones (bloque_id, cotizacion_id) VALUES ($bloqueId, $baseId), ($bloqueId, $adendaId)");

    try {
        $r = episodio_adoptar_servicios_en_consulta($mysqli, $adendaId, $consultaId);
        iguales(2, $r['detalles'], 'eco y laboratorio quedan asociados (la farmacia no)');
        iguales(1, $r['bloques'], 'el bloque toma la consulta como origen');
        $farm = $mysqli->query("SELECT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = $baseId AND servicio_tipo = 'farmacia'")->fetch_assoc();
        verdadero($farm['consulta_id'] === null, 'la farmacia no se asocia');
        $eco = $mysqli->query("SELECT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = $baseId AND servicio_tipo = 'ecografia'")->fetch_assoc();
        iguales($consultaId, (int)$eco['consulta_id']);
        $b = $mysqli->query("SELECT consulta_origen_id FROM bloques_atencion WHERE id = $bloqueId")->fetch_assoc();
        iguales($consultaId, (int)$b['consulta_origen_id']);

        $otraConsulta = $consultaId + 1000000;
        $r2 = episodio_adoptar_servicios_en_consulta($mysqli, $adendaId, $otraConsulta);
        iguales(0, $r2['detalles'] + $r2['ordenes'] + $r2['bloques'], 'no reasigna lo que ya tiene consulta');
        $cadena = episodio_cotizaciones_cadena_ids($mysqli, $adendaId);
        sort($cadena);
        iguales([$baseId, $adendaId], $cadena, 'la cadena incluye base y adenda');
    } finally {
        $mysqli->query("DELETE FROM bloques_atencion WHERE id = $bloqueId");
    }
}, true);

prueba('episodio: sin adendas no hay nada que adoptar', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (0, 18, 10, 'pagado', '$obs')");
    $id = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES ($id, 'ecografia', 'PHPTEST eco', 1, 10, 10)");
    $r = episodio_adoptar_servicios_en_consulta($mysqli, $id, 1);
    iguales(0, $r['detalles'] + $r['ordenes'] + $r['bloques']);
}, true);

prueba('episodio: adenda con detalle de consulta se une al bloque de la cotización base', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 90, 'pagado', '$obs')");
    $baseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, medico_id) VALUES ($baseId, 'ecografia', 'PHPTEST eco', 1, 90, 90, 1)");
    $detalleBaseId = (int)$mysqli->insert_id;
    $manana = date('Y-m-d', strtotime('+1 day'));
    $mysqli->query("INSERT INTO agenda_servicios_cotizacion (cotizacion_id, cotizacion_detalle_id, paciente_id, servicio_tipo, titulo_evento, medico_id, fecha_programada, hora_programada, estado_evento) VALUES ($baseId, $detalleBaseId, $paciente, 'ecografia', 'PHPTEST', 1, '$manana', '08:30:00', 'confirmado')");
    $mysqli->query("INSERT INTO bloques_atencion (paciente_id, consulta_origen_id, fecha_base) VALUES ($paciente, NULL, CURDATE())");
    $bloqueBase = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO bloques_atencion_cotizaciones (bloque_id, cotizacion_id) VALUES ($bloqueBase, $baseId)");

    try {
        $r = ejecutarApi('api_cotizaciones.php', 'POST', json_encode([
            'accion' => 'adenda',
            'cotizacion_id' => $baseId,
            'fecha_ref' => $manana,
            'observaciones' => $marcador,
            'motivo' => 'PHPTEST',
            'detalles' => [[
                'servicio_tipo' => 'consulta', 'servicio_id' => 999999, 'descripcion' => 'PHPTEST consulta',
                'cantidad' => 1, 'precio_unitario' => 70, 'subtotal' => 70, 'medico_id' => 1,
                'fecha_programada' => $manana, 'hora_programada' => '08:30',
            ]],
        ]));
        verdadero(($r['success'] ?? false) === true, 'adenda: ' . json_encode($r));
        $adendaId = (int)$r['cotizacion_id'];
        $padre = (int)$mysqli->query("SELECT cotizacion_padre_id p FROM cotizaciones WHERE id = $adendaId")->fetch_assoc()['p'];
        iguales($baseId, $padre, 'la adenda cuelga de la base');
        $bloqueAdenda = (int)$mysqli->query("SELECT bloque_id b FROM bloques_atencion_cotizaciones WHERE cotizacion_id = $adendaId")->fetch_assoc()['b'];
        iguales($bloqueBase, $bloqueAdenda, 'misma atención/bloque que la cotización base');
    } finally {
        $mysqli->query("DELETE FROM bloques_atencion WHERE paciente_id = $paciente");
    }
}, true);

prueba('episodio: el cobro sugiere la adenda pendiente y la consulta se crea con la fecha de su descripción', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 90, 'pagado', '$obs')");
    $baseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES ($paciente, 18, 70, 'pendiente', '$obs', $baseId, 1)");
    $adendaId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES ($baseId, 'ecografia', 'PHPTEST eco', 1, 90, 90)");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, medico_id) VALUES ($adendaId, 'consulta', 'PHPTEST consulta (2099-01-02 08:30)', 1, 70, 70, 1)");
    $consultaId = 0;
    try {
        foreach ([$baseId, $adendaId] as $desde) {
            $g = ejecutarApi('api_cotizaciones.php', 'GET', "accion=sugerir_grupo_cobro&cotizacion_id=$desde");
            iguales([$adendaId], $g['ids'] ?? null, "grupo sugerido desde #$desde");
        }

        $c = ejecutarApi('api_cotizaciones.php', 'POST', json_encode(['accion' => 'crear_consulta_desde_cotizacion', 'cotizacion_id' => $adendaId]));
        verdadero(($c['success'] ?? false) === true, json_encode($c));
        $consultaId = (int)$mysqli->query("SELECT consulta_id c FROM cotizaciones_detalle WHERE cotizacion_id = $adendaId")->fetch_assoc()['c'];
        verdadero($consultaId > 0, 'la consulta quedó vinculada al detalle');
        $fila = $mysqli->query("SELECT fecha, hora FROM consultas WHERE id = $consultaId")->fetch_assoc();
        iguales('2099-01-02', $fila['fecha']);
        iguales('08:30:00', $fila['hora']);
    } finally {
        $mysqli->query("DELETE FROM bloques_atencion WHERE paciente_id = $paciente");
        if ($consultaId > 0) {
            $mysqli->query("DELETE FROM consultas WHERE id = $consultaId AND paciente_id = $paciente");
        }
    }
}, true);

prueba('quitar ítems de una cotización pendiente libera agenda, orden y consulta', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $mysqli->query("INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado) VALUES ($paciente, 1, '2099-01-02', '08:30:00', 'programada', 'pendiente')");
    $consultaId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 160, 'pendiente', '$obs')");
    $cotId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES ($cotId, 'consulta', 'PHPTEST consulta', 1, 70, 70, 1, $consultaId)");
    $detConsulta = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES ($cotId, 'ecografia', 'PHPTEST eco', 1, 90, 90, 1, $consultaId)");
    $detEco = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO agenda_servicios_cotizacion (cotizacion_id, cotizacion_detalle_id, paciente_id, servicio_tipo, titulo_evento, medico_id, fecha_programada, hora_programada, estado_evento) VALUES ($cotId, $detEco, $paciente, 'ecografia', 'PHPTEST', 1, '2099-01-02', '08:30:00', 'pendiente')");
    $mysqli->query("INSERT INTO ordenes_imagen (paciente_id, cotizacion_id, tipo, estado, fecha) VALUES ($paciente, $cotId, 'ecografia', 'pendiente', '2099-01-02')");

    try {
        $r = ejecutarApi('api_cotizaciones.php', 'POST', json_encode(['accion' => 'eliminar_detalle', 'cotizacion_id' => $cotId, 'detalle_id' => $detConsulta, 'motivo' => 'PHPTEST']));
        verdadero(($r['success'] ?? false) === true, 'quitar consulta: ' . json_encode($r));
        iguales('cancelada', $mysqli->query("SELECT estado FROM consultas WHERE id = $consultaId")->fetch_assoc()['estado'], 'la consulta se cancela');
        $eco = $mysqli->query("SELECT consulta_id FROM cotizaciones_detalle WHERE id = $detEco")->fetch_assoc();
        verdadero($eco['consulta_id'] === null, 'la ecografía queda sin la consulta cancelada');

        $r = ejecutarApi('api_cotizaciones.php', 'POST', json_encode(['accion' => 'eliminar_detalle', 'cotizacion_id' => $cotId, 'detalle_id' => $detEco, 'motivo' => 'PHPTEST']));
        verdadero(($r['success'] ?? false) === true, 'quitar ecografía: ' . json_encode($r));
        iguales('cancelado', $mysqli->query("SELECT estado_evento e FROM agenda_servicios_cotizacion WHERE cotizacion_detalle_id = $detEco")->fetch_assoc()['e'], 'se libera el horario');
        iguales('cancelado', $mysqli->query("SELECT estado FROM ordenes_imagen WHERE cotizacion_id = $cotId")->fetch_assoc()['estado'], 'se cancela la orden pendiente');
        iguales(0.0, (float)$mysqli->query("SELECT total FROM cotizaciones WHERE id = $cotId")->fetch_assoc()['total'], 'el total queda en cero');
    } finally {
        $mysqli->query("DELETE FROM consultas WHERE id = $consultaId AND paciente_id = $paciente");
    }
}, true);

function crearCotizacionConConsultaDePrueba($mysqli, string $marcador, int $medicoId): array {
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 570;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 160, 'pagado', '$obs')");
    $cotId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, medico_id) VALUES ($cotId, 'consulta', 'PHPTEST consulta (2099-01-02 08:30)', 1, 70, 70, $medicoId)");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES ($cotId, 'ecografia', 'PHPTEST eco', 1, 90, 90)");
    return [$cotId, $paciente];
}

function verificarConsultaCreada($mysqli, int $cotId, int $consultaId): void {
    verdadero($consultaId > 0, 'se creó la consulta');
    $fila = $mysqli->query("SELECT fecha, hora, origen_creacion, edad_snapshot_valor FROM consultas WHERE id = $consultaId")->fetch_assoc();
    iguales('2099-01-02', $fila['fecha'], 'fecha de la descripción');
    iguales('08:30:00', $fila['hora'], 'hora de la descripción');
    iguales('cotizador', $fila['origen_creacion']);
    verdadero($fila['edad_snapshot_valor'] !== null, 'se guarda la edad del paciente');
    $sinConsulta = (int)$mysqli->query("SELECT COUNT(*) c FROM cotizaciones_detalle WHERE cotizacion_id = $cotId AND (consulta_id IS NULL OR consulta_id <> $consultaId)")->fetch_assoc()['c'];
    iguales(0, $sinConsulta, 'la consulta queda asociada a todos los servicios clínicos');
}

prueba('consulta clínica: la implementación única crea la consulta con fecha, edad y servicios asociados', function () {
    global $mysqli, $marcador;
    [$cotId] = crearCotizacionConConsultaDePrueba($mysqli, $marcador, 1);
    $consultaId = 0;
    try {
        $r = cc_asegurar_consulta_desde_cotizacion($mysqli, $cotId);
        verdadero($r['success'] === true && $r['tiene_item_consulta'] === true, json_encode($r));
        $consultaId = (int)$r['consulta_id'];
        verificarConsultaCreada($mysqli, $cotId, $consultaId);

        $otra = cc_asegurar_consulta_desde_cotizacion($mysqli, $cotId);
        iguales($consultaId, (int)$otra['consulta_id'], 'no crea una segunda consulta');
        iguales(true, $otra['ya_existia']);
    } finally {
        if ($consultaId > 0) $mysqli->query("DELETE FROM consultas WHERE id = $consultaId AND paciente_id = 570");
    }
}, true);

prueba('consulta clínica: el cobro usa la misma implementación (mismo resultado)', function () {
    global $mysqli, $marcador;
    [$cotId] = crearCotizacionConConsultaDePrueba($mysqli, $marcador, 1);
    $consultaId = 0;
    try {
        require_once dirname(__DIR__, 2) . '/modules/CobroModule.php';
        $metodo = new ReflectionMethod('CobroModule', 'asegurarConsultaDesdeCotizacion');
        $metodo->setAccessible(true);
        $r = $metodo->invoke(null, $mysqli, $cotId);
        iguales(true, $r['success']);
        $consultaId = (int)$r['consulta_id'];
        verificarConsultaCreada($mysqli, $cotId, $consultaId);
    } finally {
        if ($consultaId > 0) $mysqli->query("DELETE FROM consultas WHERE id = $consultaId AND paciente_id = 570");
    }
}, true);

prueba('consulta clínica: médico inexistente falla en el API pero nunca rompe el cobro', function () {
    global $mysqli, $marcador;
    [$cotId] = crearCotizacionConConsultaDePrueba($mysqli, $marcador, 999999);
    $r = cc_asegurar_consulta_desde_cotizacion($mysqli, $cotId);
    iguales(false, $r['success']);
    verdadero(strpos((string)$r['error'], 'no existe') !== false, (string)$r['error']);
    require_once dirname(__DIR__, 2) . '/modules/CobroModule.php';
    $metodo = new ReflectionMethod('CobroModule', 'asegurarConsultaDesdeCotizacion');
    $metodo->setAccessible(true);
    $c = $metodo->invoke(null, $mysqli, $cotId);
    iguales(true, $c['success']);
    iguales(0, $c['consulta_id']);
}, true);

prueba('órdenes de procedimientos: se crea una sola orden por cotización y se amplía sin duplicar', function () {
    global $mysqli, $marcador;
    require_once dirname(__DIR__, 2) . '/modules/OrdenesClinicasModule.php';
    require_once dirname(__DIR__, 2) . '/modules/CobroModule.php';
    $obs = $mysqli->real_escape_string($marcador);
    $consultaId = (int)$mysqli->query('SELECT id FROM consultas ORDER BY id ASC LIMIT 1')->fetch_assoc()['id'];
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (570, 18, 100, 'pagado', '$obs')");
    $cotId = (int)$mysqli->insert_id;
    $detalle = fn(int $servicioId) => ['servicio_tipo' => 'procedimiento', 'servicio_id' => $servicioId, 'consulta_id' => $consultaId];

    oc_crear_ordenes_procedimientos($mysqli, $cotId, 570, [$detalle(901), $detalle(902), ['servicio_tipo' => 'laboratorio', 'servicio_id' => 5]], 0, 18);
    $metodo = new ReflectionMethod('CobroModule', 'crearOrdenesProcedimientosCotizacion');
    $metodo->setAccessible(true);
    $metodo->invoke(null, $mysqli, $cotId, 570, [$detalle(902), $detalle(903)], $consultaId, 18);

    $filas = $mysqli->query("SELECT procedimientos_json, consulta_id, estado FROM ordenes_procedimientos WHERE cotizacion_id = $cotId")->fetch_all(MYSQLI_ASSOC);
    iguales(1, count($filas), 'una sola orden');
    $ids = json_decode($filas[0]['procedimientos_json'], true);
    sort($ids);
    iguales([901, 902, 903], $ids, 'une los procedimientos sin repetir');
    iguales($consultaId, (int)$filas[0]['consulta_id']);
    iguales('pendiente', $filas[0]['estado']);

    oc_crear_ordenes_procedimientos($mysqli, $cotId, 570, [['servicio_tipo' => 'laboratorio', 'servicio_id' => 5]], $consultaId, 18);
    iguales(1, (int)$mysqli->query("SELECT COUNT(*) c FROM ordenes_procedimientos WHERE cotizacion_id = $cotId")->fetch_assoc()['c'], 'sin procedimientos no crea nada');
}, true);

prueba('órdenes de laboratorio: una sola orden por episodio y se cancela la duplicada sin resultados', function () {
    global $mysqli, $marcador;
    require_once dirname(__DIR__, 2) . '/modules/OrdenesClinicasModule.php';
    require_once dirname(__DIR__, 2) . '/modules/CobroModule.php';
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 30, 'pagado', '$obs')");
    $baseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES ($paciente, 18, 15, 'pagado', '$obs', $baseId, 1)");
    $adendaId = (int)$mysqli->insert_id;
    $snapshot = $mysqli->real_escape_string(json_encode(['version_id' => 77, 'valores_referenciales' => [['nombre' => 'x']]]));
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, snapshot_json) VALUES ($baseId, 'laboratorio', 9001, 'PHPTEST lab 1', 1, 15, 15, '$snapshot')");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES ($baseId, 'laboratorio', 9002, 'PHPTEST lab 2', 1, 15, 15)");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES ($adendaId, 'laboratorio', 9003, 'PHPTEST lab 3', 1, 15, 15)");
    // Orden del episodio en la raíz y otra suelta de la adenda (sin resultados): la suelta debe quedar cancelada.
    $mysqli->query("INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id, estado) VALUES ($baseId, '[9001]', $paciente, 'pendiente')");
    $ordenRaizId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id, estado) VALUES ($adendaId, '[9003]', $paciente, 'pendiente')");
    $ordenSueltaId = (int)$mysqli->insert_id;

    $detallesAdenda = [['servicio_tipo' => 'laboratorio', 'servicio_id' => 9003, 'descripcion' => 'PHPTEST lab 3']];
    oc_crear_ordenes_laboratorio($mysqli, $adendaId, $paciente, $detallesAdenda, 0);

    $activas = $mysqli->query("SELECT id, cotizacion_id, examenes FROM ordenes_laboratorio WHERE cotizacion_id IN ($baseId, $adendaId) AND estado <> 'cancelada'")->fetch_all(MYSQLI_ASSOC);
    iguales(1, count($activas), 'una sola orden activa en el episodio');
    iguales($ordenRaizId, (int)$activas[0]['id'], 'se reutiliza la orden de la cotización raíz');
    iguales($baseId, (int)$activas[0]['cotizacion_id'], 'queda en la cotización raíz');
    $examenes = json_decode($activas[0]['examenes'], true);
    $ids = array_map(fn($e) => (int)$e['id'], $examenes);
    sort($ids);
    iguales([9001, 9002, 9003], $ids, 'incluye los exámenes de la base y de la adenda');
    $conVersion = array_values(array_filter($examenes, fn($e) => (int)$e['id'] === 9001))[0];
    iguales(77, (int)$conVersion['examen_version_id'], 'conserva la versión del examen');
    iguales('cancelada', $mysqli->query("SELECT estado FROM ordenes_laboratorio WHERE id = $ordenSueltaId")->fetch_assoc()['estado'], 'la orden duplicada se cancela');

    $metodo = new ReflectionMethod('CobroModule', 'crearOrdenesLaboratorioCotizacion');
    $metodo->setAccessible(true);
    $metodo->invoke(null, $mysqli, $adendaId, $paciente, $detallesAdenda, 0);
    iguales(1, (int)$mysqli->query("SELECT COUNT(*) c FROM ordenes_laboratorio WHERE cotizacion_id IN ($baseId, $adendaId) AND estado <> 'cancelada'")->fetch_assoc()['c'], 'el cobro produce el mismo resultado sin duplicar');
}, true);

prueba('órdenes de imagen: una orden por servicio, idempotente, con médico y consulta del episodio', function () {
    global $mysqli, $marcador;
    require_once dirname(__DIR__, 2) . '/modules/OrdenesClinicasModule.php';
    require_once dirname(__DIR__, 2) . '/modules/CobroModule.php';
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $consultaId = (int)$mysqli->query('SELECT id FROM consultas ORDER BY id ASC LIMIT 1')->fetch_assoc()['id'];
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 300, 'pagado', '$obs')");
    $cotId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id) VALUES ($cotId, 'rayosx', 8001, 'rx de brazo', 2, 100, 200, 1)");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES ($cotId, 'ecografia', 8002, 'ecografia renal', 1, 100, 100)");
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES ($cotId, 'laboratorio', 8003, 'no es imagen', 1, 10, 10)");
    $detalles = $mysqli->query("SELECT * FROM cotizaciones_detalle WHERE cotizacion_id = $cotId ORDER BY id")->fetch_all(MYSQLI_ASSOC);
    // Orden genérica de versiones antiguas, sin archivos: debe eliminarse.
    $mysqli->query("INSERT INTO ordenes_imagen (paciente_id, cotizacion_id, tipo, estado, indicaciones) VALUES ($paciente, $cotId, 'rx', 'pendiente', 'Orden creada desde cotización #$cotId')");

    oc_crear_ordenes_imagen($mysqli, $cotId, $paciente, $detalles, $consultaId, 18);
    $ordenes = $mysqli->query("SELECT tipo, consulta_id, medico_id, indicaciones, estado FROM ordenes_imagen WHERE cotizacion_id = $cotId ORDER BY tipo")->fetch_all(MYSQLI_ASSOC);
    iguales(2, count($ordenes), 'una orden por servicio de imagen (cantidad 2 no duplica; el laboratorio no genera orden)');
    iguales(['ecografia', 'rx'], array_column($ordenes, 'tipo'));
    foreach ($ordenes as $o) {
        iguales($consultaId, (int)$o['consulta_id'], 'consulta del episodio');
        iguales('pendiente', $o['estado']);
        verdadero(strpos($o['indicaciones'], "Orden creada desde cotización #$cotId") !== false && strpos($o['indicaciones'], 'Detalle #') === 0, $o['indicaciones']);
    }
    $rx = array_values(array_filter($ordenes, fn($o) => $o['tipo'] === 'rx'))[0];
    iguales(1, (int)$rx['medico_id'], 'toma el médico del detalle');

    oc_crear_ordenes_imagen($mysqli, $cotId, $paciente, $detalles, $consultaId, 18);
    $metodo = new ReflectionMethod('CobroModule', 'crearOrdenesImagenCotizacion');
    $metodo->setAccessible(true);
    $metodo->invoke(null, $mysqli, $cotId, $paciente, $detalles, 18, $consultaId);
    iguales(2, (int)$mysqli->query("SELECT COUNT(*) c FROM ordenes_imagen WHERE cotizacion_id = $cotId")->fetch_assoc()['c'], 'idempotente entre API y cobro');
}, true);

prueba('imagen: completar el informe marca atendido el servicio de agenda que corresponde (incluye adendas, idempotente)', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 300, 'pagado', '$obs')");
    $base = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES ($paciente, 18, 100, 'pagado', '$obs', $base, 1)");
    $adenda = (int)$mysqli->insert_id;
    $agenda = function (int $cot, string $tipo) use ($mysqli, $paciente) {
        $mysqli->query("INSERT INTO agenda_servicios_cotizacion (cotizacion_id, paciente_id, medico_id, servicio_tipo, titulo_evento, fecha_programada, hora_programada, estado_evento) VALUES ($cot, $paciente, 1, '$tipo', 'PHPTEST', '2099-01-02', '10:00:00', 'confirmado')");
        return (int)$mysqli->insert_id;
    };
    $orden = function (int $cot, string $tipo, string $estado = 'completado') use ($mysqli, $paciente) {
        $mysqli->query("INSERT INTO ordenes_imagen (paciente_id, cotizacion_id, tipo, estado, indicaciones) VALUES ($paciente, $cot, '$tipo', '$estado', 'PHPTEST')");
        return (int)$mysqli->insert_id;
    };
    $estado = fn(int $id) => $mysqli->query("SELECT estado_evento FROM agenda_servicios_cotizacion WHERE id = $id")->fetch_assoc()['estado_evento'];

    $eco1 = $agenda($base, 'ecografia');
    $eco2 = $agenda($adenda, 'ecografia');
    $rx1 = $agenda($base, 'rayosx');
    $orden($base, 'ecografia', 'cancelado');
    $o1 = $orden($base, 'ecografia');
    $o2 = $orden($adenda, 'ecografia');
    $oRx = $orden($base, 'rx');

    iguales(1, episodio_marcar_agenda_imagen_atendida($mysqli, $o2, 18));
    iguales('confirmado', $estado($eco1), 'la primera ecografía sigue pendiente de informe');
    iguales('atendido', $estado($eco2), 'la orden de la adenda marca el segundo servicio');
    iguales('confirmado', $estado($rx1), 'no toca otros tipos');

    iguales(0, episodio_marcar_agenda_imagen_atendida($mysqli, $o2, 18), 'idempotente');
    iguales('confirmado', $estado($eco1));

    iguales(1, episodio_marcar_agenda_imagen_atendida($mysqli, $o1, 18));
    iguales('atendido', $estado($eco1));
    iguales(1, episodio_marcar_agenda_imagen_atendida($mysqli, $oRx, 18));
    iguales('atendido', $estado($rx1));

    iguales(0, episodio_marcar_agenda_imagen_atendida($mysqli, 0, 18));
}, true);

prueba('detalle de cotización: estado de atención por servicio (atendido, parcial, pendiente; lab y farmacia no aplican)', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $mysqli->query("INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado) VALUES ($paciente, 1, '2099-01-03', '09:00:00', 'programada', 'completada')");
    $consultaId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 300, 'pagado', '$obs')");
    $cot = (int)$mysqli->insert_id;
    $detalle = function (string $tipo, int $consulta = 0) use ($mysqli, $cot) {
        $c = $consulta > 0 ? $consulta : 'NULL';
        $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, consulta_id) VALUES ($cot, '$tipo', 'PHPTEST', 1, 10, 10, $c)");
        return (int)$mysqli->insert_id;
    };
    $evento = function (int $det, string $tipo, string $estado) use ($mysqli, $cot, $paciente) {
        $mysqli->query("INSERT INTO agenda_servicios_cotizacion (cotizacion_id, cotizacion_detalle_id, paciente_id, medico_id, servicio_tipo, titulo_evento, fecha_programada, hora_programada, estado_evento) VALUES ($cot, $det, $paciente, 1, '$tipo', 'PHPTEST', '2099-01-03', '10:00:00', '$estado')");
    };
    $orden = function (string $tipo, string $estado) use ($mysqli, $cot, $paciente) {
        $mysqli->query("INSERT INTO ordenes_imagen (paciente_id, cotizacion_id, tipo, estado, indicaciones) VALUES ($paciente, $cot, '$tipo', '$estado', 'PHPTEST')");
    };
    try {
        $dConsulta = $detalle('consulta', $consultaId);
        $dEco1 = $detalle('ecografia');
        $dEco2 = $detalle('ecografia');
        $dRx = $detalle('rayosx');
        $dLab = $detalle('laboratorio');
        $dFarm = $detalle('farmacia');
        $evento($dEco1, 'ecografia', 'atendido');
        $evento($dEco2, 'ecografia', 'confirmado');
        $evento($dRx, 'rayosx', 'confirmado');
        $orden('ecografia', 'completado');
        $orden('ecografia', 'completado');
        $estados = episodio_estado_atencion_servicios($mysqli, $cot);
        iguales('atendido', $estados[$dConsulta], 'consulta completada');
        iguales('atendido', $estados[$dEco1]);
        iguales('parcial', $estados[$dEco2], 'imagenes subidas pero sin informe');
        iguales('pendiente', $estados[$dRx], 'RX sin orden completada');
        verdadero(!isset($estados[$dLab]) && !isset($estados[$dFarm]), 'laboratorio y farmacia no se atienden');
    } finally {
        $mysqli->query("DELETE FROM consultas WHERE id = $consultaId AND paciente_id = $paciente");
    }
}, true);

prueba('post-pago: la consulta en falta_cancelar vuelve a pendiente al pagar su cotización', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $mysqli->query("INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado) VALUES (987654, 1, '2099-01-02', '08:30:00', 'programada', 'falta_cancelar')");
    $consultaId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado) VALUES (987654, 1, '2099-01-02', '09:30:00', 'programada', 'completada')");
    $otraId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (987654, 18, 70, 'pagado', '$obs')");
    $cotId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, consulta_id) VALUES ($cotId, 'consulta', 'PHPTEST', 1, 70, 70, $consultaId)");
    try {
        cc_reabrir_consultas_falta_cancelar($mysqli, $cotId);
        iguales('pendiente', $mysqli->query("SELECT estado FROM consultas WHERE id = $consultaId")->fetch_assoc()['estado']);
        iguales('completada', $mysqli->query("SELECT estado FROM consultas WHERE id = $otraId")->fetch_assoc()['estado'], 'no toca otras consultas');
    } finally {
        $mysqli->query("DELETE FROM consultas WHERE id IN ($consultaId, $otraId) AND paciente_id = 987654");
    }
}, true);

prueba('adenda: el mismo client_request_id devuelve la misma adenda, también con envíos simultáneos', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $paciente = 987654;
    $manana = date('Y-m-d', strtotime('+1 day'));
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES ($paciente, 18, 90, 'pagado', '$obs')");
    $baseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, descripcion, cantidad, precio_unitario, subtotal, medico_id) VALUES ($baseId, 'ecografia', 'PHPTEST eco', 1, 90, 90, 1)");
    $detalleBaseId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO agenda_servicios_cotizacion (cotizacion_id, cotizacion_detalle_id, paciente_id, servicio_tipo, titulo_evento, medico_id, fecha_programada, hora_programada, estado_evento) VALUES ($baseId, $detalleBaseId, $paciente, 'ecografia', 'PHPTEST', 1, '$manana', '08:30:00', 'confirmado')");
    $mysqli->query("INSERT INTO bloques_atencion (paciente_id, consulta_origen_id, fecha_base) VALUES ($paciente, NULL, CURDATE())");
    $payload = fn(string $id, int $servicioId) => json_encode([
        'accion' => 'adenda', 'cotizacion_id' => $baseId, 'fecha_ref' => $manana, 'client_request_id' => $id,
        'observaciones' => $marcador, 'motivo' => 'PHPTEST',
        'detalles' => [['servicio_tipo' => 'consulta', 'servicio_id' => $servicioId, 'descripcion' => 'PHPTEST consulta', 'cantidad' => 1,
            'precio_unitario' => 70, 'subtotal' => 70, 'medico_id' => 1, 'fecha_programada' => $manana, 'hora_programada' => '08:30']],
    ]);
    try {
        $id1 = 'phptest:' . bin2hex(random_bytes(8));
        $a = ejecutarApi('api_cotizaciones.php', 'POST', $payload($id1, 999001));
        $b = ejecutarApi('api_cotizaciones.php', 'POST', $payload($id1, 999001));
        verdadero(($a['success'] ?? false) === true, json_encode($a));
        verdadero(empty($a['duplicate']), 'el primer envío crea la adenda');
        iguales($a['cotizacion_id'], $b['cotizacion_id'], 'el reintento devuelve la misma adenda');
        iguales(true, $b['duplicate'], 'se marca duplicado');
        iguales(1, (int)$mysqli->query("SELECT COUNT(*) c FROM cotizaciones WHERE client_request_id = '$id1'")->fetch_assoc()['c'], 'una sola fila');

        $id2 = 'phptest:' . bin2hex(random_bytes(8));
        $respuestas = ejecutarApiEnParalelo('api_cotizaciones.php', $payload($id2, 999002), 4);
        $ids = array_unique(array_map(fn($r) => $r['cotizacion_id'] ?? null, $respuestas));
        iguales(1, count($ids), 'los envíos simultáneos apuntan a la misma adenda: ' . json_encode($respuestas));
        iguales(1, (int)$mysqli->query("SELECT COUNT(*) c FROM cotizaciones WHERE client_request_id = '$id2'")->fetch_assoc()['c'], 'una sola adenda en BD');
        $ok = count(array_filter($respuestas, fn($r) => ($r['success'] ?? false) === true));
        iguales(4, $ok, 'ninguno recibe error');
    } finally {
        $mysqli->query("DELETE FROM bloques_atencion WHERE paciente_id = $paciente");
    }
}, true);

prueba('portal del paciente: la deuda suma la cadena de cotizaciones y un resultado ajeno nunca aparece', function () {
    global $mysqli, $marcador;
    $obs = $mysqli->real_escape_string($marcador);
    $pac = 987654;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones) VALUES ($pac, 18, 100, 100, 'pendiente', '$obs')");
    $raiz = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES ($pac, 18, 30, 0, 'pagado', '$obs', $raiz, 1)");
    $adenda = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES ($pac, 18, 50, 50, 'anulada', '$obs', $raiz, 1)");
    $mysqli->query("INSERT INTO ordenes_laboratorio (paciente_id, examenes, estado, cotizacion_id) VALUES ($pac, '[]', 'completado', $adenda)");
    $ordenId = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO resultados_laboratorio (orden_id, tipo_examen, resultados) VALUES ($ordenId, 'PHPTEST hemograma', '{}')");
    $resultadoId = (int)$mysqli->insert_id;
    try {
        iguales(100.0, PortalPaciente::saldoPendiente($mysqli, $adenda), 'desde la adenda se ve el saldo de la raíz; la anulada no cuenta');
        iguales(0.0, PortalPaciente::saldoPendiente($mysqli, null), 'sin cotización no hay deuda');

        $docs = array_values(array_filter(PortalPaciente::documentos($mysqli, $pac), fn($d) => $d['tipo'] === 'laboratorio' && $d['ref_id'] === $resultadoId));
        iguales(1, count($docs), 'el resultado completado aparece');
        iguales('pendiente_pago', $docs[0]['estado']);
        verdadero(!array_key_exists('saldo_pendiente', $docs[0]) && !array_key_exists('decision_manual', $docs[0]), 'el paciente no recibe datos internos');

        $mysqli->query("UPDATE cotizaciones SET saldo_pendiente = 0, estado = 'pagado' WHERE id = $raiz");
        $docs = array_values(array_filter(PortalPaciente::documentos($mysqli, $pac), fn($d) => $d['ref_id'] === $resultadoId && $d['tipo'] === 'laboratorio'));
        iguales('disponible', $docs[0]['estado'], 'pagado: disponible');

        iguales(null, PortalPaciente::buscarDocumento($mysqli, 987655, 'laboratorio', $resultadoId), 'otro paciente no lo encuentra');
        $mysqli->query("UPDATE ordenes_laboratorio SET estado = 'pendiente' WHERE id = $ordenId");
        iguales(null, PortalPaciente::buscarDocumento($mysqli, $pac, 'laboratorio', $resultadoId), 'orden sin completar no se publica');
    } finally {
        $mysqli->query("DELETE FROM resultados_laboratorio WHERE id = $resultadoId");
        $mysqli->query("DELETE FROM ordenes_laboratorio WHERE id = $ordenId");
    }
}, true);

prueba('portal del paciente: informe de imagen en borrador o sin PDF se lista "en revisión" y no se descarga', function () {
    global $mysqli;
    $pac = 987654;
    $mysqli->query("INSERT INTO ordenes_imagen (paciente_id, tipo, indicaciones, estado) VALUES ($pac, 'rx', 'PHPTEST', 'completado')");
    $oi1 = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO ordenes_imagen (paciente_id, tipo, indicaciones, estado) VALUES ($pac, 'rx', 'PHPTEST', 'completado')");
    $oi2 = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO imagenologia_informes (orden_imagen_id, paciente_id, medico_id, titulo, contenido_json, estado) VALUES ($oi1, $pac, 1, 'PHPTEST borrador', '{}', 'borrador')");
    $inf1 = (int)$mysqli->insert_id;
    $mysqli->query("INSERT INTO imagenologia_informes (orden_imagen_id, paciente_id, medico_id, titulo, contenido_json, estado) VALUES ($oi2, $pac, 1, 'PHPTEST sin pdf', '{}', 'completado')");
    $inf2 = (int)$mysqli->insert_id;
    try {
        $docs = [];
        foreach (PortalPaciente::documentos($mysqli, $pac, true) as $d) {
            if ($d['tipo'] === 'imagenologia') $docs[$d['ref_id']] = $d;
        }
        iguales('en_revision', $docs[$inf1]['estado']);
        iguales('borrador', $docs[$inf1]['pendiente_motivo']);
        iguales('en_revision', $docs[$inf2]['estado']);
        iguales('sin_pdf', $docs[$inf2]['pendiente_motivo']);
        $mysqli->query("INSERT INTO paciente_portal_liberaciones (paciente_id, tipo, ref_id, estado) VALUES ($pac, 'imagenologia', $inf2, 'liberado')");
        $d2 = PortalPaciente::buscarDocumento($mysqli, $pac, 'imagenologia', $inf2);
        iguales('en_revision', $d2['estado'], 'liberar a mano no publica un informe sin PDF');
        foreach (PortalPaciente::documentos($mysqli, $pac) as $d) {
            verdadero(!array_key_exists('pendiente_motivo', $d), 'el paciente no recibe el motivo interno');
        }
    } finally {
        $mysqli->query("DELETE FROM paciente_portal_liberaciones WHERE paciente_id = $pac");
        $mysqli->query("DELETE FROM imagenologia_informes WHERE id IN ($inf1, $inf2)");
        $mysqli->query("DELETE FROM ordenes_imagen WHERE id IN ($oi1, $oi2)");
    }
}, true);

/* ───────── Reevaluación (validación pura, sin BD) ───────── */

require_once $root . '/modules/ReevaluacionModule.php';

prueba('reevaluación: la ventana es de 7 días desde el registro y no admite fechas pasadas', function () {
    $hoy = date('Y-m-d');
    $en = static fn(int $d) => date('Y-m-d', strtotime("+$d days"));
    $falla = static function (array $in, ?array $actual = null, ?string $limite = null) use ($hoy) {
        try {
            rev_validar_agenda($in, $hoy, $actual, $limite);
            return null;
        } catch (RevError $e) {
            return $e->getCode();
        }
    };
    iguales($en(7), rev_validar_agenda(['fecha' => $en(7), 'sin_hora_fija' => true], $hoy)['fecha'], 'el día 7 es válido');
    iguales(400, $falla(['fecha' => $en(8), 'sin_hora_fija' => true]), 'el día 8 se rechaza');
    iguales(400, $falla(['fecha' => date('Y-m-d', strtotime('-1 day')), 'sin_hora_fija' => true]), 'ayer se rechaza');
    iguales(400, $falla(['fecha' => 'no-es-fecha']));
    iguales(400, $falla(['fecha' => $en(1), 'hora' => '25:00']));
    iguales($en(7), rev_validar_agenda(['fecha' => $en(2), 'sin_hora_fija' => true], $hoy)['fecha_limite'], 'la ventana nace con la reevaluación');
    iguales(400, $falla(['fecha' => $en(6), 'sin_hora_fija' => true], null, $en(5)), 'reprogramar no extiende el límite original');
});

prueba('reevaluación: hora vacía o "sin hora fija" no bloquea turno; una hora que ya pasó hoy se rechaza solo si cambió', function () {
    $hoy = date('Y-m-d');
    $manana = date('Y-m-d', strtotime('+1 day'));
    $n = rev_validar_agenda(['fecha' => $manana, 'hora' => ''], $hoy);
    iguales(1, $n['sin_hora_fija']);
    iguales(null, $n['hora']);
    $n = rev_validar_agenda(['fecha' => $manana, 'hora' => '10:30', 'sin_hora_fija' => true], $hoy);
    iguales(null, $n['hora'], 'sin_hora_fija descarta la hora');
    iguales('10:30:00', rev_validar_agenda(['fecha' => $manana, 'hora' => '10:30'], $hoy)['hora']);

    $pasada = '00:01';
    if (date('H:i:s') > '00:01:00') {
        $rechazada = false;
        try { rev_validar_agenda(['fecha' => $hoy, 'hora' => $pasada], $hoy); } catch (RevError $e) { $rechazada = true; }
        verdadero($rechazada, 'una hora de hoy que ya pasó se rechaza al crear');
        $actual = ['fecha_sugerida' => $hoy, 'hora_sugerida' => '00:01:00'];
        iguales('00:01:00', rev_validar_agenda(['fecha' => $hoy, 'hora' => $pasada], $hoy, $actual)['hora'], 'si no cambió, guardar la HC otra vez no falla');
    }
});

prueba('reevaluación: solo el médico dueño o recepción pueden actuar, y el contacto es solo de recepción', function () {
    $fila = ['medico_id' => 7];
    $recep = ['rol' => 'recepcionista', 'medico_id' => 0];
    $dueno = ['rol' => 'medico', 'medico_id' => 7];
    $otro = ['rol' => 'medico', 'medico_id' => 8];
    verdadero(rev_actor_puede($recep, $fila, 'gestion'));
    verdadero(rev_actor_puede($dueno, $fila, 'cancelar'));
    verdadero(!rev_actor_puede($dueno, $fila, 'gestion'), 'el médico no gestiona el contacto');
    verdadero(!rev_actor_puede($otro, $fila, 'cancelar'), 'otro médico no puede');
    verdadero(!rev_actor_puede(['rol' => 'enfermero', 'medico_id' => 0], $fila, 'cancelar'));
});

prueba('reevaluación: dos turnos se pisan si distan menos que la duración del turno', function () {
    verdadero(rev_solapa(630, 630, 30), 'misma hora');
    verdadero(rev_solapa(630, 645, 30), '15 min dentro de un turno de 30');
    verdadero(!rev_solapa(630, 660, 30), 'el turno siguiente no se pisa');
    verdadero(!rev_solapa(null, 660, 30), 'sin hora no choca');
});

prueba('reevaluación (BD): la hora fija ocupa el turno del médico; sin hora fija, cerrada o de la propia consulta no', function () {
    $m = $GLOBALS['mysqli'];
    if (!rev_disponible($m)) {
        throw new RuntimeException('falta aplicar sql/2026-11-25/001_schema.sql');
    }
    $med = (int)$m->query('SELECT id FROM medicos ORDER BY id LIMIT 1')->fetch_assoc()['id'];
    $pac = (int)$m->query('SELECT id FROM pacientes ORDER BY id LIMIT 1')->fetch_assoc()['id'];
    $fecha = date('Y-m-d', strtotime('+3 days'));
    $lim = date('Y-m-d', strtotime('+7 days'));
    $o1 = 990000001; $o2 = 990000002; $o3 = 990000003;
    $ins = static function (int $origen, ?string $hora, int $sinHora, string $estado, $abierta) use ($m, $med, $pac, $fecha, $lim) {
        $h = $hora === null ? 'NULL' : "'$hora'";
        $ab = $abierta === null ? 'NULL' : (int)$abierta;
        $m->query("INSERT INTO hc_reevaluaciones (consulta_origen_id, hc_id, paciente_id, medico_id, fecha_sugerida, hora_sugerida, sin_hora_fija, fecha_limite, estado, abierta)
                   VALUES ($origen, 0, $pac, $med, '$fecha', $h, $sinHora, '$lim', '$estado', $ab)");
    };
    try {
        $ins($o1, '10:30:00', 0, 'pendiente', 1);
        $ins($o2, null, 1, 'pendiente', 1);
        $ins($o3, '14:00:00', 0, 'cancelada', null);

        $c = rev_conflicto_reevaluacion($m, $med, $fecha, '10:30:00');
        verdadero($c !== null && $c['hora'] === '10:30', 'la misma hora choca');
        verdadero(rev_conflicto_reevaluacion($m, $med, $fecha, '10:45:00') !== null, 'dentro del mismo turno choca');
        verdadero(rev_conflicto_reevaluacion($m, $med, $fecha, '11:30:00') === null, 'otro turno no choca');
        verdadero(rev_conflicto_reevaluacion($m, $med, $fecha, '14:00:00') === null, 'una cancelada libera el turno');
        verdadero(rev_conflicto_reevaluacion($m, $med, $fecha, '10:30:00', $o1) === null, 'la propia consulta se excluye');
        verdadero(rev_conflicto_reevaluacion($m, $med + 9999, $fecha, '10:30:00') === null, 'otro médico no choca');
        iguales(1, count(rev_horas_ocupadas($m, $med, $fecha)), 'sin hora fija y cerradas no figuran como ocupadas');
        iguales(1, rev_cupos_ocupados_en_bloque($m, $med, $fecha, '08:00:00', '12:00:00'), 'consume un cupo del bloque');
        iguales(0, rev_cupos_ocupados_en_bloque($m, $med, $fecha, '12:00:00', '18:00:00'), 'fuera del bloque no cuenta');

        $falla = null;
        try { rev_asegurar_hora_libre($m, $med, $fecha, '10:30:00'); } catch (RevError $e) { $falla = $e->getCode(); }
        iguales(409, $falla, 'crear otra reevaluación a esa hora se rechaza');
        rev_asegurar_hora_libre($m, $med, $fecha, null);
    } finally {
        $m->query("DELETE FROM hc_reevaluaciones WHERE consulta_origen_id IN ($o1, $o2, $o3)");
    }
}, true);

prueba('reevaluación (BD, fase 2): llegada, deshacer, iniciar, diferir y completar con evolución en la HC de origen', function () {
    $m = $GLOBALS['mysqli'];
    if (!rev_disponible($m)) {
        throw new RuntimeException('falta aplicar sql/2026-11-25/001_schema.sql');
    }
    $med = (int)$m->query('SELECT id FROM medicos ORDER BY id LIMIT 1')->fetch_assoc()['id'];
    $pac = (int)$m->query('SELECT id FROM pacientes ORDER BY id LIMIT 1')->fetch_assoc()['id'];
    $hoy = date('Y-m-d');
    $manana = date('Y-m-d', strtotime('+1 day'));
    $recep = ['rol' => 'recepcionista', 'usuario_id' => 0, 'medico_id' => 0, 'nombre' => 'Recep', 'ip' => ''];
    $doc = ['rol' => 'medico', 'usuario_id' => 0, 'medico_id' => $med, 'nombre' => 'Dr Prueba', 'ip' => ''];
    $otro = ['rol' => 'medico', 'usuario_id' => 0, 'medico_id' => $med + 9999, 'nombre' => 'Otro', 'ip' => ''];
    $codigo = static function (callable $fn): ?int {
        try { $fn(); return null; } catch (RevError $e) { return $e->getCode(); }
    };
    $origen = 0; $hcId = 0;
    $ids = [];
    try {
        $m->query("INSERT INTO consultas (paciente_id, medico_id, fecha, hora, estado, tipo_consulta) VALUES ($pac, $med, '$hoy', '08:00:00', 'completada', 'programada')");
        $origen = (int)$m->insert_id;
        $m->query("INSERT INTO historia_clinica (consulta_id, paciente_id, datos) VALUES ($origen, $pac, '{\"motivo\":\"dolor\"}')");
        $hcId = (int)$m->insert_id;

        $g = rev_guardar_desde_hc($m, $origen, $hcId, ['programar' => true, 'fecha' => $hoy, 'sin_hora_fija' => true, 'motivo' => 'Ver laboratorio']);
        $id = $g['reevaluacion']['id'];
        iguales('pendiente', $g['reevaluacion']['estado']);

        iguales(403, $codigo(fn() => rev_aplicar_accion($m, $id, 'llegada', [], $doc)), 'el médico no registra llegadas');
        iguales(403, $codigo(fn() => rev_aplicar_accion($m, $id, 'iniciar', [], $recep)), 'recepción no inicia la revisión');

        $r = rev_aplicar_accion($m, $id, 'llegada', [], $recep);
        iguales('en_espera', $r['estado']);
        $visita = (int)$r['consulta_visita_id'];
        $ids[] = $visita;
        $v = $m->query("SELECT estado, origen_creacion, es_control, hc_origen_id, medico_id, paciente_id, fecha FROM consultas WHERE id = $visita")->fetch_assoc();
        iguales(['pendiente', 'hc_reevaluacion', '1', (string)$hcId, (string)$med, (string)$pac, $hoy], array_values($v), 'visita ligera sin cobro');
        iguales(409, $codigo(fn() => rev_aplicar_accion($m, $id, 'llegada', [], $recep)), 'no se registra la llegada dos veces');
        iguales(409, $codigo(fn() => rev_aplicar_accion($m, $id, 'cancelar', ['motivo' => 'x yz'], $recep)), 'en espera ya no se cancela como pendiente');
        verdadero(rev_obtener_por_visita($m, $visita)['paciente_nombre'] !== null, 'se resuelve por visita');

        $r = rev_aplicar_accion($m, $id, 'deshacer_llegada', [], $recep);
        iguales('pendiente', $r['estado']);
        iguales(null, $r['consulta_visita_id']);
        iguales('cancelada', $m->query("SELECT estado FROM consultas WHERE id = $visita")->fetch_assoc()['estado'], 'la visita se cancela');

        $r = rev_aplicar_accion($m, $id, 'llegada', [], $recep);
        $visita = (int)$r['consulta_visita_id'];
        $ids[] = $visita;
        iguales(403, $codigo(fn() => rev_aplicar_accion($m, $id, 'iniciar', [], $otro)), 'otro médico no puede');
        iguales('en_revision', rev_aplicar_accion($m, $id, 'iniciar', [], $doc)['estado']);
        iguales('en_revision', rev_aplicar_accion($m, $id, 'iniciar', [], $doc)['estado'], 'iniciar es idempotente');
        iguales(409, $codigo(fn() => rev_aplicar_accion($m, $id, 'deshacer_llegada', [], $recep)), 'ya no se deshace en revisión');

        iguales(400, $codigo(fn() => rev_aplicar_accion($m, $id, 'diferir', ['fecha' => $hoy, 'sin_hora_fija' => true], $doc)), 'diferir exige otra fecha u hora');
        $r = rev_aplicar_accion($m, $id, 'diferir', ['fecha' => $manana, 'sin_hora_fija' => true, 'motivo' => 'Falta el hemograma'], $doc);
        iguales('pendiente', $r['estado']);
        iguales($manana, $r['fecha_sugerida']);
        iguales('cancelada', $m->query("SELECT estado FROM consultas WHERE id = $visita")->fetch_assoc()['estado']);

        $r = rev_aplicar_accion($m, $id, 'llegada', [], $recep);
        $visita = (int)$r['consulta_visita_id'];
        $ids[] = $visita;
        iguales(400, $codigo(fn() => rev_aplicar_accion($m, $id, 'completar', ['evolucion' => 'ok', 'conducta' => 'alta'], $doc)), 'la evolución es obligatoria');
        iguales(400, $codigo(fn() => rev_aplicar_accion($m, $id, 'completar', ['evolucion' => 'Mejoría franca', 'conducta' => 'inventada'], $doc)), 'la conducta debe ser válida');

        $r = rev_aplicar_accion($m, $id, 'completar', [
            'evolucion' => 'Mejoría franca con los resultados', 'conducta' => 'continuar', 'resultados_revisados' => true,
            'siguiente' => ['programar' => true, 'fecha' => $manana, 'sin_hora_fija' => true, 'motivo' => 'Control de respuesta'],
        ], $doc);
        $extra = $r['_extra'] ?? [];
        iguales('completada', $r['estado']);
        iguales(0, $r['abierta']);
        iguales('completada', $m->query("SELECT estado FROM consultas WHERE id = $visita")->fetch_assoc()['estado'], 'la visita queda completada');
        $datos = json_decode($m->query("SELECT datos FROM historia_clinica WHERE id = $hcId")->fetch_assoc()['datos'], true);
        iguales('dolor', $datos['motivo'], 'el resto de la HC no se toca');
        iguales('Mejoría franca con los resultados', $datos['reevaluaciones'][0]['evolucion']);
        iguales('Continuar tratamiento', $datos['reevaluaciones'][0]['conducta_label']);
        verdadero(is_array($extra['siguiente'] ?? null) && $extra['siguiente']['estado'] === 'pendiente', 'se encadena la siguiente reevaluación');
        iguales($id, $extra['siguiente']['reevaluacion_previa_id']);
        iguales(409, $codigo(fn() => rev_aplicar_accion($m, $id, 'completar', ['evolucion' => 'Otra vez', 'conducta' => 'alta'], $doc)), 'una completada no se completa de nuevo');

        // Ventana vencida: no se registra la llegada.
        $sig = $extra['siguiente']['id'];
        $m->query("UPDATE hc_reevaluaciones SET fecha_limite = '" . date('Y-m-d', strtotime('-1 day')) . "' WHERE id = $sig");
        iguales(409, $codigo(fn() => rev_aplicar_accion($m, $sig, 'llegada', [], $recep)), 'fuera de ventana no hay llegada');
    } finally {
        $listaIds = $m->query("SELECT id FROM hc_reevaluaciones WHERE consulta_origen_id = $origen")->fetch_all(MYSQLI_ASSOC);
        foreach ($listaIds as $x) {
            $m->query('DELETE FROM hc_reevaluaciones_eventos WHERE reevaluacion_id = ' . (int)$x['id']);
        }
        $m->query("DELETE FROM hc_reevaluaciones WHERE consulta_origen_id = $origen");
        $m->query("DELETE FROM historia_clinica WHERE consulta_id = $origen");
        if ($ids) {
            $m->query('DELETE FROM consultas WHERE id IN (' . implode(',', array_map('intval', $ids)) . ')');
        }
        if ($origen > 0) {
            $m->query("DELETE FROM consultas WHERE id = $origen");
        }
    }
}, true);

prueba('reevaluación (BD, fase 2): una visita abandonada de un día anterior vuelve a pendiente o vence', function () {
    $m = $GLOBALS['mysqli'];
    $med = (int)$m->query('SELECT id FROM medicos ORDER BY id LIMIT 1')->fetch_assoc()['id'];
    $pac = (int)$m->query('SELECT id FROM pacientes ORDER BY id LIMIT 1')->fetch_assoc()['id'];
    $hoy = date('Y-m-d');
    $ayer = date('Y-m-d H:i:s', strtotime('-1 day'));
    $recep = ['rol' => 'recepcionista', 'usuario_id' => 0, 'medico_id' => 0, 'nombre' => 'Recep', 'ip' => ''];
    $o1 = 990000011; $o2 = 990000012;
    $visitas = [];
    try {
        foreach ([[$o1, date('Y-m-d', strtotime('+3 days')), false], [$o2, date('Y-m-d', strtotime('+3 days')), true]] as [$o, $limite, $vence]) {
            $m->query("INSERT INTO hc_reevaluaciones (consulta_origen_id, hc_id, paciente_id, medico_id, fecha_sugerida, sin_hora_fija, fecha_limite, estado, abierta)
                       VALUES ($o, 0, $pac, $med, '$hoy', 1, '$limite', 'pendiente', 1)");
            $id = (int)$m->insert_id;
            $r = rev_aplicar_accion($m, $id, 'llegada', [], $recep);
            $visitas[$o] = (int)$r['consulta_visita_id'];
            $limiteFinal = $vence ? date('Y-m-d', strtotime('-1 day')) : $limite;
            $m->query("UPDATE hc_reevaluaciones SET llegada_en = '$ayer', fecha_limite = '$limiteFinal' WHERE id = $id");
        }
        rev_revertir_visitas_abandonadas($m);
        $a = $m->query("SELECT estado, consulta_visita_id FROM hc_reevaluaciones WHERE consulta_origen_id = $o1")->fetch_assoc();
        iguales('pendiente', $a['estado'], 'sigue en ventana: vuelve a pendiente');
        iguales(null, $a['consulta_visita_id']);
        $b = $m->query("SELECT estado, abierta FROM hc_reevaluaciones WHERE consulta_origen_id = $o2")->fetch_assoc();
        iguales('vencida', $b['estado'], 'fuera de ventana: vence');
        iguales(null, $b['abierta']);
        foreach ($visitas as $v) {
            iguales('cancelada', $m->query("SELECT estado FROM consultas WHERE id = $v")->fetch_assoc()['estado'], 'la visita abandonada se cancela');
        }
    } finally {
        $m->query("DELETE FROM hc_reevaluaciones_eventos WHERE reevaluacion_id IN (SELECT id FROM hc_reevaluaciones WHERE consulta_origen_id IN ($o1, $o2))");
        $m->query("DELETE FROM hc_reevaluaciones WHERE consulta_origen_id IN ($o1, $o2)");
        if ($visitas) {
            $m->query('DELETE FROM consultas WHERE id IN (' . implode(',', array_map('intval', $visitas)) . ')');
        }
    }
}, true);

prueba('portal del paciente: archivos subidos se publican por archivo, agrupan por atención y respetan los interruptores del Engineer', function () {
    global $mysqli, $marcador, $root;
    $m = $mysqli;
    $obs = $m->real_escape_string($marcador);
    $pac = 987654;
    $otro = 987655;
    $dirExt = $root . '/uploads/documentos_externos/' . $pac;
    $dirImg = $root . '/uploads/imagenes_diagnostico/' . $pac;
    foreach ([$dirExt, $dirImg] as $d) { if (!is_dir($d)) mkdir($d, 0775, true); }
    $fExtPdf = $dirExt . '/phptest_a.pdf';
    $fExtJpg = $dirExt . '/phptest_b.jpg';
    $fImgPdf = $dirImg . '/phptest_c.pdf';
    file_put_contents($fExtPdf, '%PDF-1.4');
    file_put_contents($fExtJpg, 'jpg');
    file_put_contents($fImgPdf, '%PDF-1.4');
    $esc = fn(string $s) => $m->real_escape_string($s);

    $m->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones) VALUES ($pac, 18, 50, 0, 'pagado', '$obs')");
    $c1 = (int)$m->insert_id;
    $m->query("INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones, cotizacion_padre_id, es_adenda) VALUES ($pac, 18, 30, 0, 'pagado', '$obs', $c1, 1)");
    $c2 = (int)$m->insert_id;
    $m->query("INSERT INTO documentos_externos_paciente (paciente_id, tipo, titulo, cotizacion_id, laboratorio_origen) VALUES ($pac, 'laboratorio', 'PHPTEST perfil externo', $c2, 'Lab Roe')");
    $dep = (int)$m->insert_id;
    $m->query("INSERT INTO documentos_externos_archivos (documento_id, nombre_original, archivo_path, tamano, mime_type, publicar_paciente) VALUES ($dep, 'a.pdf', '" . $esc($fExtPdf) . "', 8, 'application/pdf', 1)");
    $aPdf = (int)$m->insert_id;
    $m->query("INSERT INTO documentos_externos_archivos (documento_id, nombre_original, archivo_path, tamano, mime_type, publicar_paciente) VALUES ($dep, 'b.jpg', '" . $esc($fExtJpg) . "', 3, 'image/jpeg', 0)");
    $aJpg = (int)$m->insert_id;
    $m->query("INSERT INTO ordenes_imagen (paciente_id, tipo, indicaciones, estado, cotizacion_id) VALUES ($pac, 'ecografia', 'PHPTEST', 'completado', $c1)");
    $oi = (int)$m->insert_id;
    $m->query("INSERT INTO ordenes_imagen_archivos (orden_id, nombre_original, archivo_path, tamano, mime_type, publicar_paciente, titulo) VALUES ($oi, 'eco.pdf', '" . $esc($fImgPdf) . "', 8, 'application/pdf', 1, 'PHPTEST eco informe')");
    $iPdf = (int)$m->insert_id;
    $porClave = static function (array $docs): array { $r = []; foreach ($docs as $d) { $r[$d['tipo'] . ':' . $d['ref_id']] = $d; } return $r; };
    try {
        $p = $porClave(PortalPaciente::documentos($m, $pac));
        verdadero(isset($p["archivo_externo:$aPdf"]) && isset($p["archivo_imagen:$iPdf"]), 'los PDF publicados aparecen');
        verdadero(!isset($p["archivo_externo:$aJpg"]), 'la imagen no publicada no llega al paciente');
        iguales('disponible', $p["archivo_externo:$aPdf"]['estado']);
        iguales($c1, $p["archivo_externo:$aPdf"]['atencion_id'], 'una adenda se agrupa en la atención raíz');
        iguales($c1, $p["archivo_imagen:$iPdf"]['atencion_id'], 'lab externo e imagen de la misma atención van juntos');
        iguales('laboratorio', $p["archivo_externo:$aPdf"]['categoria']);
        iguales('imagenologia', $p["archivo_imagen:$iPdf"]['categoria']);
        iguales('PHPTEST eco informe', $p["archivo_imagen:$iPdf"]['titulo']);
        verdadero(strpos($p["archivo_externo:$aPdf"]['subtitulo'], 'Lab Roe') !== false, 'muestra el laboratorio de origen');
        verdadero(!array_key_exists('archivo', $p["archivo_externo:$aPdf"]), 'el paciente no recibe datos internos');

        $s = $porClave(PortalPaciente::documentos($m, $pac, true));
        iguales('no_publicado', $s["archivo_externo:$aJpg"]['estado'], 'el personal ve el archivo sin publicar');

        // Descarga: ruta validada y nada fuera de uploads
        verdadero(PortalPaciente::archivoParaEntregar($m, $pac, 'archivo_externo', $aPdf) !== null, 'entrega un archivo propio');
        $m->query("UPDATE documentos_externos_archivos SET archivo_path = '" . $esc($root . '/config.php') . "' WHERE id = $aPdf");
        iguales(null, PortalPaciente::archivoParaEntregar($m, $pac, 'archivo_externo', $aPdf), 'una ruta fuera de uploads no se entrega');
        $m->query("UPDATE documentos_externos_archivos SET archivo_path = '" . $esc($fExtPdf) . "' WHERE id = $aPdf");
        iguales(null, PortalPaciente::archivoParaEntregar($m, $pac, 'laboratorio', 1), 'solo los tipos de archivo');

        // Publicar / retirar
        iguales(false, PortalPaciente::publicarArchivo($m, $otro, 'archivo_externo', $aJpg, true), 'otro paciente no puede publicar este archivo');
        iguales(true, PortalPaciente::publicarArchivo($m, $pac, 'archivo_externo', $aJpg, true));
        verdadero(isset($porClave(PortalPaciente::documentos($m, $pac))["archivo_externo:$aJpg"]), 'publicada, llega al paciente');
        PortalPaciente::publicarArchivo($m, $pac, 'archivo_externo', $aJpg, false);

        // Interruptores del Engineer
        $cambios = PortalPaciente::guardarCategorias($m, ['imagenologia' => false]);
        iguales(['imagenologia' => ['antes' => true, 'despues' => false]], $cambios);
        $p = $porClave(PortalPaciente::documentos($m, $pac));
        verdadero(!isset($p["archivo_imagen:$iPdf"]), 'categoría apagada: no se ve');
        verdadero(isset($p["archivo_externo:$aPdf"]), 'laboratorio sigue visible');
        $s = $porClave(PortalPaciente::documentos($m, $pac, true));
        iguales('en_revision', $s["archivo_imagen:$iPdf"]['estado']);
        iguales('categoria_desactivada', $s["archivo_imagen:$iPdf"]['pendiente_motivo']);
        iguales('en_revision', PortalPaciente::buscarDocumento($m, $pac, 'archivo_imagen', $iPdf)['estado'], 'tampoco se descarga');
        PortalPaciente::guardarCategorias($m, ['laboratorio' => false, 'imagenologia' => true]);
        $p = $porClave(PortalPaciente::documentos($m, $pac));
        verdadero(isset($p["archivo_imagen:$iPdf"]) && !isset($p["archivo_externo:$aPdf"]), 'solo imagenología');
        iguales([], PortalPaciente::guardarCategorias($m, ['laboratorio' => false]), 'sin cambios no registra nada');
    } finally {
        $m->query("DELETE FROM paciente_portal_config WHERE clave LIKE 'publicar\\_%'");
        $m->query("DELETE FROM ordenes_imagen_archivos WHERE orden_id = $oi");
        $m->query("DELETE FROM ordenes_imagen WHERE id = $oi");
        $m->query("DELETE FROM documentos_externos_archivos WHERE documento_id = $dep");
        $m->query("DELETE FROM documentos_externos_paciente WHERE id = $dep");
        $m->query("DELETE FROM cotizaciones WHERE id IN ($c1, $c2)");
        foreach ([$fExtPdf, $fExtJpg, $fImgPdf] as $f) { @unlink($f); }
        @rmdir($dirExt);
        @rmdir($dirImg);
    }
}, true);

/* ───────── Ejecución ───────── */

$bd = null;
if ($conBd) {
    ob_start();
    define('SKIP_PDO_INIT', true);
    require $root . '/config.php';
    ob_end_clean();
    $bd = $mysqli ?? null;
    if (!$bd) {
        fwrite(STDERR, "No hay conexión a la BD: se omiten las pruebas con --db\n");
        $conBd = false;
    } else {
        $GLOBALS['mysqli'] = $bd;
        $tieneColumna = (int)$bd->query("SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'client_request_id'")->fetch_assoc()['c'] === 1;
        if (!$tieneColumna) {
            fwrite(STDERR, "Falta cotizaciones.client_request_id: aplica sql/2026-10-24/001_schema.sql antes de las pruebas con --db\n");
            exit(2);
        }
        limpiarDatosDePrueba($bd);
    }
}

$ok = 0; $fallo = 0; $omitidas = 0;
foreach ($pruebas as [$nombre, $fn, $requiereBd]) {
    if ($requiereBd && !$conBd) {
        $omitidas++;
        echo "  - omitida (requiere --db): $nombre\n";
        continue;
    }
    try {
        $fn();
        $ok++;
        echo "  ✔ $nombre\n";
    } catch (Throwable $e) {
        $fallo++;
        echo "  ✖ $nombre\n      " . $e->getMessage() . "\n";
    }
}
if ($conBd && $bd) {
    limpiarDatosDePrueba($bd);
}
echo "\n$ok pasaron, $fallo fallaron, $omitidas omitidas\n";
exit($fallo > 0 ? 1 : 0);
