<?php
// Portal del paciente (módulo 'portal_pacientes'): el paciente entra con DNI + PIN y descarga sus resultados.
//
// Qué se publica hoy: informes de laboratorio (orden "completado" con resultado) e imagenología (informe con PDF generado;
// en borrador o sin PDF se listan "en revisión" y no se pueden descargar).
// Para sumar otro tipo de informe (recetas, informes de consulta...) basta registrarlo en PROVEEDORES con un método
// que liste sus documentos (misma forma que documentosLaboratorio) y agregar su entrega en api_paciente_portal.php.
//
// Reglas de visibilidad de cada documento (decidirEstado):
//   - retenido por el personal            -> en_revision
//   - modo manual y sin liberar           -> en_revision
//   - saldo pendiente y bloqueo activado  -> pendiente_pago
//   - en cualquier otro caso              -> disponible
// "Liberar" solo levanta la retención; nunca salta el bloqueo por deuda.
//
// Archivos subidos (PDF/imagen): 'archivo_externo' (Documentos del paciente) y 'archivo_imagen' (Imágenes diagnósticas).
// Solo llegan al paciente si el personal los publicó (publicar_paciente = 1); los DICOM nunca. Cada documento trae su
// categoría ('laboratorio' | 'imagenologia') y su atención (raíz de la cotización): el Engineer puede apagar una categoría
// completa (config 'publicar_laboratorio' / 'publicar_imagenologia') y el portal agrupa los resultados por atención.
require_once __DIR__ . '/LaboratorioExamenes.php';

final class PortalPaciente {
    public const MODO_AUTOMATICO = 'automatico';
    public const MODO_MANUAL = 'manual';
    public const PERMISO = 'gestionar_portal_pacientes';
    public const MAX_FALLOS_DOCUMENTO = 5;
    public const MAX_FALLOS_IP = 20;
    public const INACTIVIDAD_SEG = 1200;

    /** tipo => método estático que lista los documentos completos del paciente. */
    private const PROVEEDORES = [
        'laboratorio' => 'documentosLaboratorio',
        'imagenologia' => 'documentosImagenologia',
        // Archivos (PDF o imagen) subidos por el personal: resultados de laboratorios de referencia, informes escaneados, etc.
        'archivo_externo' => 'documentosArchivosExternos',
        'archivo_imagen' => 'documentosArchivosImagen',
    ];

    /** Categorías que el Engineer puede encender o apagar en el portal (clave de config 'publicar_<categoria>'). */
    public const CATEGORIAS = ['laboratorio', 'imagenologia'];

