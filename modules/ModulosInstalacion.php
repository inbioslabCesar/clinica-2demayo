<?php
// Módulos habilitados por instalación (licencias).
// Regla de seguridad: si la tabla no existe o falla la consulta, solo 'clinico' queda activo
// (las clínicas sin actualizar se comportan exactamente como hoy y nunca se abre un módulo por error).
class ModulosInstalacion {
    public const MODULOS = ['clinico', 'ocupacional', 'portal_empresas'];
    public const GRACIA_DIAS = 7;

    private static $cache = null;

    /**
     * Estado efectivo de un módulo a partir de su fila.
     * Vencida la fecha_fin: GRACIA_DIAS días en 'gracia' (activo) y luego 'suspendido' (inactivo).
     * @return array{activo:bool,estado:string,fecha_fin:?string}
     */
    public static function estadoEfectivo(array $fila, ?string $hoy = null): array {
        $fechaFin = isset($fila['fecha_fin']) && $fila['fecha_fin'] !== '' ? (string)$fila['fecha_fin'] : null;

        if ((int)($fila['habilitado'] ?? 0) !== 1) {
            return ['activo' => false, 'estado' => 'apagado', 'fecha_fin' => $fechaFin];
        }

        $estado = (string)($fila['estado'] ?? 'activo');
        if ($estado === 'suspendido') {
            return ['activo' => false, 'estado' => 'suspendido', 'fecha_fin' => $fechaFin];
        }

        if ($fechaFin !== null) {
            $hoyTs = strtotime($hoy ?? date('Y-m-d'));
            $finTs = strtotime($fechaFin);
            if ($finTs !== false && $hoyTs !== false && $hoyTs > $finTs) {
                $diasVencido = (int)floor(($hoyTs - $finTs) / 86400);
                if ($diasVencido > self::GRACIA_DIAS) {
                    return ['activo' => false, 'estado' => 'suspendido', 'fecha_fin' => $fechaFin];
                }
                return ['activo' => true, 'estado' => 'gracia', 'fecha_fin' => $fechaFin];
            }
        }

        return ['activo' => true, 'estado' => $estado === 'gracia' ? 'gracia' : 'activo', 'fecha_fin' => $fechaFin];
    }

    /**
     * Mapa módulo => estado efectivo, para todos los módulos conocidos.
     * @param PDO|mysqli|null $conn
     */
    public static function mapa($conn, ?string $hoy = null): array {
        if (self::$cache !== null && $hoy === null) {
            return self::$cache;
        }

        $filas = self::cargarFilas($conn);
        $mapa = [];
        foreach (self::MODULOS as $modulo) {
            if ($filas !== null && isset($filas[$modulo])) {
                $mapa[$modulo] = self::estadoEfectivo($filas[$modulo], $hoy);
            } elseif ($filas === null && $modulo === 'clinico') {
                $mapa[$modulo] = ['activo' => true, 'estado' => 'activo', 'fecha_fin' => null];
            } else {
                $mapa[$modulo] = ['activo' => false, 'estado' => 'apagado', 'fecha_fin' => null];
            }
        }

        if ($hoy === null) {
            self::$cache = $mapa;
        }
        return $mapa;
    }

    /** Solo módulo => bool, sin precios ni fechas (para el frontend). */
    public static function mapaActivo($conn): array {
        $res = [];
        foreach (self::mapa($conn) as $modulo => $info) {
            $res[$modulo] = $info['activo'];
        }
        return $res;
    }

    public static function habilitado($conn, string $modulo): bool {
        $mapa = self::mapa($conn);
        return isset($mapa[$modulo]) && $mapa[$modulo]['activo'] === true;
    }

