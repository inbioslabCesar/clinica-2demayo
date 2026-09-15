<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function construir_filtro_busqueda_pacientes(string $busqueda): array {
    $busqueda = trim($busqueda);
    if ($busqueda === '') {
        return ['', [], ''];
    }

    $busquedaUpper = strtoupper($busqueda);

    // Búsqueda exacta por historia clínica completa: aprovecha mejor el índice.
    if (preg_match('/^HC\d+$/i', $busquedaUpper)) {
        return ['WHERE historia_clinica = ?', [$busquedaUpper], 's'];
    }

    // Si es numérico, priorizar DNI exacto o prefijo de historia clínica.
    if (preg_match('/^\d+$/', $busqueda)) {
        if (strlen($busqueda) >= 8) {
            return ['WHERE dni = ?', [$busqueda], 's'];
        }
        return ['WHERE dni LIKE ? OR historia_clinica LIKE ?', ["{$busqueda}%", "HC{$busqueda}%"], 'ss'];
    }

    $busquedaLike = "%$busqueda%";
    return [
        "WHERE nombre LIKE ? OR apellido LIKE ? OR CONCAT(nombre, ' ', apellido) LIKE ?",
        [$busquedaLike, $busquedaLike, $busquedaLike],
        'sss'
    ];
}

function pacientes_table_exists($conn, string $table): bool {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function pacientes_column_exists($conn, string $table, string $column): bool {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function pacientes_select_columns($conn, string $alias = ''): string {
    $p = $alias !== '' ? $alias . '.' : '';
    $hasGrupo = pacientes_column_exists($conn, 'pacientes', 'grupo_sanguineo');
    $hasRh = pacientes_column_exists($conn, 'pacientes', 'factor_rh');

    $cols = [
        $p . 'id',
        $p . 'historia_clinica',
        $p . 'nombre',
        $p . 'apellido',
        $p . 'fecha_nacimiento',
        $p . 'edad',
        $p . 'edad_unidad',
        $p . 'procedencia',
        $p . 'tipo_seguro',
        $p . 'direccion',
        $p . 'telefono',
        $p . 'email',
        $p . 'dni',
        $p . 'sexo',
        $hasGrupo ? ($p . 'grupo_sanguineo') : 'NULL AS grupo_sanguineo',
        $hasRh ? ($p . 'factor_rh') : 'NULL AS factor_rh',
        $p . 'creado_en'
    ];

    return implode(', ', $cols);
}

function pacientes_acompanantes_table_exists($conn): bool {
    return pacientes_table_exists($conn, 'pacientes_acompanantes');
}

function normalizar_acompanantes_payload($raw): array {
    if (!is_array($raw)) return [];

    $permitidosParentesco = ['PADRE', 'MADRE', 'TUTOR', 'ABUELO_A', 'HERMANO_A', 'OTRO'];
    $out = [];

    foreach ($raw as $row) {
        if (!is_array($row)) continue;
        $nombre = strtoupper(trim((string)($row['nombre_completo'] ?? '')));
        $parentesco = strtoupper(trim((string)($row['parentesco'] ?? '')));
        $telefono = trim((string)($row['telefono'] ?? ''));

        if ($nombre === '' && $parentesco === '' && $telefono === '') {
            continue;
        }

        if ($nombre === '' || $parentesco === '') {
            continue;
        }

        if (!in_array($parentesco, $permitidosParentesco, true)) {
            $parentesco = 'OTRO';
        }

        $out[] = [
            'nombre_completo' => $nombre,
            'parentesco' => $parentesco,
            'telefono' => $telefono !== '' ? $telefono : null,
        ];

        if (count($out) >= 2) break;
    }

    return $out;
}

function obtener_acompanantes_paciente($conn, int $pacienteId): array {
    if ($pacienteId <= 0 || !pacientes_acompanantes_table_exists($conn)) {
        return [];
    }

    $stmt = $conn->prepare('SELECT id, nombre_completo, parentesco, telefono, es_principal, creado_en FROM pacientes_acompanantes WHERE paciente_id = ? ORDER BY es_principal DESC, id ASC LIMIT 2');
    if (!$stmt) return [];

    $stmt->bind_param('i', $pacienteId);
    $stmt->execute();
    $res = $stmt->get_result();

    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $rows[] = $row;
    }
    $stmt->close();
    return $rows;
}

function guardar_acompanantes_paciente($conn, int $pacienteId, array $acompanantes): bool {
    if ($pacienteId <= 0 || !pacientes_acompanantes_table_exists($conn)) {
        return true;
    }

    $stmtDel = $conn->prepare('DELETE FROM pacientes_acompanantes WHERE paciente_id = ?');
    if (!$stmtDel) return false;
    $stmtDel->bind_param('i', $pacienteId);
    if (!$stmtDel->execute()) {
        $stmtDel->close();
        return false;
    }
    $stmtDel->close();

    if (count($acompanantes) === 0) {
        return true;
    }

    $stmtIns = $conn->prepare('INSERT INTO pacientes_acompanantes (paciente_id, nombre_completo, parentesco, telefono, es_principal) VALUES (?, ?, ?, ?, ?)');
    if (!$stmtIns) return false;

    foreach ($acompanantes as $idx => $a) {
        $nombre = (string)$a['nombre_completo'];
        $parentesco = (string)$a['parentesco'];
        $telefono = $a['telefono'] ?? null;
        $esPrincipal = $idx === 0 ? 1 : 0;
        $stmtIns->bind_param('isssi', $pacienteId, $nombre, $parentesco, $telefono, $esPrincipal);
        if (!$stmtIns->execute()) {
            $stmtIns->close();
            return false;
        }
    }

    $stmtIns->close();
    return true;
}

function obtener_paciente_por_id($conn, int $id): ?array {
    if ($id <= 0) return null;
    $select = pacientes_select_columns($conn);
    $stmt = $conn->prepare("SELECT $select FROM pacientes WHERE id = ?");
    if (!$stmt) return null;
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res->fetch_assoc() ?: null;
    $stmt->close();

    if ($row) {
        $row['acompanantes'] = obtener_acompanantes_paciente($conn, $id);
    }
    return $row;
}

function pacientes_parse_date_safe($value): ?DateTime {
    $raw = trim((string)$value);
    if ($raw === '') return null;

    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
        $dt = DateTime::createFromFormat('Y-m-d H:i:s', $raw . ' 00:00:00');
        return $dt instanceof DateTime ? $dt : null;
    }

    $ts = strtotime($raw);
    if ($ts === false) return null;
    $dt = new DateTime();
    $dt->setTimestamp($ts);
    return $dt;
}

