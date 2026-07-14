<?php
require_once __DIR__ . '/init_api.php';
// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';
// --- Lógica principal ---
require_once "config.php";

error_reporting(E_ALL);

$method = $_SERVER['REQUEST_METHOD'];

/**
 * Obtiene entero positivo desde query string con límites seguros.
 */
function get_int_query_param(string $key, int $default, int $min = 1, int $max = 500): int {
    if (!isset($_GET[$key])) return $default;
    $value = filter_var($_GET[$key], FILTER_VALIDATE_INT);
    if ($value === false) return $default;
    if ($value < $min) return $min;
    if ($value > $max) return $max;
    return $value;
}

switch ($method) {
    case 'GET':
    $limite = get_int_query_param('limite', 0, 1, 500);
    $pagina = get_int_query_param('pagina', 1, 1, 1000000);
    $offset = ($pagina - 1) * $limite;

    // Buscar medicamentos por coincidencia
    if (isset($_GET['busqueda']) && strlen($_GET['busqueda']) > 1) {
        $busqueda = '%' . $_GET['busqueda'] . '%';
        if ($limite > 0) {
            $stmt = $conn->prepare("SELECT * FROM medicamentos WHERE nombre LIKE ? OR codigo LIKE ? ORDER BY nombre LIMIT ? OFFSET ?");
            $stmt->bind_param("ssii", $busqueda, $busqueda, $limite, $offset);
        } else {
            $stmt = $conn->prepare("SELECT * FROM medicamentos WHERE nombre LIKE ? OR codigo LIKE ? ORDER BY nombre");
            $stmt->bind_param("ss", $busqueda, $busqueda);
        }
        $stmt->execute();
        $result = $stmt->get_result();
        $medicamentos = [];
        while ($row = $result->fetch_assoc()) {
            $row['stock'] = isset($row['stock']) ? (int)$row['stock'] : 0;
            if (isset($row['fecha_vencimiento']) && $row['fecha_vencimiento']) {
                $row['fecha_vencimiento'] = date('Y-m-d', strtotime($row['fecha_vencimiento']));
            }
            $medicamentos[] = $row;
        }
        echo json_encode($medicamentos);
        $stmt->close();
        break;
    }
    // Si no hay búsqueda, devuelve toda la lista (opcional)
    $sql = "SELECT * FROM medicamentos ORDER BY nombre";
    if ($limite > 0) {
        $sql .= " LIMIT " . (int)$limite . " OFFSET " . (int)$offset;
    }
    $result = $conn->query($sql);
    $medicamentos = [];
    while ($row = $result->fetch_assoc()) {
        $row['stock'] = isset($row['stock']) ? (int)$row['stock'] : 0;
        if (isset($row['fecha_vencimiento']) && $row['fecha_vencimiento']) {
            $row['fecha_vencimiento'] = date('Y-m-d', strtotime($row['fecha_vencimiento']));
        }
        $medicamentos[] = $row;
    }
    echo json_encode($medicamentos);
    break;
    case 'POST':
        // Crear o actualizar medicamento
        $data = json_decode(file_get_contents('php://input'), true);
        if (isset($data['id'])) {
            // Actualizar
            $stmt = $conn->prepare("UPDATE medicamentos SET codigo=?, nombre=?, presentacion=?, concentracion=?, laboratorio=?, stock=?, unidades_por_caja=?, fecha_vencimiento=?, estado=?, precio_compra=?, margen_ganancia=? WHERE id=?");
            $stmt->bind_param("ssssssissddi", $data['codigo'], $data['nombre'], $data['presentacion'], $data['concentracion'], $data['laboratorio'], $data['stock'], $data['unidades_por_caja'], $data['fecha_vencimiento'], $data['estado'], $data['precio_compra'], $data['margen_ganancia'], $data['id']);
            $ok = $stmt->execute();
            echo json_encode(["success" => $ok]);
        } else {
            // Validar código único
            $stmt_check = $conn->prepare("SELECT id FROM medicamentos WHERE codigo = ?");
            $stmt_check->bind_param("s", $data['codigo']);
            $stmt_check->execute();
            $stmt_check->store_result();
            if ($stmt_check->num_rows > 0) {
                echo json_encode(["success" => false, "error" => "El código ya existe. Usa uno diferente."]);
                $stmt_check->close();
                break;
            }
            $stmt_check->close();
            // Crear
            $stmt = $conn->prepare("INSERT INTO medicamentos (codigo, nombre, presentacion, concentracion, laboratorio, stock, unidades_por_caja, fecha_vencimiento, estado, precio_compra, margen_ganancia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("ssssssissdd", $data['codigo'], $data['nombre'], $data['presentacion'], $data['concentracion'], $data['laboratorio'], $data['stock'], $data['unidades_por_caja'], $data['fecha_vencimiento'], $data['estado'], $data['precio_compra'], $data['margen_ganancia']);
            $ok = $stmt->execute();
            echo json_encode(["success" => $ok, "id" => $conn->insert_id]);
        }
        break;
    case 'DELETE':
        // Eliminar medicamento (leer JSON body)
        $data = json_decode(file_get_contents('php://input'), true);
        if (isset($data['id'])) {
            $stmt = $conn->prepare("DELETE FROM medicamentos WHERE id=?");
            $stmt->bind_param("i", $data['id']);
            $ok = $stmt->execute();
            echo json_encode(["success" => $ok]);
        } else {
            echo json_encode(["success" => false, "error" => "ID requerido"]);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(["error" => "Método no permitido"]);
}
