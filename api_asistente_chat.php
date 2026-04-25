<?php
// api_asistente_chat.php
// Chat asistente del sistema — base de conocimiento + búsqueda por palabras clave

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

// Verificar sesión activa (cualquier rol autenticado)
$sesionActiva = isset($_SESSION['usuario']) || isset($_SESSION['medico_id']);
if (!$sesionActiva) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

// Determinar rol actual
$rolActual = $_SESSION['usuario']['rol'] ?? 'medico';
$esAdmin   = ($rolActual === 'administrador');

require_once __DIR__ . '/config.php';

$isProductionEnv = defined('IS_PRODUCTION') ? (bool)IS_PRODUCTION : false;

function assistant_normalize_text(string $text): string {
    $normalized = mb_strtolower(trim($text), 'UTF-8');
    return strtr($normalized, [
        'á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u',
        'ä'=>'a','ë'=>'e','ï'=>'i','ö'=>'o','ü'=>'u',
        'ñ'=>'n','ç'=>'c',
    ]);
}

function assistant_current_user_id(): ?int {
    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario']) && isset($_SESSION['usuario']['id'])) {
        return (int)$_SESSION['usuario']['id'];
    }
    if (isset($_SESSION['medico_id'])) {
        return (int)$_SESSION['medico_id'];
    }
    return null;
}

function assistant_table_exists(PDO $pdo, string $tableName): bool {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?");
    $stmt->execute([$tableName]);
    return (int)$stmt->fetchColumn() > 0;
}

