-- 2026-11-22 | Fase 1: módulos y licencias por instalación | SOLO ADITIVO (2 tablas nuevas + 3 filas)
-- Qué hace: crea modulos_instalacion (qué módulos tiene habilitados esta clínica) y su historial de cambios.
-- Valores iniciales: clinico = habilitado; ocupacional y portal_empresas = apagados.
-- Es seguro repetirlo: usa IF NOT EXISTS / INSERT IGNORE y nunca pisa lo ya configurado.
-- IMPORTANTE (no viaja en el build): esta configuración vive en la BD de cada clínica; activar un módulo
-- en una clínica es un UPDATE en SU BD (o desde el panel Engineer, cuando exista).

CREATE TABLE IF NOT EXISTS `modulos_instalacion` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modulo` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `habilitado` tinyint(1) NOT NULL DEFAULT '0',
  `estado` enum('activo','gracia','suspendido') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activo',
  `plan` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `precio` decimal(10,2) DEFAULT NULL,
  `moneda` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PEN',
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `notas` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actualizado_por` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_modulos_instalacion_modulo` (`modulo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `modulos_instalacion_historial` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `modulo` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accion` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalle` text COLLATE utf8mb4_unicode_ci,
  `actor` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_modulos_historial_modulo_fecha` (`modulo`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `modulos_instalacion` (`modulo`, `habilitado`, `estado`, `notas`) VALUES
  ('clinico', 1, 'activo', 'Sistema clinico base'),
  ('ocupacional', 0, 'activo', 'Salud ocupacional (activar por clinica)'),
  ('portal_empresas', 0, 'activo', 'Portal de empresas para ver resultados ocupacionales');
