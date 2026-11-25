<?php
// Privilegio para anular cotizaciones y eliminar consumos/ítems ya cobrados ("boletas" y atenciones).
// El administrador siempre puede. La recepcionista solo si el administrador le marcó el privilegio
// al crear o editar su usuario. Ningún otro rol puede.
final class PermisoAnulacion {
    public const CLAVE = 'anular_eliminar_atenciones';

    /** @param array<string,mixed>|null $usuario por defecto, el de la sesión */
    public static function permitido(?array $usuario = null): bool {
        $usuario = $usuario ?? ($_SESSION['usuario'] ?? null);
        if (!is_array($usuario)) {
            return false;
        }
        $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
        if ($rol === 'administrador') {
            return true;
        }
        if ($rol !== 'recepcionista') {
            return false;
        }
        $permisos = $usuario['permisos'] ?? [];
        if (is_string($permisos)) {
            $decodificado = json_decode($permisos, true);
            $permisos = is_array($decodificado) ? $decodificado : explode(',', $permisos);
        }
        if (!is_array($permisos)) {
            return false;
        }
        foreach ($permisos as $p) {
            if (trim((string)$p) === self::CLAVE) {
                return true;
            }
        }
        return false;
    }

    /**
     * Los permisos viven en la sesión PHP desde el login; si el administrador los cambia después,
     * una sesión abierta quedaría con los permisos viejos. Se relee rol y permisos desde la BD.
     */
    public static function refrescarSesion(\mysqli $conn): void {
        $id = (int)($_SESSION['usuario']['id'] ?? 0);
        if ($id <= 0) {
            return;
        }
        $stmt = $conn->prepare('SELECT rol, permisos FROM usuarios WHERE id = ? LIMIT 1');
        if (!$stmt) {
            return;
        }
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $fila = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($fila) {
            $_SESSION['usuario']['rol'] = $fila['rol'];
            $_SESSION['usuario']['permisos'] = $fila['permisos'] ?? '[]';
        }
    }

    /**
     * Sin el privilegio solo se puede tocar una cotización que aún no tiene ningún pago
     * (por ejemplo, cancelar una cita recién agendada antes de cobrarla).
     */
    public static function puedeSobreCotizacion(\mysqli $conn, int $cotizacionId): bool {
        self::refrescarSesion($conn);
        if (self::permitido()) {
            return true;
        }
        $stmt = $conn->prepare("SELECT LOWER(TRIM(COALESCE(estado, ''))) AS estado FROM cotizaciones WHERE id = ? LIMIT 1");
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $fila = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$fila || $fila['estado'] !== 'pendiente') {
            return false;
        }
        $existe = $conn->query("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cotizacion_movimientos' LIMIT 1");
        if (!$existe || $existe->num_rows === 0) {
            return true;
        }
        $stmt = $conn->prepare('SELECT 1 FROM cotizacion_movimientos WHERE cotizacion_id = ? AND cobro_id IS NOT NULL LIMIT 1');
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $conPagos = (bool)$stmt->get_result()->fetch_assoc();
        $stmt->close();
        return !$conPagos;
    }
}
