<?php

/**
 * Ranking de exámenes de laboratorio más solicitados.
 *
 * `ordenes_laboratorio.examenes` guarda hoy un JSON (lista de objetos con "id") y,
 * en datos antiguos, una lista CSV de ids. Se cuenta en PHP porque FIND_IN_SET no
 * reconoce el JSON y obligaba a escanear todas las órdenes por cada examen.
 */
class RankingExamenesLab
{
    public const LIMITE = 100;
    public const CACHE_SEGUNDOS = 300;

    /** @param iterable<mixed> $valoresCrudos contenido de la columna `examenes` de cada orden */
    public static function contarSolicitudes(iterable $valoresCrudos): array
    {
        $conteo = [];
        foreach ($valoresCrudos as $crudo) {
            foreach (self::idsDeOrden($crudo) as $id) {
                $conteo[$id] = ($conteo[$id] ?? 0) + 1;
            }
        }
        return $conteo;
    }

    /** @return int[] ids de examen distintos de una orden */
    public static function idsDeOrden($crudo): array
    {
        $texto = trim((string)$crudo);
        if ($texto === '') return [];

        $ids = [];
        if ($texto[0] === '[' || $texto[0] === '{') {
            $lista = json_decode($texto, true);
            if (is_array($lista)) {
                foreach ($lista as $item) {
                    $id = is_array($item) ? ($item['id'] ?? ($item['examen_id'] ?? 0)) : $item;
                    if (is_numeric($id) && (int)$id > 0) $ids[(int)$id] = true;
                }
            }
        } else {
            foreach (explode(',', $texto) as $parte) {
                $parte = trim($parte);
                if ($parte !== '' && ctype_digit($parte) && (int)$parte > 0) $ids[(int)$parte] = true;
            }
        }
        return array_keys($ids);
    }

    /**
     * @param array<int,array{id:mixed,nombre:mixed,categoria:mixed}> $examenesActivos
     * @param array<int,int> $conteo
     * @return array<int,array{id:int,nombre:string,categoria:?string,veces_solicitado:int}>
     */
    public static function armar(array $examenesActivos, array $conteo, int $limite = self::LIMITE): array
    {
        $filas = [];
        foreach ($examenesActivos as $ex) {
            $id = (int)($ex['id'] ?? 0);
            $filas[] = [
                'id' => $id,
                'nombre' => (string)($ex['nombre'] ?? ''),
                'categoria' => isset($ex['categoria']) ? (string)$ex['categoria'] : null,
                'veces_solicitado' => (int)($conteo[$id] ?? 0),
            ];
        }
        usort($filas, static function ($a, $b) {
            if ($a['veces_solicitado'] !== $b['veces_solicitado']) return $b['veces_solicitado'] <=> $a['veces_solicitado'];
            return strcmp($a['nombre'], $b['nombre']);
        });
        return array_slice($filas, 0, max(1, $limite));
    }

    public static function calcular(\mysqli $conn): array
    {
        $activos = [];
        $res = $conn->query("SELECT id, nombre, categoria FROM examenes_laboratorio WHERE activo = 1");
        while ($res && ($row = $res->fetch_assoc())) $activos[] = $row;

        $conteo = [];
        $ordenes = $conn->query("SELECT examenes FROM ordenes_laboratorio WHERE examenes IS NOT NULL AND examenes <> ''", MYSQLI_USE_RESULT);
        if ($ordenes) {
            while ($row = $ordenes->fetch_row()) {
                foreach (self::idsDeOrden($row[0]) as $id) $conteo[$id] = ($conteo[$id] ?? 0) + 1;
            }
            $ordenes->free();
        }
        return self::armar($activos, $conteo);
    }

    /** Usa un caché corto en disco: el ranking no necesita ser exacto al segundo. */
    public static function conCache(\mysqli $conn, ?string $archivo = null, int $ttl = self::CACHE_SEGUNDOS): array
    {
        $archivo = $archivo ?? (sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ranking_examenes_lab_' . md5(__DIR__) . '.json');
        if ($ttl > 0 && is_file($archivo) && (time() - (int)@filemtime($archivo)) < $ttl) {
            $guardado = json_decode((string)@file_get_contents($archivo), true);
            if (is_array($guardado)) return $guardado;
        }
        $ranking = self::calcular($conn);
        if ($ttl > 0) @file_put_contents($archivo, json_encode($ranking, JSON_UNESCAPED_UNICODE), LOCK_EX);
        return $ranking;
    }
}
