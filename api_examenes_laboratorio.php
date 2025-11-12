
<?php
require_once __DIR__ . '/init_api.php';
// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';

// --- Lógica principal ---
require_once "config.php";

// Helper: normalizar valores_referenciales recibidos desde frontend
function normalize_valores_referenciales($raw) {
    if (!$raw) return json_encode([] , JSON_UNESCAPED_UNICODE);
    if (is_string($raw)) {
        $parsed = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return json_encode([], JSON_UNESCAPED_UNICODE);
        }
        $raw = $parsed;
    }
    if (!is_array($raw)) return json_encode([], JSON_UNESCAPED_UNICODE);
    $items = [];
    foreach ($raw as $idx => $it) {
        if (!is_array($it)) continue;
        $item = [];
        $item['tipo'] = $it['tipo'] ?? 'Parámetro';
        $item['nombre'] = $it['nombre'] ?? ($it['titulo'] ?? ('Item ' . ($idx + 1)));
        $item['metodologia'] = $it['metodologia'] ?? '';
        $item['unidad'] = $it['unidad'] ?? '';
    $item['opciones'] = (isset($it['opciones']) && is_array($it['opciones'])) ? $it['opciones'] : [];
        $item['referencias'] = [];
        if (isset($it['referencias']) && is_array($it['referencias'])) {
            foreach ($it['referencias'] as $r) {
                if (!is_array($r)) continue;
                $item['referencias'][] = [
                    'valor' => $r['valor'] ?? '',
                    'valor_min' => $r['valor_min'] ?? '',
                    'valor_max' => $r['valor_max'] ?? '',
                    'desc' => $r['desc'] ?? ''
                ];
            }
        }
        $item['formula'] = $it['formula'] ?? '';
        $item['negrita'] = !empty($it['negrita']) ? true : false;
        $item['color_texto'] = $it['color_texto'] ?? '#000000';
        $item['color_fondo'] = $it['color_fondo'] ?? '#ffffff';
        $item['orden'] = isset($it['orden']) && is_numeric($it['orden']) ? intval($it['orden']) : ($idx + 1);
        $items[] = $item;
    }
    return json_encode($items, JSON_UNESCAPED_UNICODE);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit();
}

switch ($method) {
    case 'GET':
        // Listar todos los exámenes activos
        $sql = "SELECT * FROM examenes_laboratorio WHERE activo = 1 ORDER BY nombre";
        $result = $conn->query($sql);
        $examenes = [];
        while ($row = $result->fetch_assoc()) {
            // Decodificar el campo JSON si existe
            if (isset($row['valores_referenciales']) && $row['valores_referenciales']) {
                $row['valores_referenciales'] = json_decode($row['valores_referenciales'], true);
            } else {
                $row['valores_referenciales'] = [];
            }
            $examenes[] = $row;
        }
        echo json_encode(["success" => true, "examenes" => $examenes]);
        break;
    case 'POST':
        // Crear nuevo examen
        $data = json_decode(file_get_contents('php://input'), true);
        $nombre = $data['nombre'] ?? null;
        // Validaciones básicas
        if (!$nombre || trim($nombre) === '') {
            echo json_encode(["success" => false, "error" => "El campo 'nombre' es obligatorio"]);
            break;
        }
        $categoria = $data['categoria'] ?? null;
        $metodologia = $data['metodologia'] ?? null;
    $valores_referenciales = normalize_valores_referenciales($data['valores_referenciales'] ?? null);
        $precio_publico = $data['precio_publico'] !== "" ? $data['precio_publico'] : null;
        $precio_convenio = $data['precio_convenio'] !== "" ? $data['precio_convenio'] : null;
        $tipo_tubo = $data['tipo_tubo'] ?? null;
        $tipo_frasco = $data['tipo_frasco'] ?? null;
        $tiempo_resultado = $data['tiempo_resultado'] ?? null;
        $condicion_paciente = $data['condicion_paciente'] ?? null;
        $preanalitica = $data['preanalitica'] ?? null;
        $stmt = $conn->prepare("INSERT INTO examenes_laboratorio (nombre, categoria, metodologia, valores_referenciales, precio_publico, precio_convenio, tipo_tubo, tipo_frasco, tiempo_resultado, condicion_paciente, preanalitica, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
        $stmt->bind_param(
            "ssssddsssss",
            $nombre,
            $categoria,
            $metodologia,
            $valores_referenciales,
            $precio_publico,
            $precio_convenio,
            $tipo_tubo,
            $tipo_frasco,
            $tiempo_resultado,
            $condicion_paciente,
            $preanalitica
        );
        $ok = $stmt->execute();
        if ($ok) echo json_encode(["success" => true]);
        else echo json_encode(["success" => false, "error" => $stmt->error ?? 'Error al guardar']);
        break;
    case 'PUT':
        // Actualizar examen
        $data = json_decode(file_get_contents('php://input'), true);
        $nombre = $data['nombre'] ?? null;
        // Validaciones básicas
        if (!$nombre || trim($nombre) === '') {
            echo json_encode(["success" => false, "error" => "El campo 'nombre' es obligatorio"]);
            break;
        }
        $categoria = $data['categoria'] ?? null;
        $metodologia = $data['metodologia'] ?? null;
    $valores_referenciales = normalize_valores_referenciales($data['valores_referenciales'] ?? null);
        $precio_publico = $data['precio_publico'] !== "" ? $data['precio_publico'] : null;
        $precio_convenio = $data['precio_convenio'] !== "" ? $data['precio_convenio'] : null;
        $tipo_tubo = $data['tipo_tubo'] ?? null;
        $tipo_frasco = $data['tipo_frasco'] ?? null;
        $tiempo_resultado = $data['tiempo_resultado'] ?? null;
        $condicion_paciente = $data['condicion_paciente'] ?? null;
        $preanalitica = $data['preanalitica'] ?? null;
        $id = $data['id'];
        $stmt = $conn->prepare("UPDATE examenes_laboratorio SET nombre=?, categoria=?, metodologia=?, valores_referenciales=?, precio_publico=?, precio_convenio=?, tipo_tubo=?, tipo_frasco=?, tiempo_resultado=?, condicion_paciente=?, preanalitica=? WHERE id=?");
        $stmt->bind_param(
            "ssssddsssssi",
            $nombre,
            $categoria,
            $metodologia,
            $valores_referenciales,
            $precio_publico,
            $precio_convenio,
            $tipo_tubo,
            $tipo_frasco,
            $tiempo_resultado,
            $condicion_paciente,
            $preanalitica,
            $id
        );
    $ok = $stmt->execute();
    if ($ok) echo json_encode(["success" => true]);
    else echo json_encode(["success" => false, "error" => $stmt->error ?? 'Error al actualizar']);
        break;
    case 'DELETE':
        // Eliminar (desactivar) examen
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $conn->prepare("UPDATE examenes_laboratorio SET activo=0 WHERE id=?");
            $stmt->bind_param("i", $id);
            $ok = $stmt->execute();
            echo json_encode(["success" => $ok]);
        } else {
            echo json_encode(["success" => false, "error" => "ID requerido"]);
        }
        break;
    default:
        echo json_encode(["success" => false, "error" => "Método no soportado"]);
}
$conn->close();
