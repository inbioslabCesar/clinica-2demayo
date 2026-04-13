-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1:3306
-- Tiempo de generación: 10-04-2026 a las 07:21:41
-- Versión del servidor: 11.8.6-MariaDB-log
-- Versión de PHP: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `u330560936_cardiovidabd`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `atenciones`
--

CREATE TABLE `atenciones` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `fecha` datetime NOT NULL DEFAULT current_timestamp(),
  `servicio` enum('consulta','laboratorio','farmacia','rayosx','ecografia','procedimiento','operacion','hospitalizacion','ocupacional','procedimientos','cirugias','tratamientos','emergencias') DEFAULT NULL,
  `estado` enum('pendiente','en_proceso','finalizado') NOT NULL DEFAULT 'pendiente',
  `observaciones` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cajas`
--

CREATE TABLE `cajas` (
  `id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `turno` enum('mañana','tarde','noche') NOT NULL,
  `estado` enum('abierta','en_cierre','cerrada') DEFAULT 'abierta',
  `monto_apertura` decimal(10,2) NOT NULL DEFAULT 0.00,
  `hora_apertura` time NOT NULL,
  `observaciones_apertura` text DEFAULT NULL,
  `monto_cierre` decimal(10,2) DEFAULT NULL,
  `monto_contado` decimal(10,2) DEFAULT 0.00,
  `hora_cierre` time DEFAULT NULL,
  `observaciones_cierre` text DEFAULT NULL,
  `total_efectivo` decimal(10,2) DEFAULT 0.00,
  `total_tarjetas` decimal(10,2) DEFAULT 0.00,
  `total_transferencias` decimal(10,2) DEFAULT 0.00,
  `total_otros` decimal(10,2) DEFAULT 0.00,
  `diferencia` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `total_yape` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_plin` decimal(10,2) NOT NULL DEFAULT 0.00,
  `egreso_honorarios` decimal(10,2) NOT NULL DEFAULT 0.00,
  `egreso_lab_ref` decimal(10,2) NOT NULL DEFAULT 0.00,
  `egreso_operativo` decimal(10,2) NOT NULL DEFAULT 0.00,
  `egreso_electronico` decimal(10,2) DEFAULT 0.00,
  `total_egresos` decimal(10,2) NOT NULL DEFAULT 0.00,
  `ganancia_dia` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cie10`
--

