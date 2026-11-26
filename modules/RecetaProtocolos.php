<?php

/**
 * Reglas de los protocolos de receta (api_receta_protocolos.php).
 *
 * Alcance: 'medico' (personal), 'especialidad' (médicos de esa especialidad) o 'general' (todos los médicos).
 * - Ver: los personales solo su médico; los de especialidad y generales según el contexto de la consulta.
 * - Editar: los compartidos los edita cualquier médico (o el administrador); los personales solo su dueño o el administrador.
 * - Eliminar / cambiar el alcance: administrador, dueño (personales) o autor (compartidos). Un compartido sin autor registrado
 *   (creado antes de existir la marca) solo lo gestiona el administrador.
 *
 * $actor = ['admin' => bool, 'gestiona' => bool (administrador o médico), 'medico_id' => int, 'usuario_id' => int]
 */
final class RecetaProtocolos {
    public const ALCANCES = ['medico', 'especialidad', 'general'];
    public const MAX_ITEMS = 60;

    public static function alcance($medicoId, $especialidad): string {
        if ((int)$medicoId > 0) {
            return 'medico';
        }
        return trim((string)$especialidad) !== '' ? 'especialidad' : 'general';
    }

    public static function normalizarAlcance($valor): string {
        $v = strtolower(trim((string)$valor));
        return in_array($v, self::ALCANCES, true) ? $v : 'medico';
    }

    public static function esDuenio(array $p, array $actor): bool {
        return (int)($p['medico_id'] ?? 0) > 0 && (int)($p['medico_id'] ?? 0) === (int)($actor['medico_id'] ?? 0);
    }

    public static function esAutor(array $p, array $actor): bool {
        $medicoAutor = (int)($p['autor_medico_id'] ?? 0);
        $usuarioAutor = (int)($p['creado_por'] ?? 0);
        return ($medicoAutor > 0 && $medicoAutor === (int)($actor['medico_id'] ?? 0))
            || ($usuarioAutor > 0 && $usuarioAutor === (int)($actor['usuario_id'] ?? 0));
    }

    public static function puedeEditar(array $p, array $actor): bool {
        if (empty($actor['gestiona'])) {
            return false;
        }
        if (!empty($actor['admin'])) {
            return true;
        }
        $alcance = self::alcance($p['medico_id'] ?? null, $p['especialidad'] ?? '');
        return $alcance === 'medico' ? self::esDuenio($p, $actor) : true;
    }

    public static function puedeEliminar(array $p, array $actor): bool {
        if (empty($actor['gestiona'])) {
            return false;
        }
        if (!empty($actor['admin'])) {
            return true;
        }
        $alcance = self::alcance($p['medico_id'] ?? null, $p['especialidad'] ?? '');
        return $alcance === 'medico' ? self::esDuenio($p, $actor) : self::esAutor($p, $actor);
    }

    /** Cambiar el alcance equivale a decidir quién lo ve: la misma regla que eliminar. */
    public static function puedeCambiarAlcance(array $p, array $actor): bool {
        return self::puedeEliminar($p, $actor);
    }

    /** Mismo criterio de visibilidad que el listado, para validar editar/eliminar en el servidor. */
    public static function visibleEn(array $p, int $medicoId, string $especialidadNorm): bool {
        $pMedico = (int)($p['medico_id'] ?? 0);
        if ($pMedico > 0) {
            return $pMedico === $medicoId;
        }
        $pEsp = self::minusculas($p['especialidad'] ?? '');
        return $pEsp === '' || $pEsp === $especialidadNorm;
    }

    /** Items válidos del protocolo: arreglos con nombre, en el orden recibido y con un tope. */
    public static function limpiarItems($items): array {
        if (!is_array($items)) {
            return [];
        }
        $out = [];
        foreach ($items as $it) {
            if (!is_array($it) || trim((string)($it['nombre'] ?? '')) === '') {
                continue;
            }
            $out[] = $it;
            if (count($out) >= self::MAX_ITEMS) {
                break;
            }
        }
        return $out;
    }

    public static function minusculas($txt): string {
        $txt = trim((string)$txt);
        if ($txt === '') {
            return '';
        }
        return function_exists('mb_strtolower') ? mb_strtolower($txt, 'UTF-8') : strtolower($txt);
    }
}
