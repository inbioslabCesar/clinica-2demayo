<?php
/**
 * API de Tema Visual del Sistema
 * 
 * Responsabilidad única: lectura y escritura de la configuración de tema.
 * Separado de api_configuracion.php para cumplir Interface Segregation.
 *
 * GET  → devuelve tema activo (público, sin auth requerido para hidratar rápido)
 * POST → guarda tema (solo administrador)
 */
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ── Helpers ──────────────────────────────────────────────────────────────

function respond_tema($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensure_tema_columns($pdo) {
    static $checked = false;
    if ($checked) return;
    $checked = true;

    $needed = [
        'tema_preset'        => "VARCHAR(30) NOT NULL DEFAULT 'purple'",
        'tema_primary'       => "VARCHAR(7) NOT NULL DEFAULT '#7c3aed'",
        'tema_primary_dark'  => "VARCHAR(7) NOT NULL DEFAULT '#5b21b6'",
        'tema_primary_light' => "VARCHAR(7) NOT NULL DEFAULT '#ede9fe'",
        'tema_secondary'     => "VARCHAR(7) NOT NULL DEFAULT '#4338ca'",
        'tema_accent'        => "VARCHAR(7) NOT NULL DEFAULT '#6366f1'",
        'tema_navbar_bg'     => "VARCHAR(7) NOT NULL DEFAULT '#6b21a8'",
        'tema_sidebar_from'  => "VARCHAR(7) NOT NULL DEFAULT '#9333ea'",
        'tema_sidebar_via'   => "VARCHAR(7) NOT NULL DEFAULT '#7e22ce'",
        'tema_sidebar_to'    => "VARCHAR(7) NOT NULL DEFAULT '#3730a3'",
        'tema_login_from'    => "VARCHAR(7) NOT NULL DEFAULT '#1e3a8a'",
        'tema_login_via'     => "VARCHAR(7) NOT NULL DEFAULT '#6b21a8'",
        'tema_login_to'      => "VARCHAR(7) NOT NULL DEFAULT '#312e81'",
        'tema_public_layout' => "VARCHAR(20) NOT NULL DEFAULT 'classic'",
    ];

    foreach ($needed as $col => $definition) {
        $stmt = $pdo->query("SHOW COLUMNS FROM configuracion_clinica LIKE '$col'");
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE configuracion_clinica ADD COLUMN $col $definition");
        }
    }
}

function validate_hex($val) {
    return is_string($val) && preg_match('/^#[0-9a-fA-F]{6}$/', $val);
}