// ── Crear tabla si no existe ────────────────────────────────────────────────
if (!$isProductionEnv) {
    $pdo->exec("
    CREATE TABLE IF NOT EXISTS `asistente_conocimiento` (
        `id`            INT          AUTO_INCREMENT PRIMARY KEY,
        `categoria`     VARCHAR(100) NOT NULL,
        `pregunta`      VARCHAR(600) NOT NULL,
        `respuesta`     TEXT         NOT NULL,
        `palabras_clave` VARCHAR(600) NOT NULL DEFAULT '',
        `activo`        TINYINT(1)   NOT NULL DEFAULT 1,
        `orden`         INT          NOT NULL DEFAULT 0,
        `created_at`    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        `updated_at`    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_cat` (`categoria`),
        FULLTEXT KEY `ft_busq` (`pregunta`, `respuesta`, `palabras_clave`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
    CREATE TABLE IF NOT EXISTS `asistente_escalamientos` (
        `id`             INT AUTO_INCREMENT PRIMARY KEY,
        `usuario_id`     INT NULL,
        `usuario_nombre` VARCHAR(180) NOT NULL DEFAULT '',
        `rol`            VARCHAR(60) NOT NULL DEFAULT '',
        `pregunta`       TEXT NOT NULL,
        `motivo`         VARCHAR(120) NOT NULL DEFAULT 'sin_respuesta',
        `estado`         ENUM('pendiente','atendido','cerrado') NOT NULL DEFAULT 'pendiente',
        `url_actual`     VARCHAR(500) NOT NULL DEFAULT '',
        `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_estado` (`estado`),
        KEY `idx_created` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec(" 
    CREATE TABLE IF NOT EXISTS `asistente_codigos_ingesta` (
        `id`            INT AUTO_INCREMENT PRIMARY KEY,
        `codigo`        VARCHAR(64) NOT NULL,
        `descripcion`   VARCHAR(180) NOT NULL DEFAULT '',
        `usos_maximos`  INT NOT NULL DEFAULT 1,
        `usos_actuales` INT NOT NULL DEFAULT 0,
        `expira_en`     DATETIME DEFAULT NULL,
        `activo`        TINYINT(1) NOT NULL DEFAULT 1,
        `created_by`    INT DEFAULT NULL,
        `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_codigo` (`codigo`),
        KEY `idx_activo_expira` (`activo`, `expira_en`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec(" 
    CREATE TABLE IF NOT EXISTS `asistente_borradores_conocimiento` (
        `id`             INT AUTO_INCREMENT PRIMARY KEY,
        `origen`         ENUM('usuario','auto','admin_chat') NOT NULL DEFAULT 'auto',
        `categoria`      VARCHAR(100) NOT NULL,
        `pregunta`       VARCHAR(600) NOT NULL,
        `respuesta`      TEXT NOT NULL,
        `palabras_clave` VARCHAR(600) NOT NULL DEFAULT '',
        `estado`         ENUM('pendiente','aprobado','rechazado','publicado_auto') NOT NULL DEFAULT 'pendiente',
        `query_fuente`   VARCHAR(600) DEFAULT NULL,
        `created_by`     INT DEFAULT NULL,
        `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_estado` (`estado`),
        KEY `idx_origen` (`origen`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

if (!assistant_table_exists($pdo, 'asistente_conocimiento') || !assistant_table_exists($pdo, 'asistente_escalamientos')) {
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'error' => 'Tablas del asistente no inicializadas. Ejecute la migracion SQL antes de usar este endpoint.'
    ]);
    exit;
}

// ── Seed de conocimiento inicial ────────────────────────────────────────────
$count = $pdo->query("SELECT COUNT(*) FROM `asistente_conocimiento`")->fetchColumn();
if ((int)$count === 0) {
    $seed = [
        // CAJA
        ['Caja', '¿Cómo abro la caja?', 'Para abrir la caja ve al menú lateral → Finanzas → Reporte de Caja. Ahí encontrarás el botón "Abrir Caja". Ingresa el monto inicial del turno y confirma. Una vez abierta podrás registrar cobros.', 'abrir caja iniciar turno apertura caja', 1],
        ['Caja', '¿Cómo cierro la caja?', 'Ve a Finanzas → Reporte de Caja y selecciona "Cerrar Caja". Se mostrará el resumen del día con ingresos, egresos y el saldo final. Confirma el cierre para terminar el turno.', 'cerrar caja cierre turno saldo final', 2],
        ['Caja', '¿Cómo reabro una caja cerrada?', 'Solo los administradores pueden reabrir cajas. Ve a Finanzas → Reabrir Cajas, selecciona la caja cerrada de la lista y usa el botón "Reabrir". Esto restaura el turno para poder seguir operando.', 'reabrir caja caja cerrada administrador', 3],
        ['Caja', '¿Qué hago si la caja está cerrada y necesito cobrar?', 'Si la caja está cerrada y necesitas operar, un administrador debe reabrirla desde Finanzas → Reabrir Cajas. Sin caja abierta no es posible registrar cobros nuevos.', 'caja cerrada cobro sin caja reabrir urgente', 4],
        // PACIENTES
        ['Pacientes', '¿Cómo registro un paciente nuevo?', 'Ve a Pacientes en el menú lateral. Haz clic en "Nuevo Paciente". Completa los datos requeridos: nombre, apellido, DNI, fecha de nacimiento, género y teléfono. Guarda y el paciente quedará registrado en el sistema.', 'registrar paciente nuevo crear paciente alta paciente dni', 5],
        ['Pacientes', '¿Cómo busco un paciente?', 'En la sección Pacientes puedes buscar por DNI, nombre o apellido usando la barra de búsqueda superior. También en el flujo de cotización rápida del dashboard puedes buscar al paciente directamente.', 'buscar paciente encontrar busqueda dni nombre', 6],
        ['Pacientes', '¿Cómo veo el historial de un paciente?', 'En Pacientes, haz clic sobre el nombre del paciente para abrir su perfil. Desde ahí puedes ver el historial de consultas, historia clínica, documentos y resultados de laboratorio.', 'historial paciente perfil consultas previas documentos', 7],
        // COTIZACIONES
        ['Cotizaciones', '¿Cómo hago una cotización?', 'El flujo de cotización rápida está en el Dashboard (panel Atención en Recepción). Paso 1: busca el paciente por DNI. Paso 2: confirma el paciente. Paso 3: selecciona los servicios a cotizar (consulta, laboratorio, ecografía, etc.) y genera la cotización.', 'cotizar cotizacion presupuesto servicios recepcion', 8],
        ['Cotizaciones', '¿Dónde veo las cotizaciones pendientes?', 'Ve a Finanzas → Cotizaciones. Ahí aparecen todas las cotizaciones con su estado (pendiente, cobrada, vencida). Puedes filtrar por fecha o paciente.', 'cotizaciones pendientes lista historial', 9],
        ['Cotizaciones', '¿Cómo cobro una cotización?', 'En Finanzas → Cotizaciones, selecciona la cotización y haz clic en "Cobrar". Podrás aplicar descuentos, elegir el método de pago y confirmar el cobro. Se generará el comprobante automáticamente.', 'cobrar cotizacion pago metodo descuento comprobante', 10],
        // CONSULTAS
        ['Consultas', '¿Cómo agendo una consulta?', 'Ve a Lista de Consultas → "Nueva Consulta". Selecciona el médico, la fecha, el paciente y el tipo de consulta (primera vez o control). Si es de seguimiento, se vinculará automáticamente a la historia clínica anterior.', 'agendar consulta nueva cita medico fecha', 11],
        ['Consultas', '¿Cómo veo las consultas del día?', 'En el Dashboard verás las consultas del día en el panel principal. También puedes ir a Lista de Consultas y filtrar por fecha de hoy. Los médicos ven sus propias consultas en su panel médico.', 'consultas hoy lista del dia agenda', 12],
        ['Consultas', '¿Cómo cancelo una consulta?', 'En Lista de Consultas, busca la consulta y usa el botón de opciones (tres puntos o ícono de editar). Selecciona "Cancelar" e ingresa el motivo. La consulta quedará marcada como cancelada.', 'cancelar consulta anular cita', 13],
        // HISTORIA CLÍNICA
        ['Historia Clínica', '¿Cómo lleno la historia clínica?', 'El médico accede a la HC desde su panel (Mis Consultas → seleccionar consulta). Completa los campos: motivo de consulta, examen físico, diagnóstico (CIE-10), plan de tratamiento y prescripción. Puede guardar como borrador o confirmar la atención.', 'historia clinica HC llenar completar medico diagnostico', 14],
        ['Historia Clínica', '¿Cómo agendo la próxima cita desde la HC?', 'Al final del formulario de Historia Clínica hay una sección "Próxima Cita". Activa el interruptor, selecciona la fecha, el tipo (control o nueva consulta) y el médico. Se creará la cita automáticamente al confirmar la HC.', 'proxima cita agendar desde HC historia clinica seguimiento control', 15],
        ['Historia Clínica', '¿Cómo veo el historial completo del paciente en HC?', 'Dentro de la pantalla de Historia Clínica hay un botón "Ver historial completo" o el ícono del asistente. Se abrirá el panel de historial mostrando todas las HC previas, diagnósticos, laboratorios y medicaciones anteriores.', 'historial clinico previo HC anterior diagnostico medicamentos', 16],
        // LABORATORIO
        ['Laboratorio', '¿Cómo solicito un examen de laboratorio?', 'Desde la Historia Clínica, el médico puede ir a la sección Laboratorio y agregar órdenes. También el personal de laboratorio gestiona las órdenes desde su Panel de Laboratorio.', 'solicitar examen laboratorio orden lab analisis', 17],
        ['Laboratorio', '¿Cómo cargo los resultados de laboratorio?', 'El laboratorista ingresa a Panel de Laboratorio, selecciona la orden del paciente y usa "Cargar Resultados". Puede ingresar valores numéricos y adjuntar archivos PDF o imágenes.', 'cargar resultados laboratorio adjuntar pdf analisis', 18],
        ['Laboratorio', '¿Cómo ve el médico los resultados de laboratorio?', 'El médico los verá directamente en la Historia Clínica del paciente, en la sección de apoyo diagnóstico. También puede acceder desde el panel de historial del paciente.', 'ver resultados laboratorio medico apoyo diagnostico', 19],
        // FARMACIA
        ['Farmacia', '¿Cómo busco un medicamento?', 'Ve a Inventario → Medicamentos. Usa la barra de búsqueda para encontrar por nombre, principio activo o código. También puedes filtrar por categoría o stock disponible.', 'medicamento buscar farmacia inventario stock', 20],
        ['Farmacia', '¿Cómo registro una venta de farmacia?', 'Ve a Farmacia → Ventas. Busca el paciente, agrega los medicamentos del carrito, indica las cantidades y confirma la venta. Se descontará el stock automáticamente.', 'venta farmacia medicamento carrito cobrar', 21],
        // TARIFAS
        ['Tarifas', '¿Cómo gestiono los precios de servicios?', 'Ve a Finanzas → Gestión de Tarifas. Ahí puedes ver, crear y editar los precios de consultas, laboratorio, ecografía, rayos X, procedimientos y más. Solo el administrador puede modificar tarifas.', 'precios tarifas servicios gestionar modificar administrador', 22],
        // USUARIOS Y ROLES
        ['Usuarios', '¿Cómo creo un nuevo usuario del sistema?', 'Solo administradores pueden crear usuarios. Ve a Administración → Usuarios → "Nuevo Usuario". Completa nombre, usuario, contraseña y asigna un rol (médico, recepcionista, laboratorista, etc.).', 'crear usuario nuevo rol asignar administrador', 23],
        ['Usuarios', '¿Cuáles son los roles disponibles?', 'Los roles son: Administrador (acceso total), Médico (panel médico, HC), Recepcionista (atención al cliente, cotizaciones, caja), Laboratorista (panel lab, resultados), Enfermero (triaje, tratamientos), Químico (farmacia, inventario).', 'roles sistema permisos acceso administrador medico recepcionista laboratorista enfermero quimico', 24],
        // DASHBOARD
        ['Dashboard', '¿Qué muestra el Dashboard?', 'El Dashboard muestra: resumen estadístico del día (atenciones, consultas, pacientes, última HC), accesos rápidos a módulos principales, el flujo de cotización rápida para recepción, y recordatorios de citas pendientes.', 'dashboard inicio panel principal estadisticas resumen', 25],
        ['Dashboard', '¿Qué es el flujo de cotización rápida?', 'Es el panel de Atención en Recepción del Dashboard. Permite en 3 pasos: buscar paciente por DNI → confirmar paciente → cotizar servicios. Es el acceso más rápido para generar presupuestos sin navegar por el menú.', 'cotizacion rapida flujo recepcion atender paciente', 26],
        // RECORDATORIOS
        ['Consultas', '¿Cómo funciona Recordatorios de Citas?', 'En el módulo Recordatorios de Citas puedes ver todas las citas programadas. Permite enviar recordatorios a los pacientes y gestionar las confirmaciones de asistencia.', 'recordatorios citas recordar paciente confirmacion', 27],
        // CONFIGURACIÓN
        ['Configuración', '¿Cómo cambio el logo o nombre de la clínica?', 'Ve a Administración → Configuración. Ahí puedes subir el logo, cambiar el nombre de la clínica, ajustar tamaño del logo y el color primario del sistema.', 'logo nombre clinica configuracion personalizar', 28],
        ['Configuración', '¿Cómo cambio el avatar del asistente?', 'Ve a Administración → Configuración → sección "Avatar y Colores". Puedes subir una imagen personalizada para médico, doctora o asistente, y activar el que desees mostrar.', 'avatar asistente imagen personalizar configurar', 29],
        // DESCUENTOS
        ['Cotizaciones', '¿Cómo aplico un descuento?', 'Al cobrar una cotización o en el panel de cobro, hay un campo de descuento donde puedes ingresar el porcentaje o monto a descontar. También existen descuentos predefinidos que el administrador configura en Descuentos.', 'descuento aplicar cobro porcentaje promocion', 30],
        // ECOGRAFÍA / IMAGEN
        ['Laboratorio', '¿Cómo cargo imágenes de ecografía?', 'Desde el apoyo diagnóstico de la Historia Clínica, el personal autorizado puede adjuntar archivos de ecografía. También existe el módulo Órdenes de Imagen donde se gestionan solicitudes y resultados de imágenes diagnósticas.', 'ecografia imagen adjuntar cargar apoyo diagnostico', 31],
        // EGRESOS
        ['Caja', '¿Cómo registro un egreso o gasto?', 'Ve a Finanzas → Egresos → "Nuevo Egreso". Ingresa la descripción, monto, categoría y fecha. Los egresos se descuentan del saldo de la caja del día.', 'egreso gasto registrar salida dinero caja', 32],
        // COMPROBANTE
        ['Cotizaciones', '¿Cómo genero un comprobante o factura?', 'Después de cobrar una cotización, el sistema genera automáticamente un comprobante. Puedes imprimirlo o descargarlo en PDF desde el detalle del cobro en la sección Cotizaciones.', 'comprobante factura imprimir pdf cobro recibo', 33],
    ];

    $sql = "INSERT INTO `asistente_conocimiento` (`categoria`,`pregunta`,`respuesta`,`palabras_clave`,`orden`) VALUES (?,?,?,?,?)";
    $stmt = $pdo->prepare($sql);
    foreach ($seed as $row) {
        $stmt->execute([$row[0], $row[1], $row[2], $row[3], $row[4]]);
    }
}

// Entradas obligatorias del modulo de Gestion de Examenes (Laboratorio).
// Se insertan por pregunta si no existen para no depender de que la tabla este vacia.
$seedLaboratorioConfig = [
    [
        'Laboratorio',
        '¿Cómo creo un examen de laboratorio con valores referenciales?',
        'Ve a Gestion de Examenes (ruta: /examenes-laboratorio) y pulsa "Nuevo Examen". Completa nombre, categoria y metodologia. En "Parametros y Valores de Referencia" agrega filas tipo Parametro y luego " + Referencia " para cada rango. Finalmente guarda con "Crear Examen".',
        'gestion examenes crear examen valores referenciales parametro referencia',
        120,
    ],
    [
        'Laboratorio',
        '¿Cómo configuro valores referenciales por sexo y edad?',
        'Dentro del editor del examen, en cada Parametro puedes agregar multiples referencias. Cada referencia tiene campos: valor o rango (min/max), descripcion, sexo (cualquiera, masculino, femenino), edad minima y edad maxima. Usa una referencia por cada grupo etario o sexo que necesites.',
        'sexo edad minima maxima rango valor min max referencia laboratorio',
        121,
    ],
    [
        'Laboratorio',
        '¿Cuál es la diferencia entre valor, valor min y valor max en referencias?',
        '"Valor" se usa para referencias cualitativas o texto (ej: Negativo). "Valor min" y "Valor max" se usan para rangos numericos (ej: 4.5 a 11.0). Puedes usar ambos enfoques segun el tipo de parametro del examen.',
        'valor valor min valor max cualitativo numerico negativo positivo rango',
        122,
    ],
    [
        'Laboratorio',
        '¿Cómo agrego subtítulos o títulos en un examen de laboratorio?',
        'En el editor usa los botones "+ Subtitulo" o "+ Titulo" para secciones del reporte. Tambien puedes usar formato (negrita, cursiva, alineacion, color de texto y fondo) para ordenar mejor la impresion de resultados.',
        'subtitulo titulo formato negrita color alineacion examen laboratorio',
        123,
    ],
    [
        'Laboratorio',
        '¿Cómo ordeno los parámetros del examen?',
        'Cada fila del editor se puede reordenar con arrastrar (icono de agarre), con flechas arriba/abajo o con atajos Alt/Ctrl + flecha. El sistema guarda el orden y lo usa en la previsualizacion y en el reporte final.',
        'ordenar parametros arrastrar flechas atajos alt ctrl examen',
        124,
    ],
    [
        'Laboratorio',
        '¿Qué otros campos de configuración tiene un examen de laboratorio?',
        'Ademas de valores referenciales, puedes definir precio publico, precio convenio, tipo de tubo, tipo de frasco, tiempo de resultado, condicion del paciente y preanalitica. Esto ayuda tanto al flujo de cotizacion como a la toma de muestra.',
        'precio publico convenio tubo frasco tiempo resultado condicion paciente preanalitica',
        125,
    ],
    [
        'Historia Clínica',
        '¿Cómo funciona la cita de control desde la HC?',
        'En la seccion "Proxima cita sugerida" activa "Programar proxima cita al guardar esta HC". Si marcas "Cita de control", se agenda como seguimiento (sin cobro cuando la regla esta habilitada). Completa fecha y hora; al guardar la HC se crea la cita automaticamente.',
        'cita control proxima cita sugerida seguimiento sin cobro guardar hc',
        126,
    ],
    [
        'Historia Clínica',
        '¿Para qué sirven los botones imprimir HC, Lab y Receta?',
        'En la parte inferior de Historia Clinica: "HC" imprime la historia actual completa, "Lab" imprime resultados/ordenes de laboratorio disponibles y "Receta" imprime la prescripcion de medicamentos registrada. Si no hay datos en una seccion, el boton puede deshabilitarse o imprimir vacio.',
        'imprimir hc lab receta botones impresion historia clinica',
        127,
    ],
    [
        'Historia Clínica',
        '¿Cómo agrego un medicamento manualmente en la receta?',
        'En "Receta medica" puedes buscar por nombre o codigo. Si no aparece, usa "No encuentro el medicamento, agregar manualmente" y completa nombre, dosis, frecuencia, duracion y observaciones. Luego agrega el item para que quede en la receta final e impresion.',
        'medicamento manual receta agregar manualmente dosis frecuencia duracion',
        128,
    ],
    [
        'Historia Clínica',
        '¿Cómo registro tratamiento por hora o por día?',
        'En receta/tratamiento define la frecuencia en formato clinico claro, por ejemplo: "cada 8 horas" o "1 vez al dia". Tambien puedes detallar horario en observaciones (ej: 08:00 - 16:00 - 24:00) y asociarlo a la duracion del tratamiento para evitar ambiguedades.',
        'tratamiento por hora por dia cada 8 horas frecuencia observaciones',
        129,
    ],
    [
        'Historia Clínica',
        '¿Qué funcionalidades tiene el CIE10 en la HC?',
        'El selector CIE10 permite buscar diagnosticos por codigo o descripcion, estandarizar el registro clinico y facilitar reportes. Puedes seleccionar el diagnostico principal y complementar con codigos relacionados segun el caso clinico.',
        'cie10 buscar codigo descripcion diagnostico principal reportes',
        130,
    ],
    [
        'Historia Clínica',
        '¿Se puede agregar más de un diagnóstico en CIE10?',
        'Si. Puedes agregar multiples diagnosticos CIE10 en la misma atencion (principal y adicionales). Se recomienda registrar primero el principal y luego los asociados para mantener coherencia clinica y administrativa.',
        'agregar mas de un diagnostico multiple cie10 principal adicional',
        131,
    ],
];

$stmtExistePregunta = $pdo->prepare("SELECT id FROM asistente_conocimiento WHERE pregunta = ? LIMIT 1");
$stmtInsertConocimiento = $pdo->prepare(
    "INSERT INTO asistente_conocimiento (categoria, pregunta, respuesta, palabras_clave, orden, activo) VALUES (?, ?, ?, ?, ?, 1)"
);
foreach ($seedLaboratorioConfig as $entry) {
    $stmtExistePregunta->execute([$entry[1]]);
    $exists = $stmtExistePregunta->fetchColumn();
    if (!$exists) {
        $stmtInsertConocimiento->execute([$entry[0], $entry[1], $entry[2], $entry[3], $entry[4]]);
    }
}

// ── Router ──────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'categorias';

    if ($action === 'categorias') {
        // Devuelve lista de categorías con conteo
        $rows = $pdo->query("
            SELECT categoria, COUNT(*) as total
            FROM asistente_conocimiento
            WHERE activo = 1
            GROUP BY categoria
            ORDER BY MIN(orden)
        ")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'categorias' => $rows]);
        exit;
    }

    if ($action === 'sugerencias') {
        // Devuelve preguntas frecuentes de una categoría
        $cat = $_GET['categoria'] ?? '';
        $params = ['activo' => 1];
        $where = 'activo = 1';
        if ($cat) {
            $where .= ' AND categoria = :cat';
            $params['cat'] = $cat;
        }
        $stmt = $pdo->prepare("SELECT id, categoria, pregunta FROM asistente_conocimiento WHERE $where ORDER BY orden LIMIT 8");
        $stmt->execute($params);
        echo json_encode(['success' => true, 'sugerencias' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    }

    if ($action === 'lista' && $esAdmin) {
        // Admin: lista completa para gestión
        $rows = $pdo->query("SELECT * FROM asistente_conocimiento ORDER BY categoria, orden")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'entradas' => $rows]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Acción no válida']);
    exit;
}

if ($method === 'POST') {
    $body   = file_get_contents('php://input');
    $data   = json_decode($body, true);
    $action = $data['action'] ?? ($_POST['action'] ?? '');

    $hasTablaCodigos = assistant_table_exists($pdo, 'asistente_codigos_ingesta');
    $hasTablaBorradores = assistant_table_exists($pdo, 'asistente_borradores_conocimiento');
    $hasTablaFallidas = assistant_table_exists($pdo, 'asistente_queries_fallidas');

    $fn_validarCodigoIngesta = function(string $codigo) use ($pdo, $hasTablaCodigos): bool {
        if (!$hasTablaCodigos || $codigo === '') {
            return false;
        }
        $stmt = $pdo->prepare("SELECT id, usos_maximos, usos_actuales, expira_en, activo FROM asistente_codigos_ingesta WHERE codigo = ? LIMIT 1");
        $stmt->execute([mb_strtoupper(trim($codigo), 'UTF-8')]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || (int)$row['activo'] !== 1) {
            return false;
        }
        if (!empty($row['expira_en']) && strtotime((string)$row['expira_en']) < time()) {
            return false;
        }
        if ((int)$row['usos_actuales'] >= (int)$row['usos_maximos']) {
            return false;
        }
        $upd = $pdo->prepare("UPDATE asistente_codigos_ingesta SET usos_actuales = usos_actuales + 1 WHERE id = ?");
        $upd->execute([(int)$row['id']]);
        return true;
    };

    $fn_guardarFallidaYAutoAprender = function(string $preguntaUsuario, array $palabrasParaBuscar, string $rolActual) use ($pdo, $hasTablaFallidas, $hasTablaBorradores) {
        if (!$hasTablaFallidas) {
            return;
        }

        $usuarioId = assistant_current_user_id();
        $palabrasStr = implode(',', array_slice($palabrasParaBuscar, 0, 8));

        $sel = $pdo->prepare("SELECT id, cantidad_ocurrencias FROM asistente_queries_fallidas WHERE query_original = ? ORDER BY id DESC LIMIT 1");
        $sel->execute([$preguntaUsuario]);
        $existing = $sel->fetch(PDO::FETCH_ASSOC);

        $fallidaId = null;
        $ocurrencias = 1;
        if ($existing) {
            $fallidaId = (int)$existing['id'];
            $ocurrencias = (int)$existing['cantidad_ocurrencias'] + 1;
            $upd = $pdo->prepare("UPDATE asistente_queries_fallidas SET cantidad_ocurrencias = ?, palabras_extraidas = ?, rol_usuario = ?, usuario_id = ?, updated_at = NOW() WHERE id = ?");
            $upd->execute([$ocurrencias, $palabrasStr, $rolActual, $usuarioId, $fallidaId]);
        } else {
            $ins = $pdo->prepare("INSERT INTO asistente_queries_fallidas (query_original, palabras_extraidas, resultado_tipo, rol_usuario, usuario_id, cantidad_ocurrencias) VALUES (?, ?, 'sin_respuesta', ?, ?, 1)");
            $ins->execute([$preguntaUsuario, $palabrasStr, $rolActual, $usuarioId]);
            $fallidaId = (int)$pdo->lastInsertId();
        }

        if ($ocurrencias < 5) {
            return;
        }

        $checkConocimiento = $pdo->prepare("SELECT id FROM asistente_conocimiento WHERE pregunta = ? LIMIT 1");
        $checkConocimiento->execute([$preguntaUsuario]);
        if ($checkConocimiento->fetchColumn()) {
            return;
        }

        $categoriaAuto = 'Aprendizaje automatico';
        $respuestaAuto = 'Esta duda se repitio varias veces y fue aprendida automaticamente. Si deseas, puedo guiarte paso a paso. Tambien puedes escribir detalles del modulo y accion para mejorar esta respuesta.';
        $ordenAuto = 9800;

        $insCon = $pdo->prepare("INSERT INTO asistente_conocimiento (categoria, pregunta, respuesta, palabras_clave, orden, activo) VALUES (?, ?, ?, ?, ?, 1)");
        $insCon->execute([$categoriaAuto, $preguntaUsuario, $respuestaAuto, $palabrasStr, $ordenAuto]);

        if ($hasTablaBorradores) {
            $insBor = $pdo->prepare("INSERT INTO asistente_borradores_conocimiento (origen, categoria, pregunta, respuesta, palabras_clave, estado, query_fuente, created_by) VALUES ('auto', ?, ?, ?, ?, 'publicado_auto', ?, ?)");
            $insBor->execute([$categoriaAuto, $preguntaUsuario, $respuestaAuto, $palabrasStr, $preguntaUsuario, $usuarioId]);
        }

        if ($fallidaId) {
            $updFallida = $pdo->prepare("UPDATE asistente_queries_fallidas SET sugerencia_creada = 1 WHERE id = ?");
            $updFallida->execute([$fallidaId]);
        }
    };

    $fn_guardarConocimiento = function(string $categoriaKb, string $preguntaKb, string $respuestaKb, string $palabrasKb, string $queryFuente = '') use ($pdo, $hasTablaBorradores): array {
        $check = $pdo->prepare("SELECT id FROM asistente_conocimiento WHERE pregunta = ? LIMIT 1");
        $check->execute([$preguntaKb]);
        $existsId = $check->fetchColumn();
        if ($existsId) {
            return [
                'id' => (int)$existsId,
                'duplicado' => true,
                'mensaje' => 'La pregunta ya existia en la base. No se duplico.',
            ];
        }

        $ordenNuevo = (int)$pdo->query("SELECT COALESCE(MAX(orden), 0) + 1 FROM asistente_conocimiento")->fetchColumn();
        $insKb = $pdo->prepare("INSERT INTO asistente_conocimiento (categoria, pregunta, respuesta, palabras_clave, orden, activo) VALUES (?, ?, ?, ?, ?, 1)");
        $insKb->execute([$categoriaKb, $preguntaKb, $respuestaKb, $palabrasKb, $ordenNuevo]);
        $nuevoId = (int)$pdo->lastInsertId();

        if ($hasTablaBorradores) {
            $insBor = $pdo->prepare("INSERT INTO asistente_borradores_conocimiento (origen, categoria, pregunta, respuesta, palabras_clave, estado, query_fuente, created_by) VALUES ('admin_chat', ?, ?, ?, ?, 'publicado_auto', ?, ?)");
            $insBor->execute([$categoriaKb, $preguntaKb, $respuestaKb, $palabrasKb, $queryFuente, assistant_current_user_id()]);
        }

        return [
            'id' => $nuevoId,
            'duplicado' => false,
            'mensaje' => 'Conocimiento guardado correctamente. Ya esta disponible para responder nuevas consultas.',
        ];
    };

    if ($action === 'escalar') {
        $pregunta = trim((string)($data['pregunta'] ?? ''));
        $motivo = trim((string)($data['motivo'] ?? 'sin_respuesta'));
        $urlActual = trim((string)($data['url_actual'] ?? ''));

        if ($pregunta === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Pregunta requerida para escalar']);
            exit;
        }

        $usuarioId = null;
        $usuarioNombre = '';
        $rolUsuario = (string)$rolActual;

        if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
            $usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;
            $nombre = trim((string)($_SESSION['usuario']['nombre'] ?? ''));
            $apellido = trim((string)($_SESSION['usuario']['apellido'] ?? ''));
            $usuarioNombre = trim($nombre . ' ' . $apellido);
            if ($usuarioNombre === '') {
                $usuarioNombre = trim((string)($_SESSION['usuario']['usuario'] ?? ''));
            }
            $rolUsuario = trim((string)($_SESSION['usuario']['rol'] ?? $rolUsuario));
        } elseif (isset($_SESSION['medico_id'])) {
            $usuarioId = (int)$_SESSION['medico_id'];
            $usuarioNombre = 'Medico #' . (int)$usuarioId;
            $rolUsuario = 'medico';
        }

        $stmtEscalar = $pdo->prepare("INSERT INTO asistente_escalamientos (usuario_id, usuario_nombre, rol, pregunta, motivo, url_actual) VALUES (?,?,?,?,?,?)");
        $stmtEscalar->execute([
            $usuarioId,
            $usuarioNombre,
            $rolUsuario,
            $pregunta,
            $motivo !== '' ? $motivo : 'sin_respuesta',
            $urlActual,
        ]);

        echo json_encode([
            'success' => true,
            'escalamiento_id' => (int)$pdo->lastInsertId(),
        ]);
        exit;
    }

    // ── Función auxiliar: obtener sinónimos de una palabra ─────────────────
    $fn_obtenerSinonimos = function($palabra) use ($pdo) {
        $sinonimos = [$palabra];
        try {
            $stmt = $pdo->prepare("SELECT DISTINCT sinonimo FROM asistente_sinonimos WHERE (palabra_base = ? OR sinonimo = ?) AND activo = 1");
            $stmt->execute([$palabra, $palabra]);
            $resultados = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $sinonimos = array_merge($sinonimos, $resultados);
        } catch (Exception $e) {
            // Si tabla no existe, solo devolver palabra original
        }
        return array_unique($sinonimos);
    };

    // ── Búsqueda por pregunta ──────────────────────────────────────────────
    if ($action === 'buscar') {
        $preguntaUsuario = trim((string)($data['pregunta'] ?? ''));

        // Comando de autorizacion para carga por chat: AUTH <CODIGO>
        // Tambien acepta solo la contrasena directa para facilitar el uso.
        $kbPassword = defined('ASISTENTE_KB_PASSWORD') ? ASISTENTE_KB_PASSWORD : '';
        $codigoIngresado = '';
        if (preg_match('/^auth\s+(\S{4,64})$/i', $preguntaUsuario, $mAuth)) {
            $codigoIngresado = trim($mAuth[1]);
        } elseif ($kbPassword !== '' && hash_equals($kbPassword, $preguntaUsuario)) {
            $codigoIngresado = $preguntaUsuario;
        }

        if ($codigoIngresado !== '') {
            // Verificar primero contra la contrasena directa configurada por instancia
            $esPasswordDirecto = ($kbPassword !== '' && hash_equals($kbPassword, $codigoIngresado));

            // Si no es contrasena directa, verificar codigo de tabla (uppercase)
            $codigoValido = false;
            if (!$esPasswordDirecto) {
                $codigoValido = $fn_validarCodigoIngesta(mb_strtoupper($codigoIngresado, 'UTF-8'));
            }

            if (!$esPasswordDirecto && !$codigoValido) {
                echo json_encode([
                    'success' => true,
                    'tipo' => 'sin_resultado',
                    'resultado' => null,
                    'sugerencias' => [],
                    'mensaje' => 'Codigo de autorizacion invalido o vencido. Solicita un codigo nuevo al administrador.',
                ]);
                exit;
            }

            $_SESSION['asistente_kb_auth_until'] = time() + 600;
            echo json_encode([
                'success' => true,
                'tipo' => 'respuesta',
                'resultado' => [
                    'id' => null,
                    'categoria' => 'Administracion',
                    'pregunta' => 'Autorizacion de carga por chat',
                    'respuesta' => 'Autorizacion confirmada por 10 minutos. Puedes usar modo rapido: #KB | categoria | pregunta | respuesta | palabras clave, o modo guiado escribiendo: #KB',
                ],
                'relacionadas' => [],
                'mensaje' => null,
            ]);
            exit;
        }

        // Cancelar wizard de conocimiento en cualquier momento
        if (preg_match('/^(cancelar\s*kb|cancelar|salir)$/i', $preguntaUsuario)) {
            if (!empty($_SESSION['asistente_kb_wizard'])) {
                unset($_SESSION['asistente_kb_wizard']);
                echo json_encode([
                    'success' => true,
                    'tipo' => 'respuesta',
                    'resultado' => [
                        'id' => null,
                        'categoria' => 'Administracion',
                        'pregunta' => 'Wizard cancelado',
                        'respuesta' => 'Se cancelo la carga de conocimiento por chat. Cuando quieras retomarlo, escribe: #KB',
                    ],
                    'relacionadas' => [],
                    'mensaje' => null,
                ]);
                exit;
            }
        }

        // Iniciar wizard guiado de carga por chat
        if (preg_match('/^#kb$/i', $preguntaUsuario)) {
            $authUntil = (int)($_SESSION['asistente_kb_auth_until'] ?? 0);
            if ($authUntil < time()) {
                echo json_encode([
                    'success' => true,
                    'tipo' => 'sin_resultado',
                    'resultado' => null,
                    'sugerencias' => [],
                    'mensaje' => 'No autorizado. Primero envia: AUTH TU_CODIGO_ADMIN',
                ]);
                exit;
            }

            $_SESSION['asistente_kb_wizard'] = [
                'step' => 'categoria',
                'categoria' => '',
                'pregunta' => '',
                'respuesta' => '',
                'palabras' => '',
            ];

            echo json_encode([
                'success' => true,
                'tipo' => 'respuesta',
                'resultado' => [
                    'id' => null,
                    'categoria' => 'Administracion',
                    'pregunta' => 'Wizard de conocimiento iniciado',
                    'respuesta' => 'Paso 1/5: Indica la categoria (ej: Consultas, Historia Clinica, Caja, Laboratorio). Puedes escribir cancelar para salir.',
                ],
                'relacionadas' => [],
                'mensaje' => null,
            ]);
            exit;
        }

        // Continuacion del wizard guiado
        if (!empty($_SESSION['asistente_kb_wizard']) && is_array($_SESSION['asistente_kb_wizard'])) {
            $authUntil = (int)($_SESSION['asistente_kb_auth_until'] ?? 0);
            if ($authUntil < time()) {
                unset($_SESSION['asistente_kb_wizard']);
                echo json_encode([
                    'success' => true,
                    'tipo' => 'sin_resultado',
                    'resultado' => null,
                    'sugerencias' => [],
                    'mensaje' => 'La autorizacion expiro. Vuelve a enviar AUTH TU_CODIGO_ADMIN para continuar.',
                ]);
                exit;
            }

            $wizard = $_SESSION['asistente_kb_wizard'];
            $step = (string)($wizard['step'] ?? 'categoria');

            if ($step === 'categoria') {
                $wizard['categoria'] = trim($preguntaUsuario);
                $wizard['step'] = 'pregunta';
                $_SESSION['asistente_kb_wizard'] = $wizard;
                echo json_encode([
                    'success' => true,
                    'tipo' => 'respuesta',
                    'resultado' => [
                        'id' => null,
                        'categoria' => 'Administracion',
                        'pregunta' => 'Paso 2/5',
                        'respuesta' => 'Ahora escribe la pregunta que quieres guardar.',
                    ],
                    'relacionadas' => [],
                    'mensaje' => null,
                ]);
                exit;
            }

            if ($step === 'pregunta') {
                $wizard['pregunta'] = trim($preguntaUsuario);
                $wizard['step'] = 'respuesta';
                $_SESSION['asistente_kb_wizard'] = $wizard;
                echo json_encode([
                    'success' => true,
                    'tipo' => 'respuesta',
                    'resultado' => [
                        'id' => null,
                        'categoria' => 'Administracion',
                        'pregunta' => 'Paso 3/5',
                        'respuesta' => 'Perfecto. Ahora escribe la respuesta que deberia dar el asistente.',
                    ],
                    'relacionadas' => [],
                    'mensaje' => null,
                ]);
                exit;
            }

            if ($step === 'respuesta') {
                $wizard['respuesta'] = trim($preguntaUsuario);
                $wizard['step'] = 'palabras';
                $_SESSION['asistente_kb_wizard'] = $wizard;
                echo json_encode([
                    'success' => true,
                    'tipo' => 'respuesta',
                    'resultado' => [
                        'id' => null,
                        'categoria' => 'Administracion',
                        'pregunta' => 'Paso 4/5',
                        'respuesta' => 'Ahora escribe palabras clave separadas por espacio (ej: reprogramar cita agenda fecha).',
                    ],
                    'relacionadas' => [],
                    'mensaje' => null,
                ]);
                exit;
            }

            if ($step === 'palabras') {
                $wizard['palabras'] = trim($preguntaUsuario);
                $wizard['step'] = 'confirmacion';
                $_SESSION['asistente_kb_wizard'] = $wizard;
                $resumen = "Resumen:\nCategoria: " . $wizard['categoria'] . "\nPregunta: " . $wizard['pregunta'] . "\nPalabras clave: " . $wizard['palabras'] . "\n\nEscribe SI para guardar o NO para cancelar.";
                echo json_encode([
                    'success' => true,
                    'tipo' => 'respuesta',
                    'resultado' => [
                        'id' => null,
                        'categoria' => 'Administracion',
                        'pregunta' => 'Paso 5/5',
                        'respuesta' => $resumen,
                    ],
                    'relacionadas' => [],
                    'mensaje' => null,
                ]);
                exit;
            }

            if ($step === 'confirmacion') {
                $confirm = assistant_normalize_text($preguntaUsuario);
                if (in_array($confirm, ['si', 's', 'confirmar', 'guardar'], true)) {
                    $resultadoGuardar = $fn_guardarConocimiento(
                        (string)$wizard['categoria'],
                        (string)$wizard['pregunta'],
                        (string)$wizard['respuesta'],
                        (string)$wizard['palabras'],
                        'wizard_chat'
                    );
                    unset($_SESSION['asistente_kb_wizard']);
                    echo json_encode([
                        'success' => true,
                        'tipo' => 'respuesta',
                        'resultado' => [
                            'id' => (int)$resultadoGuardar['id'],
                            'categoria' => (string)$wizard['categoria'],
                            'pregunta' => (string)$wizard['pregunta'],
                            'respuesta' => (string)$resultadoGuardar['mensaje'],
                        ],
                        'relacionadas' => [],
                        'mensaje' => null,
                    ]);
                    exit;
                }

                unset($_SESSION['asistente_kb_wizard']);
                echo json_encode([
                    'success' => true,
                    'tipo' => 'respuesta',
                    'resultado' => [
                        'id' => null,
                        'categoria' => 'Administracion',
                        'pregunta' => 'Carga cancelada',
                        'respuesta' => 'No se guardo la entrada. Si deseas intentarlo de nuevo, escribe: #KB',
                    ],
                    'relacionadas' => [],
                    'mensaje' => null,
                ]);
                exit;
            }
        }

        // Comando de carga por chat: #KB | categoria | pregunta | respuesta | palabras
        if (preg_match('/^#kb\s*\|/i', $preguntaUsuario)) {
            $authUntil = (int)($_SESSION['asistente_kb_auth_until'] ?? 0);
            if ($authUntil < time()) {
                echo json_encode([
                    'success' => true,
                    'tipo' => 'sin_resultado',
                    'resultado' => null,
                    'sugerencias' => [],
                    'mensaje' => 'No autorizado. Primero envia: AUTH TU_CODIGO_ADMIN',
                ]);
                exit;
            }

            $payload = preg_replace('/^#kb\s*\|/i', '', $preguntaUsuario);
            $partes = array_map('trim', explode('|', (string)$payload));
            if (count($partes) < 4) {
                echo json_encode([
                    'success' => true,
                    'tipo' => 'sin_resultado',
                    'resultado' => null,
                    'sugerencias' => [],
                    'mensaje' => 'Formato invalido. Usa: #KB | categoria | pregunta | respuesta | palabras clave',
                ]);
                exit;
            }

            $categoriaKb = (string)($partes[0] ?? 'General');
            $preguntaKb = (string)($partes[1] ?? '');
            $respuestaKb = (string)($partes[2] ?? '');
            $palabrasKb = (string)($partes[3] ?? '');

            if ($preguntaKb === '' || $respuestaKb === '') {
                echo json_encode([
                    'success' => false,
                    'error' => 'Pregunta y respuesta son requeridas para guardar conocimiento.',
                ]);
                exit;
            }

            $resultadoGuardar = $fn_guardarConocimiento($categoriaKb, $preguntaKb, $respuestaKb, $palabrasKb, $preguntaUsuario);

            echo json_encode([
                'success' => true,
                'tipo' => 'respuesta',
                'resultado' => [
                    'id' => (int)$resultadoGuardar['id'],
                    'categoria' => $categoriaKb,
                    'pregunta' => $preguntaKb,
                    'respuesta' => (string)$resultadoGuardar['mensaje'],
                ],
                'relacionadas' => [],
                'mensaje' => null,
            ]);
            exit;
        }

        if (strlen($preguntaUsuario) < 2) {
            echo json_encode(['success' => false, 'error' => 'Pregunta demasiado corta']);
            exit;
        }

        // Normalizar: minúsculas, quitar tildes básicas
        $normalizado = assistant_normalize_text($preguntaUsuario);

        // Stopwords español básicas
        $stopwords = ['como','que','es','de','la','el','en','un','una','los','las','se','si','para',
                      'por','con','del','al','hay','cual','cuales','donde','cuando','quien','mi',
                      'me','te','le','lo','no','ya','mas','pero','porque','puedo','puede','hacer',
                      'ver','a','e','o','y','su','sus','desde','hasta','entre','son','fue','ser',
                      'esta','este','eso','eso','algo','algun','alguna','nuevo','nueva','quiero',
                      'necesito','tengo','tiene','queria','quería'];

        // Extraer palabras con 3+ caracteres que no sean stopwords
        preg_match_all('/\b[a-z]{3,}\b/', $normalizado, $matches);
        $palabras = array_diff(array_unique($matches[0]), $stopwords);
        
        // ✨ NUEVA: Expandir palabras con sinónimos (Mini IA - Fase 1)
        $palabrasConSinonimos = [];
        foreach ($palabras as $p) {
            $sinonimos = $fn_obtenerSinonimos($p);
            $palabrasConSinonimos = array_merge($palabrasConSinonimos, $sinonimos);
        }
        $palabrasConSinonimos = array_unique($palabrasConSinonimos);
        $palabrasParaBuscar = !empty($palabrasConSinonimos) ? $palabrasConSinonimos : $palabras;

        // Temas tecnicos de infraestructura que no forman parte del alcance
        // del asistente funcional del sistema (deben escalarse a soporte).
        $temasNoSoportados = [
            'spf', 'dkim', 'dmarc', 'dns', 'smtp', 'imap', 'pop3', 'mx',
            'hosting', 'dominio', 'dominios', 'servidor', 'correo', 'mail',
            'ssl', 'tls', 'cpanel', 'cloudflare', 'nameserver', 'firewall'
        ];
        $hitTemaNoSoportado = false;
        foreach ($temasNoSoportados as $tema) {
            if (strpos($normalizado, $tema) !== false) {
                $hitTemaNoSoportado = true;
                break;
            }
        }
        if ($hitTemaNoSoportado) {
            echo json_encode([
                'success' => true,
                'tipo' => 'sin_resultado',
                'resultado' => null,
                'sugerencias' => [],
                'mensaje' => 'Esta consulta parece de infraestructura tecnica y esta fuera del alcance del asistente funcional. Te recomiendo derivarla a soporte.',
            ]);
            exit;
        }

        if (empty($palabrasParaBuscar)) {
            // Sin palabras útiles — devolver sugerencias generales
            $stmt = $pdo->query("SELECT id, categoria, pregunta, respuesta FROM asistente_conocimiento WHERE activo=1 ORDER BY orden LIMIT 4");
            $general = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success'   => true,
                'tipo'      => 'general',
                'resultado' => null,
                'sugerencias' => $general,
                'mensaje'   => 'No encontré tu duda específica. Aquí hay algunas preguntas frecuentes:',
            ]);
            exit;
        }

        // Traer todas las entradas activas y calcular score en PHP
        $stmt = $pdo->query("SELECT id, categoria, pregunta, respuesta, palabras_clave FROM asistente_conocimiento WHERE activo=1");
        $entradas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $scored = [];
        foreach ($entradas as $e) {
            $target = mb_strtolower($e['pregunta'] . ' ' . $e['palabras_clave'] . ' ' . $e['respuesta'], 'UTF-8');
            $target = strtr($target, [
                'á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u',
                'ä'=>'a','ë'=>'e','ï'=>'i','ö'=>'o','ü'=>'u',
                'ñ'=>'n',
            ]);
            $score = 0;
            $hits = 0;
            foreach ($palabrasParaBuscar as $p) {
                // Palabras en palabras_clave tienen más peso
                $inClave = strpos(mb_strtolower(strtr($e['palabras_clave'],'áéíóúñ','aeioun'), 'UTF-8'), $p) !== false;
                $inTarget = strpos($target, $p) !== false;
                if ($inClave) {
                    $score += 3;
                    $hits++;
                } elseif ($inTarget) {
                    $score += 1;
                    $hits++;
                }
            }
            if ($score > 0) {
                $scored[] = ['score' => $score, 'hits' => $hits, 'entrada' => $e];
            }
        }

        if (empty($scored)) {
            // Guardar query fallida y aprender automaticamente por repeticion.
            $fn_guardarFallidaYAutoAprender($preguntaUsuario, $palabrasParaBuscar, (string)$rolActual);
            
            // Sin resultados — sugerencias generales
            $stmt = $pdo->query("SELECT id, categoria, pregunta, respuesta FROM asistente_conocimiento WHERE activo=1 ORDER BY orden LIMIT 4");
            $general = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success'   => true,
                'tipo'      => 'sin_resultado',
                'resultado' => null,
                'sugerencias' => $general,
                'mensaje'   => 'No encontré información sobre tu consulta. ¿Qué parte del sistema no entiendes para explicarte mejor?',
            ]);
            exit;
        }

        // Ordenar por score descendente
        usort($scored, fn($a, $b) => $b['score'] - $a['score']);

        $top = array_slice($scored, 0, 3);
        $mejor = $top[0] ?? null;
        if (!$mejor) {
            echo json_encode([
                'success'   => true,
                'tipo'      => 'sin_resultado',
                'resultado' => null,
                'sugerencias' => [],
                'mensaje'   => 'No encontré información sobre tu consulta en la base actual.',
            ]);
            exit;
        }

        // Filtro anti-falsos-positivos:
        // - Si la pregunta tiene varias palabras utiles, exigir al menos 2 coincidencias.
        // - Exigir score minimo para evitar respuestas por coincidencia muy debil.
        $totalPalabras = count($palabras);  // Usar palabras ORIGINALES para criterio
        $hitsMinimos = $totalPalabras >= 3 ? 2 : 1;
        $scoreMinimo = $totalPalabras >= 3 ? 4 : 3;
        if (((int)$mejor['hits'] < $hitsMinimos) || ((int)$mejor['score'] < $scoreMinimo)) {
            $fn_guardarFallidaYAutoAprender($preguntaUsuario, $palabrasParaBuscar, (string)$rolActual);
            
            $stmt = $pdo->query("SELECT id, categoria, pregunta, respuesta FROM asistente_conocimiento WHERE activo=1 ORDER BY orden LIMIT 4");
            $general = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success'   => true,
                'tipo'      => 'sin_resultado',
                'resultado' => null,
                'sugerencias' => $general,
                'mensaje'   => 'No tengo suficiente certeza para responder esa duda. ¿Qué parte exacta del sistema no entiendes para explicarte mejor?',
            ]);
            exit;
        }

        $principal = $top[0]['entrada'];

        // Entradas relacionadas (si hay más de 1 resultado)
        $relacionadas = [];
        for ($i = 1; $i < count($top); $i++) {
            $relacionadas[] = [
                'id'       => $top[$i]['entrada']['id'],
                'pregunta' => $top[$i]['entrada']['pregunta'],
                'categoria'=> $top[$i]['entrada']['categoria'],
            ];
        }

        echo json_encode([
            'success'     => true,
            'tipo'        => 'respuesta',
            'resultado'   => [
                'id'        => $principal['id'],
                'categoria' => $principal['categoria'],
                'pregunta'  => $principal['pregunta'],
                'respuesta' => $principal['respuesta'],
            ],
            'relacionadas' => $relacionadas,
            'mensaje'      => null,
        ]);
        exit;
    }

    // ── CRUD para administrador ────────────────────────────────────────────
    if (!$esAdmin) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Solo administradores pueden gestionar el conocimiento']);
        exit;
    }

    if ($action === 'crear') {
        $stmt = $pdo->prepare("INSERT INTO asistente_conocimiento (categoria,pregunta,respuesta,palabras_clave,orden) VALUES (?,?,?,?,?)");
        $stmt->execute([
            trim($data['categoria'] ?? ''),
            trim($data['pregunta']  ?? ''),
            trim($data['respuesta'] ?? ''),
            trim($data['palabras_clave'] ?? ''),
            (int)($data['orden'] ?? 0),
        ]);
        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        exit;
    }

    if ($action === 'editar') {
        $stmt = $pdo->prepare("UPDATE asistente_conocimiento SET categoria=?,pregunta=?,respuesta=?,palabras_clave=?,orden=?,activo=? WHERE id=?");
        $stmt->execute([
            trim($data['categoria'] ?? ''),
            trim($data['pregunta']  ?? ''),
            trim($data['respuesta'] ?? ''),
            trim($data['palabras_clave'] ?? ''),
            (int)($data['orden'] ?? 0),
            (int)($data['activo'] ?? 1),
            (int)($data['id'] ?? 0),
        ]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'eliminar') {
        $stmt = $pdo->prepare("DELETE FROM asistente_conocimiento WHERE id=?");
        $stmt->execute([(int)($data['id'] ?? 0)]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'generar_codigo_ingesta') {
        if (!$hasTablaCodigos) {
            echo json_encode(['success' => false, 'error' => 'Tabla asistente_codigos_ingesta no existe. Ejecuta la migracion nueva.']);
            exit;
        }

        $prefijo = 'KB';
        $codigo = $prefijo . strtoupper(substr(md5(uniqid((string)mt_rand(), true)), 0, 8));
        $descripcion = trim((string)($data['descripcion'] ?? 'Codigo de carga por chat'));
        $minutos = max(1, (int)($data['minutos'] ?? 10));
        $usosMaximos = max(1, (int)($data['usos_maximos'] ?? 1));

        $expiraEn = date('Y-m-d H:i:s', time() + ($minutos * 60));
        $stmt = $pdo->prepare("INSERT INTO asistente_codigos_ingesta (codigo, descripcion, usos_maximos, usos_actuales, expira_en, activo, created_by) VALUES (?, ?, ?, 0, ?, 1, ?)");
        $stmt->execute([$codigo, $descripcion, $usosMaximos, $expiraEn, assistant_current_user_id()]);

        echo json_encode([
            'success' => true,
            'codigo' => $codigo,
            'expira_en' => $expiraEn,
            'usos_maximos' => $usosMaximos,
            'instruccion_chat' => 'En el chat envia: AUTH ' . $codigo,
        ]);
        exit;
    }

    // ✨ NUEVA: Endpoint para admin — ver queries fallidas (auto-learning)
    if ($action === 'listar_queries_fallidas') {
        try {
            // Devolver TOP 20 queries sin respuesta, agrupadas
            $stmt = $pdo->query("
                SELECT 
                    id,
                    query_original,
                    cantidad_ocurrencias,
                    COUNT(DISTINCT usuario_id) as usuarios_diferentes,
                    GROUP_CONCAT(DISTINCT rol_usuario) as roles_afectados,
                    created_at,
                    sugerencia_creada
                FROM asistente_queries_fallidas
                WHERE sugerencia_creada = 0
                  AND resultado_tipo IN ('sin_respuesta', 'respuesta_mala')
                GROUP BY query_original
                ORDER BY cantidad_ocurrencias DESC, created_at DESC
                LIMIT 20
            ");
            $fallidas = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success' => true,
                'total' => count($fallidas),
                'queries_fallidas' => $fallidas,
            ]);
            exit;
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => 'Error al obtener queries fallidas: ' . $e->getMessage()]);
            exit;
        }
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Acción no reconocida']);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
