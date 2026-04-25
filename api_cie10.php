<?php
require_once __DIR__ . '/init_api.php';

require_once 'config.php';

function construirTerminoBooleano($termino) {
    $limpio = preg_replace('/[^\p{L}\p{N}\s\.\-]/u', ' ', (string)$termino);
    $tokens = preg_split('/\s+/u', trim($limpio));
    $tokens = array_values(array_filter($tokens, function ($t) {
        return mb_strlen($t, 'UTF-8') >= 2;
    }));

    if (empty($tokens)) {
        return '';
    }

    $tokens = array_slice($tokens, 0, 6);
    return implode(' ', array_map(function ($t) {
        return '+' . $t . '*';
    }, $tokens));
}

function pareceCodigoCIE10($termino) {
    $t = strtoupper(trim((string)$termino));
    // CIE-10 válido o prefijo de código: letra + al menos un dígito (ej: E1, E10, E10.9)
    return preg_match('/^[A-Z][0-9]{1,2}(?:\.[0-9A-Z]{0,4})?$/', $t) === 1;
}

// Función para buscar códigos CIE10
function buscarCIE10($conn, $termino, $limite = 20) {
    // Limpiar el término de búsqueda
    $termino = trim($termino);
    
    if (strlen($termino) < 2) {
        return [];
    }

    $inicio = microtime(true);
    $terminoUpper = strtoupper($termino);
    $esCodigo = pareceCodigoCIE10($termino);

    if ($esCodigo) {
        $sql = "
            SELECT
                id, codigo, nombre, categoria, subcategoria, descripcion
            FROM cie10
            WHERE activo = 1
              AND codigo LIKE ?
            ORDER BY
              CASE
                WHEN codigo = ? THEN 0
                WHEN codigo LIKE ? THEN 1
                ELSE 2
              END,
              codigo ASC
            LIMIT ?
        ";

        $stmt = $conn->prepare($sql);
        $codigoPrefijo = $terminoUpper . '%';
        $codigoExacto = $terminoUpper;
        $stmt->bind_param("sssi", $codigoPrefijo, $codigoExacto, $codigoPrefijo, $limite);
    } else {
        $sql = "
            SELECT
                id, codigo, nombre, categoria, subcategoria, descripcion,
                MATCH(nombre, descripcion) AGAINST(? IN BOOLEAN MODE) AS score
            FROM cie10
            WHERE activo = 1
              AND (
                MATCH(nombre, descripcion) AGAINST(? IN BOOLEAN MODE)
                OR nombre LIKE ?
                OR categoria LIKE ?
                OR subcategoria LIKE ?
              )
            ORDER BY
              CASE
                WHEN nombre LIKE ? THEN 0
                WHEN categoria LIKE ? THEN 1
                WHEN subcategoria LIKE ? THEN 2
                ELSE 3
              END,
              score DESC,
              codigo ASC
            LIMIT ?
        ";

        $stmt = $conn->prepare($sql);
        $booleano = construirTerminoBooleano($termino);
        if ($booleano === '') {
            $booleano = $termino;
        }
        $prefijo = $termino . '%';
        $stmt->bind_param("ssssssssi", $booleano, $booleano, $prefijo, $prefijo, $prefijo, $prefijo, $prefijo, $prefijo, $limite);
    }
    
    $stmt->execute();
    $resultado = $stmt->get_result();
    
    $codigos = [];
    while ($fila = $resultado->fetch_assoc()) {
        unset($fila['score']);
        $codigos[] = $fila;
    }
    
    $stmt->close();

    $duracionMs = (microtime(true) - $inicio) * 1000;
    if ($duracionMs > 120) {
        error_log('api_cie10.php búsqueda lenta: ' . round($duracionMs, 1) . 'ms | termino="' . $termino . '" | limite=' . $limite);
    }

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
    header('Cache-Control: private, max-age=30, stale-while-revalidate=60');
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
