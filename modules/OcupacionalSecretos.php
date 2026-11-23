<?php
// Contraseñas de acceso de las empresas ocupacionales (RRHH y médico de la empresa).
//
// Dos modos, según el interruptor OCUP_PASSWORDS_VISIBLES de la instalación (db_ocupacional.php):
//  - SEGURO (por defecto): se guardan con password_hash(), la API nunca las devuelve y las heredadas en texto plano
//    se convierten a hash en su primer uso (login del portal).
//  - VISIBLES (transición, p. ej. 2 de Mayo): se guardan como antes (texto plano) para que el administrador pueda verlas
//    y entregarlas a la empresa. La API las devuelve SOLO a usuarios con rol administrador. No se convierte nada a hash.
// Pasar de VISIBLES a SEGURO es apagar el interruptor: las contraseñas existentes siguen sirviendo y se convierten al primer uso.
class OcupacionalSecretos {
    /** Modo de la instalación actual. */
    public static function visibles(): bool {
        return defined('OCUP_PASSWORDS_VISIBLES') && OCUP_PASSWORDS_VISIBLES === true;
    }

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

    /** Hay que reescribir el valor almacenado como hash. Nunca en modo VISIBLES (se perdería la contraseña que ve el administrador). */
    public static function requiereActualizar(string $almacenado, ?bool $visibles = null): bool {
        if ($almacenado === '' || ($visibles ?? self::visibles())) {
            return false;
        }
        return !self::esHash($almacenado) || password_needs_rehash($almacenado, PASSWORD_DEFAULT);
    }

    /**
     * Valor a guardar al editar: si viene vacía se conserva la actual (vacío = "no cambiar");
     * si viene una nueva se guarda con hash (modo SEGURO) o tal cual (modo VISIBLES).
     */
    public static function valorParaGuardar(string $enviada, string $actual, ?bool $visibles = null): string {
        $enviada = trim($enviada);
        if ($enviada === '') {
            return $actual;
        }
        return ($visibles ?? self::visibles()) ? $enviada : self::hashear($enviada);
    }

    /**
     * Qué devolver al navegador: la contraseña en claro solo si el modo es VISIBLES, quien consulta es administrador
     * y el valor almacenado es texto plano (un hash no se puede mostrar). En cualquier otro caso, vacío.
     */
    public static function paraMostrar(string $almacenado, bool $esAdministrador, ?bool $visibles = null): string {
        if (!($visibles ?? self::visibles()) || !$esAdministrador || self::esHash($almacenado)) {
            return '';
        }
        return $almacenado;
    }
}
