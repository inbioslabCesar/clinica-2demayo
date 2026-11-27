<?php

/**
 * Seguimiento clínico (módulo opcional 'seguimiento_clinico'): lectura del historial de pacientes desde el Panel del Médico.
 *
 * Reglas acordadas:
 * - El médico (o el administrador) puede buscar pacientes de TODA la clínica; no hace falta tener cita previa con ellos.
 * - Puede revisar todo lo guardado en la HC de cada consulta (se entrega completo, bajo demanda).
 * - Cada apertura de historial o de detalle queda registrada (seguimiento_clinico_accesos). Si no se puede registrar, no se entrega.
 * Solo lectura: nada de aquí crea ni modifica consultas, cotizaciones ni honorarios.
 */
final class SeguimientoClinico {
    public const BUSQUEDA_MAX = 10;
    public const POR_PAGINA_DEFECTO = 10;
    public const POR_PAGINA_MAX = 20;

    // ---------------- Reglas puras (sin BD) ----------------

    /**
     * Quién opera según la sesión: administrador, médico (login de médico o usuario con rol médico) o null.
     * @return array{rol:string,admin:bool,medico_id:int,usuario_id:int,nombre:string}|null
     */
    public static function actorDesdeSesion(array $sesion): ?array {
        $usuario = isset($sesion['usuario']) && is_array($sesion['usuario']) ? $sesion['usuario'] : [];
        $rolUsuario = strtolower(trim((string)($usuario['rol'] ?? '')));

        if (!empty($sesion['medico_id']) && $rolUsuario === '') {
            $m = isset($sesion['medico']) && is_array($sesion['medico']) ? $sesion['medico'] : [];
            $nombre = trim(trim((string)($m['nombre'] ?? '')) . ' ' . trim((string)($m['apellido'] ?? '')));
            return ['rol' => 'medico', 'admin' => false, 'medico_id' => (int)$sesion['medico_id'], 'usuario_id' => 0, 'nombre' => $nombre !== '' ? $nombre : 'Médico'];
        }
        if ($rolUsuario === 'administrador' || $rolUsuario === 'medico') {
            $nombre = trim((string)($usuario['nombre'] ?? ''));
            $medicoId = $rolUsuario === 'medico' ? (int)($usuario['medico_id'] ?? ($usuario['id'] ?? 0)) : 0;
            return [
                'rol' => $rolUsuario,
                'admin' => $rolUsuario === 'administrador',
                'medico_id' => $medicoId,
                'usuario_id' => (int)($usuario['id'] ?? 0),
                'nombre' => $nombre !== '' ? $nombre : ucfirst($rolUsuario),
            ];
        }
        return null;
    }

    /**
     * Interpreta lo que el médico escribió: solo dígitos = DNI (exacto desde 8, por prefijo antes); texto = nombre, apellido o N.º de HC.
     * @return array{tipo:string,valor:string}|null null si es muy corto para buscar
     */
    public static function normalizarBusqueda(string $q): ?array {
        $q = trim(preg_replace('/\s+/u', ' ', $q) ?? '');
        if ($q === '') return null;
        if (preg_match('/^\d+$/', $q)) {
            return strlen($q) >= 4 ? ['tipo' => 'dni', 'valor' => $q] : null;
        }
        return mb_strlen($q, 'UTF-8') >= 3 ? ['tipo' => 'texto', 'valor' => mb_substr($q, 0, 60, 'UTF-8')] : null;
    }

    /** @return array{pagina:int,por_pagina:int,offset:int} */
    public static function paginar($pagina, $porPagina): array {
        $pagina = max(1, (int)$pagina);
        $porPagina = (int)$porPagina;
        if ($porPagina <= 0) $porPagina = self::POR_PAGINA_DEFECTO;
        $porPagina = min($porPagina, self::POR_PAGINA_MAX);
        return ['pagina' => $pagina, 'por_pagina' => $porPagina, 'offset' => ($pagina - 1) * $porPagina];
    }

    public static function decodificarJson($json): ?array {
        if (!is_string($json) || trim($json) === '') return null;
        $d = json_decode($json, true);
        return is_array($d) ? $d : null;
    }

