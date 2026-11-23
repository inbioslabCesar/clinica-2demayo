<?php
// Contraseñas de acceso de las empresas ocupacionales (RRHH y médico de la empresa).
//
// Antes se guardaban en texto plano y la API las devolvía al navegador. Ahora:
//  - se guardan con password_hash();
//  - las existentes en texto plano siguen funcionando y se convierten a hash en su primer uso (login) o
//    en bloque con scripts/hashear_passwords_empresas_ocupacionales.php;
//  - la API nunca las devuelve (solo indica si hay una definida).
class OcupacionalSecretos {
    /** @return bool true si el valor almacenado ya es un hash de password_hash() */
    public static function esHash(string $almacenado): bool {
        $info = password_get_info($almacenado);
        return (int)($info['algo'] ?? 0) !== 0 && $almacenado !== '';
    }

    public static function hashear(string $plano): string {
        return password_hash($plano, PASSWORD_DEFAULT);
    }

    /** Verifica contra un hash o, por compatibilidad, contra una contraseña heredada en texto plano. */
    public static function verificar(string $ingresada, string $almacenado): bool {
        if ($ingresada === '' || $almacenado === '') {
            return false;
        }
        if (self::esHash($almacenado)) {
            return password_verify($ingresada, $almacenado);
        }
        return hash_equals($almacenado, $ingresada);
    }

    /** Hay que reescribir el valor almacenado como hash (era texto plano o el algoritmo quedó viejo). */
    public static function requiereActualizar(string $almacenado): bool {
        if ($almacenado === '') {
            return false;
        }
        return !self::esHash($almacenado) || password_needs_rehash($almacenado, PASSWORD_DEFAULT);
    }

    /**
     * Valor a guardar al editar: si se envió una contraseña nueva se hashea; si viene vacía se conserva la actual
     * (el formulario ya no recibe la contraseña, así que vacío significa "no cambiar").
     */
    public static function valorParaGuardar(string $enviada, string $actual): string {
        $enviada = trim($enviada);
        if ($enviada === '') {
            return $actual;
        }
        return self::hashear($enviada);
    }
}