    /** Corta la petición con 403 si el módulo no está habilitado. Es la guardia real; ocultar el menú no basta. */
    public static function exigir($conn, string $modulo): void {
        if (self::habilitado($conn, $modulo)) {
            return;
        }
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'error' => 'Modulo no habilitado para esta instalacion',
            'modulo' => $modulo,
        ]);
        exit;
    }

    public static function reiniciarCache(): void {
        self::$cache = null;
    }

    // ---------------- Administración (usada por el panel Engineer) ----------------

    /** @return array<int,array> filas completas, incluye plan y precio. Solo para el panel Engineer. */
    public static function listarCompleto(PDO $pdo): array {
        $res = [];
        $stmt = $pdo->query('SELECT modulo, habilitado, estado, plan, precio, moneda, fecha_inicio, fecha_fin, notas, actualizado_por, updated_at FROM modulos_instalacion ORDER BY id');
        foreach ($stmt as $r) {
            $efectivo = self::estadoEfectivo($r);
            $r['habilitado'] = (int)$r['habilitado'];
            $r['estado_efectivo'] = $efectivo['estado'];
            $r['activo'] = $efectivo['activo'];
            $res[] = $r;
        }
        return $res;
    }

    /**
     * Valida y normaliza los datos de un módulo. Lanza InvalidArgumentException con un mensaje legible.
     * @return array<string,mixed>
     */
    public static function validarCambio(string $modulo, array $d): array {
        if (!in_array($modulo, self::MODULOS, true)) {
            throw new InvalidArgumentException('Modulo desconocido');
        }
        $habilitado = !empty($d['habilitado']) ? 1 : 0;
        if ($modulo === 'clinico' && $habilitado !== 1) {
            throw new InvalidArgumentException('El modulo clinico no se puede apagar');
        }
        $estado = (string)($d['estado'] ?? 'activo');
        if (!in_array($estado, ['activo', 'gracia', 'suspendido'], true)) {
            throw new InvalidArgumentException('Estado invalido');
        }
        $fecha = static function ($v, string $nombre) {
            $v = trim((string)($v ?? ''));
            if ($v === '') {
                return null;
            }
            $dt = DateTime::createFromFormat('Y-m-d', $v);
            if (!$dt || $dt->format('Y-m-d') !== $v) {
                throw new InvalidArgumentException("Fecha invalida: $nombre");
            }
            return $v;
        };
        $inicio = $fecha($d['fecha_inicio'] ?? null, 'fecha_inicio');
        $fin = $fecha($d['fecha_fin'] ?? null, 'fecha_fin');
        if ($inicio !== null && $fin !== null && $fin < $inicio) {
            throw new InvalidArgumentException('fecha_fin no puede ser anterior a fecha_inicio');
        }
        $precio = $d['precio'] ?? null;
        if ($precio === '' || $precio === null) {
            $precio = null;
        } elseif (!is_numeric($precio) || (float)$precio < 0 || (float)$precio > 99999999.99) {
            throw new InvalidArgumentException('Precio invalido');
        } else {
            $precio = round((float)$precio, 2);
        }
        $moneda = strtoupper(trim((string)($d['moneda'] ?? 'PEN')));
        if (!preg_match('/^[A-Z]{3}$/', $moneda)) {
            throw new InvalidArgumentException('Moneda invalida');
        }
        $texto = static function ($v, int $max, string $nombre) {
            $v = trim((string)($v ?? ''));
            if (mb_strlen($v) > $max) {
                throw new InvalidArgumentException("$nombre excede $max caracteres");
            }
            return $v === '' ? null : $v;
        };
        return [
            'habilitado' => $habilitado,
            'estado' => $estado,
            'plan' => $texto($d['plan'] ?? null, 40, 'plan'),
            'precio' => $precio,
            'moneda' => $moneda,
            'fecha_inicio' => $inicio,
            'fecha_fin' => $fin,
            'notas' => $texto($d['notas'] ?? null, 255, 'notas'),
        ];
    }

    /** Aplica el cambio y deja registro en el historial, en una sola transacción. Los campos ausentes conservan su valor. */
    public static function actualizar(PDO $pdo, string $modulo, array $datos, string $actor, string $ip): array {
        if (!in_array($modulo, self::MODULOS, true)) {
            throw new InvalidArgumentException('Modulo desconocido');
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT habilitado, estado, plan, precio, moneda, fecha_inicio, fecha_fin, notas FROM modulos_instalacion WHERE modulo = ? FOR UPDATE');
            $stmt->execute([$modulo]);
            $antes = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$antes) {
                throw new InvalidArgumentException('Modulo no inicializado: aplique sql/2026-11-22/005_modulos_instalacion_schema.sql');
            }
            $nuevo = self::validarCambio($modulo, array_merge($antes, $datos));

            $upd = $pdo->prepare('UPDATE modulos_instalacion SET habilitado = ?, estado = ?, plan = ?, precio = ?, moneda = ?, fecha_inicio = ?, fecha_fin = ?, notas = ?, actualizado_por = ? WHERE modulo = ?');
            $upd->execute([$nuevo['habilitado'], $nuevo['estado'], $nuevo['plan'], $nuevo['precio'], $nuevo['moneda'], $nuevo['fecha_inicio'], $nuevo['fecha_fin'], $nuevo['notas'], mb_substr($actor, 0, 80), $modulo]);

            $cambios = [];
            foreach ($nuevo as $campo => $valor) {
                $viejo = $antes[$campo] ?? null;
                $igual = $campo === 'precio' && $viejo !== null && $valor !== null
                    ? abs((float)$viejo - (float)$valor) < 0.005
                    : (string)$viejo === (string)$valor;
                if (!$igual) {
                    $cambios[$campo] = ['antes' => $viejo, 'despues' => $valor];
                }
            }
            if ($cambios) {
                $accion = isset($cambios['habilitado']) ? ($nuevo['habilitado'] ? 'habilitar' : 'deshabilitar') : 'actualizar';
                $h = $pdo->prepare('INSERT INTO modulos_instalacion_historial (modulo, accion, detalle, actor, ip) VALUES (?, ?, ?, ?, ?)');
                $h->execute([$modulo, $accion, json_encode($cambios, JSON_UNESCAPED_UNICODE), mb_substr($actor, 0, 80), mb_substr($ip, 0, 45)]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        self::reiniciarCache();
        return $cambios;
    }

    /** @return array<int,array> */
    public static function historial(PDO $pdo, int $limite = 50): array {
        $limite = max(1, min(200, $limite));
        $stmt = $pdo->query('SELECT modulo, accion, detalle, actor, ip, created_at FROM modulos_instalacion_historial ORDER BY id DESC LIMIT ' . $limite);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<string,array>|null null si la tabla no existe o la consulta falla. */
    private static function cargarFilas($conn): ?array {
        $sql = 'SELECT modulo, habilitado, estado, fecha_fin FROM modulos_instalacion';
        $filas = [];
        try {
            if ($conn instanceof PDO) {
                foreach ($conn->query($sql) as $r) {
                    $filas[(string)$r['modulo']] = $r;
                }
                return $filas;
            }
            if ($conn instanceof mysqli) {
                $res = $conn->query($sql);
                if ($res === false) {
                    return null;
                }
                while ($r = $res->fetch_assoc()) {
                    $filas[(string)$r['modulo']] = $r;
                }
                return $filas;
            }
        } catch (Throwable $e) {
            return null;
        }
        return null;
    }
}