// Paletas predefinidas (Open/Closed: agregar nueva paleta = solo agregar un entry aquí)
function get_presets() {
    return [
        'purple' => [
            'label'         => 'Púrpura',
            'primary'       => '#7c3aed',
            'primary_dark'  => '#5b21b6',
            'primary_light' => '#ede9fe',
            'secondary'     => '#4338ca',
            'accent'        => '#6366f1',
            'navbar_bg'     => '#6b21a8',
            'sidebar_from'  => '#9333ea',
            'sidebar_via'   => '#7e22ce',
            'sidebar_to'    => '#3730a3',
            'login_from'    => '#1e3a8a',
            'login_via'     => '#6b21a8',
            'login_to'      => '#312e81',
        ],
        'blue' => [
            'label'         => 'Azul',
            'primary'       => '#2563eb',
            'primary_dark'  => '#1d4ed8',
            'primary_light' => '#dbeafe',
            'secondary'     => '#1e40af',
            'accent'        => '#3b82f6',
            'navbar_bg'     => '#1e40af',
            'sidebar_from'  => '#2563eb',
            'sidebar_via'   => '#1d4ed8',
            'sidebar_to'    => '#1e3a8a',
            'login_from'    => '#1e3a8a',
            'login_via'     => '#1e40af',
            'login_to'      => '#172554',
        ],
        'green' => [
            'label'         => 'Verde',
            'primary'       => '#059669',
            'primary_dark'  => '#047857',
            'primary_light' => '#d1fae5',
            'secondary'     => '#065f46',
            'accent'        => '#10b981',
            'navbar_bg'     => '#065f46',
            'sidebar_from'  => '#059669',
            'sidebar_via'   => '#047857',
            'sidebar_to'    => '#064e3b',
            'login_from'    => '#064e3b',
            'login_via'     => '#065f46',
            'login_to'      => '#022c22',
        ],
        'red' => [
            'label'         => 'Rojo',
            'primary'       => '#dc2626',
            'primary_dark'  => '#b91c1c',
            'primary_light' => '#fee2e2',
            'secondary'     => '#991b1b',
            'accent'        => '#ef4444',
            'navbar_bg'     => '#991b1b',
            'sidebar_from'  => '#dc2626',
            'sidebar_via'   => '#b91c1c',
            'sidebar_to'    => '#7f1d1d',
            'login_from'    => '#7f1d1d',
            'login_via'     => '#991b1b',
            'login_to'      => '#450a0a',
        ],
        'teal' => [
            'label'         => 'Turquesa',
            'primary'       => '#0d9488',
            'primary_dark'  => '#0f766e',
            'primary_light' => '#ccfbf1',
            'secondary'     => '#115e59',
            'accent'        => '#14b8a6',
            'navbar_bg'     => '#115e59',
            'sidebar_from'  => '#0d9488',
            'sidebar_via'   => '#0f766e',
            'sidebar_to'    => '#134e4a',
            'login_from'    => '#134e4a',
            'login_via'     => '#115e59',
            'login_to'      => '#042f2e',
        ],
        'orange' => [
            'label'         => 'Naranja',
            'primary'       => '#ea580c',
            'primary_dark'  => '#c2410c',
            'primary_light' => '#ffedd5',
            'secondary'     => '#9a3412',
            'accent'        => '#f97316',
            'navbar_bg'     => '#9a3412',
            'sidebar_from'  => '#ea580c',
            'sidebar_via'   => '#c2410c',
            'sidebar_to'    => '#7c2d12',
            'login_from'    => '#7c2d12',
            'login_via'     => '#9a3412',
            'login_to'      => '#431407',
        ],
        'pink' => [
            'label'         => 'Rosado',
            'primary'       => '#db2777',
            'primary_dark'  => '#be185d',
            'primary_light' => '#fce7f3',
            'secondary'     => '#9d174d',
            'accent'        => '#ec4899',
            'navbar_bg'     => '#9d174d',
            'sidebar_from'  => '#db2777',
            'sidebar_via'   => '#be185d',
            'sidebar_to'    => '#831843',
            'login_from'    => '#831843',
            'login_via'     => '#9d174d',
            'login_to'      => '#500724',
        ],
        'femcare' => [
            'label'         => 'FemCare',
            'primary'       => '#E85D8E',
            'primary_dark'  => '#3A4FA3',
            'primary_light' => '#fce7f3',
            'secondary'     => '#3A4FA3',
            'accent'        => '#A084DC',
            'navbar_bg'     => '#3A4FA3',
            'sidebar_from'  => '#E85D8E',
            'sidebar_via'   => '#A084DC',
            'sidebar_to'    => '#3A4FA3',
            'login_from'    => '#f8cdda',
            'login_via'     => '#c2e9fb',
            'login_to'      => '#e0c3fc',
        ],
        'slate' => [
            'label'         => 'Gris Oscuro',
            'primary'       => '#475569',
            'primary_dark'  => '#334155',
            'primary_light' => '#f1f5f9',
            'secondary'     => '#1e293b',
            'accent'        => '#64748b',
            'navbar_bg'     => '#1e293b',
            'sidebar_from'  => '#475569',
            'sidebar_via'   => '#334155',
            'sidebar_to'    => '#1e293b',
            'login_from'    => '#0f172a',
            'login_via'     => '#1e293b',
            'login_to'      => '#020617',
        ],
    ];
}

// ── Main ─────────────────────────────────────────────────────────────────

