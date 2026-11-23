<?php
// Suscripción del sistema de ESTA instalación: aviso previo al cobro, gracia y bloqueo por falta de pago.
// Todo se configura desde el panel Engineer. Si la tabla no existe, la suscripción está desactivada o hay
// cualquier error de lectura, NO se avisa ni se bloquea (falla seguro: nunca se corta el servicio por un error).
final class LicenciaSistema {
    public const PERIODICIDADES = ['mensual' => 1, 'trimestral' => 3, 'anual' => 12];
    public const TIPOS_PAGO = ['yape', 'plin', 'transferencia', 'deposito', 'otro'];
    public const MONEDAS = ['PEN', 'USD'];
    public const ZONA = 'America/Lima';

    // Endpoints que siguen funcionando con el sistema bloqueado (acceso, estado de la suscripción y panel Engineer).
    private const LIBRES = [
        'api_engineer.php', 'api_licencia.php', 'api_login.php', 'api_login_medico.php',
        'api_login_empresa.php', 'api_logout.php', 'api_auth_status.php',
    ];

    public static function hoy(): string {
        return (new DateTimeImmutable('now', new DateTimeZone(self::ZONA)))->format('Y-m-d');
    }

    private static function dias(string $desde, string $hasta): int {
        return (int)(new DateTimeImmutable($desde))->diff(new DateTimeImmutable($hasta))->format('%r%a');
    }

    private static function sumarDias(string $fecha, int $dias): string {
        return (new DateTimeImmutable($fecha))->modify(($dias >= 0 ? '+' : '') . $dias . ' days')->format('Y-m-d');
    }