    private const MIMES_PUBLICABLES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];

    public static function tiposValidos(): array {
        return array_keys(self::PROVEEDORES);
    }

    // ---------------- Credenciales ----------------

    public static function generarPin(): string {
        return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    public static function pinValido(string $pin): bool {
        return (bool)preg_match('/^\d{6}$/', $pin);
    }

    /** Documento en mayúsculas y sin espacios ni guiones; '' si no queda algo utilizable. */
    public static function normalizarDocumento(string $documento): string {
        $limpio = strtoupper(preg_replace('/[\s\-]+/', '', trim($documento)) ?? '');
        return preg_match('/^[A-Z0-9]{5,15}$/', $limpio) ? $limpio : '';
    }

    /** Administrador siempre; recepcionista solo con el permiso marcado. */
    public static function staffPermitido(?array $usuario): bool {
        if (!is_array($usuario)) {
            return false;
        }
        $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
        if ($rol === 'administrador') {
            return true;
        }
        if ($rol !== 'recepcionista') {
            return false;
        }
        $permisos = $usuario['permisos'] ?? [];
        if (is_string($permisos)) {
            $decodificado = json_decode($permisos, true);
            $permisos = is_array($decodificado) ? $decodificado : explode(',', $permisos);
        }
        if (!is_array($permisos)) {
            return false;
        }
        foreach ($permisos as $p) {
            if (trim((string)$p) === self::PERMISO) {
                return true;
            }
        }
        return false;
    }

    // ---------------- Reglas ----------------

    public static function decidirEstado(string $modo, ?string $override, float $saldo, bool $bloquearDeuda): string {
        if ($override === 'retenido') {
            return 'en_revision';
        }
        if ($modo === self::MODO_MANUAL && $override !== 'liberado') {
            return 'en_revision';
        }
        if ($bloquearDeuda && $saldo > 0.009) {
            return 'pendiente_pago';
        }
        return 'disponible';
    }

    // ---------------- Configuración ----------------

    /** @return array{modo:string,bloquear_deuda:bool,publicar_laboratorio:bool,publicar_imagenologia:bool} valores por defecto si no hay filas */
    public static function config(\mysqli $conn): array {
        $cfg = ['modo' => self::MODO_AUTOMATICO, 'bloquear_deuda' => true, 'publicar_laboratorio' => true, 'publicar_imagenologia' => true];
        foreach (self::consultar($conn, 'SELECT clave, valor FROM paciente_portal_config') as $fila) {
            if ($fila['clave'] === 'modo_liberacion' && $fila['valor'] === self::MODO_MANUAL) {
                $cfg['modo'] = self::MODO_MANUAL;
            }
            if ($fila['clave'] === 'bloquear_deuda') {
                $cfg['bloquear_deuda'] = $fila['valor'] !== '0';
            }
            foreach (self::CATEGORIAS as $cat) {
                if ($fila['clave'] === 'publicar_' . $cat) {
                    $cfg['publicar_' . $cat] = $fila['valor'] !== '0';
                }
            }
        }
        return $cfg;
    }

    /**
     * Interruptores del Engineer: qué categorías muestra el portal del paciente.
     * @return array<string,array{antes:bool,despues:bool}> solo lo que cambió
     */
    public static function guardarCategorias(\mysqli $conn, array $valores): array {
        $antes = self::config($conn);
        $cambios = [];
        $stmt = $conn->prepare('INSERT INTO paciente_portal_config (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)');
        foreach (self::CATEGORIAS as $cat) {
            if (!array_key_exists($cat, $valores)) {
                continue;
            }
            $nuevo = !empty($valores[$cat]);
            $clave = 'publicar_' . $cat;
            $valor = $nuevo ? '1' : '0';
            $stmt->bind_param('ss', $clave, $valor);
            $stmt->execute();
            if ($antes[$clave] !== $nuevo) {
                $cambios[$cat] = ['antes' => $antes[$clave], 'despues' => $nuevo];
            }
        }
        $stmt->close();
        return $cambios;
    }

    public static function guardarConfig(\mysqli $conn, string $modo, bool $bloquearDeuda): void {
        $modo = $modo === self::MODO_MANUAL ? self::MODO_MANUAL : self::MODO_AUTOMATICO;
        $stmt = $conn->prepare('INSERT INTO paciente_portal_config (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)');
        foreach ([['modo_liberacion', $modo], ['bloquear_deuda', $bloquearDeuda ? '1' : '0']] as [$clave, $valor]) {
            $stmt->bind_param('ss', $clave, $valor);
            $stmt->execute();
        }
        $stmt->close();
    }

    // ---------------- Deuda ----------------

    /**
     * Ids de la cadena de cotizaciones (raíz + adendas) a la que pertenece la cotización.
     * @return array{raiz:int,ids:int[]}
     */
    private static function cadenaCotizacion(\mysqli $conn, int $cotizacionId): array {
        $raiz = $cotizacionId;
        for ($i = 0; $i < 20; $i++) {
            $fila = self::consultar($conn, 'SELECT cotizacion_padre_id FROM cotizaciones WHERE id = ? LIMIT 1', 'i', [$raiz])[0] ?? null;
            $padre = (int)($fila['cotizacion_padre_id'] ?? 0);
            if ($padre <= 0 || $padre === $raiz) {
                break;
            }
            $raiz = $padre;
        }
        $ids = [$raiz => true];
        $nivel = [$raiz];
        for ($i = 0; $i < 20 && $nivel; $i++) {
            $ph = implode(',', array_fill(0, count($nivel), '?'));
            $hijos = self::consultar($conn, "SELECT id FROM cotizaciones WHERE cotizacion_padre_id IN ($ph)", str_repeat('i', count($nivel)), $nivel);
            $nivel = [];
            foreach ($hijos as $h) {
                $hid = (int)$h['id'];
                if (!isset($ids[$hid])) {
                    $ids[$hid] = true;
                    $nivel[] = $hid;
                }
            }
        }
        return ['raiz' => $raiz, 'ids' => array_keys($ids)];
    }

    /**
     * Saldo pendiente de toda la cadena de cotizaciones (raíz + adendas) a la que pertenece la cotización.
     * Las anuladas no cuentan. Sin cotización asociada no hay deuda que detectar (0).
     */
    public static function saldoPendiente(\mysqli $conn, ?int $cotizacionId): float {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0) {
            return 0.0;
        }
        $lista = self::cadenaCotizacion($conn, $cotizacionId)['ids'];
        $ph = implode(',', array_fill(0, count($lista), '?'));
        $fila = self::consultar(
            $conn,
            "SELECT COALESCE(SUM(saldo_pendiente), 0) AS saldo FROM cotizaciones WHERE id IN ($ph) AND LOWER(COALESCE(estado, '')) NOT IN ('anulada', 'anulado')",
            str_repeat('i', count($lista)),
            $lista
        )[0] ?? ['saldo' => 0];
        return round((float)$fila['saldo'], 2);
    }

    /**
     * La atención a la que pertenece una cotización (su raíz): el portal agrupa los resultados por atención.
     * @return array{id:int,fecha:?string,numero:string}  id 0 = sin atención asociada
     */
    public static function atencion(\mysqli $conn, ?int $cotizacionId): array {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0) {
            return ['id' => 0, 'fecha' => null, 'numero' => ''];
        }
        $raiz = self::cadenaCotizacion($conn, $cotizacionId)['raiz'];
        $fila = self::consultar($conn, 'SELECT fecha, numero_comprobante FROM cotizaciones WHERE id = ? LIMIT 1', 'i', [$raiz])[0] ?? null;
        return ['id' => $raiz, 'fecha' => $fila['fecha'] ?? null, 'numero' => (string)($fila['numero_comprobante'] ?? '')];
    }

    // ---------------- Documentos ----------------

    /**
     * Documentos completos del paciente con su estado de entrega, del más reciente al más antiguo.
     * $paraStaff agrega el saldo y la decisión manual (el paciente nunca los recibe).
     * @return array<int,array<string,mixed>>
     */
    public static function documentos(\mysqli $conn, int $pacienteId, bool $paraStaff = false): array {
        $cfg = self::config($conn);
        $overrides = [];
        foreach (self::consultar($conn, 'SELECT tipo, ref_id, estado FROM paciente_portal_liberaciones WHERE paciente_id = ?', 'i', [$pacienteId]) as $o) {
            $overrides[$o['tipo'] . ':' . $o['ref_id']] = $o['estado'];
        }

        $saldos = [];
        $atenciones = [];
        $docs = [];
        foreach (self::PROVEEDORES as $tipo => $metodo) {
            foreach (self::$metodo($conn, $pacienteId) as $d) {
                $categoria = $d['categoria'] ?? ($tipo === 'laboratorio' ? 'laboratorio' : 'imagenologia');
                $categoriaActiva = $cfg['publicar_' . $categoria] ?? true;
                $publicado = $d['publicado'] ?? true;
                // El paciente nunca ve lo no publicado ni una categoría apagada por el Engineer; el personal sí, con el motivo.
                if (!$paraStaff && (!$publicado || !$categoriaActiva)) {
                    continue;
                }
                $cot = (int)($d['cotizacion_id'] ?? 0);
                if (!isset($saldos[$cot])) {
                    $saldos[$cot] = $cfg['bloquear_deuda'] || $paraStaff ? self::saldoPendiente($conn, $cot) : 0.0;
                    $atenciones[$cot] = self::atencion($conn, $cot);
                }
                $override = $overrides[$tipo . ':' . $d['ref_id']] ?? null;
                $pendiente = $d['pendiente_motivo'] ?? null;
                if ($pendiente === null && !$categoriaActiva) {
                    $pendiente = 'categoria_desactivada';
                }
                if (!$publicado) {
                    $estado = 'no_publicado';
                } elseif ($pendiente !== null) {
                    // Sin PDF listo o categoría apagada: nunca está disponible, ni liberándolo a mano.
                    $estado = 'en_revision';
                } else {
                    $estado = self::decidirEstado($cfg['modo'], $override, $saldos[$cot], $cfg['bloquear_deuda']);
                }
                $at = $atenciones[$cot];
                $doc = [
                    'tipo' => $tipo,
                    'ref_id' => (int)$d['ref_id'],
                    'categoria' => $categoria,
                    'titulo' => (string)$d['titulo'],
                    'subtitulo' => (string)($d['subtitulo'] ?? ''),
                    'examenes' => array_values($d['examenes'] ?? []),
                    'fecha' => $d['fecha'],
                    'atencion_id' => $at['id'],
                    'atencion_fecha' => $at['fecha'],
                    'atencion_numero' => $at['numero'],
                    'estado' => $estado,
                ];
                if ($paraStaff) {
                    $doc['decision_manual'] = $override ?? 'automatico';
                    $doc['saldo_pendiente'] = $saldos[$cot];
                    $doc['pendiente_motivo'] = $pendiente;
                    $doc['es_archivo'] = isset($d['publicado']);
                    $doc['publicado'] = $publicado;
                    $doc['archivo'] = (string)($d['archivo'] ?? '');
                }
                $docs[] = $doc;
            }
        }
        usort($docs, static fn($a, $b) => strcmp((string)$b['fecha'], (string)$a['fecha']));
        return $docs;
    }

    public static function buscarDocumento(\mysqli $conn, int $pacienteId, string $tipo, int $refId): ?array {
        foreach (self::documentos($conn, $pacienteId, true) as $d) {
            if ($d['tipo'] === $tipo && $d['ref_id'] === $refId) {
                return $d;
            }
        }
        return null;
    }

    // ---------------- Archivos subidos (PDF / imagen) ----------------

    private static function columnaExiste(\mysqli $conn, string $tabla, string $columna): bool {
        static $cache = [];
        $k = $tabla . '.' . $columna;
        if (!isset($cache[$k])) {
            $cache[$k] = (bool)self::consultar($conn, 'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1', 'ss', [$tabla, $columna]);
        }
        return $cache[$k];
    }

    private static function sqlMimesPublicables(): string {
        return "'" . implode("','", self::MIMES_PUBLICABLES) . "'";
    }

    /** Ruta del archivo si existe y está dentro de la carpeta de subidas esperada (evita rutas manipuladas). */
    private static function resolverRutaSubida(string $rutaGuardada, string $subcarpeta, int $pacienteId): ?string {
        $base = realpath(dirname(__DIR__) . '/uploads/' . $subcarpeta);
        if ($base === false) {
            return null;
        }
        $candidatas = [$rutaGuardada, $base . '/' . $pacienteId . '/' . basename(str_replace('\\', '/', $rutaGuardada))];
        foreach ($candidatas as $c) {
            $real = $c !== '' ? realpath($c) : false;
            if ($real !== false && is_file($real) && strncmp($real, $base . DIRECTORY_SEPARATOR, strlen($base) + 1) === 0) {
                return $real;
            }
        }
        return null;
    }

    private static function sinExtension(string $nombre): string {
        $n = pathinfo($nombre, PATHINFO_FILENAME);
        return $n !== '' ? $n : $nombre;
    }

    private static function etiquetaTipoExterno(string $tipo): string {
        $mapa = ['laboratorio' => 'Laboratorio', 'ecografia' => 'Ecografía', 'rayosx' => 'Rayos X', 'tomografia' => 'Tomografía'];
        return $mapa[strtolower($tipo)] ?? 'Documento';
    }

    /** Resultados externos (laboratorios de referencia, ecografías de otro centro...) subidos desde "Documentos del paciente". */
    private static function documentosArchivosExternos(\mysqli $conn, int $pacienteId): array {
        if (!self::columnaExiste($conn, 'documentos_externos_archivos', 'publicar_paciente')) {
            return [];
        }
        $origen = self::columnaExiste($conn, 'documentos_externos_paciente', 'laboratorio_origen') ? 'dep.laboratorio_origen' : "'' ";
        $filas = self::consultar($conn, "
            SELECT dea.id, dea.documento_id, dea.nombre_original, dea.archivo_path, dea.fecha AS archivo_fecha, dea.publicar_paciente,
                   dep.titulo, dep.tipo, dep.fecha AS doc_fecha, $origen AS laboratorio_origen,
                   COALESCE(NULLIF(dep.cotizacion_id, 0), ol.cotizacion_id) AS cotizacion_id,
                   (SELECT COUNT(*) FROM documentos_externos_archivos x WHERE x.documento_id = dep.id) AS n_archivos
            FROM documentos_externos_archivos dea
            INNER JOIN documentos_externos_paciente dep ON dep.id = dea.documento_id
            LEFT JOIN ordenes_laboratorio ol ON ol.id = dep.orden_id
            WHERE dep.paciente_id = ? AND dep.tipo IN ('laboratorio', 'ecografia', 'rayosx', 'tomografia')
              AND dea.mime_type IN (" . self::sqlMimesPublicables() . ")
            ORDER BY dep.fecha DESC, dea.id ASC", 'i', [$pacienteId]);

        $docs = [];
        foreach ($filas as $f) {
            $publicado = (int)$f['publicar_paciente'] === 1;
            // Un archivo publicado que ya no existe en disco no se ofrece al paciente.
            if ($publicado && self::resolverRutaSubida((string)$f['archivo_path'], 'documentos_externos', $pacienteId) === null) {
                continue;
            }
            $titulo = trim((string)$f['titulo']) !== '' ? trim((string)$f['titulo']) : self::sinExtension((string)$f['nombre_original']);
            if ((int)$f['n_archivos'] > 1) {
                $titulo .= ' – ' . $f['nombre_original'];
            }
            $etiqueta = self::etiquetaTipoExterno((string)$f['tipo']);
            $docs[] = [
                'ref_id' => (int)$f['id'],
                'categoria' => strtolower((string)$f['tipo']) === 'laboratorio' ? 'laboratorio' : 'imagenologia',
                'titulo' => $titulo,
                'subtitulo' => $etiqueta . (trim((string)$f['laboratorio_origen']) !== '' ? ' · ' . trim((string)$f['laboratorio_origen']) : ''),
                'fecha' => $f['doc_fecha'] ?: $f['archivo_fecha'],
                'cotizacion_id' => (int)($f['cotizacion_id'] ?? 0),
                'publicado' => $publicado,
                'archivo' => (string)$f['nombre_original'],
            ];
        }
        return $docs;
    }

    /** Archivos subidos a una orden de imagenología ("Subir archivos" en Imágenes diagnósticas). */
    private static function documentosArchivosImagen(\mysqli $conn, int $pacienteId): array {
        if (!self::columnaExiste($conn, 'ordenes_imagen_archivos', 'publicar_paciente')) {
            return [];
        }
        $tituloSql = self::columnaExiste($conn, 'ordenes_imagen_archivos', 'titulo') ? 'a.titulo' : "'' ";
        $filas = self::consultar($conn, "
            SELECT a.id, a.orden_id, a.nombre_original, a.archivo_path, a.fecha, a.publicar_paciente, $tituloSql AS titulo, o.tipo, o.cotizacion_id
            FROM ordenes_imagen_archivos a
            INNER JOIN ordenes_imagen o ON o.id = a.orden_id
            WHERE o.paciente_id = ? AND a.mime_type IN (" . self::sqlMimesPublicables() . ")
            ORDER BY a.fecha DESC, a.id ASC", 'i', [$pacienteId]);

        $porOrden = [];
        foreach ($filas as $f) {
            $porOrden[(int)$f['orden_id']] = ($porOrden[(int)$f['orden_id']] ?? 0) + 1;
        }

        $docs = [];
        foreach ($filas as $f) {
            $publicado = (int)$f['publicar_paciente'] === 1;
            if ($publicado && self::resolverRutaSubida((string)$f['archivo_path'], 'imagenes_diagnostico', $pacienteId) === null) {
                continue;
            }
            $titulo = trim((string)($f['titulo'] ?? ''));
            // Con varios archivos en la misma orden, un título común se distingue con el nombre del archivo.
            if ($titulo !== '' && $porOrden[(int)$f['orden_id']] > 1) {
                $titulo .= ' – ' . $f['nombre_original'];
            }
            $docs[] = [
                'ref_id' => (int)$f['id'],
                'categoria' => 'imagenologia',
                'titulo' => $titulo !== '' ? $titulo : self::sinExtension((string)$f['nombre_original']),
                'subtitulo' => self::etiquetaImagen((string)($f['tipo'] ?? '')),
                'fecha' => $f['fecha'],
                'cotizacion_id' => (int)($f['cotizacion_id'] ?? 0),
                'publicado' => $publicado,
                'archivo' => (string)$f['nombre_original'],
            ];
        }
        return $docs;
    }

    /**
     * Archivo listo para entregar: ruta absoluta validada, tipo de contenido y nombre de descarga.
     * La propiedad del archivo ya debe haberse comprobado con buscarDocumento().
     * @return array{ruta:string,mime:string,nombre:string}|null
     */
    public static function archivoParaEntregar(\mysqli $conn, int $pacienteId, string $tipo, int $refId): ?array {
        if ($tipo === 'archivo_externo') {
            $f = self::consultar($conn, 'SELECT archivo_path, nombre_original, mime_type FROM documentos_externos_archivos WHERE id = ? LIMIT 1', 'i', [$refId])[0] ?? null;
            $carpeta = 'documentos_externos';
        } elseif ($tipo === 'archivo_imagen') {
            $f = self::consultar($conn, 'SELECT archivo_path, nombre_original, mime_type FROM ordenes_imagen_archivos WHERE id = ? LIMIT 1', 'i', [$refId])[0] ?? null;
            $carpeta = 'imagenes_diagnostico';
        } else {
            return null;
        }
        if (!$f || !in_array((string)$f['mime_type'], self::MIMES_PUBLICABLES, true)) {
            return null;
        }
        $ruta = self::resolverRutaSubida((string)$f['archivo_path'], $carpeta, $pacienteId);
        return $ruta === null ? null : ['ruta' => $ruta, 'mime' => (string)$f['mime_type'], 'nombre' => (string)$f['nombre_original']];
    }

    /** Publica o retira del portal un archivo del paciente. Devuelve false si el archivo no es de ese paciente o no es PDF/imagen. */
    public static function publicarArchivo(\mysqli $conn, int $pacienteId, string $tipo, int $refId, bool $publicar): bool {
        if ($tipo === 'archivo_externo') {
            $sql = 'UPDATE documentos_externos_archivos dea INNER JOIN documentos_externos_paciente dep ON dep.id = dea.documento_id
                    SET dea.publicar_paciente = ? WHERE dea.id = ? AND dep.paciente_id = ? AND dea.mime_type IN (' . self::sqlMimesPublicables() . ")
                    AND dep.tipo IN ('laboratorio', 'ecografia', 'rayosx', 'tomografia')";
        } elseif ($tipo === 'archivo_imagen') {
            $sql = 'UPDATE ordenes_imagen_archivos a INNER JOIN ordenes_imagen o ON o.id = a.orden_id
                    SET a.publicar_paciente = ? WHERE a.id = ? AND o.paciente_id = ? AND a.mime_type IN (' . self::sqlMimesPublicables() . ')';
        } else {
            return false;
        }
        $v = $publicar ? 1 : 0;
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('iii', $v, $refId, $pacienteId);
        $stmt->execute();
        $ok = $stmt->errno === 0 && self::buscarDocumento($conn, $pacienteId, $tipo, $refId) !== null;
        $stmt->close();
        return $ok;
    }

    /** Resultados de laboratorio: orden completada con resultado, del paciente (directo, por cotización o por consulta). */
    private static function documentosLaboratorio(\mysqli $conn, int $pacienteId): array {
        $filas = self::consultar($conn, "
            SELECT rl.id AS resultado_id, rl.orden_id, rl.tipo_examen, rl.fecha AS resultado_fecha,
                   ol.fecha AS orden_fecha, ol.examenes, ol.cotizacion_id
            FROM resultados_laboratorio rl
            INNER JOIN ordenes_laboratorio ol ON ol.id = rl.orden_id
            LEFT JOIN cotizaciones c ON c.id = ol.cotizacion_id
            WHERE LOWER(COALESCE(ol.estado, '')) = 'completado'
              AND (ol.paciente_id = ? OR c.paciente_id = ?
                   OR EXISTS (SELECT 1 FROM consultas co WHERE co.id = ol.consulta_id AND co.paciente_id = ?))
            ORDER BY rl.fecha DESC, rl.id DESC", 'iii', [$pacienteId, $pacienteId, $pacienteId]);

        $porOrden = [];
        $catalogo = self::catalogoExamenes($conn, array_merge(...array_map(
            static fn($f) => LaboratorioExamenes::idsSinNombre($f['examenes'] ?? null),
            $filas ?: [[]]
        )));
        foreach ($filas as $f) {
            $oid = (int)$f['orden_id'];
            if (isset($porOrden[$oid])) {
                continue;
            }
            $nombres = LaboratorioExamenes::nombres($f['examenes'] ?? null, $catalogo);
            $titulo = trim((string)($f['tipo_examen'] ?? ''));
            $porOrden[$oid] = [
                'ref_id' => (int)$f['resultado_id'],
                'titulo' => LaboratorioExamenes::esTituloGenerico($titulo)
                    ? LaboratorioExamenes::tituloDesdeNombres($nombres)
                    : $titulo,
                'subtitulo' => 'Laboratorio',
                'examenes' => $nombres,
                'fecha' => $f['resultado_fecha'] ?: $f['orden_fecha'],
                'cotizacion_id' => (int)($f['cotizacion_id'] ?? 0),
            ];
        }
        return array_values($porOrden);
    }

    /** @param int[] $ids @return array<int,string> id => nombre del catálogo */
    private static function catalogoExamenes(\mysqli $conn, array $ids): array {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
        if (!$ids) {
            return [];
        }
        $out = [];
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        foreach (self::consultar($conn, "SELECT id, nombre FROM examenes_laboratorio WHERE id IN ($marcas)", str_repeat('i', count($ids)), $ids) as $e) {
            $out[(int)$e['id']] = (string)$e['nombre'];
        }
        return $out;
    }

    /**
     * Informes de imagenología en borrador o completados. Un borrador se lista con 'pendiente_motivo' = 'borrador'
     * (el paciente lo ve "en revisión"). Un informe completado sin PDF en disco se lista como cualquier otro: su PDF
     * se genera al primer pedido de descarga (ver generarPdfImagenologia).
     */
    private static function documentosImagenologia(\mysqli $conn, int $pacienteId): array {
        $filas = self::consultar($conn, "
            SELECT ii.id, ii.titulo, ii.estado, ii.pdf_path, ii.pdf_generado_at, ii.fecha_redaccion,
                   COALESCE(NULLIF(ii.cotizacion_id, 0), oi.cotizacion_id) AS cotizacion_id, oi.tipo
            FROM imagenologia_informes ii
            LEFT JOIN ordenes_imagen oi ON oi.id = ii.orden_imagen_id
            WHERE (ii.paciente_id = ? OR oi.paciente_id = ?)
              AND ii.estado IN ('borrador', 'completado')
            ORDER BY COALESCE(ii.pdf_generado_at, ii.fecha_redaccion) DESC, ii.id DESC", 'ii', [$pacienteId, $pacienteId]);

        $docs = [];
        foreach ($filas as $f) {
            $motivo = $f['estado'] === 'borrador' ? 'borrador' : null;
            $tipo = trim((string)($f['tipo'] ?? ''));
            $titulo = trim((string)($f['titulo'] ?? ''));
            $docs[] = [
                'ref_id' => (int)$f['id'],
                'titulo' => $titulo !== '' ? $titulo : 'Informe de imagenología',
                'subtitulo' => self::etiquetaImagen($tipo),
                'fecha' => $f['pdf_generado_at'] ?: $f['fecha_redaccion'],
                'cotizacion_id' => (int)($f['cotizacion_id'] ?? 0),
                'pendiente_motivo' => $motivo,
            ];
        }
        return $docs;
    }

    /** Ruta absoluta del PDF solo si es un archivo dentro de uploads/informes_imagenologia (evita rutas manipuladas). */
    public static function rutaPdfImagenologia(string $pdfPath): ?string {
        $base = realpath(dirname(__DIR__) . '/uploads/informes_imagenologia');
        $ruta = realpath(dirname(__DIR__) . '/' . ltrim(str_replace('\\', '/', $pdfPath), '/'));
        if ($base === false || $ruta === false || !is_file($ruta)) {
            return null;
        }
        if (strncmp($ruta, $base . DIRECTORY_SEPARATOR, strlen($base) + 1) !== 0 || strtolower(pathinfo($ruta, PATHINFO_EXTENSION)) !== 'pdf') {
            return null;
        }
        return $ruta;
    }

    public static function rutaPdfInforme(\mysqli $conn, int $informeId): ?string {
        $fila = self::consultar($conn, 'SELECT pdf_path, estado FROM imagenologia_informes WHERE id = ? LIMIT 1', 'i', [$informeId])[0] ?? null;
        if (!$fila) {
            return null;
        }
        $ruta = self::rutaPdfImagenologia((string)$fila['pdf_path']);
        if ($ruta !== null || $fila['estado'] !== 'completado') {
            return $ruta;
        }
        // Informe completado sin PDF (el médico no pulsó "Generar PDF"): se genera ahora con el mismo generador.
        $generado = self::generarPdfImagenologia($conn, $informeId);
        return $generado === null ? null : self::rutaPdfImagenologia($generado);
    }

    /** Ejecuta api_imagenologia_generar_pdf.php en modo interno y devuelve la ruta relativa del PDF creado (o null). */
    private static function generarPdfImagenologia(\mysqli $conn, int $informeId): ?string {
        if (!defined('IMAGENOLOGIA_PDF_INTERNO')) {
            define('IMAGENOLOGIA_PDF_INTERNO', true);
        }
        $mysqli = $conn;
        $informeIdInterno = $informeId;
        ob_start();
        try {
            $resultado = include dirname(__DIR__) . '/api_imagenologia_generar_pdf.php';
        } catch (\Throwable $e) {
            error_log('Portal: error generando PDF de imagenología ' . $informeId . ': ' . $e->getMessage());
            $resultado = null;
        } finally {
            ob_end_clean();
        }
        return is_array($resultado) && !empty($resultado['pdf_path']) ? (string)$resultado['pdf_path'] : null;
    }

    private static function etiquetaImagen(string $tipo): string {
        $mapa = ['ecografia' => 'Ecografía', 'rx' => 'Rayos X', 'tomografia' => 'Tomografía'];
        return $mapa[strtolower($tipo)] ?? 'Imagenología';
    }

    // ---------------- Auditoría ----------------

    /** La auditoría nunca debe impedir la operación: cualquier fallo al registrar se ignora. */
    public static function registrarEvento(\mysqli $conn, ?int $pacienteId, string $accion, ?string $tipo = null, ?int $refId = null, ?string $actor = null, ?string $detalle = null): void {
        try {
            $ip = mb_substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
            $stmt = $conn->prepare('INSERT INTO paciente_portal_eventos (paciente_id, accion, tipo, ref_id, actor, ip, detalle) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $actor = $actor !== null ? mb_substr($actor, 0, 80) : null;
            $detalle = $detalle !== null ? mb_substr($detalle, 0, 255) : null;
            $stmt->bind_param('ississs', $pacienteId, $accion, $tipo, $refId, $actor, $ip, $detalle);
            $stmt->execute();
            $stmt->close();
        } catch (\Throwable $e) {
            error_log('portal_pacientes: no se pudo registrar el evento ' . $accion . ': ' . $e->getMessage());
        }
    }

    // ---------------- Utilidad ----------------

    /** @return array<int,array<string,mixed>> */
    private static function consultar(\mysqli $conn, string $sql, string $tipos = '', array $params = []): array {
        $stmt = $conn->prepare($sql);
        if ($tipos !== '') {
            $stmt->bind_param($tipos, ...$params);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $filas = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        $stmt->close();
        return $filas;
    }
}
