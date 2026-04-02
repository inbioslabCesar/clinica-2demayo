<?php
require_once __DIR__ . '/init_api.php';
// Conexión a la base de datos centralizada
require_once __DIR__ . '/config.php';

// DEBUG: Registrar el contenido de la sesión y el rol detectado
// Debug eliminado

// Solo admin/administrador y recepcionista pueden acceder
// Solo administrador y recepcionista pueden acceder
// Permitir acceso solo si el usuario está autenticado y es administrador o recepcionista
$usuario = $_SESSION['usuario'] ?? null;
$rol = $usuario['rol'] ?? '';
if (!$usuario || !in_array($rol, ['administrador', 'recepcionista'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Acceso denegado']);
    exit;
}



$paciente_id = isset($_GET['paciente_id']) ? intval($_GET['paciente_id']) : 0;
$cotizacion_id_ctx = isset($_GET['cotizacion_id']) ? intval($_GET['cotizacion_id']) : 0;
if ($paciente_id <= 0) {
    echo json_encode(['success' => false, 'error' => 'ID de paciente inválido']);
    exit;
}

function obtenerEstadoServicio(PDO $pdo, $cobroEstado, $detalles, array &$cacheCotizaciones, $cotizacionIdForzada = null) {
    $cobroEstadoLc = strtolower((string)$cobroEstado);
    $estadoDefault = [
        'estado_pago' => $cobroEstadoLc === 'anulado' ? 'anulada' : ($cobroEstadoLc === 'pagado' ? 'pagado' : 'pendiente'),
        'cotizacion_id' => null,
        'saldo_pendiente' => 0.0,
        'total_pagado' => null,
        'total_cotizacion' => null,
    ];

    if (!is_array($detalles) || empty($detalles)) {
        return $estadoDefault;
    }

    $cotizacionId = intval($cotizacionIdForzada ?: 0);
    if ($cotizacionId <= 0) {
        foreach ($detalles as $d) {
            if (!is_array($d)) {
                continue;
            }
            $cid = isset($d['cotizacion_id']) ? intval($d['cotizacion_id']) : 0;
            if ($cid > 0) {
                $cotizacionId = $cid;
                break;
            }
        }
    }

    if (!$cotizacionId) {
        return $estadoDefault;
    }

    if (!array_key_exists($cotizacionId, $cacheCotizaciones)) {
        $stmtCot = $pdo->prepare("SELECT * FROM cotizaciones WHERE id = ? LIMIT 1");
        $stmtCot->execute([$cotizacionId]);
        $cacheCotizaciones[$cotizacionId] = $stmtCot->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    $cot = $cacheCotizaciones[$cotizacionId];
    if (!$cot) {
        return [
            'estado_pago' => 'pendiente',
            'cotizacion_id' => $cotizacionId,
            'saldo_pendiente' => 0.0,
            'total_pagado' => null,
            'total_cotizacion' => null,
        ];
    }

    $estado = strtolower((string)($cot['estado'] ?? ''));
    $saldo = isset($cot['saldo_pendiente']) ? floatval($cot['saldo_pendiente']) : 0.0;
    $pagado = isset($cot['total_pagado']) ? floatval($cot['total_pagado']) : null;
    $total = isset($cot['total']) ? floatval($cot['total']) : null;

    if (!in_array($estado, ['pagado', 'parcial', 'pendiente', 'anulada'], true)) {
        if ($saldo > 0) {
            $estado = ($pagado !== null && $pagado > 0) ? 'parcial' : 'pendiente';
        } else {
            $estado = 'pagado';
        }
    }

    return [
        'estado_pago' => $estado,
        'cotizacion_id' => $cotizacionId,
        'saldo_pendiente' => $saldo,
        'total_pagado' => $pagado,
        'total_cotizacion' => $total,
    ];
}

function resolverCotizacionIdPorCobro(PDO $pdo, $cobroId, array &$cacheCobroCotizacion) {
    $cobroId = intval($cobroId);
    if ($cobroId <= 0) {
        return null;
    }

    if (array_key_exists($cobroId, $cacheCobroCotizacion)) {
        $cached = intval($cacheCobroCotizacion[$cobroId] ?? 0);
        return $cached > 0 ? $cached : null;
    }

    try {
        $stmt = $pdo->prepare("SELECT cotizacion_id FROM cotizacion_movimientos WHERE cobro_id = ? AND cotizacion_id IS NOT NULL ORDER BY id DESC LIMIT 1");
        $stmt->execute([$cobroId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $cotizacionId = $row ? intval($row['cotizacion_id'] ?? 0) : 0;
        $cacheCobroCotizacion[$cobroId] = $cotizacionId > 0 ? $cotizacionId : null;
        return $cotizacionId > 0 ? $cotizacionId : null;
    } catch (Exception $e) {
        $cacheCobroCotizacion[$cobroId] = null;
        return null;
    }
}

try {
    // Obtener datos del paciente
    $stmt = $pdo->prepare("SELECT id, nombre, apellido, dni, historia_clinica FROM pacientes WHERE id = ? LIMIT 1");
    $stmt->execute([$paciente_id]);
    $paciente = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$paciente) {
        echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
        exit;
    }

    // Obtener historial de cobros y servicios pagados (ahora agrupado por cobro)
    $stmt = $pdo->prepare("SELECT c.id AS cobro_id, c.estado AS cobro_estado, c.fecha_cobro AS fecha, c.total AS monto_cobrado, cd.servicio_tipo AS servicio, cd.descripcion, cd.subtotal AS monto FROM cobros c JOIN cobros_detalle cd ON c.id = cd.cobro_id WHERE c.paciente_id = ? AND c.estado IN ('pagado', 'anulado') ORDER BY c.fecha_cobro DESC");
    $stmt->execute([$paciente_id]);
    $historial_raw = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $historial = [];
    $cacheCotizaciones = [];
    $cacheCobroCotizacion = [];
    foreach ($historial_raw as $row) {
        $detalles = json_decode($row['descripcion'], true);
        $cotizacionIdResuelta = resolverCotizacionIdPorCobro($pdo, $row['cobro_id'] ?? 0, $cacheCobroCotizacion);

        if ($cotizacion_id_ctx > 0 && $cotizacionIdResuelta > 0 && $cotizacionIdResuelta !== $cotizacion_id_ctx) {
            continue;
        }

        $cotizacionIdForzada = $cotizacionIdResuelta;
        if ($cotizacionIdForzada <= 0 && $cotizacion_id_ctx > 0) {
            // Cuando se navega desde Cotizaciones, usar el contexto de la URL
            // para resolver estado aunque el detalle del cobro no traiga cotizacion_id.
            $cotizacionIdForzada = $cotizacion_id_ctx;
        }

        $estadoServicio = obtenerEstadoServicio($pdo, $row['cobro_estado'] ?? 'pagado', $detalles, $cacheCotizaciones, $cotizacionIdForzada);

        if ($cotizacion_id_ctx > 0 && intval($estadoServicio['cotizacion_id'] ?? 0) > 0 && intval($estadoServicio['cotizacion_id']) !== $cotizacion_id_ctx) {
            continue;
        }
        // Si el servicio incluye laboratorio (fila directa o dentro del JSON de detalles), buscar la orden
        $tieneLabEnDetalles = false;
        if (is_array($detalles)) {
            foreach ($detalles as $d) {
                if (isset($d['servicio_tipo']) && strtolower(trim((string)$d['servicio_tipo'])) === 'laboratorio') {
                    $tieneLabEnDetalles = true;
                    break;
                }
            }
        }
        $resultados_laboratorio_url = null;
        if ($row['servicio'] === 'laboratorio' || $tieneLabEnDetalles) {
            error_log("[DEBUG] Buscando orden de laboratorio para cobro_id: " . $row['cobro_id']);
            $stmtOrden = $pdo->prepare("SELECT id, consulta_id FROM ordenes_laboratorio WHERE cobro_id = ? LIMIT 1");
            $stmtOrden->execute([$row['cobro_id']]);
            $ordenLab = $stmtOrden->fetch(PDO::FETCH_ASSOC);
            error_log("[DEBUG] Resultado ordenLab: " . json_encode($ordenLab));
            if ($ordenLab) {
                $consultaId = isset($ordenLab['consulta_id']) ? $ordenLab['consulta_id'] : null;
                $ordenId = isset($ordenLab['id']) ? $ordenLab['id'] : null;
                error_log("[DEBUG] Buscando resultados_laboratorio para consulta_id: " . var_export($consultaId, true) . ", orden_id: " . var_export($ordenId, true));
                if (!empty($consultaId)) {
                    $stmtRes = $pdo->prepare("SELECT id FROM resultados_laboratorio WHERE consulta_id = ? LIMIT 1");
                    $stmtRes->execute([$consultaId]);
                } elseif (!empty($ordenId)) {
                    $stmtRes = $pdo->prepare("SELECT id FROM resultados_laboratorio WHERE orden_id = ? ORDER BY fecha DESC LIMIT 1");
                    $stmtRes->execute([$ordenId]);
                } else {
                    error_log("[ERROR] ordenLab no tiene consulta_id ni id válido");
                }
                $resLab = isset($stmtRes) ? $stmtRes->fetch(PDO::FETCH_ASSOC) : false;
                error_log("[DEBUG] Resultado resLab: " . json_encode($resLab));
                if ($resLab && isset($resLab['id'])) {
                    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                    $baseUrl = $scheme . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';
                    $resultados_laboratorio_url = $baseUrl . "descargar_resultados_laboratorio.php?id=" . $resLab['id'];
                }
            }
        }
        $historial[] = [
            'cobro_id' => $row['cobro_id'],
            'fecha' => $row['fecha'],
            'servicio' => $row['servicio'],
            'monto' => $row['monto'],
            'monto_bruto' => $row['monto'],
            'monto_cobrado' => $row['monto_cobrado'],
            'detalles' => $detalles,
            'resultados_laboratorio' => $resultados_laboratorio_url,
            'estado_pago' => $estadoServicio['estado_pago'],
            'cotizacion_id' => $estadoServicio['cotizacion_id'],
            'saldo_pendiente' => $estadoServicio['saldo_pendiente'],
            'total_pagado' => $estadoServicio['total_pagado'],
            'total_cotizacion' => $estadoServicio['total_cotizacion']
        ];
    }

    // Calcular consumo total pagado
    $stmt = $pdo->prepare("SELECT SUM(total) AS consumo_total FROM cobros WHERE paciente_id = ? AND estado = 'pagado'");
    $stmt->execute([$paciente_id]);
    $consumo_total = floatval($stmt->fetchColumn() ?: 0);

    // Calcular deuda total (pendiente)
    $stmt = $pdo->prepare("SELECT SUM(total) AS deuda_total FROM cobros WHERE paciente_id = ? AND estado = 'pendiente'");
    $stmt->execute([$paciente_id]);
    $deuda_total = floatval($stmt->fetchColumn() ?: 0);

    echo json_encode([
        'success' => true,
        'paciente_id' => $paciente['id'],
        'nombre' => $paciente['nombre'],
        'apellido' => $paciente['apellido'],
        'dni' => $paciente['dni'],
        'historia_clinica' => $paciente['historia_clinica'],
        'consumo_total' => $consumo_total,
        'deuda_total' => $deuda_total,
        'historial' => $historial
    ]);
} catch (Exception $e) {
    error_log('Error en api_consumos_paciente.php: ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