function pacientes_normalizar_unidad_edad($unidad): string {
    $map = [
        'aÃ±o' => 'año',
        'aÃ±os' => 'años',
        'dÃa' => 'día',
        'dÃas' => 'días',
    ];
    $normalizado = strtr((string)$unidad, $map);
    $u = strtolower(trim($normalizado));
    if ($u === '') return 'anios';

    if (in_array($u, ['anio', 'anios', 'años', 'año', 'year', 'years'], true)) return 'anios';
    if (in_array($u, ['mes', 'meses', 'month', 'months'], true)) return 'meses';
    if (in_array($u, ['dia', 'dias', 'días', 'day', 'days'], true)) return 'dias';
    return 'anios';
}

function pacientes_unidad_edad_para_bd($conn, $unidadNormalizada): ?string {
    static $cache = null;

    $unidad = pacientes_normalizar_unidad_edad($unidadNormalizada);
    if ($unidad === '') return null;

    if ($cache === null) {
        $cache = [
            'is_enum' => false,
            'options' => [],
            'by_normalized' => [],
        ];

        $stmt = $conn->prepare("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pacientes' AND COLUMN_NAME = 'edad_unidad' LIMIT 1");
        if ($stmt) {
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            $columnType = strtolower(trim((string)($row['COLUMN_TYPE'] ?? '')));
            if (strpos($columnType, 'enum(') === 0) {
                $cache['is_enum'] = true;
                $inside = substr($columnType, 5, -1);
                $options = str_getcsv($inside, ',', "'", '\\');
                foreach ((array)$options as $opt) {
                    $value = trim((string)$opt);
                    if ($value === '') continue;
                    $cache['options'][] = $value;
                    $norm = pacientes_normalizar_unidad_edad($value);
                    if (!isset($cache['by_normalized'][$norm])) {
                        $cache['by_normalized'][$norm] = $value;
                    }
                }
            }
        }
    }

    if (!$cache['is_enum']) {
        return $unidad;
    }

    if (isset($cache['by_normalized'][$unidad])) {
        return $cache['by_normalized'][$unidad];
    }

    if (!empty($cache['options'])) {
        return (string)$cache['options'][0];
    }

    return $unidad;
}

