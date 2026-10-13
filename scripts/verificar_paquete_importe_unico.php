<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}
require_once dirname(__DIR__) . '/modules/PaqueteComercialModule.php';
require_once dirname(__DIR__) . '/modules/HonorarioModule.php';
require_once dirname(__DIR__) . '/modules/CobroModule.php';
if (in_array('--catalogo=7', $argv, true)) session_start();

function cargarFunciones(string $archivo, array $nombres): void
{
    $tokens = token_get_all(file_get_contents($archivo));
    $total = count($tokens);
    for ($i = 0; $i < $total; $i++) {
        if (!is_array($tokens[$i]) || $tokens[$i][0] !== T_FUNCTION) continue;
        $j = $i + 1;
        while ($j < $total && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
        if (!is_array($tokens[$j]) || !in_array($tokens[$j][1], $nombres, true)) continue;
        $codigo = '';
        $abierto = false;
        $depth = 0;
        for (; $i < $total; $i++) {
            $token = $tokens[$i];
            $text = is_array($token) ? $token[1] : $token;
            $codigo .= $text;
            if ($token === '{') { $depth++; $abierto = true; }
            if ($token === '}' && --$depth === 0 && $abierto) break;
        }
        eval($codigo);
    }
    foreach ($nombres as $nombre) {
        if (!function_exists($nombre)) throw new RuntimeException('Falta funcion de prueba: ' . $nombre);
    }
}

function verificar($esperado, $actual, string $caso): void
{
    if ($esperado !== $actual) {
        throw new RuntimeException($caso . ': esperado ' . json_encode($esperado) . ', recibido ' . json_encode($actual));
    }
    echo "OK: $caso\n";
}

$root = dirname(__DIR__);
cargarFunciones($root . '/api_cotizaciones.php', [
    'normalizar_tipo_servicio_cotizacion', 'cotizacion_firma_servicio_basica',
    'cotizacion_extraer_regla_honorario_paquete', 'cotizacion_filtrar_detalles_delta_adenda',
    'build_paquete_honorario_snapshot_payload',
    'monto_derivacion_desde_detalle',
    'build_laboratorio_snapshot_payload', 'get_exam_version_id_from_payload',
    'get_exam_version_snapshot', 'table_exists',
]);
cargarFunciones($root . '/api_paquetes_perfiles.php', [
    'pp_to_float', 'pp_calcular_resumen_reparto_campana', 'pp_validar_reparto_campana',
]);
$tarifa = ['id' => 280, 'precio_particular' => 70, 'monto_medico' => 25, 'porcentaje_medico' => 50, 'medico_id' => 59, 'descripcion' => 'Consulta'];
$consulta = [
    'servicio_tipo' => 'consulta', 'servicio_id' => 280, 'medico_id' => 59,
    'cantidad' => 1, 'precio_unitario' => 70, 'precio_lista_snapshot' => 70,
    'descripcion' => 'Consulta', 'honorario_regla' => ['modo_honorario' => 'monto_fijo_medico_paquete', 'monto_fijo_medico' => 40],
];
$eco = array_merge($consulta, ['servicio_tipo' => 'ecografia', 'servicio_id' => 283, 'descripcion' => 'Ecografia', 'precio_lista_snapshot' => 90]);
$paquete = ['servicio_tipo' => 'paquete', 'servicio_id' => 7, 'paquete_id' => 7, 'cantidad' => 1, 'precio_unitario' => 140, 'subtotal' => 140, 'descripcion' => 'Consulta + eco', 'componentes' => [$consulta, $eco]];
$expandir = static function ($p) use ($tarifa) {
    return PaqueteComercialModule::expandir([$p], 'normalizar_tipo_servicio_cotizacion', static function () use ($tarifa) { return $tarifa; });
};
$items = $expandir($paquete);
verificar([140.0, 0, 0], array_column($items, 'subtotal'), 'cargo unico 140; servicios clinicos en cero');
verificar(3, count($items), 'se preservan ambos componentes');
foreach ($items as $item) {
    try {
        PaqueteComercialModule::validarOperacionIndividual($item);
        throw new RuntimeException('Se permitio retirar un detalle aislado del paquete');
    } catch (InvalidArgumentException $e) {
        echo "OK: cargo/componente no admite eliminacion, cantidad ni devolucion individual\n";
    }
}
PaqueteComercialModule::validarOperacionIndividual($consulta);
$calcular = new ReflectionMethod(HonorarioModule::class, 'calcularDatosMovimiento');
$honConsulta = $calcular->invoke(null, $items[1], $tarifa, 'consulta', 'efectivo');
$honEco = $calcular->invoke(null, $items[2], $tarifa, 'ecografia', 'efectivo');
verificar([40.0, 40.0, 60.0], [$honConsulta['monto_medico'], $honEco['monto_medico'], $honConsulta['monto_clinica'] + $honEco['monto_clinica']], 'honorarios 40 + 40 y clinica 60');
verificar(140.0, $honConsulta['tarifa_total'] + $honEco['tarifa_total'], 'reparto contable conserva total');
$sinHonorario = $consulta;
$sinHonorario['honorario_regla']['monto_fijo_medico'] = 0;
$todoClinica = $expandir(array_merge($paquete, ['componentes' => [$sinHonorario]]));
verificar([0.0, 140.0], [
    PaqueteComercialModule::snapshot($todoClinica[1])['paquete_honorario_medico'],
    PaqueteComercialModule::snapshot($todoClinica[1])['paquete_honorario_clinica'],
], 'honorario cero deja el paquete completo para clinica');
verificar('importe_unico', build_paquete_honorario_snapshot_payload($items[1])['paquete_modelo_comercial'], 'snapshot comercial se conserva al persistir');
$porcentaje = array_merge($consulta, ['honorario_regla' => ['modo_honorario' => 'porcentaje_medico_paquete', 'porcentaje_medico' => 20], 'subtotal_referencial' => 70]);
verificar(14.0, PaqueteComercialModule::honorario($porcentaje, $tarifa), '20% sobre referencia 70, no sobre paquete 140');
$normal = array_merge($consulta, ['honorario_regla' => ['modo_honorario' => 'usar_configuracion_medico']]);
verificar(25.0, PaqueteComercialModule::honorario($normal, $tarifa), 'configuracion normal usa monto medico del tarifario');
$sinRegla = $items[1];
$sinRegla['honorario_regla'] = [];
verificar(['modo_honorario' => 'usar_configuracion_medico'], cotizacion_extraer_regla_honorario_paquete($sinRegla), 'conversion sin regla explicita conserva configuracion normal');
$tarifaPorcentaje = $tarifa;
$tarifaPorcentaje['monto_medico'] = 0;
verificar(35.0, PaqueteComercialModule::honorario($normal, $tarifaPorcentaje), 'configuracion normal usa porcentaje del tarifario');
$doble = $expandir(array_merge($paquete, ['cantidad' => 2, 'subtotal' => 280]));
verificar([280.0, 0, 0], array_column($doble, 'subtotal'), 'dos paquetes sin prorrateo');
verificar([2, 2], [$doble[1]['cantidad'], $doble[2]['cantidad']], 'cantidad de componentes se multiplica una sola vez');
verificar(80.0, PaqueteComercialModule::snapshot($doble[1])['paquete_honorario_medico'], 'honorario fijo escala por cantidad');
$existente = ['id' => 100, 'cotizacion_id' => 10, 'servicio_tipo' => 'consulta', 'servicio_id' => 280, 'cantidad' => 1, 'subtotal' => 70, 'snapshot_json' => null];
$repetidos = []; $ajustes = [];
$delta = cotizacion_filtrar_detalles_delta_adenda($items, ['consulta|280' => true], $repetidos, $ajustes, ['consulta|280' => $existente]);
verificar(70.0, $delta[0]['subtotal'], 'conversion conserva cargo previo 70 y adiciona solo 70');
verificar(70, $ajustes[0]['detalle_existente']['subtotal'], 'conversion no revalora importe anterior');
verificar(1, count($ajustes), 'actualiza regla de honorario de consulta existente');
verificar(70.0, PaqueteComercialModule::snapshot($delta[0])['paquete_importe_reconocido'], 'credito previo trazable en paquete');
verificar(2, count($delta), 'no duplica consulta en adenda');
$persistidos = [];
$firmasPersistidas = [];
$mapaPersistidos = [];
foreach ($items as $index => $item) {
    $item['id'] = 200 + $index;
    $item['cotizacion_id'] = 894;
    $persistidos[] = $item;
    $firma = cotizacion_firma_servicio_basica($item['servicio_tipo'], $item['servicio_id']);
    $firmasPersistidas[$firma] = true;
    $mapaPersistidos[$firma] = $item;
}
$nuevoProcedimiento = ['servicio_tipo' => 'procedimiento', 'servicio_id' => 302, 'cantidad' => 1, 'subtotal' => 120];
$repetidos = []; $ajustes = [];
$deltaReenvio = cotizacion_filtrar_detalles_delta_adenda([...$persistidos, $nuevoProcedimiento], $firmasPersistidas, $repetidos, $ajustes, $mapaPersistidos);
verificar([$nuevoProcedimiento], $deltaReenvio, 'adenda desde merge de paquete persistido agrega solo procedimiento nuevo');
verificar([], $ajustes, 'reenvio del paquete no modifica honorarios originales');
try {
    $otroPaquete = $expandir($paquete);
    cotizacion_filtrar_detalles_delta_adenda($otroPaquete, $firmasPersistidas, $repetidos, $ajustes, $mapaPersistidos);
    throw new RuntimeException('Se acepto un nuevo paquete que reutiliza servicios de otro');
} catch (Exception $e) {
    if ($e->getMessage() !== 'El servicio ya pertenece a otro paquete. No se puede cobrar dos veces.') throw $e;
    echo "OK: nuevo grupo sigue bloqueando doble cobro de servicios de otro paquete\n";
}
$descuento = new ReflectionMethod(CobroModule::class, 'distribuirDescuentoProporcionalEnDetalles');
$netos = $descuento->invoke(null, $items, 10);
verificar([130.0, 0, 0], array_column($netos, 'subtotal'), 'descuento solo reduce cargo comercial');
$netos = PaqueteComercialModule::aplicarDescuentos($netos);
$honConsultaNeto = $calcular->invoke(null, $netos[1], $tarifa, 'consulta', 'efectivo');
$honEcoNeto = $calcular->invoke(null, $netos[2], $tarifa, 'ecografia', 'efectivo');
verificar([40.0, 40.0, 50.0], [$honConsultaNeto['monto_medico'], $honEcoNeto['monto_medico'], $honConsultaNeto['monto_clinica'] + $honEcoNeto['monto_clinica']], 'descuento conserva honorarios fijos y reduce remanente');
$netosSegundoAbono = $descuento->invoke(null, $netos, 5);
$netosSegundoAbono = PaqueteComercialModule::aplicarDescuentos($netosSegundoAbono);
verificar(45.0, PaqueteComercialModule::snapshot($netosSegundoAbono[2])['paquete_honorario_clinica'], 'segundo descuento acumula sin restaurar el remanente');
$solidario = PaqueteComercialModule::aplicarDescuentos($descuento->invoke(null, $items, 140), null, true);
verificar([0, 0, 0.0], [
    PaqueteComercialModule::snapshot($solidario[1])['paquete_honorario_medico'],
    PaqueteComercialModule::snapshot($solidario[2])['paquete_honorario_medico'],
    PaqueteComercialModule::snapshot($solidario[2])['paquete_honorario_clinica'],
], 'atencion solidaria mantiene renuncia explicita y venta cero');
try {
    PaqueteComercialModule::aplicarDescuentos($descuento->invoke(null, $items, 61));
    throw new RuntimeException('Se acepto un descuento que reduce honorarios');
} catch (InvalidArgumentException $e) {
    echo "OK: descuento no puede consumir honorarios medicos\n";
}
$ecoOtroMedico = $items[2];
$ecoOtroMedico['medico_id'] = 60;
$honOtroMedico = $calcular->invoke(null, $ecoOtroMedico, $tarifa, 'ecografia', 'efectivo');
verificar([59, 60], [$honConsulta['medico_id'], $honOtroMedico['medico_id']], 'honorarios conservan el medico de cada componente');
$laboratorio = array_merge($items[1], ['servicio_tipo' => 'laboratorio', 'tipo_derivacion' => 'porcentaje', 'valor_derivacion' => 20]);
verificar(14.0, monto_derivacion_desde_detalle($laboratorio), 'laboratorio derivado usa referencia aun con venta cero');
verificar(70.0, PaqueteComercialModule::baseReferencia($consulta + ['subtotal' => 70]), 'servicio normal conserva su base de venta');
$procedimiento = array_merge($consulta, ['servicio_tipo' => 'procedimiento', 'servicio_id' => 302, 'consulta_id' => 370, 'fecha_programada' => '2026-10-12', 'hora_programada' => '09:00']);
$paqueteProcedimiento = $expandir(array_merge($paquete, ['componentes' => [$consulta, $procedimiento, ['servicio_tipo' => 'laboratorio', 'servicio_id' => 1, 'cantidad' => 1, 'precio_lista_snapshot' => 20]]]));
verificar(['consulta', 'procedimiento', 'laboratorio'], array_column(array_slice($paqueteProcedimiento, 1), 'servicio_tipo'), 'se conservan identidades clinicas de consulta, procedimiento y laboratorio');

// Regresion: un componente de laboratorio de un paquete lleva su snapshot como arreglo y el
// endpoint (init_api.php convierte warnings en excepciones) fallaba con "Array to string conversion".
$conexionDoble = new class {
    public function query($sql)
    {
        return new class {
            private $filas = [['TABLE_NAME' => 'examenes_laboratorio_versiones']];
            public function fetch_assoc() { return array_shift($this->filas); }
        };
    }
    public function prepare($sql)
    {
        return new class {
            public function bind_param(...$args) { return true; }
            public function execute() { return true; }
            public function close() { return true; }
            public function get_result()
            {
                return new class {
                    public function fetch_assoc()
                    {
                        return ['id' => 55, 'examen_id' => 3, 'version_num' => 2, 'hash_contenido' => 'abc', 'nombre_snapshot' => 'Hemograma Completo'];
                    }
                };
            }
        };
    }
};
$componenteLab = $paqueteProcedimiento[3];
verificar(true, is_array($componenteLab['snapshot_json']), 'el componente de laboratorio de un paquete lleva snapshot como arreglo');
set_error_handler(static function ($severidad, $mensaje, $archivo, $linea) {
    throw new ErrorException($mensaje, 0, $severidad, $archivo, $linea);
});
try {
    $snapshotLab = build_laboratorio_snapshot_payload($conexionDoble, $componenteLab);
} finally {
    restore_error_handler();
}
verificar([55, 'Hemograma Completo', false], [$snapshotLab['version_id'] ?? null, $snapshotLab['nombre'] ?? null, isset($snapshotLab['paquete_modelo_comercial'])], 'laboratorio en paquete conserva la version del examen y no usa los metadatos del paquete como snapshot');
$snapshotExamenTexto = ['servicio_id' => 3, 'snapshot_json' => json_encode(['id' => 3, 'version_id' => 9, 'nombre' => 'Glucosa'])];
verificar(9, build_laboratorio_snapshot_payload($conexionDoble, $snapshotExamenTexto)['version_id'], 'snapshot de examen enviado como texto JSON se sigue respetando');
$snapshotExamenArreglo = ['servicio_id' => 3, 'snapshot_json' => ['id' => 3, 'version_id' => 9, 'nombre' => 'Glucosa', 'paquete_modelo_comercial' => 'importe_unico']];
verificar(9, build_laboratorio_snapshot_payload($conexionDoble, $snapshotExamenArreglo)['version_id'], 'snapshot de examen como arreglo con datos de examen se respeta aunque traiga metadatos de paquete');
verificar(false, strpos(file_get_contents($root . '/api_cotizaciones.php'), "(string)\$detalle['snapshot_json']") !== false, 'el endpoint no vuelve a convertir snapshot_json a texto sin validar su tipo');
verificar([370, '2026-10-12', '09:00'], [$paqueteProcedimiento[2]['consulta_id'], $paqueteProcedimiento[2]['fecha_programada'], $paqueteProcedimiento[2]['hora_programada']], 'se conserva vinculo a consulta y programacion');
$resumen = new ReflectionMethod(CobroModule::class, 'construirResumenCobroPorCotizacion');
$soloHonorario = $items[1]; $soloHonorario['cotizacion_id'] = 10; $soloHonorario['_paquete_solo_honorario'] = 1;
verificar([], $resumen->invoke(null, [$soloHonorario]), 'componente recuperado no genera abono ni vinculo de cobro');
$ppItems = [
    ['descripcion_snapshot' => 'Consulta', 'cantidad' => 1, 'subtotal_snapshot' => 70, 'honorario_regla' => $consulta['honorario_regla']],
    ['descripcion_snapshot' => 'Eco', 'cantidad' => 1, 'subtotal_snapshot' => 90, 'honorario_regla' => $eco['honorario_regla']],
];
$ppResumen = pp_calcular_resumen_reparto_campana(140, $ppItems);
verificar([80.0, 60.0], [$ppResumen['suma_medicos'], $ppResumen['monto_clinica_calculado']], 'configuracion de paquete coincide con cobro');
pp_validar_reparto_campana(140, $ppItems, ['reparto_campana' => ['monto_clinica_fijo' => 60]]);
try {
    $expandir(array_merge($paquete, ['subtotal' => 50]));
    throw new RuntimeException('Se aceptaron honorarios mayores al precio');
} catch (InvalidArgumentException $e) {
    echo "OK: rechaza honorarios superiores al precio global\n";
}
echo "Todas las pruebas de paquete pasaron. No se conecto ni modifico BD.\n";
if (in_array('--catalogo=7', $argv, true)) {
    require $root . '/config.php';
    $conn->begin_transaction(MYSQLI_TRANS_START_READ_ONLY);
    try {
        $catalogo = $conn->query('SELECT * FROM paquetes_perfiles WHERE id = 7')->fetch_assoc();
        if (!$catalogo) throw new RuntimeException('No existe el paquete 7 en el catalogo');
        $componentes = $conn->query("SELECT i.*, hr.modo_honorario, hr.monto_fijo_medico, hr.porcentaje_medico
            FROM paquetes_perfiles_items i
            LEFT JOIN paquetes_perfiles_items_honorario_reglas hr ON hr.paquete_item_id = i.id AND hr.activo = 1
            WHERE i.paquete_id = 7 AND i.activo = 1 ORDER BY i.id")->fetch_all(MYSQLI_ASSOC);
        foreach ($componentes as &$componente) {
            $componente['honorario_regla'] = [
                'modo_honorario' => $componente['modo_honorario'] ?: 'usar_configuracion_medico',
                'monto_fijo_medico' => $componente['monto_fijo_medico'],
                'porcentaje_medico' => $componente['porcentaje_medico'],
            ];
        }
        unset($componente);
        $reales = PaqueteComercialModule::expandir([[
            'servicio_tipo' => $catalogo['tipo'], 'servicio_id' => 7,
            'cantidad' => 1, 'precio_unitario' => $catalogo['precio_global_venta'],
            'componentes' => $componentes,
        ]], 'normalizar_tipo_servicio_cotizacion', static function ($item) use ($conn) {
            return PaqueteComercialModule::tarifa($conn, $item);
        });
        verificar([140.0, 0, 0], array_column($reales, 'subtotal'), 'catalogo real: una venta 140 y componentes sin prorrateo');
        PaqueteComercialModule::validarAnulacionCotizacion($conn, 0, $reales);
        verificar([40.0, 40.0], array_map(static function ($item) {
            return PaqueteComercialModule::snapshot($item)['paquete_honorario_medico'];
        }, array_slice($reales, 1)), 'catalogo real: honorarios configurados 40/40');
        echo "Catalogo verificado en transaccion READ ONLY; sin schema ni datos modificados.\n";
    } finally {
        $conn->rollback();
        $conn->close();
    }
}
