<?php
// Límite de intentos fallidos por clave (IP, cuenta...) con archivos temporales: no requiere BD ni tablas.
// Una clave queda bloqueada al acumular $max fallos dentro de la ventana (por defecto 15 minutos).
class LimiteIntentos {
    public const VENTANA_SEG = 900;

    /** Carpeta de los archivos de conteo. Solo se cambia en pruebas. */
    public static $dirTemporal = null;

    private static function archivo(string $espacio, string $clave): string {
        $dir = self::$dirTemporal ?? sys_get_temp_dir();
        return rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . 'limite_' . hash('sha256', $espacio . '|' . $clave) . '.json';
    }

    /** @return int[] marcas de tiempo de los fallos vigentes */
    private static function fallos(string $espacio, string $clave, int $ahora, int $ventana): array {
        $f = self::archivo($espacio, $clave);
        $datos = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
        $lista = is_array($datos) ? $datos : [];
        return array_values(array_filter($lista, static function ($t) use ($ahora, $ventana) {
            return is_int($t) && $t > $ahora - $ventana;
        }));
    }

    /** @param string[] $claves bloquea si CUALQUIERA llegó al máximo */
    public static function bloqueado(string $espacio, array $claves, int $max, ?int $ahora = null, int $ventana = self::VENTANA_SEG): bool {
        $ahora = $ahora ?? time();
        foreach ($claves as $clave) {
            if (count(self::fallos($espacio, (string)$clave, $ahora, $ventana)) >= $max) {
                return true;
            }
        }
        return false;
    }

    /** @param string[] $claves */
    public static function registrarFallo(string $espacio, array $claves, ?int $ahora = null, int $ventana = self::VENTANA_SEG): void {
        $ahora = $ahora ?? time();
        foreach ($claves as $clave) {
            $lista = self::fallos($espacio, (string)$clave, $ahora, $ventana);
            $lista[] = $ahora;
            @file_put_contents(self::archivo($espacio, (string)$clave), json_encode($lista), LOCK_EX);
        }
    }

    public static function limpiar(string $espacio, string $clave): void {
        @unlink(self::archivo($espacio, $clave));
    }
}
