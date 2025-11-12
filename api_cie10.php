<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '.clinica2demayo.com',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Capturar errores fatales y enviar JSON con CORS
set_exception_handler(function($e) use ($origin, $allowedOrigins) {
    http_response_code(500);
    if (in_array($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Credentials: true');
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
    exit();
});
header('Content-Type: application/json');
require_once 'config.php';

// Función para buscar códigos CIE10
function buscarCIE10($conn, $termino, $limite = 20) {
    // Limpiar el término de búsqueda
    $termino = trim($termino);
    
    if (strlen($termino) < 2) {
        return [];
    }
    
    // Preparar la consulta con MATCH AGAINST para búsqueda de texto completo
    // y LIKE para búsqueda por código
    $sql = "
        SELECT 
            id, codigo, nombre, categoria, subcategoria, descripcion
        FROM cie10 
        WHERE activo = 1 
        AND (
            codigo LIKE ? 
            OR nombre LIKE ? 
            OR categoria LIKE ?
            OR MATCH(nombre, descripcion) AGAINST(? IN NATURAL LANGUAGE MODE)
        )
        ORDER BY 
            CASE 
                WHEN codigo LIKE ? THEN 1
                WHEN nombre LIKE ? THEN 2
                WHEN categoria LIKE ? THEN 3
                ELSE 4
            END,
            codigo ASC
        LIMIT ?
    ";
    
    $stmt = $conn->prepare($sql);
    
    $termino_like = "%{$termino}%";
    $codigo_like = "{$termino}%";
    
    $stmt->bind_param(
        "sssssssi", 
        $codigo_like,      // código LIKE
        $termino_like,     // nombre LIKE  
        $termino_like,     // categoria LIKE
        $termino,          // MATCH AGAINST
        $codigo_like,      // ORDER BY código
        $termino_like,     // ORDER BY nombre
        $termino_like,     // ORDER BY categoria
        $limite
    );
    
    $stmt->execute();
    $resultado = $stmt->get_result();
    
    $codigos = [];
    while ($fila = $resultado->fetch_assoc()) {
        $codigos[] = $fila;
    }
    
    $stmt->close();
    return $codigos;
}

// Función para obtener un código específico por ID
function obtenerCIE10PorId($conn, $id) {
    $sql = "SELECT * FROM cie10 WHERE id = ? AND activo = 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $resultado = $stmt->get_result();
    $codigo = $resultado->fetch_assoc();
    $stmt->close();
    return $codigo;
}

// Función para obtener códigos por categoría
function obtenerCIE10PorCategoria($conn, $categoria, $limite = 50) {
    $sql = "SELECT * FROM cie10 WHERE categoria LIKE ? AND activo = 1 ORDER BY codigo ASC LIMIT ?";
    $stmt = $conn->prepare($sql);
    $categoria_like = "%{$categoria}%";
    $stmt->bind_param("si", $categoria_like, $limite);
    $stmt->execute();
    $resultado = $stmt->get_result();
    
    $codigos = [];
    while ($fila = $resultado->fetch_assoc()) {
        $codigos[] = $fila;
    }
    
    $stmt->close();
    return $codigos;
}

try {
    $metodo = $_SERVER['REQUEST_METHOD'];
    
    if ($metodo === 'GET') {
        if (isset($_GET['buscar'])) {
            // Buscar códigos CIE10
            $termino = $_GET['buscar'];
            $limite = isset($_GET['limite']) ? min(100, max(1, intval($_GET['limite']))) : 20;
            
            $resultados = buscarCIE10($conn, $termino, $limite);
            
            echo json_encode([
                'success' => true,
                'data' => $resultados,
                'total' => count($resultados),
                'termino' => $termino
            ], JSON_UNESCAPED_UNICODE);
            
        } elseif (isset($_GET['id'])) {
            // Obtener código específico por ID
            $id = intval($_GET['id']);
            $codigo = obtenerCIE10PorId($conn, $id);
            
            if ($codigo) {
                echo json_encode([
                    'success' => true,
                    'data' => $codigo
                ], JSON_UNESCAPED_UNICODE);
            } else {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Código CIE10 no encontrado'
                ], JSON_UNESCAPED_UNICODE);
            }
            
        } elseif (isset($_GET['categoria'])) {
            // Obtener códigos por categoría
            $categoria = $_GET['categoria'];
            $limite = isset($_GET['limite']) ? min(100, max(1, intval($_GET['limite']))) : 50;
            
            $resultados = obtenerCIE10PorCategoria($conn, $categoria, $limite);
            
            echo json_encode([
                'success' => true,
                'data' => $resultados,
                'total' => count($resultados),
                'categoria' => $categoria
            ], JSON_UNESCAPED_UNICODE);
            
        } else {
            // Obtener estadísticas generales
            $sql_stats = "
                SELECT 
                    COUNT(*) as total,
                    COUNT(DISTINCT categoria) as categorias,
                    COUNT(DISTINCT subcategoria) as subcategorias
                FROM cie10 
                WHERE activo = 1
            ";
            
            $resultado = $conn->query($sql_stats);
            $stats = $resultado->fetch_assoc();
            
            echo json_encode([
                'success' => true,
                'message' => 'API CIE10 funcionando correctamente',
                'estadisticas' => $stats,
                'endpoints' => [
                    'buscar' => '/api_cie10.php?buscar=termino&limite=20',
                    'por_id' => '/api_cie10.php?id=123',
                    'por_categoria' => '/api_cie10.php?categoria=respiratorias&limite=50'
                ]
            ], JSON_UNESCAPED_UNICODE);
        }
        
    } else {
        http_response_code(405);
        echo json_encode([
            'success' => false,
            'message' => 'Método no permitido'
        ], JSON_UNESCAPED_UNICODE);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error interno del servidor: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}

$conn->close();
?>
