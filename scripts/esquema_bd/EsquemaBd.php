<?php
/**
 * EsquemaBd: lógica del actualizador de esquema de BD (solo CLI).
 *
 * Compara la estructura real de una BD (information_schema) contra un esquema de
 * referencia generado desde desarrollo y crea SOLO lo que falte. Nunca elimina ni
 * modifica lo existente (única excepción: ampliar un ENUM agregando valores al final).
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo línea de comandos.');
}

final class EsquemaBd
{
    public const FORMATO = 1;

    // Tablas de respaldo/puntuales (backup, bkp, bak, zfix_*) que no forman parte del esquema.
    public const TABLAS_EXCLUIDAS_REGEX = '/(^|_)(backup|bkp|bak)(_|$)|^zfix_/i';

    // BD que --todas omite (se pueden pedir explícitamente con --empresa=slug).
    // prueba_bd: pruebas. nutrimed_bd: inactiva (la activa de Nutrimed es userperu_bd).
    public const BD_EXCLUIDAS_TODAS = ['u330560936_prueba_bd', 'u330560936_nutrimed_bd'];

    // Catálogos que deben existir en todos los clientes: 'tabla' => ['claves' => [...], 'excluir' => [...]].
    // Vacío por ahora; se declaran aquí cuando se decida qué catálogos sembrar.
    public const SEMILLAS = [];

    public const FASES = ['tablas', 'columnas', 'indices', 'fks', 'semillas'];
    public const FASES_POR_DEFECTO = ['tablas', 'columnas', 'indices', 'semillas'];

    /** @var PDO */
    private $pdo;
    /** @var bool|null */
    private $mariadb = null;
    /** @var array<string,bool>|null */
    private $collations = null;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    // ------------------------------------------------------------------
    // Configuración de empresas (adaptado a config/instances/*.php)
    // ------------------------------------------------------------------

    public static function raiz(): string
    {
        return dirname(__DIR__, 2);
    }

    public static function rutaReferencia(): string
    {
        return self::raiz() . DIRECTORY_SEPARATOR . 'db' . DIRECTORY_SEPARATOR . 'esquema_referencia' . DIRECTORY_SEPARATOR . 'esquema_referencia.json';
    }

    /** @return string[] */
    private static function carpetasConfig(): array
    {
        return [
            self::raiz() . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'instances',
            dirname(self::raiz()) . DIRECTORY_SEPARATOR . 'clinica-config',
        ];
    }

    private static function leerArchivoConfig(string $archivo): array
    {
        $data = (static function (string $f) {
            return require $f;
        })($archivo);
        return is_array($data) ? $data : [];
    }

    private static function configValida(array $c): bool
    {
        $name = (string)($c['DB_NAME'] ?? '');
        return $name !== '' && stripos($name, 'REEMPLAZAR') === false
            && (string)($c['DB_USER'] ?? '') !== '';
    }

    /**
     * BD de clientes distintas (los alias www_/sistema_/dominio que apuntan a la misma BD se agrupan).
     * @return array<string,array{slug:string,bd:string,archivo:string,alias:string[],excluida:bool}>
     */
    public static function listarEmpresas(): array
    {
        $porBd = [];
        foreach (self::carpetasConfig() as $dir) {
            $archivos = glob($dir . DIRECTORY_SEPARATOR . '*.php') ?: [];
            sort($archivos);
            foreach ($archivos as $archivo) {
                $slug = basename($archivo, '.php');
                if ($slug === 'clinic.example') {
                    continue;
                }
                $cfg = self::leerArchivoConfig($archivo);
                if (!self::configValida($cfg)) {
                    continue;
                }
                $clave = strtolower(($cfg['DB_HOST'] ?? 'localhost') . '|' . $cfg['DB_NAME']);
                if (!isset($porBd[$clave])) {
                    $porBd[$clave] = ['slug' => $slug, 'bd' => (string)$cfg['DB_NAME'], 'archivo' => $archivo, 'alias' => [$slug],
                        'excluida' => in_array($cfg['DB_NAME'], self::BD_EXCLUIDAS_TODAS, true)];
                    continue;
                }
                $porBd[$clave]['alias'][] = $slug;
                if (strpos($slug, 'sistema_') === 0 && strpos($porBd[$clave]['slug'], 'sistema_') !== 0) {
                    $porBd[$clave]['slug'] = $slug;
                    $porBd[$clave]['archivo'] = $archivo;
                }
            }
        }
        $res = [];
        foreach ($porBd as $e) {
            $res[$e['slug']] = $e;
        }
        ksort($res);
        return $res;
    }

    /** @return array{host:string,name:string,user:string,pass:string,port:int} */
    public static function cargarConfigEmpresa(string $slug): array
    {
        if ($slug === 'desarrollo') {
            $c = ['DB_HOST' => 'localhost', 'DB_NAME' => 'poli2demayo', 'DB_USER' => 'root', 'DB_PASS' => ''];
            $local = self::raiz() . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'instance.local.php';
            if (is_file($local)) {
                $l = self::leerArchivoConfig($local);
                foreach (['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'DB_PORT'] as $k) {
                    if (isset($l[$k]) && $l[$k] !== '') {
                        $c[$k] = $l[$k];
                    }
                }
            }
        } else {
            if (!preg_match('/^[A-Za-z0-9_\-]+$/', $slug)) {
                throw new RuntimeException("Nombre de empresa inválido: {$slug}");
            }
            $c = null;
            foreach (self::carpetasConfig() as $dir) {
                $f = $dir . DIRECTORY_SEPARATOR . $slug . '.php';
                if (is_file($f)) {
                    $c = self::leerArchivoConfig($f);
                    break;
                }
            }
            if ($c === null) {
                throw new RuntimeException("No existe configuración para la empresa '{$slug}'.");
            }
            if (!self::configValida($c)) {
                throw new RuntimeException("La configuración de '{$slug}' es incompleta (DB_NAME/DB_USER).");
            }
        }
        $port = (int)($c['DB_PORT'] ?? 3306);
        return [
            'host' => (string)($c['DB_HOST'] ?? 'localhost'),
            'name' => (string)$c['DB_NAME'],
            'user' => (string)$c['DB_USER'],
            'pass' => (string)($c['DB_PASS'] ?? ''),
            'port' => $port > 0 ? $port : 3306,
        ];
    }

    public static function conectar(array $cfg): PDO
    {
        $dsn = 'mysql:host=' . $cfg['host'] . ';port=' . (int)$cfg['port'] . ';dbname=' . $cfg['name'] . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('SET NAMES utf8mb4');
        return $pdo;
    }

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------

    public static function q(string $id): string
    {
        return '`' . str_replace('`', '``', $id) . '`';
    }

    public static function lit(?string $v): string
    {
        if ($v === null) {
            return 'NULL';
        }
        return "'" . str_replace(["\\", "'"], ["\\\\", "''"], $v) . "'";
    }

    public static function esTablaExcluida(string $tabla): bool
    {
        return (bool)preg_match(self::TABLAS_EXCLUIDAS_REGEX, $tabla);
    }

    public function versionMotor(): string
    {
        return (string)$this->pdo->query('SELECT VERSION()')->fetchColumn();
    }

    public function esMariaDb(): bool
    {
        if ($this->mariadb === null) {
            $this->mariadb = stripos($this->versionMotor(), 'mariadb') !== false;
        }
        return $this->mariadb;
    }

    /** @return array<string,bool> */
    private function collationsDestino(): array
    {
        if ($this->collations === null) {
            $this->collations = [];
            foreach ($this->pdo->query('SELECT COLLATION_NAME AS c FROM information_schema.COLLATIONS') as $r) {
                $this->collations[strtolower($r['c'])] = true;
            }
        }
        return $this->collations;
    }

    /** Collation equivalente que el destino conozca (p. ej. utf8mb4_0900_ai_ci en MariaDB). */
    public function collationDestino(?string $col): ?string
    {
        if ($col === null || $col === '') {
            return null;
        }
        $disp = $this->collationsDestino();
        if (isset($disp[strtolower($col)])) {
            return $col;
        }
        foreach (['utf8mb4_unicode_ci', 'utf8mb4_general_ci'] as $alt) {
            if (isset($disp[$alt]) && stripos($col, 'utf8mb4') === 0) {
                return $alt;
            }
        }
        foreach (['utf8_unicode_ci', 'utf8_general_ci'] as $alt) {
            if (isset($disp[$alt]) && stripos($col, 'utf8') === 0) {
                return $alt;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Lectura de estructura
    // ------------------------------------------------------------------

    /** @return array<string,array> estructura de tablas base de la BD actual */
    public function leerEstructura(): array
    {
        if ($this->pdo->query('SELECT DATABASE()')->fetchColumn() === null) {
            throw new RuntimeException('No hay una BD seleccionada.');
        }
        $maria = $this->esMariaDb();
        $tablas = [];

        $rs = $this->pdo->query("SELECT TABLE_NAME AS t, ENGINE AS e, TABLE_COLLATION AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
        foreach ($rs as $r) {
            $tablas[$r['t']] = ['engine' => $r['e'], 'collation' => $r['c'], 'columnas' => [], 'indices' => [], 'fks' => []];
        }

        $rs = $this->pdo->query('SELECT TABLE_NAME AS t, COLUMN_NAME AS c, ORDINAL_POSITION AS o, COLUMN_TYPE AS ty, IS_NULLABLE AS n, COLUMN_DEFAULT AS d, EXTRA AS e, COLLATION_NAME AS col, COLUMN_COMMENT AS cm, GENERATION_EXPRESSION AS g FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION');
        foreach ($rs as $r) {
            if (!isset($tablas[$r['t']])) {
                continue;
            }
            $nulo = strtoupper((string)$r['n']) === 'YES';
            $extra = (string)$r['e'];
            $generada = (string)$r['g'] !== '' && preg_match('/(VIRTUAL|STORED|PERSISTENT) GENERATED/i', $extra) === 1;
            $tablas[$r['t']]['columnas'][$r['c']] = [
                'orden' => (int)$r['o'],
                'tipo' => (string)$r['ty'],
                'nulo' => $nulo,
                'defecto' => self::normalizarDefecto($r['d'], $nulo, $extra, $maria),
                'extra' => $extra,
                'collation' => $r['col'],
                'comentario' => (string)$r['cm'],
                'generada' => $generada,
            ];
        }

        $rs = $this->pdo->query('SELECT TABLE_NAME AS t, INDEX_NAME AS i, NON_UNIQUE AS nu, SEQ_IN_INDEX AS s, COLUMN_NAME AS c, SUB_PART AS sp, INDEX_TYPE AS ty FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX');
        foreach ($rs as $r) {
            if (!isset($tablas[$r['t']])) {
                continue;
            }
            $tipo = strtoupper((string)$r['ty']);
            if ($tipo === 'RTREE') {
                $tipo = 'SPATIAL';
            } elseif ($tipo !== 'FULLTEXT' && $tipo !== 'SPATIAL') {
                $tipo = 'BTREE';
            }
            $idx =& $tablas[$r['t']]['indices'];
            if (!isset($idx[$r['i']])) {
                $idx[$r['i']] = ['unico' => (int)$r['nu'] === 0, 'tipo' => $tipo, 'expresion' => false, 'columnas' => []];
            }
            if ($r['c'] === null) {
                $idx[$r['i']]['expresion'] = true;
            } else {
                $idx[$r['i']]['columnas'][] = ['c' => $r['c'], 'sub' => $r['sp'] !== null ? (int)$r['sp'] : null];
            }
            unset($idx);
        }

        $rs = $this->pdo->query('SELECT k.TABLE_NAME AS t, k.CONSTRAINT_NAME AS n, k.COLUMN_NAME AS c, k.REFERENCED_TABLE_NAME AS rt, k.REFERENCED_COLUMN_NAME AS rc, r.DELETE_RULE AS dr, r.UPDATE_RULE AS ur FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION');
        foreach ($rs as $r) {
            if (!isset($tablas[$r['t']])) {
                continue;
            }
            $fk =& $tablas[$r['t']]['fks'];
            if (!isset($fk[$r['n']])) {
                $fk[$r['n']] = ['columnas' => [], 'ref_tabla' => $r['rt'], 'ref_columnas' => [],
                    'on_delete' => self::normRegla($r['dr']), 'on_update' => self::normRegla($r['ur'])];
            }
            $fk[$r['n']]['columnas'][] = $r['c'];
            $fk[$r['n']]['ref_columnas'][] = $r['rc'];
            unset($fk);
        }

        return $tablas;
    }

    private static function normRegla(?string $r): string
    {
        $r = strtoupper(trim((string)$r));
        return ($r === '' || $r === 'RESTRICT') ? 'NO ACTION' : $r;
    }

    /** @return array{t:string,v?:string} */
    public static function normalizarDefecto(?string $raw, bool $nulo, string $extra, bool $maria): array
    {
        if ($raw === null) {
            return ['t' => $nulo ? 'nulo' : 'ninguno'];
        }
        if ($maria) {
            if (strtoupper($raw) === 'NULL') {
                return ['t' => 'nulo'];
            }
            if (preg_match("/^'(.*)'$/s", $raw, $m)) {
                return ['t' => 'literal', 'v' => str_replace("''", "'", $m[1])];
            }
            if (is_numeric($raw)) {
                return ['t' => 'literal', 'v' => $raw];
            }
            return ['t' => 'expr', 'v' => $raw];
        }
        if (stripos($extra, 'default_generated') !== false) {
            // MySQL entrega los literales de TEXT/JSON como _utf8mb4\'x\'
            $v = preg_replace("/^_[a-z0-9]+\\\\'(.*)\\\\'$/s", "'\$1'", $raw);
            return ['t' => 'expr', 'v' => $v];
        }
        return ['t' => 'literal', 'v' => $raw];
    }

    // ------------------------------------------------------------------
    // Referencia
    // ------------------------------------------------------------------

    /** Quita tablas excluidas y las FKs que apuntan a ellas. */
    public static function filtrarExcluidas(array $tablas): array
    {
        foreach (array_keys($tablas) as $t) {
            if (self::esTablaExcluida((string)$t)) {
                unset($tablas[$t]);
            }
        }
        foreach ($tablas as $t => $def) {
            foreach (($def['fks'] ?? []) as $n => $fk) {
                if (self::esTablaExcluida((string)$fk['ref_tabla'])) {
                    unset($tablas[$t]['fks'][$n]);
                }
            }
        }
        return $tablas;
    }

    public function generarReferencia(): array
    {
        $tablas = self::filtrarExcluidas($this->leerEstructura());
        ksort($tablas);
        return [
            'formato' => self::FORMATO,
            'generado_en' => date('Y-m-d H:i'),
            'origen_motor' => $this->versionMotor(),
            'tablas' => $tablas,
            'semillas' => $this->leerSemillas($tablas),
        ];
    }

    private function leerSemillas(array $tablas): array
    {
        $res = [];
        foreach (self::SEMILLAS as $tabla => $def) {
            if (!isset($tablas[$tabla])) {
                continue;
            }
            $excluir = array_merge(['id', 'created_at', 'updated_at', 'creado_en', 'actualizado_en'], $def['excluir'] ?? []);
            $filas = [];
            foreach ($this->pdo->query('SELECT * FROM ' . self::q($tabla)) as $fila) {
                foreach ($excluir as $c) {
                    unset($fila[$c]);
                }
                $filas[] = $fila;
            }
            $res[$tabla] = $filas;
        }
        return $res;
    }

    public static function cargarReferencia(string $ruta): array
    {
        if (!is_file($ruta)) {
            throw new RuntimeException("No existe la referencia: {$ruta}. Ejecuta generar_esquema_referencia.php en desarrollo.");
        }
        $ref = json_decode((string)file_get_contents($ruta), true);
        if (!is_array($ref) || ($ref['formato'] ?? null) !== self::FORMATO || !isset($ref['tablas'])) {
            throw new RuntimeException('Referencia inválida o de otro formato.');
        }
        $ref['tablas'] = self::filtrarExcluidas($ref['tablas']);
        $ref['semillas'] = $ref['semillas'] ?? [];
        return $ref;
    }

    // ------------------------------------------------------------------
    // Normalización / comparación
    // ------------------------------------------------------------------

    public static function normTipo(string $t): string
    {
        $t = strtolower(trim($t));
        $t = preg_replace('/\b(tinyint|smallint|mediumint|int|bigint)\(\d+\)/', '$1', $t);
        return $t === 'json' ? 'longtext' : $t;
    }

    public static function normDefecto(array $d): string
    {
        $t = $d['t'] ?? 'ninguno';
        if ($t === 'expr') {
            return 'expr:' . preg_replace('/[\s`\'"()\\\\]/', '', strtolower((string)($d['v'] ?? '')));
        }
        if ($t === 'literal') {
            return 'literal:' . (string)($d['v'] ?? '');
        }
        return $t;
    }

    /** @return string[] */
    private static function valoresEnum(string $tipo): array
    {
        if (stripos($tipo, 'enum(') !== 0) {
            return [];
        }
        preg_match_all("/'((?:[^']|'')*)'/", $tipo, $m);
        return array_map(static function ($v) {
            return str_replace("''", "'", $v);
        }, $m[1]);
    }

    public static function esAmpliacionEnum(string $actual, string $ref): bool
    {
        $a = self::valoresEnum($actual);
        $r = self::valoresEnum($ref);
        return $a !== [] && count($r) > count($a) && array_slice($r, 0, count($a)) === $a;
    }

    private static function firmaIndice(string $nombre, array $i): string
    {
        $cols = array_map(static function ($c) {
            return $c['c'] . ($c['sub'] !== null ? '(' . $c['sub'] . ')' : '');
        }, $i['columnas']);
        return ($nombre === 'PRIMARY' ? 'P' : '') . ($i['unico'] ? 'U' : 'N') . '|' . $i['tipo'] . '|' . implode(',', $cols);
    }

    // ------------------------------------------------------------------
    // Generación de DDL
    // ------------------------------------------------------------------

    public static function estaEntreParentesis(string $s): bool
    {
        $s = trim($s);
        $n = strlen($s);
        if ($n < 2 || $s[0] !== '(' || $s[$n - 1] !== ')') {
            return false;
        }
        $nivel = 0;
        $comilla = null;
        for ($i = 0; $i < $n; $i++) {
            $ch = $s[$i];
            if ($comilla !== null) {
                if ($ch === '\\') {
                    $i++;
                } elseif ($ch === $comilla) {
                    $comilla = null;
                }
                continue;
            }
            if ($ch === "'" || $ch === '"') {
                $comilla = $ch;
            } elseif ($ch === '(') {
                $nivel++;
            } elseif ($ch === ')') {
                $nivel--;
                if ($nivel === 0 && $i < $n - 1) {
                    return false;
                }
            }
        }
        return $nivel === 0;
    }

    private static function sqlDefecto(array $c): string
    {
        $t = $c['defecto']['t'] ?? 'ninguno';
        $v = (string)($c['defecto']['v'] ?? '');
        if ($t === 'nulo') {
            return ' DEFAULT NULL';
        }
        if ($t === 'literal') {
            if (stripos($c['tipo'], 'bit') === 0 && preg_match("/^b'[01]+'$/i", $v)) {
                return ' DEFAULT ' . $v;
            }
            return ' DEFAULT ' . self::lit($v);
        }
        if ($t === 'expr') {
            if (preg_match('/^(current_timestamp|now|localtime|localtimestamp)(\(\s*(\d*)\s*\))?$/i', $v, $m)) {
                return ' DEFAULT CURRENT_TIMESTAMP' . (isset($m[3]) && $m[3] !== '' ? '(' . $m[3] . ')' : '');
            }
            return ' DEFAULT ' . (self::estaEntreParentesis($v) ? $v : '(' . $v . ')');
        }
        return '';
    }

    public function defColumna(string $nombre, array $c): string
    {
        $sql = self::q($nombre) . ' ' . $c['tipo'];
        $col = $this->collationDestino($c['collation'] ?? null);
        if ($col !== null) {
            $sql .= ' COLLATE ' . $col;
        }
        $sql .= !empty($c['nulo']) ? ' NULL' : ' NOT NULL';
        $sql .= self::sqlDefecto($c);
        $extra = (string)($c['extra'] ?? '');
        if (stripos($extra, 'auto_increment') !== false) {
            $sql .= ' AUTO_INCREMENT';
        }
        if (preg_match('/on update (current_timestamp(\(\d*\))?)/i', $extra, $m)) {
            $sql .= ' ON UPDATE ' . strtoupper($m[1]);
        }
        if (($c['comentario'] ?? '') !== '') {
            $sql .= ' COMMENT ' . self::lit($c['comentario']);
        }
        return $sql;
    }

    public static function defIndice(string $nombre, array $i): string
    {
        $cols = implode(', ', array_map(static function ($c) {
            return self::q($c['c']) . ($c['sub'] !== null ? '(' . $c['sub'] . ')' : '');
        }, $i['columnas']));
        if ($nombre === 'PRIMARY') {
            return "PRIMARY KEY ({$cols})";
        }
        if ($i['tipo'] === 'FULLTEXT') {
            return 'FULLTEXT KEY ' . self::q($nombre) . " ({$cols})";
        }
        if ($i['tipo'] === 'SPATIAL') {
            return 'SPATIAL KEY ' . self::q($nombre) . " ({$cols})";
        }
        return ($i['unico'] ? 'UNIQUE KEY ' : 'KEY ') . self::q($nombre) . " ({$cols})";
    }

    private static function defFk(string $nombre, array $f): string
    {
        $cols = implode(', ', array_map([self::class, 'q'], $f['columnas']));
        $ref = implode(', ', array_map([self::class, 'q'], $f['ref_columnas']));
        $sql = 'CONSTRAINT ' . self::q($nombre) . " FOREIGN KEY ({$cols}) REFERENCES " . self::q($f['ref_tabla']) . " ({$ref})";
        if (($f['on_delete'] ?? 'NO ACTION') !== 'NO ACTION') {
            $sql .= ' ON DELETE ' . $f['on_delete'];
        }
        if (($f['on_update'] ?? 'NO ACTION') !== 'NO ACTION') {
            $sql .= ' ON UPDATE ' . $f['on_update'];
        }
        return $sql;
    }

    // ------------------------------------------------------------------
    // Planificación
    // ------------------------------------------------------------------

    /**
     * @param array $ref     referencia cargada
     * @param array $destino estructura actual (leerEstructura, ya filtrada)
     * @param array $opt     fases (string[]), nombres_exactos (bool)
     * @return array<int,array{fase:string,tabla:string,objeto:string,sql:?string,estado:string,nota:string}>
     */
    public function planificar(array $ref, array $destino, array $opt = []): array
    {
        $fases = $opt['fases'] ?? self::FASES_POR_DEFECTO;
        $exactos = !empty($opt['nombres_exactos']);
        $tr = $ref['tablas'];
        $d = $destino;
        $nuevas = [];
        $colsNuevas = [];
        $acc = [];

        $add = static function (string $fase, string $tabla, string $objeto, ?string $sql, string $estado, string $nota = '') use (&$acc): void {
            $acc[] = ['fase' => $fase, 'tabla' => $tabla, 'objeto' => $objeto, 'sql' => $sql, 'estado' => $estado, 'nota' => $nota];
        };
        $ordenadas = static function (array $cols): array {
            uasort($cols, static function ($a, $b) {
                return ($a['orden'] ?? 0) <=> ($b['orden'] ?? 0);
            });
            return $cols;
        };

        // 1) tablas
        if (in_array('tablas', $fases, true)) {
            foreach ($tr as $tn => $t) {
                if (isset($d[$tn])) {
                    continue;
                }
                $lineas = [];
                $colsInc = [];
                foreach ($ordenadas($t['columnas']) as $cn => $c) {
                    if (!empty($c['generada'])) {
                        $add('tablas', $tn, "{$tn}.{$cn}", null, 'omitida', 'Columna generada: crear a mano');
                        continue;
                    }
                    $lineas[] = $this->defColumna($cn, $c);
                    $colsInc[$cn] = $c;
                }
                $idxInc = [];
                $indices = $t['indices'];
                uksort($indices, static function ($a, $b) {
                    return ($a === 'PRIMARY' ? 0 : 1) <=> ($b === 'PRIMARY' ? 0 : 1);
                });
                foreach ($indices as $in => $i) {
                    $faltan = array_filter($i['columnas'], static function ($c) use ($colsInc) {
                        return !isset($colsInc[$c['c']]);
                    });
                    if (!empty($i['expresion']) || $faltan) {
                        $add('tablas', $tn, "{$tn}.{$in}", null, 'omitida', 'Índice funcional o sobre columna omitida: crear a mano');
                        continue;
                    }
                    $lineas[] = self::defIndice($in, $i);
                    $idxInc[$in] = $i;
                }
                $coll = $this->collationDestino($t['collation'] ?? null) ?? 'utf8mb4_unicode_ci';
                $charset = substr($coll, 0, (int)strpos($coll, '_'));
                $sql = 'CREATE TABLE ' . self::q($tn) . " (\n  " . implode(",\n  ", $lineas) . "\n) ENGINE=" . ($t['engine'] ?: 'InnoDB') . " DEFAULT CHARSET={$charset} COLLATE={$coll}";
                $add('tablas', $tn, $tn, $sql, 'pendiente', 'Tabla nueva (' . count($colsInc) . ' columnas)');
                $d[$tn] = ['engine' => $t['engine'], 'collation' => $t['collation'], 'columnas' => $colsInc, 'indices' => $idxInc, 'fks' => []];
                $nuevas[$tn] = true;
            }
        }

        // 2) columnas
        if (in_array('columnas', $fases, true)) {
            foreach ($tr as $tn => $t) {
                if (!isset($d[$tn]) || isset($nuevas[$tn])) {
                    continue;
                }
                $previa = null;
                foreach ($ordenadas($t['columnas']) as $cn => $c) {
                    $dc = $d[$tn]['columnas'][$cn] ?? null;
                    if ($dc === null) {
                        if (!empty($c['generada']) || stripos((string)($c['extra'] ?? ''), 'auto_increment') !== false) {
                            $add('columnas', $tn, "{$tn}.{$cn}", null, 'omitida', 'Columna generada/AUTO_INCREMENT: crear a mano');
                            continue;
                        }
                        $sql = 'ALTER TABLE ' . self::q($tn) . ' ADD COLUMN ' . $this->defColumna($cn, $c)
                            . ($previa === null ? ' FIRST' : ' AFTER ' . self::q($previa));
                        $add('columnas', $tn, "{$tn}.{$cn}", $sql, 'pendiente', 'Columna faltante');
                        $d[$tn]['columnas'][$cn] = $c;
                        $colsNuevas[$tn][$cn] = true;
                        $previa = $cn;
                        continue;
                    }
                    $previa = $cn;
                    if (!empty($c['generada']) || !empty($dc['generada'])) {
                        continue;
                    }
                    $difs = [];
                    $difTipo = self::normTipo($c['tipo']) !== self::normTipo($dc['tipo']);
                    if ($difTipo) {
                        $difs[] = "tipo {$dc['tipo']} -> {$c['tipo']}";
                    }
                    if (!empty($c['nulo']) !== !empty($dc['nulo'])) {
                        $difs[] = 'nulabilidad ' . (!empty($dc['nulo']) ? 'NULL' : 'NOT NULL') . ' -> ' . (!empty($c['nulo']) ? 'NULL' : 'NOT NULL');
                    }
                    if (self::normDefecto($c['defecto']) !== self::normDefecto($dc['defecto'])) {
                        $difs[] = 'default ' . self::normDefecto($dc['defecto']) . ' -> ' . self::normDefecto($c['defecto']);
                    }
                    if (!$difs) {
                        continue;
                    }
                    if ($difTipo && self::esAmpliacionEnum($dc['tipo'], $c['tipo'])) {
                        $c2 = $dc;
                        $c2['tipo'] = $c['tipo'];
                        $sql = 'ALTER TABLE ' . self::q($tn) . ' MODIFY COLUMN ' . $this->defColumna($cn, $c2);
                        $add('columnas', $tn, "{$tn}.{$cn}", $sql, 'pendiente', 'Ampliación segura de ENUM');
                        $d[$tn]['columnas'][$cn]['tipo'] = $c['tipo'];
                        continue;
                    }
                    $sql = 'ALTER TABLE ' . self::q($tn) . ' MODIFY COLUMN ' . $this->defColumna($cn, $c);
                    $add('columnas', $tn, "{$tn}.{$cn}", $sql, 'info', 'Difiere (no se aplica): ' . implode('; ', $difs));
                }
            }
        }

        // 3) índices
        if (in_array('indices', $fases, true)) {
            foreach ($tr as $tn => $t) {
                if (!isset($d[$tn]) || isset($nuevas[$tn])) {
                    continue;
                }
                foreach ($t['indices'] as $in => $i) {
                    $obj = "{$tn}.{$in}";
                    if (!empty($i['expresion'])) {
                        $add('indices', $tn, $obj, null, 'omitida', 'Índice funcional: crear a mano');
                        continue;
                    }
                    $di = $d[$tn]['indices'];
                    $firma = self::firmaIndice($in, $i);
                    if (isset($di[$in])) {
                        if (self::firmaIndice($in, $di[$in]) !== $firma) {
                            $add('indices', $tn, $obj, null, 'info', 'Existe con otra definición: ' . self::firmaIndice($in, $di[$in]) . ' (ref: ' . $firma . ')');
                        }
                        continue;
                    }
                    if (!$exactos) {
                        foreach ($di as $on => $oi) {
                            if (self::firmaIndice($on, $oi) === $firma) {
                                $add('indices', $tn, $obj, null, 'info', "Cubierto por el índice equivalente '{$on}'");
                                continue 2;
                            }
                        }
                    }
                    $faltan = [];
                    foreach ($i['columnas'] as $c) {
                        if (!isset($d[$tn]['columnas'][$c['c']])) {
                            $faltan[] = $c['c'];
                        }
                    }
                    if ($faltan) {
                        $add('indices', $tn, $obj, null, 'omitida', 'Faltan columnas: ' . implode(', ', $faltan));
                        continue;
                    }
                    $conColNueva = false;
                    foreach ($i['columnas'] as $c) {
                        $conColNueva = $conColNueva || isset($colsNuevas[$tn][$c['c']]);
                    }
                    if ($i['unico'] && !$conColNueva) {
                        $dup = $this->contarDuplicados($tn, $i['columnas']);
                        if ($dup !== 0) {
                            $add('indices', $tn, $obj, null, 'omitida', $dup > 0 ? "Hay {$dup} grupos con valores duplicados: no se crea el índice único" : 'No se pudo verificar duplicados');
                            continue;
                        }
                    }
                    $add('indices', $tn, $obj, 'ALTER TABLE ' . self::q($tn) . ' ADD ' . self::defIndice($in, $i), 'pendiente', 'Índice faltante');
                    $d[$tn]['indices'][$in] = $i;
                }
            }
        }

        // 4) claves foráneas
        if (in_array('fks', $fases, true)) {
            foreach ($tr as $tn => $t) {
                if (!isset($d[$tn])) {
                    continue;
                }
                foreach ($t['fks'] as $fn => $f) {
                    $obj = "{$tn}.{$fn}";
                    $df = $d[$tn]['fks'];
                    if (isset($df[$fn])) {
                        continue;
                    }
                    if (!$exactos) {
                        foreach ($df as $on => $of) {
                            if ($of['columnas'] === $f['columnas'] && $of['ref_tabla'] === $f['ref_tabla'] && $of['ref_columnas'] === $f['ref_columnas']) {
                                $add('fks', $tn, $obj, null, 'info', "Cubierta por la FK equivalente '{$on}'");
                                continue 2;
                            }
                        }
                    }
                    foreach ($d as $otn => $ot) {
                        if ($otn !== $tn && isset($ot['fks'][$fn])) {
                            $add('fks', $tn, $obj, null, 'omitida', "El nombre de restricción ya existe en la tabla '{$otn}'");
                            continue 2;
                        }
                    }
                    if (!isset($d[$f['ref_tabla']])) {
                        $add('fks', $tn, $obj, null, 'omitida', "No existe la tabla referenciada '{$f['ref_tabla']}'");
                        continue;
                    }
                    $faltan = [];
                    foreach ($f['columnas'] as $c) {
                        if (!isset($d[$tn]['columnas'][$c])) {
                            $faltan[] = "{$tn}.{$c}";
                        }
                    }
                    foreach ($f['ref_columnas'] as $c) {
                        if (!isset($d[$f['ref_tabla']]['columnas'][$c])) {
                            $faltan[] = "{$f['ref_tabla']}.{$c}";
                        }
                    }
                    if ($faltan) {
                        $add('fks', $tn, $obj, null, 'omitida', 'Faltan columnas: ' . implode(', ', $faltan));
                        continue;
                    }
                    [$huerfanos, $consulta] = $this->contarHuerfanos($tn, $f, isset($nuevas[$tn]), isset($nuevas[$f['ref_tabla']]), $colsNuevas);
                    if ($huerfanos !== 0) {
                        $nota = $huerfanos > 0 ? "Hay {$huerfanos} registros huérfanos. Ver: {$consulta}" : 'No se pudo verificar huérfanos';
                        $add('fks', $tn, $obj, null, 'omitida', $nota);
                        continue;
                    }
                    $add('fks', $tn, $obj, 'ALTER TABLE ' . self::q($tn) . ' ADD ' . self::defFk($fn, $f), 'pendiente', 'FK faltante');
                    $d[$tn]['fks'][$fn] = $f;
                }
            }
        }

        // 5) semillas
        if (in_array('semillas', $fases, true)) {
            $this->planificarSemillas($ref, $d, $nuevas, $add);
        }

        return $acc;
    }

    private function contarDuplicados(string $tabla, array $cols): int
    {
        $sel = [];
        $no = [];
        foreach ($cols as $c) {
            $sel[] = $c['sub'] !== null ? 'LEFT(' . self::q($c['c']) . ', ' . (int)$c['sub'] . ')' : self::q($c['c']);
            $no[] = self::q($c['c']) . ' IS NOT NULL';
        }
        $sql = 'SELECT COUNT(*) FROM (SELECT 1 FROM ' . self::q($tabla) . ' WHERE ' . implode(' AND ', $no)
            . ' GROUP BY ' . implode(', ', $sel) . ' HAVING COUNT(*) > 1) x';
        try {
            return (int)$this->pdo->query($sql)->fetchColumn();
        } catch (PDOException $e) {
            return -1;
        }
    }

    /** @return array{0:int,1:string} [huérfanos (-1 si no se pudo verificar), consulta para verlos] */
    private function contarHuerfanos(string $tabla, array $f, bool $hijaNueva, bool $padreNuevo, array $colsNuevas): array
    {
        if ($hijaNueva) {
            return [0, ''];
        }
        foreach ($f['columnas'] as $c) {
            if (isset($colsNuevas[$tabla][$c])) {
                return [0, ''];
            }
        }
        $noNulos = implode(' AND ', array_map(static function ($c) {
            return 'c.' . self::q($c) . ' IS NOT NULL';
        }, $f['columnas']));
        $padreSinCrear = $padreNuevo;
        foreach ($f['ref_columnas'] as $c) {
            $padreSinCrear = $padreSinCrear || isset($colsNuevas[$f['ref_tabla']][$c]);
        }
        if ($padreSinCrear) {
            $from = 'FROM ' . self::q($tabla) . ' c WHERE ' . $noNulos;
        } else {
            $on = [];
            foreach ($f['columnas'] as $k => $c) {
                $on[] = 'p.' . self::q($f['ref_columnas'][$k]) . ' = c.' . self::q($c);
            }
            $from = 'FROM ' . self::q($tabla) . ' c LEFT JOIN ' . self::q($f['ref_tabla']) . ' p ON ' . implode(' AND ', $on)
                . ' WHERE ' . $noNulos . ' AND p.' . self::q($f['ref_columnas'][0]) . ' IS NULL';
        }
        try {
            $n = (int)$this->pdo->query('SELECT COUNT(*) ' . $from)->fetchColumn();
        } catch (PDOException $e) {
            return [-1, ''];
        }
        return [$n, 'SELECT c.* ' . $from . ' LIMIT 50'];
    }

    private function planificarSemillas(array $ref, array $d, array $nuevas, callable $add): void
    {
        foreach (self::SEMILLAS as $tn => $def) {
            $filas = $ref['semillas'][$tn] ?? [];
            if (!$filas || !isset($d[$tn])) {
                continue;
            }
            $claves = $def['claves'];
            $existentes = [];
            if (!isset($nuevas[$tn])) {
                foreach ($this->pdo->query('SELECT ' . implode(', ', array_map([self::class, 'q'], $claves)) . ' FROM ' . self::q($tn)) as $r) {
                    $existentes[] = implode("\x1f", array_map('strval', array_values($r)));
                }
            }
            if ($existentes) {
                $faltan = 0;
                foreach ($filas as $fila) {
                    $k = implode("\x1f", array_map(static function ($c) use ($fila) {
                        return (string)($fila[$c] ?? '');
                    }, $claves));
                    if (!in_array($k, $existentes, true)) {
                        $faltan++;
                    }
                }
                if ($faltan > 0) {
                    $add('semillas', $tn, $tn, null, 'info', "Tabla con registros propios: no se siembra (faltan {$faltan} de " . count($filas) . ')');
                }
                continue;
            }
            $colsDestino = $d[$tn]['columnas'];
            $colsSemilla = array_values(array_filter(array_keys($filas[0]), static function ($c) use ($colsDestino) {
                return isset($colsDestino[$c]);
            }));
            $obligatorias = [];
            foreach ($colsDestino as $cn => $c) {
                $auto = stripos((string)$c['extra'], 'auto_increment') !== false;
                if (empty($c['nulo']) && ($c['defecto']['t'] ?? 'ninguno') === 'ninguno' && !$auto && empty($c['generada']) && !in_array($cn, $colsSemilla, true)) {
                    $obligatorias[] = $cn;
                }
            }
            if ($obligatorias) {
                $add('semillas', $tn, $tn, null, 'omitida', 'El destino exige columnas que la semilla no trae: ' . implode(', ', $obligatorias));
                continue;
            }
            $valores = [];
            foreach ($filas as $fila) {
                $valores[] = '(' . implode(', ', array_map(static function ($c) use ($fila) {
                    return self::lit(isset($fila[$c]) ? (string)$fila[$c] : null);
                }, $colsSemilla)) . ')';
            }
            $sql = 'INSERT INTO ' . self::q($tn) . ' (' . implode(', ', array_map([self::class, 'q'], $colsSemilla)) . ") VALUES\n  " . implode(",\n  ", $valores);
            $add('semillas', $tn, $tn, $sql, 'pendiente', 'Sembrar ' . count($filas) . ' registros');
        }
    }

    // ------------------------------------------------------------------
    // Aplicación
    // ------------------------------------------------------------------

    /** Ejecuta las acciones pendientes; cada una es independiente. */
    public function aplicar(array $acciones): array
    {
        foreach ($acciones as &$a) {
            if ($a['estado'] !== 'pendiente' || $a['sql'] === null) {
                continue;
            }
            try {
                $this->pdo->exec($a['sql']);
                $a['estado'] = 'ok';
            } catch (PDOException $e) {
                $a['estado'] = 'error';
                $a['nota'] = trim($a['nota'] . ' | ' . $e->getMessage(), ' |');
            }
        }
        unset($a);
        return $acciones;
    }

    /** @return array<string,array<string,int>> fase => estado => cantidad */
    public static function resumen(array $acciones): array
    {
        $r = [];
        foreach ($acciones as $a) {
            $r[$a['fase']][$a['estado']] = ($r[$a['fase']][$a['estado']] ?? 0) + 1;
        }
        return $r;
    }
}
