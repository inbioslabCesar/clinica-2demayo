<?php
declare(strict_types=1);

/**
 * Nombres de los exámenes de una orden de laboratorio, para mostrar al paciente y al personal
 * qué incluye un resultado antes de descargarlo.
 *
 * `ordenes_laboratorio.examenes` guarda una lista JSON de objetos (con "nombre") o, en órdenes antiguas, solo de ids.
 */
final class LaboratorioExamenes {
    /** `resultados_laboratorio.tipo_examen` se guardaba siempre como "varios": no es un título real. */
    public static function esTituloGenerico($titulo): bool {
        $t = strtolower(trim((string)$titulo));
        return $t === '' || $t === 'varios';
    }

    /** @return int[] ids de los exámenes de la orden que no traen nombre propio (hay que buscarlos en el catálogo). */
    public static function idsSinNombre($json): array {
        $ids = [];
        foreach (self::lista($json) as $e) {
            if (is_array($e) && trim((string)($e['nombre'] ?? '')) !== '') {
                continue;
            }
            $id = is_array($e) ? (int)($e['id'] ?? 0) : (int)$e;
            if ($id > 0) {
                $ids[$id] = true;
            }
        }
        return array_keys($ids);
    }

    /**
     * @param array<int,string> $catalogo id => nombre, para los exámenes sin nombre propio
     * @return string[] nombres en el orden de la orden, sin repetidos
     */
    public static function nombres($json, array $catalogo = []): array {
        $salida = [];
        foreach (self::lista($json) as $e) {
            $nombre = is_array($e) ? trim((string)($e['nombre'] ?? '')) : '';
            if ($nombre === '') {
                $id = is_array($e) ? (int)($e['id'] ?? 0) : (int)$e;
                $nombre = $id > 0 ? trim((string)($catalogo[$id] ?? '')) : '';
            }
            if ($nombre !== '' && !isset($salida[mb_strtolower($nombre)])) {
                $salida[mb_strtolower($nombre)] = $nombre;
            }
        }
        return array_values($salida);
    }

    /** Un examen: su nombre. Varios: los 3 primeros y "y N más". */
    public static function tituloDesdeNombres(array $nombres, string $porDefecto = 'Resultados de laboratorio'): string {
        $n = count($nombres);
        if ($n === 0) {
            return $porDefecto;
        }
        if ($n <= 3) {
            return implode(', ', $nombres);
        }
        return implode(', ', array_slice($nombres, 0, 3)) . ' y ' . ($n - 3) . ' más';
    }

    /** @return array<int,mixed> */
    private static function lista($json): array {
        $lista = is_string($json) ? json_decode($json, true) : $json;
        return is_array($lista) ? array_values($lista) : [];
    }
}
