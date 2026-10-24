<?php
// Regla única: qué servicios de la agenda ocupan el horario de un médico.
// Solo cuentan los que realiza el profesional. Laboratorio, farmacia y las líneas comerciales de
// paquete/perfil no lo ocupan (un examen no lo hace el médico, aunque la fila de agenda traiga un medico_id).

if (!function_exists('agenda_tipos_servicio_ocupan_medico')) {
    function agenda_tipos_servicio_ocupan_medico(): array {
        return [
            'consulta',
            'ecografia',
            'rayosx', 'rayos x', 'rayos_x', 'rx',
            'tomografia',
            'procedimiento', 'procedimientos',
            'operacion', 'operaciones',
            'cirugia', 'cirugias',
            'hospitalizacion',
            'imagen', 'imagenologia',
        ];
    }
}

if (!function_exists('agenda_sql_servicio_ocupa_medico')) {
    /**
     * Fragmento SQL (sin AND inicial) que filtra filas de agenda_servicios_cotizacion por tipo de servicio.
     * $alias vacío para consultas sin alias de tabla.
     */
    function agenda_sql_servicio_ocupa_medico(string $alias = 'a'): string {
        $col = ($alias !== '' ? $alias . '.' : '') . 'servicio_tipo';
        $lista = implode(',', array_map(static function ($tipo) {
            return "'" . $tipo . "'";
        }, agenda_tipos_servicio_ocupan_medico()));
        return "LOWER(TRIM(COALESCE({$col}, ''))) IN ({$lista})";
    }
}

// Estados que liberan el turno: una consulta cancelada/anulada/completada o un evento cancelado, atendido, etc.
// ya no ocupa al médico. Una sola lista para Recordatorios, cotizar, cobrar e imagenología.
if (!function_exists('agenda_estados_consulta_liberan')) {
    function agenda_estados_consulta_liberan(): array {
        return ['cancelada', 'anulada', 'completada'];
    }
}

if (!function_exists('agenda_estados_evento_liberan')) {
    function agenda_estados_evento_liberan(): array {
        return ['cancelado', 'no_asistio', 'anulada', 'completado', 'atendido', 'espontaneo', 'pagado'];
    }
}

if (!function_exists('agenda_sql_estado_libera')) {
    function agenda_sql_estado_libera(string $columna, array $estados): string {
        $lista = implode(',', array_map(static function ($e) {
            return "'" . $e . "'";
        }, $estados));
        return "LOWER(TRIM(COALESCE({$columna}, ''))) NOT IN ({$lista})";
    }
}

if (!function_exists('agenda_sql_consulta_ocupa_medico')) {
    /** Fragmento SQL (sin AND inicial): la consulta sigue activa y ocupa al médico. */
    function agenda_sql_consulta_ocupa_medico(string $alias = ''): string {
        return agenda_sql_estado_libera(($alias !== '' ? $alias . '.' : '') . 'estado', agenda_estados_consulta_liberan());
    }
}

if (!function_exists('agenda_sql_evento_ocupa_medico')) {
    /** Fragmento SQL (sin AND inicial): el evento de agenda sigue activo y ocupa al médico. */
    function agenda_sql_evento_ocupa_medico(string $alias = 'a'): string {
        return agenda_sql_estado_libera(($alias !== '' ? $alias . '.' : '') . 'estado_evento', agenda_estados_evento_liberan());
    }
}