    /**
     * Estado según la fecha. Con el vencimiento el 'hoy' aún es 'aviso' (vence hoy); pasado el vencimiento es
     * 'vencida' durante los días de gracia y luego 'bloqueada'. Una prórroga extiende el último día de uso.
     * @return array{estado:string,bloquea:bool,dias_restantes:?int,fecha_vencimiento:?string,fecha_limite:?string,dias_para_limite:?int}
     */
    public static function calcularEstado(?array $fila, ?string $hoy = null): array {
        $inactiva = ['estado' => 'desactivada', 'bloquea' => false, 'dias_restantes' => null, 'fecha_vencimiento' => null, 'fecha_limite' => null, 'dias_para_limite' => null];
        if (!$fila || (int)($fila['activa'] ?? 0) !== 1) {
            return $inactiva;
        }
        $venc = (string)($fila['proximo_vencimiento'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $venc)) {
            return $inactiva;
        }
        $hoy = $hoy ?? self::hoy();
        $aviso = max(0, (int)($fila['dias_aviso'] ?? 0));
        $gracia = max(0, (int)($fila['dias_gracia'] ?? 0));
        $limite = self::sumarDias($venc, $gracia);
        $prorroga = (string)($fila['prorroga_hasta'] ?? '');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $prorroga) && $prorroga > $limite) {
            $limite = $prorroga;
        }
        $restantes = self::dias($hoy, $venc);
        if ($hoy > $limite) {
            $estado = 'bloqueada';
        } elseif ($hoy > $venc) {
            $estado = 'vencida';
        } elseif ($restantes <= $aviso) {
            $estado = 'aviso';
        } else {
            $estado = 'al_dia';
        }
        return [
            'estado' => $estado,
            'bloquea' => $estado === 'bloqueada',
            'dias_restantes' => $restantes,
            'fecha_vencimiento' => $venc,
            'fecha_limite' => $limite,
            'dias_para_limite' => self::dias($hoy, $limite),
        ];
    }

    /** Siguiente vencimiento tras un pago. El día 31 en un mes corto cae en su último día y luego vuelve al 31. */
    public static function siguienteVencimiento(string $actual, int $diaPago, string $periodicidad): string {
        $meses = self::PERIODICIDADES[$periodicidad] ?? 1;
        $d = new DateTimeImmutable($actual);
        $total = (int)$d->format('n') + $meses;
        $anio = (int)$d->format('Y') + intdiv($total - 1, 12);
        $mes = (($total - 1) % 12) + 1;
        $ultimo = (int)(new DateTimeImmutable(sprintf('%04d-%02d-01', $anio, $mes)))->format('t');
        return sprintf('%04d-%02d-%02d', $anio, $mes, min(max(1, $diaPago), $ultimo));
    }

    private static function fechaValida($v, string $campo, bool $obligatoria = false): ?string {
        $v = trim((string)($v ?? ''));
        if ($v === '') {
            if ($obligatoria) {
                throw new InvalidArgumentException("$campo es obligatoria");
            }
            return null;
        }
        $f = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
        if (!$f || $f->format('Y-m-d') !== $v) {
            throw new InvalidArgumentException("$campo debe tener formato AAAA-MM-DD");
        }
        return $v;
    }

    private static function texto($v, int $max, string $campo): ?string {
        $v = trim((string)($v ?? ''));
        if ($v === '') {
            return null;
        }
        if (mb_strlen($v) > $max) {
            throw new InvalidArgumentException("$campo admite como máximo $max caracteres");
        }
        return $v;
    }

    private static function numero($v, string $campo, float $max = 99999999.99): ?string {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_numeric($v) || (float)$v < 0 || (float)$v > $max) {
            throw new InvalidArgumentException("$campo no es un monto válido");
        }
        return number_format((float)$v, 2, '.', '');
    }

    /** @return array<string,mixed> datos limpios y listos para guardar */
    public static function validar(array $d): array {
        $activa = !empty($d['activa']) && $d['activa'] !== '0' ? 1 : 0;
        $periodicidad = (string)($d['periodicidad'] ?? 'mensual');
        if (!isset(self::PERIODICIDADES[$periodicidad])) {
            throw new InvalidArgumentException('Periodicidad no válida');
        }
        $moneda = strtoupper((string)($d['moneda'] ?? 'PEN'));
        if (!in_array($moneda, self::MONEDAS, true)) {
            throw new InvalidArgumentException('Moneda no válida');
        }
        $diaPago = (int)($d['dia_pago'] ?? 0);
        if ($diaPago < 1 || $diaPago > 31) {
            throw new InvalidArgumentException('El día de pago debe estar entre 1 y 31');
        }
        $aviso = (int)($d['dias_aviso'] ?? 10);
        $gracia = (int)($d['dias_gracia'] ?? 5);
        if ($aviso < 0 || $aviso > 90) {
            throw new InvalidArgumentException('Los días de aviso deben estar entre 0 y 90');
        }
        if ($gracia < 0 || $gracia > 60) {
            throw new InvalidArgumentException('Los días de gracia deben estar entre 0 y 60');
        }
        $venc = self::fechaValida($d['proximo_vencimiento'] ?? null, 'El próximo vencimiento', $activa === 1);
        $whatsapp = self::texto($d['contacto_whatsapp'] ?? null, 20, 'El WhatsApp');
        if ($whatsapp !== null && !preg_match('/^\+?\d{6,19}$/', $whatsapp)) {
            throw new InvalidArgumentException('El WhatsApp debe contener solo números (con + opcional)');
        }

        $metodos = [];
        foreach ((array)($d['metodos_pago'] ?? []) as $m) {
            if (!is_array($m)) {
                continue;
            }
            $tipo = strtolower(trim((string)($m['tipo'] ?? 'otro')));
            if (!in_array($tipo, self::TIPOS_PAGO, true)) {
                throw new InvalidArgumentException('Tipo de método de pago no válido');
            }
            $fila = [
                'tipo' => $tipo,
                'titular' => self::texto($m['titular'] ?? null, 80, 'El titular'),
                'numero' => self::texto($m['numero'] ?? null, 60, 'El número o cuenta'),
                'cci' => self::texto($m['cci'] ?? null, 30, 'El CCI'),
                'banco' => self::texto($m['banco'] ?? null, 60, 'El banco'),
                'nota' => self::texto($m['nota'] ?? null, 200, 'La nota'),
            ];
            if ($fila['titular'] === null && $fila['numero'] === null && $fila['cci'] === null && $fila['banco'] === null && $fila['nota'] === null) {
                continue;
            }
            $metodos[] = $fila;
        }
        if (count($metodos) > 8) {
            throw new InvalidArgumentException('Máximo 8 métodos de pago');
        }

        return [
            'activa' => $activa,
            'monto' => self::numero($d['monto'] ?? null, 'El monto'),
            'moneda' => $moneda,
            'periodicidad' => $periodicidad,
            'dia_pago' => $diaPago,
            'proximo_vencimiento' => $venc,
            'dias_aviso' => $aviso,
            'dias_gracia' => $gracia,
            'prorroga_hasta' => self::fechaValida($d['prorroga_hasta'] ?? null, 'La prórroga'),
            'mensaje' => self::texto($d['mensaje'] ?? null, 500, 'El mensaje'),
            'contacto_whatsapp' => $whatsapp,
            'metodos_pago' => json_encode($metodos, JSON_UNESCAPED_UNICODE),
        ];
    }

    // ---------------- Lectura (guardia y API pública) ----------------

    private const COLUMNAS = 'activa, monto, moneda, periodicidad, dia_pago, proximo_vencimiento, dias_aviso, dias_gracia, prorroga_hasta, mensaje, contacto_whatsapp, metodos_pago';

    /** @param PDO|mysqli|null $conn @return array<string,mixed>|null null si no hay tabla, fila o conexión. */
    public static function leerFila($conn): ?array {
        $sql = 'SELECT ' . self::COLUMNAS . ' FROM licencia_sistema ORDER BY id LIMIT 1';
        try {
            if ($conn instanceof PDO) {
                $r = $conn->query($sql);
                $f = $r ? $r->fetch(PDO::FETCH_ASSOC) : false;
                return $f ?: null;
            }
            if ($conn instanceof mysqli) {
                $r = $conn->query($sql);
                if ($r === false) {
                    return null;
                }
                $f = $r->fetch_assoc();
                return $f ?: null;
            }
        } catch (Throwable $e) {
            return null;
        }
        return null;
    }

    /** Se prueba cambiando la ruta; en producción es un archivo temporal único por instalación. */
    public static ?string $archivoCache = null;
    private const CACHE_TTL = 60;

    private static function archivoCache(): string {
        return self::$archivoCache ?? (rtrim(sys_get_temp_dir(), '/\\') . '/licencia_sistema_' . md5(__DIR__) . '.json');
    }

    /** Borra la caché para que un cambio hecho desde el panel Engineer se aplique al instante. */
    public static function invalidarCache(): void {
        @unlink(self::archivoCache());
    }

    /**
     * Fila de la suscripción con caché de 60 s: así la guardia no abre una conexión extra por petición (el hosting limita
     * las conexiones simultáneas). Un solo proceso refresca; los demás usan el valor anterior. Un error de lectura conserva
     * el valor anterior (o ninguno: falla seguro) y también se cachea para no reintentar en cada petición.
     * @param callable():?array $lector lee la fila de la BD (puede lanzar excepción)
     */
    public static function filaConCache(callable $lector, ?int $ahora = null): ?array {
        $ahora = $ahora ?? time();
        $archivo = self::archivoCache();
        $cache = null;
        $raw = @file_get_contents($archivo);
        if ($raw !== false) {
            $d = json_decode($raw, true);
            if (is_array($d) && isset($d['t']) && array_key_exists('fila', $d)) {
                $cache = $d;
            }
        }
        if ($cache !== null && ($ahora - (int)$cache['t']) < self::CACHE_TTL) {
            return is_array($cache['fila']) ? $cache['fila'] : null;
        }
        $anterior = $cache !== null && is_array($cache['fila']) ? $cache['fila'] : null;
        $lock = @fopen($archivo . '.lock', 'c');
        if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);
            return $anterior;
        }
        try {
            $fila = $lector();
        } catch (Throwable $e) {
            $fila = $anterior;
        }
        @file_put_contents($archivo, json_encode(['t' => $ahora, 'fila' => $fila]), LOCK_EX);
        if ($lock) {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
        return is_array($fila) ? $fila : null;
    }

    /** Lectura real con una conexión propia y corta (solo cuando la caché venció). */
    public static function leerFilaDeBd(): ?array {
        require_once dirname(__DIR__) . '/config/db_resolver.php';
        $c = resolve_db_runtime_config(dirname(__DIR__));
        $m = new mysqli((string)$c['DB_HOST'], (string)$c['DB_USER'], (string)$c['DB_PASS'], (string)$c['DB_NAME']);
        try {
            $fila = self::leerFila($m);
        } finally {
            $m->close();
        }
        return $fila;
    }

    /**
     * Corta con 402 toda API de la clínica si el plazo de gracia terminó. Ocultar pantallas no basta: esta es la guardia real.
     * Se llama desde init_api.php (que sí viaja en el deploy; config.php no, es propio de cada servidor).
     */
    public static function aplicarGuardiaConCache(?callable $lector = null): void {
        if (PHP_SAPI === 'cli') {
            return;
        }
        $script = basename((string)($_SERVER['SCRIPT_NAME'] ?? ''));
        if (strpos($script, 'api_') !== 0 || in_array($script, self::LIBRES, true) || strpos($script, 'api_public_') === 0) {
            return;
        }
        if ($script === 'api_tema.php' && strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'GET') {
            return;
        }
        try {
            $estado = self::calcularEstado(self::filaConCache($lector ?? [self::class, 'leerFilaDeBd']));
        } catch (Throwable $e) {
            return;
        }
        if (!$estado['bloquea']) {
            return;
        }
        http_response_code(402);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode([
            'success' => false,
            'codigo' => 'licencia_bloqueada',
            'error' => 'Servicio suspendido por falta de pago. Comuníquese con el administrador.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * Lo que puede ver cada rol. Administrador: aviso, vencida y bloqueada con datos de pago. Recepción: vencida y
     * bloqueada con datos de pago. Resto (médicos, enfermería, empresas…): solo el mensaje de bloqueo, sin datos de pago.
     * @return array<string,mixed>
     */
    public static function vistaPara(?array $fila, string $rol, ?string $hoy = null): array {
        $e = self::calcularEstado($fila, $hoy);
        $oculto = ['success' => true, 'mostrar' => false, 'estado' => 'al_dia', 'bloqueado' => false];
        if (!in_array($e['estado'], ['aviso', 'vencida', 'bloqueada'], true)) {
            return $oculto;
        }
        $conDetalle = $rol === 'administrador' || ($rol === 'recepcionista' && in_array($e['estado'], ['vencida', 'bloqueada'], true));
        $visible = $conDetalle || ($e['estado'] === 'bloqueada');
        if (!$visible) {
            return $oculto;
        }
        $v = [
            'success' => true,
            'mostrar' => true,
            'estado' => $e['estado'],
            'bloqueado' => $e['bloquea'],
            'detalle_pago' => $conDetalle,
            'dias_restantes' => $e['dias_restantes'],
            'fecha_vencimiento' => $e['fecha_vencimiento'],
            'fecha_limite' => $e['fecha_limite'],
            'dias_para_limite' => $e['dias_para_limite'],
        ];
        if ($conDetalle && $fila) {
            $m = json_decode((string)($fila['metodos_pago'] ?? '[]'), true);
            $v['monto'] = $fila['monto'] !== null ? (float)$fila['monto'] : null;
            $v['moneda'] = (string)($fila['moneda'] ?? 'PEN');
            $v['periodicidad'] = (string)($fila['periodicidad'] ?? 'mensual');
            $v['mensaje'] = $fila['mensaje'] ?? null;
            $v['contacto_whatsapp'] = $fila['contacto_whatsapp'] ?? null;
            $v['metodos_pago'] = is_array($m) ? $m : [];
        }
        return $v;
    }

    // ---------------- Administración (panel Engineer) ----------------

    /** @return array<string,mixed> */
    public static function obtenerAdmin(PDO $pdo): array {
        $fila = self::leerFila($pdo);
        $pagos = $pdo->query('SELECT fecha_pago, monto, moneda, metodo, referencia, periodo_hasta, notas, actor, created_at FROM licencia_sistema_pagos ORDER BY id DESC LIMIT 24')->fetchAll(PDO::FETCH_ASSOC);
        $config = $fila;
        if ($config) {
            $m = json_decode((string)($config['metodos_pago'] ?? '[]'), true);
            $config['metodos_pago'] = is_array($m) ? $m : [];
            $config['activa'] = (int)$config['activa'];
        }
        return ['config' => $config, 'estado' => self::calcularEstado($fila), 'pagos' => $pagos, 'hoy' => self::hoy()];
    }

    private static function historial(PDO $pdo, string $accion, $detalle, string $actor, string $ip): void {
        $pdo->prepare('INSERT INTO modulos_instalacion_historial (modulo, accion, detalle, actor, ip) VALUES (?, ?, ?, ?, ?)')
            ->execute(['suscripcion', $accion, json_encode($detalle, JSON_UNESCAPED_UNICODE), mb_substr($actor, 0, 80), mb_substr($ip, 0, 45)]);
    }

    /** Guarda la configuración (sin tocar el vencimiento por un pago). @return array<string,array> campos cambiados */
    public static function guardar(PDO $pdo, array $datos, string $actor, string $ip): array {
        $nuevo = self::validar($datos);
        $pdo->beginTransaction();
        try {
            $antes = $pdo->query('SELECT ' . self::COLUMNAS . ', id FROM licencia_sistema ORDER BY id LIMIT 1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);
            $cols = array_keys($nuevo);
            if ($antes) {
                $sets = implode(', ', array_map(static fn($c) => "$c = ?", $cols));
                $pdo->prepare("UPDATE licencia_sistema SET $sets, actualizado_por = ? WHERE id = ?")
                    ->execute([...array_values($nuevo), mb_substr($actor, 0, 80), $antes['id']]);
            } else {
                $pdo->prepare('INSERT INTO licencia_sistema (' . implode(', ', $cols) . ', actualizado_por) VALUES (' . implode(', ', array_fill(0, count($cols) + 1, '?')) . ')')
                    ->execute([...array_values($nuevo), mb_substr($actor, 0, 80)]);
            }
            $cambios = [];
            foreach ($nuevo as $campo => $valor) {
                $viejo = $antes[$campo] ?? null;
                $igual = in_array($campo, ['monto'], true) && $viejo !== null && $valor !== null
                    ? abs((float)$viejo - (float)$valor) < 0.005
                    : (string)$viejo === (string)$valor;
                if (!$igual) {
                    $cambios[$campo] = $campo === 'metodos_pago' ? 'actualizado' : ['antes' => $viejo, 'despues' => $valor];
                }
            }
            if ($cambios) {
                self::historial($pdo, 'configurar', $cambios, $actor, $ip);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return $cambios;
    }

    /** Registra el pago recibido y mueve el vencimiento al siguiente periodo. Quita cualquier prórroga vigente. */
    public static function registrarPago(PDO $pdo, array $d, string $actor, string $ip): array {
        $monto = self::numero($d['monto'] ?? null, 'El monto');
        if ($monto === null) {
            throw new InvalidArgumentException('El monto del pago es obligatorio');
        }
        $fechaPago = self::fechaValida($d['fecha_pago'] ?? null, 'La fecha de pago') ?? self::hoy();
        $metodo = self::texto($d['metodo'] ?? null, 40, 'El método');
        $referencia = self::texto($d['referencia'] ?? null, 120, 'La referencia');
        $notas = self::texto($d['notas'] ?? null, 255, 'Las notas');

        $pdo->beginTransaction();
        try {
            $fila = $pdo->query('SELECT id, moneda, periodicidad, dia_pago, proximo_vencimiento FROM licencia_sistema ORDER BY id LIMIT 1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);
            if (!$fila || empty($fila['proximo_vencimiento'])) {
                throw new InvalidArgumentException('Configure primero la suscripción (día de pago y próximo vencimiento)');
            }
            $nuevoVenc = self::siguienteVencimiento((string)$fila['proximo_vencimiento'], (int)$fila['dia_pago'], (string)$fila['periodicidad']);
            $pdo->prepare('INSERT INTO licencia_sistema_pagos (fecha_pago, monto, moneda, metodo, referencia, periodo_hasta, notas, actor, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$fechaPago, $monto, $fila['moneda'], $metodo, $referencia, $nuevoVenc, $notas, mb_substr($actor, 0, 80), mb_substr($ip, 0, 45)]);
            $pdo->prepare('UPDATE licencia_sistema SET proximo_vencimiento = ?, prorroga_hasta = NULL, actualizado_por = ? WHERE id = ?')
                ->execute([$nuevoVenc, mb_substr($actor, 0, 80), $fila['id']]);
            self::historial($pdo, 'pago', ['monto' => $monto, 'vencimiento_anterior' => $fila['proximo_vencimiento'], 'vencimiento_nuevo' => $nuevoVenc, 'metodo' => $metodo, 'referencia' => $referencia], $actor, $ip);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return ['proximo_vencimiento' => $nuevoVenc];
    }

    /** Prórroga puntual: el sistema sigue funcionando hasta esa fecha sin cambiar el calendario de cobro. null la quita. */
    public static function prorrogar(PDO $pdo, ?string $hasta, string $actor, string $ip): void {
        $hasta = self::fechaValida($hasta, 'La prórroga');
        $pdo->beginTransaction();
        try {
            $fila = $pdo->query('SELECT id, prorroga_hasta FROM licencia_sistema ORDER BY id LIMIT 1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);
            if (!$fila) {
                throw new InvalidArgumentException('Configure primero la suscripción');
            }
            $pdo->prepare('UPDATE licencia_sistema SET prorroga_hasta = ?, actualizado_por = ? WHERE id = ?')
                ->execute([$hasta, mb_substr($actor, 0, 80), $fila['id']]);
            self::historial($pdo, 'prorroga', ['antes' => $fila['prorroga_hasta'], 'despues' => $hasta], $actor, $ip);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