try {
    ensure_tema_columns($pdo);

    if ($method === 'GET') {
        // Público: devolver tema sin requerir autenticación para hidratación rápida
        $stmt = $pdo->query("
            SELECT tema_preset, tema_primary, tema_primary_dark, tema_primary_light,
                   tema_secondary, tema_accent, tema_navbar_bg,
                   tema_sidebar_from, tema_sidebar_via, tema_sidebar_to,
                   tema_login_from, tema_login_via, tema_login_to,
                   tema_public_layout
            FROM configuracion_clinica
            ORDER BY created_at DESC LIMIT 1
        ");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            $presets = get_presets();
            $row = array_merge(['tema_preset' => 'purple'], array_map(fn($v) => $v, array_combine(
                array_map(fn($k) => "tema_$k", array_keys($presets['purple'])),
                array_values($presets['purple'])
            )));
            unset($row['tema_label']);
        }

        respond_tema([
            'success' => true,
            'tema'    => $row,
            'presets' => get_presets(),
        ]);
    }

    if ($method === 'POST') {
        // Solo administradores pueden cambiar el tema
        if (!isset($_SESSION['usuario']) || ($_SESSION['usuario']['rol'] ?? '') !== 'administrador') {
            respond_tema(['success' => false, 'error' => 'Acceso denegado'], 403);
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            respond_tema(['success' => false, 'error' => 'Datos inválidos'], 400);
        }

        $preset = trim((string)($input['preset'] ?? 'custom'));
        $public_layout = trim((string)($input['public_layout'] ?? ''));
        $presets = get_presets();

        // Si eligió un preset, tomar sus valores
        if ($preset !== 'custom' && isset($presets[$preset])) {
            $p = $presets[$preset];
            $values = [
                'tema_preset'        => $preset,
                'tema_primary'       => $p['primary'],
                'tema_primary_dark'  => $p['primary_dark'],
                'tema_primary_light' => $p['primary_light'],
                'tema_secondary'     => $p['secondary'],
                'tema_accent'        => $p['accent'],
                'tema_navbar_bg'     => $p['navbar_bg'],
                'tema_sidebar_from'  => $p['sidebar_from'],
                'tema_sidebar_via'   => $p['sidebar_via'],
                'tema_sidebar_to'    => $p['sidebar_to'],
                'tema_login_from'    => $p['login_from'],
                'tema_login_via'     => $p['login_via'],
                'tema_login_to'      => $p['login_to'],
            ];
        } else {
            // Custom: validar cada hex
            $fields = [
                'primary', 'primary_dark', 'primary_light', 'secondary', 'accent',
                'navbar_bg', 'sidebar_from', 'sidebar_via', 'sidebar_to',
                'login_from', 'login_via', 'login_to',
            ];
            $values = ['tema_preset' => 'custom'];
            foreach ($fields as $f) {
                $val = trim((string)($input[$f] ?? ''));
                if (!validate_hex($val)) {
                    respond_tema(['success' => false, 'error' => "Color inválido para $f: $val"], 400);
                }
                $values["tema_$f"] = $val;
            }
        }

        // Actualizar layout público si se envió
        if (in_array($public_layout, ['classic', 'landing'], true)) {
            $values['tema_public_layout'] = $public_layout;
        }

        // Construir UPDATE dinámico
        $sets = [];
        $params = [];
        foreach ($values as $col => $val) {
            $sets[] = "$col = ?";
            $params[] = $val;
        }
        $sets[] = "updated_at = CURRENT_TIMESTAMP";

        $stmt = $pdo->prepare("UPDATE configuracion_clinica SET " . implode(', ', $sets) . " WHERE id = (SELECT id FROM (SELECT id FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1) AS t)");
        $stmt->execute($params);

        respond_tema([
            'success' => true,
            'message' => 'Tema actualizado',
            'tema'    => $values,
        ]);
    }

    respond_tema(['success' => false, 'error' => 'Método no permitido'], 405);

} catch (Exception $e) {
    error_log('api_tema.php error: ' . $e->getMessage());
    respond_tema(['success' => false, 'error' => 'Error interno del servidor'], 500);
}