function pacientes_set_edad_row(array &$row): void {
    $hoy = new DateTime('today');
    $fechaNac = pacientes_parse_date_safe($row['fecha_nacimiento'] ?? null);

    if ($fechaNac instanceof DateTime) {
        $fechaNac->setTime(0, 0, 0);
        $diff = $fechaNac->diff($hoy);
        $dias = (int)$diff->days;
        $meses = max(0, ((int)$diff->y * 12) + (int)$diff->m);
        $anios = max(0, (int)$diff->y);

        if ($dias <= 28) {
            $row['edad'] = $dias;
            $row['edad_unidad'] = 'dias';
        } elseif ($meses < 12) {
            $row['edad'] = $meses;
            $row['edad_unidad'] = 'meses';
        } else {
            $row['edad'] = $anios;
            $row['edad_unidad'] = 'años';
        }

        $row['edad_es_estimada'] = 0;
        $row['edad_fuente'] = 'fecha_nacimiento';
        $row['edad_referencia_fecha'] = $hoy->format('Y-m-d');
        return;
    }

    $edadBase = isset($row['edad']) && $row['edad'] !== '' ? (int)$row['edad'] : null;
    if ($edadBase === null || $edadBase < 0) {
        $row['edad'] = null;
        $row['edad_unidad'] = $row['edad_unidad'] ?? null;
        $row['edad_es_estimada'] = 0;
        $row['edad_fuente'] = 'sin_datos';
        $row['edad_referencia_fecha'] = null;
        return;
    }

    $unidadBase = pacientes_normalizar_unidad_edad($row['edad_unidad'] ?? 'anios');
    $fechaRef = pacientes_parse_date_safe($row['creado_en'] ?? null);
    if (!$fechaRef instanceof DateTime) {
        $row['edad'] = $edadBase;
        $row['edad_unidad'] = $unidadBase === 'anios' ? 'años' : ($unidadBase === 'meses' ? 'meses' : 'dias');
        $row['edad_es_estimada'] = 1;
        $row['edad_fuente'] = 'edad_base_sin_fecha_ref';
        $row['edad_referencia_fecha'] = null;
        return;
    }

    $fechaRef->setTime(0, 0, 0);
    $diffRef = $fechaRef->diff($hoy);
    $aniosTrans = max(0, (int)$diffRef->y);
    $mesesTrans = max(0, ((int)$diffRef->y * 12) + (int)$diffRef->m);
    $diasTrans = max(0, (int)$diffRef->days);

    if ($unidadBase === 'dias') {
        $totalDias = $edadBase + $diasTrans;
        if ($totalDias <= 28) {
            $row['edad'] = $totalDias;
            $row['edad_unidad'] = 'dias';
        } else {
            $row['edad'] = (int)floor($totalDias / 30);
            $row['edad_unidad'] = 'meses';
        }
    } elseif ($unidadBase === 'meses') {
        $totalMeses = $edadBase + $mesesTrans;
        if ($totalMeses < 12) {
            $row['edad'] = $totalMeses;
            $row['edad_unidad'] = 'meses';
        } else {
            $row['edad'] = (int)floor($totalMeses / 12);
            $row['edad_unidad'] = 'años';
        }
    } else {
        $row['edad'] = $edadBase + $aniosTrans;
        $row['edad_unidad'] = 'años';
    }

    $row['edad_es_estimada'] = 1;
    $row['edad_fuente'] = 'edad_base_progresiva';
    $row['edad_referencia_fecha'] = $fechaRef->format('Y-m-d');
}

function pacientes_tiene_edad_o_fecha_nacimiento(array $row): bool {
    $fecha = trim((string)($row['fecha_nacimiento'] ?? ''));
    if ($fecha !== '' && $fecha !== '0000-00-00') {
        return true;
    }

    if (!isset($row['edad']) || $row['edad'] === null) {
        return false;
    }

    $edadRaw = trim((string)$row['edad']);
    if ($edadRaw === '') {
        return false;
    }

    return is_numeric($edadRaw);
}

function pacientes_normalizar_tipo_seguro_visual(array &$row): void {
    $tipoSeguro = strtoupper(trim((string)($row['tipo_seguro'] ?? '')));
    if ($tipoSeguro !== 'PENDIENTE_COMPLETAR') {
        return;
    }

    if (pacientes_tiene_edad_o_fecha_nacimiento($row)) {
        $row['tipo_seguro'] = '';
    }
}

