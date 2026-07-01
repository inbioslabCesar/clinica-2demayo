<?php
// Establecer $_SERVER['REQUEST_METHOD'] para POST
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'application/json';

// Iniciar sesión ANTES de incluir init_api.php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Si no hay sesión válida, simularla
if (empty($_SESSION['usuario'])) {
    $_SESSION['usuario'] = [
        'id' => 1,
        'usuario' => 'admin',
        'nombre' => 'Admin',
        'apellido' => 'Usuario',
        'email' => 'admin@clinica.local',
        'rol' => 'administrador'
    ];
}

// Crear un stream virtual para php://input
$postData = json_encode(['informe_id' => 1, 'regenerar' => true]);

// Usar una estrategia de stream wrapper para simular php://input
class StringInputStream {
    private $data;
    private $pos = 0;
    
    public function __construct($data) {
        $this->data = $data;
    }
    
    public function stream_open($path, $mode, $options, &$opened_path) {
        return true;
    }
    
    public function stream_read($count) {
        $ret = substr($this->data, $this->pos, $count);
        $this->pos += strlen($ret);
        return $ret;
    }
    
    public function stream_eof() {
        return $this->pos >= strlen($this->data);
    }
    
    public function stream_tell() {
        return $this->pos;
    }
    
    public function stream_seek($offset, $whence = SEEK_SET) {
        $this->pos = $offset;
        return true;
    }
}

// Registrar el protocolo personalizado
stream_wrapper_register("customstring", "StringInputStream");

// Mock file_get_contents para php://input
$GLOBALS['mock_php_input'] = $postData;

// Incluir init_api.php y el endpoint, pero mockear file_get_contents si es necesario
$originalGetContents = 'file_get_contents';
if (!function_exists('file_get_contents_override')) {
    eval('
    function file_get_contents_override($filename, $use_include_path = false, $context = null) {
        if ($filename === "php://input") {
            return $GLOBALS["mock_php_input"];
        }
        return file_get_contents($filename, $use_include_path, $context);
    }
    ');
    
    // Temporalmente reemplazar en el scope global
    $GLOBALS["original_file_get_contents"] = "file_get_contents";
}

// Simpler approach: directamente parsear el JSON y ponerlo en $_POST y $_REQUEST
$parsed = json_decode($postData, true);
$_POST = array_merge($_POST ?? [], $parsed ?? []);
$_REQUEST = array_merge($_REQUEST ?? [], $parsed ?? []);

// Incluir el endpoint
require_once __DIR__ . '/../api_imagenologia_generar_pdf.php';
?>
