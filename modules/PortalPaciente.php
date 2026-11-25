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
    ];

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

    /** @return array{modo:string,bloquear_deuda:bool} valores por defecto si no hay filas */
    public static function config(\mysqli $conn): array {
        $cfg = ['modo' => self::MODO_AUTOMATICO, 'bloquear_deuda' => true];
        foreach (self::consultar($conn, 'SELECT clave, valor FROM paciente_portal_config') as $fila) {
            if ($fila['clave'] === 'modo_liberacion' && $fila['valor'] === self::MODO_MANUAL) {
                $cfg['modo'] = self::MODO_MANUAL;
            }
            if ($fila['clave'] === 'bloquear_deuda') {
                $cfg['bloquear_deuda'] = $fila['valor'] !== '0';
            }
        }
        return $cfg;
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
     * Saldo pendiente de toda la cadena de cotizaciones (raíz + adendas) a la que pertenece la cotización.
     * Las anuladas no cuentan. Sin cotización asociada no hay deuda que detectar (0).
     */
    public static function saldoPendiente(\mysqli $conn, ?int $cotizacionId): float {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0) {
            return 0.0;
        }
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
        $lista = array_keys($ids);
        $ph = implode(',', array_fill(0, count($lista), '?'));
        $fila = self::consultar(
            $conn,
            "SELECT COALESCE(SUM(saldo_pendiente), 0) AS saldo FROM cotizaciones WHERE id IN ($ph) AND LOWER(COALESCE(estado, '')) NOT IN ('anulada', 'anulado')",
            str_repeat('i', count($lista)),
            $lista
        )[0] ?? ['saldo' => 0];
        return round((float)$fila['saldo'], 2);
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
        $docs = [];
        foreach (self::PROVEEDORES as $tipo => $metodo) {
            foreach (self::$metodo($conn, $pacienteId) as $d) {
                $cot = (int)($d['cotizacion_id'] ?? 0);
                if (!isset($saldos[$cot])) {
                    $saldos[$cot] = $cfg['bloquear_deuda'] || $paraStaff ? self::saldoPendiente($conn, $cot) : 0.0;
                }
                $override = $overrides[$tipo . ':' . $d['ref_id']] ?? null;
                $pendiente = $d['pendiente_motivo'] ?? null;
                $doc = [
                    'tipo' => $tipo,
                    'ref_id' => (int)$d['ref_id'],
                    'titulo' => (string)$d['titulo'],
                    'subtitulo' => (string)($d['subtitulo'] ?? ''),
                    'fecha' => $d['fecha'],
                    // Sin PDF listo nunca está disponible, ni liberándolo a mano.
                    'estado' => $pendiente !== null
                        ? 'en_revision'
                        : self::decidirEstado($cfg['modo'], $override, $saldos[$cot], $cfg['bloquear_deuda']),
                ];
                if ($paraStaff) {
                    $doc['decision_manual'] = $override ?? 'automatico';
                    $doc['saldo_pendiente'] = $saldos[$cot];
                    $doc['pendiente_motivo'] = $pendiente;
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
        foreach ($filas as $f) {
            $oid = (int)$f['orden_id'];
            if (isset($porOrden[$oid])) {
                continue;
            }
            $titulo = trim((string)($f['tipo_examen'] ?? ''));
            $porOrden[$oid] = [
                'ref_id' => (int)$f['resultado_id'],
                'titulo' => $titulo !== '' ? $titulo : self::tituloDesdeExamenes($f['examenes'] ?? null, 'Resultados de laboratorio'),
                'subtitulo' => 'Laboratorio',
                'fecha' => $f['resultado_fecha'] ?: $f['orden_fecha'],
                'cotizacion_id' => (int)($f['cotizacion_id'] ?? 0),
            ];
        }
        return array_values($porOrden);
    }

    /**
     * Informes de imagenología en borrador o completados. Los que aún no tienen PDF en disco se listan con
     * 'pendiente_motivo' ('borrador' | 'sin_pdf'): el paciente los ve "en revisión" y no se pueden descargar.
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
            $tienePdf = self::rutaPdfImagenologia((string)($f['pdf_path'] ?? '')) !== null;
            $motivo = null;
            if ($f['estado'] === 'borrador') {
                $motivo = 'borrador';
            } elseif (!$tienePdf) {
                $motivo = 'sin_pdf';
            }
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
        $fila = self::consultar($conn, 'SELECT pdf_path FROM imagenologia_informes WHERE id = ? LIMIT 1', 'i', [$informeId])[0] ?? null;
        return $fila ? self::rutaPdfImagenologia((string)$fila['pdf_path']) : null;
    }

    private static function etiquetaImagen(string $tipo): string {
        $mapa = ['ecografia' => 'Ecografía', 'rx' => 'Rayos X', 'tomografia' => 'Tomografía'];
        return $mapa[strtolower($tipo)] ?? 'Imagenología';
    }

    /** Nombres de los primeros exámenes de la orden (acepta lista de objetos con 'nombre' o de textos). */
    private static function tituloDesdeExamenes($json, string $porDefecto): string {
        $lista = is_string($json) ? json_decode($json, true) : null;
        $nombres = [];
        if (is_array($lista)) {
            foreach ($lista as $e) {
                $n = is_array($e) ? trim((string)($e['nombre'] ?? '')) : '';
                if ($n !== '') {
                    $nombres[] = $n;
                }
            }
        }
        if (!$nombres) {
            return $porDefecto;
        }
        return implode(', ', array_slice($nombres, 0, 3)) . (count($nombres) > 3 ? '...' : '');
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