    /**
     * Diagnóstico principal para la línea de tiempo: el primero definitivo (o el primero registrado). Si la plantilla de la especialidad
     * guarda un diagnóstico en texto libre (p. ej. nutrición), se usa ese texto.
     * @return array{principal:?array{codigo:string,nombre:string,tipo:string},total:int}
     */
    public static function resumenDiagnostico(?array $datos): array {
        $lista = [];
        if (isset($datos['diagnosticos']) && is_array($datos['diagnosticos'])) {
            foreach ($datos['diagnosticos'] as $dx) {
                if (is_array($dx) && trim((string)($dx['nombre'] ?? '')) !== '') {
                    $lista[] = $dx;
                }
            }
        }
        if (count($lista) > 0) {
            $elegido = $lista[0];
            foreach ($lista as $dx) {
                if (strtolower((string)($dx['tipo'] ?? '')) === 'definitivo') { $elegido = $dx; break; }
            }
            return ['principal' => [
                'codigo' => trim((string)($elegido['codigo'] ?? '')),
                'nombre' => trim((string)$elegido['nombre']),
                'tipo' => trim((string)($elegido['tipo'] ?? '')),
            ], 'total' => count($lista)];
        }
        $texto = isset($datos['diagnostico']) && is_string($datos['diagnostico']) ? trim($datos['diagnostico']) : '';
        if ($texto !== '') {
            return ['principal' => ['codigo' => '', 'nombre' => mb_substr($texto, 0, 160, 'UTF-8'), 'tipo' => ''], 'total' => 1];
        }
        return ['principal' => null, 'total' => 0];
    }

    public static function contarReceta(?array $datos): int {
        if (!isset($datos['receta']) || !is_array($datos['receta'])) return 0;
        return count(array_filter($datos['receta'], static fn($m) => is_array($m) && trim((string)($m['nombre'] ?? '')) !== ''));
    }

    /**
     * Resultados de laboratorio legibles. El resultado guarda claves "{idExamen}__{parámetro}" (más claves de formato que se ignoran);
     * el nombre, la unidad y la referencia salen del examen pedido.
     * @param array<int,array> $examenes examen del pedido (con valores_referenciales)
     * @param array<string,mixed> $resultados
     * @return array<int,array{examen:string,parametros:array<int,array{nombre:string,valor:string,unidad:string,referencia:string}>}>
     */
    public static function resultadosLaboratorio(array $examenes, array $resultados): array {
        $salida = [];
        foreach ($examenes as $examen) {
            if (!is_array($examen)) continue;
            $id = (string)($examen['id'] ?? '');
            $parametros = [];
            foreach ((array)($examen['valores_referenciales'] ?? []) as $vr) {
                if (!is_array($vr)) continue;
                $nombre = (string)($vr['nombre'] ?? '');
                $codigo = (string)($vr['codigo_interno'] ?? '');
                if (trim($nombre) === '' || (string)($vr['tipo'] ?? 'Parámetro') !== 'Parámetro') continue;
                $valor = $resultados[$id . '__' . $nombre] ?? ($codigo !== '' ? ($resultados[$id . '__' . $codigo] ?? null) : null);
                if ($valor === null || (is_string($valor) && trim($valor) === '')) continue;
                $ref = '';
                foreach ((array)($vr['referencias'] ?? []) as $r) {
                    if (is_array($r) && trim((string)($r['valor'] ?? '')) !== '') { $ref = trim((string)$r['valor']); break; }
                }
                $parametros[] = [
                    'nombre' => trim($nombre),
                    'valor' => is_scalar($valor) ? trim((string)$valor) : json_encode($valor, JSON_UNESCAPED_UNICODE),
                    'unidad' => trim((string)($vr['unidad'] ?? '')),
                    'referencia' => $ref,
                ];
            }
            $salida[] = ['examen' => trim((string)($examen['nombre'] ?? 'Examen')), 'parametros' => $parametros];
        }
        return $salida;
    }

    // ---------------- Registro de accesos ----------------

