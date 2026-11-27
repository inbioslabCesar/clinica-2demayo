<?php

require_once __DIR__ . '/ConsultasAgendaCore.php';

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

    // ---------------- Generar consulta de seguimiento (con cobro / sin cobro) ----------------

    public const MODOS = ['con_cobro', 'sin_cobro'];
    public const MOTIVO_MIN = 10;
    public const MOTIVO_MAX = 255;
    public const ORIGEN_CONSULTA = 'seguimiento_clinico';

    /**
     * Valida la solicitud de generar una consulta (sin tocar la BD). Siempre programada, dentro de la disponibilidad del médico.
     * @param array<string,mixed> $in
     * @return array{ok:bool,error?:string,datos?:array<string,mixed>}
     */
    public static function validarSolicitud(array $in, ?\DateTimeImmutable $ahora = null): array {
        $ahora = $ahora ?? new \DateTimeImmutable('now', new \DateTimeZone('America/Lima'));
        $pacienteId = (int)($in['paciente_id'] ?? 0);
        if ($pacienteId <= 0) return ['ok' => false, 'error' => 'Selecciona un paciente'];

        $fecha = trim((string)($in['fecha'] ?? ''));
        $f = \DateTimeImmutable::createFromFormat('!Y-m-d', $fecha, new \DateTimeZone('America/Lima'));
        if (!$f || $f->format('Y-m-d') !== $fecha) return ['ok' => false, 'error' => 'La fecha no es válida'];
        if ($fecha < $ahora->format('Y-m-d')) return ['ok' => false, 'error' => 'La fecha ya pasó'];

        $hora = trim((string)($in['hora'] ?? ''));
        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/', $hora, $m)) return ['ok' => false, 'error' => 'La hora no es válida'];
        $hora = $m[1] . ':' . $m[2] . ':' . ($m[3] ?? '00');
        if ($fecha === $ahora->format('Y-m-d') && $hora < $ahora->format('H:i:s')) return ['ok' => false, 'error' => 'La hora ya pasó'];

        $modo = trim((string)($in['modo'] ?? ''));
        if (!in_array($modo, self::MODOS, true)) return ['ok' => false, 'error' => 'Elige si la consulta es con cobro o sin cobro'];

        $motivo = null;
        if ($modo === 'sin_cobro') {
            $motivo = trim(preg_replace('/\s+/u', ' ', (string)($in['motivo'] ?? '')) ?? '');
            $largo = mb_strlen($motivo, 'UTF-8');
            if ($largo < self::MOTIVO_MIN) return ['ok' => false, 'error' => 'Indica el motivo de la exoneración (mínimo ' . self::MOTIVO_MIN . ' caracteres)'];
            if ($largo > self::MOTIVO_MAX) return ['ok' => false, 'error' => 'El motivo es demasiado largo (máximo ' . self::MOTIVO_MAX . ' caracteres)'];
        }

        $solicitud = trim((string)($in['client_request_id'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9_.:\-]{8,64}$/', $solicitud)) return ['ok' => false, 'error' => 'Falta el identificador de la solicitud'];

        return ['ok' => true, 'datos' => ['paciente_id' => $pacienteId, 'fecha' => $fecha, 'hora' => $hora, 'modo' => $modo, 'motivo' => $motivo, 'client_request_id' => $solicitud]];
    }

    public static function asegurarTablaConsultas(\mysqli $conn): bool {
        return (bool)$conn->query("CREATE TABLE IF NOT EXISTS seguimiento_clinico_consultas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            consulta_id INT NOT NULL,
            cotizacion_id INT NOT NULL,
            paciente_id INT NOT NULL,
            medico_id INT NOT NULL,
            modo VARCHAR(12) NOT NULL,
            motivo VARCHAR(255) NULL,
            client_request_id VARCHAR(64) NOT NULL,
            creado_por_nombre VARCHAR(150) NULL,
            ip VARCHAR(45) NULL,
            fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_scc_consulta (consulta_id),
            UNIQUE KEY uq_scc_solicitud (medico_id, client_request_id),
            KEY idx_scc_cotizacion (cotizacion_id),
            KEY idx_scc_paciente (paciente_id, fecha_hora),
            KEY idx_scc_modo (modo, fecha_hora)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }

    /** ¿Esta cotización es una exoneración generada desde Seguimiento? Mantiene su estado 'exonerada' en los recálculos financieros. */
    public static function cotizacionEsExonerada(\mysqli $conn, int $cotizacionId): bool {
        static $tablaExiste = null;
        if ($cotizacionId <= 0) return false;
        if ($tablaExiste === null) {
            $tablaExiste = consultas_table_exists($conn, 'seguimiento_clinico_consultas');
        }
        if (!$tablaExiste) return false;
        $stmt = $conn->prepare("SELECT 1 FROM seguimiento_clinico_consultas WHERE cotizacion_id = ? AND modo = 'sin_cobro' LIMIT 1");
        if (!$stmt) return false;
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $existe = (bool)$stmt->get_result()->fetch_row();
        $stmt->close();
        return $existe;
    }

    /**
     * Ids (entre los dados) de cotizaciones exoneradas desde Seguimiento clínico.
     * @param array<int,mixed> $ids
     * @return array<int,true>
     */
    public static function cotizacionesExoneradas(\mysqli $conn, array $ids): array {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
        if ($ids === [] || !consultas_table_exists($conn, 'seguimiento_clinico_consultas')) return [];
        $res = $conn->query("SELECT cotizacion_id FROM seguimiento_clinico_consultas WHERE modo = 'sin_cobro' AND cotizacion_id IN (" . implode(',', $ids) . ')');
        $mapa = [];
        while ($res && ($fila = $res->fetch_assoc())) {
            $mapa[(int)$fila['cotizacion_id']] = true;
        }
        return $mapa;
    }

    /**
     * Etiqueta como 'exonerada' el estado de las filas cuya cotización fue exonerada desde Seguimiento. La BD guarda esas cotizaciones
     * como 'pagado' (los triggers de saldo fuerzan 'pagado' cuando el saldo es 0, igual que con los controles), así que se deriva al leer.
     * @param array<int,array<string,mixed>> $filas
     */
    public static function marcarFilasExoneradas(\mysqli $conn, array &$filas, string $campoId = 'cotizacion_id', string $campoEstado = 'cotizacion_estado'): void {
        $mapa = self::cotizacionesExoneradas($conn, array_column($filas, $campoId));
        if ($mapa === []) return;
        foreach ($filas as &$fila) {
            if (isset($mapa[(int)($fila[$campoId] ?? 0)])) {
                $fila[$campoEstado] = 'exonerada';
            }
        }
        unset($fila);
    }

    /** Tarifa vigente de consulta del médico (o la general si no tiene propia), la misma regla que la próxima cita de la HC. */
    public static function tarifaConsulta(\mysqli $conn, int $medicoId): ?array {
        $consultas = [
            ['SELECT id, precio_particular, descripcion FROM tarifas WHERE medico_id = ? AND servicio_tipo = "consulta" AND activo = 1 ORDER BY id DESC LIMIT 1', true],
            ['SELECT id, precio_particular, descripcion FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND (medico_id IS NULL OR medico_id = 0) ORDER BY id DESC LIMIT 1', false],
        ];
        foreach ($consultas as [$sql, $porMedico]) {
            $stmt = $conn->prepare($sql);
            if (!$stmt) continue;
            if ($porMedico) $stmt->bind_param('i', $medicoId);
            $stmt->execute();
            $fila = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($fila && isset($fila['precio_particular'])) {
                return [
                    'id' => (int)$fila['id'],
                    'precio' => round((float)$fila['precio_particular'], 2),
                    'descripcion' => trim((string)($fila['descripcion'] ?? '')) !== '' ? trim((string)$fila['descripcion']) : 'Consulta médica',
                ];
            }
        }
        return null;
    }

    /** Estado de la consulta pendiente de pago ('falta_cancelar', como la próxima cita de la HC) o 'pendiente' si el esquema aún no lo admite. */
    public static function estadoConsultaConCobro(\mysqli $conn): string {
        $res = $conn->query("SHOW COLUMNS FROM consultas LIKE 'estado'");
        $tipo = $res && ($fila = $res->fetch_assoc()) ? strtolower((string)($fila['Type'] ?? '')) : '';
        return strpos($tipo, "'falta_cancelar'") !== false ? 'falta_cancelar' : 'pendiente';
    }

    /** @return array<string,mixed>|null */
    private static function buscarGenerada(\mysqli $conn, int $medicoId, string $solicitud): ?array {
        $stmt = $conn->prepare('SELECT s.consulta_id, s.cotizacion_id, s.modo, c.fecha, c.hora, c.estado AS estado_consulta, ct.estado AS estado_cotizacion
            FROM seguimiento_clinico_consultas s
            LEFT JOIN consultas c ON c.id = s.consulta_id
            LEFT JOIN cotizaciones ct ON ct.id = s.cotizacion_id
            WHERE s.medico_id = ? AND s.client_request_id = ? LIMIT 1');
        $stmt->bind_param('is', $medicoId, $solicitud);
        $stmt->execute();
        $fila = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$fila) return null;
        return [
            'success' => true,
            'consulta_id' => (int)$fila['consulta_id'],
            'cotizacion_id' => (int)$fila['cotizacion_id'],
            'modo' => (string)$fila['modo'],
            'fecha' => $fila['fecha'],
            'hora' => $fila['hora'],
            'estado_consulta' => (string)$fila['estado_consulta'],
            'estado_cotizacion' => $fila['modo'] === 'sin_cobro' ? 'exonerada' : (string)$fila['estado_cotizacion'],
            'reutilizado' => true,
        ];
    }

    /**
     * Genera, en UNA transacción, la consulta (con la misma reserva de agenda que recepción), su cotización y el registro de auditoría.
     * Con cobro: consulta 'falta_cancelar' + cotización pendiente con la tarifa del médico (recepción cobra; el honorario nace al cobrar, como siempre).
     * Sin cobro: consulta 'pendiente' + cotización de S/ 0.00 (guardada como 'pagado'; se muestra "exonerada") con motivo y médico responsable; no hay cobro, por tanto no hay honorario.
     * Un reintento con el mismo client_request_id devuelve lo ya creado.
     * @param array<string,mixed> $datos resultado de validarSolicitud()['datos']
     * @return array{http:int,payload:array<string,mixed>}
     */
    public static function generarConsulta(\mysqli $conn, array $actor, array $datos, string $ip): array {
        if ((int)$actor['medico_id'] <= 0) {
            return ['http' => 403, 'payload' => ['success' => false, 'error' => 'Solo un médico puede generar consultas de seguimiento']];
        }
        $medicoId = (int)$actor['medico_id'];
        $pacienteId = (int)$datos['paciente_id'];
        if (self::obtenerPaciente($conn, $pacienteId) === null) {
            return ['http' => 404, 'payload' => ['success' => false, 'error' => 'Paciente no encontrado']];
        }
        if (!consultas_medico_existe($conn, $medicoId)) {
            return ['http' => 403, 'payload' => ['success' => false, 'error' => 'El médico no existe o ya no está disponible']];
        }
        if (!self::asegurarTablaConsultas($conn) || !self::asegurarTablaAccesos($conn)) {
            return ['http' => 500, 'payload' => ['success' => false, 'error' => 'No se pudo preparar el registro de seguimiento']];
        }

        $existente = self::buscarGenerada($conn, $medicoId, (string)$datos['client_request_id']);
        if ($existente !== null) {
            return ['http' => 200, 'payload' => $existente];
        }

        $sinCobro = $datos['modo'] === 'sin_cobro';
        $tarifa = self::tarifaConsulta($conn, $medicoId);
        if (!$sinCobro && ($tarifa === null || $tarifa['precio'] <= 0)) {
            return ['http' => 409, 'payload' => ['success' => false, 'error' => 'No hay una tarifa de consulta vigente para este médico. Configúrala en Gestión de Tarifas o genera la consulta sin cobro.']];
        }

        $estadoConsulta = $sinCobro ? 'pendiente' : self::estadoConsultaConCobro($conn);
        // Sin cobro se guarda como 'pagado' de S/ 0.00 (así lo fuerza la BD con saldo 0 y lo entienden todos los flujos);
        // "exonerada" es la etiqueta que se deriva al leer desde seguimiento_clinico_consultas.
        $estadoCotizacion = $sinCobro ? 'pagado' : 'pendiente';
        $total = $sinCobro ? 0.0 : (float)$tarifa['precio'];
        $observaciones = mb_substr(
            $sinCobro
                ? 'Seguimiento clínico - SIN COBRO (exonerada): ' . $datos['motivo']
                : 'Seguimiento clínico - consulta con cobro generada por ' . $actor['nombre'],
            0, 255, 'UTF-8'
        );
        $descripcion = $sinCobro ? 'Consulta exonerada (sin cobro)' : (string)$tarifa['descripcion'];
        $servicioId = $tarifa !== null ? (int)$tarifa['id'] : $medicoId;

        $conn->begin_transaction();
        try {
            $reserva = consultas_reservar_horario($conn, [
                'paciente_id' => $pacienteId,
                'medico_id' => $medicoId,
                'fecha' => $datos['fecha'],
                'hora' => $datos['hora'],
                'tipo_consulta' => 'programada',
                'origen_creacion' => self::ORIGEN_CONSULTA,
                'omitir_validacion_disponibilidad' => false,
                'estado' => $estadoConsulta,
            ], false);
            if (!($reserva['success'] ?? false)) {
                $conn->rollback();
                return ['http' => 409, 'payload' => $reserva];
            }
            $consultaId = (int)$reserva['id'];

            $stmt = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, total_pagado, saldo_pendiente, estado, observaciones) VALUES (?, 0, ?, 0, ?, ?, ?)');
            $stmt->bind_param('iddss', $pacienteId, $total, $total, $estadoCotizacion, $observaciones);
            $stmt->execute();
            $cotizacionId = (int)$conn->insert_id;
            $stmt->close();

            if (consultas_column_exists($conn, 'cotizaciones', 'numero_comprobante')) {
                $numero = sprintf('Q%06d', $cotizacionId);
                $stmtNum = $conn->prepare('UPDATE cotizaciones SET numero_comprobante = ? WHERE id = ?');
                $stmtNum->bind_param('si', $numero, $cotizacionId);
                $stmtNum->execute();
                $stmtNum->close();
            }

            $stmtDet = $conn->prepare('INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES (?, "consulta", ?, ?, 1, ?, ?, ?, ?)');
            $stmtDet->bind_param('iisddii', $cotizacionId, $servicioId, $descripcion, $total, $total, $medicoId, $consultaId);
            $stmtDet->execute();
            $stmtDet->close();

            $stmtAud = $conn->prepare('INSERT INTO seguimiento_clinico_consultas (consulta_id, cotizacion_id, paciente_id, medico_id, modo, motivo, client_request_id, creado_por_nombre, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $nombre = mb_substr((string)$actor['nombre'], 0, 150, 'UTF-8');
            $ipCorta = mb_substr($ip, 0, 45);
            $stmtAud->bind_param('iiiisssss', $consultaId, $cotizacionId, $pacienteId, $medicoId, $datos['modo'], $datos['motivo'], $datos['client_request_id'], $nombre, $ipCorta);
            $stmtAud->execute();
            $stmtAud->close();

            if (!self::registrarAcceso($conn, $actor, $pacienteId, $consultaId, 'generar_' . $datos['modo'], $ip)) {
                throw new \RuntimeException('No se pudo registrar el acceso');
            }

            $conn->commit();
        } catch (\Throwable $e) {
            @$conn->rollback();
            // Dos envíos simultáneos con el mismo identificador: el segundo choca con el índice único y devuelve lo del primero.
            if ($e instanceof \mysqli_sql_exception && (int)$e->getCode() === 1062) {
                $existente = self::buscarGenerada($conn, $medicoId, (string)$datos['client_request_id']);
                if ($existente !== null) {
                    return ['http' => 200, 'payload' => $existente];
                }
            }
            error_log('Seguimiento clínico, generar consulta: ' . $e->getMessage());
            return ['http' => 500, 'payload' => ['success' => false, 'error' => 'No se pudo generar la consulta; no se guardó nada']];
        }

        $respuesta = [
            'success' => true,
            'consulta_id' => $consultaId,
            'cotizacion_id' => $cotizacionId,
            'modo' => $datos['modo'],
            'fecha' => $datos['fecha'],
            'hora' => $datos['hora'],
            'estado_consulta' => $estadoConsulta,
            'estado_cotizacion' => $sinCobro ? 'exonerada' : 'pendiente',
            'reutilizado' => false,
        ];
        if (isset($reserva['cupos_restantes'])) {
            $respuesta['cupos_restantes'] = (int)$reserva['cupos_restantes'];
        }
        return ['http' => 201, 'payload' => $respuesta];
    }
}
