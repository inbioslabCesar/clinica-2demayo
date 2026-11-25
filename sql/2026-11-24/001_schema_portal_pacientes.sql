-- 2026-11-24 | Portal del paciente (resultados de laboratorio e imagenología) | SOLO ADITIVO (4 tablas nuevas)
-- Qué hace: crea las tablas del módulo 'portal_pacientes'. No modifica ninguna tabla existente.
--   paciente_portal_accesos      -> acceso (PIN con hash) de cada paciente; el login es DNI + PIN.
--   paciente_portal_liberaciones -> decisión manual del personal sobre un documento (liberado / retenido).
--   paciente_portal_config       -> opciones de la clínica (modo de liberación, bloqueo por deuda).
--   paciente_portal_eventos      -> auditoría de ingresos, descargas, PIN generados y liberaciones.
-- Es seguro repetirlo: usa IF NOT EXISTS.
-- IMPORTANTE (no viaja en el build): el módulo 'portal_pacientes' nace apagado; activarlo en una clínica es un
-- cambio en SU BD (002_activar_modulo_portal_pacientes.sql o el panel Engineer). Sin las tablas, el módulo no debe activarse.

CREATE TABLE IF NOT EXISTS `paciente_portal_accesos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `paciente_id` int NOT NULL,
  `pin_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` enum('activo','inactivo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activo',
  `pin_generado_por` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pin_generado_at` datetime DEFAULT NULL,
  `ultimo_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_paciente_portal_accesos_paciente` (`paciente_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `paciente_portal_liberaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `paciente_id` int NOT NULL,
  `tipo` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ref_id` int NOT NULL,
  `estado` enum('liberado','retenido') COLLATE utf8mb4_unicode_ci NOT NULL,
  `motivo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuario_nombre` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_paciente_portal_liberaciones_doc` (`tipo`,`ref_id`),
  KEY `idx_paciente_portal_liberaciones_paciente` (`paciente_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `paciente_portal_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clave` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_paciente_portal_config_clave` (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `paciente_portal_eventos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `paciente_id` int DEFAULT NULL,
  `accion` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ref_id` int DEFAULT NULL,
  `actor` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detalle` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_paciente_portal_eventos_paciente` (`paciente_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
