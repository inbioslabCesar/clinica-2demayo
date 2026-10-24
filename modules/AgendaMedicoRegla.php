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
