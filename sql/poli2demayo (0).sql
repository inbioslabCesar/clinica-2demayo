-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Apr 10, 2026 at 07:22 AM
-- Server version: 8.4.3
-- PHP Version: 8.3.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `poli2demayo`
--

-- --------------------------------------------------------

--
-- Table structure for table `atenciones`
--

CREATE TABLE `atenciones` (
  `id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `servicio` enum('consulta','laboratorio','farmacia','rayosx','ecografia','procedimiento','operacion','hospitalizacion','ocupacional','procedimientos','cirugias','tratamientos','emergencias') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `estado` enum('pendiente','en_proceso','finalizado') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pendiente',
  `observaciones` text COLLATE utf8mb4_general_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cajas`
--

CREATE TABLE `cajas` (
  `id` int NOT NULL,
  `fecha` date NOT NULL,
  `usuario_id` int NOT NULL,
  `turno` enum('mañana','tarde','noche') COLLATE utf8mb4_general_ci NOT NULL,
  `estado` enum('abierta','en_cierre','cerrada') COLLATE utf8mb4_general_ci DEFAULT 'abierta',
  `monto_apertura` decimal(10,2) NOT NULL DEFAULT '0.00',
  `hora_apertura` time NOT NULL,
  `observaciones_apertura` text COLLATE utf8mb4_general_ci,
  `monto_cierre` decimal(10,2) DEFAULT NULL,
  `monto_contado` decimal(10,2) DEFAULT '0.00',
  `hora_cierre` time DEFAULT NULL,
  `observaciones_cierre` text COLLATE utf8mb4_general_ci,
  `total_efectivo` decimal(10,2) DEFAULT '0.00',
  `total_tarjetas` decimal(10,2) DEFAULT '0.00',
  `total_transferencias` decimal(10,2) DEFAULT '0.00',
  `total_otros` decimal(10,2) DEFAULT '0.00',
  `diferencia` decimal(10,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `total_yape` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_plin` decimal(10,2) NOT NULL DEFAULT '0.00',
  `egreso_honorarios` decimal(10,2) NOT NULL DEFAULT '0.00',
  `egreso_lab_ref` decimal(10,2) NOT NULL DEFAULT '0.00',
  `egreso_operativo` decimal(10,2) NOT NULL DEFAULT '0.00',
  `egreso_electronico` decimal(10,2) DEFAULT '0.00',
  `total_egresos` decimal(10,2) NOT NULL DEFAULT '0.00',
  `ganancia_dia` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cie10`
--

CREATE TABLE `cie10` (
  `id` int NOT NULL,
  `codigo` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subcategoria` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `activo` tinyint(1) DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cierre_caja_detalle`
--

CREATE TABLE `cierre_caja_detalle` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `usuario_cierre_id` int NOT NULL,
  `efectivo_sistema` decimal(10,2) DEFAULT '0.00',
  `efectivo_contado` decimal(10,2) DEFAULT '0.00',
  `diferencia_efectivo` decimal(10,2) DEFAULT '0.00',
  `tarjetas_sistema` decimal(10,2) DEFAULT '0.00',
  `tarjetas_contado` decimal(10,2) DEFAULT '0.00',
  `diferencia_tarjetas` decimal(10,2) DEFAULT '0.00',
  `transferencias_sistema` decimal(10,2) DEFAULT '0.00',
  `transferencias_contado` decimal(10,2) DEFAULT '0.00',
  `diferencia_transferencias` decimal(10,2) DEFAULT '0.00',
  `otros_sistema` decimal(10,2) DEFAULT '0.00',
  `otros_contado` decimal(10,2) DEFAULT '0.00',
  `diferencia_otros` decimal(10,2) DEFAULT '0.00',
  `diferencia_total` decimal(10,2) DEFAULT '0.00',
  `observaciones` text COLLATE utf8mb4_general_ci,
  `fecha_cierre` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cobros`
--

CREATE TABLE `cobros` (
  `id` int NOT NULL,
  `paciente_id` int DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `fecha_cobro` datetime DEFAULT CURRENT_TIMESTAMP,
  `total` decimal(10,2) NOT NULL,
  `tipo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') COLLATE utf8mb4_general_ci NOT NULL,
  `estado` enum('pendiente','pagado','anulado','devolucion') COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `observaciones` text COLLATE utf8mb4_general_ci,
  `turno` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Tabla de cobros - paciente_id puede ser NULL para pacientes no registrados';

-- --------------------------------------------------------

--
-- Table structure for table `cobros_detalle`
--

CREATE TABLE `cobros_detalle` (
  `id` int NOT NULL,
  `cobro_id` int NOT NULL,
  `servicio_tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `cantidad` int DEFAULT '1',
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `configuracion_clinica`
--

CREATE TABLE `configuracion_clinica` (
  `id` int NOT NULL,
  `nombre_clinica` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `direccion` text COLLATE utf8mb4_general_ci NOT NULL,
  `telefono` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `horario_atencion` text COLLATE utf8mb4_general_ci,
  `logo_url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `logo_laboratorio_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `logo_laboratorio_size_pdf` int DEFAULT NULL,
  `website` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ruc` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `especialidades` text COLLATE utf8mb4_general_ci,
  `mision` text COLLATE utf8mb4_general_ci,
  `vision` text COLLATE utf8mb4_general_ci,
  `valores` text COLLATE utf8mb4_general_ci,
  `director_general` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `jefe_enfermeria` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `contacto_emergencias` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tema_preset` varchar(30) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'purple',
  `tema_primary` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#7c3aed',
  `tema_primary_dark` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#5b21b6',
  `tema_primary_light` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#ede9fe',
  `tema_secondary` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#4338ca',
  `tema_accent` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#6366f1',
  `tema_navbar_bg` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#6b21a8',
  `tema_sidebar_from` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#9333ea',
  `tema_sidebar_via` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#7e22ce',
  `tema_sidebar_to` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#3730a3',
  `tema_login_from` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#1e3a8a',
  `tema_login_via` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#6b21a8',
  `tema_login_to` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#312e81',
  `tema_public_layout` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'classic',
  `celular` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `google_maps_embed` text COLLATE utf8mb4_general_ci,
  `slogan` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `slogan_color` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nombre_color` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nombre_font_size` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `logo_size_sistema` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `logo_size_publico` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `logo_shape_sistema` varchar(10) COLLATE utf8mb4_general_ci DEFAULT 'auto',
  `hc_template_mode` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'auto',
  `hc_template_single_id` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `caratula_fondo_url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `configuracion_honorarios_medicos`
--

CREATE TABLE `configuracion_honorarios_medicos` (
  `id` int NOT NULL,
  `medico_id` int NOT NULL,
  `tarifa_id` int DEFAULT NULL,
  `especialidad` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_servicio` enum('consulta','procedimiento','cirugia','interconsulta','otros') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'consulta',
  `porcentaje_clinica` decimal(5,2) NOT NULL,
  `porcentaje_medico` decimal(5,2) NOT NULL,
  `monto_fijo_clinica` decimal(10,2) DEFAULT NULL,
  `monto_fijo_medico` decimal(10,2) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `vigencia_desde` date DEFAULT NULL,
  `vigencia_hasta` date DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `config_apariencia`
--

CREATE TABLE `config_apariencia` (
  `id` int NOT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'avatar',
  `clave` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '0',
  `order_index` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `consultas`
--

CREATE TABLE `consultas` (
  `id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `medico_id` int NOT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `estado` enum('pendiente','falta_cancelar','completada','cancelada') COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `tipo_consulta` enum('programada','espontanea') COLLATE utf8mb4_general_ci DEFAULT 'programada',
  `clasificacion` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `triaje_realizado` tinyint(1) NOT NULL DEFAULT '0',
  `cobro_id` int DEFAULT NULL,
  `es_reprogramada` tinyint(1) NOT NULL DEFAULT '0',
  `reprogramada_en` datetime DEFAULT NULL,
  `hc_origen_id` int DEFAULT NULL COMMENT 'ID de la Historia Clínica origen si vino de próxima cita',
  `origen_creacion` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'agendada' COMMENT 'Origen del flujo: agendada|cotizador|hc_proxima',
  `es_control` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = cita de control sin costo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones`
--

CREATE TABLE `cotizaciones` (
  `id` int NOT NULL,
  `numero_comprobante` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `total_pagado` decimal(10,2) NOT NULL DEFAULT '0.00',
  `saldo_pendiente` decimal(10,2) NOT NULL DEFAULT '0.00',
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `estado` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `version_actual` int NOT NULL DEFAULT '1',
  `cotizacion_padre_id` int DEFAULT NULL,
  `es_adenda` tinyint(1) NOT NULL DEFAULT '0',
  `observaciones` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `anulado_por` int DEFAULT NULL,
  `anulado_en` datetime DEFAULT NULL,
  `motivo_anulacion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `cotizaciones`
--
DELIMITER $$
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
DELIMITER ;
DELIMITER $$
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

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones_detalle`
--

CREATE TABLE `cotizaciones_detalle` (
  `id` int NOT NULL,
  `cotizacion_id` int NOT NULL,
  `servicio_tipo` varchar(30) COLLATE utf8mb4_general_ci NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cantidad` int DEFAULT '1',
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `estado_item` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'activo',
  `version_item` int NOT NULL DEFAULT '1',
  `detalle_padre_id` int DEFAULT NULL,
  `editado_por` int DEFAULT NULL,
  `editado_en` datetime DEFAULT NULL,
  `motivo_edicion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `consulta_id` int DEFAULT NULL,
  `medico_id` int DEFAULT NULL,
  `derivado` tinyint(1) NOT NULL DEFAULT '0',
  `tipo_derivacion` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `valor_derivacion` decimal(10,2) DEFAULT NULL,
  `laboratorio_referencia` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones_farmacia`
--

CREATE TABLE `cotizaciones_farmacia` (
  `id` int NOT NULL,
  `paciente_id` int DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `estado` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `observaciones` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_dni` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_nombre` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones_farmacia_detalle`
--

CREATE TABLE `cotizaciones_farmacia_detalle` (
  `id` int NOT NULL,
  `cotizacion_id` int NOT NULL,
  `medicamento_id` int NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cantidad` int DEFAULT '1',
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizacion_eventos`
--

CREATE TABLE `cotizacion_eventos` (
  `id` int NOT NULL,
  `cotizacion_id` int NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `evento_tipo` enum('creada','editada','item_agregado','item_modificado','item_eliminado','anulada','reactivada','cobro_registrado','devolucion_parcial','saldo_actualizado','adenda_creada') COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuario_id` int NOT NULL,
  `motivo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `ip_origen` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `cotizacion_farmacia_vinculos`
--

CREATE TABLE `cotizacion_farmacia_vinculos` (
  `id` int NOT NULL,
  `cotizacion_id` int NOT NULL,
  `cotizacion_farmacia_id` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizacion_item_ajustes`
--

CREATE TABLE `cotizacion_item_ajustes` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `cotizacion_movimientos`
--

CREATE TABLE `cotizacion_movimientos` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `descuentos_aplicados`
--

CREATE TABLE `descuentos_aplicados` (
  `id` int NOT NULL,
  `cobro_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `usuario_nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `paciente_id` int NOT NULL,
  `paciente_nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `servicio` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `monto_original` decimal(10,2) NOT NULL,
  `tipo_descuento` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor_descuento` decimal(10,2) NOT NULL,
  `monto_descuento` decimal(10,2) NOT NULL,
  `monto_final` decimal(10,2) NOT NULL,
  `motivo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `disponibilidad_medicos`
--

CREATE TABLE `disponibilidad_medicos` (
  `id` int NOT NULL,
  `medico_id` int NOT NULL,
  `fecha` date DEFAULT NULL,
  `dia_semana` enum('lunes','martes','miércoles','jueves','viernes','sábado','domingo') COLLATE utf8mb4_general_ci NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `documentos_externos_archivos`
--

CREATE TABLE `documentos_externos_archivos` (
  `id` int NOT NULL,
  `documento_id` int NOT NULL,
  `nombre_original` varchar(255) NOT NULL DEFAULT '',
  `archivo_path` varchar(500) NOT NULL DEFAULT '',
  `tamano` int DEFAULT '0',
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `mime_type` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `documentos_externos_paciente`
--

CREATE TABLE `documentos_externos_paciente` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `egresos`
--

CREATE TABLE `egresos` (
  `id` int NOT NULL,
  `fecha` date NOT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `concepto` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `responsable` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `honorario_movimiento_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `caja_id` int DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','tarjeta','yape','plin','cheque','deposito') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'efectivo',
  `tipo_egreso` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `turno` enum('mañana','tarde','noche') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mañana',
  `hora` time DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `liquidacion_id` int DEFAULT NULL,
  `medico_id` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `examenes_laboratorio`
--

CREATE TABLE `examenes_laboratorio` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `categoria` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `metodologia` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `valores_referenciales` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `precio_publico` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `tipo_tubo` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tipo_frasco` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tiempo_resultado` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `condicion_paciente` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `preanalitica` text COLLATE utf8mb4_general_ci,
  `activo` tinyint(1) DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `hc_templates`
--

CREATE TABLE `hc_templates` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `historia_clinica`
--

CREATE TABLE `historia_clinica` (
  `id` int NOT NULL,
  `consulta_id` int NOT NULL,
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha_registro` datetime DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `historia_clinica_backups`
--

CREATE TABLE `historia_clinica_backups` (
  `id` bigint NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `honorarios_medicos_movimientos`
--

CREATE TABLE `honorarios_medicos_movimientos` (
  `id` int NOT NULL,
  `consulta_id` int DEFAULT NULL,
  `cobro_id` int DEFAULT NULL,
  `medico_id` int NOT NULL,
  `paciente_id` int DEFAULT NULL,
  `caja_id` int DEFAULT NULL,
  `tarifa_id` int DEFAULT NULL,
  `tipo_precio` enum('particular','seguro','convenio') COLLATE utf8mb4_unicode_ci DEFAULT 'particular',
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `tipo_servicio` enum('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias','operacion','hospitalizacion') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tarifa_total` decimal(10,2) NOT NULL,
  `monto_clinica` decimal(10,2) NOT NULL,
  `monto_medico` decimal(10,2) NOT NULL,
  `porcentaje_aplicado_clinica` decimal(5,2) NOT NULL,
  `porcentaje_aplicado_medico` decimal(5,2) NOT NULL,
  `estado_pago_medico` enum('pendiente','pagado','cancelado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `fecha_pago_medico` date DEFAULT NULL,
  `metodo_pago_medico` enum('efectivo','transferencia','cheque','deposito','tarjeta','yape','plin') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `liquidacion_id` int DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `turno` enum('mañana','tarde','noche') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mañana'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ingresos`
--

CREATE TABLE `ingresos` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `area` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros') COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','otros') COLLATE utf8mb4_unicode_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `fecha_hora` datetime NOT NULL,
  `usuario_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ingresos_diarios`
--

CREATE TABLE `ingresos_diarios` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `tipo_ingreso` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros','operaciones') COLLATE utf8mb4_general_ci NOT NULL,
  `area` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_general_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `referencia_id` int DEFAULT NULL,
  `referencia_tabla` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_id` int DEFAULT NULL,
  `paciente_nombre` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fecha_hora` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int NOT NULL,
  `honorario_movimiento_id` int DEFAULT NULL,
  `turno` enum('mañana','tarde','noche') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana',
  `cobrado_por` int DEFAULT NULL,
  `liquidado_por` int DEFAULT NULL,
  `fecha_liquidacion` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `inventario_consumos_examen`
--

CREATE TABLE `inventario_consumos_examen` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `inventario_examen_recetas`
--

CREATE TABLE `inventario_examen_recetas` (
  `id` int NOT NULL,
  `id_examen` int NOT NULL,
  `item_id` int NOT NULL,
  `cantidad_por_prueba` decimal(12,4) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `observacion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `inventario_items`
--

CREATE TABLE `inventario_items` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `inventario_lotes`
--

CREATE TABLE `inventario_lotes` (
  `id` int NOT NULL,
  `item_id` int NOT NULL,
  `lote_codigo` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `cantidad_inicial` decimal(12,2) NOT NULL DEFAULT '0.00',
  `cantidad_actual` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `inventario_movimientos`
--

CREATE TABLE `inventario_movimientos` (
  `id` int NOT NULL,
  `item_id` int NOT NULL,
  `lote_id` int DEFAULT NULL,
  `tipo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cantidad` decimal(12,2) NOT NULL,
  `observacion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `origen` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inventario',
  `usuario_id` int DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `inventario_transferencias`
--

CREATE TABLE `inventario_transferencias` (
  `id` int NOT NULL,
  `origen` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'almacen_principal',
  `destino` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'laboratorio',
  `usuario_id` int DEFAULT NULL,
  `observacion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `inventario_transferencias_detalle`
--

CREATE TABLE `inventario_transferencias_detalle` (
  `id` int NOT NULL,
  `transferencia_id` int NOT NULL,
  `item_id` int NOT NULL,
  `cantidad` decimal(12,4) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `laboratorio_referencia_movimientos`
--

CREATE TABLE `laboratorio_referencia_movimientos` (
  `id` int NOT NULL,
  `cobro_id` int NOT NULL,
  `cotizacion_id` int DEFAULT NULL,
  `examen_id` int NOT NULL,
  `laboratorio` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `tipo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `paciente_id` int DEFAULT NULL,
  `cobrado_por` int DEFAULT NULL,
  `liquidado_por` int DEFAULT NULL,
  `caja_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `turno_cobro` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hora_cobro` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `turno_liquidacion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hora_liquidacion` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `liquidaciones_medicos`
--

CREATE TABLE `liquidaciones_medicos` (
  `id` int NOT NULL,
  `medico_id` int NOT NULL,
  `periodo_desde` date NOT NULL,
  `periodo_hasta` date NOT NULL,
  `total_bruto` decimal(10,2) NOT NULL,
  `descuentos` decimal(10,2) DEFAULT '0.00',
  `total_neto` decimal(10,2) NOT NULL,
  `estado` enum('borrador','aprobada','pagada','cancelada') COLLATE utf8mb4_unicode_ci DEFAULT 'borrador',
  `fecha_aprobacion` date DEFAULT NULL,
  `fecha_pago` date DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','cheque','deposito') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `usuario_aprobacion` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuario_pago` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `log_eliminaciones`
--

CREATE TABLE `log_eliminaciones` (
  `id` int NOT NULL,
  `cobro_id` int NOT NULL,
  `cobros_detalle_id` int DEFAULT NULL,
  `servicio_tipo` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `item_json` text COLLATE utf8mb4_general_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `usuario_id` int NOT NULL,
  `paciente_id` int DEFAULT NULL,
  `caja_id` int DEFAULT NULL,
  `motivo` text COLLATE utf8mb4_general_ci,
  `fecha_hora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `log_reaperturas`
--

CREATE TABLE `log_reaperturas` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `fecha_reapertura` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int NOT NULL,
  `usuario_nombre` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `motivo` text COLLATE utf8mb4_general_ci,
  `datos_cierre_anterior` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
) ;

-- --------------------------------------------------------

--
-- Table structure for table `medicamentos`
--

CREATE TABLE `medicamentos` (
  `id` int NOT NULL,
  `codigo` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `presentacion` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `concentracion` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `laboratorio` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `stock` int DEFAULT '0',
  `unidades_por_caja` int NOT NULL DEFAULT '1',
  `fecha_vencimiento` date DEFAULT NULL,
  `estado` enum('activo','inactivo','cuarentena') COLLATE utf8mb4_general_ci DEFAULT 'activo',
  `fecha_cuarentena` date DEFAULT NULL,
  `motivo_cuarentena` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `precio_compra` decimal(10,2) NOT NULL DEFAULT '0.00',
  `margen_ganancia` decimal(5,2) NOT NULL DEFAULT '30.00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `medicos`
--

CREATE TABLE `medicos` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `especialidad` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `rol` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'medico',
  `firma` longtext COLLATE utf8mb4_general_ci COMMENT 'Firma digital del médico en base64',
  `apellido` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cmp` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rne` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tipo_profesional` varchar(30) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'medico',
  `abreviatura_profesional` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Dr(a).',
  `colegio_sigla` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nro_colegiatura` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `medico_adelantos`
--

CREATE TABLE `medico_adelantos` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `medico_condiciones_pago`
--

CREATE TABLE `medico_condiciones_pago` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `metodos_pago`
--

CREATE TABLE `metodos_pago` (
  `id` int NOT NULL,
  `nombre` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `codigo` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_general_ci,
  `requiere_referencia` tinyint(1) DEFAULT '0',
  `activo` tinyint(1) DEFAULT '1',
  `orden_visualizacion` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `movimientos_medicamento`
--

CREATE TABLE `movimientos_medicamento` (
  `id` int NOT NULL,
  `medicamento_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `medico_id` int DEFAULT NULL,
  `cantidad` int NOT NULL,
  `tipo_movimiento` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `fecha_hora` datetime DEFAULT CURRENT_TIMESTAMP,
  `observaciones` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ordenes_imagen`
--

CREATE TABLE `ordenes_imagen` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `ordenes_imagen_archivos`
--

CREATE TABLE `ordenes_imagen_archivos` (
  `id` int NOT NULL,
  `orden_id` int NOT NULL,
  `nombre_original` varchar(255) NOT NULL DEFAULT '',
  `archivo_path` varchar(500) NOT NULL DEFAULT '',
  `tamano` int DEFAULT '0',
  `mime_type` varchar(100) DEFAULT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ordenes_laboratorio`
--

CREATE TABLE `ordenes_laboratorio` (
  `id` int NOT NULL,
  `cobro_id` int DEFAULT NULL,
  `consulta_id` int DEFAULT NULL,
  `paciente_id` int DEFAULT NULL,
  `examenes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `estado` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `cotizacion_id` int DEFAULT NULL,
  `carga_anticipada` tinyint(1) NOT NULL DEFAULT '0'
) ;

-- --------------------------------------------------------

--
-- Table structure for table `pacientes`
--

CREATE TABLE `pacientes` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `apellido` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `historia_clinica` varchar(30) COLLATE utf8mb4_general_ci NOT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `edad` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `edad_unidad` enum('días','meses','años') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `procedencia` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tipo_seguro` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sexo` enum('M','F') COLLATE utf8mb4_general_ci NOT NULL,
  `direccion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `telefono` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dni` varchar(15) COLLATE utf8mb4_general_ci NOT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_banners`
--

CREATE TABLE `public_banners` (
  `id` int NOT NULL,
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subtitulo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `imagen_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `imagen_fija_url` text COLLATE utf8mb4_unicode_ci,
  `imagen_conocenos_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overlay_blanco` tinyint(1) NOT NULL DEFAULT '1',
  `texto_lado` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'left',
  `titulo_color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subtitulo_color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `titulo_tamano` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'lg',
  `subtitulo_tamano` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'md',
  `orden` int NOT NULL DEFAULT '0',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_ofertas`
--

CREATE TABLE `public_ofertas` (
  `id` int NOT NULL,
  `titulo` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `precio_antes` decimal(10,2) DEFAULT NULL,
  `precio_oferta` decimal(10,2) DEFAULT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `imagen_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `orden` int NOT NULL DEFAULT '0',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_servicios`
--

CREATE TABLE `public_servicios` (
  `id` int NOT NULL,
  `titulo` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `icono` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `imagen_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` enum('clasico','premium') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'clasico',
  `imagen_shape` enum('square','rounded','circle') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'rounded',
  `imagen_tipo` enum('normal','overlay') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `precio` decimal(10,2) DEFAULT NULL,
  `orden` int NOT NULL DEFAULT '0',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `recordatorios_consultas`
--

CREATE TABLE `recordatorios_consultas` (
  `id` int NOT NULL,
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

-- --------------------------------------------------------

--
-- Table structure for table `resultados_laboratorio`
--

CREATE TABLE `resultados_laboratorio` (
  `id` int NOT NULL,
  `consulta_id` int DEFAULT NULL,
  `orden_id` int DEFAULT NULL,
  `tipo_examen` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `resultados` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `firmado_por_usuario_id` int DEFAULT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `seguros`
--

CREATE TABLE `seguros` (
  `id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `numero` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tarifas`
--

CREATE TABLE `tarifas` (
  `id` int NOT NULL,
  `servicio_tipo` enum('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias','operacion','hospitalizacion') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `precio_particular` decimal(10,2) NOT NULL,
  `precio_seguro` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `medico_id` int DEFAULT NULL,
  `porcentaje_medico` decimal(5,2) DEFAULT NULL,
  `porcentaje_clinica` decimal(5,2) DEFAULT NULL,
  `monto_medico` decimal(10,2) DEFAULT NULL,
  `monto_clinica` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `triaje`
--

CREATE TABLE `triaje` (
  `id` int NOT NULL,
  `consulta_id` int NOT NULL,
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int NOT NULL,
  `usuario` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `dni` varchar(15) COLLATE utf8mb4_general_ci NOT NULL,
  `profesion` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `firma_reportes` longtext COLLATE utf8mb4_general_ci,
  `colegiatura_tipo` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `colegiatura_numero` varchar(60) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cargo_firma` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `permisos` text COLLATE utf8mb4_general_ci,
  `rol` enum('administrador','recepcionista','laboratorista','enfermero','quimico') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'recepcionista',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `vw_cotizaciones_resumen_diario`
-- (See below for the actual view)
--
CREATE TABLE `vw_cotizaciones_resumen_diario` (
`estado` varchar(20)
,`fecha` datetime
,`fecha_dia` date
,`historia_clinica` varchar(30)
,`id` int
,`numero_comprobante` varchar(30)
,`paciente_dni` varchar(15)
,`paciente_id` int
,`paciente_nombre` varchar(201)
,`saldo_pendiente` decimal(10,2)
,`total` decimal(10,2)
,`total_items` bigint
,`total_pagado` decimal(10,2)
,`total_servicios` bigint
,`usuario_cotizo` varchar(100)
,`usuario_id` int
,`version_actual` int
);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `atenciones`
--
ALTER TABLE `atenciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_atenciones_fecha_paciente` (`fecha`,`paciente_id`);

--
-- Indexes for table `cajas`
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
-- Indexes for table `cie10`
--
ALTER TABLE `cie10`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `idx_codigo` (`codigo`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_categoria` (`categoria`);
ALTER TABLE `cie10` ADD FULLTEXT KEY `nombre` (`nombre`,`descripcion`);

--
-- Indexes for table `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_cierre_id` (`usuario_cierre_id`);

--
-- Indexes for table `cobros`
--
ALTER TABLE `cobros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_cobros_paciente` (`paciente_id`),
  ADD KEY `idx_cobros_fecha` (`fecha_cobro`),
  ADD KEY `idx_cobros_estado` (`estado`),
  ADD KEY `idx_cobros_estado_fecha` (`estado`,`fecha_cobro`);

--
-- Indexes for table `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cobro_id` (`cobro_id`),
  ADD KEY `idx_cobros_detalle_cobro_id` (`cobro_id`);

--
-- Indexes for table `configuracion_clinica`
--
ALTER TABLE `configuracion_clinica`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_configuracion_email` (`email`),
  ADD KEY `idx_configuracion_created` (`created_at`);

--
-- Indexes for table `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_medico_servicio` (`medico_id`,`tipo_servicio`),
  ADD KEY `idx_vigencia` (`vigencia_desde`,`vigencia_hasta`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indexes for table `config_apariencia`
--
ALTER TABLE `config_apariencia`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `clave` (`clave`),
  ADD UNIQUE KEY `uq_config_apariencia_clave` (`clave`),
  ADD KEY `idx_config_tipo_clave` (`tipo`,`clave`),
  ADD KEY `idx_config_activo` (`activo`),
  ADD KEY `idx_config_apariencia_tipo` (`tipo`);

--
-- Indexes for table `consultas`
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
-- Indexes for table `cotizaciones`
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
-- Indexes for table `cotizaciones_detalle`
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
-- Indexes for table `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cotizacion_id` (`cotizacion_id`),
  ADD KEY `medicamento_id` (`medicamento_id`);

--
-- Indexes for table `cotizacion_eventos`
--
ALTER TABLE `cotizacion_eventos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cotizacion_eventos_cotizacion` (`cotizacion_id`,`created_at`),
  ADD KEY `idx_cotizacion_eventos_tipo` (`evento_tipo`),
  ADD KEY `idx_cotizacion_eventos_usuario` (`usuario_id`);

--
-- Indexes for table `cotizacion_farmacia_vinculos`
--
ALTER TABLE `cotizacion_farmacia_vinculos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_cot_farm_vinculo` (`cotizacion_id`,`cotizacion_farmacia_id`),
  ADD KEY `idx_cot_farm_cotizacion` (`cotizacion_id`),
  ADD KEY `idx_cot_farm_farmacia` (`cotizacion_farmacia_id`);

--
-- Indexes for table `cotizacion_item_ajustes`
--
ALTER TABLE `cotizacion_item_ajustes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cot_item_ajustes_cotizacion` (`cotizacion_id`,`created_at`),
  ADD KEY `idx_cot_item_ajustes_servicio` (`servicio_tipo`,`servicio_id`);

--
-- Indexes for table `cotizacion_movimientos`
--
ALTER TABLE `cotizacion_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cot_mov_cotizacion` (`cotizacion_id`,`created_at`),
  ADD KEY `idx_cot_mov_cobro` (`cobro_id`),
  ADD KEY `idx_cot_mov_tipo` (`tipo_movimiento`);

--
-- Indexes for table `descuentos_aplicados`
--
ALTER TABLE `descuentos_aplicados`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cobro_id` (`cobro_id`),
  ADD KEY `idx_usuario_id` (`usuario_id`),
  ADD KEY `idx_paciente_id` (`paciente_id`);

--
-- Indexes for table `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medico_id` (`medico_id`);

--
-- Indexes for table `documentos_externos_archivos`
--
ALTER TABLE `documentos_externos_archivos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_dea_documento` (`documento_id`);

--
-- Indexes for table `documentos_externos_paciente`
--
ALTER TABLE `documentos_externos_paciente`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_dep_paciente` (`paciente_id`),
  ADD KEY `idx_dep_orden_paciente` (`orden_id`,`paciente_id`),
  ADD KEY `idx_dep_paciente_fecha` (`paciente_id`,`fecha`);

--
-- Indexes for table `egresos`
--
ALTER TABLE `egresos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_egresos_fecha` (`fecha`),
  ADD KEY `idx_egresos_tipo` (`tipo`),
  ADD KEY `idx_egresos_categoria` (`categoria`),
  ADD KEY `idx_egresos_estado` (`estado`),
  ADD KEY `idx_egresos_honorario` (`honorario_movimiento_id`);

--
-- Indexes for table `examenes_laboratorio`
--
ALTER TABLE `examenes_laboratorio`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `hc_templates`
--
ALTER TABLE `hc_templates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_hc_templates_unique` (`template_id`,`version`,`clinic_key`),
  ADD KEY `idx_hc_templates_lookup` (`template_id`,`activo`,`clinic_key`);

--
-- Indexes for table `historia_clinica`
--
ALTER TABLE `historia_clinica`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indexes for table `historia_clinica_backups`
--
ALTER TABLE `historia_clinica_backups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_hc_backup_batch` (`batch_id`),
  ADD KEY `idx_hc_backup_historia` (`historia_id`),
  ADD KEY `idx_hc_backup_consulta` (`consulta_id`);

--
-- Indexes for table `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_movimientos_medico_fecha` (`medico_id`,`fecha`),
  ADD KEY `idx_movimientos_estado_pago` (`estado_pago_medico`),
  ADD KEY `idx_movimientos_liquidacion` (`liquidacion_id`),
  ADD KEY `idx_movimientos_consulta` (`consulta_id`);

--
-- Indexes for table `ingresos`
--
ALTER TABLE `ingresos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `ingresos_diarios`
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
-- Indexes for table `inventario_consumos_examen`
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
-- Indexes for table `inventario_examen_recetas`
--
ALTER TABLE `inventario_examen_recetas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_inventario_receta_examen_item` (`id_examen`,`item_id`),
  ADD KEY `idx_inventario_receta_examen` (`id_examen`),
  ADD KEY `idx_inventario_receta_item` (`item_id`),
  ADD KEY `idx_inventario_receta_activo` (`activo`);

--
-- Indexes for table `inventario_items`
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
-- Indexes for table `inventario_lotes`
--
ALTER TABLE `inventario_lotes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_inventario_lotes_item` (`item_id`),
  ADD KEY `idx_inventario_lotes_venc` (`fecha_vencimiento`),
  ADD KEY `idx_inventario_lotes_stock` (`cantidad_actual`),
  ADD KEY `idx_inventario_lotes_item_stock_venc` (`item_id`,`cantidad_actual`,`fecha_vencimiento`,`id`),
  ADD KEY `idx_inventario_lotes_venc_stock_item` (`fecha_vencimiento`,`cantidad_actual`,`item_id`);

--
-- Indexes for table `inventario_movimientos`
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
-- Indexes for table `inventario_transferencias`
--
ALTER TABLE `inventario_transferencias`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_inventario_transferencias_fecha` (`fecha_hora`),
  ADD KEY `idx_inventario_transferencias_destino` (`destino`),
  ADD KEY `idx_transfer_destino_id` (`destino`,`id`),
  ADD KEY `idx_transfer_fecha_id` (`fecha_hora`,`id`);

--
-- Indexes for table `inventario_transferencias_detalle`
--
ALTER TABLE `inventario_transferencias_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_inventario_transfer_det_transf` (`transferencia_id`),
  ADD KEY `idx_inventario_transfer_det_item` (`item_id`),
  ADD KEY `idx_transfer_det_item_transfer` (`item_id`,`transferencia_id`);

--
-- Indexes for table `laboratorio_referencia_movimientos`
--
ALTER TABLE `laboratorio_referencia_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_lrm_cotizacion_id` (`cotizacion_id`);

--
-- Indexes for table `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_liquidaciones_medico_periodo` (`medico_id`,`periodo_desde`,`periodo_hasta`),
  ADD KEY `idx_liquidaciones_estado` (`estado`),
  ADD KEY `idx_liquidaciones_fechas` (`fecha_aprobacion`,`fecha_pago`);

--
-- Indexes for table `log_eliminaciones`
--
ALTER TABLE `log_eliminaciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cobro_id` (`cobro_id`),
  ADD KEY `idx_usuario_id` (`usuario_id`),
  ADD KEY `idx_servicio_tipo` (`servicio_tipo`),
  ADD KEY `idx_fecha_hora` (`fecha_hora`);

--
-- Indexes for table `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `medicamentos`
--
ALTER TABLE `medicamentos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`);

--
-- Indexes for table `medicos`
--
ALTER TABLE `medicos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_firma` (`firma`(100)),
  ADD KEY `idx_cmp` (`cmp`),
  ADD KEY `idx_rne` (`rne`);

--
-- Indexes for table `medico_adelantos`
--
ALTER TABLE `medico_adelantos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_medico_fecha` (`medico_id`,`fecha`),
  ADD KEY `idx_estado` (`estado`);

--
-- Indexes for table `medico_condiciones_pago`
--
ALTER TABLE `medico_condiciones_pago`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_medico_activo` (`medico_id`,`activo`),
  ADD KEY `idx_medico` (`medico_id`);

--
-- Indexes for table `metodos_pago`
--
ALTER TABLE `metodos_pago`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nombre` (`nombre`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `idx_codigo` (`codigo`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indexes for table `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medicamento_id` (`medicamento_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `ordenes_imagen`
--
ALTER TABLE `ordenes_imagen`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_oi_consulta` (`consulta_id`),
  ADD KEY `idx_oi_paciente` (`paciente_id`);

--
-- Indexes for table `ordenes_imagen_archivos`
--
ALTER TABLE `ordenes_imagen_archivos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_oia_orden` (`orden_id`);

--
-- Indexes for table `ordenes_laboratorio`
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
-- Indexes for table `pacientes`
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
-- Indexes for table `public_banners`
--
ALTER TABLE `public_banners`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_public_banners_activo_orden` (`activo`,`orden`);

--
-- Indexes for table `public_ofertas`
--
ALTER TABLE `public_ofertas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_public_ofertas_activo_orden` (`activo`,`orden`),
  ADD KEY `idx_public_ofertas_fechas` (`fecha_inicio`,`fecha_fin`);

--
-- Indexes for table `public_servicios`
--
ALTER TABLE `public_servicios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_public_servicios_activo_orden` (`activo`,`orden`);

--
-- Indexes for table `recordatorios_consultas`
--
ALTER TABLE `recordatorios_consultas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_recordatorios_consulta` (`consulta_id`),
  ADD KEY `idx_recordatorios_estado` (`estado`),
  ADD KEY `idx_recordatorios_proximo_contacto` (`fecha_proximo_contacto`);

--
-- Indexes for table `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`),
  ADD KEY `idx_resultados_firmado_por_usuario` (`firmado_por_usuario_id`),
  ADD KEY `idx_rl_orden_fecha_id` (`orden_id`,`fecha`,`id`),
  ADD KEY `idx_rl_consulta_orden_fecha_id` (`consulta_id`,`orden_id`,`fecha`,`id`),
  ADD KEY `idx_rl_orden_fecha_id_v2` (`orden_id`,`fecha`,`id`);

--
-- Indexes for table `seguros`
--
ALTER TABLE `seguros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`);

--
-- Indexes for table `tarifas`
--
ALTER TABLE `tarifas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tarifas_servicio` (`servicio_tipo`,`activo`),
  ADD KEY `fk_tarifas_medico` (`medico_id`);

--
-- Indexes for table `triaje`
--
ALTER TABLE `triaje`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indexes for table `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `usuario` (`usuario`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `atenciones`
--
ALTER TABLE `atenciones`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cajas`
--
ALTER TABLE `cajas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cie10`
--
ALTER TABLE `cie10`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cobros`
--
ALTER TABLE `cobros`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `configuracion_clinica`
--
ALTER TABLE `configuracion_clinica`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `config_apariencia`
--
ALTER TABLE `config_apariencia`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `consultas`
--
ALTER TABLE `consultas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizaciones`
--
ALTER TABLE `cotizaciones`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizaciones_detalle`
--
ALTER TABLE `cotizaciones_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizacion_eventos`
--
ALTER TABLE `cotizacion_eventos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizacion_farmacia_vinculos`
--
ALTER TABLE `cotizacion_farmacia_vinculos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizacion_item_ajustes`
--
ALTER TABLE `cotizacion_item_ajustes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizacion_movimientos`
--
ALTER TABLE `cotizacion_movimientos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `descuentos_aplicados`
--
ALTER TABLE `descuentos_aplicados`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `documentos_externos_archivos`
--
ALTER TABLE `documentos_externos_archivos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `documentos_externos_paciente`
--
ALTER TABLE `documentos_externos_paciente`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `egresos`
--
ALTER TABLE `egresos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `examenes_laboratorio`
--
ALTER TABLE `examenes_laboratorio`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `hc_templates`
--
ALTER TABLE `hc_templates`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `historia_clinica`
--
ALTER TABLE `historia_clinica`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `historia_clinica_backups`
--
ALTER TABLE `historia_clinica_backups`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ingresos`
--
ALTER TABLE `ingresos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ingresos_diarios`
--
ALTER TABLE `ingresos_diarios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventario_consumos_examen`
--
ALTER TABLE `inventario_consumos_examen`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventario_examen_recetas`
--
ALTER TABLE `inventario_examen_recetas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventario_items`
--
ALTER TABLE `inventario_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventario_lotes`
--
ALTER TABLE `inventario_lotes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventario_movimientos`
--
ALTER TABLE `inventario_movimientos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventario_transferencias`
--
ALTER TABLE `inventario_transferencias`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventario_transferencias_detalle`
--
ALTER TABLE `inventario_transferencias_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `laboratorio_referencia_movimientos`
--
ALTER TABLE `laboratorio_referencia_movimientos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `log_eliminaciones`
--
ALTER TABLE `log_eliminaciones`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `medicamentos`
--
ALTER TABLE `medicamentos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `medicos`
--
ALTER TABLE `medicos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `medico_adelantos`
--
ALTER TABLE `medico_adelantos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `medico_condiciones_pago`
--
ALTER TABLE `medico_condiciones_pago`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `metodos_pago`
--
ALTER TABLE `metodos_pago`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ordenes_imagen`
--
ALTER TABLE `ordenes_imagen`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ordenes_imagen_archivos`
--
ALTER TABLE `ordenes_imagen_archivos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ordenes_laboratorio`
--
ALTER TABLE `ordenes_laboratorio`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `pacientes`
--
ALTER TABLE `pacientes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_banners`
--
ALTER TABLE `public_banners`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_ofertas`
--
ALTER TABLE `public_ofertas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_servicios`
--
ALTER TABLE `public_servicios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `recordatorios_consultas`
--
ALTER TABLE `recordatorios_consultas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `seguros`
--
ALTER TABLE `seguros`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tarifas`
--
ALTER TABLE `tarifas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `triaje`
--
ALTER TABLE `triaje`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

-- --------------------------------------------------------

--
-- Structure for view `vw_cotizaciones_resumen_diario`
--
DROP TABLE IF EXISTS `vw_cotizaciones_resumen_diario`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_cotizaciones_resumen_diario`  AS SELECT `c`.`id` AS `id`, `c`.`numero_comprobante` AS `numero_comprobante`, `c`.`fecha` AS `fecha`, cast(`c`.`fecha` as date) AS `fecha_dia`, `c`.`estado` AS `estado`, `c`.`total` AS `total`, `c`.`total_pagado` AS `total_pagado`, `c`.`saldo_pendiente` AS `saldo_pendiente`, `c`.`version_actual` AS `version_actual`, `c`.`paciente_id` AS `paciente_id`, concat(coalesce(`p`.`nombre`,''),' ',coalesce(`p`.`apellido`,'')) AS `paciente_nombre`, `p`.`dni` AS `paciente_dni`, `p`.`historia_clinica` AS `historia_clinica`, `c`.`usuario_id` AS `usuario_id`, `u`.`nombre` AS `usuario_cotizo`, count(`cd`.`id`) AS `total_items`, count(distinct `cd`.`servicio_tipo`) AS `total_servicios` FROM (((`cotizaciones` `c` left join `pacientes` `p` on((`p`.`id` = `c`.`paciente_id`))) left join `usuarios` `u` on((`u`.`id` = `c`.`usuario_id`))) left join `cotizaciones_detalle` `cd` on((`cd`.`cotizacion_id` = `c`.`id`))) GROUP BY `c`.`id`, `c`.`numero_comprobante`, `c`.`fecha`, cast(`c`.`fecha` as date), `c`.`estado`, `c`.`total`, `c`.`total_pagado`, `c`.`saldo_pendiente`, `c`.`version_actual`, `c`.`paciente_id`, concat(coalesce(`p`.`nombre`,''),' ',coalesce(`p`.`apellido`,'')), `p`.`dni`, `p`.`historia_clinica`, `c`.`usuario_id`, `u`.`nombre` ;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `ingresos`
--
ALTER TABLE `ingresos`
  ADD CONSTRAINT `ingresos_ibfk_1` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`),
  ADD CONSTRAINT `ingresos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `inventario_consumos_examen`
--
ALTER TABLE `inventario_consumos_examen`
  ADD CONSTRAINT `fk_inventario_consumo_examen_lab` FOREIGN KEY (`id_examen`) REFERENCES `examenes_laboratorio` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_consumo_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_consumo_orden_lab` FOREIGN KEY (`orden_id`) REFERENCES `ordenes_laboratorio` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_inventario_consumo_paciente` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `inventario_examen_recetas`
--
ALTER TABLE `inventario_examen_recetas`
  ADD CONSTRAINT `fk_inventario_receta_examen_lab` FOREIGN KEY (`id_examen`) REFERENCES `examenes_laboratorio` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_receta_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `inventario_lotes`
--
ALTER TABLE `inventario_lotes`
  ADD CONSTRAINT `fk_inventario_lotes_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `inventario_movimientos`
--
ALTER TABLE `inventario_movimientos`
  ADD CONSTRAINT `fk_inventario_mov_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_mov_lote` FOREIGN KEY (`lote_id`) REFERENCES `inventario_lotes` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `inventario_transferencias_detalle`
--
ALTER TABLE `inventario_transferencias_detalle`
  ADD CONSTRAINT `fk_inventario_transfer_det_item` FOREIGN KEY (`item_id`) REFERENCES `inventario_items` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_inventario_transfer_det_transferencia` FOREIGN KEY (`transferencia_id`) REFERENCES `inventario_transferencias` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
