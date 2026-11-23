-- 2026-11-23 | Suscripción del sistema por instalación (aviso de cobro, gracia y bloqueo) | SOLO ADITIVO (2 tablas nuevas)
-- Qué hace: crea licencia_sistema (una fila: monto, día de pago, vencimiento, días de aviso/gracia, métodos de pago) y
-- licencia_sistema_pagos (historial de pagos). Se configura desde el panel Engineer, pestaña "Suscripción".
-- Sin filas en licencia_sistema, o con activa = 0, el sistema NO avisa ni bloquea (falla seguro).
-- Es seguro repetirlo: usa IF NOT EXISTS. IMPORTANTE (no viaja en el build): aplicar en la BD de CADA clínica.
-- Requiere antes sql/2026-11-22/005_modulos_instalacion_schema.sql (el historial de cambios reutiliza modulos_instalacion_historial).

CREATE TABLE IF NOT EXISTS `licencia_sistema` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activa` tinyint(1) NOT NULL DEFAULT '0',
  `monto` decimal(10,2) DEFAULT NULL,
  `moneda` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PEN',
  `periodicidad` enum('mensual','trimestral','anual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mensual',
  `dia_pago` tinyint unsigned NOT NULL DEFAULT '1',
  `proximo_vencimiento` date DEFAULT NULL,
  `dias_aviso` smallint unsigned NOT NULL DEFAULT '10',
  `dias_gracia` smallint unsigned NOT NULL DEFAULT '5',
  `prorroga_hasta` date DEFAULT NULL,
  `mensaje` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contacto_whatsapp` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metodos_pago` text COLLATE utf8mb4_unicode_ci,
  `actualizado_por` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `licencia_sistema_pagos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fecha_pago` date NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `moneda` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PEN',
  `metodo` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referencia` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `periodo_hasta` date DEFAULT NULL,
  `notas` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_licencia_pagos_fecha` (`fecha_pago`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