CREATE TABLE `cie10` (
  `id` int(11) NOT NULL,
  `codigo` varchar(10) NOT NULL,
  `nombre` varchar(500) NOT NULL,
  `categoria` varchar(100) DEFAULT NULL,
  `subcategoria` varchar(100) DEFAULT NULL,
  `descripcion` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cierre_caja_detalle`
--

CREATE TABLE `cierre_caja_detalle` (
  `id` int(11) NOT NULL,
  `caja_id` int(11) NOT NULL,
  `usuario_cierre_id` int(11) NOT NULL,
  `efectivo_sistema` decimal(10,2) DEFAULT 0.00,
  `efectivo_contado` decimal(10,2) DEFAULT 0.00,
  `diferencia_efectivo` decimal(10,2) DEFAULT 0.00,
  `tarjetas_sistema` decimal(10,2) DEFAULT 0.00,
  `tarjetas_contado` decimal(10,2) DEFAULT 0.00,
  `diferencia_tarjetas` decimal(10,2) DEFAULT 0.00,
  `transferencias_sistema` decimal(10,2) DEFAULT 0.00,
  `transferencias_contado` decimal(10,2) DEFAULT 0.00,
  `diferencia_transferencias` decimal(10,2) DEFAULT 0.00,
  `otros_sistema` decimal(10,2) DEFAULT 0.00,
  `otros_contado` decimal(10,2) DEFAULT 0.00,
  `diferencia_otros` decimal(10,2) DEFAULT 0.00,
  `diferencia_total` decimal(10,2) DEFAULT 0.00,
  `observaciones` text DEFAULT NULL,
  `fecha_cierre` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cobros`
--

CREATE TABLE `cobros` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `fecha_cobro` datetime DEFAULT current_timestamp(),
  `total` decimal(10,2) NOT NULL,
  `tipo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') NOT NULL,
  `estado` enum('pendiente','pagado','anulado','devolucion') DEFAULT 'pendiente',
  `observaciones` text DEFAULT NULL,
  `turno` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Tabla de cobros - paciente_id puede ser NULL para pacientes no registrados';

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cobros_detalle`
--

CREATE TABLE `cobros_detalle` (
  `id` int(11) NOT NULL,
  `cobro_id` int(11) NOT NULL,
  `servicio_tipo` varchar(50) NOT NULL,
  `servicio_id` int(11) DEFAULT NULL,
  `descripcion` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `cantidad` int(11) DEFAULT 1,
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `configuracion_clinica`
--

CREATE TABLE `configuracion_clinica` (
  `id` int(11) NOT NULL,
  `nombre_clinica` varchar(255) NOT NULL,
  `direccion` text NOT NULL,
  `telefono` varchar(20) NOT NULL,
  `email` varchar(100) NOT NULL,
  `horario_atencion` text DEFAULT NULL,
  `logo_url` varchar(500) DEFAULT NULL,
  `logo_laboratorio_url` varchar(255) DEFAULT NULL,
  `logo_laboratorio_size_pdf` int(11) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `ruc` varchar(20) DEFAULT NULL,
  `especialidades` text DEFAULT NULL,
  `mision` text DEFAULT NULL,
  `vision` text DEFAULT NULL,
  `valores` text DEFAULT NULL,
  `director_general` varchar(255) DEFAULT NULL,
  `jefe_enfermeria` varchar(255) DEFAULT NULL,
  `contacto_emergencias` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tema_preset` varchar(30) NOT NULL DEFAULT 'purple',
  `tema_primary` varchar(7) NOT NULL DEFAULT '#7c3aed',
  `tema_primary_dark` varchar(7) NOT NULL DEFAULT '#5b21b6',
  `tema_primary_light` varchar(7) NOT NULL DEFAULT '#ede9fe',
  `tema_secondary` varchar(7) NOT NULL DEFAULT '#4338ca',
  `tema_accent` varchar(7) NOT NULL DEFAULT '#6366f1',
  `tema_navbar_bg` varchar(7) NOT NULL DEFAULT '#6b21a8',
  `tema_sidebar_from` varchar(7) NOT NULL DEFAULT '#9333ea',
  `tema_sidebar_via` varchar(7) NOT NULL DEFAULT '#7e22ce',
  `tema_sidebar_to` varchar(7) NOT NULL DEFAULT '#3730a3',
  `tema_login_from` varchar(7) NOT NULL DEFAULT '#1e3a8a',
  `tema_login_via` varchar(7) NOT NULL DEFAULT '#6b21a8',
  `tema_login_to` varchar(7) NOT NULL DEFAULT '#312e81',
  `tema_public_layout` varchar(20) NOT NULL DEFAULT 'classic',
  `celular` varchar(30) DEFAULT NULL,
  `google_maps_embed` text DEFAULT NULL,
  `slogan` varchar(255) DEFAULT NULL,
  `slogan_color` varchar(20) DEFAULT NULL,
  `nombre_color` varchar(20) DEFAULT NULL,
  `nombre_font_size` varchar(10) DEFAULT NULL,
  `logo_size_sistema` varchar(10) DEFAULT NULL,
  `logo_size_publico` varchar(10) DEFAULT NULL,
  `logo_shape_sistema` varchar(10) DEFAULT 'auto',
  `hc_template_mode` varchar(20) DEFAULT 'auto',
  `hc_template_single_id` varchar(100) DEFAULT NULL,
  `caratula_fondo_url` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `configuracion_honorarios_medicos`
--

CREATE TABLE `configuracion_honorarios_medicos` (
  `id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `tarifa_id` int(11) DEFAULT NULL,
  `especialidad` varchar(100) DEFAULT NULL,
  `tipo_servicio` enum('consulta','procedimiento','cirugia','interconsulta','otros') NOT NULL DEFAULT 'consulta',
  `porcentaje_clinica` decimal(5,2) NOT NULL,
  `porcentaje_medico` decimal(5,2) NOT NULL,
  `monto_fijo_clinica` decimal(10,2) DEFAULT NULL,
  `monto_fijo_medico` decimal(10,2) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `vigencia_desde` date DEFAULT NULL,
  `vigencia_hasta` date DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `config_apariencia`
--

CREATE TABLE `config_apariencia` (
  `id` int(11) NOT NULL,
  `tipo` varchar(50) NOT NULL DEFAULT 'avatar',
  `clave` varchar(100) NOT NULL,
  `valor` text NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 0,
  `order_index` int(11) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `consultas`
--

CREATE TABLE `consultas` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `estado` enum('pendiente','falta_cancelar','completada','cancelada') DEFAULT 'pendiente',
  `tipo_consulta` enum('programada','espontanea') DEFAULT 'programada',
  `clasificacion` varchar(32) DEFAULT NULL,
  `triaje_realizado` tinyint(1) NOT NULL DEFAULT 0,
  `cobro_id` int(11) DEFAULT NULL,
  `es_reprogramada` tinyint(1) NOT NULL DEFAULT 0,
  `reprogramada_en` datetime DEFAULT NULL,
  `hc_origen_id` int(11) DEFAULT NULL COMMENT 'ID de la Historia Clínica origen si vino de próxima cita',
  `origen_creacion` varchar(20) NOT NULL DEFAULT 'agendada' COMMENT 'Origen del flujo: agendada|cotizador|hc_proxima',
  `es_control` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 = cita de control sin costo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizaciones`
--

CREATE TABLE `cotizaciones` (
  `id` int(11) NOT NULL,
  `numero_comprobante` varchar(30) DEFAULT NULL,
  `paciente_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `total_pagado` decimal(10,2) NOT NULL DEFAULT 0.00,
  `saldo_pendiente` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fecha` datetime DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estado` varchar(20) DEFAULT 'pendiente',
  `version_actual` int(11) NOT NULL DEFAULT 1,
  `cotizacion_padre_id` int(11) DEFAULT NULL,
  `es_adenda` tinyint(1) NOT NULL DEFAULT 0,
  `observaciones` varchar(255) DEFAULT NULL,
  `anulado_por` int(11) DEFAULT NULL,
  `anulado_en` datetime DEFAULT NULL,
  `motivo_anulacion` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizaciones_detalle`
--

CREATE TABLE `cotizaciones_detalle` (
  `id` int(11) NOT NULL,
  `cotizacion_id` int(11) NOT NULL,
  `servicio_tipo` varchar(30) NOT NULL,
  `servicio_id` int(11) DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `cantidad` int(11) DEFAULT 1,
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `estado_item` varchar(20) NOT NULL DEFAULT 'activo',
  `version_item` int(11) NOT NULL DEFAULT 1,
  `detalle_padre_id` int(11) DEFAULT NULL,
  `editado_por` int(11) DEFAULT NULL,
  `editado_en` datetime DEFAULT NULL,
  `motivo_edicion` varchar(255) DEFAULT NULL,
  `consulta_id` int(11) DEFAULT NULL,
  `medico_id` int(11) DEFAULT NULL,
  `derivado` tinyint(1) NOT NULL DEFAULT 0,
  `tipo_derivacion` varchar(50) DEFAULT NULL,
  `valor_derivacion` decimal(10,2) DEFAULT NULL,
  `laboratorio_referencia` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizaciones_farmacia`
--

CREATE TABLE `cotizaciones_farmacia` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `fecha` datetime DEFAULT current_timestamp(),
  `estado` varchar(20) DEFAULT 'pendiente',
  `observaciones` varchar(255) DEFAULT NULL,
  `paciente_dni` varchar(20) DEFAULT NULL,
  `paciente_nombre` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizaciones_farmacia_detalle`
--

CREATE TABLE `cotizaciones_farmacia_detalle` (
  `id` int(11) NOT NULL,
  `cotizacion_id` int(11) NOT NULL,
  `medicamento_id` int(11) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `cantidad` int(11) DEFAULT 1,
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizacion_eventos`
--

CREATE TABLE `cotizacion_eventos` (
  `id` int(11) NOT NULL,
  `cotizacion_id` int(11) NOT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `evento_tipo` enum('creada','editada','item_agregado','item_modificado','item_eliminado','anulada','reactivada','cobro_registrado','devolucion_parcial','saldo_actualizado','adenda_creada') NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `motivo` varchar(255) DEFAULT NULL,
  `payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `ip_origen` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizacion_farmacia_vinculos`
--

CREATE TABLE `cotizacion_farmacia_vinculos` (
  `id` int(11) NOT NULL,
  `cotizacion_id` int(11) NOT NULL,
  `cotizacion_farmacia_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizacion_item_ajustes`
--

CREATE TABLE `cotizacion_item_ajustes` (
  `id` int(11) NOT NULL,
  `cotizacion_id` int(11) NOT NULL,
  `cotizacion_detalle_id` int(11) DEFAULT NULL,
  `servicio_tipo` varchar(30) NOT NULL,
  `servicio_id` int(11) DEFAULT NULL,
  `accion` enum('quitar','agregar','modificar_cantidad','modificar_precio') NOT NULL,
  `cantidad_anterior` int(11) DEFAULT NULL,
  `cantidad_nueva` int(11) DEFAULT NULL,
  `precio_anterior` decimal(10,2) DEFAULT NULL,
  `precio_nuevo` decimal(10,2) DEFAULT NULL,
  `subtotal_anterior` decimal(10,2) DEFAULT NULL,
  `subtotal_nuevo` decimal(10,2) DEFAULT NULL,
  `motivo` varchar(255) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizacion_movimientos`
--

CREATE TABLE `cotizacion_movimientos` (
  `id` int(11) NOT NULL,
  `cotizacion_id` int(11) NOT NULL,
  `cobro_id` int(11) DEFAULT NULL,
  `tipo_movimiento` enum('cargo','abono','devolucion','ajuste') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `saldo_anterior` decimal(10,2) NOT NULL,
  `saldo_nuevo` decimal(10,2) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `descuentos_aplicados`
--

CREATE TABLE `descuentos_aplicados` (
  `id` int(11) NOT NULL,
  `cobro_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `usuario_nombre` varchar(100) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `paciente_nombre` varchar(100) NOT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `servicio` varchar(50) NOT NULL,
  `monto_original` decimal(10,2) NOT NULL,
  `tipo_descuento` varchar(20) NOT NULL,
  `valor_descuento` decimal(10,2) NOT NULL,
  `monto_descuento` decimal(10,2) NOT NULL,
  `monto_final` decimal(10,2) NOT NULL,
  `motivo` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `disponibilidad_medicos`
--

CREATE TABLE `disponibilidad_medicos` (
  `id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `fecha` date DEFAULT NULL,
  `dia_semana` enum('lunes','martes','miércoles','jueves','viernes','sábado','domingo') NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `documentos_externos_archivos`
--

CREATE TABLE `documentos_externos_archivos` (
  `id` int(11) NOT NULL,
  `documento_id` int(11) NOT NULL,
  `nombre_original` varchar(255) NOT NULL DEFAULT '',
  `archivo_path` varchar(500) NOT NULL DEFAULT '',
  `tamano` int(11) DEFAULT 0,
  `fecha` datetime DEFAULT current_timestamp(),
  `mime_type` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `documentos_externos_paciente`
--

CREATE TABLE `documentos_externos_paciente` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `tipo` varchar(50) NOT NULL DEFAULT 'laboratorio',
  `titulo` varchar(200) NOT NULL DEFAULT '',
  `descripcion` text DEFAULT NULL,
  `orden_id` int(11) DEFAULT NULL,
  `cobro_id` int(11) DEFAULT NULL,
  `cotizacion_id` int(11) DEFAULT NULL,
  `subido_por_usuario_id` int(11) DEFAULT NULL,
  `fecha` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `egresos`
--

CREATE TABLE `egresos` (
  `id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `categoria` varchar(100) NOT NULL,
  `concepto` varchar(255) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `responsable` varchar(100) NOT NULL,
  `estado` varchar(20) DEFAULT 'pendiente',
  `observaciones` text DEFAULT NULL,
  `honorario_movimiento_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `caja_id` int(11) DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','tarjeta','yape','plin','cheque','deposito') NOT NULL DEFAULT 'efectivo',
  `tipo_egreso` varchar(50) DEFAULT NULL,
  `turno` enum('mañana','tarde','noche') NOT NULL DEFAULT 'mañana',
  `hora` time DEFAULT NULL,
  `descripcion` text DEFAULT NULL,
  `liquidacion_id` int(11) DEFAULT NULL,
  `medico_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `examenes_laboratorio`
--

CREATE TABLE `examenes_laboratorio` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `categoria` varchar(100) DEFAULT NULL,
  `metodologia` varchar(100) DEFAULT NULL,
  `valores_referenciales` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `precio_publico` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `tipo_tubo` varchar(50) DEFAULT NULL,
  `tipo_frasco` varchar(50) DEFAULT NULL,
  `tiempo_resultado` varchar(50) DEFAULT NULL,
  `condicion_paciente` varchar(100) DEFAULT NULL,
  `preanalitica` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `hc_templates`
--

CREATE TABLE `hc_templates` (
  `id` int(11) NOT NULL,
  `template_id` varchar(100) NOT NULL,
  `version` varchar(50) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `schema_version` varchar(20) NOT NULL DEFAULT '2.0',
  `source` varchar(50) NOT NULL DEFAULT 'clinica_override',
  `clinic_key` varchar(120) DEFAULT NULL,
  `schema_json` longtext NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `historia_clinica`
--

CREATE TABLE `historia_clinica` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) NOT NULL,
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha_registro` datetime DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `historia_clinica_backups`
--

CREATE TABLE `historia_clinica_backups` (
  `id` bigint(20) NOT NULL,
  `batch_id` varchar(80) NOT NULL,
  `historia_id` bigint(20) NOT NULL,
  `consulta_id` bigint(20) NOT NULL,
  `datos_json` longtext NOT NULL,
  `backup_reason` varchar(80) NOT NULL DEFAULT 'policy_change_pin',
  `actor` varchar(180) DEFAULT NULL,
  `template_id_resuelto` varchar(150) DEFAULT NULL,
  `template_version_resuelta` varchar(60) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `honorarios_medicos_movimientos`
--

CREATE TABLE `honorarios_medicos_movimientos` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) DEFAULT NULL,
  `cobro_id` int(11) DEFAULT NULL,
  `medico_id` int(11) NOT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `caja_id` int(11) DEFAULT NULL,
  `tarifa_id` int(11) DEFAULT NULL,
  `tipo_precio` enum('particular','seguro','convenio') DEFAULT 'particular',
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `tipo_servicio` enum('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias','operacion','hospitalizacion') DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `tarifa_total` decimal(10,2) NOT NULL,
  `monto_clinica` decimal(10,2) NOT NULL,
  `monto_medico` decimal(10,2) NOT NULL,
  `porcentaje_aplicado_clinica` decimal(5,2) NOT NULL,
  `porcentaje_aplicado_medico` decimal(5,2) NOT NULL,
  `estado_pago_medico` enum('pendiente','pagado','cancelado') DEFAULT 'pendiente',
  `fecha_pago_medico` date DEFAULT NULL,
  `metodo_pago_medico` enum('efectivo','transferencia','cheque','deposito','tarjeta','yape','plin') DEFAULT NULL,
  `liquidacion_id` int(11) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `turno` enum('mañana','tarde','noche') NOT NULL DEFAULT 'mañana'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ingresos`
--

CREATE TABLE `ingresos` (
  `id` int(11) NOT NULL,
  `caja_id` int(11) NOT NULL,
  `area` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros') NOT NULL,
  `tipo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','otros') NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `fecha_hora` datetime NOT NULL,
  `usuario_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ingresos_diarios`
--

CREATE TABLE `ingresos_diarios` (
  `id` int(11) NOT NULL,
  `caja_id` int(11) NOT NULL,
  `tipo_ingreso` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros','operaciones') NOT NULL,
  `area` varchar(100) NOT NULL,
  `descripcion` text NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') DEFAULT NULL,
  `referencia_id` int(11) DEFAULT NULL,
  `referencia_tabla` varchar(50) DEFAULT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `paciente_nombre` varchar(255) DEFAULT NULL,
  `fecha_hora` timestamp NULL DEFAULT current_timestamp(),
  `usuario_id` int(11) NOT NULL,
  `honorario_movimiento_id` int(11) DEFAULT NULL,
  `turno` enum('mañana','tarde','noche') NOT NULL DEFAULT 'mañana',
  `cobrado_por` int(11) DEFAULT NULL,
  `liquidado_por` int(11) DEFAULT NULL,
  `fecha_liquidacion` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario_consumos_examen`
--

CREATE TABLE `inventario_consumos_examen` (
  `id` int(11) NOT NULL,
  `orden_id` int(11) DEFAULT NULL,
  `cobro_id` int(11) DEFAULT NULL,
  `consulta_id` int(11) DEFAULT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `id_examen` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `cantidad_consumida` decimal(12,4) NOT NULL,
  `origen_evento` varchar(30) NOT NULL DEFAULT 'resultado',
  `estado` varchar(20) NOT NULL DEFAULT 'aplicado',
  `usuario_id` int(11) DEFAULT NULL,
  `observacion` varchar(255) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario_examen_recetas`
--

CREATE TABLE `inventario_examen_recetas` (
  `id` int(11) NOT NULL,
  `id_examen` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `cantidad_por_prueba` decimal(12,4) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `observacion` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario_items`
--

CREATE TABLE `inventario_items` (
  `id` int(11) NOT NULL,
  `codigo` varchar(40) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `categoria` varchar(30) NOT NULL,
  `marca` varchar(80) DEFAULT NULL,
  `presentacion` varchar(120) DEFAULT NULL,
  `factor_presentacion` decimal(12,4) NOT NULL DEFAULT 1.0000,
  `unidad_medida` varchar(30) NOT NULL,
  `controla_stock` tinyint(1) NOT NULL DEFAULT 1,
  `stock_minimo` decimal(12,2) NOT NULL DEFAULT 0.00,
  `stock_critico` decimal(12,2) NOT NULL DEFAULT 0.00,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario_lotes`
--

CREATE TABLE `inventario_lotes` (
  `id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `lote_codigo` varchar(80) NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `cantidad_inicial` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cantidad_actual` decimal(12,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario_movimientos`
--

CREATE TABLE `inventario_movimientos` (
  `id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `lote_id` int(11) DEFAULT NULL,
  `tipo` varchar(20) NOT NULL,
  `cantidad` decimal(12,2) NOT NULL,
  `observacion` varchar(255) DEFAULT NULL,
  `origen` varchar(30) NOT NULL DEFAULT 'inventario',
  `usuario_id` int(11) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario_transferencias`
--

CREATE TABLE `inventario_transferencias` (
  `id` int(11) NOT NULL,
  `origen` varchar(50) NOT NULL DEFAULT 'almacen_principal',
  `destino` varchar(50) NOT NULL DEFAULT 'laboratorio',
  `usuario_id` int(11) DEFAULT NULL,
  `observacion` varchar(255) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inventario_transferencias_detalle`
--

CREATE TABLE `inventario_transferencias_detalle` (
  `id` int(11) NOT NULL,
  `transferencia_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `cantidad` decimal(12,4) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `laboratorio_referencia_movimientos`
--

CREATE TABLE `laboratorio_referencia_movimientos` (
  `id` int(11) NOT NULL,
  `cobro_id` int(11) NOT NULL,
  `cotizacion_id` int(11) DEFAULT NULL,
  `examen_id` int(11) NOT NULL,
  `laboratorio` varchar(100) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `tipo` varchar(20) NOT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'pendiente',
  `paciente_id` int(11) DEFAULT NULL,
  `cobrado_por` int(11) DEFAULT NULL,
  `liquidado_por` int(11) DEFAULT NULL,
  `caja_id` int(11) DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `turno_cobro` varchar(50) DEFAULT NULL,
  `hora_cobro` varchar(8) DEFAULT NULL,
  `turno_liquidacion` varchar(50) DEFAULT NULL,
  `hora_liquidacion` varchar(8) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `liquidaciones_medicos`
--

CREATE TABLE `liquidaciones_medicos` (
  `id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `periodo_desde` date NOT NULL,
  `periodo_hasta` date NOT NULL,
  `total_bruto` decimal(10,2) NOT NULL,
  `descuentos` decimal(10,2) DEFAULT 0.00,
  `total_neto` decimal(10,2) NOT NULL,
  `estado` enum('borrador','aprobada','pagada','cancelada') DEFAULT 'borrador',
  `fecha_aprobacion` date DEFAULT NULL,
  `fecha_pago` date DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','cheque','deposito') DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `usuario_aprobacion` varchar(100) DEFAULT NULL,
  `usuario_pago` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `log_eliminaciones`
--

CREATE TABLE `log_eliminaciones` (
  `id` int(11) NOT NULL,
  `cobro_id` int(11) NOT NULL,
  `cobros_detalle_id` int(11) DEFAULT NULL,
  `servicio_tipo` varchar(50) NOT NULL,
  `item_json` text NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `caja_id` int(11) DEFAULT NULL,
  `motivo` text DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `log_reaperturas`
--

CREATE TABLE `log_reaperturas` (
  `id` int(11) NOT NULL,
  `caja_id` int(11) NOT NULL,
  `fecha_reapertura` timestamp NULL DEFAULT current_timestamp(),
  `usuario_id` int(11) NOT NULL,
  `usuario_nombre` varchar(100) DEFAULT NULL,
  `motivo` text DEFAULT NULL,
  `datos_cierre_anterior` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `medicamentos`
--

CREATE TABLE `medicamentos` (
  `id` int(11) NOT NULL,
  `codigo` varchar(30) DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `presentacion` varchar(50) DEFAULT NULL,
  `concentracion` varchar(50) DEFAULT NULL,
  `laboratorio` varchar(100) DEFAULT NULL,
  `stock` int(11) DEFAULT 0,
  `unidades_por_caja` int(11) NOT NULL DEFAULT 1,
  `fecha_vencimiento` date DEFAULT NULL,
  `estado` enum('activo','inactivo','cuarentena') DEFAULT 'activo',
  `fecha_cuarentena` date DEFAULT NULL,
  `motivo_cuarentena` varchar(255) DEFAULT NULL,
  `fecha_registro` timestamp NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `precio_compra` decimal(10,2) NOT NULL DEFAULT 0.00,
  `margen_ganancia` decimal(5,2) NOT NULL DEFAULT 30.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `medicos`
--

CREATE TABLE `medicos` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `especialidad` varchar(100) DEFAULT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `rol` varchar(50) DEFAULT 'medico',
  `firma` longtext DEFAULT NULL COMMENT 'Firma digital del médico en base64',
  `apellido` varchar(100) DEFAULT NULL,
  `cmp` varchar(20) DEFAULT NULL,
  `rne` varchar(20) DEFAULT NULL,
  `tipo_profesional` varchar(30) NOT NULL DEFAULT 'medico',
  `abreviatura_profesional` varchar(20) NOT NULL DEFAULT 'Dr(a).',
  `colegio_sigla` varchar(20) DEFAULT NULL,
  `nro_colegiatura` varchar(30) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `medico_adelantos`
--

CREATE TABLE `medico_adelantos` (
  `id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `motivo` varchar(255) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `estado` enum('activo','anulado') NOT NULL DEFAULT 'activo',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `medico_condiciones_pago`
--

CREATE TABLE `medico_condiciones_pago` (
  `id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `modalidad_pago` enum('acto','hora') NOT NULL DEFAULT 'acto',
  `monto_hora` decimal(10,2) DEFAULT NULL,
  `frecuencia_pago` enum('quincenal','mensual') NOT NULL DEFAULT 'mensual',
  `permite_adelanto` tinyint(1) NOT NULL DEFAULT 0,
  `tope_adelanto_periodo` decimal(10,2) DEFAULT NULL,
  `vigencia_desde` date NOT NULL DEFAULT curdate(),
  `vigencia_hasta` date DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `metodos_pago`
--

CREATE TABLE `metodos_pago` (
  `id` int(11) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `codigo` varchar(20) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `requiere_referencia` tinyint(1) DEFAULT 0,
  `activo` tinyint(1) DEFAULT 1,
  `orden_visualizacion` int(11) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `movimientos_medicamento`
--

CREATE TABLE `movimientos_medicamento` (
  `id` int(11) NOT NULL,
  `medicamento_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `medico_id` int(11) DEFAULT NULL,
  `cantidad` int(11) NOT NULL,
  `tipo_movimiento` varchar(20) NOT NULL,
  `fecha_hora` datetime DEFAULT current_timestamp(),
  `observaciones` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ordenes_imagen`
--

CREATE TABLE `ordenes_imagen` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `tipo` varchar(30) NOT NULL DEFAULT 'rx',
  `indicaciones` text DEFAULT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'pendiente',
  `fecha` datetime DEFAULT current_timestamp(),
  `solicitado_por` int(11) DEFAULT NULL,
  `cotizacion_id` int(11) DEFAULT NULL,
  `carga_anticipada` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ordenes_imagen_archivos`
--

CREATE TABLE `ordenes_imagen_archivos` (
  `id` int(11) NOT NULL,
  `orden_id` int(11) NOT NULL,
  `nombre_original` varchar(255) NOT NULL DEFAULT '',
  `archivo_path` varchar(500) NOT NULL DEFAULT '',
  `tamano` int(11) DEFAULT 0,
  `mime_type` varchar(100) DEFAULT NULL,
  `fecha` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ordenes_laboratorio`
--

CREATE TABLE `ordenes_laboratorio` (
  `id` int(11) NOT NULL,
  `cobro_id` int(11) DEFAULT NULL,
  `consulta_id` int(11) DEFAULT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `examenes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha` datetime DEFAULT current_timestamp(),
  `estado` varchar(20) DEFAULT 'pendiente',
  `cotizacion_id` int(11) DEFAULT NULL,
  `carga_anticipada` tinyint(1) NOT NULL DEFAULT 0
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `pacientes`
--

CREATE TABLE `pacientes` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `apellido` varchar(100) NOT NULL,
  `historia_clinica` varchar(30) NOT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `edad` varchar(20) DEFAULT NULL,
  `edad_unidad` enum('días','meses','años') DEFAULT NULL,
  `procedencia` varchar(100) DEFAULT NULL,
  `tipo_seguro` varchar(100) DEFAULT NULL,
  `sexo` enum('M','F') NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `dni` varchar(15) NOT NULL,
  `creado_en` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `public_banners`
--

CREATE TABLE `public_banners` (
  `id` int(11) NOT NULL,
  `titulo` varchar(255) DEFAULT NULL,
  `subtitulo` varchar(255) DEFAULT NULL,
  `imagen_url` text NOT NULL,
  `imagen_fija_url` text DEFAULT NULL,
  `imagen_conocenos_url` varchar(500) DEFAULT NULL,
  `overlay_blanco` tinyint(1) NOT NULL DEFAULT 1,
  `texto_lado` varchar(10) NOT NULL DEFAULT 'left',
  `titulo_color` varchar(20) DEFAULT NULL,
  `subtitulo_color` varchar(20) DEFAULT NULL,
  `titulo_tamano` varchar(10) NOT NULL DEFAULT 'lg',
  `subtitulo_tamano` varchar(10) NOT NULL DEFAULT 'md',
  `orden` int(11) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `public_ofertas`
--

CREATE TABLE `public_ofertas` (
  `id` int(11) NOT NULL,
  `titulo` varchar(200) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `precio_antes` decimal(10,2) DEFAULT NULL,
  `precio_oferta` decimal(10,2) DEFAULT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `imagen_url` varchar(255) DEFAULT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `public_servicios`
--

CREATE TABLE `public_servicios` (
  `id` int(11) NOT NULL,
  `titulo` varchar(200) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `icono` varchar(120) DEFAULT NULL,
  `imagen_url` varchar(255) DEFAULT NULL,
  `tipo` enum('clasico','premium') NOT NULL DEFAULT 'clasico',
  `imagen_shape` enum('square','rounded','circle') NOT NULL DEFAULT 'rounded',
  `imagen_tipo` enum('normal','overlay') NOT NULL DEFAULT 'normal',
  `precio` decimal(10,2) DEFAULT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `recordatorios_consultas`
--

CREATE TABLE `recordatorios_consultas` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) NOT NULL,
  `estado` varchar(30) NOT NULL DEFAULT 'pendiente',
  `observacion` text DEFAULT NULL,
  `fecha_proximo_contacto` datetime DEFAULT NULL,
  `fecha_ultimo_contacto` datetime DEFAULT NULL,
  `intentos` int(11) NOT NULL DEFAULT 0,
  `actualizado_por` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `resultados_laboratorio`
--

CREATE TABLE `resultados_laboratorio` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) DEFAULT NULL,
  `orden_id` int(11) DEFAULT NULL,
  `tipo_examen` varchar(100) DEFAULT NULL,
  `resultados` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `firmado_por_usuario_id` int(11) DEFAULT NULL,
  `fecha` datetime DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `seguros`
--

CREATE TABLE `seguros` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `numero` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tarifas`
--

CREATE TABLE `tarifas` (
  `id` int(11) NOT NULL,
  `servicio_tipo` enum('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias','operacion','hospitalizacion') DEFAULT NULL,
  `servicio_id` int(11) DEFAULT NULL,
  `descripcion` varchar(255) NOT NULL,
  `precio_particular` decimal(10,2) NOT NULL,
  `precio_seguro` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `medico_id` int(11) DEFAULT NULL,
  `porcentaje_medico` decimal(5,2) DEFAULT NULL,
  `porcentaje_clinica` decimal(5,2) DEFAULT NULL,
  `monto_medico` decimal(10,2) DEFAULT NULL,
  `monto_clinica` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `triaje`
--

CREATE TABLE `triaje` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) NOT NULL,
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha_registro` timestamp NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `usuario` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `dni` varchar(15) NOT NULL,
  `profesion` varchar(100) NOT NULL,
  `firma_reportes` longtext DEFAULT NULL,
  `colegiatura_tipo` varchar(80) DEFAULT NULL,
  `colegiatura_numero` varchar(60) DEFAULT NULL,
  `cargo_firma` varchar(120) DEFAULT NULL,
  `permisos` text DEFAULT NULL,
  `rol` enum('administrador','recepcionista','laboratorista','enfermero','quimico') NOT NULL DEFAULT 'recepcionista',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `vw_cotizaciones_resumen_diario`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `vw_cotizaciones_resumen_diario` (
`id` int(11)
,`numero_comprobante` varchar(30)
,`fecha` datetime
,`fecha_dia` date
,`estado` varchar(20)
,`total` decimal(10,2)
,`total_pagado` decimal(10,2)
,`saldo_pendiente` decimal(10,2)
,`version_actual` int(11)
,`paciente_id` int(11)
,`paciente_nombre` varchar(201)
,`paciente_dni` varchar(15)
,`historia_clinica` varchar(30)
,`usuario_id` int(11)
,`usuario_cotizo` varchar(100)
,`total_items` bigint(21)
,`total_servicios` bigint(21)
);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `atenciones`
--
ALTER TABLE `atenciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_atenciones_fecha_paciente` (`fecha`,`paciente_id`);

--
-- Indices de la tabla `cajas`
--
ALTER TABLE `cajas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_fecha_usuario` (`fecha`,`usuario_id`),
  ADD KEY `idx_fecha` (`fecha`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_cajas_estado_fecha` (`estado`,`fecha`),
  ADD KEY `idx_cajas_usuario_id` (`usuario_id`),
  ADD KEY `idx_cajas_fecha_estado` (`fecha`,`estado`);

--
-- Indices de la tabla `cie10`
--
ALTER TABLE `cie10`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `idx_codigo` (`codigo`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_categoria` (`categoria`);
ALTER TABLE `cie10` ADD FULLTEXT KEY `nombre` (`nombre`,`descripcion`);

--
-- Indices de la tabla `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_cierre_id` (`usuario_cierre_id`);

--
-- Indices de la tabla `cobros`
--
ALTER TABLE `cobros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_cobros_paciente` (`paciente_id`),
  ADD KEY `idx_cobros_fecha` (`fecha_cobro`),
  ADD KEY `idx_cobros_estado` (`estado`),
  ADD KEY `idx_cobros_estado_fecha` (`estado`,`fecha_cobro`);

--
-- Indices de la tabla `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cobro_id` (`cobro_id`),
  ADD KEY `idx_cobros_detalle_cobro_id` (`cobro_id`);

--
-- Indices de la tabla `configuracion_clinica`
--
ALTER TABLE `configuracion_clinica`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_configuracion_email` (`email`),
  ADD KEY `idx_configuracion_created` (`created_at`);

--
-- Indices de la tabla `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_medico_servicio` (`medico_id`,`tipo_servicio`),
  ADD KEY `idx_vigencia` (`vigencia_desde`,`vigencia_hasta`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indices de la tabla `config_apariencia`
--
ALTER TABLE `config_apariencia`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `clave` (`clave`),
  ADD KEY `idx_config_tipo_clave` (`tipo`,`clave`),
  ADD KEY `idx_config_activo` (`activo`),
  ADD KEY `idx_config_apariencia_tipo` (`tipo`);

--
-- Indices de la tabla `consultas`
--
ALTER TABLE `consultas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `medico_id` (`medico_id`),
  ADD KEY `cobro_id` (`cobro_id`),
  ADD KEY `idx_consultas_medico_fecha_hora` (`medico_id`,`fecha`,`hora`),
  ADD KEY `idx_consultas_paciente_fecha_hora` (`paciente_id`,`fecha`,`hora`),
  ADD KEY `idx_hc_origen` (`hc_origen_id`),
  ADD KEY `idx_origen_creacion` (`origen_creacion`),
  ADD KEY `idx_es_control` (`es_control`);

--
-- Indices de la tabla `cotizaciones`
--
ALTER TABLE `cotizaciones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_cotizaciones_numero_comprobante` (`numero_comprobante`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_cotizaciones_estado_fecha` (`estado`,`fecha`),
  ADD KEY `idx_cotizaciones_usuario_fecha` (`usuario_id`,`fecha`),
  ADD KEY `idx_cotizaciones_paciente_fecha` (`paciente_id`,`fecha`),
  ADD KEY `idx_cotizaciones_padre` (`cotizacion_padre_id`),
  ADD KEY `idx_cot_fecha` (`fecha`),
  ADD KEY `idx_cot_estado_fecha` (`estado`,`fecha`),
  ADD KEY `idx_cot_usuario_fecha` (`usuario_id`,`fecha`),
  ADD KEY `idx_cot_paciente_fecha` (`paciente_id`,`fecha`);

--
-- Indices de la tabla `cotizaciones_detalle`
--
ALTER TABLE `cotizaciones_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cotizacion_id` (`cotizacion_id`),
  ADD KEY `idx_cot_detalle_estado` (`estado_item`),
  ADD KEY `idx_cot_detalle_servicio` (`servicio_tipo`,`servicio_id`),
  ADD KEY `idx_cot_detalle_padre` (`detalle_padre_id`),
  ADD KEY `idx_cot_detalle_listado` (`cotizacion_id`,`estado_item`,`servicio_tipo`),
  ADD KEY `idx_cd_cot_estado_serv` (`cotizacion_id`,`estado_item`,`servicio_tipo`);

--
-- Indices de la tabla `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cotizacion_id` (`cotizacion_id`),
  ADD KEY `medicamento_id` (`medicamento_id`);

--
-- Indices de la tabla `cotizacion_eventos`
--
ALTER TABLE `cotizacion_eventos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cotizacion_eventos_cotizacion` (`cotizacion_id`,`created_at`),
  ADD KEY `idx_cotizacion_eventos_tipo` (`evento_tipo`),
  ADD KEY `idx_cotizacion_eventos_usuario` (`usuario_id`);

--
-- Indices de la tabla `cotizacion_farmacia_vinculos`
--
ALTER TABLE `cotizacion_farmacia_vinculos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_cot_farm_vinculo` (`cotizacion_id`,`cotizacion_farmacia_id`),
  ADD KEY `idx_cot_farm_cotizacion` (`cotizacion_id`),
  ADD KEY `idx_cot_farm_farmacia` (`cotizacion_farmacia_id`);

--
-- Indices de la tabla `cotizacion_item_ajustes`
--
ALTER TABLE `cotizacion_item_ajustes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cot_item_ajustes_cotizacion` (`cotizacion_id`,`created_at`),
  ADD KEY `idx_cot_item_ajustes_servicio` (`servicio_tipo`,`servicio_id`);

--
-- Indices de la tabla `cotizacion_movimientos`
--
ALTER TABLE `cotizacion_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cot_mov_cotizacion` (`cotizacion_id`,`created_at`),
  ADD KEY `idx_cot_mov_cobro` (`cobro_id`),
  ADD KEY `idx_cot_mov_tipo` (`tipo_movimiento`);

--
-- Indices de la tabla `descuentos_aplicados`
--
ALTER TABLE `descuentos_aplicados`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cobro_id` (`cobro_id`),
  ADD KEY `idx_usuario_id` (`usuario_id`),
  ADD KEY `idx_paciente_id` (`paciente_id`);

--
-- Indices de la tabla `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medico_id` (`medico_id`);

--
-- Indices de la tabla `documentos_externos_archivos`
--
ALTER TABLE `documentos_externos_archivos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_dea_documento` (`documento_id`);

--
-- Indices de la tabla `documentos_externos_paciente`
--
ALTER TABLE `documentos_externos_paciente`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_dep_paciente` (`paciente_id`),
  ADD KEY `idx_dep_orden_paciente` (`orden_id`,`paciente_id`),
  ADD KEY `idx_dep_paciente_fecha` (`paciente_id`,`fecha`);

--
-- Indices de la tabla `egresos`
--
ALTER TABLE `egresos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_egresos_fecha` (`fecha`),
  ADD KEY `idx_egresos_tipo` (`tipo`),
  ADD KEY `idx_egresos_categoria` (`categoria`),
  ADD KEY `idx_egresos_estado` (`estado`),
  ADD KEY `idx_egresos_honorario` (`honorario_movimiento_id`);

--
-- Indices de la tabla `examenes_laboratorio`
--
ALTER TABLE `examenes_laboratorio`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `hc_templates`
--
ALTER TABLE `hc_templates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_hc_templates_unique` (`template_id`,`version`,`clinic_key`),
  ADD KEY `idx_hc_templates_lookup` (`template_id`,`activo`,`clinic_key`);

--
-- Indices de la tabla `historia_clinica`
--
ALTER TABLE `historia_clinica`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indices de la tabla `historia_clinica_backups`
--
ALTER TABLE `historia_clinica_backups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_hc_backup_batch` (`batch_id`),
  ADD KEY `idx_hc_backup_historia` (`historia_id`),
  ADD KEY `idx_hc_backup_consulta` (`consulta_id`);

--
-- Indices de la tabla `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_movimientos_medico_fecha` (`medico_id`,`fecha`),
  ADD KEY `idx_movimientos_estado_pago` (`estado_pago_medico`),
  ADD KEY `idx_movimientos_liquidacion` (`liquidacion_id`),
  ADD KEY `idx_movimientos_consulta` (`consulta_id`);

--
-- Indices de la tabla `ingresos`
--
ALTER TABLE `ingresos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `ingresos_diarios`
--
ALTER TABLE `ingresos_diarios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_caja_id` (`caja_id`),
  ADD KEY `idx_tipo_ingreso` (`tipo_ingreso`),
  ADD KEY `idx_fecha_hora` (`fecha_hora`),
  ADD KEY `idx_metodo_pago` (`metodo_pago`),
  ADD KEY `idx_paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `inventario_consumos_examen`
--
ALTER TABLE `inventario_consumos_examen`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_consumo_evento_orden` (`orden_id`,`id_examen`,`item_id`,`origen_evento`),
  ADD KEY `idx_inventario_consumo_orden` (`orden_id`),
  ADD KEY `idx_inventario_consumo_cobro` (`cobro_id`),
  ADD KEY `idx_inventario_consumo_examen` (`id_examen`),
  ADD KEY `idx_inventario_consumo_item` (`item_id`),
  ADD KEY `idx_inventario_consumo_fecha` (`fecha_hora`),
  ADD KEY `idx_consumo_estado_item` (`estado`,`item_id`),
  ADD KEY `idx_consumo_repeticion` (`estado`,`origen_evento`,`fecha_hora`,`id`),
  ADD KEY `fk_inventario_consumo_paciente` (`paciente_id`);

--
-- Indices de la tabla `inventario_examen_recetas`
--
ALTER TABLE `inventario_examen_recetas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_inventario_receta_examen_item` (`id_examen`,`item_id`),
  ADD KEY `idx_inventario_receta_examen` (`id_examen`),
  ADD KEY `idx_inventario_receta_item` (`item_id`),
  ADD KEY `idx_inventario_receta_activo` (`activo`);

--
-- Indices de la tabla `inventario_items`
--
ALTER TABLE `inventario_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_inventario_items_codigo` (`codigo`),
  ADD KEY `idx_inventario_items_nombre` (`nombre`),
  ADD KEY `idx_inventario_items_categoria` (`categoria`),
  ADD KEY `idx_inventario_items_controla_stock` (`controla_stock`),
  ADD KEY `idx_inventario_items_activo` (`activo`),
  ADD KEY `idx_inventario_items_created_at` (`created_at`);

--
-- Indices de la tabla `inventario_lotes`
--
ALTER TABLE `inventario_lotes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_inventario_lotes_item` (`item_id`),
  ADD KEY `idx_inventario_lotes_venc` (`fecha_vencimiento`),
  ADD KEY `idx_inventario_lotes_stock` (`cantidad_actual`),
  ADD KEY `idx_inventario_lotes_item_stock_venc` (`item_id`,`cantidad_actual`,`fecha_vencimiento`,`id`),
  ADD KEY `idx_inventario_lotes_venc_stock_item` (`fecha_vencimiento`,`cantidad_actual`,`item_id`);

--
-- Indices de la tabla `inventario_movimientos`
--
ALTER TABLE `inventario_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_inventario_mov_item` (`item_id`),
  ADD KEY `idx_inventario_mov_lote` (`lote_id`),
  ADD KEY `idx_inventario_mov_tipo` (`tipo`),
  ADD KEY `idx_inventario_mov_origen` (`origen`),
  ADD KEY `idx_inventario_mov_fecha` (`fecha_hora`),
  ADD KEY `idx_inventario_mov_fecha_id` (`fecha_hora`,`id`);

--
-- Indices de la tabla `inventario_transferencias`
--
ALTER TABLE `inventario_transferencias`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_inventario_transferencias_fecha` (`fecha_hora`),
  ADD KEY `idx_inventario_transferencias_destino` (`destino`),
  ADD KEY `idx_transfer_destino_id` (`destino`,`id`),
  ADD KEY `idx_transfer_fecha_id` (`fecha_hora`,`id`);

--
-- Indices de la tabla `inventario_transferencias_detalle`
--
ALTER TABLE `inventario_transferencias_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_inventario_transfer_det_transf` (`transferencia_id`),
  ADD KEY `idx_inventario_transfer_det_item` (`item_id`),
  ADD KEY `idx_transfer_det_item_transfer` (`item_id`,`transferencia_id`);

--
-- Indices de la tabla `laboratorio_referencia_movimientos`
--
ALTER TABLE `laboratorio_referencia_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_lrm_cotizacion_id` (`cotizacion_id`);

--
-- Indices de la tabla `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_liquidaciones_medico_periodo` (`medico_id`,`periodo_desde`,`periodo_hasta`),
  ADD KEY `idx_liquidaciones_estado` (`estado`),
  ADD KEY `idx_liquidaciones_fechas` (`fecha_aprobacion`,`fecha_pago`);

--
-- Indices de la tabla `log_eliminaciones`
--
ALTER TABLE `log_eliminaciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cobro_id` (`cobro_id`),
  ADD KEY `idx_usuario_id` (`usuario_id`),
  ADD KEY `idx_servicio_tipo` (`servicio_tipo`),
  ADD KEY `idx_fecha_hora` (`fecha_hora`);

--
-- Indices de la tabla `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `medicamentos`
--
ALTER TABLE `medicamentos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`);

--
-- Indices de la tabla `medicos`
--
ALTER TABLE `medicos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_firma` (`firma`(100)),
  ADD KEY `idx_cmp` (`cmp`),
  ADD KEY `idx_rne` (`rne`);

--
-- Indices de la tabla `medico_adelantos`
--
ALTER TABLE `medico_adelantos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_medico_fecha` (`medico_id`,`fecha`),
  ADD KEY `idx_estado` (`estado`);

--
-- Indices de la tabla `medico_condiciones_pago`
--
ALTER TABLE `medico_condiciones_pago`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_medico_activo` (`medico_id`,`activo`),
  ADD KEY `idx_medico` (`medico_id`);

--
-- Indices de la tabla `metodos_pago`
--
ALTER TABLE `metodos_pago`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nombre` (`nombre`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `idx_codigo` (`codigo`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indices de la tabla `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medicamento_id` (`medicamento_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `ordenes_imagen`
--
ALTER TABLE `ordenes_imagen`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_oi_consulta` (`consulta_id`),
  ADD KEY `idx_oi_paciente` (`paciente_id`);

--
-- Indices de la tabla `ordenes_imagen_archivos`
--
ALTER TABLE `ordenes_imagen_archivos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_oia_orden` (`orden_id`);

--
-- Indices de la tabla `ordenes_laboratorio`
--
ALTER TABLE `ordenes_laboratorio`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`),
  ADD KEY `idx_ol_cot_estado` (`cotizacion_id`,`estado`),
  ADD KEY `idx_ol_estado_fecha_id` (`estado`,`fecha`,`id`),
  ADD KEY `idx_ol_consulta_fecha_id` (`consulta_id`,`fecha`,`id`),
  ADD KEY `idx_ol_paciente_fecha_id` (`paciente_id`,`fecha`,`id`),
  ADD KEY `idx_ol_cotizacion` (`cotizacion_id`);

--
-- Indices de la tabla `pacientes`
--
ALTER TABLE `pacientes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `dni` (`dni`),
  ADD UNIQUE KEY `historia_clinica` (`historia_clinica`),
  ADD KEY `idx_pacientes_dni` (`dni`),
  ADD KEY `idx_pacientes_apellido_nombre` (`apellido`,`nombre`),
  ADD KEY `idx_pacientes_historia` (`historia_clinica`),
  ADD KEY `idx_historia_clinica` (`historia_clinica`),
  ADD KEY `idx_pacientes_historia_clinica` (`historia_clinica`);

--
-- Indices de la tabla `public_banners`
--
ALTER TABLE `public_banners`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_public_banners_activo_orden` (`activo`,`orden`);

--
-- Indices de la tabla `public_ofertas`
--
ALTER TABLE `public_ofertas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_public_ofertas_activo_orden` (`activo`,`orden`),
  ADD KEY `idx_public_ofertas_fechas` (`fecha_inicio`,`fecha_fin`);

--
-- Indices de la tabla `public_servicios`
--
ALTER TABLE `public_servicios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_public_servicios_activo_orden` (`activo`,`orden`);

--
-- Indices de la tabla `recordatorios_consultas`
--
ALTER TABLE `recordatorios_consultas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_recordatorios_consulta` (`consulta_id`),
  ADD KEY `idx_recordatorios_estado` (`estado`),
  ADD KEY `idx_recordatorios_proximo_contacto` (`fecha_proximo_contacto`);

--
-- Indices de la tabla `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`),
  ADD KEY `idx_resultados_firmado_por_usuario` (`firmado_por_usuario_id`),
  ADD KEY `idx_rl_orden_fecha_id` (`orden_id`,`fecha`,`id`),
  ADD KEY `idx_rl_consulta_orden_fecha_id` (`consulta_id`,`orden_id`,`fecha`,`id`),
  ADD KEY `idx_rl_orden_fecha_id_v2` (`orden_id`,`fecha`,`id`);

--
-- Indices de la tabla `seguros`
--
ALTER TABLE `seguros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`);

--
-- Indices de la tabla `tarifas`
--
ALTER TABLE `tarifas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tarifas_servicio` (`servicio_tipo`,`activo`),
  ADD KEY `fk_tarifas_medico` (`medico_id`);

--
-- Indices de la tabla `triaje`
--
ALTER TABLE `triaje`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `usuario` (`usuario`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `atenciones`
--
ALTER TABLE `atenciones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cajas`
--
ALTER TABLE `cajas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cie10`
--
ALTER TABLE `cie10`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cobros`
--
ALTER TABLE `cobros`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `configuracion_clinica`
--
ALTER TABLE `configuracion_clinica`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `config_apariencia`
--
ALTER TABLE `config_apariencia`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `consultas`
--
ALTER TABLE `consultas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizaciones`
--
ALTER TABLE `cotizaciones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizaciones_detalle`
--
ALTER TABLE `cotizaciones_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizacion_eventos`
--
ALTER TABLE `cotizacion_eventos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizacion_farmacia_vinculos`
--
ALTER TABLE `cotizacion_farmacia_vinculos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizacion_item_ajustes`
--
ALTER TABLE `cotizacion_item_ajustes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizacion_movimientos`
--
ALTER TABLE `cotizacion_movimientos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `descuentos_aplicados`
--
ALTER TABLE `descuentos_aplicados`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `documentos_externos_archivos`
--
ALTER TABLE `documentos_externos_archivos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `documentos_externos_paciente`
--
ALTER TABLE `documentos_externos_paciente`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `egresos`
--
ALTER TABLE `egresos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `examenes_laboratorio`
--
ALTER TABLE `examenes_laboratorio`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `hc_templates`
--
ALTER TABLE `hc_templates`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `historia_clinica`
--
ALTER TABLE `historia_clinica`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `historia_clinica_backups`
--
ALTER TABLE `historia_clinica_backups`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ingresos`
--
ALTER TABLE `ingresos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ingresos_diarios`
--
ALTER TABLE `ingresos_diarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `inventario_consumos_examen`
--
ALTER TABLE `inventario_consumos_examen`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `inventario_examen_recetas`
--
ALTER TABLE `inventario_examen_recetas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `inventario_items`
--
ALTER TABLE `inventario_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `inventario_lotes`
--
ALTER TABLE `inventario_lotes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `inventario_movimientos`
--
ALTER TABLE `inventario_movimientos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `inventario_transferencias`
--
ALTER TABLE `inventario_transferencias`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `inventario_transferencias_detalle`
--
ALTER TABLE `inventario_transferencias_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `laboratorio_referencia_movimientos`
--
ALTER TABLE `laboratorio_referencia_movimientos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `log_eliminaciones`
--
ALTER TABLE `log_eliminaciones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `medicamentos`
--
ALTER TABLE `medicamentos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `medicos`
--
ALTER TABLE `medicos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `medico_adelantos`
--
ALTER TABLE `medico_adelantos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `medico_condiciones_pago`
--
ALTER TABLE `medico_condiciones_pago`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `metodos_pago`
--
ALTER TABLE `metodos_pago`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ordenes_imagen`
--
ALTER TABLE `ordenes_imagen`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ordenes_imagen_archivos`
--
ALTER TABLE `ordenes_imagen_archivos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ordenes_laboratorio`
--
ALTER TABLE `ordenes_laboratorio`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `pacientes`
--
ALTER TABLE `pacientes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `public_banners`
--
ALTER TABLE `public_banners`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `public_ofertas`
--
ALTER TABLE `public_ofertas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `public_servicios`
--
ALTER TABLE `public_servicios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `recordatorios_consultas`
--
ALTER TABLE `recordatorios_consultas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `seguros`
--
ALTER TABLE `seguros`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `tarifas`
--
ALTER TABLE `tarifas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `triaje`
--
ALTER TABLE `triaje`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

-- --------------------------------------------------------

--
-- Estructura para la vista `vw_cotizaciones_resumen_diario`
--
DROP TABLE IF EXISTS `vw_cotizaciones_resumen_diario`;

CREATE ALGORITHM=UNDEFINED DEFINER=`u330560936_cardiovida`@`127.0.0.1` SQL SECURITY INVOKER VIEW `vw_cotizaciones_resumen_diario`  AS SELECT `c`.`id` AS `id`, `c`.`numero_comprobante` AS `numero_comprobante`, `c`.`fecha` AS `fecha`, cast(`c`.`fecha` as date) AS `fecha_dia`, `c`.`estado` AS `estado`, `c`.`total` AS `total`, `c`.`total_pagado` AS `total_pagado`, `c`.`saldo_pendiente` AS `saldo_pendiente`, `c`.`version_actual` AS `version_actual`, `c`.`paciente_id` AS `paciente_id`, concat(coalesce(`p`.`nombre`,''),' ',coalesce(`p`.`apellido`,'')) AS `paciente_nombre`, `p`.`dni` AS `paciente_dni`, `p`.`historia_clinica` AS `historia_clinica`, `c`.`usuario_id` AS `usuario_id`, `u`.`nombre` AS `usuario_cotizo`, count(`cd`.`id`) AS `total_items`, count(distinct `cd`.`servicio_tipo`) AS `total_servicios` FROM (((`cotizaciones` `c` left join `pacientes` `p` on(`p`.`id` = `c`.`paciente_id`)) left join `usuarios` `u` on(`u`.`id` = `c`.`usuario_id`)) left join `cotizaciones_detalle` `cd` on(`cd`.`cotizacion_id` = `c`.`id`)) GROUP BY `c`.`id`, `c`.`numero_comprobante`, `c`.`fecha`, cast(`c`.`fecha` as date), `c`.`estado`, `c`.`total`, `c`.`total_pagado`, `c`.`saldo_pendiente`, `c`.`version_actual`, `c`.`paciente_id`, concat(coalesce(`p`.`nombre`,''),' ',coalesce(`p`.`apellido`,'')), `p`.`dni`, `p`.`historia_clinica`, `c`.`usuario_id`, `u`.`nombre` ;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `ingresos`
--
ALTER TABLE `ingresos`
  ADD CONSTRAINT `ingresos_ibfk_1` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`),
  ADD CONSTRAINT `ingresos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Filtros para la tabla `inventario_consumos_examen`
--
ALTER TABLE `inventario_consumos_examen`
  ADD CONSTRAINT `fk_inventario_consumo_examen_lab` FOREIGN KEY (`id_examen`) REFERENCES `examenes_laboratorio` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_consumo_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_consumo_orden_lab` FOREIGN KEY (`orden_id`) REFERENCES `ordenes_laboratorio` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_inventario_consumo_paciente` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `inventario_examen_recetas`
--
ALTER TABLE `inventario_examen_recetas`
  ADD CONSTRAINT `fk_inventario_receta_examen_lab` FOREIGN KEY (`id_examen`) REFERENCES `examenes_laboratorio` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_receta_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `inventario_lotes`
--
ALTER TABLE `inventario_lotes`
  ADD CONSTRAINT `fk_inventario_lotes_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `inventario_movimientos`
--
ALTER TABLE `inventario_movimientos`
  ADD CONSTRAINT `fk_inventario_mov_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_mov_lote` FOREIGN KEY (`lote_id`) REFERENCES `inventario_lotes` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `inventario_transferencias_detalle`
--
ALTER TABLE `inventario_transferencias_detalle`
  ADD CONSTRAINT `fk_inventario_transfer_det_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_transfer_det_transferencia` FOREIGN KEY (`transferencia_id`) REFERENCES `inventario_transferencias` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
