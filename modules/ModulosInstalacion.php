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
