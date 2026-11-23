<?php
// Usuario de la petición para las APIs de salud ocupacional.
//
// En este sistema el médico inicia sesión por api_login_medico.php y su sesión queda separada
// ($_SESSION['medico_id'] / $_SESSION['medico'], sin $_SESSION['usuario']). El módulo ocupacional se escribió esperando
// al médico dentro de $_SESSION['usuario'] con rol 'medico'. Este adaptador entrega esa misma forma SIN modificar la sesión
// (no se escribe nada en $_SESSION, así el login clínico y sus controles siguen igual).
class OcupacionalSesion {
    /** @return array|null datos del usuario (con 'rol') o null si no hay sesión */
    public static function usuario(): ?array {
        $usuario = $_SESSION['usuario'] ?? null;
        if (is_array($usuario)) {
            return $usuario;
        }
        $medicoId = (int) ($_SESSION['medico_id'] ?? 0);
        $medico = $_SESSION['medico'] ?? null;
        if ($medicoId > 0 && is_array($medico)) {
            return [
                'id' => $medicoId,
                'medico_id' => $medicoId,
                'usuario' => (string) ($medico['email'] ?? ''),
                'nombre' => trim((string) ($medico['nombre'] ?? '') . ' ' . (string) ($medico['apellido'] ?? '')),
                'rol' => 'medico',
                'permisos' => [],
            ];
        }
        return null;
    }
}
