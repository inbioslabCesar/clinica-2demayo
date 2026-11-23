<?php
// Comprobaciones de esquema para columnas opcionales de las tablas clínicas que usa salud ocupacional.
// El esquema clínico base no incluye algunas columnas del sistema ocupacional original (p. ej. medicos.rna);
// las consultas deben seguir funcionando sin ellas.
class OcupacionalEsquema {
    private static array $cache = [];

    public static function columnaExiste($conn, string $tabla, string $columna): bool {
        $clave = spl_object_id($conn) . '|' . $tabla . '|' . $columna;
        if (isset(self::$cache[$clave])) {
            return self::$cache[$clave];
        }
        $existe = false;
        if ($conn instanceof mysqli) {
            $stmt = $conn->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1');
            if ($stmt) {
                $stmt->bind_param('ss', $tabla, $columna);
                $stmt->execute();
                $existe = $stmt->get_result()->num_rows > 0;
                $stmt->close();
            }
        }
        return self::$cache[$clave] = $existe;
    }

    /** Expresión SQL para leer medicos.rna: la columna si existe o '' (vacío) si no. */
    public static function exprMedicosRna($conn): string {
        return self::columnaExiste($conn, 'medicos', 'rna') ? 'rna' : "'' AS rna";
    }
}