// Función para generar el próximo número de historia clínica
function generarProximaHistoriaClinica($conn) {
    // Obtener el último número de HC de la base de datos
    $query = "SELECT historia_clinica FROM pacientes 
              WHERE historia_clinica LIKE 'HC%' 
              ORDER BY CAST(SUBSTRING(historia_clinica, 3) AS UNSIGNED) DESC 
              LIMIT 1";
    
    $result = $conn->query($query);
    
    if ($result && $result->num_rows > 0) {
        $row = $result->fetch_assoc();
        $ultimaHC = $row['historia_clinica'];
        
        // Extraer el número de la HC (por ejemplo: HC00123 -> 123)
        $numero = intval(substr($ultimaHC, 2));
        $proximoNumero = $numero + 1;
        
        // Formatear con 5 dígitos con ceros a la izquierda
        return 'HC' . str_pad($proximoNumero, 5, '0', STR_PAD_LEFT);
    } else {
        // Si no hay registros, empezar con HC00001
        return 'HC00001';
    }
}

// Eliminar paciente (DELETE)
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = isset($data['id']) ? intval($data['id']) : 0;
    if ($id > 0) {
        // Verificar si el paciente tiene atenciones asociadas
        $stmt = $conn->prepare("SELECT COUNT(*) as total FROM atenciones WHERE paciente_id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        $stmt->close();
        if ($row && $row['total'] > 0) {
            echo json_encode(['success' => false, 'error' => 'No se puede eliminar el paciente porque tiene atenciones registradas.']);
            exit;
        }
        // Si no tiene atenciones, eliminar normalmente
        $stmt = $conn->prepare("DELETE FROM pacientes WHERE id = ?");
        $stmt->bind_param('i', $id);
        if ($stmt->execute()) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al eliminar paciente: ' . $stmt->error]);
        }
        $stmt->close();
    } else {
        echo json_encode(['success' => false, 'error' => 'ID de paciente no válido']);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $id = isset($data['id']) ? intval($data['id']) : 0;
    $dni = $data['dni'] ?? '';
    $nombre = $data['nombre'] ?? '';
    $apellido = $data['apellido'] ?? '';
        $historia = $data['historia_clinica'] ?? '';
        
        // Si no se proporciona historia clínica, generar automáticamente
        if (empty($historia)) {
            $historia = generarProximaHistoriaClinica($conn);
        } else {
            // Prefijo automático HC si no lo tiene
            if (stripos($historia, 'HC') !== 0) {
                $historia = 'HC' . $historia;
            }
        }
        
        // Validar que la historia clínica no esté duplicada (solo para nuevos pacientes)
        if ($id == 0) {
            $stmtCheck = $conn->prepare("SELECT id FROM pacientes WHERE historia_clinica = ?");
            $stmtCheck->bind_param('s', $historia);
            $stmtCheck->execute();
            $resultCheck = $stmtCheck->get_result();
            
            if ($resultCheck->num_rows > 0) {
                // Si está duplicada, generar una nueva automáticamente
                $historia = generarProximaHistoriaClinica($conn);
            }
            $stmtCheck->close();
        }
    $fecha_nacimiento = isset($data['fecha_nacimiento']) && $data['fecha_nacimiento'] !== '' ? $data['fecha_nacimiento'] : null;
    $edad = $data['edad'] ?? null;
    if ($edad === '' || $edad === false) {
        $edad = null;
    } elseif ($edad !== null) {
        $edad = max(0, (int)$edad);
    }

    $edadUnidadInput = $data['edad_unidad'] ?? null;
    $edad_unidad = $edad !== null
        ? pacientes_unidad_edad_para_bd($conn, $edadUnidadInput)
        : null;
    $procedencia = $data['procedencia'] ?? null;
    $tipo_seguro = $data['tipo_seguro'] ?? null;
    $sexo = $data['sexo'] ?? 'M';
    $direccion = $data['direccion'] ?? null;
    $telefono = $data['telefono'] ?? null;
    $email = $data['email'] ?? null;
    $grupo_sanguineo = isset($data['grupo_sanguineo']) ? strtoupper(trim((string)$data['grupo_sanguineo'])) : null;
    $factor_rh = isset($data['factor_rh']) ? strtoupper(trim((string)$data['factor_rh'])) : null;
    $acompanantes = normalizar_acompanantes_payload($data['acompanantes'] ?? []);

        $gruposValidos = ['A', 'B', 'AB', 'O', 'NO_ESPECIFICADO'];
        $rhValidos = ['POSITIVO', 'NEGATIVO', 'NO_ESPECIFICADO'];
        if ($grupo_sanguineo !== null && $grupo_sanguineo !== '' && !in_array($grupo_sanguineo, $gruposValidos, true)) {
            $grupo_sanguineo = 'NO_ESPECIFICADO';
        }
        if ($factor_rh !== null && $factor_rh !== '' && !in_array($factor_rh, $rhValidos, true)) {
            $factor_rh = 'NO_ESPECIFICADO';
        }
        if ($grupo_sanguineo === '') $grupo_sanguineo = null;
        if ($factor_rh === '') $factor_rh = null;

        // Validar campos obligatorios
        if (!$dni) {
            echo json_encode(['success' => false, 'error' => 'El campo DNI no debe estar vacío']);
            exit;
        }
        if (!$nombre) {
            echo json_encode(['success' => false, 'error' => 'El campo Nombre no debe estar vacío']);
            exit;
        }
        if (!$apellido) {
            echo json_encode(['success' => false, 'error' => 'El campo Apellido no debe estar vacío']);
            exit;
        }
        // La historia clínica ya no es obligatoria desde el frontend
        // Se genera automáticamente si está vacía

        $hasGrupo = pacientes_column_exists($conn, 'pacientes', 'grupo_sanguineo');
        $hasRh = pacientes_column_exists($conn, 'pacientes', 'factor_rh');

        $conn->begin_transaction();
        try {
            if ($id > 0) {
                // Actualizar paciente existente
                if ($hasGrupo && $hasRh) {
                    $stmt = $conn->prepare("UPDATE pacientes SET dni=?, nombre=?, apellido=?, historia_clinica=?, fecha_nacimiento=?, edad=?, edad_unidad=?, procedencia=?, tipo_seguro=?, sexo=?, direccion=?, telefono=?, email=?, grupo_sanguineo=?, factor_rh=? WHERE id=?");
                    $stmt->bind_param('sssssssssssssssi', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $grupo_sanguineo, $factor_rh, $id);
                } elseif ($hasGrupo) {
                    $stmt = $conn->prepare("UPDATE pacientes SET dni=?, nombre=?, apellido=?, historia_clinica=?, fecha_nacimiento=?, edad=?, edad_unidad=?, procedencia=?, tipo_seguro=?, sexo=?, direccion=?, telefono=?, email=?, grupo_sanguineo=? WHERE id=?");
                    $stmt->bind_param('ssssssssssssssi', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $grupo_sanguineo, $id);
                } elseif ($hasRh) {
                    $stmt = $conn->prepare("UPDATE pacientes SET dni=?, nombre=?, apellido=?, historia_clinica=?, fecha_nacimiento=?, edad=?, edad_unidad=?, procedencia=?, tipo_seguro=?, sexo=?, direccion=?, telefono=?, email=?, factor_rh=? WHERE id=?");
                    $stmt->bind_param('ssssssssssssssi', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $factor_rh, $id);
                } else {
                    $stmt = $conn->prepare("UPDATE pacientes SET dni=?, nombre=?, apellido=?, historia_clinica=?, fecha_nacimiento=?, edad=?, edad_unidad=?, procedencia=?, tipo_seguro=?, sexo=?, direccion=?, telefono=?, email=? WHERE id=?");
                    $stmt->bind_param('sssssssssssssi', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $id);
                }

                if (!$stmt || !$stmt->execute()) {
                    $err = $stmt ? $stmt->error : $conn->error;
                    if ($stmt) $stmt->close();
                    throw new Exception('Error al actualizar paciente: ' . $err);
                }
                $stmt->close();
            } else {
                // Registrar nuevo paciente
                if ($hasGrupo && $hasRh) {
                    $stmt = $conn->prepare("INSERT INTO pacientes (dni, nombre, apellido, historia_clinica, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, sexo, direccion, telefono, email, grupo_sanguineo, factor_rh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->bind_param('sssssssssssssss', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $grupo_sanguineo, $factor_rh);
                } elseif ($hasGrupo) {
                    $stmt = $conn->prepare("INSERT INTO pacientes (dni, nombre, apellido, historia_clinica, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, sexo, direccion, telefono, email, grupo_sanguineo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->bind_param('ssssssssssssss', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $grupo_sanguineo);
                } elseif ($hasRh) {
                    $stmt = $conn->prepare("INSERT INTO pacientes (dni, nombre, apellido, historia_clinica, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, sexo, direccion, telefono, email, factor_rh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->bind_param('ssssssssssssss', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $factor_rh);
                } else {
                    $stmt = $conn->prepare("INSERT INTO pacientes (dni, nombre, apellido, historia_clinica, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, sexo, direccion, telefono, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->bind_param('sssssssssssss', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email);
                }

                if (!$stmt || !$stmt->execute()) {
                    $err = $stmt ? $stmt->error : $conn->error;
                    if ($stmt) $stmt->close();
                    if (strpos($err, 'Duplicate entry') !== false && strpos($err, 'dni') !== false) {
                        throw new Exception('El DNI ingresado ya está registrado en el sistema.');
                    }
                    throw new Exception('Error al registrar paciente: ' . $err);
                }
                $id = $conn->insert_id;
                $stmt->close();
            }

            if (!guardar_acompanantes_paciente($conn, (int)$id, $acompanantes)) {
                throw new Exception('No se pudo guardar la información de acompañantes.');
            }

            $conn->commit();

            $paciente = obtener_paciente_por_id($conn, (int)$id);
            echo json_encode(['success' => true, 'paciente' => $paciente]);
        } catch (Exception $e) {
            $conn->rollback();
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        exit;
}



// Listar un paciente por id (GET ?id=...)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['id'])) {
    $id = intval($_GET['id']);
    $row = obtener_paciente_por_id($conn, $id);
    if ($row) {
        pacientes_set_edad_row($row);
        echo json_encode(['success' => true, 'paciente' => $row]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
    }
    exit;
}

// Listar todos los pacientes (GET)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Paginación: page y limit por GET
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : 20;
    $offset = ($page - 1) * $limit;

    // Filtro de búsqueda
    $busqueda = isset($_GET['busqueda']) ? trim($_GET['busqueda']) : '';
    [$where, $params, $types] = construir_filtro_busqueda_pacientes($busqueda);

    $selectContratoActivo = '0 AS contrato_activo';
    if (pacientes_table_exists($conn, 'contratos_paciente')) {
        $selectContratoActivo = "CASE
            WHEN EXISTS (
                SELECT 1 FROM contratos_paciente cp
                WHERE cp.paciente_id = pacientes.id
                  AND cp.estado = 'activo'
                  AND CURDATE() BETWEEN cp.fecha_inicio AND cp.fecha_fin
            ) THEN 2
            WHEN EXISTS (
                SELECT 1 FROM contratos_paciente cp
                WHERE cp.paciente_id = pacientes.id
            ) THEN 1
            ELSE 0
        END AS contrato_activo";
    }

    // Obtener el total de pacientes filtrados
    if ($where) {
        $sqlTotal = "SELECT COUNT(*) as total FROM pacientes $where";
        $stmtTotal = $conn->prepare($sqlTotal);
        $stmtTotal->bind_param($types, ...$params);
        $stmtTotal->execute();
        $resTotal = $stmtTotal->get_result();
        $rowTotal = $resTotal->fetch_assoc();
        $total = intval($rowTotal['total']);
        $stmtTotal->close();
    } else {
        $resTotal = $conn->query("SELECT COUNT(*) as total FROM pacientes");
        $rowTotal = $resTotal->fetch_assoc();
        $total = intval($rowTotal['total']);
    }

    // Obtener solo los pacientes de la página actual filtrados
    if ($where) {
        $selectCols = pacientes_select_columns($conn);
        $sql = "SELECT $selectCols, $selectContratoActivo FROM pacientes $where ORDER BY id DESC LIMIT ? OFFSET ?";
        $stmt = $conn->prepare($sql);
        $params[] = $limit;
        $params[] = $offset;
        $types .= 'ii';
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $selectCols = pacientes_select_columns($conn);
        $stmt = $conn->prepare("SELECT $selectCols, $selectContratoActivo FROM pacientes ORDER BY id DESC LIMIT ? OFFSET ?");
        $stmt->bind_param('ii', $limit, $offset);
        $stmt->execute();
        $result = $stmt->get_result();
    }
    $pacientes = [];
    while ($row = $result->fetch_assoc()) {
        pacientes_set_edad_row($row);
        pacientes_normalizar_tipo_seguro_visual($row);
        $row['acompanantes'] = obtener_acompanantes_paciente($conn, (int)$row['id']);
        $pacientes[] = $row;
    }
    $stmt->close();
    echo json_encode([
        'success' => true,
        'pacientes' => $pacientes,
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
        'totalPages' => ceil($total / $limit)
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
