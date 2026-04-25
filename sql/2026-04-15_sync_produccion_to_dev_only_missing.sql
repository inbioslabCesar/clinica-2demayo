-- Sync SOLO FALTANTES: PRODUCCION -> DESARROLLO
-- Generado automaticamente el 2026-04-15
-- No modifica columnas existentes, solo crea/agrega lo faltante
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
SET FOREIGN_KEY_CHECKS = 0;

-- 1) Crear tablas/vistas faltantes
CREATE TABLE IF NOT EXISTS `config_apariencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'avatar',
  `clave` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '0',
  `order_index` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
, PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cotizacion_eventos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cotizacion_id` int NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `evento_tipo` enum('creada','editada','item_agregado','item_modificado','item_eliminado','anulada','reactivada','cobro_registrado','devolucion_parcial','saldo_actualizado','adenda_creada') COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuario_id` int NOT NULL,
  `motivo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `ip_origen` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cotizacion_farmacia_vinculos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cotizacion_id` int NOT NULL,
  `cotizacion_farmacia_id` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cotizacion_item_ajustes` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cotizacion_id` int NOT NULL,
  `cotizacion_detalle_id` int DEFAULT NULL,
  `servicio_tipo` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `accion` enum('quitar','agregar','modificar_cantidad','modificar_precio') COLLATE utf8mb4_unicode_ci NOT NULL,
  `cantidad_anterior` int DEFAULT NULL,
  `cantidad_nueva` int DEFAULT NULL,
  `precio_anterior` decimal(10,2) DEFAULT NULL,
  `precio_nuevo` decimal(10,2) DEFAULT NULL,
  `subtotal_anterior` decimal(10,2) DEFAULT NULL,
  `subtotal_nuevo` decimal(10,2) DEFAULT NULL,
  `motivo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuario_id` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cotizacion_movimientos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cotizacion_id` int NOT NULL,
  `cobro_id` int DEFAULT NULL,
  `tipo_movimiento` enum('cargo','abono','devolucion','ajuste') COLLATE utf8mb4_unicode_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `saldo_anterior` decimal(10,2) NOT NULL,
  `saldo_nuevo` decimal(10,2) NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documentos_externos_archivos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `documento_id` int NOT NULL,
  `nombre_original` varchar(255) NOT NULL DEFAULT '',
  `archivo_path` varchar(500) NOT NULL DEFAULT '',
  `tamano` int DEFAULT '0',
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `mime_type` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `documentos_externos_paciente` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `paciente_id` int NOT NULL,
  `tipo` varchar(50) NOT NULL DEFAULT 'laboratorio',
  `titulo` varchar(200) NOT NULL DEFAULT '',
  `descripcion` text,
  `orden_id` int DEFAULT NULL,
  `cobro_id` int DEFAULT NULL,
  `cotizacion_id` int DEFAULT NULL,
  `subido_por_usuario_id` int DEFAULT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `hc_templates` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `template_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `schema_version` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '2.0',
  `source` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'clinica_override',
  `clinic_key` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `schema_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `historia_clinica_backups` (
  `id` bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `batch_id` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `historia_id` bigint NOT NULL,
  `consulta_id` bigint NOT NULL,
  `datos_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `backup_reason` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'policy_change_pin',
  `actor` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `template_id_resuelto` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `template_version_resuelta` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `honorarios_por_cobrar` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cotizacion_id` int NOT NULL,
  `cobro_id` int NOT NULL,
  `consulta_id` int DEFAULT NULL,
  `medico_id` int NOT NULL,
  `paciente_id` int DEFAULT NULL,
  `tarifa_id` int DEFAULT NULL,
  `tipo_precio` enum('particular','seguro','convenio') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'particular',
  `tipo_servicio` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tarifa_total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `monto_clinica` decimal(10,2) NOT NULL DEFAULT '0.00',
  `monto_medico` decimal(10,2) NOT NULL DEFAULT '0.00',
  `porcentaje_aplicado_clinica` decimal(5,2) NOT NULL DEFAULT '0.00',
  `porcentaje_aplicado_medico` decimal(5,2) NOT NULL DEFAULT '0.00',
  `metodo_pago_medico` enum('efectivo','transferencia','cheque','deposito','tarjeta','yape','plin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'efectivo',
  `usuario_cobro_id` int NOT NULL,
  `caja_id` int DEFAULT NULL,
  `turno` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `firma_origen` char(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado_consolidacion` enum('pendiente','consolidado','anulado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `honorario_movimiento_id_final` int DEFAULT NULL,
  `consolidado_at` datetime DEFAULT NULL,
  `anulado_at` datetime DEFAULT NULL,
  `anulado_por` int DEFAULT NULL,
  `motivo_anulacion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventario_consumos_examen` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `orden_id` int DEFAULT NULL,
  `cobro_id` int DEFAULT NULL,
  `consulta_id` int DEFAULT NULL,
  `paciente_id` int DEFAULT NULL,
  `id_examen` int NOT NULL,
  `item_id` int NOT NULL,
  `cantidad_consumida` decimal(12,4) NOT NULL,
  `origen_evento` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'resultado',
  `estado` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'aplicado',
  `usuario_id` int DEFAULT NULL,
  `observacion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventario_examen_recetas` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_examen` int NOT NULL,
  `item_id` int NOT NULL,
  `cantidad_por_prueba` decimal(12,4) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `observacion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventario_items` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `codigo` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `marca` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `presentacion` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `factor_presentacion` decimal(12,4) NOT NULL DEFAULT '1.0000',
  `unidad_medida` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `controla_stock` tinyint(1) NOT NULL DEFAULT '1',
  `stock_minimo` decimal(12,2) NOT NULL DEFAULT '0.00',
  `stock_critico` decimal(12,2) NOT NULL DEFAULT '0.00',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventario_lotes` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `item_id` int NOT NULL,
  `lote_codigo` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `cantidad_inicial` decimal(12,2) NOT NULL DEFAULT '0.00',
  `cantidad_actual` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventario_movimientos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `item_id` int NOT NULL,
  `lote_id` int DEFAULT NULL,
  `tipo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cantidad` decimal(12,2) NOT NULL,
  `observacion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `origen` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inventario',
  `usuario_id` int DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventario_transferencias` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `origen` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'almacen_principal',
  `destino` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'laboratorio',
  `usuario_id` int DEFAULT NULL,
  `observacion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventario_transferencias_detalle` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `transferencia_id` int NOT NULL,
  `item_id` int NOT NULL,
  `cantidad` decimal(12,4) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `medico_adelantos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `medico_id` int NOT NULL,
  `fecha` date NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `motivo` varchar(255) DEFAULT NULL,
  `observaciones` text,
  `usuario_id` int DEFAULT NULL,
  `estado` enum('activo','anulado') NOT NULL DEFAULT 'activo',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `medico_condiciones_pago` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `medico_id` int NOT NULL,
  `modalidad_pago` enum('acto','hora') NOT NULL DEFAULT 'acto',
  `monto_hora` decimal(10,2) DEFAULT NULL,
  `frecuencia_pago` enum('quincenal','mensual') NOT NULL DEFAULT 'mensual',
  `permite_adelanto` tinyint(1) NOT NULL DEFAULT '0',
  `tope_adelanto_periodo` decimal(10,2) DEFAULT NULL,
  `vigencia_desde` date NOT NULL DEFAULT (curdate()),
  `vigencia_hasta` date DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ordenes_imagen` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `consulta_id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `tipo` varchar(30) NOT NULL DEFAULT 'rx',
  `indicaciones` text,
  `estado` varchar(20) NOT NULL DEFAULT 'pendiente',
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `solicitado_por` int DEFAULT NULL,
  `cotizacion_id` int DEFAULT NULL,
  `carga_anticipada` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ordenes_imagen_archivos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `orden_id` int NOT NULL,
  `nombre_original` varchar(255) NOT NULL DEFAULT '',
  `archivo_path` varchar(500) NOT NULL DEFAULT '',
  `tamano` int DEFAULT '0',
  `mime_type` varchar(100) DEFAULT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `recordatorios_consultas` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `consulta_id` int NOT NULL,
  `estado` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `observacion` text COLLATE utf8mb4_unicode_ci,
  `fecha_proximo_contacto` datetime DEFAULT NULL,
  `fecha_ultimo_contacto` datetime DEFAULT NULL,
  `intentos` int NOT NULL DEFAULT '0',
  `actualizado_por` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tratamientos_ejecucion_diaria` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tratamiento_id` int NOT NULL,
  `tratamiento_item_id` bigint UNSIGNED NOT NULL,
  `dia_nro` int NOT NULL,
  `fecha_programada` date NOT NULL,
  `dosis_planificadas` int NOT NULL DEFAULT '1',
  `dosis_administradas` int NOT NULL DEFAULT '0',
  `estado_dia` enum('pendiente','parcial','completo','omitido') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `notas_dia` text COLLATE utf8mb4_unicode_ci,
  `actualizado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Seguimiento diario por item de tratamiento';

CREATE TABLE IF NOT EXISTS `tratamientos_ejecucion_dosis` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tratamiento_id` int NOT NULL,
  `tratamiento_item_id` bigint UNSIGNED NOT NULL,
  `ejecucion_diaria_id` bigint UNSIGNED NOT NULL,
  `dia_nro` int NOT NULL,
  `dosis_nro` int NOT NULL DEFAULT '1',
  `fecha_hora_programada` datetime NOT NULL,
  `estado_dosis` enum('pendiente','administrada','omitida') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `fecha_hora_ejecucion` datetime DEFAULT NULL,
  `observacion` text COLLATE utf8mb4_unicode_ci,
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tratamientos_ejecucion_eventos` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `ejecucion_diaria_id` bigint UNSIGNED NOT NULL,
  `tratamiento_id` int NOT NULL,
  `dosis_programada_id` bigint UNSIGNED DEFAULT NULL,
  `tipo_evento` enum('administrada','omitida','reprogramada','observacion') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'administrada',
  `cantidad` decimal(10,2) NOT NULL DEFAULT '1.00',
  `fecha_hora_evento` datetime NOT NULL,
  `usuario_id` int DEFAULT NULL,
  `observacion` text COLLATE utf8mb4_unicode_ci,
  `metadata_json` json DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Eventos de administración para auditoría clínica';

CREATE TABLE IF NOT EXISTS `tratamientos_enfermeria` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `consulta_id` int NOT NULL COMMENT 'FK a consultas.id',
  `paciente_id` int NOT NULL COMMENT 'Copia desnormalizada para consultas rápidas',
  `receta_snapshot` json DEFAULT NULL COMMENT 'Copia de historia_clinica.datos.receta al momento del guardado',
  `tratamiento_texto` text COLLATE utf8mb4_unicode_ci COMMENT 'Copia de historia_clinica.datos.tratamiento',
  `estado` enum('pendiente','en_ejecucion','completado','suspendido') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `version_num` int NOT NULL DEFAULT '1' COMMENT 'Versión incremental por consulta',
  `origen_tratamiento_id` int DEFAULT NULL COMMENT 'ID de tratamiento del cual deriva la nueva versión',
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Momento del guardado del HC',
  `iniciado_en` datetime DEFAULT NULL COMMENT 'Cuando enfermería abre el registro',
  `completado_en` datetime DEFAULT NULL COMMENT 'Cuando enfermería confirma administración',
  `notas_enfermeria` text COLLATE utf8mb4_unicode_ci COMMENT 'Observaciones de la enfermera al administrar'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tratamientos prescritos en HC que deben ser ejecutados por enfermería';

CREATE TABLE IF NOT EXISTS `tratamientos_enfermeria_items` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tratamiento_id` int NOT NULL,
  `item_idx` int NOT NULL DEFAULT '0' COMMENT 'Posición del item en receta_snapshot',
  `medicamento_codigo` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `medicamento_nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dosis_texto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frecuencia_texto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frecuencia_tipo` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frecuencia_valor` int DEFAULT NULL,
  `frecuencia_horas_json` json DEFAULT NULL,
  `duracion_texto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duracion_valor` int DEFAULT NULL,
  `duracion_unidad` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duracion_dias` int NOT NULL DEFAULT '1',
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `iniciado_en` datetime DEFAULT NULL,
  `completado_en` datetime DEFAULT NULL,
  `orden` int NOT NULL DEFAULT '0',
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Items de medicamento del snapshot de tratamiento';

-- 2) Agregar columnas faltantes en tablas existentes
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `slogan_color` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_accent` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#6366f1';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_login_to` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#312e81';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_sidebar_via` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#7e22ce';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `logo_size_sistema` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_secondary` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#4338ca';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `logo_laboratorio_size_pdf` int DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_primary_dark` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#5b21b6';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `slogan` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_login_via` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#6b21a8';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `nombre_font_size` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_primary` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#7c3aed';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `logo_size_publico` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_primary_light` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#ede9fe';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `hc_template_mode` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'auto';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `logo_shape_sistema` varchar(10) COLLATE utf8mb4_general_ci DEFAULT 'auto';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `logo_laboratorio_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `nombre_color` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_sidebar_to` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#3730a3';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_sidebar_from` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#9333ea';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `hc_template_single_id` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `google_maps_embed` text COLLATE utf8mb4_general_ci;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_login_from` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#1e3a8a';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_public_layout` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'classic';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `caratula_fondo_url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `celular` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_preset` varchar(30) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'purple';
ALTER TABLE `configuracion_clinica` ADD COLUMN IF NOT EXISTS `tema_navbar_bg` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#6b21a8';
ALTER TABLE `consultas` ADD COLUMN IF NOT EXISTS `es_reprogramada` tinyint(1) NOT NULL DEFAULT '0';
ALTER TABLE `consultas` ADD COLUMN IF NOT EXISTS `hc_origen_id` int DEFAULT NULL COMMENT 'ID de la Historia Clínica origen si vino de próxima cita';
ALTER TABLE `consultas` ADD COLUMN IF NOT EXISTS `es_control` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = cita de control sin costo';
ALTER TABLE `consultas` ADD COLUMN IF NOT EXISTS `reprogramada_en` datetime DEFAULT NULL;
ALTER TABLE `consultas` ADD COLUMN IF NOT EXISTS `origen_creacion` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'agendada' COMMENT 'Origen del flujo: agendada|cotizador|hc_proxima';
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `motivo_anulacion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `es_adenda` tinyint(1) NOT NULL DEFAULT '0';
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `saldo_pendiente` decimal(10,2) NOT NULL DEFAULT '0.00';
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `anulado_por` int DEFAULT NULL;
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `anulado_en` datetime DEFAULT NULL;
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `cotizacion_padre_id` int DEFAULT NULL;
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `numero_comprobante` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `total_pagado` decimal(10,2) NOT NULL DEFAULT '0.00';
ALTER TABLE `cotizaciones` ADD COLUMN IF NOT EXISTS `version_actual` int NOT NULL DEFAULT '1';
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `consulta_id` int DEFAULT NULL;
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `valor_derivacion` decimal(10,2) DEFAULT NULL;
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `tipo_derivacion` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `editado_por` int DEFAULT NULL;
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `derivado` tinyint(1) NOT NULL DEFAULT '0';
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `laboratorio_referencia` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `editado_en` datetime DEFAULT NULL;
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `motivo_edicion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `version_item` int NOT NULL DEFAULT '1';
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `detalle_padre_id` int DEFAULT NULL;
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `estado_item` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'activo';
ALTER TABLE `cotizaciones_detalle` ADD COLUMN IF NOT EXISTS `medico_id` int DEFAULT NULL;
ALTER TABLE `laboratorio_referencia_movimientos` ADD COLUMN IF NOT EXISTS `cotizacion_id` int DEFAULT NULL;
ALTER TABLE `medicos` ADD COLUMN IF NOT EXISTS `abreviatura_profesional` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Dr(a).';
ALTER TABLE `medicos` ADD COLUMN IF NOT EXISTS `colegio_sigla` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `medicos` ADD COLUMN IF NOT EXISTS `nro_colegiatura` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `medicos` ADD COLUMN IF NOT EXISTS `tipo_profesional` varchar(30) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'medico';
ALTER TABLE `ordenes_laboratorio` ADD COLUMN IF NOT EXISTS `cotizacion_id` int DEFAULT NULL;
ALTER TABLE `ordenes_laboratorio` ADD COLUMN IF NOT EXISTS `carga_anticipada` tinyint(1) NOT NULL DEFAULT '0';
ALTER TABLE `public_banners` ADD COLUMN IF NOT EXISTS `imagen_conocenos_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE `public_servicios` ADD COLUMN IF NOT EXISTS `tipo` enum('clasico','premium') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'clasico';
ALTER TABLE `public_servicios` ADD COLUMN IF NOT EXISTS `imagen_tipo` enum('normal','overlay') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal';
ALTER TABLE `public_servicios` ADD COLUMN IF NOT EXISTS `imagen_shape` enum('square','rounded','circle') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'rounded';
ALTER TABLE `resultados_laboratorio` ADD COLUMN IF NOT EXISTS `firmado_por_usuario_id` int DEFAULT NULL;
ALTER TABLE `usuarios` ADD COLUMN IF NOT EXISTS `colegiatura_numero` varchar(60) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `usuarios` ADD COLUMN IF NOT EXISTS `firma_reportes` longtext COLLATE utf8mb4_general_ci;
ALTER TABLE `usuarios` ADD COLUMN IF NOT EXISTS `permisos` text COLLATE utf8mb4_general_ci;
ALTER TABLE `usuarios` ADD COLUMN IF NOT EXISTS `cargo_firma` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL;
ALTER TABLE `usuarios` ADD COLUMN IF NOT EXISTS `colegiatura_tipo` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL;

-- 3) Crear indices faltantes (sin tocar definiciones existentes)
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'atenciones' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `atenciones` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `paciente_id` ON `atenciones` (`paciente_id`);
CREATE INDEX IF NOT EXISTS `usuario_id` ON `atenciones` (`usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_atenciones_fecha_paciente` ON `atenciones` (`fecha`,`paciente_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cajas' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cajas` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `unique_fecha_usuario` ON `cajas` (`fecha`,`usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_fecha` ON `cajas` (`fecha`);
CREATE INDEX IF NOT EXISTS `idx_estado` ON `cajas` (`estado`);
CREATE INDEX IF NOT EXISTS `usuario_id` ON `cajas` (`usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_cajas_estado_fecha` ON `cajas` (`estado`,`fecha`);
CREATE INDEX IF NOT EXISTS `idx_cajas_usuario_id` ON `cajas` (`usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_cajas_fecha_estado` ON `cajas` (`fecha`,`estado`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cie10' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cie10` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `codigo` ON `cie10` (`codigo`);
CREATE INDEX IF NOT EXISTS `idx_codigo` ON `cie10` (`codigo`);
CREATE INDEX IF NOT EXISTS `idx_nombre` ON `cie10` (`nombre`);
CREATE INDEX IF NOT EXISTS `idx_categoria` ON `cie10` (`categoria`);
CREATE FULLTEXT INDEX IF NOT EXISTS `nombre` ON `cie10` (`nombre`,`descripcion`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cierre_caja_detalle' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cierre_caja_detalle` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `caja_id` ON `cierre_caja_detalle` (`caja_id`);
CREATE INDEX IF NOT EXISTS `usuario_cierre_id` ON `cierre_caja_detalle` (`usuario_cierre_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cobros' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cobros` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `usuario_id` ON `cobros` (`usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_cobros_paciente` ON `cobros` (`paciente_id`);
CREATE INDEX IF NOT EXISTS `idx_cobros_fecha` ON `cobros` (`fecha_cobro`);
CREATE INDEX IF NOT EXISTS `idx_cobros_estado` ON `cobros` (`estado`);
CREATE INDEX IF NOT EXISTS `idx_cobros_estado_fecha` ON `cobros` (`estado`,`fecha_cobro`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cobros_detalle' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cobros_detalle` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `cobro_id` ON `cobros_detalle` (`cobro_id`);
CREATE INDEX IF NOT EXISTS `idx_cobros_detalle_cobro_id` ON `cobros_detalle` (`cobro_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'configuracion_clinica' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `configuracion_clinica` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_configuracion_email` ON `configuracion_clinica` (`email`);
CREATE INDEX IF NOT EXISTS `idx_configuracion_created` ON `configuracion_clinica` (`created_at`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'configuracion_honorarios_medicos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `configuracion_honorarios_medicos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_medico_servicio` ON `configuracion_honorarios_medicos` (`medico_id`,`tipo_servicio`);
CREATE INDEX IF NOT EXISTS `idx_vigencia` ON `configuracion_honorarios_medicos` (`vigencia_desde`,`vigencia_hasta`);
CREATE INDEX IF NOT EXISTS `idx_activo` ON `configuracion_honorarios_medicos` (`activo`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'config_apariencia' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `config_apariencia` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `clave` ON `config_apariencia` (`clave`);
CREATE UNIQUE INDEX IF NOT EXISTS `uq_config_apariencia_clave` ON `config_apariencia` (`clave`);
CREATE INDEX IF NOT EXISTS `idx_config_tipo_clave` ON `config_apariencia` (`tipo`,`clave`);
CREATE INDEX IF NOT EXISTS `idx_config_activo` ON `config_apariencia` (`activo`);
CREATE INDEX IF NOT EXISTS `idx_config_apariencia_tipo` ON `config_apariencia` (`tipo`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'consultas' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `consultas` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `paciente_id` ON `consultas` (`paciente_id`);
CREATE INDEX IF NOT EXISTS `medico_id` ON `consultas` (`medico_id`);
CREATE INDEX IF NOT EXISTS `cobro_id` ON `consultas` (`cobro_id`);
CREATE INDEX IF NOT EXISTS `idx_consultas_medico_fecha_hora` ON `consultas` (`medico_id`,`fecha`,`hora`);
CREATE INDEX IF NOT EXISTS `idx_consultas_paciente_fecha_hora` ON `consultas` (`paciente_id`,`fecha`,`hora`);
CREATE INDEX IF NOT EXISTS `idx_hc_origen` ON `consultas` (`hc_origen_id`);
CREATE INDEX IF NOT EXISTS `idx_origen_creacion` ON `consultas` (`origen_creacion`);
CREATE INDEX IF NOT EXISTS `idx_es_control` ON `consultas` (`es_control`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cotizaciones' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cotizaciones` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_cotizaciones_numero_comprobante` ON `cotizaciones` (`numero_comprobante`);
CREATE INDEX IF NOT EXISTS `paciente_id` ON `cotizaciones` (`paciente_id`);
CREATE INDEX IF NOT EXISTS `usuario_id` ON `cotizaciones` (`usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_cotizaciones_estado_fecha` ON `cotizaciones` (`estado`,`fecha`);
CREATE INDEX IF NOT EXISTS `idx_cotizaciones_usuario_fecha` ON `cotizaciones` (`usuario_id`,`fecha`);
CREATE INDEX IF NOT EXISTS `idx_cotizaciones_paciente_fecha` ON `cotizaciones` (`paciente_id`,`fecha`);
CREATE INDEX IF NOT EXISTS `idx_cotizaciones_padre` ON `cotizaciones` (`cotizacion_padre_id`);
CREATE INDEX IF NOT EXISTS `idx_cot_fecha` ON `cotizaciones` (`fecha`);
CREATE INDEX IF NOT EXISTS `idx_cot_estado_fecha` ON `cotizaciones` (`estado`,`fecha`);
CREATE INDEX IF NOT EXISTS `idx_cot_usuario_fecha` ON `cotizaciones` (`usuario_id`,`fecha`);
CREATE INDEX IF NOT EXISTS `idx_cot_paciente_fecha` ON `cotizaciones` (`paciente_id`,`fecha`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cotizaciones_detalle' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cotizaciones_detalle` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `cotizacion_id` ON `cotizaciones_detalle` (`cotizacion_id`);
CREATE INDEX IF NOT EXISTS `idx_cot_detalle_estado` ON `cotizaciones_detalle` (`estado_item`);
CREATE INDEX IF NOT EXISTS `idx_cot_detalle_servicio` ON `cotizaciones_detalle` (`servicio_tipo`,`servicio_id`);
CREATE INDEX IF NOT EXISTS `idx_cot_detalle_padre` ON `cotizaciones_detalle` (`detalle_padre_id`);
CREATE INDEX IF NOT EXISTS `idx_cot_detalle_listado` ON `cotizaciones_detalle` (`cotizacion_id`,`estado_item`,`servicio_tipo`);
CREATE INDEX IF NOT EXISTS `idx_cd_cot_estado_serv` ON `cotizaciones_detalle` (`cotizacion_id`,`estado_item`,`servicio_tipo`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cotizaciones_farmacia' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cotizaciones_farmacia` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `paciente_id` ON `cotizaciones_farmacia` (`paciente_id`);
CREATE INDEX IF NOT EXISTS `usuario_id` ON `cotizaciones_farmacia` (`usuario_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cotizaciones_farmacia_detalle' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cotizaciones_farmacia_detalle` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `cotizacion_id` ON `cotizaciones_farmacia_detalle` (`cotizacion_id`);
CREATE INDEX IF NOT EXISTS `medicamento_id` ON `cotizaciones_farmacia_detalle` (`medicamento_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cotizacion_eventos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cotizacion_eventos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_cotizacion_eventos_cotizacion` ON `cotizacion_eventos` (`cotizacion_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `idx_cotizacion_eventos_tipo` ON `cotizacion_eventos` (`evento_tipo`);
CREATE INDEX IF NOT EXISTS `idx_cotizacion_eventos_usuario` ON `cotizacion_eventos` (`usuario_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cotizacion_farmacia_vinculos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cotizacion_farmacia_vinculos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_cot_farm_vinculo` ON `cotizacion_farmacia_vinculos` (`cotizacion_id`,`cotizacion_farmacia_id`);
CREATE INDEX IF NOT EXISTS `idx_cot_farm_cotizacion` ON `cotizacion_farmacia_vinculos` (`cotizacion_id`);
CREATE INDEX IF NOT EXISTS `idx_cot_farm_farmacia` ON `cotizacion_farmacia_vinculos` (`cotizacion_farmacia_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cotizacion_item_ajustes' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cotizacion_item_ajustes` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_cot_item_ajustes_cotizacion` ON `cotizacion_item_ajustes` (`cotizacion_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `idx_cot_item_ajustes_servicio` ON `cotizacion_item_ajustes` (`servicio_tipo`,`servicio_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cotizacion_movimientos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `cotizacion_movimientos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_cot_mov_cotizacion` ON `cotizacion_movimientos` (`cotizacion_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `idx_cot_mov_cobro` ON `cotizacion_movimientos` (`cobro_id`);
CREATE INDEX IF NOT EXISTS `idx_cot_mov_tipo` ON `cotizacion_movimientos` (`tipo_movimiento`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'descuentos_aplicados' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `descuentos_aplicados` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_cobro_id` ON `descuentos_aplicados` (`cobro_id`);
CREATE INDEX IF NOT EXISTS `idx_usuario_id` ON `descuentos_aplicados` (`usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_paciente_id` ON `descuentos_aplicados` (`paciente_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'disponibilidad_medicos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `disponibilidad_medicos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `medico_id` ON `disponibilidad_medicos` (`medico_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'documentos_externos_archivos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `documentos_externos_archivos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_dea_documento` ON `documentos_externos_archivos` (`documento_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'documentos_externos_paciente' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `documentos_externos_paciente` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_dep_paciente` ON `documentos_externos_paciente` (`paciente_id`);
CREATE INDEX IF NOT EXISTS `idx_dep_orden_paciente` ON `documentos_externos_paciente` (`orden_id`,`paciente_id`);
CREATE INDEX IF NOT EXISTS `idx_dep_paciente_fecha` ON `documentos_externos_paciente` (`paciente_id`,`fecha`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'egresos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `egresos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_egresos_fecha` ON `egresos` (`fecha`);
CREATE INDEX IF NOT EXISTS `idx_egresos_tipo` ON `egresos` (`tipo`);
CREATE INDEX IF NOT EXISTS `idx_egresos_categoria` ON `egresos` (`categoria`);
CREATE INDEX IF NOT EXISTS `idx_egresos_estado` ON `egresos` (`estado`);
CREATE INDEX IF NOT EXISTS `idx_egresos_honorario` ON `egresos` (`honorario_movimiento_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'examenes_laboratorio' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `examenes_laboratorio` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'hc_templates' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `hc_templates` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uq_hc_templates_unique` ON `hc_templates` (`template_id`,`version`,`clinic_key`);
CREATE INDEX IF NOT EXISTS `idx_hc_templates_lookup` ON `hc_templates` (`template_id`,`activo`,`clinic_key`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'historia_clinica' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `historia_clinica` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `consulta_id` ON `historia_clinica` (`consulta_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'historia_clinica_backups' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `historia_clinica_backups` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_hc_backup_batch` ON `historia_clinica_backups` (`batch_id`);
CREATE INDEX IF NOT EXISTS `idx_hc_backup_historia` ON `historia_clinica_backups` (`historia_id`);
CREATE INDEX IF NOT EXISTS `idx_hc_backup_consulta` ON `historia_clinica_backups` (`consulta_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'honorarios_medicos_movimientos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `honorarios_medicos_movimientos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_movimientos_medico_fecha` ON `honorarios_medicos_movimientos` (`medico_id`,`fecha`);
CREATE INDEX IF NOT EXISTS `idx_movimientos_estado_pago` ON `honorarios_medicos_movimientos` (`estado_pago_medico`);
CREATE INDEX IF NOT EXISTS `idx_movimientos_liquidacion` ON `honorarios_medicos_movimientos` (`liquidacion_id`);
CREATE INDEX IF NOT EXISTS `idx_movimientos_consulta` ON `honorarios_medicos_movimientos` (`consulta_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `honorarios_por_cobrar` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_hpc_firma_origen` ON `honorarios_por_cobrar` (`firma_origen`);
CREATE INDEX IF NOT EXISTS `idx_hpc_cot_estado` ON `honorarios_por_cobrar` (`cotizacion_id`,`estado_consolidacion`);
CREATE INDEX IF NOT EXISTS `idx_hpc_cobro` ON `honorarios_por_cobrar` (`cobro_id`);
CREATE INDEX IF NOT EXISTS `idx_hpc_medico_estado` ON `honorarios_por_cobrar` (`medico_id`,`estado_consolidacion`);
CREATE INDEX IF NOT EXISTS `idx_hpc_usuario_cobro` ON `honorarios_por_cobrar` (`usuario_cobro_id`);
CREATE INDEX IF NOT EXISTS `idx_hpc_hon_final` ON `honorarios_por_cobrar` (`honorario_movimiento_id_final`);
CREATE INDEX IF NOT EXISTS `fk_hpc_caja` ON `honorarios_por_cobrar` (`caja_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ingresos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `ingresos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `caja_id` ON `ingresos` (`caja_id`);
CREATE INDEX IF NOT EXISTS `usuario_id` ON `ingresos` (`usuario_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ingresos_diarios' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `ingresos_diarios` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_caja_id` ON `ingresos_diarios` (`caja_id`);
CREATE INDEX IF NOT EXISTS `idx_tipo_ingreso` ON `ingresos_diarios` (`tipo_ingreso`);
CREATE INDEX IF NOT EXISTS `idx_fecha_hora` ON `ingresos_diarios` (`fecha_hora`);
CREATE INDEX IF NOT EXISTS `idx_metodo_pago` ON `ingresos_diarios` (`metodo_pago`);
CREATE INDEX IF NOT EXISTS `idx_paciente_id` ON `ingresos_diarios` (`paciente_id`);
CREATE INDEX IF NOT EXISTS `usuario_id` ON `ingresos_diarios` (`usuario_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_consumos_examen' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `inventario_consumos_examen` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_consumo_evento_orden` ON `inventario_consumos_examen` (`orden_id`,`id_examen`,`item_id`,`origen_evento`);
CREATE INDEX IF NOT EXISTS `idx_inventario_consumo_orden` ON `inventario_consumos_examen` (`orden_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_consumo_cobro` ON `inventario_consumos_examen` (`cobro_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_consumo_examen` ON `inventario_consumos_examen` (`id_examen`);
CREATE INDEX IF NOT EXISTS `idx_inventario_consumo_item` ON `inventario_consumos_examen` (`item_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_consumo_fecha` ON `inventario_consumos_examen` (`fecha_hora`);
CREATE INDEX IF NOT EXISTS `idx_consumo_estado_item` ON `inventario_consumos_examen` (`estado`,`item_id`);
CREATE INDEX IF NOT EXISTS `idx_consumo_repeticion` ON `inventario_consumos_examen` (`estado`,`origen_evento`,`fecha_hora`,`id`);
CREATE INDEX IF NOT EXISTS `fk_inventario_consumo_paciente` ON `inventario_consumos_examen` (`paciente_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_examen_recetas' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `inventario_examen_recetas` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_inventario_receta_examen_item` ON `inventario_examen_recetas` (`id_examen`,`item_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_receta_examen` ON `inventario_examen_recetas` (`id_examen`);
CREATE INDEX IF NOT EXISTS `idx_inventario_receta_item` ON `inventario_examen_recetas` (`item_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_receta_activo` ON `inventario_examen_recetas` (`activo`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_items' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `inventario_items` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_inventario_items_codigo` ON `inventario_items` (`codigo`);
CREATE INDEX IF NOT EXISTS `idx_inventario_items_nombre` ON `inventario_items` (`nombre`);
CREATE INDEX IF NOT EXISTS `idx_inventario_items_categoria` ON `inventario_items` (`categoria`);
CREATE INDEX IF NOT EXISTS `idx_inventario_items_controla_stock` ON `inventario_items` (`controla_stock`);
CREATE INDEX IF NOT EXISTS `idx_inventario_items_activo` ON `inventario_items` (`activo`);
CREATE INDEX IF NOT EXISTS `idx_inventario_items_created_at` ON `inventario_items` (`created_at`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_lotes' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `inventario_lotes` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_inventario_lotes_item` ON `inventario_lotes` (`item_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_lotes_venc` ON `inventario_lotes` (`fecha_vencimiento`);
CREATE INDEX IF NOT EXISTS `idx_inventario_lotes_stock` ON `inventario_lotes` (`cantidad_actual`);
CREATE INDEX IF NOT EXISTS `idx_inventario_lotes_item_stock_venc` ON `inventario_lotes` (`item_id`,`cantidad_actual`,`fecha_vencimiento`,`id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_lotes_venc_stock_item` ON `inventario_lotes` (`fecha_vencimiento`,`cantidad_actual`,`item_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_movimientos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `inventario_movimientos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_inventario_mov_item` ON `inventario_movimientos` (`item_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_mov_lote` ON `inventario_movimientos` (`lote_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_mov_tipo` ON `inventario_movimientos` (`tipo`);
CREATE INDEX IF NOT EXISTS `idx_inventario_mov_origen` ON `inventario_movimientos` (`origen`);
CREATE INDEX IF NOT EXISTS `idx_inventario_mov_fecha` ON `inventario_movimientos` (`fecha_hora`);
CREATE INDEX IF NOT EXISTS `idx_inventario_mov_fecha_id` ON `inventario_movimientos` (`fecha_hora`,`id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_transferencias' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `inventario_transferencias` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_inventario_transferencias_fecha` ON `inventario_transferencias` (`fecha_hora`);
CREATE INDEX IF NOT EXISTS `idx_inventario_transferencias_destino` ON `inventario_transferencias` (`destino`);
CREATE INDEX IF NOT EXISTS `idx_transfer_destino_id` ON `inventario_transferencias` (`destino`,`id`);
CREATE INDEX IF NOT EXISTS `idx_transfer_fecha_id` ON `inventario_transferencias` (`fecha_hora`,`id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_transferencias_detalle' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `inventario_transferencias_detalle` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_inventario_transfer_det_transf` ON `inventario_transferencias_detalle` (`transferencia_id`);
CREATE INDEX IF NOT EXISTS `idx_inventario_transfer_det_item` ON `inventario_transferencias_detalle` (`item_id`);
CREATE INDEX IF NOT EXISTS `idx_transfer_det_item_transfer` ON `inventario_transferencias_detalle` (`item_id`,`transferencia_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'laboratorio_referencia_movimientos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `laboratorio_referencia_movimientos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_lrm_cotizacion_id` ON `laboratorio_referencia_movimientos` (`cotizacion_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'liquidaciones_medicos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `liquidaciones_medicos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_liquidaciones_medico_periodo` ON `liquidaciones_medicos` (`medico_id`,`periodo_desde`,`periodo_hasta`);
CREATE INDEX IF NOT EXISTS `idx_liquidaciones_estado` ON `liquidaciones_medicos` (`estado`);
CREATE INDEX IF NOT EXISTS `idx_liquidaciones_fechas` ON `liquidaciones_medicos` (`fecha_aprobacion`,`fecha_pago`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'log_eliminaciones' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `log_eliminaciones` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_cobro_id` ON `log_eliminaciones` (`cobro_id`);
CREATE INDEX IF NOT EXISTS `idx_usuario_id` ON `log_eliminaciones` (`usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_servicio_tipo` ON `log_eliminaciones` (`servicio_tipo`);
CREATE INDEX IF NOT EXISTS `idx_fecha_hora` ON `log_eliminaciones` (`fecha_hora`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'log_reaperturas' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `log_reaperturas` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `caja_id` ON `log_reaperturas` (`caja_id`);
CREATE INDEX IF NOT EXISTS `usuario_id` ON `log_reaperturas` (`usuario_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'medicamentos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `medicamentos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `codigo` ON `medicamentos` (`codigo`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'medicos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `medicos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `email` ON `medicos` (`email`);
CREATE INDEX IF NOT EXISTS `idx_firma` ON `medicos` (`firma`(100));
CREATE INDEX IF NOT EXISTS `idx_cmp` ON `medicos` (`cmp`);
CREATE INDEX IF NOT EXISTS `idx_rne` ON `medicos` (`rne`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'medico_adelantos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `medico_adelantos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_medico_fecha` ON `medico_adelantos` (`medico_id`,`fecha`);
CREATE INDEX IF NOT EXISTS `idx_estado` ON `medico_adelantos` (`estado`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'medico_condiciones_pago' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `medico_condiciones_pago` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_medico_activo` ON `medico_condiciones_pago` (`medico_id`,`activo`);
CREATE INDEX IF NOT EXISTS `idx_medico` ON `medico_condiciones_pago` (`medico_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'metodos_pago' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `metodos_pago` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `nombre` ON `metodos_pago` (`nombre`);
CREATE UNIQUE INDEX IF NOT EXISTS `codigo` ON `metodos_pago` (`codigo`);
CREATE INDEX IF NOT EXISTS `idx_codigo` ON `metodos_pago` (`codigo`);
CREATE INDEX IF NOT EXISTS `idx_activo` ON `metodos_pago` (`activo`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'movimientos_medicamento' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `movimientos_medicamento` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `medicamento_id` ON `movimientos_medicamento` (`medicamento_id`);
CREATE INDEX IF NOT EXISTS `usuario_id` ON `movimientos_medicamento` (`usuario_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ordenes_imagen' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `ordenes_imagen` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_oi_consulta` ON `ordenes_imagen` (`consulta_id`);
CREATE INDEX IF NOT EXISTS `idx_oi_paciente` ON `ordenes_imagen` (`paciente_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ordenes_imagen_archivos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `ordenes_imagen_archivos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_oia_orden` ON `ordenes_imagen_archivos` (`orden_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ordenes_laboratorio' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `ordenes_laboratorio` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `consulta_id` ON `ordenes_laboratorio` (`consulta_id`);
CREATE INDEX IF NOT EXISTS `idx_ol_cot_estado` ON `ordenes_laboratorio` (`cotizacion_id`,`estado`);
CREATE INDEX IF NOT EXISTS `idx_ol_estado_fecha_id` ON `ordenes_laboratorio` (`estado`,`fecha`,`id`);
CREATE INDEX IF NOT EXISTS `idx_ol_consulta_fecha_id` ON `ordenes_laboratorio` (`consulta_id`,`fecha`,`id`);
CREATE INDEX IF NOT EXISTS `idx_ol_paciente_fecha_id` ON `ordenes_laboratorio` (`paciente_id`,`fecha`,`id`);
CREATE INDEX IF NOT EXISTS `idx_ol_cotizacion` ON `ordenes_laboratorio` (`cotizacion_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'pacientes' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `pacientes` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `dni` ON `pacientes` (`dni`);
CREATE UNIQUE INDEX IF NOT EXISTS `historia_clinica` ON `pacientes` (`historia_clinica`);
CREATE INDEX IF NOT EXISTS `idx_pacientes_dni` ON `pacientes` (`dni`);
CREATE INDEX IF NOT EXISTS `idx_pacientes_apellido_nombre` ON `pacientes` (`apellido`,`nombre`);
CREATE INDEX IF NOT EXISTS `idx_pacientes_historia` ON `pacientes` (`historia_clinica`);
CREATE INDEX IF NOT EXISTS `idx_historia_clinica` ON `pacientes` (`historia_clinica`);
CREATE INDEX IF NOT EXISTS `idx_pacientes_historia_clinica` ON `pacientes` (`historia_clinica`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'public_banners' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `public_banners` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_public_banners_activo_orden` ON `public_banners` (`activo`,`orden`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'public_ofertas' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `public_ofertas` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_public_ofertas_activo_orden` ON `public_ofertas` (`activo`,`orden`);
CREATE INDEX IF NOT EXISTS `idx_public_ofertas_fechas` ON `public_ofertas` (`fecha_inicio`,`fecha_fin`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'public_servicios' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `public_servicios` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_public_servicios_activo_orden` ON `public_servicios` (`activo`,`orden`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'recordatorios_consultas' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `recordatorios_consultas` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uq_recordatorios_consulta` ON `recordatorios_consultas` (`consulta_id`);
CREATE INDEX IF NOT EXISTS `idx_recordatorios_estado` ON `recordatorios_consultas` (`estado`);
CREATE INDEX IF NOT EXISTS `idx_recordatorios_proximo_contacto` ON `recordatorios_consultas` (`fecha_proximo_contacto`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'resultados_laboratorio' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `resultados_laboratorio` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `consulta_id` ON `resultados_laboratorio` (`consulta_id`);
CREATE INDEX IF NOT EXISTS `idx_resultados_firmado_por_usuario` ON `resultados_laboratorio` (`firmado_por_usuario_id`);
CREATE INDEX IF NOT EXISTS `idx_rl_orden_fecha_id` ON `resultados_laboratorio` (`orden_id`,`fecha`,`id`);
CREATE INDEX IF NOT EXISTS `idx_rl_consulta_orden_fecha_id` ON `resultados_laboratorio` (`consulta_id`,`orden_id`,`fecha`,`id`);
CREATE INDEX IF NOT EXISTS `idx_rl_orden_fecha_id_v2` ON `resultados_laboratorio` (`orden_id`,`fecha`,`id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'seguros' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `seguros` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `paciente_id` ON `seguros` (`paciente_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tarifas' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `tarifas` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_tarifas_servicio` ON `tarifas` (`servicio_tipo`,`activo`);
CREATE INDEX IF NOT EXISTS `fk_tarifas_medico` ON `tarifas` (`medico_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_diaria' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_diaria` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_te_dia_item` ON `tratamientos_ejecucion_diaria` (`tratamiento_item_id`,`dia_nro`);
CREATE INDEX IF NOT EXISTS `idx_te_dia_tratamiento_estado` ON `tratamientos_ejecucion_diaria` (`tratamiento_id`,`estado_dia`);
CREATE INDEX IF NOT EXISTS `idx_te_dia_tratamiento_numero` ON `tratamientos_ejecucion_diaria` (`tratamiento_id`,`dia_nro`);
CREATE INDEX IF NOT EXISTS `idx_te_dia_fecha` ON `tratamientos_ejecucion_diaria` (`fecha_programada`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_dosis' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_dosis` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `uk_te_dosis_item_dia_nro` ON `tratamientos_ejecucion_dosis` (`tratamiento_item_id`,`dia_nro`,`dosis_nro`);
CREATE INDEX IF NOT EXISTS `idx_te_dosis_tratamiento_fecha` ON `tratamientos_ejecucion_dosis` (`tratamiento_id`,`fecha_hora_programada`);
CREATE INDEX IF NOT EXISTS `idx_te_dosis_diaria_estado` ON `tratamientos_ejecucion_dosis` (`ejecucion_diaria_id`,`estado_dosis`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_eventos' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_eventos` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_te_evt_dia_fecha` ON `tratamientos_ejecucion_eventos` (`ejecucion_diaria_id`,`fecha_hora_evento`);
CREATE INDEX IF NOT EXISTS `idx_te_evt_trat_fecha` ON `tratamientos_ejecucion_eventos` (`tratamiento_id`,`fecha_hora_evento`);
CREATE INDEX IF NOT EXISTS `idx_te_evt_usuario_fecha` ON `tratamientos_ejecucion_eventos` (`usuario_id`,`fecha_hora_evento`);
CREATE INDEX IF NOT EXISTS `idx_te_evt_dosis` ON `tratamientos_ejecucion_eventos` (`dosis_programada_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_enfermeria' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `tratamientos_enfermeria` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_te_estado` ON `tratamientos_enfermeria` (`estado`);
CREATE INDEX IF NOT EXISTS `idx_te_paciente` ON `tratamientos_enfermeria` (`paciente_id`);
CREATE INDEX IF NOT EXISTS `idx_te_consulta_version` ON `tratamientos_enfermeria` (`consulta_id`,`version_num`);
CREATE INDEX IF NOT EXISTS `idx_te_creado` ON `tratamientos_enfermeria` (`creado_en`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_enfermeria_items' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `tratamientos_enfermeria_items` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `idx_te_items_tratamiento` ON `tratamientos_enfermeria_items` (`tratamiento_id`);
CREATE INDEX IF NOT EXISTS `idx_te_items_orden` ON `tratamientos_enfermeria_items` (`tratamiento_id`,`orden`);
CREATE INDEX IF NOT EXISTS `idx_te_items_codigo` ON `tratamientos_enfermeria_items` (`medicamento_codigo`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'triaje' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `triaje` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE INDEX IF NOT EXISTS `consulta_id` ON `triaje` (`consulta_id`);
SET @__pk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND constraint_type = 'PRIMARY KEY');
SET @__sql := IF(@__pk_exists = 0, 'ALTER TABLE `usuarios` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX IF NOT EXISTS `usuario` ON `usuarios` (`usuario`);

-- 3.1) Asegurar AUTO_INCREMENT en IDs criticos (incluso si la tabla ya existia)
SET @__is_ai := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cotizaciones' AND column_name = 'id' AND extra LIKE '%auto_increment%');
SET @__sql := IF(@__is_ai = 0, 'ALTER TABLE `cotizaciones` MODIFY `id` int NOT NULL AUTO_INCREMENT', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @__is_ai := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cotizaciones_detalle' AND column_name = 'id' AND extra LIKE '%auto_increment%');
SET @__sql := IF(@__is_ai = 0, 'ALTER TABLE `cotizaciones_detalle` MODIFY `id` int NOT NULL AUTO_INCREMENT', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @__is_ai := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cotizacion_eventos' AND column_name = 'id' AND extra LIKE '%auto_increment%');
SET @__sql := IF(@__is_ai = 0, 'ALTER TABLE `cotizacion_eventos` MODIFY `id` int NOT NULL AUTO_INCREMENT', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @__is_ai := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cotizacion_item_ajustes' AND column_name = 'id' AND extra LIKE '%auto_increment%');
SET @__sql := IF(@__is_ai = 0, 'ALTER TABLE `cotizacion_item_ajustes` MODIFY `id` int NOT NULL AUTO_INCREMENT', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @__is_ai := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cotizacion_movimientos' AND column_name = 'id' AND extra LIKE '%auto_increment%');
SET @__sql := IF(@__is_ai = 0, 'ALTER TABLE `cotizacion_movimientos` MODIFY `id` int NOT NULL AUTO_INCREMENT', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @__is_ai := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ordenes_laboratorio' AND column_name = 'id' AND extra LIKE '%auto_increment%');
SET @__sql := IF(@__is_ai = 0, 'ALTER TABLE `ordenes_laboratorio` MODIFY `id` int NOT NULL AUTO_INCREMENT', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Triggers de desarrollo
DELIMITER $$
DROP TRIGGER IF EXISTS `bi_cotizaciones_saldo_guard`$$
CREATE TRIGGER `bi_cotizaciones_saldo_guard` BEFORE INSERT ON `cotizaciones` FOR EACH ROW BEGIN
  SET NEW.total_pagado = COALESCE(NEW.total_pagado, 0);

  IF NEW.saldo_pendiente IS NULL
     OR (COALESCE(NEW.saldo_pendiente, 0) <= 0
         AND COALESCE(NEW.total, 0) > 0
         AND COALESCE(NEW.total_pagado, 0) = 0
         AND COALESCE(NEW.estado, 'pendiente') IN ('pendiente', 'parcial')) THEN
    SET NEW.saldo_pendiente = COALESCE(NEW.total, 0);
  END IF;

  IF COALESCE(NEW.estado, '') <> 'anulada' THEN
    IF COALESCE(NEW.saldo_pendiente, 0) <= 0 THEN
      SET NEW.estado = 'pagado';
    ELSEIF COALESCE(NEW.total_pagado, 0) > 0 THEN
      SET NEW.estado = 'parcial';
    ELSE
      SET NEW.estado = 'pendiente';
    END IF;
  END IF;
END
$$
DROP TRIGGER IF EXISTS `bu_cotizaciones_saldo_guard`$$
CREATE TRIGGER `bu_cotizaciones_saldo_guard` BEFORE UPDATE ON `cotizaciones` FOR EACH ROW BEGIN
  SET NEW.total_pagado = COALESCE(NEW.total_pagado, 0);

  IF NEW.saldo_pendiente IS NULL THEN
    SET NEW.saldo_pendiente = GREATEST(COALESCE(NEW.total, 0) - COALESCE(NEW.total_pagado, 0), 0);
  END IF;

  IF COALESCE(NEW.estado, '') <> 'anulada' THEN
    IF COALESCE(NEW.saldo_pendiente, 0) <= 0 THEN
      SET NEW.estado = 'pagado';
    ELSEIF COALESCE(NEW.total_pagado, 0) > 0 THEN
      SET NEW.estado = 'parcial';
    ELSE
      SET NEW.estado = 'pendiente';
    END IF;
  END IF;
END
$$
DELIMITER ;

-- 5) Vista de resumen diario de cotizaciones
DROP VIEW IF EXISTS `vw_cotizaciones_resumen_diario`;
CREATE OR REPLACE VIEW `vw_cotizaciones_resumen_diario`  AS SELECT `c`.`id` AS `id`, `c`.`numero_comprobante` AS `numero_comprobante`, `c`.`fecha` AS `fecha`, cast(`c`.`fecha` as date) AS `fecha_dia`, `c`.`estado` AS `estado`, `c`.`total` AS `total`, `c`.`total_pagado` AS `total_pagado`, `c`.`saldo_pendiente` AS `saldo_pendiente`, `c`.`version_actual` AS `version_actual`, `c`.`paciente_id` AS `paciente_id`, concat(coalesce(`p`.`nombre`,''),' ',coalesce(`p`.`apellido`,'')) AS `paciente_nombre`, `p`.`dni` AS `paciente_dni`, `p`.`historia_clinica` AS `historia_clinica`, `c`.`usuario_id` AS `usuario_id`, `u`.`nombre` AS `usuario_cotizo`, count(`cd`.`id`) AS `total_items`, count(distinct `cd`.`servicio_tipo`) AS `total_servicios` FROM (((`cotizaciones` `c` left join `pacientes` `p` on((`p`.`id` = `c`.`paciente_id`))) left join `usuarios` `u` on((`u`.`id` = `c`.`usuario_id`))) left join `cotizaciones_detalle` `cd` on((`cd`.`cotizacion_id` = `c`.`id`))) GROUP BY `c`.`id`, `c`.`numero_comprobante`, `c`.`fecha`, cast(`c`.`fecha` as date), `c`.`estado`, `c`.`total`, `c`.`total_pagado`, `c`.`saldo_pendiente`, `c`.`version_actual`, `c`.`paciente_id`, concat(coalesce(`p`.`nombre`,''),' ',coalesce(`p`.`apellido`,'')), `p`.`dni`, `p`.`historia_clinica`, `c`.`usuario_id`, `u`.`nombre` ;

-- 6) Foreign keys faltantes
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' AND constraint_name = 'fk_hpc_caja');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `honorarios_por_cobrar` ADD CONSTRAINT `fk_hpc_caja` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' AND constraint_name = 'fk_hpc_cobro');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `honorarios_por_cobrar` ADD CONSTRAINT `fk_hpc_cobro` FOREIGN KEY (`cobro_id`) REFERENCES `cobros` (`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' AND constraint_name = 'fk_hpc_cotizacion');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `honorarios_por_cobrar` ADD CONSTRAINT `fk_hpc_cotizacion` FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' AND constraint_name = 'fk_hpc_honorario_final');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `honorarios_por_cobrar` ADD CONSTRAINT `fk_hpc_honorario_final` FOREIGN KEY (`honorario_movimiento_id_final`) REFERENCES `honorarios_medicos_movimientos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' AND constraint_name = 'fk_hpc_medico');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `honorarios_por_cobrar` ADD CONSTRAINT `fk_hpc_medico` FOREIGN KEY (`medico_id`) REFERENCES `medicos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' AND constraint_name = 'fk_hpc_usuario_cobro');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `honorarios_por_cobrar` ADD CONSTRAINT `fk_hpc_usuario_cobro` FOREIGN KEY (`usuario_cobro_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ingresos' AND constraint_name = 'ingresos_ibfk_1');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `ingresos` ADD CONSTRAINT `ingresos_ibfk_1` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ingresos' AND constraint_name = 'ingresos_ibfk_2');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `ingresos` ADD CONSTRAINT `ingresos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_consumos_examen' AND constraint_name = 'fk_inventario_consumo_examen_lab');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_consumos_examen` ADD CONSTRAINT `fk_inventario_consumo_examen_lab` FOREIGN KEY (`id_examen`) REFERENCES `examenes_laboratorio` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_consumos_examen' AND constraint_name = 'fk_inventario_consumo_item');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_consumos_examen` ADD CONSTRAINT `fk_inventario_consumo_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_consumos_examen' AND constraint_name = 'fk_inventario_consumo_orden_lab');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_consumos_examen` ADD CONSTRAINT `fk_inventario_consumo_orden_lab` FOREIGN KEY (`orden_id`) REFERENCES `ordenes_laboratorio` (`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_consumos_examen' AND constraint_name = 'fk_inventario_consumo_paciente');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_consumos_examen` ADD CONSTRAINT `fk_inventario_consumo_paciente` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_examen_recetas' AND constraint_name = 'fk_inventario_receta_examen_lab');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_examen_recetas` ADD CONSTRAINT `fk_inventario_receta_examen_lab` FOREIGN KEY (`id_examen`) REFERENCES `examenes_laboratorio` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_examen_recetas' AND constraint_name = 'fk_inventario_receta_item');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_examen_recetas` ADD CONSTRAINT `fk_inventario_receta_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_lotes' AND constraint_name = 'fk_inventario_lotes_item');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_lotes` ADD CONSTRAINT `fk_inventario_lotes_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_movimientos' AND constraint_name = 'fk_inventario_mov_item');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_movimientos` ADD CONSTRAINT `fk_inventario_mov_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_movimientos' AND constraint_name = 'fk_inventario_mov_lote');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_movimientos` ADD CONSTRAINT `fk_inventario_mov_lote` FOREIGN KEY (`lote_id`) REFERENCES `inventario_lotes` (`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_transferencias_detalle' AND constraint_name = 'fk_inventario_transfer_det_item');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_transferencias_detalle` ADD CONSTRAINT `fk_inventario_transfer_det_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'inventario_transferencias_detalle' AND constraint_name = 'fk_inventario_transfer_det_transferencia');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `inventario_transferencias_detalle` ADD CONSTRAINT `fk_inventario_transfer_det_transferencia` FOREIGN KEY (`transferencia_id`) REFERENCES `inventario_transferencias` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_diaria' AND constraint_name = 'fk_te_dia_item');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_diaria` ADD CONSTRAINT `fk_te_dia_item` FOREIGN KEY (`tratamiento_item_id`) REFERENCES `tratamientos_enfermeria_items` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_diaria' AND constraint_name = 'fk_te_dia_tratamiento');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_diaria` ADD CONSTRAINT `fk_te_dia_tratamiento` FOREIGN KEY (`tratamiento_id`) REFERENCES `tratamientos_enfermeria` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_dosis' AND constraint_name = 'fk_te_dosis_diaria');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_dosis` ADD CONSTRAINT `fk_te_dosis_diaria` FOREIGN KEY (`ejecucion_diaria_id`) REFERENCES `tratamientos_ejecucion_diaria` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_dosis' AND constraint_name = 'fk_te_dosis_item');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_dosis` ADD CONSTRAINT `fk_te_dosis_item` FOREIGN KEY (`tratamiento_item_id`) REFERENCES `tratamientos_enfermeria_items` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_dosis' AND constraint_name = 'fk_te_dosis_tratamiento');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_dosis` ADD CONSTRAINT `fk_te_dosis_tratamiento` FOREIGN KEY (`tratamiento_id`) REFERENCES `tratamientos_enfermeria` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_eventos' AND constraint_name = 'fk_te_evt_dia');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_eventos` ADD CONSTRAINT `fk_te_evt_dia` FOREIGN KEY (`ejecucion_diaria_id`) REFERENCES `tratamientos_ejecucion_diaria` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_ejecucion_eventos' AND constraint_name = 'fk_te_evt_trat');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_ejecucion_eventos` ADD CONSTRAINT `fk_te_evt_trat` FOREIGN KEY (`tratamiento_id`) REFERENCES `tratamientos_enfermeria` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_enfermeria' AND constraint_name = 'fk_te_consulta');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_enfermeria` ADD CONSTRAINT `fk_te_consulta` FOREIGN KEY (`consulta_id`) REFERENCES `consultas` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @__fk_exists := (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'tratamientos_enfermeria_items' AND constraint_name = 'fk_te_items_tratamiento');
SET @__sql := IF(@__fk_exists = 0, 'ALTER TABLE `tratamientos_enfermeria_items` ADD CONSTRAINT `fk_te_items_tratamiento` FOREIGN KEY (`tratamiento_id`) REFERENCES `tratamientos_enfermeria` (`id`) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @__sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;
-- FIN DEL SCRIPT SOLO FALTANTES