    public static function asegurarTablaAccesos(\mysqli $conn): bool {
        return (bool)$conn->query("CREATE TABLE IF NOT EXISTS seguimiento_clinico_accesos (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            rol VARCHAR(20) NOT NULL,
            medico_id INT NULL,
            usuario_id INT NULL,
            actor_nombre VARCHAR(150) NULL,
            paciente_id INT NOT NULL,
            consulta_id INT NULL,
            accion VARCHAR(30) NOT NULL,
            ip VARCHAR(45) NULL,
            PRIMARY KEY (id),
            KEY idx_sca_paciente (paciente_id, fecha_hora),
            KEY idx_sca_medico (medico_id, fecha_hora),
            KEY idx_sca_fecha (fecha_hora)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }

    /** Devuelve false si no pudo registrarse: en ese caso quien llama NO debe entregar el historial. */
    public static function registrarAcceso(\mysqli $conn, array $actor, int $pacienteId, ?int $consultaId, string $accion, string $ip): bool {
        if (!self::asegurarTablaAccesos($conn)) return false;
        $stmt = $conn->prepare('INSERT INTO seguimiento_clinico_accesos (rol, medico_id, usuario_id, actor_nombre, paciente_id, consulta_id, accion, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        if (!$stmt) return false;
        $medicoId = $actor['medico_id'] > 0 ? (int)$actor['medico_id'] : null;
        $usuarioId = $actor['usuario_id'] > 0 ? (int)$actor['usuario_id'] : null;
        $nombre = mb_substr((string)$actor['nombre'], 0, 150, 'UTF-8');
        $ip = mb_substr($ip, 0, 45);
        $stmt->bind_param('siisiiss', $actor['rol'], $medicoId, $usuarioId, $nombre, $pacienteId, $consultaId, $accion, $ip);
        $ok = $stmt->execute();
        $stmt->close();
        return $ok;
    }

    // ---------------- Consultas ----------------

    /** @return array<int,array<string,mixed>> */
    public static function buscarPacientes(\mysqli $conn, string $q): array {
        $b = self::normalizarBusqueda($q);
        if ($b === null) return [];
        $limite = self::BUSQUEDA_MAX;
        $cols = 'id, nombre, apellido, dni, historia_clinica, sexo, fecha_nacimiento, edad, edad_unidad';

        if ($b['tipo'] === 'dni') {
            $like = $b['valor'] . '%';
            $stmt = $conn->prepare("SELECT $cols FROM pacientes WHERE dni = ? OR dni LIKE ? ORDER BY (dni = ?) DESC, apellido, nombre LIMIT $limite");
            $stmt->bind_param('sss', $b['valor'], $like, $b['valor']);
        } else {
            $esc = addcslashes($b['valor'], '%_\\');
            $contiene = '%' . $esc . '%';
            $prefijo = $esc . '%';
            $stmt = $conn->prepare("SELECT $cols FROM pacientes
                WHERE CONCAT_WS(' ', nombre, apellido) LIKE ? OR CONCAT_WS(' ', apellido, nombre) LIKE ? OR historia_clinica LIKE ? OR dni LIKE ?
                ORDER BY apellido, nombre LIMIT $limite");
            $stmt->bind_param('ssss', $contiene, $contiene, $prefijo, $prefijo);
        }
        $stmt->execute();
        $filas = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return array_map([self::class, 'formatearPaciente'], $filas);
    }

    public static function obtenerPaciente(\mysqli $conn, int $pacienteId): ?array {
        $stmt = $conn->prepare('SELECT id, nombre, apellido, dni, historia_clinica, sexo, fecha_nacimiento, edad, edad_unidad FROM pacientes WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $pacienteId);
        $stmt->execute();
        $fila = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $fila ? self::formatearPaciente($fila) : null;
    }

    private static function formatearPaciente(array $p): array {
        return [
            'id' => (int)$p['id'],
            'nombre' => trim(trim((string)($p['nombre'] ?? '')) . ' ' . trim((string)($p['apellido'] ?? ''))),
            'dni' => (string)($p['dni'] ?? ''),
            'historia_clinica' => (string)($p['historia_clinica'] ?? ''),
            'sexo' => (string)($p['sexo'] ?? ''),
            'fecha_nacimiento' => $p['fecha_nacimiento'] ?? null,
            'edad' => trim((string)($p['edad'] ?? '')) !== '' ? trim((string)$p['edad'] . ' ' . (string)($p['edad_unidad'] ?? '')) : '',
        ];
    }

    /**
     * Línea de tiempo ligera, de la más reciente a la más antigua: sin el contenido de la HC (solo resumen y contadores).
     * No incluye consultas canceladas. @return array{total:int,pagina:int,por_pagina:int,items:array<int,array>}
     */
    public static function historial(\mysqli $conn, int $pacienteId, $pagina, $porPagina, int $medicoActorId): array {
        $pg = self::paginar($pagina, $porPagina);

        $stmt = $conn->prepare("SELECT COUNT(*) AS n FROM consultas WHERE paciente_id = ? AND estado <> 'cancelada'");
        $stmt->bind_param('i', $pacienteId);
        $stmt->execute();
        $total = (int)($stmt->get_result()->fetch_assoc()['n'] ?? 0);
        $stmt->close();

        $stmt = $conn->prepare("SELECT c.id, c.fecha, c.hora, c.estado, c.tipo_consulta, c.es_control, c.medico_id,
                m.nombre AS medico_nombre, m.apellido AS medico_apellido, m.especialidad AS medico_especialidad,
                h.id AS hc_id, h.datos AS hc_datos,
                (SELECT COUNT(*) FROM ordenes_laboratorio ol WHERE ol.consulta_id = c.id) AS n_lab,
                (SELECT COUNT(*) FROM ordenes_imagen oi WHERE oi.consulta_id = c.id) AS n_img
            FROM consultas c
            LEFT JOIN medicos m ON m.id = c.medico_id
            LEFT JOIN historia_clinica h ON h.id = (SELECT MAX(hx.id) FROM historia_clinica hx WHERE hx.consulta_id = c.id)
            WHERE c.paciente_id = ? AND c.estado <> 'cancelada'
            ORDER BY c.fecha DESC, c.hora DESC, c.id DESC
            LIMIT ? OFFSET ?");
        $stmt->bind_param('iii', $pacienteId, $pg['por_pagina'], $pg['offset']);
        $stmt->execute();
        $filas = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $items = [];
        foreach ($filas as $f) {
            $datos = self::decodificarJson($f['hc_datos'] ?? null);
            $dx = self::resumenDiagnostico($datos);
            $items[] = [
                'consulta_id' => (int)$f['id'],
                'fecha' => $f['fecha'],
                'hora' => $f['hora'],
                'estado' => (string)$f['estado'],
                'tipo_consulta' => (string)$f['tipo_consulta'],
                'es_control' => (int)$f['es_control'] === 1,
                'medico' => [
                    'id' => (int)$f['medico_id'],
                    'nombre' => trim(trim((string)$f['medico_nombre']) . ' ' . trim((string)$f['medico_apellido'])),
                    'especialidad' => (string)($f['medico_especialidad'] ?? ''),
                ],
                'es_mia' => $medicoActorId > 0 && (int)$f['medico_id'] === $medicoActorId,
                'tiene_hc' => $f['hc_id'] !== null,
                'diagnostico_principal' => $dx['principal'],
                'total_diagnosticos' => $dx['total'],
                'recetas' => self::contarReceta($datos),
                'laboratorio' => (int)$f['n_lab'],
                'imagenologia' => (int)$f['n_img'],
            ];
        }
        return ['total' => $total, 'pagina' => $pg['pagina'], 'por_pagina' => $pg['por_pagina'], 'items' => $items];
    }

    /** ID del paciente de una consulta (para registrar el acceso antes de leer el detalle). */
    public static function pacienteDeConsulta(\mysqli $conn, int $consultaId): int {
        $stmt = $conn->prepare('SELECT paciente_id FROM consultas WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $fila = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return (int)($fila['paciente_id'] ?? 0);
    }

    /**
     * Todo lo guardado de una consulta: HC completa, triaje, laboratorio con resultados e imagenología con informe.
     * @return array<string,mixed>|null
     */
    public static function detalleConsulta(\mysqli $conn, int $consultaId): ?array {
        $stmt = $conn->prepare("SELECT c.id, c.paciente_id, c.fecha, c.hora, c.estado, c.tipo_consulta, c.es_control, c.medico_id,
                m.nombre AS medico_nombre, m.apellido AS medico_apellido, m.especialidad AS medico_especialidad
            FROM consultas c LEFT JOIN medicos m ON m.id = c.medico_id WHERE c.id = ? LIMIT 1");
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $c = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$c) return null;

        $stmt = $conn->prepare('SELECT id, datos, fecha_registro FROM historia_clinica WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $hc = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $stmt = $conn->prepare('SELECT datos, fecha_registro, creado_por_nombre FROM triaje WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
        $triaje = null;
        if ($stmt) {
            $stmt->bind_param('i', $consultaId);
            $stmt->execute();
            $t = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($t) {
                $triaje = ['datos' => self::decodificarJson($t['datos']) ?? [], 'fecha_registro' => $t['fecha_registro'], 'registrado_por' => (string)($t['creado_por_nombre'] ?? '')];
            }
        }

        return [
            'consulta' => [
                'id' => (int)$c['id'],
                'paciente_id' => (int)$c['paciente_id'],
                'fecha' => $c['fecha'],
                'hora' => $c['hora'],
                'estado' => (string)$c['estado'],
                'tipo_consulta' => (string)$c['tipo_consulta'],
                'es_control' => (int)$c['es_control'] === 1,
                'medico' => [
                    'id' => (int)$c['medico_id'],
                    'nombre' => trim(trim((string)$c['medico_nombre']) . ' ' . trim((string)$c['medico_apellido'])),
                    'especialidad' => (string)($c['medico_especialidad'] ?? ''),
                ],
            ],
            'historia_clinica' => $hc ? [
                'id' => (int)$hc['id'],
                'fecha_registro' => $hc['fecha_registro'],
                'datos' => self::decodificarJson($hc['datos']) ?? [],
            ] : null,
            'triaje' => $triaje,
            'laboratorio' => self::laboratorioDeConsulta($conn, $consultaId),
            'imagenologia' => self::imagenologiaDeConsulta($conn, $consultaId),
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private static function laboratorioDeConsulta(\mysqli $conn, int $consultaId): array {
        $stmt = $conn->prepare('SELECT id, examenes, fecha, estado FROM ordenes_laboratorio WHERE consulta_id = ? ORDER BY id');
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $ordenes = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $salida = [];
        foreach ($ordenes as $o) {
            $examenes = self::decodificarJson($o['examenes']) ?? [];
            $stmtR = $conn->prepare('SELECT resultados FROM resultados_laboratorio WHERE orden_id = ? ORDER BY id');
            $ordenId = (int)$o['id'];
            $stmtR->bind_param('i', $ordenId);
            $stmtR->execute();
            $filasR = $stmtR->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtR->close();
            $resultados = [];
            foreach ($filasR as $r) {
                $resultados = array_merge($resultados, self::decodificarJson($r['resultados']) ?? []);
            }
            $salida[] = [
                'orden_id' => $ordenId,
                'fecha' => $o['fecha'],
                'estado' => (string)$o['estado'],
                'examenes' => array_values(array_filter(array_map(static fn($e) => is_array($e) ? trim((string)($e['nombre'] ?? '')) : '', $examenes))),
                'resultados' => self::resultadosLaboratorio($examenes, $resultados),
            ];
        }
        return $salida;
    }

    /** @return array<int,array<string,mixed>> */
    private static function imagenologiaDeConsulta(\mysqli $conn, int $consultaId): array {
        $stmt = $conn->prepare('SELECT id, tipo, indicaciones, estado, fecha FROM ordenes_imagen WHERE consulta_id = ? ORDER BY id');
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $ordenes = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $salida = [];
        foreach ($ordenes as $o) {
            $ordenId = (int)$o['id'];
            $stmtI = $conn->prepare("SELECT titulo, estado, contenido_json, fecha_redaccion FROM imagenologia_informes WHERE orden_imagen_id = ? AND estado <> 'archivado' ORDER BY id DESC LIMIT 1");
            $stmtI->bind_param('i', $ordenId);
            $stmtI->execute();
            $inf = $stmtI->get_result()->fetch_assoc();
            $stmtI->close();

            $stmtA = $conn->prepare('SELECT COUNT(*) AS n FROM ordenes_imagen_archivos WHERE orden_id = ?');
            $nArchivos = 0;
            if ($stmtA) {
                $stmtA->bind_param('i', $ordenId);
                $stmtA->execute();
                $nArchivos = (int)($stmtA->get_result()->fetch_assoc()['n'] ?? 0);
                $stmtA->close();
            }
            $salida[] = [
                'orden_id' => $ordenId,
                'tipo' => (string)$o['tipo'],
                'indicaciones' => (string)($o['indicaciones'] ?? ''),
                'estado' => (string)$o['estado'],
                'fecha' => $o['fecha'],
                'archivos' => $nArchivos,
                'informe' => $inf ? [
                    'titulo' => (string)$inf['titulo'],
                    'estado' => (string)$inf['estado'],
                    'fecha_redaccion' => $inf['fecha_redaccion'],
                    'contenido' => self::decodificarJson($inf['contenido_json']) ?? [],
                ] : null,
            ];
        }
        return $salida;
    }
}
